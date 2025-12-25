// routes/hotelRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

// 1. HOTEL SEARCH
router.post('/search', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        
        // Payload disesuaikan persis dengan contoh request Anda
        const payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,   // Contoh: "2023-01-01T14:00:00Z"
            checkOutDate: b.checkOutDate, // Contoh: "2023-01-02T12:00:00Z"
            roomRequest: b.roomRequest.map(room => ({
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Sesuai permintaan: [0]
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_SEARCH5", payload);
        
        // Endpoint diganti menjadi Search5 sesuai instruksi
        const response = await axios.post(`${BASE_URL}/Hotel/Search5`, payload, { 
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });
        
        logger.debug("RES_HOTEL_SEARCH5", response.data);
        res.json(response.data);
    } catch (error) {
        logger.error("Hotel Search5 Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// 2. HOTEL AVAILABLE ROOMS
router.post('/available-rooms', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        
        const payload = {
            hotelID: b.hotelID,
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            // Pastikan roomRequest dipetakan dengan benar sesuai standar strict
            roomRequest: b.roomRequest.map(room => ({
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Mengikuti standar [0] jika childNum 0
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_ROOMS_5", payload);
        
        // Perhatikan URL: Gunakan /Hotel/AvailableRoom5 jika mengikuti standar Search5
        const response = await axios.post(`${BASE_URL}/Hotel/AvailableRooms5`, payload, { 
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });
        
        logger.debug("RES_HOTEL_ROOMS_5", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Hotel Available Rooms Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// 3. HOTEL PRICE AND POLICY INFO
router.post('/price-info', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: b.cityID,
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            roomRequest: b.roomRequest,
            internalCode: b.internalCode,
            hotelID: b.hotelID,
            breakfast: b.breakfast,
            roomID: b.roomID,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_PRICE_INFO", payload);
        const response = await axios.post(`${BASE_URL}/Hotel/PriceInfo`, payload, { httpsAgent: agent });
        logger.debug("RES_HOTEL_PRICE_INFO", response.data);

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// Endpoint Gambar Hotel (Utama)
router.get('/image', async (req, res) => {
    try {
        const id = req.query.id; // required
        const response = await axios.get(`${BASE_URL}/Hotel/Image?id=${id}`, {
            httpsAgent: agent,
            responseType: 'arraybuffer' // Karena API mengembalikan stream gambar
        });
        res.set('Content-Type', 'image/jpeg');
        res.send(response.data);
    } catch (error) {
        res.status(404).send('Image not found');
    }
});

// Endpoint Gambar Kamar
router.get('/room-image', async (req, res) => {
    try {
        const RoomID = req.query.RoomID; // required
        const response = await axios.get(`${BASE_URL}/Hotel/RoomImage?RoomID=${RoomID}`, {
            httpsAgent: agent,
            responseType: 'arraybuffer'
        });
        res.set('Content-Type', 'image/jpeg');
        res.send(response.data);
    } catch (error) {
        res.status(404).send('Room image not found');
    }
});

// 4. HOTEL BOOKING ALL SUPPLIER
router.post('/create-booking', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            ...b,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_BOOKING", payload);
        const response = await axios.post(`${BASE_URL}/Hotel/Booking`, payload, { httpsAgent: agent });
        logger.debug("RES_HOTEL_BOOKING", response.data);

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// 5. HOTEL BOOKING DETAIL
router.post('/booking-detail', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            reservationNo: b.reservationNo,
            osRefNo: b.osRefNo,
            agentOsRef: b.agentOsRef,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_DETAIL", payload);
        const response = await axios.post(`${BASE_URL}/Hotel/BookingDetail`, payload, { httpsAgent: agent });
        logger.debug("RES_HOTEL_DETAIL", response.data);

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

module.exports = router;