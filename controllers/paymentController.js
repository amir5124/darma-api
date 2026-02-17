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
    baseUrl: 'https://gateway-dev.linkqu.id' // Perhatikan perubahan URL ini
};

function generateSignature(path, method, data) {
    // Pastikan data yang masuk ke join tidak undefined
    const values = Object.values(data).map(v => v === undefined ? "" : v);
    const rawValue = values.join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
    
    return crypto.createHmac("sha256", config.serverKey)
                 .update(path + method + cleaned)
                 .digest("hex");
}

const PaymentController = {
    
createPayment: async (req, res) => {
    let connection;
    try {
        const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;
        
        const feeAdmin = Number(admin_fee_applied || 0);

        // 1. Perbaikan Nomor Telepon
        let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
        formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);
        else if (formattedPhone.startsWith('8')) formattedPhone = '+62' + formattedPhone;
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+62' + formattedPhone;

        // 2. Mapping Nama Bank
        const bankMap = {
            "002": "BRI", "008": "MANDIRI", "009": "BNI", "200": "BTN", "014": "BCA",
            "013": "PERMATA", "022": "CIMB", "441": "DANAMON", "011": "DANAMON",
            "016": "MAYBANK", "422": "BRI SYARIAH", "451": "BSI"
        };
        const bankName = bankMap[bank_code] || bank_code;
        const partner_reff = `PAY-${Date.now()}`;
        const expired = moment.tz('Asia/Jakarta').add(30, 'minutes').format('YYYYMMDDHHmmss');
        
        // PASTIKAN URL CALLBACK VALID
        const url_callback = "https://darma.siappgo.id/api/callback";

        connection = await db.getConnection();
        
        const [rows] = await connection.query("SELECT * FROM bookings WHERE id = ?", [booking_id]);
        if (rows.length === 0) return res.status(404).json({ error: "Data booking tidak ditemukan" });
        const b = rows[0];

        // 3. Persiapan Payload
        const commonData = {
            amount, expired, partner_reff,
            customer_id: formattedPhone, 
            customer_name: customer_name || 'Customer', 
            customer_email
        };

        let endpoint = '';
        let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

        if (method === 'VA') {
            endpoint = '/transaction/create/va';
            payloadLinkQu.bank_code = bank_code; 
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', {
                amount, expired, bank_code, partner_reff, customer_id: formattedPhone, customer_name, customer_email
            });
        } else {
            endpoint = '/transaction/create/qris';
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
        }

        // --- DEBUGGING URL ---
        const fullUrl = `${config.baseUrl}${endpoint}`.trim();
        console.log("🔗 Requesting to:", fullUrl);

        // 4. Request ke LinkQu dengan Timeout & Error Handling lebih ketat
        const resp = await axios.post(fullUrl, payloadLinkQu, {
            headers: { 
                'client-id': config.clientId, 
                'client-secret': config.clientSecret,
                'Content-Type': 'application/json' 
            },
            timeout: 10000 // 10 detik
        });

        const linkquData = resp.data;
        const vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data?.va_number) || null;
        const qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data?.imageqris) || null;

        // 5. UPDATE DATABASE
        await connection.query(
            `UPDATE bookings SET pengguna = ?, payment_reff = ?, payment_method = ?, va_number = ?, qris_url = ?, admin_fee = ? WHERE id = ?`,
            [customer_name, partner_reff, method === 'VA' ? `VA-${bankName}` : 'QRIS', vaNumber, qrisImage, feeAdmin, booking_id]
        );

        // 6. LOGIKA EMAIL (Matikan jika Sandbox, nyalakan jika sudah beres)
        // const subject = `[LinkU] Instruksi Pembayaran - ${b.booking_code}`;
        // sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("Email Error:", e));

        return res.json({ status: "Success", partner_reff, data: linkquData });

    } catch (err) {
        // CEK DETAIL ERROR DI SINI
        if (err.code === 'ENOENT') {
            console.error("❌ System Error (File Not Found):", err.path);
        } else {
            console.error("❌ Create Error Detail:", err.response?.data || err.message);
        }
        return res.status(500).json({ error: err.message });
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
            },
            // TAMBAHKAN INI: Agar Axios tidak throw error jika status 4xx atau 5xx
            validateStatus: function (status) {
                return status < 500; // Hanya throw error jika benar-benar error server (500+)
            }
        });

        // Kirim data apa adanya ke frontend
        return res.json(resp.data);

    } catch (err) {
        // Jika terjadi error (misal timeout atau server LinkQu down)
        console.error("❌ LinkQu Polling Error:", err.message);
        
        // JANGAN kirim 500 jika hanya data tidak ketemu
        // Kirim status PENDING agar frontend tetap jalan
        return res.status(200).json({ 
            status: 'PENDING', 
            respMessage: 'Sedang menunggu pembayaran atau data belum tersedia' 
        });
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
            const { partner_reff, status } = req.body;

            if (status === "SUCCESS") {
                // Cari booking berdasarkan payment_reff
                const [rows] = await db.query(
                    "SELECT id, booking_code, pengguna FROM bookings WHERE payment_reff = ?", 
                    [partner_reff]
                );

                if (rows.length > 0) {
                    const booking = rows[0];
                    
                    // Update status di database agar UI Frontend berubah
                    await db.query(
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