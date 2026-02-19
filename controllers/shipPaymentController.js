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
 * Helper untuk Signature LinkQu
 */
function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
    return crypto.createHmac("sha256", config.serverKey)
                 .update(path + method + cleaned)
                 .digest("hex");
}

const ShipPaymentController = {
    
    /**
     * 1. Membuat Pembayaran (VA atau QRIS)
     */
    createShipPayment: async (req, res) => {
        let connection;
        try {
            const { 
                booking_id, amount, customer_name, customer_phone, 
                customer_email, method, bank_code, admin_fee_applied 
            } = req.body;
            
            const feeAdmin = Number(admin_fee_applied || 0);

            // Format Phone ke Standar Internasional
            let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
            formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);

            const bankMap = { "002": "BRI", "008": "MANDIRI", "009": "BNI", "014": "BCA", "451": "BSI", "013": "PERMATA" };
            const bankName = bankMap[bank_code] || bank_code;
            const partner_reff = `SHIP-PAY-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(60, 'minutes').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/ship/callback";

            connection = await db.getConnection();
            
            // Ambil data booking & penumpang
            const [rows] = await connection.query(
                `SELECT b.*, p.pax_name, p.pax_type, p.deck, p.cabin, p.bed, p.id_number 
                 FROM bookings_pelni b
                 LEFT JOIN booking_passengers_pelni p ON b.id = p.booking_id
                 WHERE b.num_code = ? 
                 ORDER BY b.id DESC`, [booking_id]
            );
            
            if (rows.length === 0) return res.status(404).json({ error: "Data booking tidak ditemukan." });

            const b = rows[0];
            const commonData = { amount, expired, partner_reff, customer_id: formattedPhone, customer_name, customer_email };
            let endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
            
            let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

            if (method === 'VA') {
                payloadLinkQu.bank_code = bank_code;
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', { ...commonData, bank_code });
            } else {
                payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

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

            // Update Database
            await connection.query(
                `UPDATE bookings_pelni SET payment_reff = ?, payment_method = ?, va_number = ?, qris_url = ?, admin_fee = ? WHERE id = ?`,
                [partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, b.id]
            );

            // Kirim Email Instruksi
            const subject = `[PELNI] Instruksi Pembayaran - ${b.num_code}`;
            const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
            const daftarPenumpangHtml = rows.map(row => `
                <div style="border-bottom: 1px solid #eee; padding: 8px 0;">
                    <span style="display:block; font-weight:bold; color:#333;">${row.pax_name} (${row.pax_type})</span>
                    <span style="font-size:12px; color:#666;">
                        NIK: ${row.id_number || '-'} | Deck: ${row.deck || '-'} | Cabin: ${row.cabin || '-'} | Bed: ${row.bed || '-'}
                    </span>
                </div>`).join('');

            const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
                <div style="background: #0054a6; color: white; padding: 20px; text-align: center;"><h2 style="margin:0;">INSTRUKSI PEMBAYARAN</h2></div>
                <div style="padding: 20px;">
                    <p>Halo <b>${customer_name}</b>, silakan selesaikan pembayaran Anda.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
                        No. Booking: <b>${b.num_code}</b><br>Rute: ${b.origin_name} &rarr; ${b.destination_name}
                    </div>
                    <div style="margin-top: 20px;">${daftarPenumpangHtml}</div>
                    <div style="text-align: center; margin-top: 20px; padding: 20px; border: 2px dashed #0054a6; background: #fffcf2;">
                        Total: <strong style="font-size: 24px; color: #e03f7d;">Rp ${formatIDR(amount)}</strong><br>
                        ${method === 'VA' ? `VA ${bankName}: <h1>${vaNumber}</h1>` : `<img src="${qrisImage}" width="200" />`}
                        <p style="color:red;">Batas: ${moment(expired, 'YYYYMMDDHHmmss').format('DD MMM, HH:mm')} WIB</p>
                    </div>
                </div>
            </div>`;

            sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("Email Error:", e));

            return res.json({ status: "Success", partner_reff, data: linkquData });

        } catch (err) {
            console.error("❌ Error createShipPayment:", err.message);
            return res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * 2. Cek Status Pembayaran (Polling)
     */
    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            const [rows] = await db.query(
                "SELECT payment_status, num_code FROM bookings_pelni WHERE payment_reff = ?", [reff]
            );

            if (rows.length > 0 && rows[0].payment_status === 'SUCCESS') {
                return res.json({ status: 'SUCCESS', numCode: rows[0].num_code });
            }

            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret },
                validateStatus: (s) => s < 500
            });

            const statusVendor = resp.data.status;
            if (statusVendor === 'SUCCESS' || statusVendor === 'SETTLED') {
                await db.query("UPDATE bookings_pelni SET payment_status = 'SUCCESS' WHERE payment_reff = ?", [reff]);
                return res.json({ status: 'SUCCESS' });
            }

            return res.json({ status: statusVendor || 'PENDING' });
        } catch (err) {
            return res.json({ status: 'PENDING' });
        }
    },

    /**
     * 3. Download Gambar QR (QRIS atau Tiket)
     */
    downloadShipQR: async (req, res) => {
        try {
            const { num_code, type } = req.query;
            const [rows] = await db.query(
                `SELECT b.qris_url, p.ticket_qrcode FROM bookings_pelni b
                 LEFT JOIN booking_passengers_pelni p ON b.id = p.booking_id
                 WHERE b.num_code = ? LIMIT 1`, [num_code]
            );

            if (rows.length === 0) return res.status(404).send("Data tidak ditemukan.");

            const targetUrl = type === 'TICKET' ? rows[0].ticket_qrcode : rows[0].qris_url;
            if (!targetUrl) return res.status(404).send("Gambar tidak tersedia.");

            const response = await axios({ url: targetUrl, method: 'GET', responseType: 'stream' });
            res.setHeader('Content-disposition', `attachment; filename=QR-${num_code}.png`);
            res.setHeader('Content-type', 'image/png');
            return response.data.pipe(res);
        } catch (err) {
            return res.status(500).send("Gagal mengunduh gambar.");
        }
    },

    /**
     * 4. Handler Callback LinkQu
     */
    handleShipCallback: async (req, res) => {
        try {
            const { partner_reff, status } = req.body;
            if (status === "SUCCESS" || status === "SETTLED") {
                await db.query(
                    "UPDATE bookings_pelni SET payment_status = 'SUCCESS' WHERE payment_reff = ?", [partner_reff]
                );
            }
            return res.json({ message: "OK" });
        } catch (err) {
            return res.status(500).json({ status: "ERROR", message: err.message });
        }
    }
};

module.exports = ShipPaymentController;