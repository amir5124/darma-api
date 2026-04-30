const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

router.post('/get-balance', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { userID: USER_CONFIG.userID, accessToken: token };
        
        logger.info("Mengecek Saldo Agen...");
        const response = await axios.post(`${BASE_URL}/Agent/Balance`, payload, { httpsAgent: agent });
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

module.exports = router;