const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

// Helper untuk log request dan response secara rapi
const logFullAction = (name, payload, response) => {
    logger.info(`=== [DEBUG] ${name} ===`);
    logger.debug(`REQ_${name}: ${JSON.stringify(payload, null, 2)}`);
    logger.debug(`RES_${name}: ${JSON.stringify(response, null, 2)}`);
    logger.info(`=== [END ${name}] ===`);
};

// 1. AIRLINE LIST
router.post('/airline-list', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { userID: USER_CONFIG.userID, accessToken: token };
        const response = await axios.post(`${BASE_URL}/Airline/List`, payload, { httpsAgent: agent });
        logFullAction("AIRLINE_LIST", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 2. SEARCH SCHEDULE
router.get('/get-all-schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true);
        const q = req.query;
        const payload = {
            tripType: q.tripType || "OneWay",
            origin: q.origin,
            destination: q.destination,
            departDate: q.departDate + "T00:00:00",
            paxAdult: parseInt(q.paxAdult) || 1,
            paxChild: parseInt(q.paxChild) || 0,
            paxInfant: parseInt(q.paxInfant) || 0,
            returnDate: q.tripType === "RoundTrip" ? q.returnDate + "T00:00:00" : "0001-01-01T00:00:00",
            airlineAccessCode: null,
            cacheType: 0,
            isShowEachAirline: false,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { httpsAgent: agent });
        logFullAction("SCHEDULE", payload, response.data);
        res.json({
            data: response.data.journeyDepart || [],
            dataReturn: response.data.journeyReturn || []
        });
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 3. PRICE VALIDATION
router.post('/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            tripType: b.tripType || "OneWay",
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: b.tripType === "RoundTrip" ? b.returnDate.split('T')[0] + "T00:00:00" : "0001-01-01T00:00:00",
            paxAdult: b.paxAdult || 1,
            paxChild: b.paxChild || 0,
            paxInfant: b.paxInfant || 0,
            journeyDepartReference: b.schDepart,
            journeyReturnReference: b.tripType === "RoundTrip" ? b.schReturn : null,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent });
        logFullAction("PRICE", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 4. GET ADDONS
router.post('/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            ...b,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        logFullAction("ADDONS", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 5. GET SEATS
router.post('/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            ...b,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/Seat`, payload, { httpsAgent: agent });
        logFullAction("SEATS", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 6. CREATE BOOKING
router.post('/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            ...req.body,
            airlineAccessCode: req.body.airlineAccessCode || req.body.airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { httpsAgent: agent });
        logFullAction("BOOKING", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 7. BOOKING DETAIL & ISSUED (Sama seperti sebelumnya dengan tambahan logFullAction)
router.post('/booking-detail', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { ...req.body, userID: USER_CONFIG.userID, accessToken: token };
        const response = await axios.post(`${BASE_URL}/Airline/BookingDetail`, payload, { httpsAgent: agent });
        logFullAction("BOOKING_DETAIL", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

router.post('/issued-ticket', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { ...req.body, userID: USER_CONFIG.userID, accessToken: token };
        const response = await axios.post(`${BASE_URL}/Airline/Issued`, payload, { httpsAgent: agent });
        logFullAction("ISSUED", payload, response.data);
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

module.exports = router;