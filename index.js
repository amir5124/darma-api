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
const dluPaymentRoutes = require('./routes/dluPaymentRoutes');

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
app.get('/tracking', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
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
app.use('/api/dlu-payments', dluPaymentRoutes);

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