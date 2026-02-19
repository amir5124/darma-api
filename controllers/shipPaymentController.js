const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db'); 
const { sendBookingEmail } = require('../utils/mailer'); // Gunakan mailer yang sama

const config = {
    clientId: "testing",
    clientSecret: "123",
    username: "LI307GXIN",
    pin: "2K2NPCBBNNTovgB",
    serverKey: "LinkQu@2020",
    baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
};

function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
    return crypto.createHmac("sha256", config.serverKey)
                 .update(path + method + cleaned)
                 .digest("hex");
}

const ShipPaymentController = {
    
  createShipPayment: async (req, res) => {
    let connection;
    try {
        const { 
            booking_id, // numCode dari frontend
            amount, 
            customer_name, 
            customer_phone, 
            customer_email, 
            method, 
            bank_code, 
            admin_fee_applied 
        } = req.body;
        
        const feeAdmin = Number(admin_fee_applied || 0);

        // 1. Format Phone ke Standar Internasional
        let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
        formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);

        const bankMap = { "002": "BRI", "008": "MANDIRI", "009": "BNI", "014": "BCA", "451": "BSI", "013": "PERMATA" };
        const bankName = bankMap[bank_code] || bank_code;
        const partner_reff = `SHIP-PAY-${Date.now()}`;
        const expired = moment.tz('Asia/Jakarta').add(60, 'minutes').format('YYYYMMDDHHmmss');
        const url_callback = "https://darma.siappgo.id/api/ship/callback";

        connection = await db.getConnection();
        
        // 2. Cari Data Booking + Penumpang menggunakan LEFT JOIN
        // Kita mengambil semua data dari bookings_pelni dan detail kursinya dari booking_passengers_pelni
        const [rows] = await connection.query(
            `SELECT b.*, p.pax_name, p.pax_type, p.deck, p.cabin, p.bed, p.id_number 
             FROM bookings_pelni b
             LEFT JOIN booking_passengers_pelni p ON b.id = p.booking_id
             WHERE b.num_code = ? 
             ORDER BY b.id DESC`, 
            [booking_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Data booking kapal tidak ditemukan." });
        }

        const b = rows[0]; // Data utama booking

        // 3. Persiapan Payload LinkQu
        const commonData = { 
            amount, expired, partner_reff, 
            customer_id: formattedPhone, customer_name, customer_email 
        };
        
        let endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
        let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

        if (method === 'VA') {
            payloadLinkQu.bank_code = bank_code;
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', {
                amount, expired, bank_code, partner_reff, customer_id: formattedPhone, customer_name, customer_email
            });
        } else {
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
        }

        // 4. Hit ke API LinkQu
        const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
            headers: { 
                'client-id': config.clientId, 
                'client-secret': config.clientSecret,
                'Content-Type': 'application/json'
            }
        });

        const linkquData = resp.data;
        const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data?.va_number);
        const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data?.qr_url);

        // 5. UPDATE DATABASE
        await connection.query(
            `UPDATE bookings_pelni SET 
                payment_reff = ?, 
                payment_method = ?, 
                va_number = ?, 
                qris_url = ?,
                admin_fee = ?
             WHERE id = ?`,
            [partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, b.id]
        );

        // 6. Template Email Profesional dengan Detail Penumpang
        const subject = `[PELNI] Instruksi Pembayaran - ${b.num_code}`;
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);

        // Mapping daftar penumpang untuk HTML
        const daftarPenumpangHtml = rows.map(row => `
            <div style="border-bottom: 1px solid #eee; padding: 8px 0;">
                <span style="display:block; font-weight:bold; color:#333;">${row.pax_name} (${row.pax_type})</span>
                <span style="font-size:12px; color:#666;">
                    NIK: ${row.id_number || '-'} | Deck: ${row.deck || '-'} | Cabin: ${row.cabin || '-'} | Bed: ${row.bed || '-'}
                </span>
            </div>
        `).join('');

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
                <div style="background: #0054a6; color: white; padding: 20px; text-align: center;">
                    <h2 style="margin:0;">INSTRUKSI PEMBAYARAN</h2>
                </div>
                <div style="padding: 20px; background: #ffffff;">
                    <p>Halo <b>${customer_name}</b>, silakan selesaikan pembayaran tiket kapal Anda sebelum batas waktu berakhir.</p>
                    
                    <table style="width: 100%; background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <tr><td style="width:100px; color:#666;">No. Booking</td><td>: <b>${b.num_code}</b></td></tr>
                        <tr><td style="color:#666;">Nama Kapal</td><td>: ${b.ship_name || 'KM. PELNI'}</td></tr>
                        <tr><td style="color:#666;">Rute</td><td>: ${b.origin_name || b.origin_port} &rarr; ${b.destination_name || b.destination_port}</td></tr>
                    </table>

                    <div style="margin-bottom: 20px; padding: 10px; border: 1px solid #eee; border-radius: 8px;">
                        <strong style="color: #0054a6; display: block; margin-bottom: 5px; border-bottom: 2px solid #0054a6; width: fit-content;">Detail Penumpang & Kursi</strong>
                        ${daftarPenumpangHtml}
                    </div>

                    <div style="text-align: center; margin-top: 20px; padding: 25px; border: 2px dashed #0054a6; border-radius: 10px; background: #fffcf2;">
                        <span style="font-size: 14px; color: #666;">Total yang harus dibayar:</span><br>
                        <strong style="font-size: 28px; color: #e03f7d;">Rp ${formatIDR(amount)}</strong><br><br>
                        
                        ${method === 'VA' ? `
                            <p style="margin-bottom:5px;">Virtual Account <b>${bankName}</b>:</p>
                            <h1 style="letter-spacing: 2px; color: #0054a6; margin: 10px 0; font-size: 32px;">${vaNumber}</h1>
                        ` : `
                            <p style="margin-bottom:10px;">Silakan scan QRIS di bawah ini:</p>
                            <img src="${qrisImage}" style="width: 250px; border: 1px solid #ddd;" />
                        `}
                        
                        <p style="font-size: 12px; color: #d9534f; margin-top: 15px;">
                            <b>Batas Pembayaran:</b> ${moment(expired, 'YYYYMMDDHHmmss').format('DD MMM YYYY, HH:mm')} WIB
                        </p>
                    </div>
                    
                    <p style="font-size: 12px; color: #888; margin-top: 25px; text-align: center;">
                        Tiket akan otomatis diterbitkan setelah pembayaran kami terima.
                    </p>
                </div>
                <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #999;">
                    &copy; 2026 SiappGo Darmawisata - Pelayanan Tiket Kapal Laut
                </div>
            </div>`;

        // Jalankan kirim email (Async)
        sendBookingEmail(customer_email, subject, emailHtml).catch(err => console.error("Email Error:", err));

        return res.json({ status: "Success", partner_reff, data: linkquData });

    } catch (err) {
        console.error("❌ Error createShipPayment:", err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
},

downloadShipQR: async (req, res) => {
    try {
        const { num_code, type } = req.query; // type: 'PAYMENT' atau 'TICKET'

        // 1. Ambil data dari database untuk mendapatkan URL QR yang asli
        const [rows] = await db.query(
            `SELECT b.qris_url, p.ticket_qrcode, b.num_code 
             FROM bookings_pelni b
             LEFT JOIN booking_passengers_pelni p ON b.id = p.booking_id
             WHERE b.num_code = ? LIMIT 1`, 
            [num_code]
        );

        if (rows.length === 0) {
            return res.status(404).send("Data booking tidak ditemukan.");
        }

        const data = rows[0];
        // Pilih URL berdasarkan tipe download
        // Jika TICKET, ambil dari tabel penumpang. Jika PAYMENT, ambil qris_url dari tabel booking.
        const targetUrl = type === 'TICKET' ? data.ticket_qrcode : data.qris_url;
        const fileName = type === 'TICKET' ? `TIKET-PELNI-${num_code}` : `QRIS-BAYAR-${num_code}`;

        if (!targetUrl) {
            return res.status(404).send("Gambar QR belum tersedia.");
        }

        // 2. Download gambar dari URL Vendor (Darmawisata/LinkQu)
        const response = await axios({
            url: targetUrl,
            method: 'GET',
            responseType: 'stream'
        });

        // 3. Set Header agar browser otomatis mendownload (bukan sekadar buka gambar)
        res.setHeader('Content-disposition', `attachment; filename=${fileName}.png`);
        res.setHeader('Content-type', 'image/png');

        // Kirim stream data ke client
        return response.data.pipe(res);

    } catch (err) {
        console.error("❌ Download Error:", err.message);
        return res.status(500).send("Gagal mengunduh gambar QR");
    }
},

    handleShipCallback: async (req, res) => {
        console.log("📥 [SHIP CALLBACK] Received:", req.body.partner_reff);
        try {
            const { partner_reff, status } = req.body;
            if (status === "SUCCESS" || status === "SETTLED") {
                await db.query(
                    "UPDATE bookings_pelni SET payment_status = 'SUCCESS' WHERE payment_reff = ?", 
                    [partner_reff]
                );
            }
            return res.json({ message: "OK" });
        } catch (err) {
            return res.status(500).json({ status: "ERROR", message: err.message });
        }
    }
};

module.exports = ShipPaymentController;