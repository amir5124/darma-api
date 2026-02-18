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
            const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;
            
            const feeAdmin = Number(admin_fee_applied || 0);

            // 1. Format Phone
            let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
            formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);

            const bankMap = { "002": "BRI", "008": "MANDIRI", "009": "BNI", "014": "BCA", "451": "BSI" };
            const bankName = bankMap[bank_code] || bank_code;
            const partner_reff = `SHIP-PAY-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(60, 'minutes').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/ship/callback"; // Endpoint callback khusus kapal

            connection = await db.getConnection();
            
            // A. Ambil Data Booking Pelni
            const [rows] = await connection.query("SELECT * FROM bookings_pelni WHERE id = ?", [booking_id]);
            if (rows.length === 0) return res.status(404).json({ error: "Data booking kapal tidak ditemukan" });
            const b = rows[0];

            // B. Payload LinkQu
            const commonData = { amount, expired, partner_reff, customer_id: formattedPhone, customer_name, customer_email };
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

            // C. Request ke LinkQu
            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;
            const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data?.va_number);
            const qrisImage = linkquData.imageqris || linkquData.qr_url;

            // D. UPDATE DATABASE (Tabel bookings_pelni)
            await connection.query(
                `UPDATE bookings_pelni SET 
                    payment_reff = ?, 
                    payment_method = ?, 
                    va_number = ?, 
                    qris_url = ?,
                    admin_fee = ?
                 WHERE id = ?`,
                [partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, booking_id]
            );

            // E. Kirim Email Instruksi Pembayaran Kapal
            const subject = `[PELNI] Instruksi Pembayaran - ${b.booking_code}`;
            const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);

            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd;">
                <div style="background: #0054a6; color: white; padding: 20px; text-align: center;">
                    <h2>PEMBAYARAN TIKET PELNI</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Halo <b>${customer_name}</b>, silakan selesaikan pembayaran tiket kapal Anda:</p>
                    <table style="width: 100%; margin-bottom: 20px;">
                        <tr><td>Kode Booking</td><td><b>: ${b.booking_code}</b></td></tr>
                        <tr><td>Kapal</td><td>: ${b.ship_name}</td></tr>
                        <tr><td>Rute</td><td>: ${b.origin_name} → ${b.destination_name}</td></tr>
                        <tr><td>Berangkat</td><td>: ${moment(b.depart_date).format('DD MMM YYYY HH:mm')}</td></tr>
                    </table>

                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; text-align: center;">
                        <p style="margin:0;">Total Pembayaran:</p>
                        <h2 style="color: #e03f7d; margin: 5px 0;">Rp ${formatIDR(amount)}</h2>
                        ${method === 'VA' ? `
                            <p>Bank ${bankName} Virtual Account:</p>
                            <h1 style="letter-spacing: 2px;">${vaNumber}</h1>
                        ` : `
                            <p>Scan QRIS di bawah ini:</p>
                            <img src="${qrisImage}" style="width: 200px;" />
                        `}
                    </div>
                </div>
            </div>`;

            sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("Email Error:", e));

            return res.json({ status: "Success", partner_reff, data: linkquData });

        } catch (err) {
            console.error("❌ Ship Payment Error:", err.message);
            return res.status(500).json({ error: err.message });
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