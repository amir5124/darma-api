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

        // 1. Ambil data dari database
        const [rows] = await db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
        if (rows.length === 0) return res.status(404).send("Booking tidak ditemukan");

        const booking = rows[0];

        // PROTEKSI JSON: Jika driver mysql2 sudah mengonversi ke objek, jangan di-parse lagi
        const payload = typeof booking.payload_request === 'string' 
            ? JSON.parse(booking.payload_request) 
            : booking.payload_request;

        const response = typeof booking.raw_response === 'string' 
            ? JSON.parse(booking.raw_response) 
            : booking.raw_response;

        // 2. Olah Data Penumpang & Infant (Bayi)
        const paxHtml = payload.paxDetails.map((p, index) => {
            const isInfant = parseInt(p.type) === 2;
            
            // Mencari nama pemangku jika penumpang adalah bayi
            let parentName = '';
            if (isInfant && p.parent) {
                const parentIdx = parseInt(p.parent) - 1;
                if (payload.paxDetails[parentIdx]) {
                    parentName = payload.paxDetails[parentIdx].firstName;
                }
            }
            
            // Ambil Addons (Bagasi/Seat/Meals) - Mendukung multi-segment (Pergi & Pulang)
            const allAddOns = p.addOns || [];
            const facilities = allAddOns.map((ad, idx) => {
                const label = allAddOns.length > 1 ? (idx === 0 ? '[Pergi]: ' : '[Pulang]: ') : '';
                const parts = [
                    ad.baggageString ? `🧳 ${ad.baggageString}` : '',
                    ad.meals && ad.meals.length > 0 ? `🍴 ${ad.meals.join(', ')}` : '',
                    ad.seat ? `💺 Seat: ${ad.seat}` : ''
                ].filter(x => x).join(' ');
                return parts ? `<div>${label}${parts}</div>` : '';
            }).join('');

            return `
                <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td>
                        <b>${p.title} ${p.firstName} ${p.lastName}</b>
                        ${isInfant ? `<br><span style="color: #666; font-size: 11px;">(Dipangku oleh ${parentName})</span>` : ''}
                    </td>
                    <td>${isInfant ? 'Bayi' : 'Dewasa'}</td>
                    <td style="text-align: center;">${response.bookingCodeAirline || booking.booking_code}</td>
                    <td>${facilities || '-'}</td>
                </tr>`;
        }).join('');

        // 3. Olah Data Penerbangan (Mendukung Pergi & Pulang)
        const flightDeparts = response.flightDeparts || [];
        const flightReturns = response.flightReturns || [];
        
        const renderFlightCard = (f, title) => `
            <div class="section-title">${title}</div>
            <div class="flight-card">
                <div class="airline-info">
                    <span style="font-size: 16px; font-weight: bold;">${booking.airline_id} - ${f.flightNumber}</span><br>
                    <small style="color: #666;">ECONOMY (Subclass ${f.fdFlightClass.trim()})</small>
                </div>
                <div class="time-info">
                    <div class="station">
                        <div class="time">${f.fdDepartTime.includes('T') ? f.fdDepartTime.split('T')[1].substring(0, 5) : f.fdDepartTime.substring(11, 16)}</div>
                        <div class="city">${f.fdOrigin}</div>
                    </div>
                    <div class="duration-line">
                        <div style="font-size: 10px; margin-bottom: 2px;">Terbang Langsung</div>
                        <div style="border-top: 2px dashed #ccc; width: 100px; position: relative;">
                            <span style="position: absolute; top: -8px; left: 45%;">✈</span>
                        </div>
                    </div>
                    <div class="station">
                        <div class="time">${f.fdArrivalTime.includes('T') ? f.fdArrivalTime.split('T')[1].substring(0, 5) : f.fdArrivalTime.substring(11, 16)}</div>
                        <div class="city">${f.fdDestination}</div>
                    </div>
                </div>
            </div>
        `;

        let flightsHtml = flightDeparts.map(f => renderFlightCard(f, 'Penerbangan Pergi')).join('');
        if (flightReturns.length > 0) {
            flightsHtml += flightReturns.map(f => renderFlightCard(f, 'Penerbangan Pulang')).join('');
        }

        // 4. Template HTML & CSS
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; line-height: 1.4; padding: 20px; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0052cc; padding-bottom: 15px; margin-bottom: 20px; }
                .logo-text { font-size: 28px; font-weight: bold; color: #0052cc; }
                .pnr-container { text-align: right; }
                .pnr-label { font-size: 12px; color: #666; margin-bottom: 4px; }
                .pnr-box { background: #0052cc; color: white; padding: 10px 25px; border-radius: 8px; font-size: 20px; font-weight: bold; }
                .info-bar { font-size: 12px; color: #555; margin-bottom: 20px; background: #f9f9f9; padding: 10px; border-radius: 4px; }
                .section-title { background: #eef4ff; color: #0052cc; padding: 10px; font-weight: bold; font-size: 14px; border-left: 4px solid #0052cc; margin-top: 20px; }
                .flight-card { border: 1px solid #e0e0e0; border-top: none; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
                .time-info { display: flex; align-items: center; gap: 30px; }
                .station { text-align: center; }
                .station .time { font-size: 20px; font-weight: bold; }
                .station .city { font-size: 14px; color: #666; }
                .duration-line { text-align: center; color: #bbb; }
                table { width: 100%; border-collapse: collapse; margin-top: 25px; }
                th { background: #f8f9fa; text-align: left; padding: 12px; border-bottom: 2px solid #dee2e6; font-size: 13px; }
                td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
                .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo-text">Tiket Pesawat</div>
                <div class="pnr-container">
                    <div class="pnr-label">KODE BOOKING (PNR)</div>
                    <div class="pnr-box">${response.bookingCodeAirline || booking.booking_code}</div>
                </div>
            </div>
            
            <div class="info-bar">
                Order ID: <b>${booking.reference_no}</b> | 
                Status: <b style="color: green;">${booking.ticket_status}</b> | 
                Operator: <b>${booking.pengguna}</b>
            </div>

            ${flightsHtml}

            <h3 style="margin-top: 30px; color: #0052cc; border-bottom: 1px solid #eee; padding-bottom: 10px;">Detail Penumpang</h3>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">No</th>
                        <th>Nama Penumpang</th>
                        <th>Tipe</th>
                        <th style="text-align: center;">Nomor Tiket</th>
                        <th>Fasilitas & Add-ons</th>
                    </tr>
                </thead>
                <tbody>
                    ${paxHtml}
                </tbody>
            </table>

            <div class="footer">
                <b>PENTING:</b>
                <ul>
                    <li>Mohon tiba di bandara setidaknya 90 menit sebelum keberangkatan untuk penerbangan domestik.</li>
                    <li>Tunjukkan E-tiket ini beserta kartu identitas (KTP/Passport) asli saat check-in.</li>
                    <li>Waktu yang tertera adalah waktu bandara setempat.</li>
                </ul>
            </div>
        </body>
        </html>`;

        // 5. Generate PDF dengan Puppeteer (Konfigurasi Linux/Coolify Friendly)
        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            headless: "new"
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close();

        // 6. Kirim file PDF ke browser
        res.contentType("application/pdf");
        res.setHeader('Content-Disposition', `inline; filename=Ticket-${bookingCode}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error("Generate Ticket Error:", error);
        res.status(500).send(`
            <div style="font-family: sans-serif; padding: 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                <strong>Gagal membuat tiket:</strong> ${error.message}
            </div>
        `);
    }
});

module.exports = router;