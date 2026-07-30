// utils/paymentHelper.js
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');
const { processHotelBookingToVendor } = require('../utils/hotelBookingProcessor');
const logger = require('../helpers/darmaSandbox').logger;

// ============================================================
// KONFIGURASI LINKQU (sama dengan hotelPaymentController)
// ============================================================
const LINKQU_CONFIG = {
    clientId: "testing",
    clientSecret: "123",
    username: "LI307GXIN",
    pin: "2K2NPCBBNNTovgB",
    serverKey: "LinkQu@2020",
    baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
};

// ============================================================
// HELPER: Generate Signature LinkQu
// ============================================================
function generateSignature(path, method, data) {
    const rawValue = Object.values(data).join('') + LINKQU_CONFIG.clientId;
    const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();

    return crypto.createHmac("sha256", LINKQU_CONFIG.serverKey)
        .update(path + method + cleaned)
        .digest("hex");
}

// ============================================================
// HELPER: Format Phone Number
// ============================================================
function formatPhoneNumber(phone) {
    let formatted = phone ? phone.toString().trim().replace(/[^0-9]/g, '') : '';
    
    if (formatted.startsWith('0')) {
        formatted = '+62' + formatted.substring(1);
    } else if (formatted.startsWith('8')) {
        formatted = '+62' + formatted;
    } else if (formatted.startsWith('62') && !formatted.startsWith('+')) {
        formatted = '+' + formatted;
    } else if (!formatted.startsWith('+')) {
        formatted = '+62' + formatted;
    }
    
    if (formatted.length < 10) formatted = '+628123456789';
    
    return formatted;
}

// ============================================================
// HELPER: Get Bank Name
// ============================================================
function getBankName(bankCode) {
    const bankMap = {
        "002": "BRI", 
        "008": "MANDIRI", 
        "009": "BNI", 
        "200": "BTN", 
        "014": "BCA",
        "013": "PERMATA", 
        "022": "CIMB", 
        "441": "DANAMON", 
        "016": "MAYBANK", 
        "451": "BSI"
    };
    return bankMap[bankCode] || bankCode;
}

