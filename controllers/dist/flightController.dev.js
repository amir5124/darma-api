"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var db = require('../config/db'); // Sesuaikan path jika db.js ada di folder root atau config


var _require = require('../utils/mailer'),
    sendBookingEmail = _require.sendBookingEmail;
/**
 * Mendapatkan riwayat booking sederhana
 */


exports.getMyBookings = function _callee(req, res) {
  var username, _ref, _ref2, rows;

  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          username = req.params.username;
          _context.prev = 1;
          _context.next = 4;
          return regeneratorRuntime.awrap(db.execute("SELECT b.*, \n             (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.id) as total_pax\n             FROM bookings b \n             WHERE b.pengguna = ? \n             ORDER BY b.created_at DESC", [username]));

        case 4:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];
          res.json({
            status: 'SUCCESS',
            data: rows
          });
          _context.next = 13;
          break;

        case 10:
          _context.prev = 10;
          _context.t0 = _context["catch"](1);
          res.status(500).json({
            status: 'ERROR',
            message: _context.t0.message
          });

        case 13:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[1, 10]]);
};
/**
 * Mendapatkan riwayat booking lengkap dengan JOIN Itinerary (Jam Berangkat/Tiba)
 */


exports.getBookingPengguna = function _callee2(req, res) {
  var username, query, _ref3, _ref4, rows, historyData;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          username = req.params.username;

          if (!(!username || username === 'undefined' || username === 'null' || username === '{username}')) {
            _context2.next = 3;
            break;
          }

          return _context2.abrupt("return", res.status(200).json({
            status: 'SUCCESS',
            results: 0,
            data: [],
            message: 'Username tidak valid'
          }));

        case 3:
          _context2.prev = 3;
          query = "\n            SELECT \n                b.id AS booking_id, b.booking_code, b.booking_code AS bookingCodeAirline,\n                b.reference_no, b.airline_name, UPPER(b.ticket_status) AS ticket_status,\n                b.total_price, b.sales_price, b.time_limit, b.depart_date,\n                b.origin AS origin_code, b.destination AS destination_code,\n                b.origin_port, b.destination_port,\n                b.access_token AS accessToken, b.payload_request,\n                i.flight_number, i.origin, i.destination, i.depart_time, i.arrival_time, i.flight_class,\n                p.first_name AS main_pax_first, p.last_name AS main_pax_last,\n                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax\n            FROM bookings b\n            LEFT JOIN flight_itinerary i ON b.id = i.booking_id\n            LEFT JOIN passengers p ON b.id = p.booking_id AND p.id = (\n                SELECT MIN(id) FROM passengers WHERE booking_id = b.id\n            )\n            WHERE b.pengguna = ? \n            ORDER BY b.created_at DESC\n        ";
          _context2.next = 7;
          return regeneratorRuntime.awrap(db.execute(query, [username]));

        case 7:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          rows = _ref4[0];
          historyData = rows.map(function (item) {
            var now = new Date();
            var limit = item.time_limit ? new Date(item.time_limit) : null;

            var formatTime = function formatTime(dateStr) {
              if (!dateStr) return '--:--';
              var d = new Date(dateStr); // Menggunakan locale id-ID dan memastikan format HH:mm

              return d.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }).replace('.', ':');
            };

            var status = item.ticket_status ? item.ticket_status.toUpperCase() : "BOOKED";
            var isTicketed = status === 'TICKETED';
            var isExpired = !isTicketed && limit ? now > limit : false;
            return _objectSpread({}, item, {
              origin: item.origin_port || item.origin || item.origin_code,
              destination: item.destination_port || item.destination || item.destination_code,
              ticket_status: status,
              isExpired: isExpired,
              canPay: !isTicketed && !isExpired,
              jam_berangkat: formatTime(item.depart_time),
              jam_tiba: formatTime(item.arrival_time),
              formattedLimit: limit ? limit.toLocaleString('id-ID', {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : 'N/A'
            });
          });
          res.status(200).json({
            status: 'SUCCESS',
            results: historyData.length,
            data: historyData
          });
          _context2.next = 18;
          break;

        case 14:
          _context2.prev = 14;
          _context2.t0 = _context2["catch"](3);
          console.error("❌ Error GetBookingPengguna:", _context2.t0);
          res.status(500).json({
            status: 'ERROR',
            message: 'Gagal memuat data'
          });

        case 18:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[3, 14]]);
};
/**
 * Menyimpan data booking pesawat
 */


