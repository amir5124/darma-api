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
async function archiveBookingToDB(payload, response, username) {
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Insert ke tabel bookings
        // Membersihkan format ISO ke MySQL Datetime (YYYY-MM-DD HH:mm:ss)
        const cleanDepartDate = payload.departDate ? payload.departDate.replace('T', ' ').substring(0, 19) : null;
        const cleanTimeLimit = response.timeLimit ? response.timeLimit.replace('T', ' ').substring(0, 19) : null;

        const [resBooking] = await conn.execute(
            `INSERT INTO bookings (
                booking_code, reference_no, airline_id, airline_name, 
                trip_type, origin, destination, depart_date, 
                ticket_status, total_price, time_limit, user_id, pengguna,
                payload_request, raw_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bookingCode,
                response.referenceNo,
                payload.airlineID,
                payload.airlineID,
                payload.tripType,
                payload.origin,
                payload.destination,
                cleanDepartDate,
                "HOLD",
                response.salesPrice,
                cleanTimeLimit,
                USER_CONFIG.userID,
                username || "SISTEM",
                JSON.stringify(payload),
                JSON.stringify(response)
            ]
        );

        const bookingId = resBooking.insertId;

        // 2. Insert Penumpang (Passengers)
        if (payload.paxDetails && payload.paxDetails.length > 0) {
            for (const p of payload.paxDetails) {
                // MySQL DATE hanya menerima YYYY-MM-DD, potong string ISO
                const cleanBirthDate = (p.birthDate && p.birthDate.length >= 10)
                    ? p.birthDate.substring(0, 10)
                    : null;

                const [resPax] = await conn.execute(
                    `INSERT INTO passengers (booking_id, title, first_name, last_name, pax_type, phone, id_number, birth_date, pengguna) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId, p.title, p.firstName, p.lastName || p.firstName,
                        p.type === 0 ? 'Adult' : 'Child', payload.contactRemainingPhoneNo,
                        p.IDNumber || "", cleanBirthDate, username || "SISTEM"
                    ]
                );

                const paxId = resPax.insertId;

                // 3. Insert Add-ons
                if (p.addOns && p.addOns.length > 0) {
                    for (const ad of p.addOns) {
                        await conn.execute(
                            `INSERT INTO passenger_addons (passenger_id, segment_idx, baggage_code, seat_number, meals_json, pengguna) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [paxId, 0, ad.baggageString || null, ad.seat || null, JSON.stringify(ad.meals || []), username || "SISTEM"]
                        );
                    }
                }
            }
        }

        // 4. Insert Itinerary (Flight Segments)
        const flights = response.flightDeparts || [];
        for (const f of flights) {
            await conn.execute(
                `INSERT INTO flight_itinerary (booking_id, category, flight_number, origin, destination, depart_time, arrival_time, flight_class, pengguna) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookingId, 'Departure', f.flightNumber, f.fdOrigin, f.fdDestination,
                    f.fdDepartTime.replace('T', ' ').substring(0, 19),
                    f.fdArrivalTime.replace('T', ' ').substring(0, 19),
                    f.fdFlightClass, username || "SISTEM"
                ]
            );
        }

        await conn.commit();
        console.log(`[DB] Berhasil mengarsipkan Booking: ${response.bookingCode}`);
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("[DB ERROR] Gagal simpan booking:", err.message);
    } finally {
        if (conn) conn.release();
    }
}

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
router.post('/airline-route', async (req, res) => {
    try {
        // Mengambil token konsisten seperti endpoint list
        const token = await getConsistentToken();

        // Mengambil airlineID dari body request yang dikirim frontend
        const { airlineID } = req.body;

        if (!airlineID) {
            return res.status(400).json({
                status: "FAILED",
                respMessage: "airlineID is required"
            });
        }

        // Request ke BASE_URL/Airline/Route
        const response = await axios.post(`${BASE_URL}/Airline/Route`, {
            airlineID: airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        }, { httpsAgent: agent });

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
        const response = await axios.post(`${BASE_URL}/Airline/Schedule`, payload, { httpsAgent: agent });
        res.json({
            data: response.data.journeyDepart || [],
            dataReturn: response.data.journeyReturn || []
        });
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 3. PRICE VALIDATION
router.post('/get-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/Price`, { ...req.body, userID: USER_CONFIG.userID, accessToken: token }, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 4. POOLING SCHEDULE ALL AIRLINE
router.get('/get-all-schedules', async (req, res) => {
    // Setup Header SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const token = await getConsistentToken(true);
        const q = req.query;
        let totalAirline = 0;
        let airlineIndex = -1;
        let currentAccessCode = null;
        let safetyCounter = 0;

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
                "airlineAccessCode": currentAccessCode,
                "cacheType": 2,
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
                totalAirline = result.totalAirline;
                airlineIndex = result.airlineIndex;
                currentAccessCode = result.airlineAccessCode;

                // KIRIM DATA KE FRONTEND SAAT INI JUGA (PUSH)
                res.write(`data: ${JSON.stringify({
                    status: "PARTIAL",
                    totalAirline,
                    airlineIndex,
                    journeyDepart: result.journeyDepart || [],
                    journeyReturn: result.journeyReturn || []
                })}\n\n`);

                if (airlineIndex >= totalAirline && totalAirline > 0) break;
            } else {
                break;
            }
            // Memberi jeda sedikit agar server tidak overload
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Kirim tanda bahwa proses sudah selesai semua
        res.write(`data: ${JSON.stringify({ status: "COMPLETED" })}\n\n`);
        res.end();

    } catch (error) {
        res.write(`data: ${JSON.stringify({ status: "ERROR", message: error.message })}\n\n`);
        res.end();
    }
});

// 5. PRICE ALL AIRLINE (Sesuai Permintaan)
router.post('/get-all-price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            "airlineID": b.airlineID,
            "origin": b.origin,
            "destination": b.destination,
            "tripType": b.tripType || "OneWay",
            "departDate": b.departDate,
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
        const response = await axios.post(`${BASE_URL}/Airline/PriceAllAirline`, payload, { httpsAgent: agent, timeout: 30000 });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 6. ADDONS & SEATS
router.post('/get-addons', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/BaggageAndMeal`, { ...req.body, userID: USER_CONFIG.userID, accessToken: token }, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

router.post('/get-seats', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/Seat`, { ...req.body, userID: USER_CONFIG.userID, accessToken: token }, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
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
        // Default bagasi per maskapai jika API kosong
        const defaultBaggage = { "QG": "20kg", "JT": "0kg", "ID": "20kg", "GA": "20kg", "QZ": "0kg" };

        const qrDataUrl = await QRCode.toDataURL(response.bookingCodeAirline || booking.booking_code);

        // --- LOGIKA RENDER PENERBANGAN ---
        const renderFlightSection = (flightSegments, titleLabel) => {
            if (!flightSegments || flightSegments.length === 0) return '';

            return flightSegments.map((f, idx) => {
                const dateObj = new Date(f.fdDepartTime);
                const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const fullDateTitle = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

                const jamDep = f.fdDepartTime.includes('T') ? f.fdDepartTime.split('T')[1].substring(0, 5) : f.fdDepartTime.substring(11, 16);
                const jamArr = f.fdArrivalTime.includes('T') ? f.fdArrivalTime.split('T')[1].substring(0, 5) : f.fdArrivalTime.substring(11, 16);
                const durationText = calculateDuration(f.fdDepartTime, f.fdArrivalTime);

                return `
                <div class="flight-box">
                    <div class="flight-header">${titleLabel} - ${fullDateTitle}</div>
                    <div class="flight-content">
                        <div class="airline-info">
                            <div class="airline-name">${airlineNames[booking.airline_id] || booking.airline_id}</div>
                            <div class="flight-number">${booking.airline_id} ${f.flightNumber}</div>
                            <div class="class-info">Class ${f.fdFlightClass || 'Y'} (eco)</div>
                        </div>
                        <div class="route-display">
                            <div class="time-block">
                                <div class="date-text">${dateStr}</div>
                                <div class="time-text">${jamDep}</div>
                                <div class="station-text">${f.fdOrigin}</div>
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
                                <div class="station-text">${f.fdDestination}</div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        };

        // --- LOGIKA RENDER TABEL PENUMPANG ---
        const passengers = response.passengers || payload.paxDetails || [];
        const paxRows = passengers.map((p, pIdx) => {
            const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
            const typeLabel = isInfant ? 'Infant<small>Bayi</small>' : (p.type === 'Child' || parseInt(p.type) === 1 ? 'Child<small>Anak</small>' : 'Adult<small>Dewasa</small>');

            const originalPax = payload.paxDetails ? payload.paxDetails[pIdx] : null;
            const ad = originalPax?.addOns?.[0] || null;

            let bag = '-';
            if (!isInfant) {
                const rawBag = ad?.baggageString || "";
                // Logika Dinamis: Jika API bagasi kosong, gunakan default per maskapai
                if (rawBag === "" || rawBag === "-" || rawBag === null) {
                    bag = defaultBaggage[booking.airline_id] || "0kg";
                } else {
                    bag = baggageMap[rawBag] || rawBag;
                }
            }

            let seat = ad?.seat || '-';
            let meals = (ad?.meals && ad.meals.length > 0) ? ad.meals.map(m => mealMap[m] || m).join(', ') : '-';

            return `
            <tr>
                <td style="text-align:center">${pIdx + 1}</td>
                <td><b>${p.title} ${p.firstName} ${p.lastName}</b></td>
                <td>${typeLabel}</td>
                <td style="text-align:center">${seat}</td>
                <td style="text-align:center">${bag}</td>
                <td>${meals}</td>
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
                
                /* PERBAIKAN ICON TOP: ALIGN LEFT, CENTER, RIGHT */
                .top-icons { 
                    display: table; 
                    width: 100%; 
                    margin: 15px 0; 
                    border-bottom: 1px solid #ddd; 
                    padding-bottom: 10px; 
                }
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
                .fare-title { color: #015693; font-weight: bold; font-size: 12px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
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
                    <div class="icon-item icon-left">
                        <div class="icon-wrapper">
                            <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877882/ticket_wdqwvp.png">
                            <div class="icon-text"><b>Show E-ticket & ID Card</b>Perlihatkan E-tiket & Identitas</div>
                        </div>
                    </div>
                    <div class="icon-item icon-center">
                        <div class="icon-wrapper">
                            <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877884/schedule_zenfxq.png">
                            <div class="icon-text"><b>Check-In 90 min before</b>Check-In minimal 90 menit</div>
                        </div>
                    </div>
                    <div class="icon-item icon-right">
                        <div class="icon-wrapper">
                            <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877886/plane_ojmtak.png">
                            <div class="icon-text"><b>Local Airport Time</b>Waktu Bandara Setempat</div>
                        </div>
                    </div>
                </div>

                ${renderFlightSection(response.flightDeparts, 'Departure / Pergi')}
                ${response.flightReturns ? renderFlightSection(response.flightReturns, 'Return / Pulang') : ''}

                <div class="section-title">Passenger Detail / Detail Penumpang</div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width:30px; text-align:center">No</th>
                                <th style="width:160px;">Passenger <small>Penumpang</small></th>
                                <th style="width:70px;">Type <small>Tipe</small></th>
                                <th style="width:60px; text-align:center">Seat <small>Kursi</small></th>
                                <th style="width:60px; text-align:center">Baggage <small>Bagasi</small></th>
                                <th style="width:100px;">Meals <small>Makanan</small></th>
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
                        <li data-number="1.">The name of the <b>identity card (Indonesians KTP)</b> or passport must match the name passenger shown above<small>Nama dalam KTP/Paspor harus sesuai dengan nama penumpang yang ditunjukkan di atas</small></li>
                        <li data-number="2.">Please arrive at the airport <b>90 minutes</b> before the flight for domestic travel and <b>2 hours</b> for international travel<small>Harap tiba di bandara 90 menit sebelum penerbangan untuk perjalanan domestik dan 2 jam sebelum penerbangan untuk perjalanan internasional</small></li>
                        <li data-number="3.">Check-in closes 45 minutes before departure time.<small>Check-in tutup 45 menit sebelum waktu keberangkatan</small></li>
                        <li data-number="4.">Passengers are allowed to bring up to 7kg of hand luggage onboard Air Flights.<small>Penumpang diperbolehkan membawa barang hingga 7 kg ke dalam pesawat</small></li>
                        <li data-number="5.">Passengers agree with Terms and Conditions of Carriage outlined by Carrier.<small>Penumpang setuju dengan kebijakan dan aturan yang ditetapkan Operator</small></li>
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