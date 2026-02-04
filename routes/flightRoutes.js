const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');
const flightController = require('../controllers/flightController');
/**
 * HELPER: ARCHIVE DATA KE DATABASE
 * Membersihkan format ISO (T/Z) agar kompatibel dengan MySQL DATE & DATETIME
 */
const AIRLINE_GROUPS = {
    // AirAsia Group
    'AK': 'QZ', 'FD': 'QZ', 'XT': 'QZ', 'Z2': 'QZ', 'QZ': 'QZ',
    
    // Lion Air Group - SEMUA harus lari ke JTA
    'JT': 'JTA',  // Tambahkan ini!
    'IW': 'JTA', 
    'IU': 'JTA', 
    'ID': 'JTA', 
    'JTA': 'JTA',
    
    // Sriwijaya Group
    'IN': 'SJ', 'SJ': 'SJ',
    
    // Sisanya...
    'IL': 'TN', 'TN': 'TN',
};

// Fungsi pencarian dinamis
const getParentID = (code) => {
    if (!code) return "";
    const cleanCode = code.trim().toUpperCase();
    return AIRLINE_GROUPS[cleanCode] || cleanCode;
};

// --- ENDPOINTS ---

// 1. AIRLINE LIST
router.post('/airline-list', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/List`, { userID: USER_CONFIG.userID, accessToken: token }, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 2. AIRLINE ROUTE
// 1. AIRLINE ROUTE
router.post('/airline-route', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const { airlineID } = req.body;

        if (!airlineID) {
            return res.status(400).json({
                status: "FAILED",
                respMessage: "airlineID is required"
            });
        }

        const payload = {
            airlineID: airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // LOG REQUEST
        console.log("✈️ [Request] Airline Route:", JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Airline/Route`, payload, { httpsAgent: agent });

        // LOG RESPONSE
        console.log("✅ [Response] Airline Route Status:", response.data.status);

        res.json(response.data);
    } catch (error) {
        console.error("Error Airline Route:", error.message);
        res.status(500).json({
            status: "FAILED",
            respMessage: error.response?.data?.respMessage || error.message
        });
    }
});

