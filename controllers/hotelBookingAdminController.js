// controllers/hotelBookingAdminController.js
const db = require('../config/db');
const { sendBookingEmails, generateBookingPDF } = require('../utils/hotelMailer');
const XLSX = require('xlsx'); // 🔥 Tambahkan ini

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
    // 🔥 GET /export-excel - EXPORT TO EXCEL
    // ============================================================
    exportToExcel: async (req, res) => {
        try {
            const {
                search = '',
                status = '',
                source = '',
                date_from = '',
                date_to = ''
            } = req.query;

            // Build where clause (sama dengan listBookings)
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

            // Ambil semua data (tanpa pagination)
            const [rows] = await db.query(
                `SELECT
                    hb.id,
                    hb.reservation_no,
                    hb.voucher_no,
                    hb.os_ref_no,
                    hb.agent_os_ref,
                    hb.hotel_name,
                    hb.hotel_address,
                    hb.check_in_date,
                    hb.check_out_date,
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
                    ${SOURCE_CASE_SQL} AS source_detected,
                    hp.payment_status,
                    hp.payment_method,
                    hp.payment_date,
                    hp.admin_fee AS payment_admin_fee,
                    (SELECT COUNT(*) FROM hotel_booking_paxes hbp WHERE hbp.booking_id = hb.id) AS guest_count
                 FROM hotel_bookings hb
                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id
                 WHERE ${whereSql}
                 ORDER BY hb.created_at DESC`,
                params
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    status: "ERROR",
                    respMessage: "Tidak ada data untuk diexport"
                });
            }

            // ============================================
            // FORMAT DATA UNTUK EXCEL
            // ============================================
            const excelData = rows.map((booking, index) => {
                // Format tanggal
                const checkIn = booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                }) : '-';
                const checkOut = booking.check_out_date ? new Date(booking.check_out_date).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                }) : '-';
                const bookingDate = booking.booking_date ? new Date(booking.booking_date).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                }) : '-';

                // Status
                const statusMap = {
                    'New': 'Baru',
                    'Accept': 'Diterima',
                    'Processed': 'Diproses',
                    'Cancelled': 'Dibatalkan',
                    'Reject': 'Ditolak'
                };
                const statusLabel = statusMap[booking.booking_status] || booking.booking_status || '-';

                return {
                    'No': index + 1,
                    'Reservasi': booking.reservation_no || '-',
                    'Voucher': booking.voucher_no || '-',
                    'OS Ref No': booking.os_ref_no || '-',
                    'Hotel': booking.hotel_name || '-',
                    'Kota': booking.city_name || '-',
                    'Alamat': booking.hotel_address || '-',
                    'Check In': checkIn,
                    'Check Out': checkOut,
                    'Tipe Kamar': booking.room_name || '-',
                    'Jumlah Kamar': booking.room_count || 1,
                    'Sarapan': booking.breakfast_type || 'Room Only',
                    'Total Harga': Number(booking.total_price) || 0,
                    'Komisi': Number(booking.commission) || 0,
                    'Handling Fee': Number(booking.handling_fee) || 0,
                    'Admin Fee': Number(booking.payment_admin_fee) || 0,
                    'Mata Uang': booking.currency || 'IDR',
                    'Status': statusLabel,
                    'Status Pembayaran': booking.payment_status || 'PENDING',
                    'Metode Bayar': booking.payment_method || '-',
                    'Sumber': booking.source_detected === 'app' ? 'App' : 'Web',
                    'Pengguna': booking.username || 'Guest',
                    'Email': booking.contact_email || '-',
                    'Telepon': booking.contact_phone || '-',
                    'Jumlah Tamu': booking.guest_count || 1,
                    'Tanggal Booking': bookingDate,
                    'Dibuat': booking.created_at ? new Date(booking.created_at).toLocaleString('id-ID') : '-'
                };
            });

            // ============================================
            // BUAT WORKBOOK
            // ============================================
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // Set column widths
            worksheet['!cols'] = [
                { wch: 5 },   // No
                { wch: 14 },  // Reservasi
                { wch: 14 },  // Voucher
                { wch: 15 },  // OS Ref No
                { wch: 25 },  // Hotel
                { wch: 18 },  // Kota
                { wch: 30 },  // Alamat
                { wch: 20 },  // Check In
                { wch: 20 },  // Check Out
                { wch: 20 },  // Tipe Kamar
                { wch: 12 },  // Jumlah Kamar
                { wch: 15 },  // Sarapan
                { wch: 15 },  // Total Harga
                { wch: 14 },  // Komisi
                { wch: 14 },  // Handling Fee
                { wch: 14 },  // Admin Fee
                { wch: 10 },  // Mata Uang
                { wch: 14 },  // Status
                { wch: 18 },  // Status Pembayaran
                { wch: 15 },  // Metode Bayar
                { wch: 10 },  // Sumber
                { wch: 18 },  // Pengguna
                { wch: 25 },  // Email
                { wch: 18 },  // Telepon
                { wch: 12 },  // Jumlah Tamu
                { wch: 20 },  // Tanggal Booking
                { wch: 22 },  // Dibuat
            ];

            // Style header
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let col = range.s.c; col <= range.e.c; col++) {
                const headerCell = XLSX.utils.encode_cell({ r: 0, c: col });
                if (worksheet[headerCell]) {
                    worksheet[headerCell].s = {
                        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
                        fill: { fgColor: { rgb: "24B3AE" } },
                        alignment: { horizontal: "center", vertical: "center" }
                    };
                }
            }

            // Format angka
            const numberColumns = ['Total Harga', 'Komisi', 'Handling Fee', 'Admin Fee'];
            const numberColIndexes = numberColumns.map(col => {
                const headers = Object.keys(excelData[0]);
                return headers.indexOf(col);
            });

            for (let row = 1; row <= excelData.length; row++) {
                for (const colIdx of numberColIndexes) {
                    if (colIdx === -1) continue;
                    const cellRef = XLSX.utils.encode_cell({ r: row, c: colIdx });
                    if (worksheet[cellRef]) {
                        worksheet[cellRef].s = {
                            alignment: { horizontal: "right" },
                            numFmt: '#,##0.00'
                        };
                    }
                }
            }

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Hotel Bookings');

            // ============================================
            // BUAT SUMMARY SHEET
            // ============================================
            const totalRevenue = rows.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
            const totalCommission = rows.reduce((sum, b) => sum + Number(b.commission || 0), 0);
            const totalHandlingFee = rows.reduce((sum, b) => sum + Number(b.handling_fee || 0), 0);

            const summaryData = [
                ['LAPORAN HOTEL BOOKING'],
                [''],
                ['Tanggal Export', new Date().toLocaleString('id-ID')],
                ['Total Booking', rows.length],
                ['Total Revenue', totalRevenue],
                ['Total Komisi', totalCommission],
                ['Total Handling Fee', totalHandlingFee],
                [''],
                ['Status Booking'],
                ['New', rows.filter(b => b.booking_status === 'New').length],
                ['Accept', rows.filter(b => b.booking_status === 'Accept').length],
                ['Processed', rows.filter(b => b.booking_status === 'Processed').length],
                ['Cancelled', rows.filter(b => b.booking_status === 'Cancelled').length],
                ['Reject', rows.filter(b => b.booking_status === 'Reject').length],
                [''],
                ['Status Pembayaran'],
                ['SUCCESS', rows.filter(b => b.payment_status === 'SUCCESS').length],
                ['PENDING', rows.filter(b => b.payment_status === 'PENDING' || !b.payment_status).length],
                [''],
                ['Sumber'],
                ['App', rows.filter(b => b.username !== null).length],
                ['Web', rows.filter(b => b.username === null).length],
            ];

            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
            
            // Style summary header
            if (summarySheet['A1']) {
                summarySheet['A1'].s = {
                    font: { bold: true, sz: 16, color: { rgb: "24B3AE" } },
                    alignment: { horizontal: "center" }
                };
            }
            
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

            // ============================================
            // GENERATE FILE
            // ============================================
            let fileName = `Hotel_Bookings`;
            if (status) fileName += `_${status}`;
            fileName += `_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(buffer);

        } catch (error) {
            console.error("❌ [EXPORT EXCEL ERROR]:", error.message);
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

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "Booking ID tidak valid"
                });
            }

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

            const allowedStatus = ['Accept', 'Processed'];
            if (!allowedStatus.includes(booking.booking_status)) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: `Booking status "${booking.booking_status}" tidak bisa mengirim e-tiket. Status harus Accept atau Processed.`
                });
            }

            const [paxes] = await db.query(
                `SELECT title, first_name as firstName, last_name as lastName 
                 FROM hotel_booking_paxes 
                 WHERE booking_id = ?`,
                [id]
            );

            const targetEmail = email || booking.contact_email;

            if (!targetEmail) {
                return res.status(400).json({
                    status: "ERROR",
                    respMessage: "Email tujuan tidak ditemukan. Silakan kirim dengan parameter email."
                });
            }

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

            const [paxes] = await db.query(
                `SELECT title, first_name as firstName, last_name as lastName 
                 FROM hotel_booking_paxes 
                 WHERE booking_id = ?`,
                [id]
            );

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

            const pdfBuffer = await generateBookingPDF(pdfData, paxes);

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