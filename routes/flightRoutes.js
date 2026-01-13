const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

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
    try {
        const token = await getConsistentToken(true);
        const q = req.query;
        let allJourneyDepart = [];
        let allJourneyReturn = [];
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
            const response = await axios.post(`${BASE_URL}/Airline/ScheduleAllAirline`, payload, { httpsAgent: agent, timeout: 60000 });
            const result = response.data;
            if (result.status === "SUCCESS") {
                totalAirline = result.totalAirline;
                airlineIndex = result.airlineIndex;
                currentAccessCode = result.airlineAccessCode;
                if (result.journeyDepart) allJourneyDepart = allJourneyDepart.concat(result.journeyDepart);
                if (result.journeyReturn) allJourneyReturn = allJourneyReturn.concat(result.journeyReturn);
                if (airlineIndex >= totalAirline && totalAirline > 0) break;
            } else break;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        res.json({ status: "SUCCESS", totalAirline, data: allJourneyDepart, dataReturn: allJourneyReturn });
    } catch (error) {
        res.status(500).json({ status: "ERROR", error: error.message });
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

// 7. CREATE BOOKING + ARCHIVE TO DB
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

        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, { httpsAgent: agent, timeout: 60000 });

        if (response.data.status === "SUCCESS") {
            // Jalankan penyimpanan di background
            archiveBookingToDB(payload, response.data, usernameFromFrontend);
        }

        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});

