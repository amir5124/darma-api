"use strict";

var express = require('express');

var cors = require('cors');

var path = require('path'); // <-- Tambahkan ini untuk manajemen path file


var _require = require('./helpers/darmaHelper'),
    logger = _require.logger; // 1. Import Routes


var flightRoutes = require('./routes/flightRoutes');

var agentRoutes = require('./routes/agentRoutes');

var hotelRoutes = require('./routes/hotelRoutes');

var shipRoutes = require('./routes/shipRoutes');

var shpdluRoutes = require('./routes/shipdluRoutes');

var trainRoutes = require('./routes/trainRoutes');

var historyRoutes = require('./routes/historyRoutes');

var paymentRoutes = require('./routes/paymentRoutes');

var shipPaymentRoutes = require('./routes/shipPaymentRoutes');

var hotelPaymentRoutes = require('./routes/hotelPaymentRoutes');

var dluPaymentRoutes = require('./routes/dluPaymentRoutes');

var app = express(); // Middleware

app.use(express.json());
app.use(cors()); // Melayani file statis dari folder 'public' (seperti gambar, css, js frontend)

app.use(express["static"]('public'));
/**
 * 3. ROUTE KHUSUS TRACKING (CARA 2)
 * Ketika user klik link dari email: https://darma.siappgo.id/tracking?no=...
 * Maka server akan mengirimkan file tracking.html
 */

app.get('/tracking', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
}); // 2. Daftarkan API Routes

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
var PORT = 3000;
app.listen(PORT, function () {
  logger.success("=============================================");
  logger.success("   SERVER DARMAWISATA MULTI-PRODUK JALAN");
  logger.success("   Port           : ".concat(PORT));
  logger.success("   Tracking Link  : /tracking"); // <-- Info baru

  logger.success("   API Hotel      : /api/hotels");
  logger.success("   API Kereta     : /api/train");
  logger.success("=============================================");
});