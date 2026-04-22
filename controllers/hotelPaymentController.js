const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');
const { sendBookingEmails } = require('../utils/hotelMailer');

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
 */
function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();

    return crypto.createHmac("sha256", config.serverKey)
        .update(path + method + cleaned)
        .digest("hex");
}

/**
 * Helper untuk mengambil nilai valid (Anti-Strip)
 */
const getValidValue = (vendorVal, dbVal) => {
    if (vendorVal && vendorVal !== "-" && vendorVal !== "" && vendorVal !== "null") {
        return vendorVal;
    }
    return dbVal || "-";
};

const HotelPaymentController = {

    createPayment: async (req, res) => {
        let connection;
        try {
            const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;

            const finalAmount = Math.round(Number(amount));
            const feeAdmin = Number(admin_fee_applied || 0);
            const finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
            const finalCustomerEmail = (customer_email || 'guest@mail.com').trim();

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

            const bankMap = {
                "002": "BRI", "008": "MANDIRI", "009": "BNI", "200": "BTN", "014": "BCA",
                "013": "PERMATA", "022": "CIMB", "441": "DANAMON", "016": "MAYBANK", "451": "BSI"
            };
            const bankName = bankMap[bank_code] || bank_code;
            const partner_reff = `PAY-HTL-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/hotel-payments/callback";

            connection = await db.getConnection();

            const [rows] = await connection.query("SELECT * FROM hotel_bookings WHERE id = ?", [booking_id]);
            if (rows.length === 0) return res.status(404).json({ error: "Data booking hotel tidak ditemukan" });
            const b = rows[0];

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

            if (method === 'VA') {
                payloadLinkQu.bank_code = bank_code;
                const signatureData = { ...commonData, bank_code };
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', signatureData);
            } else {
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

            console.log(`🚀 [LINKQU REQ] Reff: ${partner_reff}`);
            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;
            const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? linkquData.data.va_number : null);
            const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.qr_url : null);

            if (!vaNumber && !qrisImage) {
                throw new Error("Gagal mendapatkan instruksi pembayaran.");
            }

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
                    payment_status = 'PENDING',
                    expired_date = VALUES(expired_date)`,
                [booking_id, partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, finalAmount, mysqlExpired]
            );

            const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
            const emailHtml = `
            <div style="font-family: Arial; max-width: 600px; margin: auto; border: 1px solid #24b3ae;">
                <div style="background: #24b3ae; color: white; padding: 15px; text-align: center;"><h3>INSTRUKSI PEMBAYARAN</h3></div>
                <div style="padding: 20px;">
                    <p>Halo ${finalCustomerName}, silakan bayar untuk <b>${b.hotel_name}</b></p>
                    <h2 style="color: #e03f7d; text-align: center;">${vaNumber || 'Lihat QRIS'}</h2>
                    <h3 style="text-align: center;">TOTAL: Rp ${formatIDR(finalAmount)}</h3>
                </div>
            </div>`;

            sendBookingEmail(finalCustomerEmail, `Bayar Hotel - ${b.reservation_no}`, emailHtml).catch(e => console.error("Email Error:", e.message));

            return res.json({
                status: "Success",
                partner_reff,
                payment_info: { method, bankName, va_number: vaNumber, qris_url: qrisImage, amount: finalAmount }
            });

        } catch (err) {
            console.error("❌ HTL Payment Error:", err.message);
            return res.status(500).json({ status: "Error", message: "Gagal membuat kode pembayaran." });
        } finally {
            if (connection) connection.release();
        }
    },

    handleCallback: async (req, res) => {
        console.log("📥 [HTL CALLBACK]", req.body);
        try {
            const { partner_reff, status } = req.body;
            const statusUpper = status ? status.toUpperCase() : "";

            if (statusUpper === "SUCCESS" || statusUpper === "SETTLED") {
                // 1. Cari Booking ID & Data Booking Saat Ini
                const [rows] = await db.query(
                    `SELECT p.booking_id, b.reservation_no, b.os_ref_no 
                     FROM hotel_payments p 
                     JOIN hotel_bookings b ON p.booking_id = b.id 
                     WHERE p.payment_reff = ?`, 
                    [partner_reff]
                );

                if (rows.length > 0) {
                    const { booking_id } = rows[0];

                    // 2. UPDATE SINKRON (AWAIT)
                    // Pastikan database terupdate sebelum trigger email/PDF
                    await db.query(
                        `UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?`,
                        [partner_reff]
                    );
                    
                    await db.query(
                        `UPDATE hotel_bookings SET booking_status = 'Success' WHERE id = ?`, 
                        [booking_id]
                    );

                    // 3. TRIGGER EMAIL DENGAN JEDA (Agar data matang di DB)
                    // Fungsi ini di dalamnya harus melakukan SELECT ulang ke DB
                    setTimeout(() => {
                        sendBookingEmails(booking_id).catch(err => console.error("Email Voucher Error:", err));
                    }, 1500);

                    console.log(`✅ [HTL CALLBACK] Reff ${partner_reff} Finalized.`);
                }
            }

            return res.json({ message: "OK" });
        } catch (err) {
            console.error("❌ HTL Callback Error:", err.message);
            return res.status(500).json({ status: "ERROR" });
        }
    },

    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            const [rows] = await db.query(
                `SELECT p.booking_id, p.payment_status, b.booking_status, b.reservation_no 
                 FROM hotel_payments p
                 JOIN hotel_bookings b ON p.booking_id = b.id
                 WHERE p.payment_reff = ?`,
                [reff]
            );

            if (rows.length > 0) {
                const b = rows[0];
                if (['SUCCESS', 'SETTLED', 'PAID'].includes(b.payment_status.toUpperCase()) || b.booking_status.toUpperCase() === 'SUCCESS') {
                    return res.json({ status: 'SUCCESS', payment_status: 'SUCCESS', reservation_no: b.reservation_no });
                }
            }

            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret },
                validateStatus: (status) => status < 500
            });

            const data = resp.data;
            const isSuccess = (data.status && ['SUCCESS', 'SETTLED'].includes(data.status.toUpperCase())) || (data.response_code === '00');

            if (isSuccess) {
                const bookingId = rows[0].booking_id;
                
                // Update DB secara menyeluruh
                await db.query(
                    `UPDATE hotel_payments p
                     JOIN hotel_bookings b ON p.booking_id = b.id
                     SET p.payment_status = 'SETTLED', p.payment_date = NOW(), b.booking_status = 'Success'
                     WHERE p.payment_reff = ?`,
                    [reff]
                );

                // Kirim email setelah update sukses
                sendBookingEmails(bookingId).catch(err => console.error("Polling Email Error:", err));

                return res.json({ status: 'SUCCESS', message: 'Pembayaran Berhasil', data });
            }

            return res.json({ status: 'PENDING', message: 'Menunggu pembayaran' });

        } catch (err) {
            return res.json({ status: 'PENDING', error: err.message });
        }
    }
};

module.exports = HotelPaymentController;