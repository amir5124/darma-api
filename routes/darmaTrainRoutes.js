const express = require('express');
const axios = require('axios');
const router = express.Router();
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');

// Helper kecil biar tiap endpoint gak nulis ulang boilerplate axios call
async function callDarma(path, payload, logLabel) {
    const token = await getConsistentToken();
    const finalPayload = {
        ...payload,
        userID: USER_CONFIG.userID,
        accessToken: token
    };

    logger.info(`${logLabel}: calling ${path}`);

    const response = await axios.post(`${BASE_URL}${path}`, finalPayload, {
        httpsAgent: agent,
        headers: { 'Content-Type': 'application/json' }
    });

    return response.data;
}

// SEMENTARA: hapus setelah trainID ketemu
router.get('/test-trainid', async (req, res) => {
    const candidates = ['PK', 'GMR', '1', '01', '001', '0', 'KAI', 'KA', 'KERETA', 'TRAIN', 'TRAIN01', 'TRAIN1', 'DARMA', 'KAI01', 'KAI001', USER_CONFIG.userID];
    const results = [];
    for (const id of candidates) {
        try {
            const data = await callDarma('/Train/Route', { trainID: id }, 'TEST_TRAINID');
            results.push({ trainID: id, status: data.status, respMessage: data.respMessage, routes: data.routes ? data.routes.length : null });
        } catch (e) {
            results.push({ trainID: id, status: 'ERROR', respMessage: e.message });
        }
        await new Promise(r => setTimeout(r, 400));
    }
    res.json(results);
});

// =====================================================
// 1. GET TRAIN ROUTES
// POST /Train/Route
// =====================================================
router.post('/routes', async (req, res) => {
    try {
        const { trainID } = req.body;

        const data = await callDarma('/Train/Route', { trainID }, 'REQ_TRAIN_ROUTES');

        res.json(data);
    } catch (error) {
        logger.error("Train Route Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 2. GET TRAIN SCHEDULE
// POST /Train/Schedule
// =====================================================
router.post('/schedule', async (req, res) => {
    try {
        const {
            trainID,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            origin,
            destination
        } = req.body;

        const data = await callDarma('/Train/Schedule', {
            trainID,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            origin,
            destination
        }, 'REQ_TRAIN_SCHEDULE');

        res.json(data);
    } catch (error) {
        logger.error("Train Schedule Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 3. GET SEAT MAP
// POST /Train/SeatMap
// =====================================================
router.post('/seatmap', async (req, res) => {
    try {
        const {
            origin,
            destination,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            trainNumber,
            trainID,
            subClass,
            bookingCode,
            bookingDate
        } = req.body;

        const data = await callDarma('/Train/SeatMap', {
            origin,
            destination,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            trainNumber,
            trainID,
            subClass,
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_SEATMAP');

        res.json(data);
    } catch (error) {
        logger.error("Train SeatMap Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 4. TAKE SEAT
// POST /Train/TakeSeat
// =====================================================
router.post('/take-seat', async (req, res) => {
    try {
        const {
            passengers,
            bookingCode,
            bookingDate,
            trainID
        } = req.body;

        const data = await callDarma('/Train/TakeSeat', {
            passengers,
            bookingCode,
            bookingDate,
            trainID
        }, 'REQ_TRAIN_TAKESEAT');

        res.json(data);
    } catch (error) {
        logger.error("Train TakeSeat Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 5. BOOKING
// POST /Train/Booking
// =====================================================
router.post('/booking', async (req, res) => {
    try {
        const {
            origin,
            destination,
            departDate,
            trainNumber,
            availabilityClass,
            subClass,
            contactName,
            contactPhone,
            paxAdult,
            paxChild,
            paxInfant,
            passengers,
            trainID
        } = req.body;

        const data = await callDarma('/Train/Booking', {
            origin,
            destination,
            departDate,
            trainNumber,
            availabilityClass,
            subClass,
            contactName,
            contactPhone,
            paxAdult,
            paxChild,
            paxInfant,
            passengers,
            trainID
        }, 'REQ_TRAIN_BOOKING');

        res.json(data);
    } catch (error) {
        logger.error("Train Booking Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 6. ISSUED
// POST /Train/Issued
// =====================================================
router.post('/issued', async (req, res) => {
    try {
        const { bookingCode, bookingDate } = req.body;

        const data = await callDarma('/Train/Issued', {
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_ISSUED');

        res.json(data);
    } catch (error) {
        logger.error("Train Issued Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 7. BOOKING DETAIL
// POST /Train/BookingDetail
// =====================================================
router.post('/booking-detail', async (req, res) => {
    try {
        const { bookingCode, bookingDate } = req.body;

        const data = await callDarma('/Train/BookingDetail', {
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_BOOKING_DETAIL');

        res.json(data);
    } catch (error) {
        logger.error("Train BookingDetail Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 8. CANCEL
// POST /Train/Cancel
// =====================================================
router.post('/cancel', async (req, res) => {
    try {
        const { bookingCode, bookingDate } = req.body;

        const data = await callDarma('/Train/Cancel', {
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_CANCEL');

        res.json(data);
    } catch (error) {
        logger.error("Train Cancel Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

module.exports = router;