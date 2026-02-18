const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db'); 
const { sendBookingEmail } = require('../utils/mailer'); 

const config = {
    clientId: "testing",
    clientSecret: "123",
    username: "LI307GXIN",
    pin: "2K2NPCBBNNTovgB",
    serverKey: "LinkQu@2020",
    baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner' // Menyesuaikan endpoint dev LinkQu
};

/**
 * Helper untuk Signature Generator
 */
function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
    return crypto.createHmac("sha256", config.serverKey)
                 .update(path + method + cleaned)
                 .digest("hex");
}

const PaymentController = {
    
createPayment: async (req, res) => {
    let connection;
    try {
        const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;
        
        const feeAdmin = Number(admin_fee_applied || 0);

        // 1. Logika Perbaikan Nomor Telepon (Konsisten +62)
        let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
        formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');

        if (formattedPhone.startsWith('0')) {
            formattedPhone = '+62' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('8')) {
            formattedPhone = '+62' + formattedPhone;
        } else if (formattedPhone.startsWith('62') && !formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+62' + formattedPhone;
        }

        // 2. Mapping Nama Bank
        const bankMap = {
            "002": "BRI", "008": "MANDIRI", "009": "BNI", "200": "BTN", "014": "BCA",
            "013": "PERMATA", "022": "CIMB", "441": "DANAMON", "011": "DANAMON",
            "016": "MAYBANK", "422": "BRI SYARIAH", "451": "BSI (BANK SYARIAH INDONESIA)"
        };

        const bankName = bankMap[bank_code] || bank_code;
        const partner_reff = `PAY-${Date.now()}`;
        const expired = moment.tz('Asia/Jakarta').add(30, 'minutes').format('YYYYMMDDHHmmss');
        const url_callback = "https://darma.siappgo.id/api/callback";

        connection = await db.getConnection();
        
        // A. Ambil Data Booking
        const [rows] = await connection.query("SELECT * FROM bookings WHERE id = ?", [booking_id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Data booking tidak ditemukan" });
        }
        const b = rows[0];

        // B. Persiapan Payload LinkQu
        const commonData = {
            amount, expired, partner_reff,
            customer_id: formattedPhone, 
            customer_name: customer_name || 'Customer', 
            customer_email
        };

        let endpoint = '';
        let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

        if (method === 'VA') {
            endpoint = '/transaction/create/va';
            payloadLinkQu.bank_code = bank_code; 
            // Meniru persis logika signature kode yang berhasil
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', {
                amount, expired, bank_code, partner_reff, customer_id: formattedPhone, customer_name, customer_email
            });
        } else {
            endpoint = '/transaction/create/qris';
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
        }

        // C. Request ke LinkQu
        const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
            headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
        });

        const linkquData = resp.data;

        // --- POINT UTAMA: Meniru cara ambil VA dari kode yang berhasil ---
        // LinkQu biasanya mengirimkan data langsung di root response
        const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? (linkquData.data.virtual_account || linkquData.data.va_number) : null);
        const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.imageqris : null);

        // D. UPDATE DATABASE
        await connection.query(
            `UPDATE bookings SET 
                pengguna = ?, 
                payment_reff = ?, 
                payment_method = ?, 
                va_number = ?, 
                qris_url = ?,
                admin_fee = ?
             WHERE id = ?`,
            [customer_name, partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, booking_id]
        );

        // E. LOGIKA PENGIRIMAN EMAIL
        const subject = `[LinkU] Instruksi Pembayaran - ${b.booking_code}`;
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
        
        let passengers = [];
        try { 
            const raw = b.raw_response;
            const parsedResponse = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            passengers = parsedResponse.paxDetails || []; 
        } catch(e) { console.error("Parse error:", e); }

        const hargaAsli = Number(b.total_price || 0);
        const diskonMurni = (amount - feeAdmin) - hargaAsli;

        const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 700px; margin: auto; border: 1px solid #eee;">
            <div style="background-color: #24b3ae; padding: 10px; color: white; font-weight: bold;">Instruksi Pembayaran</div>
            <div style="padding: 20px;">
                <p>Silakan lakukan pembayaran sesuai rincian di bawah ini untuk menerbitkan tiket Anda.</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                    <tr><td style="width: 30%; padding: 5px 0;">Kode Booking</td><td style="font-weight:bold;">: ${b.booking_code}</td></tr>
                    <tr><td style="padding: 5px 0;">Nama Kontak</td><td>: ${customer_name}</td></tr>
                    ${passengers.map((pax) => `<tr><td style="padding: 5px 0;">Nama Penumpang</td><td>: ${pax.title || ''} ${pax.firstName} ${pax.lastName}</td></tr>`).join('')}
                    <tr><td style="padding: 5px 0;">Telepon</td><td>: ${formattedPhone}</td></tr>
                    <tr><td style="padding: 5px 0;">Time Limit</td><td style="color: #e03f7d; font-weight: bold;">: ${moment(b.time_limit).format('dddd, DD MMM YYYY HH:mm')} WIB</td></tr>
                </table>

                <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold;">Rincian Pembayaran</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 15px 0;">
                    ${method === 'VA' ? `
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">No. Rekening (VA)</td><td style="text-align:right; border-bottom: 1px solid #eee; font-weight:bold; font-size:16px;">${vaNumber || 'Gagal generate VA'}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Bank</td><td style="text-align:right; border-bottom: 1px solid #eee;">${bankName}</td></tr>
                    ` : `
                    <tr><td colspan="2" style="text-align:center; padding: 15px;">
                        <p>Scan QRIS berikut:</p>
                        <img src="${qrisImage}" style="max-width:200px; border:1px solid #ddd;" />
                    </td></tr>
                    `}
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Harga Tiket</td><td style="text-align:right; border-bottom: 1px solid #eee;">Rp ${formatIDR(hargaAsli)}</td></tr>
                    ${diskonMurni !== 0 ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: green;">Potongan Harga</td><td style="text-align:right; border-bottom: 1px solid #eee; color: green;">- Rp ${formatIDR(Math.abs(diskonMurni))}</td></tr>` : ''}
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Biaya Admin ${method}</td><td style="text-align:right; border-bottom: 1px solid #eee;">+ Rp ${formatIDR(feeAdmin)}</td></tr>
                    <tr style="color: #e03f7d; font-weight: bold; font-size: 16px;">
                        <td style="padding: 15px 0;">Total Pembayaran</td>
                        <td style="text-align:right; padding: 15px 0;">Rp ${formatIDR(amount)}</td>
                    </tr>
                </table>

                <div style="background: #fdfae2; padding: 10px; border: 1px solid #e6db55; font-size: 12px;">
                    <b>Data Perjalanan:</b> ${b.airline_name} | ${b.origin} → ${b.destination} | ${moment(b.depart_date).format('DD MMM YYYY')}
                </div>
                <p style="text-align:center; font-style: italic; color: #e03f7d; margin-top: 20px;">*Pastikan Anda transfer sesuai dengan nominal di atas agar tiket terbit otomatis!</p>
            </div>
        </div>`;

        sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("Email Error:", e));

        return res.json({ status: "Success", partner_reff, data: linkquData });

    } catch (err) {
        console.error("❌ Create Error:", err.response?.data || err.message);
        return res.status(500).json({ error: err.response?.data || err.message });
    } finally {
        if (connection) connection.release();
    }
},

   // 3. DOWNLOAD QRIS IMAGE
    downloadQR: async (req, res) => {
        try {
            const { qr_url, reff } = req.query;
            const response = await axios({ url: qr_url, method: 'GET', responseType: 'stream' });
            
            res.setHeader('Content-disposition', `attachment; filename=QRIS-${reff}.png`);
            res.setHeader('Content-type', 'image/png');
            return response.data.pipe(res);
        } catch (err) {
            return res.status(500).send("Gagal mengunduh gambar QRIS");
        }
    },
    // 2. CHECK PAYMENT STATUS
  // 2. CHECK PAYMENT STATUS (Polling Handler)
checkStatus: async (req, res) => {
    const { reff } = req.params;
    try {
        // 1. CEK DATABASE LOKAL DULU (Kunci agar polling berhenti saat callback masuk)
        const [rows] = await db.query(
            "SELECT payment_status, ticket_status, booking_code FROM bookings WHERE payment_reff = ?", 
            [reff]
        );

        if (rows.length > 0) {
            const b = rows[0];
            // Jika sudah sukses di DB (karena callback), langsung respon sukses ke frontend
            if (b.payment_status === 'SUCCESS' || b.ticket_status === 'TICKETED') {
                console.log(`✅ [POLLING DB] Reff ${reff} sudah lunas di Database.`);
                return res.json({ 
                    status: 'SUCCESS', 
                    payment_status: 'SUCCESS',
                    bookingCode: b.booking_code 
                });
            }
        }

        // 2. JIKA DI DB BELUM SUKSES, TANYA KE API LINKQU
        console.log(`🔍 [POLLING VENDOR] Memeriksa status LinkQu untuk Reff: ${reff}`);
        const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
            params: { 
                partner_reff: reff, 
                username: config.username, 
                pin: config.pin 
            },
            headers: { 
                'client-id': config.clientId, 
                'client-secret': config.clientSecret 
            },
            validateStatus: (status) => status < 500
        });

        const statusFromServer = resp.data.status || 'PENDING';

        // Jika Vendor bilang sukses, kita update database kita juga (sebagai backup jika callback gagal)
        if (statusFromServer === 'SUCCESS' || statusFromServer === 'SETTLED') {
            console.log(`✅ [POLLING VENDOR SUCCESS] Transaksi ${reff} lunas via API Vendor.`);
            await db.query(
                "UPDATE bookings SET payment_status = 'SUCCESS' WHERE payment_reff = ?", 
                [reff]
            );
            return res.json({ ...resp.data, status: 'SUCCESS' });
        } 

        console.log(`⏳ [POLLING PENDING] Transaksi ${reff} masih menunggu.`);
        return res.json(resp.data);

    } catch (err) {
        console.error(`❌ [POLLING ERROR] ${reff}:`, err.message);
        return res.status(200).json({ status: 'PENDING' });
    }
},

handleCallback: async (req, res) => {
    console.log("📥 [CALLBACK RECEIVED] Data dari LinkQu:", JSON.stringify(req.body));
    
    try {
        const { partner_reff, status } = req.body;

        if (status === "SUCCESS" || status === "SETTLED") {
            // Update status pembayaran dan tiket secara bersamaan
            const [result] = await db.query(
                `UPDATE bookings 
                 SET payment_status = 'SUCCESS', 
                     ticket_status = 'PAID' 
                 WHERE payment_reff = ? AND payment_status != 'SUCCESS'`, 
                [partner_reff]
            );

            if (result.affectedRows > 0) {
                console.log(`🚀 [CALLBACK SUCCESS] Database Updated for Reff: ${partner_reff}`);
            } else {
                console.log(`ℹ️ [CALLBACK INFO] Reff ${partner_reff} sudah berstatus SUCCESS sebelumnya.`);
            }
        } else {
            console.log(`ℹ️ [CALLBACK INFO] Status: ${status}, tidak ada perubahan database.`);
        }
        
        // LinkQu butuh respon 200 OK agar tidak mengirim ulang callback
        return res.json({ message: "OK" });

    } catch (err) {
        console.error("❌ [CALLBACK CRITICAL ERROR]:", err.message);
        return res.status(500).json({ status: "ERROR", message: err.message });
    }
}


};

module.exports = PaymentController;