const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');


router.post('/schedule', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            // FIX 1: Paksa string kosong jika dikirim "0" agar mencari semua kereta
            trainID: (b.trainID === "" || !b.trainID) ? "" : String(b.trainID),
            
            paxAdult: parseInt(b.paxAdult) || 1,
            paxChild: parseInt(b.paxChild) || 0,
            paxInfant: parseInt(b.paxInfant) || 0,
            
            // FIX 2: Hilangkan "Z" di akhir tanggal jika ada
            departDate: b.departDate ? b.departDate.replace('Z', '') : "",
            
            origin: String(b.origin).toUpperCase(),
            destination: String(b.destination).toUpperCase(),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_TRAIN_SCHEDULE: ${payload.origin} -> ${payload.destination} on ${payload.departDate}`);

        const response = await axios.post(`${BASE_URL}/Train/Schedule`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Train Schedule Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});



module.exports = router;