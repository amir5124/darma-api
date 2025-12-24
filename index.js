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

// 2. PRICE VALIDATION
app.post('/api/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = { 
            airlineID: b.airlineID, origin: b.origin, destination: b.destination,
            tripType: "OneWay", departDate: b.departDate.split('T')[0] + "T00:00:00",
            returnDate: "0001-01-01T00:00:00", paxAdult: b.paxAdult || 1, paxChild: 0, paxInfant: 0,
            journeyDepartReference: b.schDepart, userID: USER_CONFIG.userID, accessToken: token 
        };
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 3. GET ADDONS (Baggage & Meals)
app.post('/api/get-addons', async (req, res) => {
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
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 4. GET SEAT MAP
app.post('/api/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            tripType: b.tripType || "OneWay",
            departDate: b.departDate.split('T')[0] + "T00:00:00",
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
            contactEmail: b.contactEmail,
            contactCountryCodePhone: "62",
            contactAreaCodePhone: "812",
            contactRemainingPhoneNo: b.contactRemainingPhoneNo,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/Seat`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 5. CREATE BOOKING
app.post('/api/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            tripType: b.tripType || "OneWay",
            airlineID: b.airlineID,
            origin: b.origin,
            destination: b.destination,
            departDate: b.departDate,
            returnDate: b.returnDate || "0001-01-01T00:00:00",
            paxAdult: b.paxAdult,
            paxChild: b.paxChild || 0,
            paxInfant: b.paxInfant || 0,
            contactTitle: b.contactTitle,
            contactFirstName: b.contactFirstName.toUpperCase(),
            contactLastName: b.contactLastName.toUpperCase(),
            contactEmail: b.contactEmail,
            contactCountryCodePhone: "62",
            contactAreaCodePhone: "812",
            contactRemainingPhoneNo: b.contactRemainingPhoneNo,
            paxDetails: b.paxDetails.map(p => ({
                title: p.title,
                firstName: p.firstName.toUpperCase(),
                lastName: (p.lastName || p.firstName).toUpperCase(),
                birthDate: p.birthDate.includes('T') ? p.birthDate : p.birthDate + "T00:00:00",
                gender: p.gender,
                nationality: "ID",      // Ditambahkan untuk fix error nationality invalid
                birthCountry: "ID",     // Ditambahkan
                IDNumber: p.IDNumber,   
                type: p.type,
                DocType: "KTP",         
                addOns: p.addOns || []
            })),
            schDeparts: b.schDeparts,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_BOOKING", payload);
        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { 
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });
        logger.debug("RES_BOOKING", response.data);
        res.json(response.data);
    } catch (error) {
        logger.error("Booking Error: " + error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

app.listen(3000, () => logger.success("SERVER RUNNING ON PORT 3000"));