"use strict";

var express = require('express');

var router = express.Router();

var hotelController = require('../controllers/hotelController');

router.post('/search', hotelController.search);
router.post('/available-rooms', hotelController.availableRooms);
router.post('/price-info', hotelController.getPriceInfo);
router.post('/booking', hotelController.booking);
router.post('/booking-detail', hotelController.bookingDetail);
router.post('/payment-callback', hotelController.handlePaymentNotification); // Penting untuk email sukses

router.get('/image', hotelController.getHotelImage);
module.exports = router;