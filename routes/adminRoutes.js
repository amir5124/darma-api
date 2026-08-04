// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');

// 🔧 FIX: Hapus duplikasi getTicketHtmlContent/generatePdfBuffer/sendTicketEmail
// yang sebelumnya didefinisikan ulang di file ini. Duplikasi ini penyebab
// dashboard admin generate PDF pakai versi lama (tanpa eticket per-passenger,
// default baggage 0kg, dst) walau ticketService.js sudah diperbaiki.
// Sekarang semua fungsi ticket diambil dari satu sumber: ticketService.js
const { getTicketHtmlContent, generatePdfBuffer, sendTicketEmail } = require('../helpers/ticketService');

// ============================================
// ADMIN ROUTES
// ============================================

// 🔥 GET: All bookings with filters - DENGAN PASSENGERS LENGKAP (TANPA ORDER BY DI JSON_ARRAYAGG)
router.get('/bookings', async (req, res) => {
    try {
        const { status, airline, dateRange, search, page = 1, limit = 10 } = req.query;

        console.log('📡 GET /bookings - Query params:', req.query);

        let query = `
            SELECT 
                b.id,
                b.booking_code,
                b.reference_no,
                b.airline_id,
                b.airline_name,
                b.trip_type,
                b.origin,
                b.destination,
                b.origin_port,
                b.destination_port,
                b.depart_date,
                b.ticket_status,
                b.payment_status,
                b.total_price,
                b.sales_price,
                b.admin_fee,
                b.discount,
                (b.total_price + b.admin_fee - b.discount) as total_payment,
                b.time_limit,
                b.pengguna,
                b.customer_email,
                b.payment_method,
                b.va_number,
                b.created_at,
                (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.id) AS total_pax,
                (SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) 
                 FROM passengers p 
                 WHERE p.booking_id = b.id 
                 LIMIT 1) AS main_pax_name,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.id,
                            'title', p.title,
                            'first_name', p.first_name,
                            'last_name', p.last_name,
                            'pax_type', p.pax_type,
                            'phone', p.phone,
                            'id_number', p.id_number,
                            'birth_date', p.birth_date
                        )
                    )
                    FROM passengers p
                    WHERE p.booking_id = b.id
                ) AS passengers
            FROM bookings b 
            WHERE 1=1
        `;

        const params = [];

        if (status && status !== '' && status !== 'undefined') {
            query += ` AND b.ticket_status = ?`;
            params.push(status);
        }

        if (airline && airline !== '' && airline !== 'undefined') {
            query += ` AND b.airline_id = ?`;
            params.push(airline);
        }

        if (search && search !== '' && search !== 'undefined') {
            query += ` AND (b.booking_code LIKE ? OR b.customer_email LIKE ? OR b.pengguna LIKE ? OR b.reference_no LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (dateRange && dateRange !== '' && dateRange !== 'undefined') {
            if (dateRange === 'today') {
                query += ` AND DATE(b.created_at) = CURDATE()`;
            } else if (dateRange === 'week') {
                query += ` AND b.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
            } else if (dateRange === 'month') {
                query += ` AND b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
            }
        }

        // COUNT QUERY
        let countQuery = `SELECT COUNT(*) as total FROM bookings b WHERE 1=1`;
        const countParams = [];

        if (status && status !== '' && status !== 'undefined') {
            countQuery += ` AND b.ticket_status = ?`;
            countParams.push(status);
        }
        if (airline && airline !== '' && airline !== 'undefined') {
            countQuery += ` AND b.airline_id = ?`;
            countParams.push(airline);
        }
        if (search && search !== '' && search !== 'undefined') {
            countQuery += ` AND (b.booking_code LIKE ? OR b.customer_email LIKE ? OR b.pengguna LIKE ? OR b.reference_no LIKE ?)`;
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (dateRange && dateRange !== '' && dateRange !== 'undefined') {
            if (dateRange === 'today') {
                countQuery += ` AND DATE(b.created_at) = CURDATE()`;
            } else if (dateRange === 'week') {
                countQuery += ` AND b.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
            } else if (dateRange === 'month') {
                countQuery += ` AND b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
            }
        }

        let total = 0;
        if (countParams.length > 0) {
            const [countResult] = await db.execute(countQuery, countParams);
            total = countResult[0]?.total || 0;
        } else {
            const [countResult] = await db.execute(countQuery);
            total = countResult[0]?.total || 0;
        }

        query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;

        const safeLimit = parseInt(limit, 10) || 10;
        const safeOffset = (parseInt(page, 10) - 1) * safeLimit;

        params.push(safeLimit, safeOffset);

        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            data: rows,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('❌ Error fetching bookings:', error);
        console.error('❌ SQL Error:', error.sql);
        console.error('❌ SQL Message:', error.sqlMessage);
        res.status(500).json({
            success: false,
            message: error.message,
            sqlError: error.sqlMessage || null
        });
    }
});

// 🔥 GET: Booking detail - DENGAN PASSENGERS LENGKAP (TANPA ORDER BY DI JSON_ARRAYAGG)
router.get('/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.execute(
            `SELECT b.*, 
                    (b.total_price + b.admin_fee - b.discount) as total_payment,
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.id,
                            'title', p.title,
                            'first_name', p.first_name,
                            'last_name', p.last_name,
                            'pax_type', p.pax_type,
                            'phone', p.phone,
                            'id_number', p.id_number,
                            'birth_date', p.birth_date
                        )
                    ) FROM passengers p WHERE p.booking_id = b.id) as passengers,
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', f.id,
                            'flight_number', f.flight_number,
                            'origin', f.origin,
                            'destination', f.destination,
                            'depart_time', f.depart_time,
                            'arrival_time', f.arrival_time,
                            'flight_class', f.flight_class
                        )
                    ) FROM flight_itinerary f WHERE f.booking_id = b.id) as itinerary,
                    (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.id) as total_pax,
                    (SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) 
                     FROM passengers p 
                     WHERE p.booking_id = b.id 
                     LIMIT 1) as main_pax_name
             FROM bookings b 
             WHERE b.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching booking detail:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT: Update booking status