// ============================================================
// MAIN: Generate Payment via LinkQu
// ============================================================
async function generatePayment(bookingData) {
    let connection;
    try {
        const {
            booking_id,
            amount,
            customer_name,
            customer_phone,
            customer_email,
            method = 'QRIS',
            bank_code = null,
            admin_fee_applied = 0
        } = bookingData;

        // Validasi
        if (!booking_id || !amount) {
            throw new Error('booking_id dan amount wajib diisi');
        }

        const finalAmount = Math.round(Number(amount));
        const feeAdmin = Number(admin_fee_applied || 0);
        const finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
        const finalCustomerEmail = (customer_email || 'guest@mail.com').trim();
        const formattedPhone = formatPhoneNumber(customer_phone);
        const bankName = getBankName(bank_code);
        const partner_reff = `PAY-HTL-${Date.now()}`;
        const expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
        const url_callback = "https://darma.siappgo.id/api/hotel-booking-v2/payment-webhook";

        // Ambil data booking
        connection = await db.getConnection();
        const [rows] = await connection.query(
            "SELECT * FROM hotel_bookings WHERE id = ?", 
            [booking_id]
        );

        if (rows.length === 0) {
            throw new Error("Data booking hotel tidak ditemukan");
        }

        const booking = rows[0];

        // Prepare data untuk LinkQu
        const commonData = {
            amount: finalAmount,
            expired,
            partner_reff,
            customer_id: formattedPhone,
            customer_name: finalCustomerName,
            customer_email: finalCustomerEmail
        };

        let endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
        let payloadLinkQu = { 
            ...commonData, 
            username: LINKQU_CONFIG.username, 
            pin: LINKQU_CONFIG.pin, 
            url_callback 
        };

        // Tambahkan bank_code untuk VA
        if (method === 'VA') {
            payloadLinkQu.bank_code = bank_code;
            const signatureData = {
                amount: finalAmount,
                expired,
                bank_code,
                partner_reff,
                customer_id: formattedPhone,
                customer_name: finalCustomerName,
                customer_email: finalCustomerEmail
            };
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', signatureData);
        } else {
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
        }

        logger.info(`🚀 [LINKQU] Sending to ${endpoint} with Reff: ${partner_reff}`);
        logger.debug(`📦 Payload:`, JSON.stringify(payloadLinkQu));

        // Kirim ke LinkQu
        const resp = await axios.post(`${LINKQU_CONFIG.baseUrl}${endpoint}`, payloadLinkQu, {
            headers: { 
                'client-id': LINKQU_CONFIG.clientId, 
                'client-secret': LINKQU_CONFIG.clientSecret 
            }
        });

        const linkquData = resp.data;
        logger.info(`✅ [LINKQU] Success:`, JSON.stringify(linkquData));

        const vaNumber = linkquData.virtual_account || linkquData.va_number || 
                        (linkquData.data ? linkquData.data.va_number : null);
        const qrisImage = linkquData.imageqris || linkquData.qr_url || 
                         (linkquData.data ? linkquData.data.qr_url : null);

        if (!vaNumber && !qrisImage) {
            throw new Error("Gagal mendapatkan instruksi pembayaran dari LinkQu: " + JSON.stringify(linkquData));
        }

        // Simpan ke database
        const mysqlExpired = moment(expired, 'YYYYMMDDHHmmss').format('YYYY-MM-DD HH:mm:ss');

        await connection.query(
            `INSERT INTO hotel_payments 
                (booking_id, payment_reff, payment_method, va_number, qris_url, 
                 admin_fee, amount, payment_status, expired_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())
             ON DUPLICATE KEY UPDATE 
                payment_reff = VALUES(payment_reff),
                payment_method = VALUES(payment_method),
                va_number = VALUES(va_number),
                qris_url = VALUES(qris_url),
                admin_fee = VALUES(admin_fee),
                amount = VALUES(amount),
                payment_status = 'PENDING',
                expired_date = VALUES(expired_date)`,
            [
                booking_id,
                partner_reff,
                method === 'VA' ? `VA-${bankName}` : 'QRIS',
                vaNumber,
                qrisImage,
                feeAdmin,
                finalAmount,
                mysqlExpired
            ]
        );

        // Kirim email (jika diperlukan)
        const formatIDR = (num) => new Intl.NumberFormat('id-ID').format(num);
        const emailHtml = `
            <div style="font-family: Arial; max-width: 600px; margin: auto; border: 1px solid #24b3ae;">
                <div style="background: #24b3ae; color: white; padding: 15px; text-align: center;">
                    <h3>INSTRUKSI PEMBAYARAN HOTEL</h3>
                </div>
                <div style="padding: 20px;">
                    <p>Halo ${finalCustomerName}, silakan selesaikan pembayaran untuk <b>${booking.hotel_name}</b></p>
                    <table style="width: 100%; margin-bottom: 20px;">
                        <tr><td>No. Transaksi</td><td>: <b>${booking.reservation_no}</b></td></tr>
                        <tr><td>Metode</td><td>: ${method} ${bankName || ''}</td></tr>
                    </table>
                    <div style="background: #f9f9f9; padding: 20px; text-align: center; border-radius: 10px;">
                        <small>NOMOR PEMBAYARAN</small>
                        <h2 style="color: #e03f7d; margin: 10px 0;">${vaNumber || 'Lihat QRIS'}</h2>
                        ${qrisImage ? `<img src="${qrisImage}" width="200" />` : ''}
                        <h3 style="margin: 0;">TOTAL: Rp ${formatIDR(finalAmount)}</h3>
                    </div>
                </div>
            </div>`;

        // Kirim email di background
        sendBookingEmail(finalCustomerEmail, `Bayar Hotel - ${booking.reservation_no}`, emailHtml)
            .catch(e => logger.error("Email Error:", e.message));

        connection.release();

        return {
            success: true,
            partner_reff: partner_reff,
            method: method,
            bankName: bankName,
            va_number: vaNumber,
            qris_url: qrisImage,
            amount: finalAmount,
            expired_at: moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss'),
            payment_info: {
                method,
                bankName,
                va_number: vaNumber,
                qris_url: qrisImage,
                amount: finalAmount,
                expired_at: moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss')
            }
        };

    } catch (error) {
        if (connection) connection.release();
        logger.error('[PAYMENT GENERATE] Error:', error.message);
        if (error.response) {
            logger.error('[PAYMENT GENERATE] Response:', error.response.data);
        }
        throw error;
    }
}

