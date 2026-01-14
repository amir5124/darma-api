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

        // --- MAPPING DATA ---
        const baggageMap = { "PBAA": "15kg", "PBAB": "20kg", "PBAC": "25kg", "PBAD": "30kg", "PBAF": "40kg" };
        const mealMap = { "NPCB": "Nasi Padang", "NLCB": "Pak Nasser", "NKCB": "Nasi Kuning", "GCCB": "Thai Green", "CRCB": "Uncle Chin" };
        const airlineNames = { "QZ": "AirAsia", "ID": "Batik Air", "GA": "Garuda Indonesia", "JT": "Lion Air", "QG": "Citilink" };

        const qrDataUrl = await QRCode.toDataURL(booking.booking_code);

        // --- RENDER FLIGHT BLOCKS (PERGI & PULANG) ---
        const renderFlightBlocks = (segments, title, color) => {
            if (!segments || segments.length === 0) return '';
            return segments.map((f, idx) => {
                const dep = new Date(f.fdDepartTime);
                const arr = new Date(f.fdArrivalTime);
                const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
                
                return `
                <div class="flight-container">
                    <div class="flight-header" style="background-color: ${color};">
                        <span>✈ ${title} ${idx + 1} Pesawat</span>
                        <span class="status-tag">Dapat Dikembalikan</span>
                    </div>
                    <div class="flight-sub-header">Penerbangan ${idx + 1}</div>
                    <div class="flight-body">
                        <div class="airline-info">
                            <div class="airline-name">${airlineNames[booking.airline_id] || booking.airline_id}</div>
                            <div class="flight-code">${f.flightNumber}</div>
                        </div>
                        <div class="time-block">
                            <div class="label">🛫 Berangkat</div>
                            <div class="station">${f.fdOrigin}</div>
                            <div class="date-time">${dep.toLocaleDateString('id-ID', options)}, ${f.fdDepartTime.split('T')[1].substring(0,5)}</div>
                        </div>
                        <div class="time-block">
                            <div class="label">🛬 Tiba</div>
                            <div class="station">${f.fdDestination}</div>
                            <div class="date-time">${arr.toLocaleDateString('id-ID', options)}, ${f.fdArrivalTime.split('T')[1].substring(0,5)}</div>
                        </div>
                        <div class="duration-block">
                            Non Stop<br>1j 30m
                        </div>
                    </div>
                </div>`;
            }).join('');
        };

        // --- RENDER PASSENGER TABLE ---
        const passengers = response.passengers || payload.paxDetails || [];
        const paxRows = passengers.map((p, pIdx) => {
            const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
            const typeLabel = isInfant ? 'Bayi' : (p.type === 'Child' ? 'Anak' : 'Dewasa');
            const pnr = response.bookingCodeAirline || booking.booking_code;
            const ticketNo = response.referenceNo || '-';

            return `
                <tr>
                    <td>${pIdx + 1}</td>
                    <td><b>${p.title} ${p.firstName} ${p.lastName}</b><br><small>${typeLabel}</small></td>
                    <td>${booking.reference_no}</td>
                    <td style="color: red; font-weight: bold;">${pnr}</td>
                    <td>${ticketNo}</td>
                    <td style="color: green;">Confirmed</td>
                </tr>`;
        }).join('');

        // --- RENDER FACILITIES & PAYMENT ---
        const firstPaxAddons = payload.paxDetails[0]?.addOns?.[0] || {};
        const baggageInfo = baggageMap[firstPaxAddons.baggageString] || firstPaxAddons.baggageString || '20Kg Included';
        const mealsInfo = (firstPaxAddons.meals || []).map(m => mealMap[m] || m).join(', ') || 'Makanan';

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 11px; }
                .top-meta { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #666; font-size: 9px; }
                .flight-container { margin-top: 15px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
                .flight-header { color: white; padding: 6px 12px; display: flex; justify-content: space-between; font-weight: bold; }
                .status-tag { background: white; color: red; padding: 2px 8px; border-radius: 3px; font-size: 9px; }
                .flight-sub-header { background: #f0f0f0; padding: 5px 12px; font-weight: bold; border-bottom: 1px solid #ddd; }
                .flight-body { display: flex; padding: 12px; justify-content: space-between; align-items: center; }
                .airline-name { font-weight: bold; font-size: 13px; }
                .time-block .label { color: #888; font-size: 9px; margin-bottom: 3px; }
                .time-block .station { font-weight: bold; font-size: 12px; }
                .duration-block { border-left: 1px solid #eee; padding-left: 15px; text-align: right; color: #666; }
                
                .section-header { background: #666; color: white; padding: 6px 12px; font-weight: bold; margin-top: 15px; display: flex; gap: 10px; }
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; padding: 8px; background: #f9f9f9; border-bottom: 1px solid #ddd; color: #555; }
                td { padding: 8px; border-bottom: 1px solid #eee; }

                .grid-container { display: flex; gap: 20px; margin-top: 15px; }
                .grid-box { flex: 1; border: 1px solid #ddd; border-radius: 4px; }
                .box-title { background: #f0f0f0; padding: 6px 12px; font-weight: bold; border-bottom: 1px solid #ddd; }
                .box-content { padding: 10px; }
                .price-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
                .total-price { border-top: 1px solid #eee; padding-top: 5px; font-weight: bold; font-size: 13px; }
            </style>
        </head>
        <body>
            <div class="top-meta">
                <span>ID Pemesanan: ${booking.reference_no}</span>
                <span>Tanggal Pemesanan: ${new Date(booking.created_at).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'})}</span>
            </div>

            ${renderFlightBlocks(response.flightDeparts, 'Pergi', '#e31e24')}
            ${renderFlightBlocks(response.flightReturns, 'Pulang', '#e31e24')}

            <div class="section-header">👤 Rincian Penumpang</div>
            <table>
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Penumpang</th>
                        <th>NIK / Paspor</th>
                        <th>PNR</th>
                        <th>No. E-Ticket</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${paxRows}</tbody>
            </table>

            <div class="grid-container">
                <div class="grid-box">
                    <div class="box-title">💰 Rincian Pembayaran</div>
                    <div class="box-content">
                        <div class="price-row"><span>Harga Dasar</span> <span>Rp ${booking.total_price.toLocaleString()}</span></div>
                        <div class="price-row"><span>Pajak & Biaya</span> <span>Rp 0</span></div>
                        <div class="price-row total-price"><span>Total Harga</span> <span>Rp ${booking.total_price.toLocaleString()}</span></div>
                    </div>
                </div>
                <div class="grid-box">
                    <div class="box-title">🧳 Fasilitas Penerbangan</div>
                    <div class="box-content">
                        <strong>Bagasi Kabin:</strong><br>7 Kg Included<br><br>
                        <strong>Bagasi Check-in:</strong><br>${baggageInfo}<br><br>
                        <strong>Tambahan:</strong><br>${mealsInfo}
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
                <strong>Informasi Penting:</strong>
                <p style="font-size: 9px; color: #666;">
                    Semua penumpang, termasuk anak-anak dan bayi, harus menunjukkan identitas asli saat check-in. 
                    Check-in dimulai 2 jam sebelum keberangkatan domestik. Mohon periksa kembali terminal keberangkatan Anda.
                </p>
            </div>
            
            <div style="text-align: right; margin-top: -50px;">
                <img src="${qrDataUrl}" width="70">
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10px', bottom: '10px' } });
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdfBuffer);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

module.exports = router;