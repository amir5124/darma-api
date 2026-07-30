// routes/hotelBookingV2Routes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { processHotelBookingToVendor } = require('../utils/hotelBookingProcessor');
const hotelPaymentController = require('../controllers/hotelPaymentController');
const logger = require('../helpers/darmaSandbox').logger;

// ============================================================
// HELPER: Format tanggal untuk MySQL (sama seperti di hotelRoutes.js)
// ============================================================
function formatDateForMySQL(dateStr) {
    if (!dateStr) return null;
    
    // Jika sudah dalam format YYYY-MM-DD, langsung return
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    
    try {
        // Buat objek Date dari string
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            // Coba format lain
            const parsed = new Date(dateStr.replace('Z', ''));
            if (isNaN(parsed.getTime())) return null;
            return parsed.toISOString().split('T')[0];
        }
        // Return YYYY-MM-DD
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.warn('⚠️ [DATE FORMAT] Gagal parse:', dateStr, e.message);
        return null;
    }
}

// ============================================================
// ENDPOINT 1: CREATE DRAFT BOOKING
// ============================================================
router.post('/draft', async (req, res) => {
    let connection;
    try {
        const b = req.body;
        const reservationNo = 'DRF-' + Date.now();

        // Validasi data wajib
        if (!b.hotel_id && !b.hotelID) {
            return res.status(400).json({
                status: "ERROR",
                message: "hotel_id wajib diisi"
            });
        }

        if (!b.room_id && !b.roomID) {
            return res.status(400).json({
                status: "ERROR",
                message: "room_id wajib diisi"
            });
        }

        // ============================================================
        // 🔥 FORMAT TANGGAL - SAMA SEPERTI DI hotelRoutes.js
        // ============================================================
        const checkInDate = formatDateForMySQL(b.check_in_date || b.checkInDate);
        const checkOutDate = formatDateForMySQL(b.check_out_date || b.checkOutDate);

        if (!checkInDate || !checkOutDate) {
            return res.status(400).json({
                status: "ERROR",
                message: "Tanggal check-in dan check-out wajib diisi dengan format yang benar (YYYY-MM-DD)"
            });
        }

        console.log('📅 [DRAFT V2] Formatted dates:', {
            originalCheckIn: b.check_in_date || b.checkInDate,
            formattedCheckIn: checkInDate,
            originalCheckOut: b.check_out_date || b.checkOutDate,
            formattedCheckOut: checkOutDate
        });

        console.log('📝 [DRAFT V2] Creating draft booking:', {
            reservationNo,
            hotel_id: b.hotel_id || b.hotelID,
            room_id: b.room_id || b.roomID,
            total_price: b.total_price,
            checkInDate,
            checkOutDate
        });

        connection = await db.getConnection();
        await connection.beginTransaction();

        const finalHotelId = b.hotel_id || b.hotelID;
        const finalRoomId = b.room_id || b.roomID;
        const finalCityId = b.city_id || b.cityId;
        const finalInternalCode = b.internal_code || b.internalCode;
        const finalTotalPrice = Math.round(parseFloat(b.total_price || 0));
        const finalHandlingFee = Math.round(parseFloat(b.handling_fee || 0));
        const finalRoomType = b.room_type !== undefined && b.room_type !== null ? parseInt(b.room_type) : 1;
        const finalChildNum = b.child_num !== undefined && b.child_num !== null ? parseInt(b.child_num) : 0;
        const finalChildAges = b.child_ages ? JSON.stringify(b.child_ages) : JSON.stringify([0]);
        const finalSpecialRequests = b.special_requests || b.requestDescription || null;
        const finalContactEmail = b.contact_email || b.email || "guest@mail.com";
        const finalContactPhone = b.contact_phone || b.phone || "08123456789";
        const finalUsername = b.username || 'guest';
        const finalSource = b.source || 'Web';
        const finalCommission = b.commission || 0;

        // ============================================================
        // 🔥 INSERT QUERY - SAMA SEPERTI DI hotelRoutes.js
        // ============================================================
        const [result] = await connection.execute(
            `INSERT INTO hotel_bookings 
            (
                reservation_no, hotel_id, hotel_name, hotel_address,
                check_in_date, check_out_date, room_id, room_name,
                breakfast_type, contact_email, contact_phone,
                total_price, handling_fee, special_requests,
                username, city_id, internal_code,
                room_type, child_num, child_ages,
                booking_status, source, commission, booking_date
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, NOW())`,
            [
                reservationNo,
                finalHotelId,
                b.hotel_name || b.hotelName || "Hotel",
                b.hotel_address || b.hotelAddress || null,
                checkInDate,   // ✅ FORMAT YYYY-MM-DD (sama seperti di hotelRoutes)
                checkOutDate,  // ✅ FORMAT YYYY-MM-DD (sama seperti di hotelRoutes)
                finalRoomId,
                b.room_name || b.roomName || "Room",
                b.breakfast_type || b.breakfast || "Room Only",
                finalContactEmail,
                finalContactPhone,
                finalTotalPrice,
                finalHandlingFee,
                finalSpecialRequests,
                finalUsername,
                finalCityId,
                finalInternalCode,
                finalRoomType,
                finalChildNum,
                finalChildAges,
                finalSource,
                finalCommission
            ]
        );

        const bookingId = result.insertId;
        console.log(`✅ [DRAFT V2] Booking created with ID: ${bookingId}`);

        // ============================================================
        // SIMPAN DATA TAMU (PAXES) - SAMA SEPERTI DI hotelRoutes.js
        // ============================================================
        const rawPaxes = b.paxes || (b.roomRequest && b.roomRequest[0]?.paxes) || [];
        
        if (Array.isArray(rawPaxes) && rawPaxes.length > 0) {
            console.log(`👤 [DRAFT V2] Saving ${rawPaxes.length} paxes...`);
            const paxQuery = `INSERT INTO hotel_booking_paxes (booking_id, title, first_name, last_name, pax_type) VALUES (?, ?, ?, ?, 'ADULT')`;
            
            for (const pax of rawPaxes) {
                const firstName = (pax.firstName || pax.first_name || 'Guest').trim().toUpperCase();
                const lastName = (pax.lastName || pax.last_name || '').trim().toUpperCase();
                const title = (pax.title || 'Mr.').trim();
                
                await connection.execute(paxQuery, [
                    bookingId,
                    title,
                    firstName,
                    lastName
                ]);
            }
        }

        await connection.commit();
        console.log(`✅ [DRAFT V2] Booking ${bookingId} saved successfully`);

        res.json({
            status: "SUCCESS",
            booking_id: bookingId,
            reservation_no: reservationNo,
            total_price: finalTotalPrice + finalHandlingFee,
            source: finalSource,
            message: "Draft booking created. Please proceed to payment."
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ [DRAFT V2 ERROR]:", error.message);
        console.error("❌ [DRAFT V2 STACK]:", error.stack);
        res.status(500).json({
            status: "ERROR",
            message: error.message || "Gagal membuat draft booking"
        });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// ENDPOINT 2: CREATE PAYMENT (panggil controller yang sudah ada)
// ============================================================
router.post('/:bookingId/create-payment', async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { method, bank_code, admin_fee_applied } = req.body;

        // Ambil data booking
        const connection = await db.getConnection();
        const [rows] = await connection.execute(
            `SELECT id, total_price, handling_fee, contact_email, contact_phone, 
                    username, hotel_name, reservation_no, booking_status
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

        // Validasi status booking
        if (booking.booking_status !== 'DRAFT') {
            return res.status(400).json({
                status: "ERROR",
                message: `Booking status harus DRAFT, saat ini: ${booking.booking_status}`
            });
        }

        // Hitung total
        const totalAmount = Math.round(booking.total_price + booking.handling_fee);

        // Panggil controller payment yang sudah ada
        const mockReq = {
            body: {
                booking_id: parseInt(bookingId),
                amount: totalAmount,
                customer_name: booking.username || 'Guest',
                customer_phone: booking.contact_phone,
                customer_email: booking.contact_email,
                method: method || 'QRIS',
                bank_code: bank_code || null,
                admin_fee_applied: admin_fee_applied || 0
            }
        };

        const mockRes = {
            json: (data) => res.json(data),
            status: (code) => ({
                json: (data) => res.status(code).json(data)
            })
        };

        await hotelPaymentController.createPayment(mockReq, mockRes);

    } catch (error) {
        console.error("❌ [CREATE PAYMENT V2] Error:", error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

// ============================================================
// ENDPOINT 3: CHECK PAYMENT STATUS
// ============================================================
router.get('/payment-status/:reff', async (req, res) => {
    try {
        const { reff } = req.params;

        const mockReq = { params: { reff } };
        const mockRes = {
            json: (data) => res.json(data),
            status: (code) => ({
                json: (data) => res.status(code).json(data)
            })
        };

        await hotelPaymentController.checkStatus(mockReq, mockRes);

    } catch (error) {
        console.error("❌ [CHECK PAYMENT V2] Error:", error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

// ============================================================
// ENDPOINT 4: WEBHOOK (callback dari payment)
// ============================================================
router.post('/payment-webhook', async (req, res) => {
    try {
        await hotelPaymentController.handleCallback(req, res);
    } catch (error) {
        console.error("❌ [WEBHOOK V2] Error:", error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

// ============================================================
// ENDPOINT 5: CONFIRM BOOKING (trigger ke vendor)
// ============================================================
router.post('/:bookingId/confirm', async (req, res) => {
    let connection;
    try {
        const { bookingId } = req.params;
        const { payment_reference, payment_status = 'SETTLED' } = req.body;

        connection = await db.getConnection();

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

        if (!['DRAFT', 'PAID'].includes(booking.booking_status)) {
            return res.status(400).json({
                status: "ERROR",
                message: `Cannot confirm booking with status: ${booking.booking_status}`
            });
        }

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

        connection.release();

        // Proses ke vendor
        logger.info(`[CONFIRM V2] 🔥 Processing booking ${bookingId} to vendor...`);
        const result = await processHotelBookingToVendor(bookingId);

        return res.json({
            status: "SUCCESS",
            booking_id: bookingId,
            processed: result,
            message: "Booking confirmed and sent to vendor"
        });

    } catch (error) {
        if (connection) connection.release();
        console.error("❌ [CONFIRM V2] Error:", error.message);
        return res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
});

// ============================================================
// ENDPOINT 6: GET BOOKING STATUS (untuk polling)
// ============================================================
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
        console.error("❌ [STATUS V2] Error:", error.message);
        return res.status(500).json({ 
            status: "ERROR", 
            message: error.message 
        });
    }
});

module.exports = router;