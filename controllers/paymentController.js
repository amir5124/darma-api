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
        const { booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied } = req.body;
        
        const feeAdmin = Number(admin_fee_applied || 0);

        // 1. Logika Perbaikan Nomor Telepon (Konsisten +62)
        let formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
        formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');

        if (formattedPhone.startsWith('0')) {
            formattedPhone = '+62' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('8')) {
            formattedPhone = '+62' + formattedPhone;
        } else if (formattedPhone.startsWith('62') && !formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+62' + formattedPhone;
        }

        // 2. Mapping Nama Bank
        const bankMap = {
            "002": "BRI", "008": "MANDIRI", "009": "BNI", "200": "BTN", "014": "BCA",
            "013": "PERMATA", "022": "CIMB", "441": "DANAMON", "011": "DANAMON",
            "016": "MAYBANK", "422": "BRI SYARIAH", "451": "BSI (BANK SYARIAH INDONESIA)"
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

        // B. Persiapan Payload LinkQu
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
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', payloadLinkQu);
        } else {
            endpoint = '/transaction/create/qris';
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
        }

        // C. Request ke LinkQu
        const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
            headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
        });

        const linkquData = resp.data;
        
        // DEBUG: Aktifkan ini di console jika VA masih null untuk melihat struktur asli API
        // console.log("LINKQU_DEBUG_RESP:", JSON.stringify(linkquData, null, 2));

        // --- FIX VA NULL: Pengecekan Bertingkat Super Agresif ---
        const vaNumber = linkquData.virtual_account || 
                         linkquData.va_number || 
                         linkquData.va_code || 
                         linkquData.bill_no ||
                         linkquData.data?.virtual_account || 
                         linkquData.data?.va_number || 
                         linkquData.data?.va_code || 
                         linkquData.data?.bill_no ||
                         null;

        const qrisImage = linkquData.imageqris || 
                          linkquData.qr_url || 
                          linkquData.data?.imageqris || 
                          linkquData.data?.qr_url || 
                          linkquData.data?.qr_data ||
                          null;

        // D. UPDATE DATABASE (Memasukkan va_number & admin_fee ke kolom yang tepat)
        await connection.query(
            `UPDATE bookings SET 
                pengguna = ?, 
                payment_reff = ?, 
                payment_method = ?, 
                va_number = ?, 
                qris_url = ?,
                admin_fee = ?
             WHERE id = ?`,
            [
                customer_name, 
                partner_reff, 
                method === 'VA' ? `VA-${bankName}` : 'QRIS', 
                vaNumber, 
                qrisImage, 
                feeAdmin, 
                booking_id
            ]
        );

        // E. LOGIKA PENGIRIMAN EMAIL
        const subject = `[LinkU] Instruksi Pembayaran - ${b.booking_code}`;
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
        
        let passengers = [];
        try { 
            // FIX PARSE: Mencegah error "[object Object]"
            const raw = b.raw_response;
            const parsedResponse = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            passengers = (parsedResponse && parsedResponse.paxDetails) ? parsedResponse.paxDetails : []; 
        } catch(e) { console.error("Parse error:", e); }

        const hargaAsli = Number(b.total_price || 0);
        const diskonMurni = (amount - feeAdmin) - hargaAsli;

        const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 700px; margin: auto; border: 1px solid #eee;">
            <div style="background-color: #24b3ae; padding: 10px; color: white; font-weight: bold;">Instruksi Pembayaran</div>
            <div style="padding: 20px;">
                <p>Silakan lakukan pembayaran sesuai rincian di bawah ini untuk menerbitkan tiket Anda.</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                    <tr><td style="width: 30%; padding: 5px 0;">Kode Booking</td><td style="font-weight:bold;">: ${b.booking_code}</td></tr>
                    <tr><td style="padding: 5px 0;">Nama Kontak</td><td>: ${customer_name}</td></tr>
                    ${passengers.map((pax) => `<tr><td style="padding: 5px 0;">Nama Penumpang</td><td>: ${pax.title || ''} ${pax.firstName} ${pax.lastName}</td></tr>`).join('')}
                    <tr><td style="padding: 5px 0;">Telepon</td><td>: ${formattedPhone}</td></tr>
                    <tr><td style="padding: 5px 0;">Time Limit</td><td style="color: #e03f7d; font-weight: bold;">: ${moment(b.time_limit).format('dddd, DD MMM YYYY HH:mm')} WIB</td></tr>
                </table>

                <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold;">Rincian Pembayaran</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 15px 0;">
                    ${method === 'VA' ? `
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">No. Rekening (VA)</td><td style="text-align:right; border-bottom: 1px solid #eee; font-weight:bold; font-size:16px;">${vaNumber || 'Sedang diproses'}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Bank</td><td style="text-align:right; border-bottom: 1px solid #eee;">${bankName}</td></tr>
                    ` : `
                    <tr><td colspan="2" style="text-align:center; padding: 15px;">
                        <p>Scan QRIS berikut:</p>
                        <img src="${qrisImage}" style="max-width:200px; border:1px solid #ddd;" />
                    </td></tr>
                    `}
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Harga Tiket</td><td style="text-align:right; border-bottom: 1px solid #eee;">Rp ${formatIDR(hargaAsli)}</td></tr>
                    ${diskonMurni !== 0 ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: green;">Potongan Harga</td><td style="text-align:right; border-bottom: 1px solid #eee; color: green;">- Rp ${formatIDR(Math.abs(diskonMurni))}</td></tr>` : ''}
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Biaya Admin ${method}</td><td style="text-align:right; border-bottom: 1px solid #eee;">+ Rp ${formatIDR(feeAdmin)}</td></tr>
                    <tr style="color: #e03f7d; font-weight: bold; font-size: 16px;">
                        <td style="padding: 15px 0;">Total Pembayaran</td>
                        <td style="text-align:right; padding: 15px 0;">Rp ${formatIDR(amount)}</td>
                    </tr>
                </table>

                <div style="background: #fdfae2; padding: 10px; border: 1px solid #e6db55; font-size: 12px;">
                    <b>Data Perjalanan:</b> ${b.airline_name} | ${b.origin} → ${b.destination} | ${moment(b.depart_date).format('DD MMM YYYY')}
                </div>

                <p style="text-align:center; font-style: italic; color: #e03f7d; margin-top: 20px;">*Pastikan Anda transfer sesuai dengan nominal di atas agar tiket terbit otomatis!</p>
            </div>
        </div>`;

        sendBookingEmail(customer_email, subject, emailHtml).catch(e => console.error("Email Error:", e));

        console.log(`✅ Payment Success: ${partner_reff} | VA: ${vaNumber} | Saved to DB`);
        return res.json({ status: "Success", partner_reff, va_number: vaNumber, data: linkquData });

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