// 8. BOOKING DETAIL
router.post('/booking-detail', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/Airline/BookingDetail`, { ...req.body, userID: USER_CONFIG.userID, accessToken: token }, { httpsAgent: agent });
        res.json(response.data);
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

        // --- MAPPING DESKRIPSI ADDONS ---
        const baggageMap = { "PBAA": "15kg", "PBAB": "20kg", "PBAC": "25kg", "PBAD": "30kg", "PBAF": "40kg" };
        const mealMap = { "NPCB": "Nasi Padang", "NLCB": "Pak Nasser", "NKCB": "Nasi Kuning", "GCCB": "Thai Green", "CRCB": "Uncle Chin" };
        const airlineNames = { "QZ": "AirAsia", "ID": "Batik Air", "GA": "Garuda Indonesia", "JT": "Lion Air", "QG": "Citilink" };

        // --- GENERATE QR CODE ---
        const qrDataUrl = await QRCode.toDataURL(booking.booking_code);

        // --- LOGIKA RENDER PENERBANGAN ---
        const renderFlights = (flightSegments, titleLabel) => {
            if (!flightSegments || flightSegments.length === 0) return '';
            
            let html = ``;
            flightSegments.forEach((f, idx) => {
                const dateObj = new Date(f.fdDepartTime);
                const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'short' });
                const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                
                const jamDep = f.fdDepartTime.includes('T') ? f.fdDepartTime.split('T')[1].substring(0, 5) : f.fdDepartTime.substring(11, 16);
                const jamArr = f.fdArrivalTime.includes('T') ? f.fdArrivalTime.split('T')[1].substring(0, 5) : f.fdArrivalTime.substring(11, 16);

                html += `
                <div class="journey-container">
                    <div class="journey-header">${idx === 0 ? titleLabel : 'Transit'} ${dateStr}</div>
                    <div class="flight-detail-row">
                        <div class="airline-col">
                            <div class="airline-name">${airlineNames[booking.airline_id] || booking.airline_id}</div>
                            <div class="flight-code">${f.flightNumber}</div>
                        </div>
                        <div class="route-col">
                            <div class="dot blue"></div>
                            <div class="line"></div>
                            <div class="dot white"></div>
                        </div>
                        <div class="info-col">
                            <div class="station-row">
                                <span class="city-code">${f.fdOrigin}</span>
                                <span class="time-bold">${jamDep}</span>
                            </div>
                            <div class="date-small">${dayName} ${dateStr}</div>
                            <div class="station-row" style="margin-top:15px;">
                                <span class="city-code">${f.fdDestination}</span>
                                <span class="time-bold">${jamArr}</span>
                            </div>
                            <div class="date-small">${dayName} ${dateStr}</div>
                        </div>
                    </div>
                </div>`;
            });
            return html;
        };

        const flightContentHtml = `
            <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">${renderFlights(response.flightDeparts, 'Pergi')}</div>
                <div style="flex: 1;">${renderFlights(response.flightReturns, 'Pulang')}</div>
                <div style="width: 120px; text-align: center;">
                    <img src="${qrDataUrl}" width="100">
                    <div style="font-size: 10px; color: #666; margin-top: 5px;">Booking Code</div>
                    <div style="font-size: 14px; font-weight: bold;">${response.bookingCodeAirline || booking.booking_code}</div>
                </div>
            </div>
        `;

        // --- LOGIKA RENDER TABEL PENUMPANG (MENGGUNAKAN RESPONSE PARTNER AGAR INFANT MUNCUL) ---
        const passengers = response.passengers || payload.paxDetails || [];
        
        const paxRows = passengers.map((p, pIdx) => {
            const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
            const isChild = p.type === 'Child' || parseInt(p.type) === 1;
            
            let typeLabel = 'Dewasa';
            if (isChild) typeLabel = 'Anak';
            if (isInfant) typeLabel = 'Bayi';

            // Nama pemangku untuk bayi
            let pName = '';
            if (isInfant) {
                const adult = passengers.find(px => px.type === 'Adult' || parseInt(px.type) === 0);
                pName = adult ? `(${adult.firstName})` : '';
            }

            // Ambil Addons dari payload asli berdasarkan index
            const originalPax = payload.paxDetails ? payload.paxDetails[pIdx] : null;
            const paxAddons = (originalPax && originalPax.addOns && originalPax.addOns.length > 0) 
                ? originalPax.addOns 
                : [{ baggageString: '-', meals: [], seat: '-' }];

            return paxAddons.map((ad, idx) => {
                const fNumber = (idx === 0 && response.flightDeparts) ? response.flightDeparts[0].flightNumber : 
                               (response.flightReturns ? response.flightReturns[0].flightNumber : (response.flightDeparts ? response.flightDeparts[0].flightNumber : '-'));
                
                const bag = baggageMap[ad.baggageString] || ad.baggageString || '-';
                const meal = (ad.meals || []).map(m => mealMap[m] || m).join(', ') || '-';
                const seat = ad.seat || '-';

                return `
                    <tr class="pax-data-row">
                        <td>${p.title} ${p.firstName} ${p.lastName} /${typeLabel} ${pName}</td>
                        <td style="text-align:center">${fNumber}</td>
                        <td style="text-align:center">${isInfant ? '-' : seat}</td>
                        <td style="text-align:center">${isInfant ? '-' : bag}</td>
                        <td>${isInfant ? '-' : meal}</td>
                    </tr>`;
            }).join('');
        }).join('');

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; font-size: 12px; color: #333; }
                .top-icons { display: flex; justify-content: space-around; border-bottom: 1px solid #ddd; padding-bottom: 15px; margin-bottom: 20px; text-align: center; font-size: 10px; color: #0052cc; }
                .journey-container { margin-bottom: 15px; }
                .journey-header { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
                .flight-detail-row { display: flex; gap: 15px; align-items: flex-start; }
                .airline-col { width: 80px; }
                .airline-name { font-weight: bold; color: #d32f2f; font-size: 14px; }
                .flight-code { font-weight: bold; margin-top: 5px; }
                .route-col { display: flex; flex-direction: column; align-items: center; width: 20px; }
                .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #0052cc; }
                .dot.blue { background: #0052cc; }
                .line { width: 2px; height: 50px; background: #ddd; }
                .info-col { flex-grow: 1; }
                .station-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; width: 150px; }
                .date-small { font-size: 10px; color: #666; }
                table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                th { text-align: left; border-bottom: 1px solid #eee; padding: 8px; color: #666; font-weight: normal; }
                .pax-data-row td { padding: 12px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="top-icons">
                <div>Tunjukkan E-Tiket dan Identitas Para<br>Penumpang Saat Check-in</div>
                <div>Check-in Paling Lambat 90 Menit Sebelum<br>Keberangkatan</div>
                <div>Waktu Tertera Adalah Waktu<br>Bandara Setempat</div>
            </div>
            ${flightContentHtml}
            <table>
                <thead>
                    <tr>
                        <th style="width:35%">Penumpang</th>
                        <th style="text-align:center">Penerbangan</th>
                        <th style="text-align:center">Seat</th>
                        <th style="text-align:center">Baggage</th>
                        <th>Meals</th>
                    </tr>
                </thead>
                <tbody>${paxRows}</tbody>
            </table>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdfBuffer);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

module.exports = router;