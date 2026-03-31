const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');
const flightController = require('../controllers/flightController');
const { sendBookingEmail } = require('../utils/mailer');
const moment = require('moment-timezone');
const nodemailer = require('nodemailer');
// const puppeteer = require('puppeteer');
// const QRCode = require('qrcode');
/**
 * HELPER: ARCHIVE DATA KE DATABASE
 * Membersihkan format ISO (T/Z) agar kompatibel dengan MySQL DATE & DATETIME
 */
const AIRLINE_GROUPS = {
    // AirAsia Group
    'AK': 'QZ', 'FD': 'QZ', 'XT': 'QZ', 'Z2': 'QZ', 'QZ': 'QZ',

    // Lion Air Group - Standalone / Individual Mapping
    'JT': 'JTA',  // Lion Air tetap ke JTA
    'IW': 'IW',   // Wings Air (Berdiri sendiri)
    'IU': 'IU',   // Super Air Jet (Berdiri sendiri)
    'ID': 'ID',   // Batik Air (Berdiri sendiri)
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



router.post('/create-booking', async (req, res) => {
    // Menggunakan connection untuk mendukung Transaction agar data antar tabel sinkron
    const connection = await db.getConnection(); 

    try {
        const token = await getConsistentToken();
        const { usernameFromFrontend, ...cleanBody } = req.body;
        
        const fullPhone = cleanBody.contactRemainingPhoneNo 
            ? `+${cleanBody.contactCountryCodePhone || '62'}${cleanBody.contactRemainingPhoneNo}`
            : (cleanBody.contactPhone || cleanBody.customer_phone || '-');

        const payload = {
            ...cleanBody,
            customer_phone: fullPhone,
            airlineAccessCode: cleanBody.airlineAccessCode || cleanBody.airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        console.log("--------------------------------------------------");
        console.log("📤 [STEP 1] Sending Booking to Vendor...");

        // 1. Panggil API Vendor
        const response = await axios.post(`${BASE_URL}/Airline/Booking`, payload, {
            httpsAgent: agent,
            timeout: 60000
        });

        console.log("📡 [STEP 2] Response from Vendor Received!");

        // 2. Jika Vendor Sukses, Simpan ke Database Internal
        if (response.data.status === "SUCCESS") {
            try {
                console.log("💾 [STEP 3] Vendor SUCCESS. Saving to Database...");

                // Mulai Transaksi Database agar ketiga tabel (bookings, itinerary, passengers) terisi semua
                await connection.beginTransaction();

                // --- A. INSERT KE TABEL bookings ---
                const [resBooking] = await connection.execute(
                    `INSERT INTO bookings (
                        booking_code, reference_no, airline_id, airline_name, 
                        trip_type, origin, destination, origin_port, destination_port,
                        depart_date, ticket_status, total_price, sales_price, time_limit, 
                        user_id, pengguna, customer_email, access_token, payload_request, raw_response
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        response.data.bookingCode,
                        response.data.referenceNo,
                        payload.airlineID,
                        payload.airlineName || payload.airlineID,
                        payload.tripType || "OneWay",
                        payload.origin,
                        payload.destination,
                        response.data.origin || payload.origin_port || null,
                        response.data.destination || payload.destination_port || null,
                        payload.departDate ? payload.departDate.replace('T', ' ').replace('Z', '').split('.')[0] : null,
                        response.data.ticketStatus || "HOLD",
                        response.data.ticketPrice || 0,
                        response.data.salesPrice || 0,
                        response.data.timeLimit ? response.data.timeLimit.replace('T', ' ').substring(0, 19) : null,
                        response.data.userID,
                        usernameFromFrontend || 'Guest',
                        payload.contactEmail,
                        payload.accessToken,
                        JSON.stringify(payload),
                        JSON.stringify(response.data)
                    ]
                );

                const internalId = resBooking.insertId;

                // --- B. INSERT KE TABEL flight_itinerary (Agar jam tidak muncul --:--) ---
                const itineraryData = (payload.schDeparts && payload.schDeparts.length > 0) ? payload.schDeparts : [];
                for (const f of itineraryData) {
                    await connection.execute(
                        `INSERT INTO flight_itinerary (
                            booking_id, category, flight_number, origin, 
                            destination, depart_time, arrival_time, flight_class, pengguna
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            internalId, 'Departure', f.flightNumber, f.schOrigin, f.schDestination,
                            f.schDepartTime ? f.schDepartTime.replace('T', ' ').substring(0, 19) : null,
                            f.schArrivalTime ? f.schArrivalTime.replace('T', ' ').substring(0, 19) : null,
                            f.flightClass, usernameFromFrontend || 'Guest'
                        ]
                    );
                }

                // --- C. INSERT KE TABEL passengers (Agar nama muncul di riwayat) ---
                const passengers = payload.paxDetails || [];
                for (const p of passengers) {
                    await connection.execute(
                        `INSERT INTO passengers (booking_id, title, first_name, last_name, pax_type, id_number, birth_date, pengguna) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            internalId, p.title, p.firstName, p.lastName, 
                            p.type === 0 ? 'Adult' : 'Child', p.IDNumber || '', p.birthDate || null, usernameFromFrontend || 'Guest'
                        ]
                    );
                }

                // Commit Transaksi
                await connection.commit();
                console.log(`✅ [STEP 4] Success! Booking ${response.data.bookingCode} saved with details.`);

                // ======================================================
                // --- LOGIKA PENGIRIMAN EMAIL (FORMAT SESUAI GAMBAR) ---
                // ======================================================
                const customerEmail = payload.contactEmail;
                if (customerEmail) {
                    const subject = `[LinkU] Konfirmasi Pemesanan Tiket - ${response.data.bookingCode}`;

                    const nowLabel = moment().tz('Asia/Jakarta').format('dddd, DD MMMM YYYY HH:mm') + ' WIB';
                    const timeLimitLabel = moment(response.data.timeLimit).format('dddd, DD MMMM YYYY HH:mm') + ' WIB';

                    const emailHtml = `
                    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 700px; margin: auto; border: 1px solid #eee;">
                        <div style="background-color: #24b3ae; padding: 10px; color: white; font-weight: bold;">Tiket Booked</div>
                        <div style="padding: 20px;">
                            <p>Anda mempunyai pemesanan tiket pesawat, segera lakukan konfirmasi pesanan berikut.</p>
                            <p style="font-size: 13px; color: #666;">Detail data informasi pemesanan yang telah dilakukan,</p>
                            
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                                <tr><td style="width: 30%; padding: 5px 0;">Tanggal Booking</td><td>: ${nowLabel}</td></tr>
                                ${(payload.paxDetails || []).map((pax) => `
                                <tr><td style="width: 30%; padding: 5px 0;">Nama</td><td style="padding: 5px 0;">: ${pax.firstName} ${pax.lastName}</td></tr>
                                `).join('')}
                                <tr><td style="padding: 5px 0;">Telepon</td><td>: ${payload.customer_phone || '-'}</td></tr>
                                <tr><td style="padding: 5px 0;">Time Limit</td><td style="color: #e03f7d; font-weight: bold;">: ${timeLimitLabel}</td></tr>
                                <tr><td style="padding: 5px 0;">Status Pesanan</td><td>: <span style="background: #e03f7d; color: white; padding: 2px 8px; font-size: 12px; border-radius: 3px;">Menunggu Pembayaran</span></td></tr>
                            </table>

                            <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold;">Data Perjalanan</div>
                            <div style="background: #c8d992; padding: 8px 15px; font-size: 13px; display: flex; justify-content: space-between;">
                                <span><b>Penerbangan Pergi</b></span>
                                <span style="float: right;"><b>Langsung</b></span>
                            </div>

                            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                                <thead style="background: #fdfae2;">
                                    <tr>
                                        <th style="padding: 10px; border-bottom: 1px solid #eee;">Pesawat</th>
                                        <th style="padding: 10px; border-bottom: 1px solid #eee;">Rute</th>
                                        <th style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Kode Booking</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="padding: 15px 10px;">
                                            <b style="color: #24b3ae;">${payload.airlineName || payload.airlineID}</b><br>
                                            <small>${itineraryData[0]?.flightNumber || ''}</small>
                                        </td>
                                        <td style="padding: 15px 10px;">
                                            <b>${moment(payload.departDate).format('DD MMM 2026 HH:mm')}</b><br>
                                            ${payload.originName || payload.origin} (${payload.origin})<br><br>
                                            <b>${moment(payload.departDate).add(2, 'hours').format('DD MMM 2026 HH:mm')}</b><br>
                                            ${payload.destinationName || payload.destination} (${payload.destination})
                                        </td>
                                        <td style="padding: 15px 10px; text-align: right; vertical-align: top;">
                                            <b style="font-size: 16px;">${response.data.bookingCode}</b>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold; margin-top: 20px;">Data Penumpang [${payload.paxDetails?.length || 1} Dewasa]</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead style="background: #f9f9f9;">
                                    <tr>
                                        <th style="padding: 10px; border-bottom: 1px dotted #ccc; width: 40px;">#</th>
                                        <th style="padding: 10px; border-bottom: 1px dotted #ccc; text-align: left;">Nama</th>
                                        <th style="padding: 10px; border-bottom: 1px dotted #ccc; text-align: right;">Tanggal Lahir</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(payload.paxDetails || []).map((pax, index) => `
                                        <tr>
                                            <td style="padding: 10px; border-bottom: 1px dotted #eee;">${index + 1}</td>
                                            <td style="padding: 10px; border-bottom: 1px dotted #eee;">${pax.title} ${pax.firstName} ${pax.lastName}</td>
                                            <td style="padding: 10px; border-bottom: 1px dotted #eee; text-align: right;">${pax.birthDate || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>

                            <div style="margin-top: 30px; text-align: center;">
                                <p style="font-size: 14px;">Segera lakukan pembayaran sebelum batas waktu berakhir untuk menerbitkan tiket.</p>
                            </div>
                        </div>
                    </div>`;

                    sendBookingEmail(customerEmail, subject, emailHtml)
                        .then(() => console.log(`📧 [LOG EMAIL] Berhasil dikirim ke: ${customerEmail}`))
                        .catch(err => console.error(`❌ [LOG EMAIL] Gagal:`, err.message));
                }

                const finalResponse = { ...response.data, id: internalId };
                return res.json(finalResponse);

            } catch (dbError) {
                if (connection) await connection.rollback();
                console.error("❌ DB ERROR:", dbError.message);
                return res.json(response.data);
            }
        } else {
            console.warn("⚠️ Vendor NON-SUCCESS:", response.data.respMessage);
            return res.json(response.data);
        }

    } catch (error) {
        console.error("❌ FATAL ERROR:", error.message);
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    } finally {
        if (connection) connection.release();
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
        const response = await axios.post(
            `${BASE_URL}/Airline/Issued`, 
            { ...req.body, userID: USER_CONFIG.userID, accessToken: token }, 
            { httpsAgent: agent }
        );

        if (response.data.status === "SUCCESS") {
            const bCode = req.body.bookingCode;
            
            // Update status dan kirim email
            try {
                await db.execute(
                    "UPDATE bookings SET ticket_status = 'Ticketed' WHERE booking_code = ?", 
                    [bCode]
                );
                
                // Panggil pengiriman email (tanpa await agar user tidak menunggu lama)
                sendTicketEmail(bCode).catch(e => console.error("Background Email Error:", e.message));
                
            } catch (dbErr) {
                console.error("DB Update Error during Issued:", dbErr.message);
            }
        }

        res.json(response.data);
    } catch (error) {
        res.json({ status: "FAILED", respMessage: error.message });
    }
});


async function getTicketHtmlContent(bookingCode, db) {
    const [rows] = await db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
    if (rows.length === 0) throw new Error("Booking tidak ditemukan");

    const booking = rows[0];
    const payload = typeof booking.payload_request === 'string' ? JSON.parse(booking.payload_request) : booking.payload_request;
    const response = typeof booking.raw_response === 'string' ? JSON.parse(booking.raw_response) : booking.raw_response;

    // Helper Durasi
    const calculateDuration = (depart, arrival) => {
        if (!depart || !arrival) return '--';
        const start = new Date(depart);
        const end = new Date(arrival);
        const diffMs = end - start;
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.round(((diffMs % 3600000) / 60000));
        return `${diffHrs}j ${diffMins}m`;
    };

    const baggageMap = { "PBAA": "15kg", "PBAB": "20kg", "PBAC": "25kg", "PBAD": "30kg", "PBAF": "40kg" };
    const mealMap = { "NPCB": "Nasi Padang", "NLCB": "Pak Nasser", "NKCB": "Nasi Kuning", "GCCB": "Thai Green", "CRCB": "Uncle Chin" };
    const airlineNames = { "QZ": "AirAsia", "ID": "Batik Air", "GA": "Garuda Indonesia", "JT": "Lion Air", "QG": "Citilink" };
    const defaultBaggage = { "QG": "20kg", "JT": "0kg", "ID": "20kg", "GA": "20kg", "QZ": "0kg" };

    const qrDataUrl = await QRCode.toDataURL(response.bookingCodeAirline || booking.booking_code);

    // Render Flight
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
                            <div class="line-container"><span class="circle-hollow"></span><span class="hr-line"></span><span class="circle-solid"></span></div>
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

    // Render Passengers
    const passengers = response.passengers || payload.paxDetails || [];
    const isRoundTrip = payload.tripType === "RoundTrip";

    const paxRows = passengers.map((p, pIdx) => {
        const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
        const typeLabel = isInfant ? 'Infant<small>Bayi</small>' : (p.type === 'Child' || parseInt(p.type) === 1 ? 'Child<small>Anak</small>' : 'Adult<small>Dewasa</small>');
        const originalPax = payload.paxDetails ? payload.paxDetails[pIdx] : null;
        const adPergi = originalPax?.addOns?.[0] || null;
        const adPulang = isRoundTrip ? (originalPax?.addOns?.[1] || null) : null;
        const getBagLabel = (ad) => {
            if (isInfant) return '-';
            const raw = ad?.baggageString || "";
            return (raw === "" || raw === "-") ? (defaultBaggage[booking.airline_id] || "0kg") : (baggageMap[raw] || raw);
        };
        const bagInfo = isRoundTrip ? `<div style="border-bottom:1px solid #eee; padding-bottom:2px;">🛫 ${getBagLabel(adPergi)}</div><div style="padding-top:2px;">🛬 ${getBagLabel(adPulang)}</div>` : getBagLabel(adPergi);
        const seatInfo = isRoundTrip ? `${adPergi?.seat || '-'} / ${adPulang?.seat || '-'}` : (adPergi?.seat || '-');
        const getMeals = (ad, label) => {
            if (!ad || !ad.meals || ad.meals.length === 0) return '';
            return `<div style="font-size:7px; line-height:1"><b>${label}:</b> ${ad.meals.map(m => mealMap[m] || m).join(', ')}</div>`;
        };
        const mealsInfo = isRoundTrip ? `${getMeals(adPergi, 'Pergi')} ${getMeals(adPulang, 'Pulang')}` || '-' : (adPergi?.meals?.length > 0 ? adPergi.meals.map(m => mealMap[m] || m).join(', ') : '-');

        return `<tr><td style="text-align:center">${pIdx + 1}</td><td><b>${p.title} ${p.firstName} ${p.lastName}</b></td><td>${typeLabel}</td><td style="text-align:center">${seatInfo}</td><td style="text-align:center; font-size:8.5px;">${bagInfo}</td><td style="font-size:8.5px;">${mealsInfo}</td></tr>`;
    }).join('');

    const ticketPrice = Number(booking.total_price);

    // TEMPLATE HTML LENGKAP DENGAN CSS
    return `
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
                        <div class="purchased-from">Jln. Negara rt.16 Tengin Baru Kec. Sepaku<br> Kab. Penajam Paser Utara -IKN<br> Telp: 081347423737<br>E-mail: linkuikn@gmail.com</div>
                    </td>
                    <td align="right" style="vertical-align: top;">
                        <img src="${qrDataUrl}" width="75">
                        <div style="margin-top: 5px; text-align: center; width: 85px;">
                            <div style="font-size: 8px; color: #666; text-transform: uppercase;">Booking Code</div>
                            <div style="font-size: 14px; font-weight: bold; color: #24b3ae; letter-spacing: 1px;">${response.bookingCodeAirline || booking.booking_code}</div>
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
                    <span>Ticket for ${passengers.length} Passenger <br><small style="font-weight:normal; color:#666;">Tiket untuk ${passengers.length} penumpang</small></span>
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
            <div style="text-align: center; color: #000000; margin: 20px 0; font-weight: bold;">Support PT Darmawisata Indonesia</div>
            <div class="footer-border"></div>
        </div>
    </body>
    </html>`;
}

/**
 * --- FUNGSI HELPER: GENERATE PDF BUFFER ---
 */
async function generatePdfBuffer(htmlContent) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0.4cm', bottom: '0.4cm', left: '0.4cm', right: '0.4cm' }
    });
    await browser.close();
    return pdfBuffer;
}

