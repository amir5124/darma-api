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
            const partner_reff = `PAY-HTL-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/hotel-payments/callback";

            connection = await db.getConnection();

            // 1. Validasi Booking
            const [rows] = await connection.query("SELECT * FROM hotel_bookings WHERE id = ?", [booking_id]);
            if (rows.length === 0) return res.status(404).json({ error: "Data booking tidak ditemukan" });
            const b = rows[0];

            // 2. FORMAT PHONE
            let formattedPhone = customer_phone ? customer_phone.toString().trim().replace(/[^0-9]/g, '') : '';
            formattedPhone = formattedPhone.startsWith('0') ? '+62' + formattedPhone.substring(1) : (formattedPhone.startsWith('8') ? '+62' + formattedPhone : (formattedPhone.startsWith('62') ? '+' + formattedPhone : '+62' + formattedPhone));

            // --- PERBAIKAN KRUSIAL: INSERT/UPDATE DATABASE DULU ---
            // Kita set status PENDING dan simpan REFF sebelum tembak API LinkQu
            await connection.query(
                `UPDATE hotel_payments SET 
                    payment_reff = ?, 
                    payment_method = ?, 
                    admin_fee = ?,
                    amount = ?,
                    payment_status = 'PENDING'
                 WHERE booking_id = ?`,
                [partner_reff, method, feeAdmin, finalAmount, booking_id]
            );

            // 3. Persiapan Payload LinkQu
            const commonData = {
                amount: finalAmount,
                expired,
                partner_reff,
                customer_id: formattedPhone,
                customer_name: (customer_name || 'Customer').substring(0, 30),
                customer_email: (customer_email || 'guest@mail.com').trim()
            };

            let endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
            let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

            if (method === 'VA') {
                payloadLinkQu.bank_code = bank_code;
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', { ...commonData, bank_code });
            } else {
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

            // 4. Panggil API LinkQu
            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;
            const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data?.va_number);
            const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data?.qr_url);

            // 5. Update Data Tambahan (VA/QRIS) yang didapat dari LinkQu
            await connection.query(
                `UPDATE hotel_payments SET va_number = ?, qris_url = ? WHERE payment_reff = ?`,
                [vaNumber, qrisImage, partner_reff]
            );

            // 6. Response ke Frontend
            return res.json({
                status: "Success",
                partner_reff,
                payment_info: { va_number: vaNumber, qris_url: qrisImage, amount: finalAmount }
            });

        } catch (err) {
            console.error("❌ HTL Payment Error:", err.response?.data || err.message);
            return res.status(500).json({ status: "Error", message: "Gagal membuat kode pembayaran." });
        } finally {
            if (connection) connection.release();
        }
    },

    handleCallback: async (req, res) => {
        try {
            const { partner_reff, status, response_code } = req.body;
            console.log(`📥 [CALLBACK] Reff: ${partner_reff} | Status: ${status}`);

            if ((status === "SUCCESS" || status === "SETTLED") && response_code === "00") {
                // Update Payment
                const [payUpdate] = await db.query(
                    `UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?`,
                    [partner_reff]
                );

                if (payUpdate.affectedRows > 0) {
                    const [rows] = await db.query(`SELECT booking_id FROM hotel_payments WHERE payment_reff = ?`, [partner_reff]);
                    if (rows.length > 0) {
                        // Update Booking Utama
                        await db.query(`UPDATE hotel_bookings SET booking_status = 'Success' WHERE id = ?`, [rows[0].booking_id]);
                        console.log(`✅ Booking ${rows[0].booking_id} SUKSES`);
                    }
                } else {
                    console.warn(`⚠️ Record tidak ditemukan untuk Reff: ${partner_reff}`);
                }
            }
            return res.status(200).json({ status: "SUCCESS" });
        } catch (err) {
            return res.status(200).json({ status: "ERROR" });
        }
    },

    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            const [rows] = await db.query("SELECT payment_status FROM hotel_payments WHERE payment_reff = ?", [reff]);
            
            // Cek lokal dulu
            if (rows.length > 0) {
                const locStat = rows[0].payment_status.toUpperCase();
                if (locStat === 'SETTLED' || locStat === 'SUCCESS') return res.json({ status: 'SUCCESS' });
            }

            // Inquiry ke LinkQu
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const remStat = resp.data.status?.toUpperCase();
            if (remStat === 'SUCCESS' || remStat === 'SETTLED') {
                // Jika di LinkQu sukses tapi di lokal belum, update lokal segera
                await db.query(`UPDATE hotel_payments SET payment_status = 'SETTLED' WHERE payment_reff = ?`, [reff]);
                return res.json({ status: 'SUCCESS' });
            }

            res.json({ status: 'PENDING' });
        } catch (err) {
            res.json({ status: 'PENDING' });
        }
    }
};

module.exports = HotelPaymentController;