// 2. SEARCH SCHEDULE
router.get('/schedules', async (req, res) => {
    try {
        const token = await getConsistentToken(true);
        const q = req.query;
        const payload = {
            airlineID: q.airlineID || "",
            tripType: q.tripType || "OneWay",
            origin: q.origin,
            destination: q.destination,
            departDate: q.departDate,
            returnDate: q.tripType === "RoundTrip" ? q.returnDate : "0001-01-01",
            paxAdult: parseInt(q.paxAdult) || 1,
            paxChild: parseInt(q.paxChild) || 0,
            paxInfant: parseInt(q.paxInfant) || 0,
            promoCode: "",
            airlineAccessCode: "",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // LOG REQUEST
        console.log("📅 [Request] Search Schedule:", JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Airline/Schedule`, payload, { httpsAgent: agent });

        // LOG RESPONSE
        console.log("✅ [Response] Search Schedule Status:", response.data.status);

        res.json({
            data: response.data.journeyDepart || [],
            dataReturn: response.data.journeyReturn || []
        });
    } catch (error) {
        console.error("🔥 Error Schedule:", error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 3. PRICE VALIDATION
router.post('/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { 
            ...req.body, 
            userID: USER_CONFIG.userID, 
            accessToken: token 
        };

        // LOG REQUEST
        console.log("💰 [Request] Get Price:", JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Airline/Price`, payload, { httpsAgent: agent });

        // LOG RESPONSE
        console.log("✅ [Response] Get Price Status:", response.data.status);

        res.json(response.data);
    } catch (error) {
        console.error("🔥 Error Price:", error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 4. POOLING SCHEDULE ALL AIRLINE
router.get('/get-all-schedules', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log("🚀 [SSE] Memulai pencarian jadwal...");

    try {
        const token = await getConsistentToken(true);
        const q = req.query;
        let totalAirline = 0;
        let airlineIndex = -1;
        let currentAccessCode = null;
        let safetyCounter = 0;

        while ((airlineIndex < totalAirline || airlineIndex === -1) && safetyCounter < 40) {
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
                "airlineAccessCode": currentAccessCode,
                "cacheType": 2,
                "isShowEachAirline": true,
                "userID": USER_CONFIG.userID,
                "accessToken": token
            };

            // LOG REQUEST DALAM LOOP SSE
            console.log(`📡 [SSE-Request] Step ${safetyCounter}:`, JSON.stringify(payload));

            const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, {
                httpsAgent: agent,
                timeout: 60000
            });

            const result = response.data;

            // LOG RESPONSE DALAM LOOP SSE
            console.log(`✅ [SSE-Response] Step ${safetyCounter} Status:`, result.status);

            if (result.status === "SUCCESS") {
                totalAirline = result.totalAirline;
                airlineIndex = result.airlineIndex;
                currentAccessCode = result.airlineAccessCode;

                const rootAirlineID = result.airlineID;
                const rootAirlineName = result.airlineName || rootAirlineID;

                const injectData = (list) => (list || []).map(item => {
                    const specificCode = (item.segment && item.segment[0].flightDetail[0].airlineCode) || rootAirlineID;
                    return {
                        ...item,
                        airlineID: specificCode, 
                        airline_parent: getParentID(specificCode),
                        airline_name: rootAirlineName
                    };
                });

                res.write(`data: ${JSON.stringify({
                    status: "PARTIAL",
                    totalAirline,
                    airlineIndex,
                    journeyDepart: injectData(result.journeyDepart),
                    journeyReturn: injectData(result.journeyReturn)
                })}\n\n`);

                if (airlineIndex >= totalAirline && totalAirline > 0) break;
            } else {
                console.log(`⚠️ Maskapai index ${airlineIndex} gagal: ${result.respMessage}`);
                if (result.respMessage === "Session Expired") break; 
            }
            await new Promise(r => setTimeout(r, 500));
        }

        res.write(`data: ${JSON.stringify({ status: "COMPLETED" })}\n\n`);
        res.end();
    } catch (error) {
        console.error("🔥 SSE Error:", error.message);
        res.write(`data: ${JSON.stringify({ status: "ERROR", message: error.message })}\n\n`);
        res.end();
    }
});

// 5. PRICE ALL AIRLINE
router.post('/get-all-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const finalAirlineID = getParentID(b.airlineID);

        const payload = {
            "airlineID": finalAirlineID, 
            "origin": b.origin,
            "destination": b.destination,
            "tripType": b.tripType || "OneWay",
            "departDate": b.departDate,
            "returnDate": b.returnDate || "0001-01-01T00:00:00",
            "paxAdult": parseInt(b.paxAdult) || 1,
            "paxChild": parseInt(b.paxChild) || 0,
            "paxInfant": parseInt(b.paxInfant) || 0,
            "airlineAccessCode": b.airlineAccessCode || null,
            "journeyDepartReference": b.journeyDepartReference,
            "journeyReturnReference": b.journeyReturnReference || null,
            "userID": USER_CONFIG.userID,
            "accessToken": token
        };

        // LOG REQUEST
        console.log(`💰 [Request] Price Check (${b.airlineID}):`, JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { 
            httpsAgent: agent, 
            timeout: 45000 
        });

        // LOG RESPONSE
        console.log("✅ [Response] Price Check Status:", response.data.status);

        res.json(response.data);

    } catch (error) {
        console.error("🔥 Price Error:", error.message);
        
        let msg = error.message;
        if (error.response && error.response.data && error.response.data.respMessage) {
            msg = error.response.data.respMessage;
        }

        res.status(500).json({ 
            status: "ERROR", 
            respMessage: msg 
        });
    }
});

