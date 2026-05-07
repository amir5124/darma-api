"use strict";

var express = require('express');

var router = express.Router();

var DluPaymentController = require('../controllers/DluPaymentController'); // Buat instruksi pembayaran (VA / QRIS)


router.post('/create', DluPaymentController.createPayment); // Webhook callback dari LinkQu

router.post('/callback', DluPaymentController.handleCallback); // Polling status dari frontend

router.get('/check-status/:reff', DluPaymentController.checkStatus); // Finalisasi setelah issued vendor sukses

router.post('/finalize', DluPaymentController.finalizeBooking);
module.exports = router;