const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');

/**
 * GET SHIP DLU ROUTES
 * Mendapatkan daftar pelabuhan asal dan tujuan untuk kapal DLU
 */
router.post('/route', async (req, res) => {
    try {
        // Mengambil token yang valid secara otomatis dari helper
        const token = await getConsistentToken();

        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_ROUTE: Fetching DLU ship routes");

        const response = await axios.post(`${BASE_URL}/ShipDlu/Route`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_ROUTE", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Route Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * GET SHIP DLU CLASS TYPES
 * Mendapatkan daftar tipe kelas yang tersedia pada layanan DLU
 */
router.post('/class-types', async (req, res) => {
    try {
        // Mengambil token otomatis dari helper
        const token = await getConsistentToken();

        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_CLASSTYPES: Fetching DLU class types list");

        const response = await axios.post(`${BASE_URL}/ShipDlu/ClassTypes`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_CLASSTYPES", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Class Types Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * GET SHIP DLU VEHICLE TYPES
 * Mendapatkan daftar tipe kendaraan yang bisa diangkut oleh DLU
 */
router.post('/vehicle-types', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_VEHICLETYPES: Fetching DLU vehicle categories");

        const response = await axios.post(`${BASE_URL}/ShipDlu/VehicleTypes`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Ship DLU Vehicle Types Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

/**
 * GET SHIP DLU TICKET TYPES
 * Mendapatkan daftar tipe tiket yang tersedia (Orang/Kendaraan/Barang)
 */
router.post('/ticket-types', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_TICKETTYPES: Fetching DLU ticket categories");

        const response = await axios.post(`${BASE_URL}/ShipDlu/TicketTypes`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_TICKETTYPES", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Ticket Types Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * GET SHIP DLU ROOM CLASSES
 * Mendapatkan daftar kategori kamar/ruangan pada kapal DLU
 */
router.post('/room-classes', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_ROOMCLASSES: Fetching DLU room class categories");

        const response = await axios.post(`${BASE_URL}/ShipDlu/RoomClasses`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_ROOMCLASSES", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Room Classes Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * POST SHIP DLU SCHEDULE
 * Mencari jadwal kapal DLU berdasarkan rute, rentang tanggal, dan tipe layanan
 */
router.post('/schedule', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Pastikan mandatory data tidak null dan tipe data sesuai (Integer jika diperlukan)
        const payload = {
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            departStartDate: b.departStartDate, 
            departEndDate: b.departEndDate,
            // Jika ID kosong, berikan default "0" atau angka yang valid sesuai dokumentasi DLU
            paxClass: b.paxClass ? String(b.paxClass) : "0", 
            ticketType: b.ticketType ? String(b.ticketType) : "0",
            vehicleType: b.vehicleType ? String(b.vehicleType) : "0",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHPDLU_SCHEDULE: ${payload.originPort} to ${payload.destinationPort}`);
        
        // Debugging: Pastikan payload di console backend sudah benar
        console.log("Payload Sent to DLU:", payload);

        const response = await axios.post(`${BASE_URL}/ShipDlu/Schedule`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        // Jika API membalas SUCCESS tapi data kosong, pastikan format tetap konsisten
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Schedule Error: " + error.message);
        res.status(500).json({ 
            status: "FAILED", 
            respMessage: error.response ? JSON.stringify(error.response.data) : error.message 
        });
    }
});

/**
 * POST SHIP DLU SELECT SCHEDULE
 * Mengunci jadwal dan tarif yang dipilih sebelum proses booking
 */
router.post('/select-schedule', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Validasi sederhana untuk memastikan fares adalah array
        if (!b.fares || !Array.isArray(b.fares)) {
            return res.status(400).json({ status: "FAILED", respMessage: "Fares harus berupa array" });
        }

        const payload = {
            shipNumber: String(b.shipNumber),
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            departDate: b.departDate, // Format: 2025-12-29T00:00:00Z
            fares: b.fares.map(f => ({
                count: parseInt(f.count),
                data: f.data
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHPDLU_SELECT: Selecting ship ${payload.shipNumber}`);

        const response = await axios.post(`${BASE_URL}/ShipDlu/SelectDLUSchedule`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Select Schedule Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * POST SHIP DLU PRICE
 * Validasi harga final berdasarkan data penumpang yang telah diisi
 */
router.post('/price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            fares: b.fares || [],
            // Mapping listPax agar semua field mandatory terisi
            listPax: (b.listPax || []).map(pax => ({
                name: pax.name || "",
                gender: String(pax.gender), // "0" atau "1"
                id: pax.id || "",
                dob: pax.dob || "",
                note: pax.note || "",
                price: parseFloat(pax.price) || 0,
                admin: parseFloat(pax.admin) || 0,
                paxType: pax.paxType || "",   // MANDATORY
                paxClass: pax.paxClass || "", // MANDATORY
                paxGroup: pax.paxGroup || "", // MANDATORY
                paxInfo: pax.paxInfo || "",
                city: pax.city || ""          // MANDATORY
            })),
            listVehicle: b.listVehicle || [],
            listRoom: b.listRoom || [],
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/ShipDlu/Price`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Ship DLU Price Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

/**
 * POST SHIP DLU ISSUED
 * Tahap akhir: Melakukan issued/penerbitan tiket resmi
 */
router.post('/issued', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // 1. Fungsi Helper untuk membersihkan objek pax
        const cleanPax = (p) => ({
            paxGroup: p.paxGroup || "",
            gender: String(p.gender || "0"),
            name: p.name || "",
            id: p.id || "",
            dob: p.dob || "",
            city: p.city || "",
            note: p.note || "",
            admin: parseFloat(p.admin || 0),
            price: parseFloat(p.price || 0),
            paxType: p.paxType || "",
            paxClass: p.paxClass || "",
            paxInfo: p.paxInfo || ""
        });

        // 2. Fallback Data
        const firstPaxReguler = b.listPax?.[0];
        const firstPaxRoom = b.listRoom?.[0]?.paxes?.[0];
        const referencePax = firstPaxReguler || firstPaxRoom || {};

        // 3. Susun Payload Final untuk API DLU
        const payload = {
            numCode: String(b.numCode),
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            listPax: (b.listPax || []).map(p => cleanPax(p)),
            listRoom: (b.listRoom || []).map(r => ({
                info: r.info || "",
                roomClass: r.roomClass || "",
                price: parseFloat(r.price || 0),
                admin: parseFloat(r.admin || 0),
                paxes: (r.paxes || []).map(p => cleanPax(p))
            })),
            listVehicle: b.listVehicle || [],
            bookerData: {
                gender: String(b.bookerData?.gender || referencePax.gender || "0"),
                name: b.bookerData?.name || referencePax.name || "",
                id: b.bookerData?.id || referencePax.id || "",
                email: b.bookerData?.email || "",
                phone: b.bookerData?.phone || "",
                city: b.bookerData?.city || referencePax.city || ""
            },
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // 4. Logging Request
        logger.info(`[DLU_ISSUED] START - NumCode: ${payload.numCode}`);
        logger.debug(`[DLU_ISSUED] PAYLOAD: ${JSON.stringify(payload)}`);

        // 5. Hit API Vendor
        const response = await axios.post(`${BASE_URL}/ShipDlu/Issued`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        const resData = response.data;

        // 6. LOGIKA DATABASE (History & Biaya Layanan)
        if (resData.status === "SUCCESS") {
            try {
                /** * KONFIGURASI BIAYA LAYANAN
                 * Anda bisa mengubah nilai ini menjadi dinamis (misal ambil dari req.body.serviceFee)
                 */
                const MY_SERVICE_FEE = 15000; // Contoh: Rp 15.000
                const vendorTicketPrice = parseFloat(resData.ticketPrice || 0);
                const finalTotalUser = vendorTicketPrice + MY_SERVICE_FEE;

                // A. Simpan Tabel Utama
                const [header] = await db.execute(
                    `INSERT INTO bookings_dlu (
                        booking_number, num_code, ship_name, origin_name, 
                        destination_name, depart_date, ticket_price, 
                        service_fee, total_bayar, customer_name, 
                        customer_phone, customer_email, status, raw_response
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        resData.bookingNumber,
                        resData.numCode,
                        resData.shipName,
                        resData.originName,
                        resData.destinationName,
                        resData.departDate,
                        vendorTicketPrice,
                        MY_SERVICE_FEE,
                        finalTotalUser,
                        payload.bookerData.name,
                        payload.bookerData.phone,
                        payload.bookerData.email,
                        'SUCCESS',
                        JSON.stringify(resData)
                    ]
                );

                const newBookingId = header.insertId;

                // B. Simpan Detail Pax (Looping dari Response agar dapat Nomor Tiket & QR)
                if (resData.paxBookingDetails && resData.paxBookingDetails.length > 0) {
                    const paxValues = resData.paxBookingDetails.map(pax => [
                        newBookingId,
                        pax.paxName,
                        pax.paxType,
                        pax.ID, // NIK atau Plat Nomor
                        pax.paxGender || '-',
                        pax.ticketNumber,
                        pax.ticketQRCode,
                        pax.fare,
                        pax.admin
                    ]);

                    await db.query(
                        `INSERT INTO booking_pax_details_dlu (
                            booking_id, pax_name, pax_type, id_number, 
                            gender, ticket_number, ticket_qr_code, fare, admin_vendor
                        ) VALUES ?`,
                        [paxValues]
                    );
                }

                // C. Inject Informasi Tambahan ke Response untuk Frontend
                resData.my_service_fee = MY_SERVICE_FEE;
                resData.grand_total_user = finalTotalUser;

                logger.info(`[DLU_DB] SUCCESS - Saved BookingID: ${newBookingId} for ${resData.bookingNumber}`);

            } catch (dbErr) {
                // Log error DB tapi jangan gagalkan response ke user karena tiket sudah sukses di vendor
                logger.error(`[DLU_DB] CRITICAL ERROR: Gagal simpan ke database: ${dbErr.message}`);
                logger.error(dbErr.stack);
            }
        } else {
            logger.warn(`[DLU_ISSUED] VENDOR_FAILED - Message: ${resData.respMessage}`);
        }

        // 7. Kirim Response Final
        res.json(resData);

    } catch (error) {
        const errorData = error.response?.data;
        const status = error.response?.status || 500;
        
        logger.error(`[DLU_ISSUED] EXCEPTION - Status: ${status} - Error: ${JSON.stringify(errorData || error.message)}`);
        
        res.status(status).json({ 
            status: "ERROR", 
            respMessage: errorData?.respMessage || error.message,
            debug: process.env.NODE_ENV === 'development' ? errorData : undefined
        });
    }
});

router.post('/get-eticket', async (req, res) => {
    const bookingNumber = req.body.bookingNumber;
    
    try {
        const token = await getConsistentToken();
        
        // 1. Log Payload (Data yang dikirim ke Vendor)
        const payload = {
            bookingNumber: bookingNumber,
            userID: USER_CONFIG.userID,
            accessToken: token ? "TOKEN_EXISTS" : "TOKEN_EMPTY" // Jangan log token asli demi keamanan
        };
        console.log(`%c[VEND-REQ] GetEticket | Booking: ${bookingNumber}`, 'color: #00ff00', payload);

        const response = await axios.post(`${BASE_URL}/ShipDlu/GetEticket`, {
            bookingNumber: bookingNumber,
            userID: USER_CONFIG.userID,
            accessToken: token
        }, {
            httpsAgent: agent,
            responseType: 'arraybuffer' 
        });

        // 2. Log Response (Info meta data dari Vendor)
        console.log(`%c[VEND-RES] GetEticket | Success | Size: ${response.data.byteLength} bytes`, 'color: #00fbff');

        // Validasi jika data kosong
        if (!response.data || response.data.byteLength === 0) {
            console.error(`%c[VEND-ERR] GetEticket | PDF Empty!`, 'color: #ff0000');
            return res.status(404).send("File tiket kosong dari server pusat.");
        }

        res.contentType("application/pdf");
        res.send(response.data);

    } catch (error) {
        // 3. Log Error secara detail
        console.error(`%c[VEND-ERR] GetEticket | Error: ${error.message}`, 'color: #ff0000');
        
        // Jika error dari axios, log detail response-nya (jika bukan binary)
        if (error.response && error.response.data) {
            try {
                const errData = JSON.parse(Buffer.from(error.response.data).toString());
                console.error("Detail Error Vendor:", errData);
            } catch (e) {
                console.error("Gagal parse error vendor (Kemungkinan data tetap binary)");
            }
        }
        
        res.status(500).send("Gagal mengambil tiket");
    }
});

module.exports = router;