exports.saveBooking = function _callee3(req, res) {
  var _req$body, payload, response, username, connection, formatDBDate, finalTotalPrice, finalSalesPrice, _ref5, _ref6, resBooking, bookingId, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, p, _ref7, _ref8, resPax, paxId, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, ad, itineraryData, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, f;

  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _req$body = req.body, payload = _req$body.payload, response = _req$body.response, username = _req$body.username;

          if (!(!response || response.status !== "SUCCESS")) {
            _context3.next = 3;
            break;
          }

          return _context3.abrupt("return", res.status(400).json({
            status: "ERROR",
            message: "Gagal menyimpan: Response dari vendor tidak sukses."
          }));

        case 3:
          _context3.next = 5;
          return regeneratorRuntime.awrap(db.getConnection());

        case 5:
          connection = _context3.sent;
          _context3.prev = 6;
          _context3.next = 9;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 9:
          formatDBDate = function formatDBDate(dateStr) {
            if (!dateStr) return null;
            return dateStr.replace('T', ' ').replace('Z', '').split('.')[0];
          };

          finalTotalPrice = response.ticketPrice || response.totalPrice || payload.totalPrice || 0;
          finalSalesPrice = response.salesPrice || 0; // 1. Insert Table Bookings

          _context3.next = 14;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO bookings (\n                booking_code, reference_no, airline_id, airline_name, \n                trip_type, origin, destination, origin_port, destination_port,\n                depart_date, ticket_status, total_price, sales_price, time_limit, \n                user_id, pengguna, access_token, payload_request, raw_response\n            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [response.bookingCode || response.booking_code, response.referenceNo || response.reference_no, payload.airlineID || response.airline_name, payload.airlineName || payload.airlineID || response.airline_name, payload.tripType || "OneWay", payload.origin, payload.destination, response.origin || payload.origin_port || null, response.destination || payload.destination_port || null, formatDBDate(payload.departDate || response.depart_date), response.ticketStatus || response.ticket_status || "HOLD", finalTotalPrice, finalSalesPrice, formatDBDate(response.timeLimit || response.time_limit), response.userID || payload.userID, username || 'Guest', payload.accessToken, JSON.stringify(payload), JSON.stringify(response)]));

        case 14:
          _ref5 = _context3.sent;
          _ref6 = _slicedToArray(_ref5, 1);
          resBooking = _ref6[0];
          bookingId = resBooking.insertId; // 2. Simpan Data Penumpang

          if (!(payload.paxDetails && payload.paxDetails.length > 0)) {
            _context3.next = 76;
            break;
          }

          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context3.prev = 22;
          _iterator = payload.paxDetails[Symbol.iterator]();

        case 24:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context3.next = 62;
            break;
          }

          p = _step.value;
          _context3.next = 28;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO passengers (booking_id, title, first_name, last_name, pax_type, phone, id_number, birth_date, pengguna) \n                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [bookingId, (p.title || 'MR').toUpperCase(), (p.firstName || '').toUpperCase(), (p.lastName || p.firstName || '').toUpperCase(), p.type === 0 ? 'Adult' : p.type === 1 ? 'Child' : 'Infant', (payload.contactCountryCodePhone || "") + (payload.contactRemainingPhoneNo || ""), p.idNumber || p.IDNumber || "", p.birthDate ? p.birthDate.split('T')[0] : '1900-01-01', username || 'Guest']));

        case 28:
          _ref7 = _context3.sent;
          _ref8 = _slicedToArray(_ref7, 1);
          resPax = _ref8[0];
          paxId = resPax.insertId;

          if (!(p.addOns && p.addOns.length > 0)) {
            _context3.next = 59;
            break;
          }

          _iteratorNormalCompletion2 = true;
          _didIteratorError2 = false;
          _iteratorError2 = undefined;
          _context3.prev = 36;
          _iterator2 = p.addOns[Symbol.iterator]();

        case 38:
          if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
            _context3.next = 45;
            break;
          }

          ad = _step2.value;
          _context3.next = 42;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO passenger_addons (passenger_id, segment_idx, baggage_code, seat_number, meals_json, pengguna) \n                             VALUES (?, ?, ?, ?, ?, ?)", [paxId, 0, ad.baggageString || ad.baggageCode || "", ad.seat || "", JSON.stringify(ad.meals || []), username || 'Guest']));

        case 42:
          _iteratorNormalCompletion2 = true;
          _context3.next = 38;
          break;

        case 45:
          _context3.next = 51;
          break;

        case 47:
          _context3.prev = 47;
          _context3.t0 = _context3["catch"](36);
          _didIteratorError2 = true;
          _iteratorError2 = _context3.t0;

        case 51:
          _context3.prev = 51;
          _context3.prev = 52;

          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }

        case 54:
          _context3.prev = 54;

          if (!_didIteratorError2) {
            _context3.next = 57;
            break;
          }

          throw _iteratorError2;

        case 57:
          return _context3.finish(54);

        case 58:
          return _context3.finish(51);

        case 59:
          _iteratorNormalCompletion = true;
          _context3.next = 24;
          break;

        case 62:
          _context3.next = 68;
          break;

        case 64:
          _context3.prev = 64;
          _context3.t1 = _context3["catch"](22);
          _didIteratorError = true;
          _iteratorError = _context3.t1;

        case 68:
          _context3.prev = 68;
          _context3.prev = 69;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 71:
          _context3.prev = 71;

          if (!_didIteratorError) {
            _context3.next = 74;
            break;
          }

          throw _iteratorError;

        case 74:
          return _context3.finish(71);

        case 75:
          return _context3.finish(68);

        case 76:
          // 3. Simpan Itinerary Penerbangan (DIPERBAIKI)
          // Mengecek di response.flightDeparts ATAU payload.schDeparts
          itineraryData = response.flightDeparts && response.flightDeparts.length > 0 ? response.flightDeparts : payload.schDeparts || [];
          _iteratorNormalCompletion3 = true;
          _didIteratorError3 = false;
          _iteratorError3 = undefined;
          _context3.prev = 80;
          _iterator3 = itineraryData[Symbol.iterator]();

        case 82:
          if (_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done) {
            _context3.next = 89;
            break;
          }

          f = _step3.value;
          _context3.next = 86;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO flight_itinerary (\n                    booking_id, category, flight_number, origin, \n                    destination, depart_time, arrival_time, flight_class, pengguna\n                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [bookingId, 'Departure', f.flightNumber, f.fdOrigin || f.schOrigin, f.fdDestination || f.schDestination, formatDBDate(f.fdDepartTime || f.schDepartTime), formatDBDate(f.fdArrivalTime || f.schArrivalTime), f.fdFlightClass || f.flightClass, username || null]));

        case 86:
          _iteratorNormalCompletion3 = true;
          _context3.next = 82;
          break;

        case 89:
          _context3.next = 95;
          break;

        case 91:
          _context3.prev = 91;
          _context3.t2 = _context3["catch"](80);
          _didIteratorError3 = true;
          _iteratorError3 = _context3.t2;

        case 95:
          _context3.prev = 95;
          _context3.prev = 96;

          if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
            _iterator3["return"]();
          }

        case 98:
          _context3.prev = 98;

          if (!_didIteratorError3) {
            _context3.next = 101;
            break;
          }

          throw _iteratorError3;

        case 101:
          return _context3.finish(98);

        case 102:
          return _context3.finish(95);

        case 103:
          _context3.next = 105;
          return regeneratorRuntime.awrap(connection.commit());

        case 105:
          return _context3.abrupt("return", res.status(200).json({
            status: "SUCCESS",
            id: bookingId,
            bookingCode: response.bookingCode || response.booking_code,
            message: "Booking berhasil disimpan."
          }));

        case 108:
          _context3.prev = 108;
          _context3.t3 = _context3["catch"](6);

          if (!connection) {
            _context3.next = 113;
            break;
          }

          _context3.next = 113;
          return regeneratorRuntime.awrap(connection.rollback());

        case 113:
          console.error("❌ Database Error:", _context3.t3.message);
          return _context3.abrupt("return", res.status(500).json({
            status: "ERROR",
            message: _context3.t3.message
          }));

        case 115:
          _context3.prev = 115;
          if (connection) connection.release();
          return _context3.finish(115);

        case 118:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[6, 108, 115, 118], [22, 64, 68, 76], [36, 47, 51, 59], [52,, 54, 58], [69,, 71, 75], [80, 91, 95, 103], [96,, 98, 102]]);
};