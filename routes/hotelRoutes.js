const express = require('express');
const router = express.Router();
const hotelController = require('../controllers/hotelController');

router.post('/search', hotelController.search);
router.post('/available-rooms', hotelController.availableRooms);
router.post('/price-info', hotelController.getPriceInfo);
router.post('/booking', hotelController.booking);
router.post('/booking-detail', hotelController.bookingDetail);
router.post('/payment-callback', hotelController.handlePaymentNotification); // Penting untuk email sukses
router.get('/image', hotelController.getHotelImage);

module.exports = router;