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

        // --- MAPPING DATA ---
        const baggageMap = { "PBAA": "15kg", "PBAB": "20kg", "PBAC": "25kg", "PBAD": "30kg", "PBAF": "40kg" };
        const airlineNames = { "QZ": "AirAsia", "ID": "Batik Air", "GA": "Garuda Indonesia", "JT": "Lion Air", "QG": "Citilink" };

        const qrDataUrl = await QRCode.toDataURL(response.bookingCodeAirline || booking.booking_code);

        // --- LOGIKA RENDER PENERBANGAN ---
        const renderFlightSection = (flightSegments, titleLabel) => {
            if (!flightSegments || flightSegments.length === 0) return '';
            
            return flightSegments.map((f, idx) => {
                const dateObj = new Date(f.fdDepartTime);
                const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const jamDep = f.fdDepartTime.includes('T') ? f.fdDepartTime.split('T')[1].substring(0, 5) : f.fdDepartTime.substring(11, 16);
                const jamArr = f.fdArrivalTime.includes('T') ? f.fdArrivalTime.split('T')[1].substring(0, 5) : f.fdArrivalTime.substring(11, 16);

                return `
                <div class="flight-box">
                    <div class="flight-header">${titleLabel} - ${new Date(f.fdDepartTime).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    <div class="flight-content">
                        <div class="airline-info">
                            <div class="airline-name">${airlineNames[f.airlineCode] || f.airlineCode}</div>
                            <div class="flight-number">${f.airlineCode} ${f.flightNumber}</div>
                            <div class="class-info">Class ${f.fdFlightClass || 'Y'} (eco)</div>
                        </div>
                        <div class="route-display">
                            <div class="time-block">
                                <div class="date-text">${dateStr}</div>
                                <div class="time-text">${jamDep}</div>
                                <div class="station-text">${f.fdOriginName || f.fdOrigin}</div>
                            </div>
                            <div class="path-line">
                                <div class="duration">02 Hours 30 Minutes</div>
                                <div class="line-container">
                                    <span class="circle-hollow"></span>
                                    <span class="hr-line"></span>
                                    <span class="circle-solid"></span>
                                </div>
                            </div>
                            <div class="time-block" style="text-align: right;">
                                <div class="date-text">${dateStr}</div>
                                <div class="time-text">${jamArr}</div>
                                <div class="station-text">${f.fdDestinationName || f.fdDestination}</div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        };

        // --- LOGIKA PENUMPANG ---
        const passengers = response.passengers || payload.paxDetails || [];
        const paxRows = passengers.map((p, pIdx) => {
            const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
            const typeLabel = isInfant ? 'Infant/Bayi' : (p.type === 'Child' || parseInt(p.type) === 1 ? 'Child/Anak' : 'Adult/Dewasa');
            const ad = (payload.paxDetails && payload.paxDetails[pIdx]?.addOns) ? payload.paxDetails[pIdx].addOns[0] : null;
            const bag = isInfant ? '-' : (baggageMap[ad?.baggageString] || "15kg");

            return `
            <tr>
                <td>${pIdx + 1}</td>
                <td><b>${p.title} ${p.firstName} ${p.lastName}</b></td>
                <td>Confirmed</td>
                <td>${typeLabel}</td>
                <td>${bag}</td>
            </tr>`;
        }).join('');

        // --- HARGA ---
        const fee = response.adminFee || { ticketPrice: 0 };
        const totalAmount = Number(fee.ticketPrice).toLocaleString('id-ID');

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; color: #333; padding: 0; margin: 0; font-size: 11px; }
                .container { padding: 30px; }
                .header-table { width: 100%; margin-bottom: 20px; }
                .purchased-from { font-size: 10px; color: #777; }
                . Nusantour { font-weight: bold; color: #000; font-size: 12px; }
                
                .top-icons { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
                .icon-item { display: flex; align-items: center; gap: 10px; width: 30%; }
                .icon-item img { width: 35px; }
                .icon-text { font-size: 9px; line-height: 1.2; }
                .icon-text b { display: block; font-size: 10px; margin-bottom: 2px; }

                .flight-box { border: 1px solid #0194f3; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
                .flight-header { background: #0194f3; color: white; padding: 8px 15px; font-weight: bold; font-size: 12px; }
                .flight-content { display: flex; padding: 15px; align-items: center; }
                .airline-info { width: 150px; border-right: 1px solid #eee; }
                .airline-name { font-weight: bold; font-size: 13px; }
                .class-info { color: #888; font-size: 10px; }
                
                .route-display { flex-grow: 1; display: flex; justify-content: space-between; align-items: center; padding-left: 20px; }
                .time-text { font-size: 18px; font-weight: bold; margin: 2px 0; }
                .station-text { font-weight: bold; }
                .date-text { color: #0194f3; font-weight: bold; font-size: 12px; }
                
                .path-line { flex-grow: 1; text-align: center; padding: 0 20px; }
                .duration { color: #888; font-size: 10px; margin-bottom: 5px; }
                .line-container { display: flex; align-items: center; }
                .circle-hollow { width: 8px; height: 8px; border: 1px solid #aaa; border-radius: 50%; }
                .circle-solid { width: 8px; height: 8px; background: #0194f3; border-radius: 50%; }
                .hr-line { flex-grow: 1; height: 1px; background: #aaa; margin: 0 2px; }

                .section-title { background: #015693; color: white; padding: 8px 15px; font-weight: bold; border-radius: 8px 8px 0 0; }
                .table-container { border: 1px solid #015693; border-radius: 0 0 8px 8px; padding: 10px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; padding: 10px 5px; border-bottom: 2px solid #0194f3; color: #666; }
                td { padding: 10px 5px; border-bottom: 1px solid #eee; }

                .fare-section { margin-top: 10px; border-top: 2px solid #0194f3; }
                .fare-title { color: #015693; font-weight: bold; font-size: 14px; margin: 10px 0; }
                .fare-row { background: #eee; padding: 10px 15px; display: flex; justify-content: space-between; font-weight: bold; }
                .total-row { background: #f5f5f5; padding: 15px; display: flex; justify-content: flex-end; align-items: center; gap: 40px; }
            </style>
        </head>
        <body>
            <div class="container">
                <table class="header-table">
                    <tr>
                        <td>
                            <div class="purchased-from">Purchased From :</div>
                            <div class="Nusantour">NUSANTARA TOUR</div>
                            <div class="purchased-from">Jl. Veteran No.7<br>Telp: 08991000003<br>E-mail: nusantour2021@gmail.com</div>
                        </td>
                        <td align="right">
                            <img src="${qrDataUrl}" width="80">
                        </td>
                    </tr>
                </table>

                <h2 style="color:#0194f3; border-bottom: 2px solid #0194f3; padding-bottom:5px;">E-ticket | <small>E-ticket</small></h2>
                
                <div class="top-icons">
                    <div class="icon-item">
                        <img src="https://i.ibb.co.com/SwVNHCKP/ticket.png">
                        <div class="icon-text"><b>Show Valid E-ticket and Pax ID Card at Check-In</b>Perlihatkan E-ticket serta Identitas Penumpang Valid saat Check-In</div>
                    </div>
                    <div class="icon-item">
                        <img src="https://i.ibb.co.com/C5TX1Hny/schedule.png">
                        <div class="icon-text"><b>Check-In 90 minutes befores departure time</b>Check-In paling lambat 90 menit sebelum keberangkatan</div>
                    </div>
                    <div class="icon-item">
                        <img src="https://i.ibb.co.com/n8mMB9yV/plane.png">
                        <div class="icon-text"><b>Time on ticket according to local airport time</b>Waktu yang tertera adalah waktu bandara setempat</div>
                    </div>
                </div>

                ${renderFlightSection(response.flightDeparts, 'Departure Flight')}
                ${renderFlightSection(response.flightReturns || [], 'Return Flight')}

                <div class="section-title">Passenger Detail <br><small>Detail Penumpang</small></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>No .</th>
                                <th>Passenger <br><small>Penumpang</small></th>
                                <th>Ticket Number <br><small>Nomor Ticket</small></th>
                                <th>Type <br><small>Tipe</small></th>
                                <th>Baggage <br><small>Bagasi</small></th>
                            </tr>
                        </thead>
                        <tbody>${paxRows}</tbody>
                    </table>
                </div>

                <div class="fare-section">
                    <div class="fare-title">Fares Detail | <small>Detail Harga</small></div>
                    <div class="fare-row">
                        <span>Ticket for ${passengers.length} Passenger <br><small style="font-weight:normal; color:#666;">Tiket untuk ${passengers.length} penumpang</small></span>
                        <span>IDR ${totalAmount},-</span>
                    </div>
                    <div class="total-row">
                        <div style="text-align:right">
                            <b>Total Amount</b><br>
                            <small style="color:#666">Total Pembayaran</small>
                        </div>
                        <div style="font-size: 18px; font-weight: black;">IDR ${totalAmount},-</div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '0.5cm', bottom: '0.5cm', left: '0.5cm', right: '0.5cm' } 
        });
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdfBuffer);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

module.exports = router;