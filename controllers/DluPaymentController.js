const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');
const { generateTicketPDF } = require('../utils/dluTicketHelper');

const config = {
    clientId: "5f5aa496-7e16-4ca1-9967-33c768dac6c7",
    clientSecret: "TM1rVhfaFm5YJxKruHo0nWMWC",
    username: "LI9019VKS",
    pin: "5m6uYAScSxQtCmU",
    serverKey: "QtwGEr997XDcmMb1Pq8S5X1N",
    baseUrl: 'https://api.linkqu.id/linkqu-partner'
};

function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + config.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
    return crypto.createHmac("sha256", config.serverKey)
        .update(path + method + cleaned)
        .digest("hex");
}

const DluPaymentController = {

    // =====================================================
    // POST /api/dlu-payments/create
    // Dipanggil frontend setelah draft berhasil dibuat
    // =====================================================
    createPayment: async (req, res) => {
        let connection;
        try {
            const {
                booking_id,         // ← ID integer dari tabel bookings_dlu (hasil draft)
                amount,
                customer_name,
                customer_phone,
                customer_email,
                method,             // 'QRIS' | 'VA'
                bank_code,          // '014' | '002' | '009' (hanya jika VA)
                admin_fee_applied
            } = req.body;

            if (!booking_id) {
                return res.status(400).json({ status: "ERROR", message: "booking_id wajib diisi" });
            }

            // 1. Validasi booking ada di DB
            connection = await db.getConnection();
            const [rows] = await connection.query(
                "SELECT * FROM bookings_dlu WHERE id = ?", [booking_id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ status: "ERROR", message: "Data booking tidak ditemukan" });
            }

            // 2. Normalisasi data
            const finalAmount      = Math.round(Number(amount));
            const finalCustomerName  = (customer_name || 'Customer').substring(0, 30).trim();
            const finalCustomerEmail = (customer_email || 'guest@mail.com').trim();

            let formattedPhone = (customer_phone || '').toString().trim().replace(/[^0-9]/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);
            else if (!formattedPhone.startsWith('+')) formattedPhone = '+62' + formattedPhone;

            // 3. Generate referensi unik & expired
            const partner_reff = `PAY-DLU-${Date.now()}`;
            const expired      = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            const url_callback = "https://darma.siappgo.id/api/dlu-payments/callback";

            // 4. Susun payload LinkQu
            const commonData = {
                amount:         finalAmount,
                expired,
                partner_reff,
                customer_id:    formattedPhone,
                customer_name:  finalCustomerName,
                customer_email: finalCustomerEmail
            };

            const endpoint    = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
            let payloadLinkQu = {
                ...commonData,
                username:     config.username,
                pin:          config.pin,
                url_callback
            };

            if (method === 'VA') {
                payloadLinkQu.bank_code  = bank_code;
                payloadLinkQu.signature  = generateSignature(endpoint, 'POST', { ...commonData, bank_code });
            } else {
                payloadLinkQu.signature  = generateSignature(endpoint, 'POST', commonData);
            }

            console.log(`🚀 [DLU-PAY] Reff: ${partner_reff} | Booking ID: ${booking_id} | Method: ${method}`);

            // 5. Hit LinkQu
            const resp = await axios.post(`${config.baseUrl}${endpoint}`, payloadLinkQu, {
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const linkquData = resp.data;

            // 6. Ekstrak VA / QRIS — handle berbagai format response LinkQu
            const vaNumber  = linkquData.virtual_account
                           || linkquData.va_number
                           || linkquData.data?.va_number
                           || null;

            const qrisImage = linkquData.imageqris
                           || linkquData.qr_url
                           || linkquData.data?.qr_url
                           || linkquData.data?.imageqris
                           || null;

            if (method === 'VA' && !vaNumber) {
                throw new Error("Gagal mendapatkan nomor Virtual Account dari LinkQu");
            }
            if (method === 'QRIS' && !qrisImage) {
                throw new Error("Gagal mendapatkan QR Code dari LinkQu");
            }

            // 7. Simpan payment_ref ke DB agar bisa di-polling & callback
            await connection.query(
                `UPDATE bookings_dlu SET payment_ref = ?, status = 'PENDING_PAYMENT' WHERE id = ?`,
                [partner_reff, booking_id]
            );

            console.log(`✅ [DLU-PAY] ${method} berhasil untuk ${partner_reff}`);

            // 8. Response ke frontend — format konsisten
            return res.json({
                status:       "SUCCESS",
                partner_reff,
                data: {
                    method,
                    virtual_account: vaNumber,    // ← frontend baca res.data.virtual_account
                    imageqris:       qrisImage,   // ← frontend baca res.data.imageqris
                    amount:          finalAmount,
                    expired_at:      moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss')
                }
            });

        } catch (err) {
            console.error("❌ [DLU-PAY ERROR]:", err.response?.data || err.message);
            return res.status(500).json({ status: "ERROR", message: err.message });
        } finally {
            if (connection) connection.release();
        }
    },


    // =====================================================
    // POST /api/dlu-payments/callback
    // Webhook dari LinkQu saat pembayaran sukses
    // =====================================================
    handleCallback: async (req, res) => {
        console.log("📥 [DLU CALLBACK]:", JSON.stringify(req.body, null, 2));
        try {
            const { partner_reff, status } = req.body;

            if (!partner_reff) {
                return res.status(400).json({ message: "partner_reff tidak ada" });
            }

            const isSuccess = ['SUCCESS', 'SETTLED', 'PAID'].includes(status?.toUpperCase());

            if (isSuccess) {
                const [rows] = await db.query(
                    `SELECT id, status FROM bookings_dlu WHERE payment_ref = ?`,
                    [partner_reff]
                );

                if (rows.length > 0 && !['PAID', 'SUCCESS'].includes(rows[0].status?.toUpperCase())) {
                    await db.query(
                        `UPDATE bookings_dlu SET status = 'PAID', updated_at = NOW() WHERE id = ?`,
                        [rows[0].id]
                    );
                    console.log(`✅ [DLU CALLBACK] Booking ID ${rows[0].id} → PAID`);
                }
            }

            // Selalu balas 200 agar LinkQu tidak retry
            return res.json({ message: "OK" });

        } catch (err) {
            console.error("❌ [DLU CALLBACK ERROR]:", err.message);
            return res.status(500).json({ status: "ERROR" });
        }
    },


    // =====================================================
    // GET /api/dlu-payments/check-status/:reff
    // Polling dari frontend tiap 5 detik
    // =====================================================
    checkStatus: async (req, res) => {
        const { reff } = req.params;
        try {
            // 1. Cek DB lokal dulu (callback mungkin sudah masuk)
            const [rows] = await db.query(
                `SELECT id, status, booking_number FROM bookings_dlu WHERE payment_ref = ?`,
                [reff]
            );

            if (rows.length > 0) {
                const b = rows[0];
                if (['PAID', 'SUCCESS', 'SETTLED'].includes(b.status?.toUpperCase())) {
                    return res.json({
                        status:     'SUCCESS',
                        message:    'Pembayaran Lunas',
                        booking_id: b.id
                    });
                }
            }

            // 2. Tanya LinkQu jika DB masih PENDING
            const resp = await axios.get(`${config.baseUrl}/transaction/check-status`, {
                params:  { partner_reff: reff, username: config.username, pin: config.pin },
                headers: { 'client-id': config.clientId, 'client-secret': config.clientSecret }
            });

            const data      = resp.data;
            const isSuccess = data.status?.toUpperCase() === 'SUCCESS'
                           || data.response_code === '00';

            if (isSuccess) {
                // Update DB jika vendor konfirmasi sukses
                if (rows.length > 0) {
                    await db.query(
                        `UPDATE bookings_dlu SET status = 'PAID', updated_at = NOW() WHERE payment_ref = ?`,
                        [reff]
                    );
                }
                return res.json({
                    status:  'SUCCESS',
                    message: 'Pembayaran Berhasil'
                });
            }

            return res.json({ status: 'PENDING', message: 'Menunggu pembayaran' });

        } catch (err) {
            console.error("❌ [CHECK-STATUS ERROR]:", err.message);
            // Kembalikan PENDING agar polling tidak berhenti
            return res.json({ status: 'PENDING', error: err.message });
        }
    },


    // =====================================================
    // POST /api/dlu-payments/finalize
    // Dipanggil frontend setelah issued vendor sukses
    // =====================================================
    finalizeBooking: async (req, res) => {
        try {
            const { booking_id, resData, rawPaxes, serviceFee, partnerReff } = req.body;

            if (!booking_id || !resData || resData.status !== "SUCCESS") {
                return res.status(400).json({ status: "ERROR", message: "Data tidak valid" });
            }

            console.log(`[DLU_FINALIZE] Booking ID: ${booking_id} | Vendor: ${resData.bookingNumber}`);

            const MY_SERVICE_FEE = parseFloat(serviceFee || 0);
            const finalTotal     = parseFloat(resData.ticketPrice || 0) + MY_SERVICE_FEE;

            // 1. Update header booking
            await db.execute(
                `UPDATE bookings_dlu SET 
                    booking_number = ?,
                    num_code       = ?,
                    status         = 'SUCCESS',
                    raw_response   = ?,
                    updated_at     = NOW()
                 WHERE id = ?`,
                [resData.bookingNumber, resData.numCode, JSON.stringify(resData), booking_id]
            );

            // 2. Insert detail penumpang
            if (resData.paxBookingDetails?.length > 0) {
                const paxValues = resData.paxBookingDetails.map((pax, index) => [
                    booking_id,
                    pax.paxName,
                    pax.paxType,
                    pax.ID,
                    pax.paxGender || '-',
                    pax.ticketNumber,
                    pax.ticketQRCode,
                    pax.fare,
                    pax.admin,
                    rawPaxes?.[index]?.note || null
                ]);

                await db.query(
                    `INSERT INTO booking_pax_details_dlu 
                    (booking_id, pax_name, pax_type, id_number, gender,
                     ticket_number, ticket_qr_code, fare, admin_vendor, pax_note)
                    VALUES ?`,
                    [paxValues]
                );
            }

            // 3. Generate PDF & kirim email (background, tidak block response)
            sendEmailDlu(booking_id, resData, MY_SERVICE_FEE, finalTotal).catch(e => {
                console.error(`[DLU_MAIL] Gagal:`, e.message);
            });

            console.log(`[DLU_FINALIZE] ✅ Selesai untuk Booking ID: ${booking_id}`);
            return res.json({ status: "SUCCESS", message: "Booking finalized" });

        } catch (error) {
            console.error(`[DLU_FINALIZE ERROR]:`, error.message);
            return res.status(500).json({ status: "ERROR", message: error.message });
        }
    }
};


// =====================================================
// Helper: Generate PDF + Kirim Email
// =====================================================
async function sendEmailDlu(id, resData, fee, total) {
    try {
        const pdfBuffer    = await generateTicketPDF(resData, fee, total);
        const targetEmail  = resData.customerEmail || resData.email;

        if (!targetEmail) throw new Error("Email tujuan tidak ditemukan");

        const emailSubject = `E-Tiket Kapal ${resData.shipName} - ${resData.bookingNumber}`;
        const emailHtml = `
            <div style="font-family:sans-serif;line-height:1.6;color:#333;max-width:600px;margin:auto;border:1px solid #eee;padding:20px;">
                <h2 style="color:#00529b;text-align:center;">LinkU Transport</h2>
                <hr style="border:0;border-top:1px solid #eee;">
                <p>Halo, <b>${resData.customerName || 'Pelanggan'}</b>!</p>
                <p>Pembayaran Anda telah berhasil. Berikut rincian perjalanan Anda:</p>
                <div style="background:#f9f9f9;padding:15px;border-radius:8px;margin:20px 0;">
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="color:#666;padding:4px 0;">Nama Kapal</td>
                            <td><b>: ${resData.shipName}</b></td></tr>
                        <tr><td style="color:#666;padding:4px 0;">Rute</td>
                            <td><b>: ${resData.originName} → ${resData.destinationName}</b></td></tr>
                        <tr><td style="color:#666;padding:4px 0;">Keberangkatan</td>
                            <td><b>: ${resData.departDate}</b></td></tr>
                        <tr><td style="color:#666;padding:4px 0;">Kode PNR</td>
                            <td><b style="color:#d32f2f;">: ${resData.numCode}</b></td></tr>
                        <tr><td style="color:#666;padding:4px 0;">No. Reservasi</td>
                            <td><b>: ${resData.bookingNumber}</b></td></tr>
                    </table>
                </div>
                <p>E-Tiket terlampir dalam email ini. Tunjukkan saat check-in di pelabuhan.</p>
                <div style="margin-top:20px;font-size:12px;color:#999;text-align:center;">
                    <p>Pesan otomatis dari sistem LinkU Transport.</p>
                </div>
            </div>
        `;

        await sendBookingEmail(targetEmail, emailSubject, emailHtml, [{
            filename:    `ETiket_DLU_${resData.numCode || resData.bookingNumber}.pdf`,
            content:     pdfBuffer,
            contentType: 'application/pdf'
        }]);

        console.log(`[DLU_MAIL] ✅ Email terkirim ke: ${targetEmail}`);
        return true;

    } catch (e) {
        console.error(`[DLU_MAIL] ❌ ID ${id}:`, e.message);
        return false;
    }
}

module.exports = DluPaymentController;