const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');
const { sendBookingEmails } = require('../utils/hotelMailer');

// const config = {
//     clientId: "5f5aa496-7e16-4ca1-9967-33c768dac6c7",
//     clientSecret: "TM1rVhfaFm5YJxKruHo0nWMWC",
//     username: "LI9019VKS",
//     pin: "5m6uYAScSxQtCmU",
//     serverKey: "QtwGEr997XDcmMb1Pq8S5X1N",
//     baseUrl: 'https://api.linkqu.id/linkqu-partner'
// };

const config = {
    clientId: "testing",
    clientSecret: "123",
    username: "LI307GXIN",
    pin: "2K2NPCBBNNTovgB",
    serverKey: "LinkQu@2020",
    baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
};

/**
 * Helper untuk Signature Generator
 * Menghapus karakter non-alfanumerik dan menggabungkan data
 */
function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();


    return crypto.createHmac("sha256", config.serverKey)
        .update(path + method + cleaned)
        .digest("hex");
}

const HotelPaymentController = {

    createPayment: async (req, res) => {
        let connection;
        try {
            const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;

            // 1. Finalisasi Data (Agar konsisten antara Payload API & Signature)
            const finalAmount = Math.round(Number(amount));
            const feeAdmin = Number(admin_fee_applied || 0);
            const finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
            const finalCustomerEmail = (customer_email || 'guest@mail.com').trim();

            // 2. Format Nomor Telepon (+62)
            let formattedPhone = customer_phone ? customer_phone.toString().trim().replace(/[^0-9]/g, '') : '';
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '+62' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('8')) {
                formattedPhone = '+62' + formattedPhone;
            } else if (formattedPhone.startsWith('62') && !formattedPhone.startsWith('+')) {
                formattedPhone = '+' + formattedPhone;
            } else if (!formattedPhone.startsWith('+')) {
                formattedPhone = '+62' + formattedPhone;
            }
            if (formattedPhone.length < 10) formattedPhone = '+628123456789';

            // 3. Persiapan Meta Data
            const bankMap = {
                "002": "BRI", "008": "MANDIRI", "009": "BNI", "200": "BTN", "014": "BCA",
                "013": "PERMATA", "022": "CIMB", "441": "DANAMON", "016": "MAYBANK", "451": "BSI"
            };
            const bankName = bankMap[bank_code] || bank_code;
            const partner_reff = `PAY-HTL-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/hotel-payments/callback";

            connection = await db.getConnection();

            // Ambil Data Booking Hotel
            const [rows] = await connection.query("SELECT * FROM hotel_bookings WHERE id = ?", [booking_id]);
            if (rows.length === 0) return res.status(404).json({ error: "Data booking hotel tidak ditemukan" });
            const b = rows[0];

            // 4. Payload LinkQu
            const commonData = {
                amount: finalAmount,
                expired,
                partner_reff,
                customer_id: formattedPhone,
                customer_name: finalCustomerName,
                customer_email: finalCustomerEmail
            };

            let endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
            let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

            // Menentukan Signature berdasarkan Endpoint
            if (method === 'VA') {
                payloadLinkQu.bank_code = bank_code;
                const signatureData = {
                    amount: finalAmount,
                    expired,
                    bank_code,
                    partner_reff,
                    customer_id: formattedPhone,
                    customer_name: finalCustomerName,
                    customer_email: finalCustomerEmail
                };
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', signatureData);
            } else {
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

            // LOGGING DEBUG SEBELUM KIRIM
            console.log(`🚀 [LINKQU REQ] Sending to ${endpoint} with Reff: ${partner_reff}`);
            console.log(`📦 Payload:`, JSON.stringify(payloadLinkQu));

            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;
            console.log(`✅ [LINKQU RESP] Success:`, JSON.stringify(linkquData));

            // Ekstraksi Data VA / QRIS
            const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? linkquData.data.va_number : null);
            const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.qr_url : null);

            if (!vaNumber && !qrisImage) {
                throw new Error("Gagal mendapatkan instruksi pembayaran dari LinkQu: " + JSON.stringify(linkquData));
            }

            // 5. Update Tabel hotel_payments
          const mysqlExpired = moment(expired, 'YYYYMMDDHHmmss').format('YYYY-MM-DD HH:mm:ss');

            await connection.query(
                `INSERT INTO hotel_payments 
                    (booking_id, payment_reff, payment_method, va_number, qris_url, admin_fee, amount, payment_status, expired_date, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())
                 ON DUPLICATE KEY UPDATE 
                    payment_reff = VALUES(payment_reff),
                    payment_method = VALUES(payment_method),
                    va_number = VALUES(va_number),
                    qris_url = VALUES(qris_url),
                    admin_fee = VALUES(admin_fee),
                    amount = VALUES(amount),
                    payment_status = 'PENDING',
                    expired_date = VALUES(expired_date)`,
                [
                    booking_id, 
                    partner_reff, 
                    method === 'VA' ? `VA-${bankName}` : 'QRIS', 
                    vaNumber, 
                    qrisImage, 
                    feeAdmin, 
                    finalAmount,
                    mysqlExpired // Masukkan nilai expired ke sini
                ]
);

            // 6. Kirim Email (Non-blocking)
            const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
            const emailHtml = `
            <div style="font-family: Arial; max-width: 600px; margin: auto; border: 1px solid #24b3ae;">
                <div style="background: #24b3ae; color: white; padding: 15px; text-align: center;">
                    <h3>INSTRUKSI PEMBAYARAN HOTEL</h3>
                </div>
                <div style="padding: 20px;">
                    <p>Halo ${finalCustomerName}, silakan selesaikan pembayaran untuk <b>${b.hotel_name}</b></p>
                    <table style="width: 100%; margin-bottom: 20px;">
                        <tr><td>No. Transaksi</td><td>: <b>${b.reservation_no}</b></td></tr>
                        <tr><td>Metode</td><td>: ${method} ${bankName || ''}</td></tr>
                    </table>
                    <div style="background: #f9f9f9; padding: 20px; text-align: center; border-radius: 10px;">
                        <small>NOMOR PEMBAYARAN</small>
                        <h2 style="color: #e03f7d; margin: 10px 0;">${vaNumber || 'Lihat QRIS'}</h2>
                        ${qrisImage ? `<img src="${qrisImage}" width="200" />` : ''}
                        <h3 style="margin: 0;">TOTAL: Rp ${formatIDR(finalAmount)}</h3>
                    </div>
                </div>
            </div>`;

            sendBookingEmail(finalCustomerEmail, `Bayar Hotel - ${b.reservation_no}`, emailHtml).catch(e => console.error("Email Error:", e.message));

            return res.json({
                status: "Success",
                partner_reff,
                payment_info: {
                    method,
                    bankName,
                    va_number: vaNumber,
                    qris_url: qrisImage,
                    amount: finalAmount,
                    expired_at: moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss')
                }
            });

        } catch (err) {
            console.error("❌ HTL Payment Error:", err.response?.data || err.message);
            return res.status(500).json({
                status: "Error",
                message: "Gagal membuat kode pembayaran.",
                debug: err.response?.data || err.message
            });
        } finally {
            if (connection) connection.release();
        }
    },

handleCallback: async (req, res) => {
    console.log("📥 [HTL CALLBACK] Incoming:", JSON.stringify(req.body, null, 2));
    try {
        const { partner_reff, status } = req.body;
        const statusUpper = status ? status.toUpperCase() : "";

        if (statusUpper === "SUCCESS" || statusUpper === "SETTLED") {
            // 1. Cari Booking ID terkait
            const [rows] = await db.query(
                `SELECT p.booking_id FROM hotel_payments p WHERE p.payment_reff = ?`, 
                [partner_reff]
            );

            if (rows.length > 0) {
                const bookingId = rows[0].booking_id;

                // 2. Update status pembayaran & booking di DB (Lokal)
                await db.query(
                    `UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?`,
                    [partner_reff]
                );
                
                // Set status 'PAID' agar frontend tahu pembayaran sukses
                await db.query(`UPDATE hotel_bookings SET booking_status = 'PAID' WHERE id = ?`, [bookingId]);

                console.log(`✅ [HTL CALLBACK] Reff ${partner_reff} set to PAID. Waiting for vendor sync...`);
            } else {
                console.warn(`⚠️ [HTL CALLBACK] Payment Reff ${partner_reff} not found in database.`);
            }
        }

        return res.json({ message: "OK" });
    } catch (err) {
        console.error("❌ [HTL CALLBACK ERROR]:", err.message);
        return res.status(500).json({ status: "ERROR" });
    }
},

    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            // 1. CEK DATABASE LOKAL DENGAN VALIDASI LEBIH KUAT
            const [rows] = await db.query(
                `SELECT p.payment_status, b.booking_status, b.reservation_no 
             FROM hotel_payments p
             JOIN hotel_bookings b ON p.booking_id = b.id
             WHERE p.payment_reff = ?`,
                [reff]
            );

            if (rows.length > 0) {
                const b = rows[0];
                const pStatus = (b.payment_status || "").toUpperCase();
                const bStatus = (b.booking_status || "").toUpperCase();

                // Jika di DB sudah sukses/settled, langsung cut off, jangan tanya vendor lagi
                if (['SUCCESS', 'SETTLED', 'PAID'].includes(pStatus) || bStatus === 'SUCCESS') {
                    console.log(`✅ [POLLING DB] Reff ${reff} sudah lunas di database.`);
                    return res.json({
                        status: 'SUCCESS',
                        payment_status: 'SUCCESS',
                        reservation_no: b.reservation_no
                    });
                }
            }

            // 2. TANYA VENDOR (LINKQU)
            console.log(`🔍 [POLLING VENDOR] Memeriksa Reff: ${reff}`);
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret },
                validateStatus: (status) => status < 500
            });

            const data = resp.data;
            // LinkQu terkadang mengirim status di field berbeda atau response_code
            const isSuccess =
                (data.status && (data.status.toUpperCase() === 'SUCCESS' || data.status.toUpperCase() === 'SETTLED')) ||
                (data.response_code === '00') ||
                (data.response_desc && data.response_desc.includes('SUCCESS'));

            // 3. JIKA VENDOR BILANG SUKSES, UPDATE DB & KIRIM RESPONS SUKSES
            if (isSuccess) {
                console.log(`✅ [POLLING VENDOR SUCCESS] Transaksi ${reff} VALID.`);

                // Update Sinkron ke tabel Payments & Bookings
                await db.query(
                    `UPDATE hotel_payments p
                 JOIN hotel_bookings b ON p.booking_id = b.id
                 SET p.payment_status = 'SETTLED', 
                     p.payment_date = NOW(),
                     b.booking_status = 'Success'
                 WHERE p.payment_reff = ?`,
                    [reff]
                );

                return res.json({
                    status: 'SUCCESS',
                    message: 'Pembayaran Berhasil',
                    data: data
                });
            }

            // 4. JIKA MASIH PENDING
            console.log(`⏳ [POLLING PENDING] Reff ${reff} belum dibayar.`);
            return res.json({ status: 'PENDING', message: 'Menunggu pembayaran' });

        } catch (err) {
            console.error(`❌ [POLLING ERROR] ${reff}:`, err.message);
            return res.json({ status: 'PENDING', error: err.message });
        }
    }
};

module.exports = HotelPaymentController;