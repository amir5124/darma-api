"use strict";

// routes/hotelBookingAdminRoutes.js
var express = require('express');

var router = express.Router();

var hotelBookingAdminController = require('../controllers/hotelBookingAdminController'); // ============================================================
// ROUTES UNTUK ADMIN DASHBOARD
// ============================================================
// GET /api/hotel-bookings-admin/list
// Query params: page, limit, search, status, source, date_from, date_to


router.get('/list', hotelBookingAdminController.listBookings); // GET /api/hotel-bookings-admin/:id
// Detail satu booking

router.get('/:id', hotelBookingAdminController.getBookingDetail); // ============================================================
// 🔥 EXPORT TO EXCEL
// ============================================================
// GET /api/hotel-bookings-admin/export-excel
// Query params: search, status, source, date_from, date_to (sama dengan filter)

router.get('/export-excel', hotelBookingAdminController.exportToExcel); // ============================================================
// 🔥 FITUR GENERATE & RESEND E-TIKET
// ============================================================
// POST /api/hotel-bookings-admin/:id/resend-eticket
// Body: { email?: string } — opsional, kirim ke email berbeda

router.post('/:id/resend-eticket', hotelBookingAdminController.resendEticket); // POST /api/hotel-bookings-admin/generate-pdf/:id
// Generate PDF untuk download manual

router.post('/generate-pdf/:id', hotelBookingAdminController.generatePdf); // POST /api/hotel-bookings-admin/bulk-resend
// Kirim massal ke banyak booking (untuk admin)

router.post('/bulk-resend', hotelBookingAdminController.bulkResendEticket);
module.exports = router;