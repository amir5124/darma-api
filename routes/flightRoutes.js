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
            // Sesuai Dokumen API
            airlineID: q.airlineID || "", 
            tripType: q.tripType || "OneWay",
            origin: q.origin,
            destination: q.destination,
            departDate: q.departDate, // Sesuaikan format: YYYY-MM-DD (Dokumentasi tidak minta jam)
            returnDate: q.tripType === "RoundTrip" ? q.returnDate : "0001-01-01",
            
            // Perbaikan Error: Ambil dari q, bukan this.paxCount
            paxAdult: parseInt(q.paxAdult) || 1,
            paxChild: parseInt(q.paxChild) || 0,
            paxInfant: parseInt(q.paxInfant) || 0, 
            
            promoCode: "",
            airlineAccessCode: "",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // Menggunakan endpoint /Airline/Schedule sesuai dokumen baru Anda
        const response = await axios.post(`${BASE_URL}/Airline/Schedule`, payload, { httpsAgent: agent });
        
        logFullAction("SCHEDULE", payload, response.data);
        
        // Sesuaikan mapping data response dari vendor
        res.json({
            data: response.data.journeyDepart || [],
            dataReturn: response.data.journeyReturn || []
        });
    } catch (error) {
        console.error("Backend Error:", error.message);
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
            // Gunakan langsung dari body karena frontend sudah memformatnya
            departDate: b.departDate, 
            returnDate: b.returnDate || "0001-01-01T00:00:00Z",
            paxAdult: b.paxAdult,
            paxChild: b.paxChild,
            paxInfant: b.paxInfant,
            searchKey: "",
            promoCode: "",
            schDeparts: b.schDeparts,
            schReturns: b.schReturns,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Airline/Price`, payload, { httpsAgent: agent });
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
        
        // Membersihkan payload dari field yang mungkin mengganggu/duplikat
        const { userID: bodyUserID, accessToken: bodyToken, ...cleanBody } = req.body;

        const payload = {
            ...cleanBody,
            airlineAccessCode: cleanBody.airlineAccessCode || cleanBody.airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // --- LOGGING REQUEST ---
        console.log("==================== [API REQUEST: CREATE BOOKING] ====================");
        console.log("Time:", new Date().toLocaleString());
        console.log("To Partner URL:", `${BASE_URL}/Airline/Booking`);
        console.log("Payload:", JSON.stringify(payload, null, 2));

        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { 
            httpsAgent: agent,
            timeout: 60000 // Beri timeout 1 menit karena proses booking sering lama
        });

        // --- LOGGING RESPONSE ---
        console.log("-------------------- [PARTNER RESPONSE] --------------------");
        console.log("Status Code:", response.status);
        console.log("Response Data:", JSON.stringify(response.data, null, 2));
        console.log("========================================================================");

        res.json(response.data);
    } catch (error) {
        console.error("!!! [BOOKING ERROR] !!!");
        console.error("Message:", error.message);
        if (error.response) {
            console.error("Response dari Partner:", JSON.stringify(error.response.data, null, 2));
        }
        res.json({ 
            status: "FAILED", 
            respMessage: "Terjadi kesalahan saat menghubungi partner: " + error.message 
        });
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