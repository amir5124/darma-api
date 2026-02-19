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
            booking_id, // Ini berisi numCode dari frontend (misal: "25171025")
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
        
        // 2. Cari Data Booking berdasarkan num_code (PENTING)
        const [rows] = await connection.query(
            "SELECT * FROM bookings_pelni WHERE num_code = ? ORDER BY id DESC LIMIT 1", 
            [booking_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Data booking kapal tidak ditemukan di database kami." });
        }
        const b = rows[0];

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

        // 5. UPDATE DATABASE (Update record yang ditemukan tadi)
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

        // 6. Template Email Profesional
        const subject = `[PELNI] Instruksi Pembayaran - ${b.num_code}`;
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
                <div style="background: #0054a6; color: white; padding: 20px; text-align: center;">
                    <h2 style="margin:0;">INSTRUKSI PEMBAYARAN</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Halo <b>${customer_name}</b>, silakan selesaikan pembayaran tiket kapal Anda:</p>
                    <table style="width: 100%; background: #f9f9f9; padding: 10px; border-radius: 5px;">
                        <tr><td>No. Booking</td><td>: <b>${b.num_code}</b></td></tr>
                        <tr><td>Kapal</td><td>: ${b.ship_name}</td></tr>
                        <tr><td>Rute</td><td>: ${b.origin_name} &rarr; ${b.destination_name}</td></tr>
                    </table>
                    <div style="text-align: center; margin-top: 20px; padding: 20px; border: 2px dashed #0054a6;">
                        <span style="font-size: 14px; color: #666;">Total Bayar:</span><br>
                        <strong style="font-size: 24px; color: #e03f7d;">Rp ${formatIDR(amount)}</strong><br><br>
                        ${method === 'VA' ? `
                            <p>Bank ${bankName} Virtual Account:</p>
                            <h1 style="letter-spacing: 2px; color: #0054a6;">${vaNumber}</h1>
                        ` : `
                            <p>Scan QRIS di bawah ini:</p>
                            <img src="${qrisImage}" style="width: 200px;" />
                        `}
                    </div>
                </div>
            </div>`;

        // Jalankan kirim email (Async)
        sendBookingEmail(customer_email, subject, emailHtml).catch(err => console.error("Email Error:", err));

        return res.json({ status: "Success", partner_reff, data: linkquData });

    } catch (err) {
        console.error("❌ Error:", err.message);
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