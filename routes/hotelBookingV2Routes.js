// routes/hotelBookingV2Routes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { processHotelBookingToVendor } = require('../utils/hotelBookingProcessor');
const { 
    generatePayment, 
    checkPaymentStatus, 
    handlePaymentWebhook,
    getPaymentStatusFromDB 
} = require('../utils/paymentHelper');
const logger = require('../helpers/darmaSandbox').logger;

// ================================================================
// ENDPOINT 1: CREATE DRAFT BOOKING
// ================================================================
router.post('/draft', async (req, res) => {
    // ... (sama seperti sebelumnya)
    // Kode ini tetap sama seperti yang sudah dibuat
});

// ================================================================
// ENDPOINT 2: CREATE PAYMENT (menggunakan paymentHelper)
// ================================================================
router.post('/:bookingId/create-payment', async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { method, bank_code, admin_fee_applied } = req.body;

        // 1. Ambil data booking
        const connection = await db.getConnection();
        const [rows] = await connection.execute(
            `SELECT id, total_price, handling_fee, contact_email, contact_phone, 
                    username, hotel_name, reservation_no
             FROM hotel_bookings WHERE id = ?`,
            [bookingId]
        );
        connection.release();

        if (rows.length === 0) {
            return res.status(404).json({ 
                status: "ERROR", 
                message: "Booking tidak ditemukan" 
            });
        }

        const booking = rows[0];

        // 2. Validasi status booking
        if (booking.booking_status !== 'DRAFT') {
            return res.status(400).json({
                status: "ERROR",
                message: `Booking status harus DRAFT, saat ini: ${booking.booking_status}`
            });
        }

        // 3. Hitung total
        const totalAmount = Math.round(booking.total_price + booking.handling_fee);

        // 4. Generate payment via LinkQu
        const paymentResult = await generatePayment({
            booking_id: bookingId,
            amount: totalAmount,
            customer_name: booking.username || 'Guest',
            customer_phone: booking.contact_phone,
            customer_email: booking.contact_email,
            method: method || 'QRIS',
            bank_code: bank_code || null,
            admin_fee_applied: admin_fee_applied || 0
        });

        // 5. Return response
        res.json({
            status: "SUCCESS",
            booking_id: bookingId,
            ...paymentResult
        });

    } catch (error) {
        logger.error('[CREATE PAYMENT V2] Error:', error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

// ================================================================
// ENDPOINT 3: CHECK PAYMENT STATUS (polling)
// ================================================================
router.get('/payment-status/:reff', async (req, res) => {
    try {
        const { reff } = req.params;

        const result = await checkPaymentStatus(reff);

        res.json({
            status: "SUCCESS",
            ...result
        });

    } catch (error) {
        logger.error('[CHECK PAYMENT STATUS] Error:', error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

// ================================================================
// ENDPOINT 4: WEBHOOK (LinkQu Callback)
// ================================================================
router.post('/payment-webhook', async (req, res) => {
    try {
        logger.info(`📥 [WEBHOOK V2] Received:`, JSON.stringify(req.body, null, 2));

        const result = await handlePaymentWebhook(req.body);

        if (result.success) {
            res.json({ 
                status: "SUCCESS", 
                message: "Webhook processed" 
            });
        } else {
            res.status(400).json({ 
                status: "ERROR", 
                message: result.message 
            });
        }

    } catch (error) {
        logger.error('[WEBHOOK V2] Error:', error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

// ================================================================
// ENDPOINT 5: CONFIRM BOOKING (manual trigger)
// ================================================================
router.post('/:bookingId/confirm', async (req, res) => {
    let connection;
    try {
        const { bookingId } = req.params;
        const { payment_reference, payment_status = 'SETTLED' } = req.body;

        connection = await db.getConnection();

        // 1. Cek status booking
        const [rows] = await connection.execute(
            `SELECT id, booking_status, payment_status FROM hotel_bookings WHERE id = ?`,
            [bookingId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ 
                status: "ERROR", 
                message: "Booking tidak ditemukan" 
            });
        }

        const booking = rows[0];

        // 2. Validasi: harus DRAFT atau PAID
        if (!['DRAFT', 'PAID'].includes(booking.booking_status)) {
            return res.status(400).json({
                status: "ERROR",
                message: `Cannot confirm booking with status: ${booking.booking_status}`
            });
        }

        // 3. Update payment info
        if (payment_reference) {
            await connection.execute(
                `UPDATE hotel_bookings SET 
                    payment_reference = ?,
                    payment_status = ?,
                    booking_status = 'PAID',
                    updated_at = NOW()
                 WHERE id = ?`,
                [payment_reference, payment_status, bookingId]
            );
        }

        // 4. 🔥 PROSES KE VENDOR menggunakan hotelBookingProcessor
        logger.info(`[CONFIRM V2] 🔥 Processing booking ${bookingId} to vendor...`);
        
        const result = await processHotelBookingToVendor(bookingId);
        
        connection.release();

        return res.json({
            status: "SUCCESS",
            booking_id: bookingId,
            processed: result,
            message: "Booking confirmed and sent to vendor"
        });

    } catch (error) {
        if (connection) connection.release();
        logger.error(`[CONFIRM V2 ERROR]: ${error.message}`);
        return res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});

// ================================================================
// ENDPOINT 6: GET BOOKING STATUS (untuk polling)
// ================================================================
router.get('/:bookingId/status', async (req, res) => {
    let connection;
    try {
        const { bookingId } = req.params;

        connection = await db.getConnection();

        const [rows] = await connection.execute(
            `SELECT 
                id, reservation_no, voucher_no, booking_status,
                payment_status, payment_reference, payment_method,
                hotel_name, hotel_address, room_name, breakfast_type,
                check_in_date, check_out_date, total_price, handling_fee,
                contact_email, contact_phone, issued_at, source,
                created_at, updated_at
             FROM hotel_bookings 
             WHERE id = ?`,
            [bookingId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ 
                status: "ERROR", 
                message: "Booking tidak ditemukan" 
            });
        }

        const booking = rows[0];

        // Ambil paxes
        const [paxes] = await connection.execute(
            `SELECT title, first_name, last_name, pax_type
             FROM hotel_booking_paxes
             WHERE booking_id = ?`,
            [bookingId]
        );

        // Ambil payment info
        const [payments] = await connection.execute(
            `SELECT payment_reff, payment_status, va_number, qris_url, amount, admin_fee
             FROM hotel_payments
             WHERE booking_id = ?
             ORDER BY created_at DESC LIMIT 1`,
            [bookingId]
        );

        booking.paxes = paxes;
        booking.payment_info = payments.length > 0 ? payments[0] : null;
        booking.can_confirm = ['DRAFT', 'PAID'].includes(booking.booking_status);

        connection.release();

        return res.json({
            status: "SUCCESS",
            data: booking
        });

    } catch (error) {
        if (connection) connection.release();
        logger.error(`[STATUS V2 ERROR]: ${error.message}`);
        return res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

module.exports = router;