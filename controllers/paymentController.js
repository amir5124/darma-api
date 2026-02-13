const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const mysql = require('mysql2/promise');

// Database Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const config = {
    clientId: process.env.LINKQU_CLIENT_ID,
    clientSecret: process.env.LINKQU_CLIENT_SECRET,
    username: process.env.LINKQU_USERNAME,
    pin: process.env.LINKQU_PIN,
    serverKey: process.env.LINKQU_SERVER_KEY,
    baseUrl: 'https://api.linkqu.id/linkqu-partner'
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
    
    // 1. CREATE PAYMENT (QRIS / VA) & SYNC TO DB
    createPayment: async (req, res) => {
        let connection;
        try {
            const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code } = req.body;
            
            const partner_reff = `PAY-${Date.now()}`;
            const expired = moment.tz('Asia/Jakarta').add(30, 'minutes').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/callback";

            // A. Koneksi Database & Update Booking awal
            connection = await pool.getConnection();
            const [check] = await connection.query("SELECT id FROM bookings WHERE id = ?", [booking_id]);
            
            if (check.length === 0) {
                return res.status(404).json({ error: "Data booking tidak ditemukan" });
            }

            // Update info pembayaran ke tabel bookings
            await connection.query(
                "UPDATE bookings SET payment_reff = ?, payment_method = ? WHERE id = ?",
                [partner_reff, method === 'VA' ? `VA-${bank_code}` : 'QRIS', booking_id]
            );

            // B. Persiapan Payload LinkQu
            const commonData = {
                amount,
                expired,
                partner_reff,
                customer_id: customer_phone,
                customer_name,
                customer_email
            };

            let endpoint = '';
            let payload = { 
                ...commonData, 
                username: config.username, 
                pin: config.pin, 
                url_callback 
            };

            if (method === 'VA') {
                endpoint = '/transaction/create/va';
                payload.bank_code = bank_code; 
                payload.signature = generateSignature(endpoint, 'POST', {
                    amount, expired, bank_code, partner_reff, customer_id: payload.customer_id, customer_name, customer_email
                });
            } else {
                endpoint = '/transaction/create/qris';
                payload.signature = generateSignature(endpoint, 'POST', commonData);
            }

            // C. Request ke LinkQu
            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payload, {
                headers: { 
                    'client-id': config.clientId, 
                    'client-secret': config.clientSecret 
                }
            });

            return res.json({ 
                status: "Success", 
                partner_reff, 
                data: resp.data 
            });

        } catch (err) {
            console.error("Create Error:", err.response?.data || err.message);
            return res.status(500).json({ error: err.response?.data || err.message });
        } finally {
            if (connection) connection.release();
        }
    },

    // 2. CHECK PAYMENT STATUS
    checkStatus: async (req, res) => {
        try {
            const { reff } = req.params;
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params: { 
                    partner_reff: reff, 
                    username: config.username, 
                    pin: config.pin 
                },
                headers: { 
                    'client-id': config.clientId, 
                    'client-secret': config.clientSecret 
                }
            });
            return res.json(resp.data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
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

    // 4. CALLBACK HANDLER (SINKRONISASI STATUS LUNAS)
    handleCallback: async (req, res) => {
        try {
            const { partner_reff, status, amount } = req.body;

            if (status === "SUCCESS") {
                // Cari booking berdasarkan payment_reff (link penghubung)
                const [rows] = await pool.query(
                    "SELECT id, booking_code, pengguna FROM bookings WHERE payment_reff = ?", 
                    [partner_reff]
                );

                if (rows.length > 0) {
                    const booking = rows[0];
                    
                    // Update status di database agar UI Frontend berubah
                    await pool.query(
                        "UPDATE bookings SET ticket_status = 'TICKETED' WHERE id = ?",
                        [booking.id]
                    );

                    console.log(`✅ LUNAS: Reff ${partner_reff} | Booking ${booking.booking_code} | User ${booking.pengguna}`);
                }
            }
            
            // LinkQu mewajibkan balasan JSON/Text OK agar tidak retry
            return res.json({ message: "OK" });

        } catch (err) {
            console.error("Callback Error:", err.message);
            return res.status(500).send("Internal Server Error");
        }
    }
};

module.exports = PaymentController;