// server.js atau index.js
const express = require('express');
const cors = require('cors');
const { logger } = require('./helpers/darmaHelper');

// Import Routes
const flightRoutes = require('./routes/flightRoutes');
const agentRoutes = require('./routes/agentRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const shipRoutes = require('./routes/shipRoutes'); 
const shpdluRoutes = require('./routes/shipdluRoutes');

const app = express();
app.use(express.json());
app.use(cors());

// Daftarkan Routes
app.use('/api/flights', flightRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/ship', shipRoutes);
app.use('/api/shipdlu', shpdluRoutes);

const PORT = 3000;
app.listen(PORT, () => {
    logger.success(`=============================================`);
    logger.success(`   SERVER DARMAWISATA MULTI-PRODUK JALAN`);
    logger.success(`   Port          : ${PORT}`);
    logger.success(`   API Pesawat   : /api/flights`);
    logger.success(`   API Hotel     : /api/hotels`);
    logger.success(`   API Kapal     : /api/ship`); // Info tambahan di log
    logger.success(`   API Agent     : /api/agent`);
    logger.success(`=============================================`);
});