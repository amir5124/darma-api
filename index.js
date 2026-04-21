const express = require('express');
const cors = require('cors');
const path = require('path'); // <-- Tambahkan ini untuk manajemen path file
const { logger } = require('./helpers/darmaHelper');

// 1. Import Routes
const flightRoutes = require('./routes/flightRoutes');
const agentRoutes = require('./routes/agentRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const shipRoutes = require('./routes/shipRoutes'); 
const shpdluRoutes = require('./routes/shipdluRoutes');
const trainRoutes = require('./routes/trainRoutes'); 
const historyRoutes = require('./routes/historyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const shipPaymentRoutes = require('./routes/shipPaymentRoutes');
const hotelPaymentRoutes = require('./routes/hotelPaymentRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Melayani file statis dari folder 'public' (seperti gambar, css, js frontend)
app.use(express.static('public'));

/**
 * 3. ROUTE KHUSUS TRACKING (CARA 2)
 * Ketika user klik link dari email: https://darma.siappgo.id/tracking?no=...
 * Maka server akan mengirimkan file tracking.html
 */
// Endpoint untuk melayani file HTML
app.get('/tracking', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

// Endpoint API yang akan dipanggil oleh JavaScript di tracking.html
app.get('/api/tracking-data', async (req, res) => {
    const { no, os } = req.query;

    if (!no && !os) {
        return res.status(400).json({ status: "Error", message: "Parameter tidak lengkap" });
    }

    try {
        // Cari data booking berdasarkan reservation_no ATAU os_ref_no
        const [rows] = await db.execute(
            `SELECT * FROM hotel_bookings WHERE reservation_no = ? OR os_ref_no = ? LIMIT 1`,
            [no || null, os || null]
        );

        if (rows.length === 0) {
            return res.status(404).json({ status: "Error", message: "Data tidak ditemukan" });
        }

        const booking = rows[0];

        // Ambil data tamu
        const [paxes] = await db.execute(
            `SELECT title, first_name, last_name FROM hotel_booking_paxes WHERE booking_id = ?`,
            [booking.id]
        );

        res.json({
            status: "Success",
            data: booking,
            paxes: paxes
        });

    } catch (err) {
        res.status(500).json({ status: "Error", message: err.message });
    }
});

// 2. Daftarkan API Routes
app.use('/api/flights', flightRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/hotel-payments', hotelPaymentRoutes);
app.use('/api/ship', shipRoutes);
app.use('/api/shipdlu', shpdluRoutes);
app.use('/api/train', trainRoutes);
app.use('/api/booking-history', historyRoutes);
app.use('/api', paymentRoutes);
app.use('/api/pay/ship', shipPaymentRoutes);

const PORT = 3000;
app.listen(PORT, () => {
    logger.success(`=============================================`);
    logger.success(`   SERVER DARMAWISATA MULTI-PRODUK JALAN`);
    logger.success(`   Port           : ${PORT}`);
    logger.success(`   Tracking Link  : /tracking`); // <-- Info baru
    logger.success(`   API Hotel      : /api/hotels`);
    logger.success(`   API Kereta     : /api/train`);
    logger.success(`=============================================`);
});