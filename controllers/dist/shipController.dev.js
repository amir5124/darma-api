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
  var _req$body, payload, response, username, connection, _ref, _ref2, resBooking, bookingId, paxs, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, p;

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
          _context.next = 11;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO bookings_pelni (\n                booking_code, num_code, ship_number, ship_name,\n                origin_port, origin_name, destination_port, destination_name,\n                depart_date, arrival_date, ticket_status,\n                total_price, sales_price, admin_fee, time_limit, \n                user_id, pengguna, customer_email, \n                payload_request, raw_response\n            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [response.bokingNumber || response.bookingNumber, // PNR PELNI
          response.numCode || payload.numCode, response.shipNumber || payload.shipNumber, response.shipName || "KM. PELNI", response.originPort || payload.originPort, response.originName || null, response.destinationPort || payload.destinationPort, response.destinationName || null, response.departDateTime ? response.departDateTime.replace('T', ' ') : null, response.arrivalDateTime ? response.arrivalDateTime.replace('T', ' ') : null, response.ticketStatus || "HOLD", response.ticketPrice || payload.totalPrice, // total_price
          response.salesPrice || 0, payload.adminFee || 0, // Admin Fee aplikasi/LinkQu
          response.issuedDateTimeLimit || response.timeLimit, response.userID || payload.userID, username || 'Guest', payload.ticketBuyerEmail || null, JSON.stringify(payload), JSON.stringify(response)]));

        case 11:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          resBooking = _ref2[0];
          bookingId = resBooking.insertId; // 2. Simpan Data Penumpang ke booking_passengers_pelni

          paxs = response.paxBookingDetails || payload.paxDetails;

          if (!(paxs && paxs.length > 0)) {
            _context.next = 43;
            break;
          }

          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context.prev = 20;
          _iterator = paxs[Symbol.iterator]();

        case 22:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context.next = 29;
            break;
          }

          p = _step.value;
          _context.next = 26;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO booking_passengers_pelni (\n                        booking_id, pax_name, pax_type, pax_gender, \n                        birth_date, id_number, phone, \n                        deck, cabin, bed\n                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [bookingId, (p.paxName || "".concat(p.firstName, " ").concat(p.lastName)).toUpperCase(), p.paxType || 'Adult', p.paxGender || 'M', p.birthDate ? p.birthDate.split('T')[0] : null, p.ID || p.id_number, p.phone || '', p.deck || '-', p.cabin || '-', p.bed || '-']));

        case 26:
          _iteratorNormalCompletion = true;
          _context.next = 22;
          break;

        case 29:
          _context.next = 35;
          break;

        case 31:
          _context.prev = 31;
          _context.t0 = _context["catch"](20);
          _didIteratorError = true;
          _iteratorError = _context.t0;

        case 35:
          _context.prev = 35;
          _context.prev = 36;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 38:
          _context.prev = 38;

          if (!_didIteratorError) {
            _context.next = 41;
            break;
          }

          throw _iteratorError;

        case 41:
          return _context.finish(38);

        case 42:
          return _context.finish(35);

        case 43:
          _context.next = 45;
          return regeneratorRuntime.awrap(connection.commit());

        case 45:
          // Logika kirim email instruksi pembayaran
          // sendShipBookingEmail(bookingId); 
          res.status(200).json({
            status: "SUCCESS",
            id: bookingId,
            bookingCode: response.bokingNumber,
            message: "Booking PELNI berhasil disimpan."
          });
          _context.next = 55;
          break;

        case 48:
          _context.prev = 48;
          _context.t1 = _context["catch"](6);

          if (!connection) {
            _context.next = 53;
            break;
          }

          _context.next = 53;
          return regeneratorRuntime.awrap(connection.rollback());

        case 53:
          console.error("❌ Database PELNI Error:", _context.t1.message);
          res.status(500).json({
            status: "ERROR",
            message: _context.t1.message
          });

        case 55:
          _context.prev = 55;
          if (connection) connection.release();
          return _context.finish(55);

        case 58:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[6, 48, 55, 58], [20, 31, 35, 43], [36,, 38, 42]]);
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