const express = require('express');
const router = express.Router();
const flightController = require('../controllers/flightController');

// Endpoint: /api/booking-history/user/:username
router.get('/user/:username', flightController.getBookingPengguna);

// Endpoint untuk simpan (jika ingin dipisah ke sini)
router.post('/save', flightController.saveBooking);

module.exports = router;