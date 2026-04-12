const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

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

        // 1. Fungsi Helper untuk membersihkan objek pax (Mencegah nilai null)
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

        // 2. Ambil data penumpang pertama sebagai fallback untuk bookerData
        // Cek di listPax reguler atau di dalam listRoom
        const firstPaxReguler = b.listPax?.[0];
        const firstPaxRoom = b.listRoom?.[0]?.paxes?.[0];
        const referencePax = firstPaxReguler || firstPaxRoom || {};

        // 3. Susun Payload Final
        const payload = {
            numCode: String(b.numCode),
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            
            // Bersihkan listPax reguler
            listPax: (b.listPax || []).map(p => cleanPax(p)),
            
            // Bersihkan listRoom dan paxes di dalamnya
            listRoom: (b.listRoom || []).map(r => ({
                info: r.info || "",
                roomClass: r.roomClass || "",
                price: parseFloat(r.price || 0),
                admin: parseFloat(r.admin || 0),
                paxes: (r.paxes || []).map(p => cleanPax(p))
            })),
            
            listVehicle: b.listVehicle || [],

            // MEMPERBAIKI bookerData (Wajib 6 field: gender, name, id, email, phone, city)
            bookerData: {
                gender: String(b.bookerData?.gender || referencePax.gender || "0"),
                name: b.bookerData?.name || referencePax.name || "",
                id: b.bookerData?.id || referencePax.id || "", // ID/NIK wajib ada
                email: b.bookerData?.email || "",
                phone: b.bookerData?.phone || "",
                city: b.bookerData?.city || referencePax.city || "" // Kota wajib ada
            },

            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // 4. Logging untuk Audit
        logger.info(`REQ_SHPDLU_ISSUED: Menjalankan Issued untuk ID: ${payload.numCode}`);
        logger.debug("PAYLOAD_DETAILS:", JSON.stringify(payload, null, 2));

        // 5. Hit API Vendor
        const response = await axios.post(`${BASE_URL}/ShipDlu/Issued`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.info(`RES_SHPDLU_ISSUED: Status ${response.data.status} untuk ID: ${payload.numCode}`);
        res.json(response.data);

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error(`Ship DLU Issued Error: ${errorMsg}`);
        
        res.status(error.response?.status || 500).json({ 
            status: "ERROR", 
            respMessage: error.response?.data?.respMessage || error.message 
        });
    }
});

router.post('/get-eticket', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const response = await axios.post(`${BASE_URL}/ShipDlu/GetEticket`, {
            bookingNumber: req.body.bookingNumber,
            userID: USER_CONFIG.userID,
            accessToken: token
        }, {
            httpsAgent: agent,
            responseType: 'arraybuffer' // PENTING: Agar data PDF tidak rusak/terpotong
        });

        // Kirim header agar frontend tahu ini adalah PDF
        res.contentType("application/pdf");
        res.send(response.data);

    } catch (error) {
        res.status(500).send("Gagal mengambil tiket");
    }
});

module.exports = router;