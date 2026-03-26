const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');

// Endpoint: /api/payment/...
router.post('/create', PaymentController.createPayment);
router.get('/status/:reff', PaymentController.checkStatus);
router.get('/download-qris', PaymentController.downloadQR);
router.post('/callback', PaymentController.handleCallback);

module.exports = router;