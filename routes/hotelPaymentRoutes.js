const express = require('express');
const router = express.Router();
const hotelPaymentController = require('../controllers/hotelPaymentController');

router.post('/create', hotelPaymentController.createPayment);
router.post('/callback', hotelPaymentController.handleCallback);
router.get('/check-status/:reff', hotelPaymentController.checkStatus);

module.exports = router;