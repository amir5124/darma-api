const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

// 1. SEARCH SCHEDULE
router.get('/get-all-schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true);
        const payload = {
            tripType: "OneWay", 
            origin: req.query.origin, 
            destination: req.query.destination,
            departDate: req.query.departDate + "T00:00:00", 
            paxAdult: 1, paxChild: 0, paxInfant: 0,
            airlineAccessCode: null, cacheType: 0, isShowEachAirline: false,
            userID: USER_CONFIG.userID, accessToken: token
        };

        logger.debug("REQ_SCHEDULE", payload);
        const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { httpsAgent: agent });
        logger.debug("RES_SCHEDULE", response.data);

        res.json({ data: response.data.journeyDepart || [] });
    } catch (error) {
        logger.error("Schedule Error: " + error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 2. PRICE VALIDATION
router.post('/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            airlineID: b.airlineID, origin: b.origin, destination: b.destination,
            tripType: "OneWay", departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", paxAdult: b.paxAdult || 1, paxChild: 0, paxInfant: 0,
            journeyDepartReference: b.schDepart, userID: USER_CONFIG.userID, accessToken: token
        };

        logger.debug("REQ_PRICE", payload);
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent });
        logger.debug("RES_PRICE", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Price Error: " + error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 3. GET ADDONS (Baggage & Meals)
router.post('/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        
        const payload = {
            airlineID: b.airlineID, 
            origin: b.origin, 
            destination: b.destination,
            tripType: b.tripType || "OneWay", 
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", 
            paxAdult: b.paxAdult, 
            paxChild: b.paxChild || 0, 
            paxInfant: b.paxInfant || 0,
            schDepart: b.schDepart, 
            paxDetails: b.paxDetails.map(p => ({
                title: p.title,
                firstName: p.firstName.toUpperCase(),
                lastName: (p.lastName || p.firstName).toUpperCase(),
                birthDate: p.birthDate.includes('T') ? p.birthDate : p.birthDate + "T00:00:00",
                gender: p.gender,
                nationality: "ID",
                birthCountry: "ID",
                type: p.type
            })),
            contactTitle: b.contactTitle || "MR",
            contactFirstName: b.contactFirstName.toUpperCase(),
            contactLastName: b.contactLastName.toUpperCase(),
            contactCountryCodePhone: "62",
            contactAreaCodePhone: "812",
            contactRemainingPhoneNo: b.contactRemainingPhoneNo,
            contactEmail: b.contactEmail,
            userID: USER_CONFIG.userID, 
            accessToken: token
        };

        logger.debug("REQ_ADDONS", payload);
        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        logger.debug("RES_ADDONS", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Addons Error: " + error.message);
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 4. GET SEAT MAP
router.post('/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            tripType: "OneWay",
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            paxAdult: b.paxAdult || 1,
            schDepart: b.schDepart,
            paxDetails: b.paxDetails,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_SEATS", payload);
        const response = await axios.post(`${BASE_URL}/Airline/Seat`, payload, { httpsAgent: agent });
        logger.debug("RES_SEATS", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Seats Error: " + error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 5. CREATE BOOKING
router.post('/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            ...b,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_BOOKING", payload);
        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { httpsAgent: agent });
        logger.debug("RES_BOOKING", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Booking Error: " + error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 6. BOOKING DETAIL
router.post('/booking-detail', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            bookingCode: b.bookingCode,
            bookingDate: b.bookingDate,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_BOOKING_DETAIL", payload);
        const response = await axios.post(`${BASE_URL}/Airline/BookingDetail`, payload, { httpsAgent: agent });
        logger.debug("RES_BOOKING_DETAIL", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Booking Detail Error: " + error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 7. ISSUED TICKET
router.post('/issued-ticket', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            ...b,
            airlineAccessCode: b.airlineID || "QG",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_ISSUED", payload);
        const response = await axios.post(`${BASE_URL}/Airline/Issued`, payload, { httpsAgent: agent });
        logger.debug("RES_ISSUED", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Issued Error: " + error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

module.exports = router;