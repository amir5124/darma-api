const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const puppeteer = require('puppeteer');
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
        const [rows] = await db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
        if (rows.length === 0) return res.status(404).send("Booking tidak ditemukan");

        const booking = rows[0];
        const payload = typeof booking.payload_request === 'string' ? JSON.parse(booking.payload_request) : booking.payload_request;
        const response = typeof booking.raw_response === 'string' ? JSON.parse(booking.raw_response) : booking.raw_response;

        // 1. Logika Nama Maskapai (Mapping Sederhana)
        const airlineNames = { "QG": "Citilink", "QZ": "AirAsia", "GA": "Garuda Indonesia", "ID": "Batik Air", "JT": "Lion Air" };
        const mainAirline = airlineNames[booking.airline_id] || booking.airline_id;

        // 2. Render Itinerary (Mendukung Transit/Multi-segment)
        const renderItinerary = (flightSegments, title) => {
            if (!flightSegments || flightSegments.length === 0) return '';
            
            let segmentsHtml = '';
            flightSegments.forEach((f, idx) => {
                const depart = f.fdDepartTime.includes('T') ? f.fdDepartTime.split('T') : f.fdDepartTime.split(' ');
                const arrive = f.fdArrivalTime.includes('T') ? f.fdArrivalTime.split('T') : f.fdArrivalTime.split(' ');
                
                segmentsHtml += `
                <div class="flight-card">
                    <div class="airline-brand">
                        <div class="airline-name">${airlineNames[f.flightNumber.substring(0,2)] || mainAirline}</div>
                        <div class="flight-num">${f.flightNumber} | Class ${f.fdFlightClass.trim()}</div>
                    </div>
                    <div class="itinerary-grid">
                        <div class="station">
                            <div class="time">${depart[1].substring(0, 5)}</div>
                            <div class="city">${f.fdOrigin}</div>
                        </div>
                        <div class="path-line">
                            <div class="duration">Terbang Langsung</div>
                            <div class="line"><span>✈</span></div>
                        </div>
                        <div class="station">
                            <div class="time">${arrive[1].substring(0, 5)}</div>
                            <div class="city">${f.fdDestination}</div>
                        </div>
                    </div>
                </div>`;

                // Cek Transit
                if (idx < flightSegments.length - 1) {
                    segmentsHtml += `<div class="transit-info">Transit di ${f.fdDestination}</div>`;
                }
            });

            return `<div class="section-title">${title}</div>${segmentsHtml}`;
        };

        const journeyHtml = renderItinerary(response.flightDeparts, "Penerbangan Pergi") + 
                           renderItinerary(response.flightReturns, "Penerbangan Pulang");

        // 3. Render Detail Penumpang & Fasilitas (Ikon SVG)
        const paxHtml = payload.paxDetails.map((p, index) => {
            const isInfant = parseInt(p.type) === 2;
            const parentName = isInfant && p.parent ? payload.paxDetails[parseInt(p.parent) - 1].firstName : '';
            
            const addOn = (p.addOns && p.addOns[0]) ? p.addOns[0] : {};
            const facilities = [];
            if (addOn.baggageString) facilities.push(`<span class="badge">🧳 ${addOn.baggageString}</span>`);
            if (addOn.meals && addOn.meals.length > 0) facilities.push(`<span class="badge">🍴 Meals</span>`);
            if (addOn.seat) facilities.push(`<span class="badge">💺 ${addOn.seat}</span>`);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><b>${p.title} ${p.firstName} ${p.lastName}</b>${isInfant ? `<br><small>Pemangku: ${parentName}</small>` : ''}</td>
                    <td>${isInfant ? 'Infant' : 'Adult'}</td>
                    <td>${response.bookingCodeAirline || booking.booking_code}</td>
                    <td>${facilities.join(' ') || '-'}</td>
                </tr>`;
        }).join('');

        // 4. Template HTML dengan CSS yang diperkuat
        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; line-height: 1.5; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .logo { font-size: 28px; font-weight: bold; color: #0052cc; letter-spacing: -1px; }
                .pnr-wrap { text-align: right; }
                .pnr-box { background: #0052cc; color: white; padding: 10px 25px; border-radius: 8px; font-size: 22px; font-weight: bold; margin-top: 5px; }
                .meta-data { background: #f8f9fa; padding: 10px; border-radius: 5px; font-size: 12px; margin-bottom: 20px; border: 1px solid #eee; }
                .section-title { background: #0052cc; color: white; padding: 10px 15px; font-weight: bold; font-size: 14px; margin-top: 25px; border-radius: 4px 4px 0 0; }
                .flight-card { border: 1px solid #ddd; padding: 20px; border-top: none; display: flex; align-items: center; justify-content: space-between; }
                .airline-brand { width: 150px; }
                .airline-name { font-weight: bold; font-size: 16px; color: #000; }
                .flight-num { font-size: 12px; color: #666; }
                .itinerary-grid { display: flex; align-items: center; gap: 40px; flex-grow: 1; justify-content: center; }
                .station { text-align: center; min-width: 80px; }
                .station .time { font-size: 22px; font-weight: bold; }
                .station .city { font-size: 14px; color: #555; font-weight: 500; }
                .path-line { text-align: center; color: #bbb; position: relative; width: 150px; }
                .path-line .duration { font-size: 10px; margin-bottom: 5px; color: #999; }
                .path-line .line { border-top: 2px dashed #ddd; position: relative; }
                .path-line .line span { position: absolute; top: -10px; left: 45%; background: white; padding: 0 5px; color: #0052cc; }
                .transit-info { background: #fff3cd; color: #856404; text-align: center; padding: 5px; font-size: 11px; border: 1px solid #ffeeba; border-top: none; border-bottom: none; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #f2f2f2; text-align: left; padding: 12px; font-size: 13px; border-bottom: 2px solid #ddd; }
                td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; }
                .badge { background: #eef4ff; color: #0052cc; padding: 3px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #d0e1ff; margin-right: 5px; }
                .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">E-tiket Pesawat</div>
                <div class="pnr-wrap">
                    <div style="font-size: 11px; color: #666;">KODE BOOKING (PNR)</div>
                    <div class="pnr-box">${response.bookingCodeAirline || booking.booking_code}</div>
                </div>
            </div>
            <div class="meta-data">
                Order ID: <b>${booking.reference_no}</b> &nbsp;|&nbsp; 
                Status: <span style="color:green"><b>${booking.ticket_status}</b></span> &nbsp;|&nbsp; 
                Operator: <b>${booking.pengguna}</b>
            </div>

            ${journeyHtml}

            <h3 style="margin-top:30px; border-bottom: 2px solid #0052cc; padding-bottom: 5px;">Detail Penumpang</h3>
            <table>
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Penumpang</th>
                        <th>Tipe</th>
                        <th>Nomor Tiket</th>
                        <th>Fasilitas & Add-ons</th>
                    </tr>
                </thead>
                <tbody>${paxHtml}</tbody>
            </table>
            <div class="footer">
                * Check-in paling lambat 90 menit sebelum keberangkatan. Harap membawa identitas asli (KTP/Passport).
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

module.exports = router;