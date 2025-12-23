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

// --- HELPER FIXER: Memperbaiki format Bulan 00 menjadi bulan yang benar ---
const fixSchDepart = (sch, dateStr) => {
    if (!sch) return sch;
    // Jika mengandung 00/ kita coba perbaiki
    if (sch.includes('00/')) {
        const parts = dateStr.split('-');
        const correctMonth = parts[1]; 
        const correctYear = parts[0];
        
        // Pola regex untuk menangkap 00/XX/2025
        const pattern = new RegExp(`00\/(\\d{2})\/${correctYear}`, 'g');
        return sch.replace(pattern, `${correctMonth}/$1/${correctYear}`);
    }
    return sch;
};

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

// 1. SEARCH SCHEDULE
app.get('/api/get-all-schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true); 
        const payload = {
            tripType: "OneWay", origin: req.query.origin, destination: req.query.destination,
            departDate: req.query.departDate + "T00:00:00", paxAdult: 1, paxChild: 0, paxInfant: 0,
            airlineAccessCode: null, cacheType: 0, isShowEachAirline: false,
            userID: USER_CONFIG.userID, accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { httpsAgent: agent });
        res.json({ data: response.data.journeyDepart || [] });
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 2. GET PRICE (Validasi Harga & Ambil Referensi Segar)
app.post('/api/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = { 
            airlineID: b.airlineID, origin: b.origin, destination: b.destination,
            tripType: "OneWay", departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", paxAdult: 1, paxChild: 0, paxInfant: 0,
            // PATCH DISINI
            journeyDepartReference: fixSchDepart(b.schDepart, b.departDate), 
            userID: USER_CONFIG.userID, accessToken: token 
        };
        logger.debug("REQ_PRICE", payload);
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 3. SEAT MAP (Pilih Kursi)
app.post('/api/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            tripType: "OneWay",
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00",
            // PATCH DISINI
            schDepart: fixSchDepart(b.schDepart, b.departDate), 
            schReturn: "",
            paxAdult: 1, paxChild: 0, paxInfant: 0,
            departureAirlineSegmentCode: null,
            departureFareBasisCode: null,
            contactTitle: "Mr",
            contactFirstName: b.paxDetails[0].firstName,
            contactLastName: b.paxDetails[0].lastName,
            contactCountryCodePhone: "62",
            contactAreaCodePhone: "812",
            contactRemainingPhoneNo: "12345678",
            contactEmail: "traveler@mail.com",
            paxDetails: b.paxDetails.map(p => ({
                title: p.title || "MR",
                firstName: p.firstName,
                lastName: p.lastName,
                birthDate: "1990-01-01T00:00:00",
                gender: "Male",
                nationality: "ID",
                birthCountry: "ID",
                type: 0
            })),
            insurance: false,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_SEAT_MAP", payload);
        const response = await axios.post(`${BASE_URL}/Airline/SeatAllAirline`, payload, { httpsAgent: agent });
        logger.debug("RES_SEAT_MAP", response.data);
        
        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        logger.error("Seat Map API Error: " + JSON.stringify(errorData));
        res.status(error.response?.status || 500).json({ 
            status: "ERROR", 
            message: "API Gagal merespon peta kursi.",
            detail: errorData 
        });
    }
});

// 4. ADDONS (Baggage & Meal - Wajib sebelum Booking)
app.post('/api/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            airlineID: b.airlineID, origin: b.origin, destination: b.destination,
            tripType: "OneWay", departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", paxAdult: 1, paxChild: 0, paxInfant: 0,
            // PATCH DISINI
            schDepart: fixSchDepart(b.schDepart, b.departDate), 
            paxDetails: b.paxDetails || [],
            userID: USER_CONFIG.userID, accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 5. FINAL BOOKING
app.post('/api/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        
        // Memperbaiki schDepart di dalam array schDeparts jika ada
        if (b.schDeparts && b.schDeparts.length > 0) {
            b.schDeparts[0].detailSchedule = fixSchDepart(b.schDeparts[0].detailSchedule, b.departDate);
        }

        const payload = {
            ...b,
            departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00",
            userID: USER_CONFIG.userID, accessToken: token
        };
        
        logger.debug("REQ_BOOKING", payload);
        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { httpsAgent: agent });
        logger.debug("RES_BOOKING", response.data);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

app.listen(3000, () => logger.success("SERVER PESAWAT RUNNING ON PORT 3000"));