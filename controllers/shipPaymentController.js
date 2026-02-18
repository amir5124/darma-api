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
            booking_id, // Ini adalah numCode dari Frontend
            amount, 
            customer_name, 
            customer_phone, 
            customer_email, 
            method, 
            bank_code, 
            admin_fee_applied 
        } = req.body;
        
        const feeAdmin = Number(admin_fee_applied || 0);

        // 1. Format Phone (Standardisasi ke format Internasional)
        let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
        formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);

        const bankMap = { "002": "BRI", "008": "MANDIRI", "009": "BNI", "014": "BCA", "451": "BSI", "013": "PERMATA" };
        const bankName = bankMap[bank_code] || bank_code;
        const partner_reff = `SHIP-PAY-${Date.now()}`;
        const expired = moment.tz('Asia/Jakarta').add(60, 'minutes').format('YYYYMMDDHHmmss');
        const url_callback = "https://darma.siappgo.id/api/ship/callback";

        connection = await db.getConnection();
        
        // A. Ambil Data Booking Pelni Berdasarkan num_code
        // PENTING: Kita mencari berdasarkan num_code karena itu yang dikirim oleh Frontend
        const [rows] = await connection.query(
            "SELECT * FROM bookings_pelni WHERE num_code = ? ORDER BY id DESC LIMIT 1", 
            [booking_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Data booking kapal tidak ditemukan di sistem kami." });
        }
        const b = rows[0];

        // B. Persiapan Payload LinkQu
        const commonData = { 
            amount, 
            expired, 
            partner_reff, 
            customer_id: formattedPhone, 
            customer_name, 
            customer_email 
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

        // C. Request ke API LinkQu (Payment Gateway)
        const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
            headers: { 
                'client-id': config.clientId, 
                'client-secret': config.clientSecret,
                'Content-Type': 'application/json'
            }
        });

        const linkquData = resp.data;
        
        // Ambil VA atau QRIS dari response LinkQu
        const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? linkquData.data.va_number : null);
        const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.qr_url : null);

        // D. UPDATE DATABASE menggunakan ID internal hasil select tadi
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

        // E. Kirim Email Instruksi Pembayaran Kapal
        const subject = `[PELNI] Instruksi Pembayaran - ${b.num_code}`;
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);

        const emailHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eeeeee; border-radius: 8px; overflow: hidden;">
                <div style="background: #0054a6; color: white; padding: 30px; text-align: center;">
                    <h2 style="margin: 0;">PEMBAYARAN TIKET PELNI</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">Segera selesaikan pembayaran Anda</p>
                </div>
                <div style="padding: 25px; color: #333333;">
                    <p>Halo <b>${customer_name}</b>,</p>
                    <p>Terima kasih telah memesan tiket kapal di platform kami. Berikut adalah detail pesanan Anda:</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fcfcfc;">
                        <tr><td style="padding: 8px; color: #666;">Kode Reservasi</td><td style="padding: 8px;"><b>${b.num_code}</b></td></tr>
                        <tr><td style="padding: 8px; color: #666;">Nama Kapal</td><td style="padding: 8px;">${b.ship_name || 'Pelni Ship'}</td></tr>
                        <tr><td style="padding: 8px; color: #666;">Rute</td><td style="padding: 8px;">${b.origin_name} &rarr; ${b.destination_name}</td></tr>
                        <tr><td style="padding: 8px; color: #666;">Keberangkatan</td><td style="padding: 8px;">${moment(b.depart_date).format('DD MMM YYYY, HH:mm')} WIB</td></tr>
                    </table>

                    <div style="background: #fff4f7; padding: 20px; border-radius: 10px; text-align: center; border: 1px dashed #e03f7d;">
                        <p style="margin:0; font-size: 14px; color: #666;">Total Tagihan:</p>
                        <h1 style="color: #e03f7d; margin: 5px 0; font-size: 32px;">Rp ${formatIDR(amount)}</h1>
                        
                        ${method === 'VA' ? `
                            <p style="margin-top: 15px; color: #444;">Transfer ke <b>Bank ${bankName}</b> Virtual Account:</p>
                            <div style="background: #ffffff; padding: 10px; font-size: 24px; font-weight: bold; letter-spacing: 3px; color: #0054a6; border-radius: 5px;">${vaNumber}</div>
                        ` : `
                            <p style="margin-top: 15px; color: #444;">Scan Kode QRIS di bawah ini:</p>
                            <img src="${qrisImage}" style="width: 220px; border: 5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);" />
                        `}
                    </div>
                    
                    <p style="font-size: 12px; color: #888; margin-top: 25px; text-align: center;">
                        *Pembayaran akan diverifikasi otomatis oleh sistem kami.<br>
                        Mohon selesaikan pembayaran sebelum 60 menit.
                    </p>
                </div>
                <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #999;">
                    &copy; ${new Date().getFullYear()} SiappGo - Tiket Kapal Laut Indonesia
                </div>
            </div>`;

        // Kirim email tanpa menunggu (background process)
        sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("❌ Email Error:", e));

        // Berikan response sukses ke Frontend
        return res.json({ 
            status: "Success", 
            partner_reff, 
            data: {
                ...linkquData,
                virtual_account: vaNumber,
                qr_url: qrisImage
            }
        });

    } catch (err) {
        console.error("❌ Ship Payment Critical Error:", err.message);
        return res.status(500).json({ error: "Gagal membuat pembayaran: " + err.message });
    } finally {
        if (connection) connection.release();
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