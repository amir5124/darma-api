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
            fares: b.fares,       // Array of {count, data}
            listPax: b.listPax,   // Data penumpang reguler
            listVehicle: b.listVehicle || [],
            listRoom: b.listRoom || [], // Data penumpang kategori kamar
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHPDLU_PRICE: Validating price for ship ${payload.shipNumber}`);

        const response = await axios.post(`${BASE_URL}/ShipDlu/Price`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Price Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
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

        // Validasi minimal numCode (didapat dari response Booking)
        if (!b.numCode) {
            return res.status(400).json({ status: "FAILED", respMessage: "numCode wajib diisi" });
        }

        const payload = {
            numCode: String(b.numCode) || "CF0X64HBR8",
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            listPax: b.listPax || [],
            listVehicle: b.listVehicle || [],
            listRoom: b.listRoom || [],
            bookerData: b.bookerData,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHPDLU_ISSUED: Issuing ticket for code ${payload.numCode}`);

        const response = await axios.post(`${BASE_URL}/ShipDlu/Issued`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_ISSUED", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Issued Error: " + error.message);
        res.status(500).json({ 
            status: "ERROR", 
            respMessage: error.response ? error.response.data : error.message 
        });
    }
});

module.exports = router;