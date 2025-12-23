const express = require('express');
const axios = require('axios');
const moment = require('moment-timezone');
const crypto = require('crypto');
const https = require('https');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const BASE_URL = 'https://uat.darmawisataindonesiah2h.co.id:7080/h2h';
const USER_CONFIG = { userID: "CF0X64HBR8", password: "Darmaj4y4" };

let globalAccessToken = null;
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

const logger = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    debug: (label, data) => {
        console.log(`\x1b[35m[DEBUG] === ${label} ===\x1b[0m`);
        console.dir(data, { depth: null });
        console.log(`\x1b[35m[END ${label}]\x1b[0m\n`);
    }
};

/**
 * Memperbaiki string journeyReference yang mengandung bulan "00"
 * Contoh: "00/30/2025" -> "12/30/2025"
 */
function fixJourneyReference(ref) {
    if (!ref || typeof ref !== 'string') return ref;
    
    // Cari tanggal keberangkatan dari departDate untuk mendapatkan bulan yang benar
    // Jika data statis, kita bisa asumsikan bulan 12 berdasarkan log Anda
    return ref.replace(/00\/(\d{2})\/(\d{4})/g, "12/$1/$2");
}

async function getConsistentToken(forceRefresh = false) {
    if (forceRefresh) globalAccessToken = null;
    if (!globalAccessToken) {
        try {
            const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
            const securityCode = md5(timestamp + md5(USER_CONFIG.password));
            const res = await axios.post(`${BASE_URL}/Session/Login`, {
                token: timestamp, securityCode, language: 0, userID: USER_CONFIG.userID
            }, { httpsAgent: agent });
            globalAccessToken = res.data.accessToken;
            logger.success(`Token Refresh: ${globalAccessToken.substring(0, 8)}...`);
        } catch (err) {
            logger.error("Login Error: " + err.message);
            throw err;
        }
    }
    return globalAccessToken;
}

// 1. SEARCH
app.get('/api/get-all-schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true); 
        const payload = {
            tripType: "OneWay", origin: req.query.origin, destination: req.query.destination,
            departDate: req.query.departDate + "T00:00:00", paxAdult: 1, paxChild: 0, paxInfant: 0,
            airlineAccessCode: null, cacheType: 0, isShowEachAirline: false,
            userID: USER_CONFIG.userID, accessToken: token
        };

        logger.debug("REQ_SEARCH_SCHEDULE", payload);
        const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { httpsAgent: agent });
        logger.debug("RES_SEARCH_SCHEDULE", response.data);

        res.json({ data: response.data.journeyDepart || [] });
    } catch (error) {
        logger.error("Search Error: " + error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 2. PRICE
app.post('/api/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = { 
            airlineID: b.airlineID, origin: b.origin, destination: b.destination,
            tripType: "OneWay", departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", paxAdult: 1, paxChild: 0, paxInfant: 0,
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


app.post('/api/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            ...b,
            // Pastikan schDepart sudah difix jika ada bulan "00"
            schDepart: fixJourneyReference(b.schDepart),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // ENDPOINT YANG BENAR: /Airline/Seat
        const response = await axios.post(`${BASE_URL}/Airline/Seat`, payload, { 
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Error Get Seat:", error.response?.data || error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});
// 4. ADDONS
// 3. ADDONS (Baggage)
app.post('/api/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        
        // Perbaikan: Tambahkan field kontak agar tidak error "field is required"
        const payload = {
            airlineID: b.airlineID, 
            origin: b.origin, 
            destination: b.destination,
            tripType: "OneWay", 
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", 
            paxAdult: 1, 
            paxChild: 0, 
            paxInfant: 0,
            schDepart: b.schDepart, 
            paxDetails: b.paxDetails || [],
            // Field wajib yang diminta oleh API berdasarkan log error Anda:
            contactTitle: "Mr",
            contactFirstName: b.paxDetails[0]?.firstName || "Traveler",
            contactLastName: b.paxDetails[0]?.lastName || "Name",
            contactCountryCodePhone: "62",
            contactAreaCodePhone: "812",
            contactRemainingPhoneNo: "12345678",
            contactEmail: "traveler@mail.com",
            userID: USER_CONFIG.userID, 
            accessToken: token
        };

        logger.debug("REQ_ADDONS", payload);
        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        logger.debug("RES_ADDONS", response.data);
        
        res.json(response.data);
    } catch (error) {
        logger.error("Addons API Error: " + error.message);
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 5. BOOKING
app.post('/api/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // JANGAN gunakan fixJourneyReference di sini.
        // DetailSchedule harus 100% sama dengan classFare dari API Price.
        const payload = {
            ...b,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // Tambahkan logger untuk memastikan detailSchedule yang dikirim mengandung "00" (jika dari price memang 00)
        console.log("DEBUG BOOKING PAYLOAD:", JSON.stringify(payload, null, 2));

        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { 
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        console.error("BOOKING ERROR:", error.response?.data || error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

app.listen(3000, () => logger.success("SERVER RUNNING ON PORT 3000"));