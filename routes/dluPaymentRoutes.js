const express = require('express');
const router = express.Router();
const dluPaymentController = require('../controllers/DluPaymentController');

/**
 * @route   POST /api/dlu-payments/create
 * @desc    Membuat instruksi pembayaran (VA/QRIS) untuk tiket kapal DLU
 */
router.post('/create', dluPaymentController.createPayment);

/**
 * @route   POST /api/dlu-payments/callback
 * @desc    Endpoint webhook untuk menerima notifikasi pembayaran sukses dari LinkQu
 */
router.post('/callback', dluPaymentController.handleCallback);

/**
 * @route   GET /api/dlu-payments/check-status/:reff
 * @desc    Endpoint polling untuk frontend mengecek status pembayaran berdasarkan payment_ref
 */
router.get('/check-status/:reff', dluPaymentController.checkStatus);

module.exports = router;