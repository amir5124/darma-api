"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var db = require('../config/db');

var _require = require('../utils/mailer'),
    sendShipBookingEmail = _require.sendShipBookingEmail;
/**
 * Menyimpan data booking PELNI setelah dapat response SUCCESS dari vendor
 */


exports.saveShipBooking = function _callee(req, res) {
  var _req$body, payload, response, username, connection, formatMySQLDateTime, _ref, _ref2, resBooking, bookingId, paxs, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, p, fullName;

  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _req$body = req.body, payload = _req$body.payload, response = _req$body.response, username = _req$body.username;

          if (!(!response || response.status !== "SUCCESS")) {
            _context.next = 3;
            break;
          }

          return _context.abrupt("return", res.status(400).json({
            status: "ERROR",
            message: "Gagal menyimpan: Response vendor tidak sukses."
          }));

        case 3:
          _context.next = 5;
          return regeneratorRuntime.awrap(db.getConnection());

        case 5:
          connection = _context.sent;
          _context.prev = 6;
          _context.next = 9;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 9:
          /**
           * 1. Helper untuk merapikan format DateTime ISO ke MySQL format (YYYY-MM-DD HH:mm:ss)
           * Menghindari error jika ada milidetik atau karakter 'T'
           */
          formatMySQLDateTime = function formatMySQLDateTime(dateStr) {
            if (!dateStr) return null;
            return dateStr.replace('T', ' ').substring(0, 19);
          }; // 2. Insert ke Tabel Utama (bookings_pelni)


          _context.next = 12;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO bookings_pelni (\n                booking_code, num_code, ship_number, ship_name,\n                origin_port, origin_name, destination_port, destination_name,\n                depart_date, arrival_date, ticket_status,\n                total_price, sales_price, admin_fee, time_limit, \n                user_id, pengguna, customer_email, \n                payload_request, raw_response\n            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [response.bookingNumber || response.bokingNumber || response.pnr || null, response.numCode || payload.numCode || null, response.shipNumber || payload.shipNumber || null, response.shipName || "KM. PELNI", response.originPort || payload.originPort || null, response.originName || null, response.destinationPort || payload.destinationPort || null, response.destinationName || null, formatMySQLDateTime(response.departDate), formatMySQLDateTime(response.arrivalDate), response.ticketStatus || "HOLD", response.ticketPrice || 0, response.salesPrice || 0, payload.adminFee || 0, formatMySQLDateTime(response.issuedDateTimeLimit || response.timeLimit), response.userID || payload.userID || null, username || 'Guest', payload.ticketBuyerEmail || null, JSON.stringify(payload) || null, JSON.stringify(response) || null]));

        case 12:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          resBooking = _ref2[0];
          bookingId = resBooking.insertId; // 3. Simpan Data Penumpang ke booking_passengers_pelni
          // Mengutamakan data dari response (paxBookingDetails) lalu fallback ke payload

          paxs = response.paxBookingDetails || payload.paxDetails || [];
          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context.prev = 20;
          _iterator = paxs[Symbol.iterator]();

        case 22:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context.next = 31;
            break;
          }

          p = _step.value;
          // Logika Nama: Gabung firstName & lastName jika paxName tidak ada
          fullName = p.paxName;

          if (!fullName && p.firstName) {
            fullName = "".concat(p.firstName, " ").concat(p.lastName || '').trim();
          }

          _context.next = 28;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO booking_passengers_pelni (\n                    booking_id, pax_name, pax_type, pax_gender, \n                    birth_date, id_number, phone, \n                    deck, cabin, bed\n                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [bookingId, (fullName || 'NONAME').toUpperCase(), p.paxType || 'Adult', p.paxGender || 'M', p.birthDate ? p.birthDate.split('T')[0] : null, p.ID || p.id_number || null, // Penting: Hindari undefined
          p.phone || '', p.deck || '-', p.cabin || '-', p.bed || '-']));

        case 28:
          _iteratorNormalCompletion = true;
          _context.next = 22;
          break;

        case 31:
          _context.next = 37;
          break;

        case 33:
          _context.prev = 33;
          _context.t0 = _context["catch"](20);
          _didIteratorError = true;
          _iteratorError = _context.t0;

        case 37:
          _context.prev = 37;
          _context.prev = 38;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 40:
          _context.prev = 40;

          if (!_didIteratorError) {
            _context.next = 43;
            break;
          }

          throw _iteratorError;

        case 43:
          return _context.finish(40);

        case 44:
          return _context.finish(37);

        case 45:
          _context.next = 47;
          return regeneratorRuntime.awrap(connection.commit());

        case 47:
          res.status(200).json({
            status: "SUCCESS",
            id: bookingId,
            bookingCode: response.bookingNumber || response.bokingNumber,
            message: "Booking PELNI berhasil disimpan."
          });
          _context.next = 57;
          break;

        case 50:
          _context.prev = 50;
          _context.t1 = _context["catch"](6);

          if (!connection) {
            _context.next = 55;
            break;
          }

          _context.next = 55;
          return regeneratorRuntime.awrap(connection.rollback());

        case 55:
          console.error("❌ Database PELNI Error:", _context.t1.message);
          res.status(500).json({
            status: "ERROR",
            message: "Database Error: " + _context.t1.message
          });

        case 57:
          _context.prev = 57;
          if (connection) connection.release();
          return _context.finish(57);

        case 60:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[6, 50, 57, 60], [20, 33, 37, 45], [38,, 40, 44]]);
};
/**
 * Ambil riwayat booking PELNI per pengguna
 */


exports.getShipHistory = function _callee2(req, res) {
  var username, query, _ref3, _ref4, rows;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          username = req.params.username;
          _context2.prev = 1;
          query = "\n            SELECT b.*, \n            (SELECT COUNT(*) FROM booking_passengers_pelni p WHERE p.booking_id = b.id) as total_pax\n            FROM bookings_pelni b \n            WHERE b.pengguna = ? \n            ORDER BY b.created_at DESC";
          _context2.next = 5;
          return regeneratorRuntime.awrap(db.execute(query, [username]));

        case 5:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          rows = _ref4[0];
          res.json({
            status: 'SUCCESS',
            data: rows
          });
          _context2.next = 14;
          break;

        case 11:
          _context2.prev = 11;
          _context2.t0 = _context2["catch"](1);
          res.status(500).json({
            status: 'ERROR',
            message: _context2.t0.message
          });

        case 14:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[1, 11]]);
};