/**
 * --- 1. ENDPOINT: GENERATE TICKET (DOWNLOAD LANGSUNG) ---
 */
router.get('/generate-ticket/:bookingCode', async (req, res) => {
    try {
        const html = await getTicketHtmlContent(req.params.bookingCode, db);
        const pdfBuffer = await generatePdfBuffer(html);
        res.contentType("application/pdf");
        res.setHeader('Content-Disposition', `attachment; filename=Ticket-${req.params.bookingCode}.pdf`);
        res.send(pdfBuffer);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});


async function sendTicketEmail(bookingCode) {
    try {
        const [rows] = await db.execute("SELECT customer_email FROM bookings WHERE booking_code = ?", [bookingCode]);
        if (rows.length === 0 || !rows[0].customer_email) return;

        // Ambil HTML yang sama persis
        const htmlContent = await getTicketHtmlContent(bookingCode, db);
        // Buat PDF yang sama persis
        const pdfBuffer = await generatePdfBuffer(htmlContent);

        const email = rows[0].customer_email;
        const subject = `[LinkU] E-Ticket Berhasil Terbit - ${bookingCode}`;
        
        // Body email sederhana (karena tiket utama ada di attachment PDF)
       const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h3>Tiket Anda <b>${bookingCode}</b> sudah terbit!</h3>
        
        <p>Terima kasih telah memesan melalui <b>LinkU</b> IKN. 
        E-Tiket resmi Anda telah kami lampirkan pada email ini dalam format PDF.</p>
        
        <p>Mohon simpan dan tunjukkan tiket tersebut saat keberangkatan.</p>
        
        <p><b>LinkU</b>, satu aplikasi semua kebutuhan</p>

        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px;">
            <p style="margin: 2px 0;">WA : 081347423737</p>
            <p style="margin: 2px 0;">Email : linkuikn@gmail.com</p>
            <p style="margin: 2px 0;">IG : @linkuapps</p>
            <p style="margin: 2px 0;">FB : Linku Nusantara</p>
        </div>
    </div>
`;

        // Kirim email (Pastikan fungsi sendBookingEmail Anda mendukung attachment)
        await sendBookingEmail(email, subject, emailBody, [
            {
                filename: `E-Ticket-${bookingCode}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]);

        console.log(`📧 [SUCCESS] E-Ticket dikirim ke ${email}`);
    } catch (err) {
        console.error("❌ Error di sendTicketEmail:", err.message);
    }
}



module.exports = router;