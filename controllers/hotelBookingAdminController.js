// controllers/hotelBookingAdminController.js
const db = require('../config/db');
const { sendBookingEmails, generateBookingPDF } = require('../utils/hotelMailer');

// ============================================================
// SOURCE DETECTION (Heuristik)
// ============================================================
const SOURCE_CASE_SQL = `CASE WHEN hb.username IS NULL THEN 'web' ELSE 'app' END`;

const HotelBookingAdminController = {

    // ============================================================
    // GET /list - LIST BOOKINGS WITH PAGINATION & FILTERS
    // ============================================================
    listBookings: async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                search = '',
                status = '',
                source = '',
                date_from = '',
                date_to = ''
            } = req.query;

            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
            const offset = (pageNum - 1) * limitNum;

            const whereClauses = ['1=1'];
            const params = [];

            // Filter search
            if (search && search.trim() !== '') {
                whereClauses.push(`(
                    hb.reservation_no LIKE ? OR
                    hb.hotel_name LIKE ? OR
                    hb.contact_email LIKE ? OR
                    hb.contact_phone LIKE ? OR
                    hb.os_ref_no LIKE ?
                )`);
                const likeTerm = `%${search.trim()}%`;
                params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
            }

            // Filter status
            if (status && status.trim() !== '') {
                whereClauses.push(`hb.booking_status = ?`);
                params.push(status.trim());
            }

            // Filter source
            if (source === 'app') {
                whereClauses.push(`hb.username IS NOT NULL`);
            } else if (source === 'web') {
                whereClauses.push(`hb.username IS NULL`);
            }

            // Filter tanggal
            if (date_from) {
                whereClauses.push(`hb.check_in_date >= ?`);
                params.push(date_from);
            }
            if (date_to) {
                whereClauses.push(`hb.check_in_date <= ?`);
                params.push(date_to + ' 23:59:59');
            }

            const whereSql = whereClauses.join(' AND ');

            // Hitung total
            const [[{ total }]] = await db.query(
                `SELECT COUNT(*) as total FROM hotel_bookings hb WHERE ${whereSql}`,
                params
            );

            // Ambil data
            const [rows] = await db.query(
                `SELECT
                    hb.id,
                    hb.reservation_no,
                    hb.voucher_no,
                    hb.os_ref_no,
                    hb.agent_os_ref,
                    hb.hotel_id,
                    hb.hotel_name,
                    hb.hotel_address,
                    hb.internal_code,
                    hb.check_in_date,
                    hb.check_out_date,
                    hb.city_id,
                    hb.city_name,
                    hb.room_name,
                    hb.breakfast_type,
                    hb.room_count,
                    hb.contact_email,
                    hb.contact_phone,
                    hb.total_price,
                    hb.commission,
                    hb.handling_fee,
                    hb.currency,
                    hb.booking_status,
                    hb.username,
                    hb.booking_date,
                    hb.created_at,
                    hb.updated_at,
                    hb.source,
                    ${SOURCE_CASE_SQL} AS source_detected,
                    hp.payment_status,
                    hp.payment_method,
                    hp.payment_reff,
                    hp.payment_date,
                    hp.expired_date,
                    hp.admin_fee AS payment_admin_fee,
                    (SELECT COUNT(*) FROM hotel_booking_paxes hbp WHERE hbp.booking_id = hb.id) AS guest_count
                 FROM hotel_bookings hb
                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id
                 WHERE ${whereSql}
                 ORDER BY hb.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limitNum, offset]
            );

            return res.json({
                status: "SUCCESS",
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    total_pages: Math.ceil(total / limitNum)
                },
                data: rows
            });

        } catch (error) {
            console.error("❌ [LIST BOOKINGS ERROR]:", error.message);
            return res.status(500).json({
                status: "ERROR",
                respMessage: error.message
            });
        }
    },

    // ============================================================
    // GET /:id - DETAIL BOOKING
    // ============================================================
    getBookingDetail: async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT
                hb.*,
                hp.payment_status,
                hp.payment_method,
                hp.payment_reff,
                hp.booking_code,
                hp.reference_no,
                hp.va_number,
                hp.qris_url,
                hp.amount AS payment_amount,
                hp.admin_fee AS payment_admin_fee,
                hp.ticket_status,
                hp.payment_date,
                hp.expired_date
             FROM hotel_bookings hb
             LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id
             WHERE hb.id = ?`,
            [id]
        );
            if (rows.length === 0) {
                return res.status(404).json({
                    status: "ERROR",
                    respMessage: "Booking tidak ditemukan."
                });
            }

            const booking = rows[0];

            const [paxes] = await db.query(
                `SELECT id, pax_type, title, first_name, last_name, age
                 FROM hotel_booking_paxes
                 WHERE booking_id = ?
                 ORDER BY id ASC`,
                [id]
            );

            const [facilities] = await db.query(
                `SELECT id, facility_name
                 FROM hotel_booking_facilities
                 WHERE booking_id = ?`,
                [id]
            );

            return res.json({
                status: "SUCCESS",
                data: {
                    ...booking,
                    paxes,
                    facilities
                }
            });

        } catch (error) {
            console.error("❌ [GET BOOKING DETAIL ERROR]:", error.message);
            return res.status(500).json({
                status: "ERROR",
                respMessage: error.message
            });
        }
    },

    // ============================================================
    // 🔥 POST /:id/resend-eticket - KIRIM ULANG E-TIKET
    // ============================================================
    resendEticket: async (req, res) => {
        try {
            const { id } = req.params;
            const { email } = req.body;

            // Validasi ID
            if (!id || isNaN(id)) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "Booking ID tidak valid"
                });
            }

            // 1. Cek apakah booking ada
            const [rows] = await db.query(
                `SELECT id, booking_status, contact_email, os_ref_no, reservation_no, hotel_name, hotel_address, room_name, total_price, handling_fee, check_in_date, check_out_date, breakfast_type, special_requests
                 FROM hotel_bookings WHERE id = ?`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    status: "ERROR",
                    respMessage: "Booking tidak ditemukan"
                });
            }

            const booking = rows[0];

            // 2. Validasi status (hanya Accept/Processed yang bisa kirim e-tiket)
            const allowedStatus = ['Accept', 'Processed'];
            if (!allowedStatus.includes(booking.booking_status)) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: `Booking status "${booking.booking_status}" tidak bisa mengirim e-tiket. Status harus Accept atau Processed.`
                });
            }

            // 3. Ambil data paxes
            const [paxes] = await db.query(
                `SELECT title, first_name as firstName, last_name as lastName 
                 FROM hotel_booking_paxes 
                 WHERE booking_id = ?`,
                [id]
            );

            // 4. Kirim email ke email yang ditentukan atau email default
            const targetEmail = email || booking.contact_email;

            if (!targetEmail) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "Email tujuan tidak ditemukan. Silakan kirim dengan parameter email."
                });
            }

            // 5. Panggil fungsi kirim email (reuse dari hotelMailer)
            await sendBookingEmails(parseInt(id));

            return res.json({
                status: "SUCCESS",
                message: `E-Tiket berhasil dikirim ke ${targetEmail}`,
                booking_id: parseInt(id),
                reservation_no: booking.reservation_no,
                os_ref_no: booking.os_ref_no,
                sent_to: targetEmail,
                booking_status: booking.booking_status
            });

        } catch (error) {
            console.error("❌ [RESEND E-TIKET ERROR]:", error.message);
            return res.status(500).json({
                status: "ERROR",
                respMessage: error.message
            });
        }
    },

    // ============================================================
    // 🔥 POST /generate-pdf/:id - DOWNLOAD PDF MANUAL
    // ============================================================
    generatePdf: async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "Booking ID tidak valid"
                });
            }

            // 1. Ambil data booking
            const [rows] = await db.query(
                `SELECT * FROM hotel_bookings WHERE id = ?`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    status: "ERROR",
                    respMessage: "Booking tidak ditemukan"
                });
            }

            const booking = rows[0];

            // 2. Ambil data paxes
            const [paxes] = await db.query(
                `SELECT title, first_name as firstName, last_name as lastName 
                 FROM hotel_booking_paxes 
                 WHERE booking_id = ?`,
                [id]
            );

            // 3. Siapkan data untuk PDF
            const pdfData = {
                reservationNo: booking.reservation_no,
                voucherNo: booking.voucher_no || booking.reservation_no,
                osRefNo: booking.os_ref_no || "-",
                hotelName: booking.hotel_name,
                hotelAddress: booking.hotel_address || "-",
                roomName: booking.room_name || "-",
                totalPrice: booking.total_price || 0,
                handlingFee: booking.handling_fee || 0,
                checkInDate: booking.check_in_date,
                checkOutDate: booking.check_out_date,
                breakfastType: booking.breakfast_type || "Room Only",
                specialRequests: booking.special_requests || "-"
            };

            // 4. Generate PDF
            const pdfBuffer = await generateBookingPDF(pdfData, paxes);

            // 5. Set response untuk download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="E-Voucher-${booking.reservation_no}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);

        } catch (error) {
            console.error("❌ [GENERATE PDF ERROR]:", error.message);
            return res.status(500).json({
                status: "ERROR",
                respMessage: error.message
            });
        }
    },

    // ============================================================
    // 🔥 POST /bulk-resend - KIRIM MASSAL E-TIKET
    // ============================================================
    bulkResendEticket: async (req, res) => {
        try {
            const { bookingIds, email } = req.body;

            if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "bookingIds harus berupa array ID booking"
                });
            }

            // Batasi maksimal 50 booking per request
            if (bookingIds.length > 50) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "Maksimal 50 booking per request"
                });
            }

            const results = [];
            let successCount = 0;
            let failCount = 0;

            for (const id of bookingIds) {
                try {
                    // Cek booking
                    const [rows] = await db.query(
                        `SELECT id, booking_status, contact_email 
                         FROM hotel_bookings WHERE id = ?`,
                        [id]
                    );

                    if (rows.length === 0) {
                        results.push({ id, status: 'FAILED', reason: 'Booking tidak ditemukan' });
                        failCount++;
                        continue;
                    }

                    const booking = rows[0];

                    if (!['Accept', 'Processed'].includes(booking.booking_status)) {
                        results.push({ id, status: 'SKIPPED', reason: `Status: ${booking.booking_status}` });
                        failCount++;
                        continue;
                    }

                    // Kirim email
                    await sendBookingEmails(parseInt(id));
                    results.push({ id, status: 'SUCCESS' });
                    successCount++;

                } catch (err) {
                    results.push({ id, status: 'FAILED', reason: err.message });
                    failCount++;
                }
            }

            return res.json({
                status: "SUCCESS",
                message: `Berhasil mengirim ${successCount} dari ${bookingIds.length} e-tiket`,
                summary: {
                    total: bookingIds.length,
                    success: successCount,
                    failed: failCount
                },
                results: results
            });

        } catch (error) {
            console.error("❌ [BULK RESEND ERROR]:", error.message);
            return res.status(500).json({
                status: "ERROR",
                respMessage: error.message
            });
        }
    }
};

module.exports = HotelBookingAdminController;