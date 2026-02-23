"use strict";

var express = require('express');

var router = express.Router();

var hotelPaymentController = require('../controllers/hotelPaymentController');

router.post('/create', hotelPaymentController.createPayment);
router.post('/callback', hotelPaymentController.handleCallback);
router.get('/check-status/:reff', hotelPaymentController.checkStatus);
module.exports = router;