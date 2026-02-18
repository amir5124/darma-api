"use strict";

var express = require('express');

var router = express.Router();

var shipPaymentController = require('../controllers/shipPaymentController'); // Endpoint: /api/payment/...


router.post('/create-payment', shipPaymentController.createShipPayment);
router.post('/callback', shipPaymentController.handleShipCallback);
module.exports = router;