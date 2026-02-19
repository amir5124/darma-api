"use strict";

var express = require('express');

var router = express.Router(); // Pastikan path import ini benar mengarah ke file controller Anda

var ShipPaymentController = require('../controllers/shipPaymentController'); // Endpoint: /api/payment/...


router.post('/create-payment', ShipPaymentController.createShipPayment); // router.get('/status/:reff', ShipPaymentController.checkStatus);
// router.get('/download-qris', ShipPaymentController.downloadShipQR);

router.post('/callback', ShipPaymentController.handleShipCallback);
module.exports = router;