"use strict";

var express = require('express');

var router = express.Router();

var shipPaymentController = require('../controllers/shipPaymentController'); // Endpoint: /api/payment/...


router.post('/create-payment', shipPaymentController.createShipPayment);
router.get('/status/:reff', shipPaymentController.checkShipStatus);
router.get('/download-qris', shipPaymentController.downloadShipQR);
router.post('/callback', shipPaymentController.handleShipCallback);
module.exports = router;