const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

// 1. SEARCH SCHEDULE
// routes/flights.js

router.post('/airline-list', async (req, res) => {
    try {
        // Mengambil token yang valid secara otomatis
        const token = await getConsistentToken(); 

        const payload = {
            userID: USER_CONFIG.userID, // Diambil dari file konfigurasi Anda
            accessToken: token
        };

        logger.info("REQ_AIRLINE_LIST: Fetching available airlines");

        const response = await axios.post(`${BASE_URL}/Airline/List`, payload, {
            httpsAgent: agent, // Agent untuk menangani SSL jika diperlukan
            headers: { 'Content-Type': 'application/json' }
        });

        // Log response untuk kebutuhan debug
        logger.debug("RES_AIRLINE_LIST", response.data);

        res.json(response.data);

    } catch (error) {
        logger.error("Airline List Error: " + error.message);
        res.status(500).json({ 
            status: "FAILED", 
            respMessage: "Gagal mengambil daftar maskapai: " + error.message 
        });
    }
});

router.get('/get-all-schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true);
        const q = req.query; // Ambil semua query string

        const payload = {
            // Ambil dari query, jika tidak ada default ke "OneWay"
            tripType: q.tripType || "OneWay", 
            origin: q.origin, 
            destination: q.destination,
            departDate: q.departDate + "T00:00:00", 
            // Ambil jumlah penumpang secara dinamis
            paxAdult: parseInt(q.paxAdult) || 1, 
            paxChild: parseInt(q.paxChild) || 0, 
            paxInfant: parseInt(q.paxInfant) || 0,
            // Opsional: tambahkan returnDate jika RoundTrip
            returnDate: q.tripType === "RoundTrip" ? q.returnDate + "T00:00:00" : "0001-01-01T00:00:00",
            
            airlineAccessCode: null, 
            cacheType: 0, 
            isShowEachAirline: false,
            userID: USER_CONFIG.userID, 
            accessToken: token
        };

        logger.debug("REQ_SCHEDULE", payload);
        const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { httpsAgent: agent });
        
        // Kirimkan data keberangkatan dan kepulangan (jika ada)
        res.json({ 
            data: response.data.journeyDepart || [],
            dataReturn: response.data.journeyReturn || [] 
        });

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
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            tripType: b.tripType || "OneWay",
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            // Jika RoundTrip, returnDate wajib ada, jika tidak pakai default
            returnDate: b.tripType === "RoundTrip" ? b.returnDate.split('T')[0] + "T00:00:00" : "0001-01-01T00:00:00",
            paxAdult: b.paxAdult || 1,
            paxChild: b.paxChild || 0,
            paxInfant: b.paxInfant || 0,
            // Referensi Pergi
            journeyDepartReference: b.schDepart, 
            // FIX: Tambahkan Referensi Pulang untuk RoundTrip
            journeyReturnReference: b.tripType === "RoundTrip" ? b.schReturn : null,
            
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_PRICE", payload);
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

router.post('/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const isRoundTrip = b.tripType === "RoundTrip";

        const payload = {
            airlineID: b.airlineID, 
            origin: b.origin, 
            destination: b.destination,
            tripType: b.tripType, 
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            // FIX: returnDate harus dinamis
            returnDate: isRoundTrip ? b.returnDate.split('T')[0] + "T00:00:00" : "0001-01-01T00:00:00", 
            paxAdult: parseInt(b.paxAdult), 
            paxChild: parseInt(b.paxChild) || 0, 
            paxInfant: parseInt(b.paxInfant) || 0,
            schDepart: b.schDepart,
            // Tambahkan schReturn jika ada data pulang
            schReturn: isRoundTrip ? b.schReturn : null, 
            paxDetails: b.paxDetails.map(p => ({
                title: p.title,
                firstName: p.firstName,
                lastName: (p.lastName || p.firstName),
                birthDate: p.birthDate.includes('T') ? p.birthDate : p.birthDate + "T00:00:00",
                gender: p.gender, nationality: "ID", birthCountry: "ID", type: p.type
            })),
            contactTitle: b.contactTitle || "MR",
            contactFirstName: b.contactFirstName,
            contactLastName: b.contactLastName,
            contactCountryCodePhone: "62",
            contactAreaCodePhone: "812",
            contactRemainingPhoneNo: b.contactRemainingPhoneNo,
            contactEmail: b.contactEmail,
            userID: USER_CONFIG.userID, 
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
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
            tripType: b.tripType || "OneWay", 
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            paxAdult: b.paxAdult || 1,
            paxChild: b.paxChild || 0,
            paxInfant: b.paxInfant || 0,
            schDepart: b.schDepart,
            paxDetails: b.paxDetails, 
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // TAMBAHAN UNTUK ROUNDTRIP
        if (b.tripType === "RoundTrip") {
            payload.returnDate = b.returnDate.split('T')[0] + "T00:00:00";
            payload.schReturn = b.schReturn;
        }

        logger.debug("REQ_SEATS", payload);
        const response = await axios.post(`${BASE_URL}/Airline/Seat`, payload, { httpsAgent: agent });
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
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            tripType: b.tripType,
            departDate: b.departDate,
            returnDate: b.returnDate,
            paxAdult: b.paxAdult,
            paxChild: b.paxChild,
            paxInfant: b.paxInfant,
            schDeparts: b.schDeparts,
            schReturns: b.schReturns,
            contactFirstName: b.contactFirstName,
            contactLastName: b.contactLastName,
            contactTitle: b.contactTitle,
            contactCountryCodePhone: b.contactCountryCodePhone,
            contactAreaCodePhone: b.contactAreaCodePhone,
            contactRemainingPhoneNo: b.contactRemainingPhoneNo,
            contactEmail: b.contactEmail,
            paxDetails: b.paxDetails, // Membawa struktur addOns yang sudah diperbaiki
            insurance: b.insurance,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { 
            httpsAgent: agent 
        });

        res.json(response.data);
    } catch (error) {
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