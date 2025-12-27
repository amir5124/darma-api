const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

/**
 * 1. GET SHIP ROUTES (Untuk Dropdown Pelabuhan)
 * Endpoint ini mengambil daftar rute yang tersedia
 */
router.post('/routes', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHIP_ROUTES: Fetching available ship routes");

        const response = await axios.post(`${BASE_URL}/Ship/Route`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Ship Route Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

/**
 * 2. SHIP SCHEDULE SEARCH
 */
// routes/shipRoutes.js

router.post('/schedule', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Di shipRoutes.js pastikan begini:
        const payload = {
            shipID: "",
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            departStartDate: b.departStartDate,
            departEndDate: b.departEndDate,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`RE-TESTING SHIP SCHEDULE: ${payload.originPort} -> ${payload.destinationPort}`);

        const response = await axios.post(`${BASE_URL}/Ship/Schedule`, payload, {
            httpsAgent: agent,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Ship Schedule Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

router.post('/availability', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Payload disusun sesuai dokumentasi yang Anda berikan
        const payload = {
            originPort: String(b.originPort),
            originCall: parseInt(b.originCall) || 0,
            destinationPort: String(b.destinationPort),
            destinationCall: parseInt(b.destinationCall) || 0,
            shipNumber: String(b.shipNumber),
            departDate: b.departDate, // Format: "2019-08-24T14:15:22Z"
            subClass: b.subClass || "",
            pax: b.pax.map(p => ({
                paxType: parseInt(p.paxType),     // 0: Adult, 1: Child, 2: Infant
                paxGender: parseInt(p.paxGender), // 0: Male, 1: Female
                paxTotal: parseInt(p.paxTotal)
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHIP_AVAILABILITY: Ship ${payload.shipNumber} from ${payload.originPort}`);
        logger.debug("PAYLOAD_AVAILABILITY", payload);

        const response = await axios.post(`${BASE_URL}/Ship/Availability`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHIP_AVAILABILITY", response.data);

        // LOGIKA BARU: Jika API tidak kasih numCode, kita buatkan sendiri di backend
        const finalResponse = response.data;
        if (finalResponse.status === "SUCCESS" && !finalResponse.numCode) {
            // Kita generate ID unik berdasarkan timestamp
            finalResponse.numCode = `SHIP-${Date.now()}`;
        }

        res.json(finalResponse);

    } catch (error) {
        logger.error("Ship Availability Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.message
        });
    }
});

router.post('/get-room', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Payload disusun sesuai spesifikasi Darmawisata
        const payload = {
            originPort: String(b.originPort),
            originCall: parseInt(b.originCall),
            destinationPort: String(b.destinationPort),
            destinationCall: parseInt(b.destinationCall),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate, // Format ISO "YYYY-MM-DDTHH:mm:ssZ"
            subClass: String(b.subClass),
            pax: b.pax.map(p => ({
                paxType: parseInt(p.paxType),
                paxGender: parseInt(p.paxGender),
                paxTotal: parseInt(p.paxTotal)
            })),
            // Data pembeli tiket (Ticket Buyer)
            ticketBuyerName: b.ticketBuyerName || "Guest",
            ticketBuyerEmail: b.ticketBuyerEmail || "guest@mail.com",
            ticketBuyerAddress: b.ticketBuyerAddress || "Indonesia",
            ticketBuyerPhone: b.ticketBuyerPhone || "08123456789",
            family: b.family === true || b.family === "true", // Boolean
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHIP_GETROOM: Ship ${payload.shipNumber} for ${payload.ticketBuyerName}`);
        logger.debug("PAYLOAD_GETROOM", payload);

        const response = await axios.post(`${BASE_URL}/Ship/GetRoom`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHIP_GETROOM", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship GetRoom Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

router.post('/booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Payload disusun sesuai dokumentasi yang Anda berikan
        const payload = {
            numCode: b.numCode || "",            // Biasanya didapat dari proses sebelumnya atau kosong jika awal
            originPort: String(b.originPort),
            originCall: parseInt(b.originCall),
            destinationPort: String(b.destinationPort),
            destinationCall: parseInt(b.destinationCall),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,            // Format: "2019-08-24T14:15:22Z"
            paxDetails: b.paxDetails.map(p => ({
                firstName: p.firstName,
                lastName: p.lastName || "",      // Jika nama hanya satu kata, lastName dikosongkan/isi sama
                birthDate: p.birthDate,          // Format: "2019-08-24T14:15:22Z"
                ID: p.ID,                        // NIK atau Nomor Identitas
                phone: p.phone,
                paxType: parseInt(p.paxType),     // 0: Adult, 1: Child, 2: Infant
                paxGender: parseInt(p.paxGender)  // 0: Male, 1: Female
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHIP_BOOKING: Booking for ${payload.paxDetails.length} pax on Ship ${payload.shipNumber}`);
        logger.debug("PAYLOAD_BOOKING", payload);

        const response = await axios.post(`${BASE_URL}/Ship/Booking`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHIP_BOOKING", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship Booking Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.response ? error.response.data : error.message
        });
    }
});

/**
 * SHIP ISSUED
 * Proses final untuk menerbitkan tiket (pembayaran)
 */
router.post('/issued', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            numCode: String(b.numCode),
            bookingDate: b.bookingDate, // Format ISO "2025-12-28T01:20:42Z"
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHIP_ISSUED: Issued for numCode ${payload.numCode}`);

        const response = await axios.post(`${BASE_URL}/Ship/Issued`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHIP_ISSUED", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship Issued Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

module.exports = router;