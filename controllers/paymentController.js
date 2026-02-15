const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db'); 
const { sendBookingEmail } = require('../utils/mailer'); 

const config = {
    clientId: "5f5aa496-7e16-4ca1-9967-33c768dac6c7",
    clientSecret: "TM1rVhfaFm5YJxKruHo0nWMWC",
    username: "LI9019VKS",
    pin: "5m6uYAScSxQtCmU",
    serverKey: "QtwGEr997XDcmMb1Pq8S5X1N",
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
    
  createPayment: async (req, res) => {
    let connection;
    try {
        const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code } = req.body;
        
        // 1. Logika Perbaikan Nomor Telepon (Tambah +62 jika mulai dari 8 atau 08)
        let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '+62' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('8')) {
            formattedPhone = '+62' + formattedPhone;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+62' + formattedPhone;
        }

        // 2. Array JSON untuk Mapping Kode Bank ke Nama Bank
        const bankMap = {
            "002": "BRI",
            "008": "MANDIRI",
            "009": "BNI",
            "200": "BTN",
            "014": "BCA",
            "013": "PERMATA",
            "022": "CIMB",
            "441": "DANAMON",
            "011": "DANAMON",
            "016": "MAYBANK",
            "422": "BRI SYARIAH",
            "451": "BSI (BANK SYARIAH INDONESIA)"
        };

        const bankName = bankMap[bank_code] || bank_code;
        const partner_reff = `PAY-${Date.now()}`;
        const expired = moment.tz('Asia/Jakarta').add(30, 'minutes').format('YYYYMMDDHHmmss');
        const url_callback = "https://darma.siappgo.id/api/callback";

        connection = await db.getConnection();
        
        // A. Ambil Data Booking
        const [rows] = await connection.query("SELECT * FROM bookings WHERE id = ?", [booking_id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Data booking tidak ditemukan" });
        }
        const b = rows[0];

        // B. Persiapan Payload LinkQu (Menggunakan formattedPhone)
        const commonData = {
            amount,
            expired,
            partner_reff,
            customer_id: formattedPhone, 
            customer_name: customer_name || 'Customer', // Menghindari nama kosong
            customer_email
        };

        let endpoint = '';
        let payloadLinkQu = { ...commonData, username: config.username, pin: config.pin, url_callback };

        if (method === 'VA') {
            endpoint = '/transaction/create/va';
            payloadLinkQu.bank_code = bank_code; 
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', {
                amount, expired, bank_code, partner_reff, customer_id: payloadLinkQu.customer_id, customer_name, customer_email
            });
        } else {
            endpoint = '/transaction/create/qris';
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
        }

        // C. Request ke LinkQu
        const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
            headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
        });

        const linkquData = resp.data;
        const vaNumber = linkquData.virtual_account || linkquData.va_number || null;
        const qrisImage = linkquData.imageqris || linkquData.qr_url || null;

        // D. UPDATE DATABASE (Update Nama Pengguna agar tidak "Guest" lagi)
        await connection.query(
            `UPDATE bookings SET 
                pengguna = ?, 
                payment_reff = ?, 
                payment_method = ?, 
                va_number = ?, 
                qris_url = ? 
             WHERE id = ?`,
            [
                customer_name, // Mengupdate kolom pengguna dengan nama asli dari form payment
                partner_reff, 
                method === 'VA' ? `VA-${bankName}` : 'QRIS', 
                vaNumber, 
                qrisImage, 
                booking_id
            ]
        );

        // E. LOGIKA PENGIRIMAN EMAIL
        const subject = `[LinkU] Instruksi Pembayaran - ${b.booking_code}`;
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
        
        let passengers = [];
        try { 
            const parsedResponse = JSON.parse(b.raw_response);
            passengers = parsedResponse.paxDetails || []; 
        } catch(e) { console.error("Parse error:", e); }

        const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 700px; margin: auto; border: 1px solid #eee;">
            <div style="background-color: #24b3ae; padding: 10px; color: white; font-weight: bold;">Instruksi Pembayaran</div>
            <div style="padding: 20px;">
                <p>Silakan lakukan pembayaran sesuai rincian di bawah ini untuk menerbitkan tiket Anda.</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                    <tr><td style="width: 30%; padding: 5px 0;">Kode Booking</td><td style="font-weight:bold;">: ${b.booking_code}</td></tr>
                    
                    <tr><td style="padding: 5px 0;">Nama Kontak</td><td>: ${customer_name}</td></tr>
                    
                    ${passengers.map((pax) => `
                    <tr>
                        <td style="padding: 5px 0;">Nama</td>
                        <td style="padding: 5px 0;">: ${pax.firstName} ${pax.lastName}</td>
                    </tr>
                    `).join('')}

                    <tr><td style="padding: 5px 0;">Telepon</td><td>: ${formattedPhone}</td></tr>
                    <tr><td style="padding: 5px 0;">Time Limit</td><td style="color: #e03f7d; font-weight: bold;">: ${moment(b.time_limit).format('dddd, DD MMM YYYY HH:mm')} WIB</td></tr>
                </table>

                <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold;">Rincian Pembayaran</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 15px 0;">
                    ${method === 'VA' ? `
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">No. Rekening (VA)</td><td style="text-align:right; border-bottom: 1px solid #eee; font-weight:bold; font-size:16px;">${vaNumber}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Bank</td><td style="text-align:right; border-bottom: 1px solid #eee;">${bankName}</td></tr>
                    ` : `
                    <tr><td colspan="2" style="text-align:center; padding: 15px;">
                        <p>Scan QRIS berikut:</p>
                        <img src="${qrisImage}" style="max-width:200px; border:1px solid #ddd;" />
                    </td></tr>
                    `}
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Harga Tiket</td><td style="text-align:right; border-bottom: 1px solid #eee;">Rp ${formatIDR(b.total_price)}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Biaya Layanan</td><td style="text-align:right; border-bottom: 1px solid #eee;">Rp ${formatIDR(amount - b.total_price)}</td></tr>
                    <tr style="color: #e03f7d; font-weight: bold; font-size: 16px;">
                        <td style="padding: 15px 0;">Nominal Pembayaran</td>
                        <td style="text-align:right; padding: 15px 0;">Rp ${formatIDR(amount)}</td>
                    </tr>
                </table>

                <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold;">Data Perjalanan</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top:10px;">
                    <tr style="background: #fdfae2;">
                        <td style="padding: 10px;"><b>${b.airline_name}</b></td>
                        <td style="padding: 10px;">${b.origin} → ${b.destination}</td>
                        <td style="padding: 10px; text-align:right;">${moment(b.depart_date).format('DD MMM YYYY')}</td>
                    </tr>
                </table>

                <p style="text-align:center; font-style: italic; color: #e03f7d; margin-top: 20px;">*Pastikan Anda transfer sesuai dengan nominal di atas!</p>
            </div>
        </div>`;

        sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("Email Error:", e));

        return res.json({ status: "Success", partner_reff, data: linkquData });

    } catch (err) {
        console.error("❌ Create Error:", err.response?.data || err.message);
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