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
router.get('/schedules', async (req, res) => {
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

router.get('/get-all-schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true);
        const q = req.query;

        let allJourneyDepart = [];
        let allJourneyReturn = [];
        let totalAirline = 0;
        let airlineIndex = -1; // Mulai dari -1 agar loop pertama berjalan
        let currentAccessCode = null; 
        let safetyCounter = 0;

        console.log(`=== [UAT POOLING START] Route: ${q.origin} -> ${q.destination} ===`);

        // POIN PENTING: REPEAT UNTIL airlineIndex == totalAirline
        // Kita gunakan while (airlineIndex < totalAirline)
        // Safety counter 30 untuk mencegah infinite loop jika API partner error
        while ((airlineIndex < totalAirline || airlineIndex === -1) && safetyCounter < 30) {
            safetyCounter++;

            const payload = {
                "tripType": q.tripType || "OneWay",
                "origin": q.origin,
                "destination": q.destination,
                "departDate": q.departDate.substring(0, 10),
                "returnDate": q.tripType === "RoundTrip" ? q.returnDate.substring(0, 10) : "0001-01-01",
                "paxAdult": parseInt(q.paxAdult) || 1,
                "paxChild": parseInt(q.paxChild) || 0,
                "paxInfant": parseInt(q.paxInfant) || 0,
                "promoCode": null,
                "airlineAccessCode": currentAccessCode, // null pada request pertama
                "cacheType": 2, // FullLive
                "isShowEachAirline": true,
                "userID": USER_CONFIG.userID,
                "accessToken": token
            };

            const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { 
                httpsAgent: agent,
                timeout: 60000 
            });

            const result = response.data;

            if (result.status === "SUCCESS") {
                // Update total dan index dari response terbaru
                totalAirline = result.totalAirline;
                airlineIndex = result.airlineIndex;
                currentAccessCode = result.airlineAccessCode;

                const foundNow = result.journeyDepart?.length || 0;
                console.log(`[UAT LOG] Step ${safetyCounter}: Index ${airlineIndex}/${totalAirline} | Ditemukan: ${foundNow} jadwal | AccessCode: ${currentAccessCode ? 'YES' : 'NULL'}`);

                // Gabungkan data jika ada (biarpun 0 tetap lanjut loop)
                if (result.journeyDepart && result.journeyDepart.length > 0) {
                    allJourneyDepart = allJourneyDepart.concat(result.journeyDepart);
                }
                
                if (result.journeyReturn && result.journeyReturn.length > 0) {
                    allJourneyReturn = allJourneyReturn.concat(result.journeyReturn);
                }

                // Jika sudah mencapai total, paksa berhenti
                if (airlineIndex >= totalAirline && totalAirline > 0) break;

            } else {
                console.error(`[UAT ERROR] Stop di Index ${airlineIndex}: ${result.respMessage}`);
                break;
            }

            // Tambahkan jeda 1 detik agar tidak terlalu cepat (opsional)
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`=== [UAT POOLING FINISHED] Total Gabungan: ${allJourneyDepart.length} jadwal ===`);

        res.json({
            status: "SUCCESS",
            totalAirline: totalAirline,
            data: allJourneyDepart,
            dataReturn: allJourneyReturn
        });

    } catch (error) {
        console.error("Backend Error:", error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

router.post('/get-all-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            "airlineID": b.airlineID,
            "origin": b.origin,
            "destination": b.destination,
            "tripType": b.tripType || "OneWay",
            "departDate": b.departDate, // Format ISO (YYYY-MM-DDTHH:mm:ss)
            "returnDate": b.returnDate || "0001-01-01T00:00:00",
            "paxAdult": parseInt(b.paxAdult),
            "paxChild": parseInt(b.paxChild),
            "paxInfant": parseInt(b.paxInfant),
            "airlineAccessCode": b.airlineAccessCode || null,
            "journeyDepartReference": b.journeyDepartReference,
            "journeyReturnReference": b.journeyReturnReference || null,
            "userID": USER_CONFIG.userID,
            "accessToken": token
        };

        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { 
            httpsAgent: agent,
            timeout: 30000 
        });
        
        logFullAction("PRICE_ALL_AIRLINE", payload, response.data);
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