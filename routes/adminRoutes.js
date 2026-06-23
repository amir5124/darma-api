// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all bookings with filters
router.get('/bookings', async (req, res) => {
    try {
        const { status, airline, dateRange, search, page = 1, limit = 10 } = req.query;
        let query = `
      SELECT b.*, 
             (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) as total_pax,
             (SELECT CONCAT(first_name, ' ', last_name) FROM passengers WHERE booking_id = b.id LIMIT 1) as main_pax_name
      FROM bookings b 
      WHERE 1=1
    `;
        const params = [];

        if (status) {
            query += ` AND b.ticket_status = ?`;
            params.push(status);
        }

        if (airline) {
            query += ` AND b.airline_id = ?`;
            params.push(airline);
        }

        if (search) {
            query += ` AND (b.booking_code LIKE ? OR b.customer_email LIKE ? OR b.pengguna LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (dateRange) {
            const now = new Date();
            let dateFilter = '';
            if (dateRange === 'today') {
                dateFilter = `DATE(b.created_at) = CURDATE()`;
            } else if (dateRange === 'week') {
                dateFilter = `b.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
            } else if (dateRange === 'month') {
                dateFilter = `b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
            }
            if (dateFilter) {
                query += ` AND ${dateFilter}`;
            }
        }

        // Get total count
        const countQuery = query.replace(/\bSELECT.*?\bFROM/, 'SELECT COUNT(*) as total FROM');
        const [countResult] = await db.execute(countQuery, params);
        const total = countResult[0]?.total || 0;

        // Add pagination
        query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        params.push(parseInt(limit), offset);

        const [rows] = await db.execute(query, params);

        res.json({
            success: true,
            data: rows,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get booking detail
router.get('/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.execute(
            `SELECT b.*, 
       (SELECT JSON_ARRAYAGG(
          JSON_OBJECT('first_name', first_name, 'last_name', last_name, 'pax_type', pax_type)
       ) FROM passengers WHERE booking_id = b.id) as passengers
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

// Update booking status
router.put('/bookings/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.execute(
            'UPDATE bookings SET ticket_status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get statistics
router.get('/statistics', async (req, res) => {
    try {
        const [total] = await db.execute('SELECT COUNT(*) as total FROM bookings');
        const [pending] = await db.execute("SELECT COUNT(*) as pending FROM bookings WHERE ticket_status = 'HOLD'");
        const [ticketed] = await db.execute("SELECT COUNT(*) as ticketed FROM bookings WHERE ticket_status = 'TICKETED'");
        const [revenue] = await db.execute('SELECT SUM(total_price + admin_fee) as revenue FROM bookings WHERE ticket_status = "TICKETED"');

        // Airline distribution
        const [airlineDist] = await db.execute(
            'SELECT airline_id as name, COUNT(*) as value FROM bookings GROUP BY airline_id ORDER BY value DESC LIMIT 10'
        );

        // Daily trend (last 7 days)
        const [dailyTrend] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN ticket_status = 'TICKETED' THEN 1 ELSE 0 END) as ticketed
      FROM bookings 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

        res.json({
            totalBookings: total[0]?.total || 0,
            pendingPayments: pending[0]?.pending || 0,
            ticketed: ticketed[0]?.ticketed || 0,
            totalRevenue: revenue[0]?.revenue || 0,
            airlineDistribution: airlineDist,
            dailyTrend: dailyTrend
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Export bookings
router.get('/bookings/export', async (req, res) => {
    try {
        const { status, airline, dateRange } = req.query;
        let query = 'SELECT booking_code, airline_name, origin, destination, depart_date, total_price, ticket_status, pengguna, customer_email FROM bookings WHERE 1=1';
        const params = [];

        // Add filters (similar to GET /bookings)
        if (status) {
            query += ` AND ticket_status = ?`;
            params.push(status);
        }
        if (airline) {
            query += ` AND airline_id = ?`;
            params.push(airline);
        }

        const [rows] = await db.execute(query, params);

        // Convert to CSV
        const headers = ['Booking Code', 'Airline', 'Origin', 'Destination', 'Depart Date', 'Total Price', 'Status', 'User', 'Email'];
        const csv = [
            headers.join(','),
            ...rows.map(row => [
                row.booking_code,
                row.airline_name,
                row.origin,
                row.destination,
                row.depart_date,
                row.total_price,
                row.ticket_status,
                row.pengguna,
                row.customer_email
            ].join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=bookings_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting bookings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send reminder
router.post('/bookings/:id/reminder', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.execute('SELECT * FROM bookings WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const booking = rows[0];
        // Kirim email reminder (gunakan mailer Anda)
        // await sendReminderEmail(booking.customer_email, booking.booking_code);

        res.json({ success: true, message: 'Reminder sent successfully' });
    } catch (error) {
        console.error('Error sending reminder:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;