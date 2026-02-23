"use strict";

// server.js atau index.js
var express = require('express');

var cors = require('cors');

var _require = require('./helpers/darmaHelper'),
    logger = _require.logger; // 1. Import Routes (Tambahkan Train)


var flightRoutes = require('./routes/flightRoutes');

var agentRoutes = require('./routes/agentRoutes');

var hotelRoutes = require('./routes/hotelRoutes');

var shipRoutes = require('./routes/shipRoutes');

var shpdluRoutes = require('./routes/shipdluRoutes');

var trainRoutes = require('./routes/trainRoutes'); // <-- BARU


var historyRoutes = require('./routes/historyRoutes');

var paymentRoutes = require('./routes/paymentRoutes');

var shipPaymentRoutes = require('./routes/shipPaymentRoutes');

var app = express();
app.use(express.json());
app.use(cors()); // 2. Daftarkan Routes (Tambahkan Train)

app.use('/api/flights', flightRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/hotel-payments', hotelPaymentRoutes);
app.use('/api/ship', shipRoutes);
app.use('/api/shipdlu', shpdluRoutes);
app.use('/api/train', trainRoutes); // <-- BARU (Akses via /api/train/schedule)

app.use('/api/booking-history', historyRoutes);
app.use('/api', paymentRoutes);
app.use('/api/pay/ship', shipPaymentRoutes);
var PORT = 3000;
app.listen(PORT, function () {
  logger.success("=============================================");
  logger.success("   SERVER DARMAWISATA MULTI-PRODUK JALAN");
  logger.success("   Port           : ".concat(PORT));
  logger.success("   API Pesawat    : /api/flights");
  logger.success("   API Hotel      : /api/hotels");
  logger.success("   API Kereta     : /api/train"); // <-- Tambahan Log

  logger.success("   API Kapal      : /api/ship");
  logger.success("   API Kapal DLU  : /api/shipdlu");
  logger.success("   API Agent      : /api/agent");
  logger.success("=============================================");
});