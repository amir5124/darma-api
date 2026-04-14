const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');

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

    // Log untuk keperluan debug signature (Hanya aktifkan saat development)
    // console.log(`--- DEBUG SIGNATURE ---`);
    // console.log(`Path+Method: ${path}${method}`);
    // console.log(`Raw Cleaned Data: ${cleaned}`);

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
            const url_callback = "https://darma.siappgo.id/api/callback";

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
            await connection.query(
                `UPDATE hotel_payments SET 
                payment_reff = ?, 
                payment_method = ?, 
                va_number = ?, 
                qris_url = ?,
                admin_fee = ?,
                amount = ?,
                payment_status = 'PENDING'
             WHERE booking_id = ?`,
                [partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, finalAmount, booking_id]
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
                        <tr><td>No. Reservasi</td><td>: <b>${b.reservation_no}</b></td></tr>
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
        console.log("📥 [HTL CALLBACK] Received Data:", JSON.stringify(req.body));
        try {
            const { partner_reff, status, response_code } = req.body;

            // 1. Indikator Sukses yang lebih luas
            const isSuccess = 
                (status && (status.toUpperCase() === 'SUCCESS' || status.toUpperCase() === 'SETTLED')) || 
                (response_code === '00');

            if (isSuccess) {
                // Gunakan Single Query Update JOIN agar atomis (keduanya terupdate bersamaan)
                const [result] = await db.query(
                    `UPDATE hotel_payments p
                     JOIN hotel_bookings b ON p.booking_id = b.id
                     SET p.payment_status = 'SETTLED', 
                         p.payment_date = NOW(),
                         b.booking_status = 'Success'
                     WHERE p.payment_reff = ?`,
                    [partner_reff]
                );

                if (result.affectedRows > 0) {
                    console.log(`✅ [HTL CALLBACK] Reff ${partner_reff} marked as SUCCESS in Database.`);
                } else {
                    console.log(`⚠️ [HTL CALLBACK] Reff ${partner_reff} success but no rows updated (check if Reff exists).`);
                }
            } else {
                console.log(`ℹ️ [HTL CALLBACK] Reff ${partner_reff} status is not success (${status}).`);
            }

            // LinkQu WAJIB menerima respon JSON OK agar tidak mengirim ulang callback
            return res.json({ message: "OK" });
        } catch (err) {
            console.error("❌ HTL Callback Error:", err.message);
            // Tetap berikan 200/OK ke vendor agar mereka berhenti mencoba, tapi log error di kita
            return res.status(200).json({ status: "ERROR", message: err.message });
        }
    },

    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            // 1. CEK DATABASE LOKAL DULU
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

                // Jika di DB lokal sudah lunas (hasil update dari callback), langsung berhenti polling
                if (['SUCCESS', 'SETTLED', 'PAID'].includes(pStatus) || bStatus === 'SUCCESS') {
                    console.log(`✅ [POLLING DB] Reff ${reff} detected as PAID in local DB.`);
                    return res.json({
                        status: 'SUCCESS',
                        payment_status: 'SUCCESS',
                        reservation_no: b.reservation_no
                    });
                }
            }

            // 2. TANYA VENDOR (JIKA DB LOKAL MASIH PENDING)
            console.log(`🔍 [POLLING VENDOR] Checking API LinkQu for Reff: ${reff}`);
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret },
                validateStatus: (status) => status < 500
            });

            const data = resp.data;
            
            // LOGIKA PENGECEKAN STATUS DARI VENDOR (Sangat Krusial)
            // LinkQu seringkali meletakkan status di root atau di dalam object 'data'
            const vendorStatus = (data.status || (data.data && data.data.status) || "").toUpperCase();
            const vendorCode = data.response_code || (data.data && data.data.response_code);
            
            const isVendorSuccess = 
                vendorStatus === 'SUCCESS' || 
                vendorStatus === 'SETTLED' || 
                vendorCode === '00';

            if (isVendorSuccess) {
                console.log(`✅ [POLLING VENDOR SUCCESS] Reff ${reff} is PAID on Vendor side. Syncing DB...`);

                // Sinkronkan Database jika ternyata di vendor sudah sukses
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

            // 4. JIKA SEMUA MASIH PENDING
            console.log(`⏳ [POLLING PENDING] Reff ${reff} is still waiting for payment.`);
            return res.json({ status: 'PENDING', message: 'Menunggu pembayaran' });

        } catch (err) {
            console.error(`❌ [POLLING ERROR] ${reff}:`, err.message);
            // Kembalikan PENDING agar frontend tetap melakukan polling (retry)
            return res.json({ status: 'PENDING', error: err.message });
        }
    }
};

module.exports = HotelPaymentController;