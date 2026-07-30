"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// routes/hotelBookingV2Routes.js
var express = require('express');

var router = express.Router();

var db = require('../config/db');

var _require = require('../utils/hotelBookingProcessor'),
    processHotelBookingToVendor = _require.processHotelBookingToVendor;

var _require2 = require('../utils/paymentHelper'),
    generatePayment = _require2.generatePayment,
    checkPaymentStatus = _require2.checkPaymentStatus,
    handlePaymentWebhook = _require2.handlePaymentWebhook,
    getPaymentStatusFromDB = _require2.getPaymentStatusFromDB;

var logger = require('../helpers/darmaSandbox').logger; // ================================================================
// ENDPOINT 1: CREATE DRAFT BOOKING
// ================================================================


router.post('/draft', function _callee(req, res) {
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
        case "end":
          return _context.stop();
      }
    }
  });
}); // ================================================================
// ENDPOINT 2: CREATE PAYMENT (menggunakan paymentHelper)
// ================================================================

router.post('/:bookingId/create-payment', function _callee2(req, res) {
  var bookingId, _req$body, method, bank_code, admin_fee_applied, connection, _ref, _ref2, rows, booking, totalAmount, paymentResult;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          bookingId = req.params.bookingId;
          _req$body = req.body, method = _req$body.method, bank_code = _req$body.bank_code, admin_fee_applied = _req$body.admin_fee_applied; // 1. Ambil data booking

          _context2.next = 5;
          return regeneratorRuntime.awrap(db.getConnection());

        case 5:
          connection = _context2.sent;
          _context2.next = 8;
          return regeneratorRuntime.awrap(connection.execute("SELECT id, total_price, handling_fee, contact_email, contact_phone, \n                    username, hotel_name, reservation_no\n             FROM hotel_bookings WHERE id = ?", [bookingId]));

        case 8:
          _ref = _context2.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];
          connection.release();

          if (!(rows.length === 0)) {
            _context2.next = 14;
            break;
          }

          return _context2.abrupt("return", res.status(404).json({
            status: "ERROR",
            message: "Booking tidak ditemukan"
          }));

        case 14:
          booking = rows[0]; // 2. Validasi status booking

          if (!(booking.booking_status !== 'DRAFT')) {
            _context2.next = 17;
            break;
          }

          return _context2.abrupt("return", res.status(400).json({
            status: "ERROR",
            message: "Booking status harus DRAFT, saat ini: ".concat(booking.booking_status)
          }));

        case 17:
          // 3. Hitung total
          totalAmount = Math.round(booking.total_price + booking.handling_fee); // 4. Generate payment via LinkQu

          _context2.next = 20;
          return regeneratorRuntime.awrap(generatePayment({
            booking_id: bookingId,
            amount: totalAmount,
            customer_name: booking.username || 'Guest',
            customer_phone: booking.contact_phone,
            customer_email: booking.contact_email,
            method: method || 'QRIS',
            bank_code: bank_code || null,
            admin_fee_applied: admin_fee_applied || 0
          }));

        case 20:
          paymentResult = _context2.sent;
          // 5. Return response
          res.json(_objectSpread({
            status: "SUCCESS",
            booking_id: bookingId
          }, paymentResult));
          _context2.next = 28;
          break;

        case 24:
          _context2.prev = 24;
          _context2.t0 = _context2["catch"](0);
          logger.error('[CREATE PAYMENT V2] Error:', _context2.t0.message);
          res.status(500).json({
            status: "ERROR",
            message: _context2.t0.message
          });

        case 28:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 24]]);
}); // ================================================================
// ENDPOINT 3: CHECK PAYMENT STATUS (polling)
// ================================================================

router.get('/payment-status/:reff', function _callee3(req, res) {
  var reff, result;
  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.prev = 0;
          reff = req.params.reff;
          _context3.next = 4;
          return regeneratorRuntime.awrap(checkPaymentStatus(reff));

        case 4:
          result = _context3.sent;
          res.json(_objectSpread({
            status: "SUCCESS"
          }, result));
          _context3.next = 12;
          break;

        case 8:
          _context3.prev = 8;
          _context3.t0 = _context3["catch"](0);
          logger.error('[CHECK PAYMENT STATUS] Error:', _context3.t0.message);
          res.status(500).json({
            status: "ERROR",
            message: _context3.t0.message
          });

        case 12:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[0, 8]]);
}); // ================================================================
// ENDPOINT 4: WEBHOOK (LinkQu Callback)
// ================================================================

router.post('/payment-webhook', function _callee4(req, res) {
  var result;
  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.prev = 0;
          logger.info("\uD83D\uDCE5 [WEBHOOK V2] Received:", JSON.stringify(req.body, null, 2));
          _context4.next = 4;
          return regeneratorRuntime.awrap(handlePaymentWebhook(req.body));

        case 4:
          result = _context4.sent;

          if (result.success) {
            res.json({
              status: "SUCCESS",
              message: "Webhook processed"
            });
          } else {
            res.status(400).json({
              status: "ERROR",
              message: result.message
            });
          }

          _context4.next = 12;
          break;

        case 8:
          _context4.prev = 8;
          _context4.t0 = _context4["catch"](0);
          logger.error('[WEBHOOK V2] Error:', _context4.t0.message);
          res.status(500).json({
            status: "ERROR",
            message: _context4.t0.message
          });

        case 12:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[0, 8]]);
}); // ================================================================
// ENDPOINT 5: CONFIRM BOOKING (manual trigger)
// ================================================================

