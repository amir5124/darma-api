"use strict";

// routes/hotelBookingAdminRoutes.js
var express = require('express');

var router = express.Router();

var hotelBookingAdminController = require('../controllers/hotelBookingAdminController'); // GET /api/hotel-bookings-admin/list?page=1&limit=20&search=&status=&source=&date_from=&date_to=


router.get('/list', hotelBookingAdminController.listBookings); // GET /api/hotel-bookings-admin/:id

router.get('/:id', hotelBookingAdminController.getBookingDetail);
module.exports = router; // ============================================================
// CARA DAFTARKAN DI app.js / server.js:
//
// const hotelBookingAdminRoutes = require('./routes/hotelBookingAdminRoutes');
// app.use('/api/hotel-bookings-admin', hotelBookingAdminRoutes);
//
// Contoh pemanggilan dari client:
//   GET /api/hotel-bookings-admin/list
//   GET /api/hotel-bookings-admin/list?search=balikpapan&status=Accept
//   GET /api/hotel-bookings-admin/list?source=web&page=2&limit=10
//   GET /api/hotel-bookings-admin/list?date_from=2026-07-01&date_to=2026-07-31
//   GET /api/hotel-bookings-admin/42
// ============================================================