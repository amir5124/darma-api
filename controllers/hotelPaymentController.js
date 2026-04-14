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
    baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
};

/**
 * Helper Signature Generator
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

            const finalAmount = Math.round(Number(amount));
            const feeAdmin = Number(admin_fee_applied || 0);
            const finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
            const finalCustomerEmail = (customer_email || 'guest@mail.com').trim();

            // Format Phone
            let formattedPhone = customer_phone ? customer_phone.toString().trim().replace(/[^0-9]/g, '') : '';
            if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);
            else if (!formattedPhone.startsWith('+')) formattedPhone = '+62' + formattedPhone;

            const bankMap = { "002": "BRI", "008": "MANDIRI", "009": "BNI", "200": "BTN", "014": "BCA", "013": "PERMATA", "022": "CIMB", "441": "DANAMON", "016": "MAYBANK", "451": "BSI" };
            const bankName = bankMap[bank_code] || bank_code;
            
            // PAKAI PREFIX KONSISTEN: PAY-HOTEL-
            const partner_reff = `PAY-HOTEL-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/hotel-payments/callback";

            connection = await db.getConnection();

            const [rows] = await connection.query("SELECT hotel_name, reservation_no FROM hotel_bookings WHERE id = ?", [booking_id]);
            if (rows.length === 0) return res.status(404).json({ error: "Booking tidak ditemukan" });
            const b = rows[0];

            const commonData = { amount: finalAmount, expired, partner_reff, customer_id: formattedPhone, customer_name: finalCustomerName, customer_email: finalCustomerEmail };

            let endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
            let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

            if (method === 'VA') {
                payloadLinkQu.bank_code = bank_code;
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', { ...commonData, bank_code });
            } else {
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

            console.log(`🚀 [LINKQU REQ] Reff: ${partner_reff}`);
            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;
            const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data?.va_number);
            const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data?.qr_url);

            // Update Database - Pastikan payment_reff tersimpan sempurna
            await connection.query(
                `UPDATE hotel_payments SET 
                payment_reff = ?, payment_method = ?, va_number = ?, qris_url = ?, admin_fee = ?, amount = ?, payment_status = 'PENDING'
                WHERE booking_id = ?`,
                [partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, finalAmount, booking_id]
            );

            // Email (Non-blocking)
            const emailHtml = `<h3>INSTRUKSI PEMBAYARAN</h3><p>No. Reservasi: ${b.reservation_no}</p><h2>${vaNumber || 'QRIS'}</h2>`;
            sendBookingEmail(finalCustomerEmail, `Bayar Hotel - ${b.reservation_no}`, emailHtml).catch(e => {});

            return res.json({ status: "Success", partner_reff, payment_info: { method, bankName, va_number: vaNumber, qris_url: qrisImage, amount: finalAmount } });

        } catch (err) {
            console.error("❌ HTL Payment Error:", err.message);
            return res.status(500).json({ status: "Error", message: err.message });
        } finally {
            if (connection) connection.release();
        }
    },

    handleCallback: async (req, res) => {
        console.log("📥 [HTL CALLBACK] Raw Data:", JSON.stringify(req.body));
        try {
            const { partner_reff, status, response_code } = req.body;
            const isSuccess = (status?.toUpperCase() === 'SUCCESS') || (response_code === '00');

            if (isSuccess) {
                // Gunakan 2 tahap update untuk memastikan keberhasilan jika JOIN bermasalah
                const [payData] = await db.query("SELECT booking_id FROM hotel_payments WHERE payment_reff = ?", [partner_reff]);
                
                if (payData.length > 0) {
                    const bookingId = payData[0].booking_id;
                    
                    // Update Payment
                    await db.query("UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?", [partner_reff]);
                    // Update Booking
                    await db.query("UPDATE hotel_bookings SET booking_status = 'Success' WHERE id = ?", [bookingId]);
                    
                    console.log(`✅ [HTL CALLBACK] Reff ${partner_reff} lunas.`);
                } else {
                    console.error(`⚠️ [HTL CALLBACK] Reff ${partner_reff} tidak ditemukan di DB!`);
                }
            }
            return res.json({ message: "OK" });
        } catch (err) {
            console.error("❌ HTL Callback Error:", err.message);
            return res.status(200).json({ message: "Error handled" });
        }
    },

    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            // 1. Cek DB Lokal
            const [rows] = await db.query(
                `SELECT p.payment_status, b.booking_status, b.reservation_no 
                 FROM hotel_payments p JOIN hotel_bookings b ON p.booking_id = b.id
                 WHERE p.payment_reff = ?`, [reff]
            );

            if (rows.length > 0) {
                const b = rows[0];
                if (['SETTLED', 'SUCCESS'].includes(b.payment_status?.toUpperCase()) || b.booking_status?.toUpperCase() === 'SUCCESS') {
                    return res.json({ status: 'SUCCESS', reservation_no: b.reservation_no });
                }
            }

            // 2. Tanya Vendor
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const d = resp.data;
            const isVendorSuccess = (d.status?.toUpperCase() === 'SUCCESS') || (d.data?.status?.toUpperCase() === 'SUCCESS') || (d.response_code === '00');

            if (isVendorSuccess) {
                // Paksa Update DB Lokal agar sinkron
                const [payData] = await db.query("SELECT booking_id FROM hotel_payments WHERE payment_reff = ?", [reff]);
                if (payData.length > 0) {
                    await db.query("UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?", [reff]);
                    await db.query("UPDATE hotel_bookings SET booking_status = 'Success' WHERE id = ?", [payData[0].booking_id]);
                }
                return res.json({ status: 'SUCCESS' });
            }

            return res.json({ status: 'PENDING' });
        } catch (err) {
            return res.json({ status: 'PENDING' });
        }
    }
};

module.exports = HotelPaymentController;