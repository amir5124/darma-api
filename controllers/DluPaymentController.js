const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');
// Import fungsi generate PDF Anda
// const { generateTicketPDF } = require('../utils/dluTicketHelper'); 

const config = {
    clientId: "5f5aa496-7e16-4ca1-9967-33c768dac6c7",
    clientSecret: "TM1rVhfaFm5YJxKruHo0nWMWC",
    username: "LI9019VKS",
    pin: "5m6uYAScSxQtCmU",
    serverKey: "QtwGEr997XDcmMb1Pq8S5X1N",
    baseUrl: 'https://api.linkqu.id/linkqu-partner'
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

const DluPaymentController = {

    createPayment: async (req, res) => {
        let connection;
        try {
            const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;

            // 1. Normalisasi Data
            const finalAmount = Math.round(Number(amount));
            const feeAdmin = Number(admin_fee_applied || 0);
            const finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
            const finalCustomerEmail = (customer_email || 'guest@mail.com').trim();

            // 2. Format Phone (+62)
            let formattedPhone = customer_phone ? customer_phone.toString().trim().replace(/[^0-9]/g, '') : '';
            if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);
            else if (!formattedPhone.startsWith('+')) formattedPhone = '+62' + formattedPhone;

            const partner_reff = `PAY-DLU-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/dlu-payments/callback";

            connection = await db.getConnection();

            // Ambil Data Booking DLU
            const [rows] = await connection.query("SELECT * FROM bookings_dlu WHERE id = ?", [booking_id]);
            if (rows.length === 0) return res.status(404).json({ error: "Data booking DLU tidak ditemukan" });
            const b = rows[0];

            // 3. Payload LinkQu
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
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', { ...commonData, bank_code });
            } else {
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

            console.log(`🚀 [DLU-PAY REQ] Reff: ${partner_reff} for Booking ID: ${booking_id}`);

            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;
            const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data?.va_number);
            const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data?.qr_url);

            if (!vaNumber && !qrisImage) throw new Error("Gagal mendapatkan instruksi pembayaran");

            // 4. Update Referensi Pembayaran di Tabel bookings_dlu
            const mysqlExpired = moment(expired, 'YYYYMMDDHHmmss').format('YYYY-MM-DD HH:mm:ss');
            await connection.query(
                `UPDATE bookings_dlu SET payment_ref = ?, status = 'PENDING_PAYMENT' WHERE id = ?`,
                [partner_reff, booking_id]
            );

            // Kita asumsikan tabel payment terpisah atau field tambahan di bookings_dlu
            // Di sini saya asumsikan Anda ingin menyimpan info bayar agar bisa di-polling
            
            console.log(`✅ [DLU-PAY RESP] Success generate ${method} for ${partner_reff}`);

            return res.json({
                status: "Success",
                partner_reff,
                payment_info: {
                    method,
                    va_number: vaNumber,
                    qris_url: qrisImage,
                    amount: finalAmount,
                    expired_at: moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss')
                }
            });

        } catch (err) {
            console.error("❌ DLU Payment Error:", err.response?.data || err.message);
            return res.status(500).json({ status: "Error", message: err.message });
        } finally {
            if (connection) connection.release();
        }
    },

    handleCallback: async (req, res) => {
        console.log("📥 [DLU CALLBACK] Incoming:", JSON.stringify(req.body, null, 2));
        try {
            const { partner_reff, status } = req.body;
            if (status?.toUpperCase() === "SUCCESS" || status?.toUpperCase() === "SETTLED") {
                
                // Cari booking berdasarkan payment_ref
                const [rows] = await db.query(`SELECT id, status FROM bookings_dlu WHERE payment_ref = ?`, [partner_reff]);
                
                if (rows.length > 0 && rows[0].status !== 'PAID') {
                    const bookingId = rows[0].id;
                    await db.query(`UPDATE bookings_dlu SET status = 'PAID' WHERE id = ?`, [bookingId]);
                    console.log(`✅ [DLU CALLBACK] Booking ID ${bookingId} marked as PAID.`);
                }
            }
            return res.json({ message: "OK" });
        } catch (err) {
            console.error("❌ [DLU CALLBACK ERROR]:", err.message);
            return res.status(500).json({ status: "ERROR" });
        }
    },

    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            // 1. Cek DB Lokal
            const [rows] = await db.query(
                `SELECT id, status, booking_number FROM bookings_dlu WHERE payment_ref = ?`, 
                [reff]
            );

            if (rows.length > 0) {
                const b = rows[0];
                if (['PAID', 'SUCCESS', 'SETTLED'].includes(b.status.toUpperCase())) {
                    return res.json({ status: 'SUCCESS', message: 'Pembayaran Lunas', booking_id: b.id });
                }
            }

            // 2. Tanya Vendor LinkQu
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const data = resp.data;
            const isSuccess = (data.status?.toUpperCase() === 'SUCCESS' || data.response_code === '00');

            if (isSuccess) {
                await db.query(`UPDATE bookings_dlu SET status = 'PAID' WHERE payment_ref = ?`, [reff]);
                return res.json({ status: 'SUCCESS', message: 'Pembayaran Berhasil' });
            }

            return res.json({ status: 'PENDING', message: 'Menunggu pembayaran' });

        } catch (err) {
            return res.json({ status: 'PENDING', error: err.message });
        }
    }
};

/**
 * Fungsi ini dipanggil setelah Frontend sukses Issued ke Darmawisata
 * (Sesuai diskusi sebelumnya)
 */
async function finalizeDluBooking(bookingId, resDataVendor, rawPaxes, serviceFee) {
    try {
        const [header] = await db.execute(
            `UPDATE bookings_dlu SET 
                num_code = ?, 
                status = 'SUCCESS', 
                raw_response = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [resDataVendor.numCode, JSON.stringify(resDataVendor), bookingId]
        );

        if (resDataVendor.paxBookingDetails?.length > 0) {
            const paxValues = resDataVendor.paxBookingDetails.map((pax, index) => [
                bookingId, pax.paxName, pax.paxType, pax.ID, pax.paxGender || '-',
                pax.ticketNumber, pax.ticketQRCode, pax.fare, pax.admin, 
                (rawPaxes && rawPaxes[index] ? rawPaxes[index].note : null)
            ]);

            await db.query(
                `INSERT INTO booking_pax_details_dlu 
                (booking_id, pax_name, pax_type, id_number, gender, ticket_number, ticket_qr_code, fare, admin_vendor, pax_note) 
                VALUES ?`, [paxValues]
            );
        }

        // Kirim Email E-Tiket
        await sendEmailDlu(bookingId, resDataVendor, serviceFee);
        
    } catch (error) {
        console.error("❌ Finalize Error:", error.message);
    }
}

module.exports = DluPaymentController;