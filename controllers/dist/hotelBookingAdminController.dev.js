"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// controllers/hotelBookingAdminController.js
var db = require('../config/db');

var _require = require('../utils/hotelMailer'),
    sendBookingEmails = _require.sendBookingEmails,
    generateBookingPDF = _require.generateBookingPDF; // ============================================================
// SOURCE DETECTION (Heuristik)
// ============================================================


var SOURCE_CASE_SQL = "CASE WHEN hb.username IS NULL THEN 'web' ELSE 'app' END";
var HotelBookingAdminController = {
  // ============================================================
  // GET /list - LIST BOOKINGS WITH PAGINATION & FILTERS
  // ============================================================
  listBookings: function listBookings(req, res) {
    var _req$query, _req$query$page, page, _req$query$limit, limit, _req$query$search, search, _req$query$status, status, _req$query$source, source, _req$query$date_from, date_from, _req$query$date_to, date_to, pageNum, limitNum, offset, whereClauses, params, likeTerm, whereSql, _ref, _ref2, _ref2$, total, _ref3, _ref4, rows;

    return regeneratorRuntime.async(function listBookings$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _req$query = req.query, _req$query$page = _req$query.page, page = _req$query$page === void 0 ? 1 : _req$query$page, _req$query$limit = _req$query.limit, limit = _req$query$limit === void 0 ? 20 : _req$query$limit, _req$query$search = _req$query.search, search = _req$query$search === void 0 ? '' : _req$query$search, _req$query$status = _req$query.status, status = _req$query$status === void 0 ? '' : _req$query$status, _req$query$source = _req$query.source, source = _req$query$source === void 0 ? '' : _req$query$source, _req$query$date_from = _req$query.date_from, date_from = _req$query$date_from === void 0 ? '' : _req$query$date_from, _req$query$date_to = _req$query.date_to, date_to = _req$query$date_to === void 0 ? '' : _req$query$date_to;
            pageNum = Math.max(1, parseInt(page) || 1);
            limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
            offset = (pageNum - 1) * limitNum;
            whereClauses = ['1=1'];
            params = []; // Filter search

            if (search && search.trim() !== '') {
              whereClauses.push("(\n                    hb.reservation_no LIKE ? OR\n                    hb.hotel_name LIKE ? OR\n                    hb.contact_email LIKE ? OR\n                    hb.contact_phone LIKE ? OR\n                    hb.os_ref_no LIKE ?\n                )");
              likeTerm = "%".concat(search.trim(), "%");
              params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
            } // Filter status


            if (status && status.trim() !== '') {
              whereClauses.push("hb.booking_status = ?");
              params.push(status.trim());
            } // Filter source


            if (source === 'app') {
              whereClauses.push("hb.username IS NOT NULL");
            } else if (source === 'web') {
              whereClauses.push("hb.username IS NULL");
            } // Filter tanggal


            if (date_from) {
              whereClauses.push("hb.check_in_date >= ?");
              params.push(date_from);
            }

            if (date_to) {
              whereClauses.push("hb.check_in_date <= ?");
              params.push(date_to + ' 23:59:59');
            }

            whereSql = whereClauses.join(' AND '); // Hitung total

            _context.next = 15;
            return regeneratorRuntime.awrap(db.query("SELECT COUNT(*) as total FROM hotel_bookings hb WHERE ".concat(whereSql), params));

          case 15:
            _ref = _context.sent;
            _ref2 = _slicedToArray(_ref, 1);
            _ref2$ = _slicedToArray(_ref2[0], 1);
            total = _ref2$[0].total;
            _context.next = 21;
            return regeneratorRuntime.awrap(db.query("SELECT\n                    hb.id,\n                    hb.reservation_no,\n                    hb.voucher_no,\n                    hb.os_ref_no,\n                    hb.agent_os_ref,\n                    hb.hotel_id,\n                    hb.hotel_name,\n                    hb.hotel_address,\n                    hb.internal_code,\n                    hb.check_in_date,\n                    hb.check_out_date,\n                    hb.city_id,\n                    hb.city_name,\n                    hb.room_name,\n                    hb.breakfast_type,\n                    hb.room_count,\n                    hb.contact_email,\n                    hb.contact_phone,\n                    hb.total_price,\n                    hb.commission,\n                    hb.handling_fee,\n                    hb.currency,\n                    hb.booking_status,\n                    hb.username,\n                    hb.booking_date,\n                    hb.created_at,\n                    hb.updated_at,\n                    hb.source,\n                    ".concat(SOURCE_CASE_SQL, " AS source_detected,\n                    hp.payment_status,\n                    hp.payment_method,\n                    hp.payment_reff,\n                    hp.payment_date,\n                    hp.expired_date,\n                    hp.admin_fee AS payment_admin_fee,\n                    (SELECT COUNT(*) FROM hotel_booking_paxes hbp WHERE hbp.booking_id = hb.id) AS guest_count\n                 FROM hotel_bookings hb\n                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n                 WHERE ").concat(whereSql, "\n                 ORDER BY hb.created_at DESC\n                 LIMIT ? OFFSET ?"), [].concat(params, [limitNum, offset])));

          case 21:
            _ref3 = _context.sent;
            _ref4 = _slicedToArray(_ref3, 1);
            rows = _ref4[0];
            return _context.abrupt("return", res.json({
              status: "SUCCESS",
              pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
              },
              data: rows
            }));

          case 27:
            _context.prev = 27;
            _context.t0 = _context["catch"](0);
            console.error("❌ [LIST BOOKINGS ERROR]:", _context.t0.message);
            return _context.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context.t0.message
            }));

          case 31:
          case "end":
            return _context.stop();
        }
      }
    }, null, null, [[0, 27]]);
  },
  // ============================================================
  // GET /:id - DETAIL BOOKING
  // ============================================================
  getBookingDetail: function getBookingDetail(req, res) {
    var id, _ref5, _ref6, rows, booking, _ref7, _ref8, paxes, _ref9, _ref10, facilities;

    return regeneratorRuntime.async(function getBookingDetail$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            _context2.prev = 0;
            id = req.params.id;
            _context2.next = 4;
            return regeneratorRuntime.awrap(db.query("SELECT\n                hb.*,\n                hp.payment_status,\n                hp.payment_method,\n                hp.payment_reff,\n                hp.booking_code,\n                hp.reference_no,\n                hp.va_number,\n                hp.qris_url,\n                hp.amount AS payment_amount,\n                hp.admin_fee AS payment_admin_fee,\n                hp.ticket_status,\n                hp.payment_date,\n                hp.expired_date\n             FROM hotel_bookings hb\n             LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n             WHERE hb.id = ?", [id]));

          case 4:
            _ref5 = _context2.sent;
            _ref6 = _slicedToArray(_ref5, 1);
            rows = _ref6[0];

            if (!(rows.length === 0)) {
              _context2.next = 9;
              break;
            }

            return _context2.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Booking tidak ditemukan."
            }));

          case 9:
            booking = rows[0];
            _context2.next = 12;
            return regeneratorRuntime.awrap(db.query("SELECT id, pax_type, title, first_name, last_name, age\n                 FROM hotel_booking_paxes\n                 WHERE booking_id = ?\n                 ORDER BY id ASC", [id]));

          case 12:
            _ref7 = _context2.sent;
            _ref8 = _slicedToArray(_ref7, 1);
            paxes = _ref8[0];
            _context2.next = 17;
            return regeneratorRuntime.awrap(db.query("SELECT id, facility_name\n                 FROM hotel_booking_facilities\n                 WHERE booking_id = ?", [id]));

          case 17:
            _ref9 = _context2.sent;
            _ref10 = _slicedToArray(_ref9, 1);
            facilities = _ref10[0];
            return _context2.abrupt("return", res.json({
              status: "SUCCESS",
              data: _objectSpread({}, booking, {
                paxes: paxes,
                facilities: facilities
              })
            }));

          case 23:
            _context2.prev = 23;
            _context2.t0 = _context2["catch"](0);
            console.error("❌ [GET BOOKING DETAIL ERROR]:", _context2.t0.message);
            return _context2.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context2.t0.message
            }));

          case 27:
          case "end":
            return _context2.stop();
        }
      }
    }, null, null, [[0, 23]]);
  },
  // ============================================================
  // 🔥 POST /:id/resend-eticket - KIRIM ULANG E-TIKET
  // ============================================================
  resendEticket: function resendEticket(req, res) {
    var id, email, _ref11, _ref12, rows, booking, allowedStatus, _ref13, _ref14, paxes, targetEmail;

    return regeneratorRuntime.async(function resendEticket$(_context3) {
      while (1) {
        switch (_context3.prev = _context3.next) {
          case 0:
            _context3.prev = 0;
            id = req.params.id;
            email = req.body.email; // Validasi ID

            if (!(!id || isNaN(id))) {
              _context3.next = 5;
              break;
            }

            return _context3.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Booking ID tidak valid"
            }));

          case 5:
            _context3.next = 7;
            return regeneratorRuntime.awrap(db.query("SELECT id, booking_status, contact_email, os_ref_no, reservation_no, hotel_name, hotel_address, room_name, total_price, handling_fee, check_in_date, check_out_date, breakfast_type, special_requests\n                 FROM hotel_bookings WHERE id = ?", [id]));

          case 7:
            _ref11 = _context3.sent;
            _ref12 = _slicedToArray(_ref11, 1);
            rows = _ref12[0];

            if (!(rows.length === 0)) {
              _context3.next = 12;
              break;
            }

            return _context3.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Booking tidak ditemukan"
            }));

          case 12:
            booking = rows[0]; // 2. Validasi status (hanya Accept/Processed yang bisa kirim e-tiket)

            allowedStatus = ['Accept', 'Processed'];

            if (allowedStatus.includes(booking.booking_status)) {
              _context3.next = 16;
              break;
            }

            return _context3.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Booking status \"".concat(booking.booking_status, "\" tidak bisa mengirim e-tiket. Status harus Accept atau Processed.")
            }));

          case 16:
            _context3.next = 18;
            return regeneratorRuntime.awrap(db.query("SELECT title, first_name as firstName, last_name as lastName \n                 FROM hotel_booking_paxes \n                 WHERE booking_id = ?", [id]));

          case 18:
            _ref13 = _context3.sent;
            _ref14 = _slicedToArray(_ref13, 1);
            paxes = _ref14[0];
            // 4. Kirim email ke email yang ditentukan atau email default
            targetEmail = email || booking.contact_email;

            if (targetEmail) {
              _context3.next = 24;
              break;
            }

            return _context3.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Email tujuan tidak ditemukan. Silakan kirim dengan parameter email."
            }));

          case 24:
            _context3.next = 26;
            return regeneratorRuntime.awrap(sendBookingEmails(parseInt(id)));

          case 26:
            return _context3.abrupt("return", res.json({
              status: "SUCCESS",
              message: "E-Tiket berhasil dikirim ke ".concat(targetEmail),
              booking_id: parseInt(id),
              reservation_no: booking.reservation_no,
              os_ref_no: booking.os_ref_no,
              sent_to: targetEmail,
              booking_status: booking.booking_status
            }));

          case 29:
            _context3.prev = 29;
            _context3.t0 = _context3["catch"](0);
            console.error("❌ [RESEND E-TIKET ERROR]:", _context3.t0.message);
            return _context3.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context3.t0.message
            }));

          case 33:
          case "end":
            return _context3.stop();
        }
      }
    }, null, null, [[0, 29]]);
  },
  // ============================================================
  // 🔥 POST /generate-pdf/:id - DOWNLOAD PDF MANUAL
  // ============================================================
  generatePdf: function generatePdf(req, res) {
    var id, _ref15, _ref16, rows, booking, _ref17, _ref18, paxes, pdfData, pdfBuffer;

    return regeneratorRuntime.async(function generatePdf$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            _context4.prev = 0;
            id = req.params.id;

            if (!(!id || isNaN(id))) {
              _context4.next = 4;
              break;
            }

            return _context4.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Booking ID tidak valid"
            }));

          case 4:
            _context4.next = 6;
            return regeneratorRuntime.awrap(db.query("SELECT * FROM hotel_bookings WHERE id = ?", [id]));

          case 6:
            _ref15 = _context4.sent;
            _ref16 = _slicedToArray(_ref15, 1);
            rows = _ref16[0];

            if (!(rows.length === 0)) {
              _context4.next = 11;
              break;
            }

            return _context4.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Booking tidak ditemukan"
            }));

          case 11:
            booking = rows[0]; // 2. Ambil data paxes

            _context4.next = 14;
            return regeneratorRuntime.awrap(db.query("SELECT title, first_name as firstName, last_name as lastName \n                 FROM hotel_booking_paxes \n                 WHERE booking_id = ?", [id]));

          case 14:
            _ref17 = _context4.sent;
            _ref18 = _slicedToArray(_ref17, 1);
            paxes = _ref18[0];
            // 3. Siapkan data untuk PDF
            pdfData = {
              reservationNo: booking.reservation_no,
              voucherNo: booking.voucher_no || booking.reservation_no,
              osRefNo: booking.os_ref_no || "-",
              hotelName: booking.hotel_name,
              hotelAddress: booking.hotel_address || "-",
              roomName: booking.room_name || "-",
              totalPrice: booking.total_price || 0,
              handlingFee: booking.handling_fee || 0,
              checkInDate: booking.check_in_date,
              checkOutDate: booking.check_out_date,
              breakfastType: booking.breakfast_type || "Room Only",
              specialRequests: booking.special_requests || "-"
            }; // 4. Generate PDF

            _context4.next = 20;
            return regeneratorRuntime.awrap(generateBookingPDF(pdfData, paxes));

          case 20:
            pdfBuffer = _context4.sent;
            // 5. Set response untuk download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', "attachment; filename=\"E-Voucher-".concat(booking.reservation_no, ".pdf\""));
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
            _context4.next = 31;
            break;

          case 27:
            _context4.prev = 27;
            _context4.t0 = _context4["catch"](0);
            console.error("❌ [GENERATE PDF ERROR]:", _context4.t0.message);
            return _context4.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context4.t0.message
            }));

          case 31:
          case "end":
            return _context4.stop();
        }
      }
    }, null, null, [[0, 27]]);
  },
  // ============================================================
  // 🔥 POST /bulk-resend - KIRIM MASSAL E-TIKET
  // ============================================================
  bulkResendEticket: function bulkResendEticket(req, res) {
    var _req$body, bookingIds, email, results, successCount, failCount, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, id, _ref19, _ref20, rows, booking;

    return regeneratorRuntime.async(function bulkResendEticket$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            _context5.prev = 0;
            _req$body = req.body, bookingIds = _req$body.bookingIds, email = _req$body.email;

            if (!(!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0)) {
              _context5.next = 4;
              break;
            }

            return _context5.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "bookingIds harus berupa array ID booking"
            }));

          case 4:
            if (!(bookingIds.length > 50)) {
              _context5.next = 6;
              break;
            }

            return _context5.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Maksimal 50 booking per request"
            }));

          case 6:
            results = [];
            successCount = 0;
            failCount = 0;
            _iteratorNormalCompletion = true;
            _didIteratorError = false;
            _iteratorError = undefined;
            _context5.prev = 12;
            _iterator = bookingIds[Symbol.iterator]();

          case 14:
            if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
              _context5.next = 44;
              break;
            }

            id = _step.value;
            _context5.prev = 16;
            _context5.next = 19;
            return regeneratorRuntime.awrap(db.query("SELECT id, booking_status, contact_email \n                         FROM hotel_bookings WHERE id = ?", [id]));

          case 19:
            _ref19 = _context5.sent;
            _ref20 = _slicedToArray(_ref19, 1);
            rows = _ref20[0];

            if (!(rows.length === 0)) {
              _context5.next = 26;
              break;
            }

            results.push({
              id: id,
              status: 'FAILED',
              reason: 'Booking tidak ditemukan'
            });
            failCount++;
            return _context5.abrupt("continue", 41);

          case 26:
            booking = rows[0];

            if (['Accept', 'Processed'].includes(booking.booking_status)) {
              _context5.next = 31;
              break;
            }

            results.push({
              id: id,
              status: 'SKIPPED',
              reason: "Status: ".concat(booking.booking_status)
            });
            failCount++;
            return _context5.abrupt("continue", 41);

          case 31:
            _context5.next = 33;
            return regeneratorRuntime.awrap(sendBookingEmails(parseInt(id)));

          case 33:
            results.push({
              id: id,
              status: 'SUCCESS'
            });
            successCount++;
            _context5.next = 41;
            break;

          case 37:
            _context5.prev = 37;
            _context5.t0 = _context5["catch"](16);
            results.push({
              id: id,
              status: 'FAILED',
              reason: _context5.t0.message
            });
            failCount++;

          case 41:
            _iteratorNormalCompletion = true;
            _context5.next = 14;
            break;

          case 44:
            _context5.next = 50;
            break;

          case 46:
            _context5.prev = 46;
            _context5.t1 = _context5["catch"](12);
            _didIteratorError = true;
            _iteratorError = _context5.t1;

          case 50:
            _context5.prev = 50;
            _context5.prev = 51;

            if (!_iteratorNormalCompletion && _iterator["return"] != null) {
              _iterator["return"]();
            }

          case 53:
            _context5.prev = 53;

            if (!_didIteratorError) {
              _context5.next = 56;
              break;
            }

            throw _iteratorError;

          case 56:
            return _context5.finish(53);

          case 57:
            return _context5.finish(50);

          case 58:
            return _context5.abrupt("return", res.json({
              status: "SUCCESS",
              message: "Berhasil mengirim ".concat(successCount, " dari ").concat(bookingIds.length, " e-tiket"),
              summary: {
                total: bookingIds.length,
                success: successCount,
                failed: failCount
              },
              results: results
            }));

          case 61:
            _context5.prev = 61;
            _context5.t2 = _context5["catch"](0);
            console.error("❌ [BULK RESEND ERROR]:", _context5.t2.message);
            return _context5.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context5.t2.message
            }));

          case 65:
          case "end":
            return _context5.stop();
        }
      }
    }, null, null, [[0, 61], [12, 46, 50, 58], [16, 37], [51,, 53, 57]]);
  }
};
module.exports = HotelBookingAdminController;