// server.js atau index.js
const express = require('express');
const cors = require('cors');
const { logger } = require('./helpers/darmaHelper');

// 1. Import Routes (Tambahkan Train)
const flightRoutes = require('./routes/flightRoutes');
const agentRoutes = require('./routes/agentRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const shipRoutes = require('./routes/shipRoutes'); 
const shpdluRoutes = require('./routes/shipdluRoutes');
const trainRoutes = require('./routes/trainRoutes'); // <-- BARU

const app = express();
app.use(express.json());
app.use(cors());

// 2. Daftarkan Routes (Tambahkan Train)
app.use('/api/flights', flightRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/ship', shipRoutes);
app.use('/api/shipdlu', shpdluRoutes);
app.use('/api/train', trainRoutes); // <-- BARU (Akses via /api/train/schedule)

const PORT = 3000;
app.listen(PORT, () => {
    logger.success(`=============================================`);
    logger.success(`   SERVER DARMAWISATA MULTI-PRODUK JALAN`);
    logger.success(`   Port           : ${PORT}`);
    logger.success(`   API Pesawat    : /api/flights`);
    logger.success(`   API Hotel      : /api/hotels`);
    logger.success(`   API Kereta     : /api/train`);   // <-- Tambahan Log
    logger.success(`   API Kapal      : /api/ship`); 
    logger.success(`   API Kapal DLU  : /api/shipdlu`);
    logger.success(`   API Agent      : /api/agent`);
    logger.success(`=============================================`);
});