router.put('/bookings/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }

        await db.execute(
            'UPDATE bookings SET ticket_status = ? WHERE id = ?',
            [status, id]
        );

        if (status === 'TICKETED') {
            try {
                const [booking] = await db.execute('SELECT booking_code FROM bookings WHERE id = ?', [id]);
                if (booking.length > 0 && booking[0].booking_code) {
                    setTimeout(() => {
                        sendTicketEmail(booking[0].booking_code).catch(console.error);
                    }, 100);
                }
            } catch (emailErr) {
                console.error('Error sending ticket email:', emailErr);
            }
        }

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Statistics
router.get('/statistics', async (req, res) => {
    try {
        const [total] = await db.execute('SELECT COUNT(*) as total FROM bookings');
        const [pending] = await db.execute("SELECT COUNT(*) as pending FROM bookings WHERE ticket_status = 'HOLD'");
        const [booked] = await db.execute("SELECT COUNT(*) as booked FROM bookings WHERE ticket_status = 'BOOKED'");
        const [ticketed] = await db.execute("SELECT COUNT(*) as ticketed FROM bookings WHERE ticket_status = 'TICKETED'");
        const [cancelled] = await db.execute("SELECT COUNT(*) as cancelled FROM bookings WHERE ticket_status = 'CANCELLED'");
        const [revenue] = await db.execute('SELECT SUM(total_price + admin_fee) as revenue FROM bookings WHERE ticket_status = "TICKETED"');

        const [airlineDist] = await db.execute(
            `SELECT airline_id as name, COUNT(*) as value 
             FROM bookings 
             GROUP BY airline_id 
             ORDER BY value DESC 
             LIMIT 10`
        );

        const [dailyTrend] = await db.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN ticket_status = 'TICKETED' THEN 1 ELSE 0 END) as ticketed,
                SUM(CASE WHEN ticket_status = 'HOLD' THEN 1 ELSE 0 END) as pending
            FROM bookings 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        res.json({
            totalBookings: total[0]?.total || 0,
            pendingPayments: pending[0]?.pending || 0,
            booked: booked[0]?.booked || 0,
            ticketed: ticketed[0]?.ticketed || 0,
            cancelled: cancelled[0]?.cancelled || 0,
            totalRevenue: revenue[0]?.revenue || 0,
            airlineDistribution: airlineDist,
            dailyTrend: dailyTrend
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Export bookings to CSV
router.get('/bookings/export', async (req, res) => {
    try {
        const { status, airline, dateRange } = req.query;
        let query = `
            SELECT 
                booking_code, 
                airline_name, 
                airline_id,
                origin, 
                destination, 
                depart_date, 
                total_price, 
                admin_fee,
                ticket_status, 
                pengguna, 
                customer_email,
                reference_no,
                trip_type,
                created_at
            FROM bookings 
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== '' && status !== 'undefined') {
            query += ` AND ticket_status = ?`;
            params.push(status);
        }
        if (airline && airline !== '' && airline !== 'undefined') {
            query += ` AND airline_id = ?`;
            params.push(airline);
        }
        if (dateRange && dateRange !== '' && dateRange !== 'undefined') {
            if (dateRange === 'today') {
                query += ` AND DATE(created_at) = CURDATE()`;
            } else if (dateRange === 'week') {
                query += ` AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
            } else if (dateRange === 'month') {
                query += ` AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
            }
        }

        query += ` ORDER BY created_at DESC`;

        const [rows] = await db.execute(query, params);

        const headers = [
            'Booking Code', 'Airline', 'Airline ID', 'Origin', 'Destination',
            'Depart Date', 'Total Price', 'Admin Fee', 'Status', 'User',
            'Email', 'Reference No', 'Trip Type', 'Created At'
        ];

        const csv = [
            headers.join(','),
            ...rows.map(row => [
                row.booking_code || '',
                `"${row.airline_name || ''}"`,
                row.airline_id || '',
                row.origin || '',
                row.destination || '',
                row.depart_date || '',
                row.total_price || 0,
                row.admin_fee || 0,
                row.ticket_status || '',
                row.pengguna || '',
                row.customer_email || '',
                row.reference_no || '',
                row.trip_type || '',
                row.created_at || ''
            ].join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=bookings_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting bookings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST: Send reminder email
router.post('/bookings/:id/reminder', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.execute('SELECT * FROM bookings WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const booking = rows[0];

        if (!booking.customer_email) {
            return res.status(400).json({ success: false, message: 'Email customer tidak ditemukan' });
        }

        const subject = `[LinkU] Reminder Pembayaran - ${booking.booking_code}`;
        const emailBody = `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <h3>Reminder Pembayaran</h3>
                <p>Halo,</p>
                <p>Kami mengingatkan bahwa pemesanan tiket dengan kode <b>${booking.booking_code}</b> 
                masih menunggu pembayaran.</p>
                <p>Segera lakukan pembayaran sebelum batas waktu berakhir untuk menerbitkan tiket.</p>
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <p><b>Detail Pemesanan:</b></p>
                    <p>Maskapai: ${booking.airline_name}</p>
                    <p>Rute: ${booking.origin} → ${booking.destination}</p>
                    <p>Tanggal: ${new Date(booking.depart_date).toLocaleDateString('id-ID')}</p>
                    <p>Total: Rp ${(booking.total_price + booking.admin_fee).toLocaleString('id-ID')}</p>
                </div>
                <p style="margin-top: 20px;">Terima kasih atas kepercayaan Anda 🙏</p>
                <p><b>LinkU – Satu aplikasi semua kebutuhan 🚀</b></p>
            </div>
        `;

        await sendBookingEmail(booking.customer_email, subject, emailBody);

        res.json({ success: true, message: 'Reminder email sent successfully' });
    } catch (error) {
        console.error('Error sending reminder:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Generate ticket PDF
router.get('/bookings/:bookingCode/ticket', async (req, res) => {
    try {
        const { bookingCode } = req.params;
        const html = await getTicketHtmlContent(bookingCode, db);
        const pdfBuffer = await generatePdfBuffer(html);
        res.contentType("application/pdf");
        res.setHeader('Content-Disposition', `inline; filename=Ticket-${bookingCode}.pdf`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Error generating ticket:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;