// 6. ADDONS & SEATS
router.post('/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { 
            ...req.body, 
            userID: USER_CONFIG.userID, 
            accessToken: token 
        };

        // LOG REQUEST
        console.log("🎒 [Request] Get Addons:", JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, payload, { httpsAgent: agent });
        
        // LOG RESPONSE
        console.log("✅ [Response] Get Addons Status:", response.data.status);

        res.json(response.data);
    } catch (error) {
        console.error("🔥 Error Addons:", error.message);
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

router.post('/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = { 
            ...req.body, 
            userID: USER_CONFIG.userID, 
            accessToken: token 
        };

        // LOG REQUEST
        console.log("💺 [Request] Get Seats:", JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Airline/Seat`, payload, { httpsAgent: agent });
        
        // LOG RESPONSE
        console.log("✅ [Response] Get Seats Status:", response.data.status);

        res.json(response.data);
    } catch (error) {
        console.error("🔥 Error Seats:", error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});

// 7. CREATE BOOKING
router.post('/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const { usernameFromFrontend, ...cleanBody } = req.body;

        const payload = {
            ...cleanBody,
            airlineAccessCode: cleanBody.airlineAccessCode || cleanBody.airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, {
            httpsAgent: agent,
            timeout: 60000
        });

        if (response.data.status === "SUCCESS") {
            const dbRequest = {
                body: {
                    payload: payload,
                    response: response.data,
                    username: usernameFromFrontend
                }
            };

            // Simpan ke database di latar belakang
            flightController.saveBooking(dbRequest, {
                status: () => ({ json: () => { } }),
                json: () => { }
            });

            console.log(`✅ Booking ${response.data.bookingCode} diproses simpan.`);
        }

        res.json(response.data);
    } catch (error) {
        console.error("❌ Route Error:", error.message);
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 8. BOOKING DETAIL + AUTO SYNC PRICE
router.post('/booking-detail', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/BookingDetail`,
            { ...req.body, userID: USER_CONFIG.userID, accessToken: token }
        );

        const data = response.data;

        if (data.status === "SUCCESS") {
            const tPrice = data.adminFee ? data.adminFee.ticketPrice : 0;
            const sPrice = data.adminFee ? data.adminFee.salesPrice : 0;

            // Sync data ke tabel bookings
            await db.execute(
                `UPDATE bookings SET 
                    total_price = ?, 
                    sales_price = ?, 
                    origin_port = ?,
                    destination_port = ?, 
                    ticket_status = ?
                 WHERE booking_code = ?`,
                [
                    tPrice,
                    sPrice,
                    data.origin,      // Dari API Detail biasanya nama lengkap
                    data.destination, // Dari API Detail biasanya nama lengkap
                    data.ticketStatus,
                    data.bookingCode
                ]
            );
        }

        res.json(data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 9. ISSUED TICKET + AUTO UPDATE STATUS DB
router.post('/issued-ticket', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/Issued`, { ...req.body, userID: USER_CONFIG.userID, accessToken: token }, { httpsAgent: agent });

        if (response.data.status === "SUCCESS") {
            // Update status di database agar sinkron
            db.execute("UPDATE bookings SET ticket_status = 'Ticketed' WHERE booking_code = ?", [req.body.bookingCode])
                .catch(e => console.error("[DB UPDATE ERROR] Issued status failed:", e.message));
        }

        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

router.get('/generate-ticket/:bookingCode', async (req, res) => {
    try {
        const { bookingCode } = req.params;

        // 1. Ambil data dari database
        const [rows] = await db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
        if (rows.length === 0) return res.status(404).send("Booking tidak ditemukan");

        const booking = rows[0];
        const payload = typeof booking.payload_request === 'string' ? JSON.parse(booking.payload_request) : booking.payload_request;
        const response = typeof booking.raw_response === 'string' ? JSON.parse(booking.raw_response) : booking.raw_response;

        // --- HELPER: MENGHITUNG DURASI ---
        const calculateDuration = (depart, arrival) => {
            if (!depart || !arrival) return '--';
            const start = new Date(depart);
            const end = new Date(arrival);
            const diffMs = end - start;
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffMins = Math.round(((diffMs % 3600000) / 60000));
            return `${diffHrs}j ${diffMins}m`;
        };

        // --- MAPPING DATA ---
        const baggageMap = { "PBAA": "15kg", "PBAB": "20kg", "PBAC": "25kg", "PBAD": "30kg", "PBAF": "40kg" };
        const mealMap = { "NPCB": "Nasi Padang", "NLCB": "Pak Nasser", "NKCB": "Nasi Kuning", "GCCB": "Thai Green", "CRCB": "Uncle Chin" };
        const airlineNames = { "QZ": "AirAsia", "ID": "Batik Air", "GA": "Garuda Indonesia", "JT": "Lion Air", "QG": "Citilink" };
        const defaultBaggage = { "QG": "20kg", "JT": "0kg", "ID": "20kg", "GA": "20kg", "QZ": "0kg" };

        const qrDataUrl = await QRCode.toDataURL(response.bookingCodeAirline || booking.booking_code);

        // --- LOGIKA RENDER PENERBANGAN (DENGAN FIX ROUNDTRIP) ---
        const renderFlightSection = (flightSegments, titleLabel, isReturn = false) => {
            if (!flightSegments || flightSegments.length === 0) return '';

            return flightSegments.map((f, idx) => {
                const departTime = f.fdDepartTime || f.schDepartTime;
                const arrivalTime = f.fdArrivalTime || f.schArrivalTime;
                const dateObj = new Date(departTime);
                const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const fullDateTitle = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

                const jamDep = departTime.includes('T') ? departTime.split('T')[1].substring(0, 5) : departTime.substring(11, 16);
                const jamArr = arrivalTime.includes('T') ? arrivalTime.split('T')[1].substring(0, 5) : arrivalTime.substring(11, 16);
                const durationText = calculateDuration(departTime, arrivalTime);

                // Port names switching for return flights
                const originPortName = isReturn ? booking.destination_port : booking.origin_port;
                const destPortName = isReturn ? booking.origin_port : booking.destination_port;

                return `
                <div class="flight-box">
                    <div class="flight-header">${titleLabel} - ${fullDateTitle}</div>
                    <div class="flight-content">
                        <div class="airline-info">
                            <div class="airline-name">${airlineNames[booking.airline_id] || booking.airline_id}</div>
                            <div class="flight-number">${booking.airline_id} ${f.flightNumber}</div>
                            <div class="class-info">Class ${f.fdFlightClass || f.flightClass || 'Y'} (eco)</div>
                        </div>
                        <div class="route-display">
                            <div class="time-block">
                                <div class="date-text">${dateStr}</div>
                                <div class="time-text">${jamDep}</div>
                                <div class="station-text">${f.fdOrigin || f.schOrigin}</div>
                                <div class="port-text">${originPortName || ''}</div>
                            </div>
                            <div class="path-line">
                                <div class="duration">${durationText}</div>
                                <div class="line-container">
                                    <span class="circle-hollow"></span>
                                    <span class="hr-line"></span>
                                    <span class="circle-solid"></span>
                                </div>
                            </div>
                            <div class="time-block" style="text-align: right;">
                                <div class="date-text">${dateStr}</div>
                                <div class="time-text">${jamArr}</div>
                                <div class="station-text">${f.fdDestination || f.schDestination}</div>
                                <div class="port-text">${destPortName || ''}</div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        };

        // --- LOGIKA RENDER TABEL PENUMPANG (ROUNDTRIP COMPATIBLE) ---
        const passengers = response.passengers || payload.paxDetails || [];
        const isRoundTrip = payload.tripType === "RoundTrip";

        const paxRows = passengers.map((p, pIdx) => {
            const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
            const typeLabel = isInfant ? 'Infant<small>Bayi</small>' : (p.type === 'Child' || parseInt(p.type) === 1 ? 'Child<small>Anak</small>' : 'Adult<small>Dewasa</small>');

            const originalPax = payload.paxDetails ? payload.paxDetails[pIdx] : null;
            
            // Handle add-ons for both legs
            const adPergi = originalPax?.addOns?.[0] || null;
            const adPulang = isRoundTrip ? (originalPax?.addOns?.[1] || null) : null;

            const getBagLabel = (ad) => {
                if (isInfant) return '-';
                const raw = ad?.baggageString || "";
                return (raw === "" || raw === "-") ? (defaultBaggage[booking.airline_id] || "0kg") : (baggageMap[raw] || raw);
            };

            const bagInfo = isRoundTrip 
                ? `<div style="border-bottom:1px solid #eee; padding-bottom:2px;">🛫 ${getBagLabel(adPergi)}</div><div style="padding-top:2px;">🛬 ${getBagLabel(adPulang)}</div>`
                : getBagLabel(adPergi);

            const seatInfo = isRoundTrip
                ? `${adPergi?.seat || '-'} / ${adPulang?.seat || '-'}`
                : (adPergi?.seat || '-');

            const getMeals = (ad, label) => {
                if (!ad || !ad.meals || ad.meals.length === 0) return '';
                return `<div style="font-size:7px; line-height:1"><b>${label}:</b> ${ad.meals.map(m => mealMap[m] || m).join(', ')}</div>`;
            };

            const mealsInfo = isRoundTrip
                ? `${getMeals(adPergi, 'Pergi')} ${getMeals(adPulang, 'Pulang')}` || '-'
                : (adPergi?.meals?.length > 0 ? adPergi.meals.map(m => mealMap[m] || m).join(', ') : '-');

            return `
            <tr>
                <td style="text-align:center">${pIdx + 1}</td>
                <td><b>${p.title} ${p.firstName} ${p.lastName}</b></td>
                <td>${typeLabel}</td>
                <td style="text-align:center">${seatInfo}</td>
                <td style="text-align:center; font-size:8.5px;">${bagInfo}</td>
                <td style="font-size:8.5px;">${mealsInfo}</td>
            </tr>`;
        }).join('');

        const ticketPrice = Number(booking.total_price);

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; color: #333; padding: 0; margin: 0; font-size: 10px; line-height: 1.4; }
                .container { padding: 25px; }
                .header-table { width: 100%; margin-bottom: 10px; }
                .purchased-from { font-size: 9px; color: #777; }
                .port-text { font-size: 7.5px; color: #666; font-weight: normal; text-transform: uppercase; margin-top: 1px; max-width: 120px; }
                .time-block { display: flex; flex-direction: column; }
                .top-icons { display: table; width: 100%; margin: 15px 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
                .icon-item { display: table-cell; vertical-align: middle; }
                .icon-left { text-align: left; width: 33%; }
                .icon-center { text-align: center; width: 34%; }
                .icon-right { text-align: right; width: 33%; }
                .icon-wrapper { display: inline-flex; align-items: center; gap: 8px; text-align: left; }
                .icon-wrapper img { width: 28px; height: 28px; }
                .icon-text { font-size: 8px; color: #444; line-height: 1.2; }
                .icon-text b { display: block; font-size: 8.5px; color: #000; margin-bottom: 1px; }
                .flight-box { border: 1px solid #24b3ae; border-radius: 6px; overflow: hidden; margin-bottom: 15px; }
                .flight-header { background: #24b3ae; color: white; padding: 6px 15px; font-weight: bold; font-size: 10.5px; }
                .flight-content { display: flex; padding: 12px; align-items: center; }
                .airline-info { width: 130px; border-right: 1px solid #eee; }
                .airline-name { font-weight: bold; font-size: 12px; color: #000; }
                .flight-number { font-weight: bold; font-size: 11px; margin: 2px 0; }
                .route-display { flex-grow: 1; display: flex; justify-content: space-between; align-items: center; padding-left: 15px; }
                .time-text { font-size: 16px; font-weight: bold; color: #000; }
                .station-text { font-weight: bold; font-size: 11px; }
                .date-text { color: #24b3ae; font-weight: bold; font-size: 10px; }
                .path-line { flex-grow: 1; text-align: center; padding: 0 15px; }
                .duration { color: #24b3ae; font-size: 9px; font-weight: bold; margin-bottom: 3px; }
                .line-container { display: flex; align-items: center; justify-content: center; }
                .circle-hollow { width: 6px; height: 6px; border: 1px solid #aaa; border-radius: 50%; }
                .circle-solid { width: 7px; height: 7px; background: #24b3ae; border-radius: 50%; }
                .hr-line { flex-grow: 1; height: 1px; background: #ddd; margin: 0 3px; }
                .section-title { background: #019387ff; color: white; padding: 7px 15px; font-weight: bold; border-radius: 6px 6px 0 0; font-size: 10px; }
                .table-container { border: 1px solid #019387ff; border-radius: 0 0 6px 6px; margin-bottom: 15px; }
                table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                th { text-align: left; padding: 10px 8px; background: #fff; border-bottom: 1px solid #24b3ae; color: #000; font-size: 9px; vertical-align: bottom; }
                th small, td small { display: block; color: #999; font-weight: normal; font-size: 7.5px; margin-top: 1px; }
                td { padding: 12px 8px; border-bottom: 1px solid #eee; font-size: 9.5px; word-wrap: break-word; vertical-align: middle; }
                .fare-section { margin-top: 15px; }
                .fare-row { background: #f2f2f2; padding: 10px 15px; display: flex; justify-content: space-between; font-weight: bold; border-radius: 4px; font-size: 10.5px; }
                .total-row { padding: 10px 15px; display: flex; justify-content: flex-end; align-items: center; gap: 30px; }
                .total-amount { font-size: 18px; font-weight: 900; color: #000; }
                .important-note { margin-top: 20px; background: #fff; }
                .note-header { background: #e9ecef; padding: 5px 15px; font-weight: bold; display: flex; align-items: center; gap: 10px; font-size: 11px; }
                .note-content { padding: 10px 0; list-style: none; margin: 0;}
                .note-content li { margin-bottom: 10px; position: relative; padding-left: 20px; font-size: 10px; }
                .note-content li::before { content: attr(data-number); position: absolute; left: 0; font-weight: bold; }
                .note-content small { display: block; color: #777; font-size: 9px; }
                .footer-border { border-bottom: 5px solid #24b3ae; margin-top: 15px; border-radius: 0 0 5px 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <table class="header-table">
                    <tr>
                        <td>
                          <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png" height="50" style="margin-bottom: 10px;">
                            <div class="purchased-from">
                              Jln. Negara rt.16 Tengin Baru Kec. Sepaku<br> Kab. Penajam Paser Utara -IKN<br> Telp: 081347423737<br>
                                E-mail: linkuikn@gmail.com
                            </div>
                        </td>
                        <td align="right" style="vertical-align: top;">
                            <img src="${qrDataUrl}" width="75">
                            <div style="margin-top: 5px; text-align: center; width: 85px;">
                                <div style="font-size: 8px; color: #666; text-transform: uppercase;">Booking Code</div>
                                <div style="font-size: 14px; font-weight: bold; color: #24b3ae; letter-spacing: 1px;">
                                    ${response.bookingCodeAirline || booking.booking_code}
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>

                <h2 style="color:#24b3ae; border-bottom: 1.5px solid #24b3ae; padding-bottom:5px; margin: 10px 0;">E-ticket | <small style="font-weight:normal; font-size:14px;">E-tiket</small></h2>
                
                <div class="top-icons">
                    <div class="icon-item icon-left"><div class="icon-wrapper"><img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877882/ticket_wdqwvp.png"><div class="icon-text"><b>Show E-ticket & ID Card</b>Perlihatkan E-tiket & Identitas</div></div></div>
                    <div class="icon-item icon-center"><div class="icon-wrapper"><img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877884/schedule_zenfxq.png"><div class="icon-text"><b>Check-In 90 min before</b>Check-In minimal 90 menit</div></div></div>
                    <div class="icon-item icon-right"><div class="icon-wrapper"><img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877886/plane_ojmtak.png"><div class="icon-text"><b>Local Airport Time</b>Waktu Bandara Setempat</div></div></div>
                </div>

                ${renderFlightSection(response.flightDeparts || response.schDeparts, 'Departure / Pergi')}
                ${(response.flightReturns || (response.schReturns && response.schReturns.length > 0)) ? renderFlightSection(response.flightReturns || response.schReturns, 'Return / Pulang', true) : ''}

                <div class="section-title">Passenger Detail / Detail Penumpang</div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width:30px; text-align:center">No</th>
                                <th style="width:160px;">Passenger <small>Penumpang</small></th>
                                <th style="width:70px;">Type <small>Tipe</small></th>
                                <th style="width:70px; text-align:center">Seat <small>Kursi</small></th>
                                <th style="width:80px; text-align:center">Baggage <small>Bagasi</small></th>
                                <th style="width:100px;">Add-ons <small>Makanan</small></th>
                            </tr>
                        </thead>
                        <tbody>${paxRows}</tbody>
                    </table>
                </div>

                <div class="fare-section">
                    <div class="fare-title">Fares Detail | Detail Harga</div>
                    <div class="fare-row">
                        <span>Ticket for ${passengers.length} Passenger <br>
                        <small style="font-weight:normal; color:#666;">Tiket untuk ${passengers.length} penumpang</small></span>
                        <span>IDR ${ticketPrice.toLocaleString('id-ID')},-</span>
                    </div>
                    <div class="total-row">
                        <div style="text-align:right"><b>Total Amount</b><br><small style="color:#666">Total Pembayaran</small></div>
                        <div class="total-amount">IDR ${ticketPrice.toLocaleString('id-ID')},-</div>
                    </div>
                </div>

                <div class="important-note">
                    <div class="note-header">Important Note | Catatan Penting</div>
                    <ul class="note-content">
                        <li data-number="1.">The name of the <b>identity card (Indonesians KTP)</b> or passport must match the name passenger shown above</li>
                        <li data-number="2.">Please arrive at the airport <b>90 minutes</b> before the flight for domestic travel and <b>2 hours</b> for international travel</li>
                        <li data-number="3.">Check-in closes 45 minutes before departure time.</li>
                        <li data-number="4.">Passengers are allowed to bring up to 7kg of hand luggage onboard.</li>
                    </ul>
                </div>
                <div class="footer-border"></div>
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0.4cm', bottom: '0.4cm', left: '0.4cm', right: '0.4cm' }
        });
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdfBuffer);

    } catch (e) {
        console.error(e);
        res.status(500).send("Error generating ticket: " + e.message);
    }
});

module.exports = router;