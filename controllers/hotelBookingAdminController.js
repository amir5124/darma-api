const db = require('../config/db');

// ============================================================
// Controller: Melihat data booking hotel secara LENGKAP.
// Menggabungkan data dari hotel_bookings + hotel_payments +
// hotel_booking_paxes + hotel_booking_facilities, TANPA peduli
// booking itu dibuat lewat flow aplikasi (hotelRoutes.js) atau
// flow web (hotelController.js) — karena keduanya menulis ke
// tabel yang sama.
//
// CATATAN PENTING soal "source" (aplikasi vs web):
// Skema tabel hotel_bookings TIDAK punya kolom eksplisit untuk
// menandai asal booking. Sebagai gantinya dipakai heuristik:
//   - Flow WEB (hotelController.js)   -> tidak pernah mengisi kolom `username` -> selalu NULL
//   - Flow APLIKASI (hotelRoutes.js)  -> selalu mengisi `username` (fallback 'guest') -> selalu NOT NULL
// Ini best-effort berdasarkan kode yang ada sekarang. Kalau ke depannya
// ingin akurat 100%, sebaiknya tambahkan kolom eksplisit, misalnya:
//   ALTER TABLE hotel_bookings ADD COLUMN booking_source VARCHAR(20) DEFAULT 'app';
// lalu set 'web' secara eksplisit di controller hotelController.js (dokumen 10).
// ============================================================

const SOURCE_CASE_SQL = `CASE WHEN hb.username IS NULL THEN 'web' ELSE 'app' END`;

const HotelBookingAdminController = {

    // ============================================================
    // GET /api/hotel-bookings-admin/list
    // Query params (semua opsional):
    //   page, limit          -> pagination (default page=1, limit=20)
    //   search                -> cari di reservation_no, hotel_name, contact_email, contact_phone
    //   status                -> filter booking_status (PENDING, PAID, Accept, Processed, FAILED_VENDOR_*, dll)
    //   source                -> 'app' | 'web' | (kosong = semua)
    //   date_from, date_to    -> filter check_in_date (format YYYY-MM-DD)
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
            const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20)); // cap 100 per halaman
            const offset = (pageNum - 1) * limitNum;

            const whereClauses = ['1=1'];
            const params = [];

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

            if (status && status.trim() !== '') {
                whereClauses.push(`hb.booking_status = ?`);
                params.push(status.trim());
            }

            if (source === 'app') {
                whereClauses.push(`hb.username IS NOT NULL`);
            } else if (source === 'web') {
                whereClauses.push(`hb.username IS NULL`);
            }

            if (date_from) {
                whereClauses.push(`hb.check_in_date >= ?`);
                params.push(date_from);
            }
            if (date_to) {
                whereClauses.push(`hb.check_in_date <= ?`);
                params.push(date_to + ' 23:59:59');
            }

            const whereSql = whereClauses.join(' AND ');

            // 1. Hitung total data untuk pagination
            const [[{ total }]] = await db.query(
                `SELECT COUNT(*) as total FROM hotel_bookings hb WHERE ${whereSql}`,
                params
            );

            // 2. Ambil data utama + join payment + hitung jumlah tamu
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
                    ${SOURCE_CASE_SQL} AS source,
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
            console.error("❌ [BOOKING ADMIN LIST ERROR]:", error.message);
            return res.status(500).json({ status: "ERROR", respMessage: error.message });
        }
    },


    // ============================================================
    // GET /api/hotel-bookings-admin/:id
    // Detail lengkap satu booking: data utama + payment + paxes + facilities
    // ============================================================
    getBookingDetail: async (req, res) => {
        try {
            const { id } = req.params;

            const [rows] = await db.query(
                `SELECT
                    hb.*,
                    ${SOURCE_CASE_SQL} AS source,
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
                return res.status(404).json({ status: "ERROR", respMessage: "Booking tidak ditemukan." });
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
            console.error("❌ [BOOKING ADMIN DETAIL ERROR]:", error.message);
            return res.status(500).json({ status: "ERROR", respMessage: error.message });
        }
    }
};

module.exports = HotelBookingAdminController;