// ============================================================
// CHECK PAYMENT STATUS (Polling ke LinkQu)
// ============================================================
async function checkPaymentStatus(partnerReff) {
    try {
        logger.info(`🔍 [POLLING VENDOR] Memeriksa Reff: ${partnerReff}`);

        const resp = await axios.get(`${LINKQU_CONFIG.baseUrl}/transaction/check-status`, {
            params: { 
                partner_reff: partnerReff, 
                username: LINKQU_CONFIG.username, 
                pin: LINKQU_CONFIG.pin 
            },
            headers: { 
                'client-id': LINKQU_CONFIG.clientId, 
                'client-secret': LINKQU_CONFIG.clientSecret 
            },
            validateStatus: (status) => status < 500
        });

        const data = resp.data;
        const isSuccess = 
            (data.status && (data.status.toUpperCase() === 'SUCCESS' || data.status.toUpperCase() === 'SETTLED')) ||
            (data.response_code === '00') ||
            (data.response_desc && data.response_desc.includes('SUCCESS'));

        // Ambil data dari database
        const [rows] = await db.query(
            `SELECT p.booking_id, p.payment_status, b.booking_status 
             FROM hotel_payments p
             JOIN hotel_bookings b ON p.booking_id = b.id
             WHERE p.payment_reff = ?`,
            [partnerReff]
        );

        let bookingId = null;
        if (rows.length > 0) {
            bookingId = rows[0].booking_id;
        }

        // Jika payment sukses, update database dan trigger vendor booking
        if (isSuccess && bookingId) {
            logger.info(`✅ [POLLING VENDOR SUCCESS] Transaksi ${partnerReff} VALID`);

            await db.query(
                `UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?`,
                [partnerReff]
            );
            
            await db.query(
                `UPDATE hotel_bookings SET booking_status = 'PAID' WHERE id = ? AND booking_status NOT IN ('Accept', 'Processed')`,
                [bookingId]
            );

            // 🔥 Trigger vendor booking (sama seperti di handleCallback)
            processHotelBookingToVendor(bookingId)
                .then(result => {
                    if (result.skipped) {
                        logger.info(`ℹ️ [VENDOR BOOKING/POLLING] Booking ${bookingId} dilewati: ${result.reason}`);
                    } else {
                        logger.info(`✅ [VENDOR BOOKING/POLLING] Booking ${bookingId} berhasil -> ${result.reservationNo}`);
                    }
                })
                .catch(err => {
                    logger.error(`🚨 [CRITICAL/POLLING] Booking ${bookingId} dibayar tapi booking vendor GAGAL:`, err.message);
                });

            return {
                status: 'SUCCESS',
                payment_status: 'SUCCESS',
                booking_id: bookingId,
                data: data
            };
        }

        // Cek dari database jika belum sukses
        if (rows.length > 0) {
            const pStatus = (rows[0].payment_status || "").toUpperCase();
            if (['SUCCESS', 'SETTLED', 'PAID'].includes(pStatus)) {
                return {
                    status: 'SUCCESS',
                    payment_status: 'SUCCESS',
                    booking_id: bookingId,
                    data: data
                };
            }
        }

        logger.info(`⏳ [POLLING PENDING] Reff ${partnerReff} belum dibayar.`);
        return {
            status: 'PENDING',
            message: 'Menunggu pembayaran',
            booking_id: bookingId
        };

    } catch (error) {
        logger.error(`❌ [POLLING ERROR] ${partnerReff}:`, error.message);
        return {
            status: 'PENDING',
            error: error.message
        };
    }
}

// ============================================================
// WEBHOOK HANDLER (LinkQu Callback)
// ============================================================
async function handlePaymentWebhook(webhookData) {
    try {
        const { partner_reff, status } = webhookData;
        const statusUpper = status ? status.toUpperCase() : "";

        logger.info(`📥 [PAYMENT WEBHOOK] Received: ${partner_reff} - ${statusUpper}`);

        if (statusUpper === "SUCCESS" || statusUpper === "SETTLED") {
            const [rows] = await db.query(
                `SELECT p.booking_id FROM hotel_payments p WHERE p.payment_reff = ?`,
                [partner_reff]
            );

            if (rows.length > 0) {
                const bookingId = rows[0].booking_id;

                await db.query(
                    `UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?`,
                    [partner_reff]
                );
                
                await db.query(
                    `UPDATE hotel_bookings SET booking_status = 'PAID' WHERE id = ? AND booking_status NOT IN ('Accept', 'Processed')`,
                    [bookingId]
                );

                logger.info(`✅ [PAYMENT WEBHOOK] Reff ${partner_reff} set to PAID. Memproses booking ke vendor...`);

                // 🔥 Trigger vendor booking
                processHotelBookingToVendor(bookingId)
                    .then(result => {
                        if (result.skipped) {
                            logger.info(`ℹ️ [VENDOR BOOKING/WEBHOOK] Booking ${bookingId} dilewati: ${result.reason}`);
                        } else {
                            logger.info(`✅ [VENDOR BOOKING/WEBHOOK] Booking ${bookingId} berhasil -> ${result.reservationNo}`);
                        }
                    })
                    .catch(err => {
                        logger.error(`🚨 [CRITICAL/WEBHOOK] Booking ${bookingId} dibayar tapi booking vendor GAGAL:`, err.message);
                    });

                return {
                    success: true,
                    booking_id: bookingId,
                    status: 'SETTLED'
                };
            } else {
                logger.warn(`⚠️ [PAYMENT WEBHOOK] Payment Reff ${partner_reff} not found in database.`);
                return {
                    success: false,
                    message: 'Payment reference not found'
                };
            }
        }

        return {
            success: true,
            status: statusUpper || 'PENDING'
        };

    } catch (error) {
        logger.error(`❌ [PAYMENT WEBHOOK ERROR]:`, error.message);
        throw error;
    }
}

// ============================================================
// CHECK PAYMENT FROM DATABASE (untuk internal)
// ============================================================
async function getPaymentStatusFromDB(bookingId) {
    try {
        const [rows] = await db.query(
            `SELECT * FROM hotel_payments WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1`,
            [bookingId]
        );

        if (rows.length === 0) {
            return {
                success: false,
                message: 'Payment not found'
            };
        }

        return {
            success: true,
            data: rows[0]
        };

    } catch (error) {
        logger.error('[GET PAYMENT DB] Error:', error.message);
        throw error;
    }
}

// ============================================================
// EXPORT MODULE
// ============================================================
module.exports = {
    // Main functions
    generatePayment,
    checkPaymentStatus,
    handlePaymentWebhook,
    getPaymentStatusFromDB,
    
    // Helpers
    formatPhoneNumber,
    getBankName,
    generateSignature,
    LINKQU_CONFIG
};