router.post('/:bookingId/confirm', function _callee5(req, res) {
  var connection, bookingId, _req$body2, payment_reference, _req$body2$payment_st, payment_status, _ref3, _ref4, rows, booking, result;

  return regeneratorRuntime.async(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          bookingId = req.params.bookingId;
          _req$body2 = req.body, payment_reference = _req$body2.payment_reference, _req$body2$payment_st = _req$body2.payment_status, payment_status = _req$body2$payment_st === void 0 ? 'SETTLED' : _req$body2$payment_st;
          _context5.next = 5;
          return regeneratorRuntime.awrap(db.getConnection());

        case 5:
          connection = _context5.sent;
          _context5.next = 8;
          return regeneratorRuntime.awrap(connection.execute("SELECT id, booking_status, payment_status FROM hotel_bookings WHERE id = ?", [bookingId]));

        case 8:
          _ref3 = _context5.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          rows = _ref4[0];

          if (!(rows.length === 0)) {
            _context5.next = 13;
            break;
          }

          return _context5.abrupt("return", res.status(404).json({
            status: "ERROR",
            message: "Booking tidak ditemukan"
          }));

        case 13:
          booking = rows[0]; // 2. Validasi: harus DRAFT atau PAID

          if (['DRAFT', 'PAID'].includes(booking.booking_status)) {
            _context5.next = 16;
            break;
          }

          return _context5.abrupt("return", res.status(400).json({
            status: "ERROR",
            message: "Cannot confirm booking with status: ".concat(booking.booking_status)
          }));

        case 16:
          if (!payment_reference) {
            _context5.next = 19;
            break;
          }

          _context5.next = 19;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET \n                    payment_reference = ?,\n                    payment_status = ?,\n                    booking_status = 'PAID',\n                    updated_at = NOW()\n                 WHERE id = ?", [payment_reference, payment_status, bookingId]));

        case 19:
          // 4. 🔥 PROSES KE VENDOR menggunakan hotelBookingProcessor
          logger.info("[CONFIRM V2] \uD83D\uDD25 Processing booking ".concat(bookingId, " to vendor..."));
          _context5.next = 22;
          return regeneratorRuntime.awrap(processHotelBookingToVendor(bookingId));

        case 22:
          result = _context5.sent;
          connection.release();
          return _context5.abrupt("return", res.json({
            status: "SUCCESS",
            booking_id: bookingId,
            processed: result,
            message: "Booking confirmed and sent to vendor"
          }));

        case 27:
          _context5.prev = 27;
          _context5.t0 = _context5["catch"](0);
          if (connection) connection.release();
          logger.error("[CONFIRM V2 ERROR]: ".concat(_context5.t0.message));
          return _context5.abrupt("return", res.status(500).json({
            status: "ERROR",
            message: _context5.t0.message
          }));

        case 32:
        case "end":
          return _context5.stop();
      }
    }
  }, null, null, [[0, 27]]);
}); // ================================================================
// ENDPOINT 6: GET BOOKING STATUS (untuk polling)
// ================================================================

router.get('/:bookingId/status', function _callee6(req, res) {
  var connection, bookingId, _ref5, _ref6, rows, booking, _ref7, _ref8, paxes, _ref9, _ref10, payments;

  return regeneratorRuntime.async(function _callee6$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.prev = 0;
          bookingId = req.params.bookingId;
          _context6.next = 4;
          return regeneratorRuntime.awrap(db.getConnection());

        case 4:
          connection = _context6.sent;
          _context6.next = 7;
          return regeneratorRuntime.awrap(connection.execute("SELECT \n                id, reservation_no, voucher_no, booking_status,\n                payment_status, payment_reference, payment_method,\n                hotel_name, hotel_address, room_name, breakfast_type,\n                check_in_date, check_out_date, total_price, handling_fee,\n                contact_email, contact_phone, issued_at, source,\n                created_at, updated_at\n             FROM hotel_bookings \n             WHERE id = ?", [bookingId]));

        case 7:
          _ref5 = _context6.sent;
          _ref6 = _slicedToArray(_ref5, 1);
          rows = _ref6[0];

          if (!(rows.length === 0)) {
            _context6.next = 12;
            break;
          }

          return _context6.abrupt("return", res.status(404).json({
            status: "ERROR",
            message: "Booking tidak ditemukan"
          }));

        case 12:
          booking = rows[0]; // Ambil paxes

          _context6.next = 15;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name, last_name, pax_type\n             FROM hotel_booking_paxes\n             WHERE booking_id = ?", [bookingId]));

        case 15:
          _ref7 = _context6.sent;
          _ref8 = _slicedToArray(_ref7, 1);
          paxes = _ref8[0];
          _context6.next = 20;
          return regeneratorRuntime.awrap(connection.execute("SELECT payment_reff, payment_status, va_number, qris_url, amount, admin_fee\n             FROM hotel_payments\n             WHERE booking_id = ?\n             ORDER BY created_at DESC LIMIT 1", [bookingId]));

        case 20:
          _ref9 = _context6.sent;
          _ref10 = _slicedToArray(_ref9, 1);
          payments = _ref10[0];
          booking.paxes = paxes;
          booking.payment_info = payments.length > 0 ? payments[0] : null;
          booking.can_confirm = ['DRAFT', 'PAID'].includes(booking.booking_status);
          connection.release();
          return _context6.abrupt("return", res.json({
            status: "SUCCESS",
            data: booking
          }));

        case 30:
          _context6.prev = 30;
          _context6.t0 = _context6["catch"](0);
          if (connection) connection.release();
          logger.error("[STATUS V2 ERROR]: ".concat(_context6.t0.message));
          return _context6.abrupt("return", res.status(500).json({
            status: "ERROR",
            message: _context6.t0.message
          }));

        case 35:
        case "end":
          return _context6.stop();
      }
    }
  }, null, null, [[0, 30]]);
});
module.exports = router;