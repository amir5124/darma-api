const express = require('express');
const router = express.Router();
const shipPaymentController = require('../controllers/shipPaymentController');

// Endpoint: /api/payment/...
router.post('/create-payment', shipPaymentController.createShipPayment);
router.post('/callback', shipPaymentController.handleShipCallback);
module.exports = router;