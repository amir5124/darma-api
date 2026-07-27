const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');
const flightController = require('../controllers/flightController');
const { sendBookingEmail } = require('../utils/mailer');
const moment = require('moment-timezone');
const { issueTicketForBooking, getTicketHtmlContent, generatePdfBuffer } = require('../helpers/ticketService');
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
    const connection = await db.getConnection();

    try {
        const token = await getConsistentToken();

        // 1. Ambil data khusus dari frontend
        const { usernameFromFrontend, admin_fee, ...cleanBody } = req.body;

        // Pastikan admin_fee adalah angka untuk log dan database
        const finalAdminFee = Number(admin_fee) || 0;
        const operator = usernameFromFrontend || 'Guest';

        const fullPhone = cleanBody.contactRemainingPhoneNo
            ? `+${cleanBody.contactCountryCodePhone || '62'}${cleanBody.contactRemainingPhoneNo}`
            : (cleanBody.contactPhone || cleanBody.customer_phone || '-');

        // 2. Masukkan kembali admin_fee ke dalam objek payload agar tersimpan di database
        const payload = {
            ...cleanBody,
            admin_fee: finalAdminFee, // PENTING: Agar saveBooking bisa membaca ini
            usernameFromFrontend: operator,
            customer_phone: fullPhone,
            airlineAccessCode: cleanBody.airlineAccessCode || cleanBody.airlineID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // --- LOGGING SECTION ---
        console.log("--------------------------------------------------");
        console.log(`🚀 [NEW BOOKING] Operator: ${operator}`);
        console.log(`💰 [FEE] Admin Fee: Rp ${finalAdminFee.toLocaleString('id-ID')}`);
        console.log(`📦 [PAYLOAD] Airline: ${payload.airlineID}, Route: ${payload.origin} -> ${payload.destination}`);
        console.log("--------------------------------------------------");

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
                        depart_date, ticket_status, total_price, sales_price, admin_fee, 
                        time_limit, user_id, pengguna, customer_email, access_token, 
                        payload_request, raw_response
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        payload.admin_fee || 0,
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

                // --- B. INSERT KE TABEL flight_itinerary (FIX: Ambil jam dari schDeparts) ---
                const itineraryData = (payload.schDeparts && payload.schDeparts.length > 0) ? payload.schDeparts : [];
                for (const f of itineraryData) {
                    await connection.execute(
                        `INSERT INTO flight_itinerary (
                            booking_id, category, flight_number, origin, 
                            destination, depart_time, arrival_time, flight_class, pengguna
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            internalId, 'Departure', f.flightNumber, f.schOrigin, f.schDestination,
                            f.schDepartTime ? f.schDepartTime.replace('T', ' ').substring(0, 19) : (payload.departDate ? payload.departDate.replace('T', ' ').substring(0, 19) : null),
                            f.schArrivalTime ? f.schArrivalTime.replace('T', ' ').substring(0, 19) : null,
                            f.flightClass, usernameFromFrontend || 'Guest'
                        ]
                    );
                }

                // --- C. INSERT KE TABEL passengers ---
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
                // --- LOGIKA PENGIRIMAN EMAIL ---
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
                                            <b>${itineraryData[0]?.schDepartTime ? moment(itineraryData[0].schDepartTime).format('DD MMM YYYY HH:mm') : moment(payload.departDate).format('DD MMM YYYY HH:mm')}</b><br>
                                            ${payload.originName || payload.origin} (${payload.origin})<br><br>
                                            
                                            <b>${itineraryData[0]?.schArrivalTime ? moment(itineraryData[0].schArrivalTime).format('DD MMM YYYY HH:mm') : '-'}</b><br>
                                            ${payload.destinationName || payload.destination} (${payload.destination})
                                        </td>
                                        <td style="padding: 15px 10px; text-align: right; vertical-align: top;">
                                            <b style="font-size: 16px;">${response.data.bookingCode}</b>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style="background: #24b3ae; color: white; padding: 8px 15px; font-weight: bold; margin-top: 20px;">Data Penumpang [${payload.paxDetails?.length || 1} Penumpang]</div>
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

router.post('/update-admin-fee', async (req, res) => {
    const { bookingCode, admin_fee } = req.body;
    console.log(admin_fee, "fee")
    try {
        await db.execute(
            `UPDATE bookings SET admin_fee = ? WHERE booking_code = ?`,
            [admin_fee, bookingCode]
        );
        res.json({ status: "SUCCESS" });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// POST: Update discount value
// Dipanggil dari confirmIssued() di frontend Jagel
router.post('/update-discount', async (req, res) => {
    try {
        const { bookingCode, discount, komisi } = req.body;

        if (!bookingCode) {
            return res.status(400).json({
                status: "FAILED",
                message: 'bookingCode wajib diisi'
            });
        }

        const nilaiDiskon = Number(discount) || 0;
        const nilaiKomisi = Number(komisi) || 0;

        // Validasi: diskon tidak boleh negatif
        if (nilaiDiskon < 0) {
            return res.status(400).json({
                status: "FAILED",
                message: 'Nilai diskon tidak boleh negatif'
            });
        }

        const [result] = await db.execute(
            `UPDATE bookings 
             SET discount = ?, 
                 komisi = ?,
                 updated_at = NOW()
             WHERE booking_code = ?`,
            [nilaiDiskon, nilaiKomisi, bookingCode]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "FAILED",
                message: `Booking ${bookingCode} tidak ditemukan`
            });
        }

        console.log(`✅ Diskon tersimpan: ${bookingCode} | Diskon: ${nilaiDiskon} | Komisi: ${nilaiKomisi}`);

        res.json({
            status: "SUCCESS",
            message: 'Diskon berhasil disimpan',
            data: {
                bookingCode,
                discount: nilaiDiskon,
                komisi: nilaiKomisi
            }
        });

    } catch (error) {
        console.error('❌ Error update-discount:', error);
        res.status(500).json({
            status: "FAILED",
            message: error.message
        });
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
// router.post('/issued-ticket', async (req, res) => {
//     try {
//         const token = await getConsistentToken();
//         const response = await axios.post(
//             `${BASE_URL}/Airline/Issued`,
//             { ...req.body, userID: USER_CONFIG.userID, accessToken: token },
//             { httpsAgent: agent }
//         );

//         if (response.data.status === "SUCCESS") {
//             const bCode = req.body.bookingCode;

//             // Update status dan kirim email
//             try {
//                 await db.execute(
//                     "UPDATE bookings SET ticket_status = 'Ticketed' WHERE booking_code = ?",
//                     [bCode]
//                 );

//                 // Panggil pengiriman email (tanpa await agar user tidak menunggu lama)
//                 sendTicketEmail(bCode).catch(e => console.error("Background Email Error:", e.message));

//             } catch (dbErr) {
//                 console.error("DB Update Error during Issued:", dbErr.message);
//             }
//         }

//         res.json(response.data);
//     } catch (error) {
//         res.json({ status: "FAILED", respMessage: error.message });
//     }
// });

router.post('/issued-ticket', async (req, res) => {
    try {
        const result = await issueTicketForBooking(req.body.bookingCode);
        res.json(result);
    } catch (e) {
        res.json({ status: "FAILED", respMessage: e.message });
    }
});

// GENERATE TICKET PDF (pakai fungsi dari ticketService, bukan definisi lokal)
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


module.exports = router;