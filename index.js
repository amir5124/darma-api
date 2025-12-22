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

const USER_CONFIG = {
    userID: "CF0X64HBR8",
    password: "Darmaj4y4"
};

// State untuk Session Management (Singleton Token)
let cachedToken = null;

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
});

const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🔑 TOKEN MANAGER
 * Mencegah 'airline schedule step missed' dengan menjaga token tetap konsisten
 */
async function getAccessToken() {
    if (cachedToken) return cachedToken;

    try {
        console.log("🔑 [AUTH] Meminta Access Token Baru...");
        const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
        const securityCode = md5(timestamp + md5(USER_CONFIG.password));
        const response = await axios.post(`${BASE_URL}/Session/Login`, {
            token: timestamp,
            securityCode: securityCode,
            language: 0,
            userID: USER_CONFIG.userID
        }, { httpsAgent: agent, timeout: 20000 });

        cachedToken = response.data.accessToken;
        console.log("✅ [AUTH] Token Berhasil Didapatkan:", cachedToken);
        return cachedToken;
    } catch (error) {
        console.error("❌ [AUTH] Login Error:", error.message);
        throw new Error("Gagal autentikasi ke server.");
    }
}

/**
 * 🔍 1. SEARCH SCHEDULES
 */
app.get('/api/get-all-schedules', async (req, res) => {
    console.log(`\n🔍 [SEARCH] ${req.query.origin} -> ${req.query.destination}`);
    let allFlights = [];
    let airlineAccessCode = null;
    let iteration = 0;

    try {
        const token = await getAccessToken();
        let currentAirlineIndex = 0;
        let totalAirline = 0;

        do {
            iteration++;
            const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, {
                tripType: "OneWay",
                origin: req.query.origin,
                destination: req.query.destination,
                departDate: req.query.departDate,
                paxAdult: parseInt(req.query.paxAdult) || 1,
                paxChild: 0, paxInfant: 0,
                airlineAccessCode: airlineAccessCode,
                cacheType: 2, isShowEachAirline: true,
                userID: USER_CONFIG.userID, accessToken: token
            }, { httpsAgent: agent, timeout: 60000 });

            const data = response.data;
            totalAirline = data.totalAirline || 0;
            currentAirlineIndex = data.airlineIndex || 0;
            airlineAccessCode = data.airlineAccessCode;

            if (data.status === "SUCCESS" && data.journeyDepart) {
                allFlights = allFlights.concat(data.journeyDepart);
            }
            if (iteration > 1 && data.airlineIndex === 0) break;
            if (iteration >= 25) break;
            await sleep(300);
        } while (currentAirlineIndex < totalAirline);

        res.json({ total: allFlights.length, data: allFlights });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * 💰 2. GET PRICE (MANDATORY)
 */
app.post('/api/get-price', async (req, res) => {
    try {
        const token = await getAccessToken();
        const payload = {
            ...req.body,
            userID: USER_CONFIG.userID,
            accessToken: token
        };
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * 🍱 3. GET ADDONS
 */
app.post('/api/get-addons', async (req, res) => {
    try {
        const token = await getAccessToken();
        const cleanDepartDate = req.body.departDate.split('T')[0] + "T00:00:00";

        const payload = {
            airlineID: req.body.airlineID,
            origin: req.body.origin,
            destination: req.body.destination,
            tripType: "OneWay",
            departDate: cleanDepartDate,
            returnDate: "0001-01-01T00:00:00",
            schDepart: req.body.schDepart,
            schReturn: "",
            paxAdult: parseInt(req.body.paxAdult) || 1,
            paxChild: 0, paxInfant: 0,
            contactFirstName: (req.body.contactFirstName || "TRAVELER").toUpperCase(),
            contactLastName: (req.body.contactLastName || "MEMBER").toUpperCase(),
            contactTitle: "MR",
            contactCountryCodePhone: "62",
            contactAreaCodePhone: String(req.body.contactAreaCodePhone || "812"),
            contactRemainingPhoneNo: String(req.body.contactRemainingPhoneNo || "3456789"),
            contactEmail: req.body.contactEmail,
            paxDetails: req.body.paxDetails.map(pax => ({
                title: "MR",
                firstName: (pax.firstName || "").toUpperCase(),
                lastName: (pax.lastName || "").toUpperCase(),
                birthDate: pax.birthDate ? pax.birthDate.split('T')[0] + "T00:00:00" : "1990-01-01T00:00:00",
                gender: pax.gender || "Male",
                nationality: "ID",
                type: 0
            })),
            insurance: false,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

/**
 * 🚀 4. CREATE BOOKING (PNR)
 */
app.post('/api/create-booking', async (req, res) => {
    console.log("\n🚀 [BOOKING] Memproses reservasi...");
    try {
        const token = await getAccessToken();
        const cleanDepartDate = req.body.departDate.split('T')[0] + "T00:00:00";

        const payload = {
            airlineID: req.body.airlineID,
            origin: req.body.origin,
            destination: req.body.destination,
            tripType: "OneWay",
            departDate: cleanDepartDate,
            returnDate: "0001-01-01T00:00:00",
            paxAdult: parseInt(req.body.paxAdult) || 1,
            paxChild: 0,
            paxInfant: 0,

            schDeparts: req.body.schDeparts.map(segment => {
                const airlineCode = segment.airlineCode || req.body.airlineID;
                let fNumber = "";
                try {
                    // Extract flight number dari detailSchedule (~ 800~)
                    const match = segment.detailSchedule.match(/~([^~]+)~/);
                    fNumber = (match && match[1]) ? match[1].trim() : (segment.flightNumber || "").replace(/\s/g, '');
                } catch (e) {
                    fNumber = (segment.flightNumber || "").replace(/\s/g, '');
                }

                // Fix QG Format (QG800)
                if (airlineCode === "QG" && !fNumber.startsWith("QG")) {
                    fNumber = "QG" + fNumber;
                }

                return {
                    airlineCode: airlineCode,
                    flightNumber: fNumber,
                    schOrigin: segment.schOrigin,
                    schDestination: segment.schDestination,
                    detailSchedule: segment.detailSchedule,
                    schDepartTime: segment.schDepartTime,
                    schArrivalTime: segment.schArrivalTime,
                    flightClass: segment.flightClass || "Y",
                    garudaNumber: null,
                    garudaAvailability: null
                };
            }),
            schReturns: [],
            contactFirstName: (req.body.contactFirstName || "").toLowerCase(),
            contactLastName: (req.body.contactLastName || "").toLowerCase(),
            contactTitle: "Mr",
            contactCountryCodePhone: "62",
            contactAreaCodePhone: String(req.body.contactAreaCodePhone),
            contactRemainingPhoneNo: String(req.body.contactRemainingPhoneNo),
            contactEmail: req.body.contactEmail,

            paxDetails: req.body.paxDetails.map(pax => {
                const p = {
                    title: (pax.title || "MR").toUpperCase(),
                    firstName: (pax.firstName || "").toLowerCase(),
                    lastName: (pax.lastName || "").toLowerCase(),
                    birthDate: pax.birthdate ? pax.birthdate.split('T')[0] + "T00:00:00" : "1990-01-01T00:00:00",
                    gender: pax.gender || "Male",
                    nationality: "ID",
                    birthCountry: "ID",
                    type: pax.type || 0,
                    IDNumber: null,
                    DocType: null,
                    passportIssuedDate: "0001-01-01T00:00:00",
                    passportExpiredDate: "0001-01-01T00:00:00",
                    insurance: false,
                    addOns: []
                };

                if (pax.baggage) {
                    p.addOns.push({
                        aoOrigin: req.body.origin,
                        aoDestination: req.body.destination,
                        baggageString: pax.baggage,
                        meals: [],
                        seat: "",
                        compartment: "Y"
                    });
                }
                return p;
            }),
            searchKey: null,
            insurance: false,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        console.log("📤 [FINAL BOOKING PAYLOAD]:", JSON.stringify(payload, null, 2));
        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { httpsAgent: agent, timeout: 120000 });
        res.json(response.data);
    } catch (error) {
        console.error("❌ [BOOKING ERROR]:", error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
    =============================================
    🚀 Darmawisata Backend Engine Ready!
    📡 Port     : ${PORT}
    🛡️  Session  : Singleton Token Active
    =============================================
    `);
});