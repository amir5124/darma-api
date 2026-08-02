"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// flightController.js
var db = require('../config/db');

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
          return regeneratorRuntime.awrap(db.execute("SELECT b.*, \n             (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.id) as total_pax,\n             (SELECT JSON_ARRAYAGG(\n                JSON_OBJECT(\n                    'id', p.id,\n                    'title', p.title,\n                    'first_name', p.first_name,\n                    'last_name', p.last_name,\n                    'pax_type', p.pax_type,\n                    'phone', p.phone,\n                    'id_number', p.id_number,\n                    'birth_date', p.birth_date\n                )\n                ORDER BY p.id ASC\n             ) FROM passengers p WHERE p.booking_id = b.id) as passengers\n             FROM bookings b \n             WHERE b.pengguna = ? \n             ORDER BY b.created_at DESC", [username]));

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

exports.saveBooking = function _callee2(req, res) {
  var _req$body, payload, response, username, connection, formatDBDate, finalAdminFee, finalTotalPrice, finalSalesPrice, _ref3, _ref4, resBooking, bookingId, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, p, _ref5, _ref6, resPax, paxId, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, ad, itineraryData, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, f;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _req$body = req.body, payload = _req$body.payload, response = _req$body.response, username = _req$body.username;
          console.log(payload, "data book");

          if (!(!response || response.status !== "SUCCESS")) {
            _context2.next = 4;
            break;
          }

          return _context2.abrupt("return", res.status(400).json({
            status: "ERROR",
            message: "Gagal menyimpan: Response dari vendor tidak sukses."
          }));

        case 4:
          _context2.next = 6;
          return regeneratorRuntime.awrap(db.getConnection());

        case 6:
          connection = _context2.sent;
          _context2.prev = 7;
          _context2.next = 10;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 10:
          // Helper untuk membersihkan format tanggal ISO ke MySQL format
          formatDBDate = function formatDBDate(dateStr) {
            if (!dateStr || dateStr.startsWith('0001')) return null;
            return dateStr.replace('T', ' ').replace('Z', '').split('.')[0];
          };

          finalAdminFee = payload.admin_fee || 0;
          finalTotalPrice = response.ticketPrice || response.totalPrice || payload.totalPrice || 0;
          finalSalesPrice = response.salesPrice || 0;
          _context2.next = 16;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO bookings (\n                booking_code, reference_no, airline_id, airline_name, \n                trip_type, origin, destination, origin_port, destination_port,\n                depart_date, ticket_status, total_price, sales_price, \n                admin_fee, \n                time_limit, \n                user_id, pengguna, access_token, payload_request, raw_response\n            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [response.bookingCode || response.booking_code, response.referenceNo || response.reference_no, payload.airlineID || response.airline_name, payload.airlineName || payload.airlineID || response.airline_name, payload.tripType || "OneWay", payload.origin, payload.destination, response.origin || payload.origin_port || null, response.destination || payload.destination_port || null, formatDBDate(payload.departDate || response.depart_date), response.ticketStatus || response.ticket_status || "HOLD", finalTotalPrice, finalSalesPrice, finalAdminFee, formatDBDate(response.timeLimit || response.time_limit), response.userID || payload.userID, username || 'Guest', payload.accessToken, JSON.stringify(payload), JSON.stringify(response)]));

        case 16:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          resBooking = _ref4[0];
          bookingId = resBooking.insertId; // --- B. SIMPAN DATA PENUMPANG (passengers) ---

          if (!(payload.paxDetails && payload.paxDetails.length > 0)) {
            _context2.next = 78;
            break;
          }

          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context2.prev = 24;
          _iterator = payload.paxDetails[Symbol.iterator]();

        case 26:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context2.next = 64;
            break;
          }

          p = _step.value;
          _context2.next = 30;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO passengers (booking_id, title, first_name, last_name, pax_type, phone, id_number, birth_date, pengguna) \n                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [bookingId, (p.title || 'MR').toUpperCase(), (p.firstName || '').toUpperCase(), (p.lastName || p.firstName || '').toUpperCase(), p.type === 0 ? 'Adult' : p.type === 1 ? 'Child' : 'Infant', (payload.contactCountryCodePhone || "") + (payload.contactRemainingPhoneNo || ""), p.idNumber || p.IDNumber || "", p.birthDate ? p.birthDate.split('T')[0] : '1900-01-01', username || 'Guest']));

        case 30:
          _ref5 = _context2.sent;
          _ref6 = _slicedToArray(_ref5, 1);
          resPax = _ref6[0];
          paxId = resPax.insertId; // Add-ons (Bagasi/Kursi)

          if (!(p.addOns && p.addOns.length > 0)) {
            _context2.next = 61;
            break;
          }

          _iteratorNormalCompletion2 = true;
          _didIteratorError2 = false;
          _iteratorError2 = undefined;
          _context2.prev = 38;
          _iterator2 = p.addOns[Symbol.iterator]();

        case 40:
          if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
            _context2.next = 47;
            break;
          }

          ad = _step2.value;
          _context2.next = 44;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO passenger_addons (passenger_id, segment_idx, baggage_code, seat_number, meals_json, pengguna) \n                             VALUES (?, ?, ?, ?, ?, ?)", [paxId, 0, ad.baggageString || ad.baggageCode || "", ad.seat || "", JSON.stringify(ad.meals || []), username || 'Guest']));

        case 44:
          _iteratorNormalCompletion2 = true;
          _context2.next = 40;
          break;

        case 47:
          _context2.next = 53;
          break;

        case 49:
          _context2.prev = 49;
          _context2.t0 = _context2["catch"](38);
          _didIteratorError2 = true;
          _iteratorError2 = _context2.t0;

        case 53:
          _context2.prev = 53;
          _context2.prev = 54;

          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }

        case 56:
          _context2.prev = 56;

          if (!_didIteratorError2) {
            _context2.next = 59;
            break;
          }

          throw _iteratorError2;

        case 59:
          return _context2.finish(56);

        case 60:
          return _context2.finish(53);

        case 61:
          _iteratorNormalCompletion = true;
          _context2.next = 26;
          break;

        case 64:
          _context2.next = 70;
          break;

        case 66:
          _context2.prev = 66;
          _context2.t1 = _context2["catch"](24);
          _didIteratorError = true;
          _iteratorError = _context2.t1;

        case 70:
          _context2.prev = 70;
          _context2.prev = 71;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 73:
          _context2.prev = 73;

          if (!_didIteratorError) {
            _context2.next = 76;
            break;
          }

          throw _iteratorError;

        case 76:
          return _context2.finish(73);

        case 77:
          return _context2.finish(70);

        case 78:
          // --- C. SIMPAN ITINERARY (flight_itinerary) ---
          itineraryData = response.flightDeparts && response.flightDeparts.length > 0 ? response.flightDeparts : payload.schDeparts || [];
          _iteratorNormalCompletion3 = true;
          _didIteratorError3 = false;
          _iteratorError3 = undefined;
          _context2.prev = 82;
          _iterator3 = itineraryData[Symbol.iterator]();

        case 84:
          if (_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done) {
            _context2.next = 91;
            break;
          }

          f = _step3.value;
          _context2.next = 88;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO flight_itinerary (\n                    booking_id, category, flight_number, origin, \n                    destination, depart_time, arrival_time, flight_class, pengguna\n                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [bookingId, 'Departure', f.flightNumber, f.fdOrigin || f.schOrigin, f.fdDestination || f.schDestination, formatDBDate(f.fdDepartTime || f.schDepartTime), formatDBDate(f.fdArrivalTime || f.schArrivalTime), f.fdFlightClass || f.flightClass, username || 'Guest']));

        case 88:
          _iteratorNormalCompletion3 = true;
          _context2.next = 84;
          break;

        case 91:
          _context2.next = 97;
          break;

        case 93:
          _context2.prev = 93;
          _context2.t2 = _context2["catch"](82);
          _didIteratorError3 = true;
          _iteratorError3 = _context2.t2;

        case 97:
          _context2.prev = 97;
          _context2.prev = 98;

          if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
            _iterator3["return"]();
          }

        case 100:
          _context2.prev = 100;

          if (!_didIteratorError3) {
            _context2.next = 103;
            break;
          }

          throw _iteratorError3;

        case 103:
          return _context2.finish(100);

        case 104:
          return _context2.finish(97);

        case 105:
          _context2.next = 107;
          return regeneratorRuntime.awrap(connection.commit());

        case 107:
          return _context2.abrupt("return", res.status(200).json({
            status: "SUCCESS",
            id: bookingId,
            bookingCode: response.bookingCode || response.booking_code,
            message: "Booking berhasil disimpan."
          }));

        case 110:
          _context2.prev = 110;
          _context2.t3 = _context2["catch"](7);

          if (!connection) {
            _context2.next = 115;
            break;
          }

          _context2.next = 115;
          return regeneratorRuntime.awrap(connection.rollback());

        case 115:
          console.error("❌ Database Error:", _context2.t3.message);
          return _context2.abrupt("return", res.status(500).json({
            status: "ERROR",
            message: _context2.t3.message
          }));

        case 117:
          _context2.prev = 117;
          if (connection) connection.release();
          return _context2.finish(117);

        case 120:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[7, 110, 117, 120], [24, 66, 70, 78], [38, 49, 53, 61], [54,, 56, 60], [71,, 73, 77], [82, 93, 97, 105], [98,, 100, 104]]);
};
/**
 * 2. AMBIL RIWAYAT BOOKING PENGGUNA (LENGKAP DENGAN SEMUA PENUMPANG)
 */


exports.getBookingPengguna = function _callee3(req, res) {
  var username, query, _ref7, _ref8, rows, historyData;

  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          username = req.params.username; // Proteksi jika username null/undefined dalam bentuk string

          if (!(!username || username === 'undefined' || username === 'null' || username === '{username}')) {
            _context3.next = 3;
            break;
          }

          return _context3.abrupt("return", res.status(200).json({
            status: 'SUCCESS',
            results: 0,
            data: [],
            message: 'Username tidak valid'
          }));

        case 3:
          _context3.prev = 3;
          query = "\n            SELECT \n                b.id AS booking_id, \n                b.booking_code, \n                b.booking_code AS bookingCodeAirline,\n                b.reference_no, \n                b.airline_name, \n                UPPER(b.ticket_status) AS ticket_status,\n                b.total_price, \n                b.sales_price, \n                b.time_limit, \n                b.depart_date,\n                b.origin AS origin_code, \n                b.destination AS destination_code,\n                b.origin_port, \n                b.destination_port,\n                b.access_token AS accessToken, \n                b.payload_request,\n                i.flight_number, \n                i.origin, \n                i.destination, \n                i.depart_time, \n                i.arrival_time, \n                i.flight_class,\n                -- \uD83D\uDD25 SEMUA PENUMPANG (JSON ARRAY)\n                (\n                    SELECT JSON_ARRAYAGG(\n                        JSON_OBJECT(\n                            'id', p.id,\n                            'title', p.title,\n                            'first_name', p.first_name,\n                            'last_name', p.last_name,\n                            'pax_type', p.pax_type,\n                            'phone', p.phone,\n                            'id_number', p.id_number,\n                            'birth_date', p.birth_date\n                        )\n                        ORDER BY p.id ASC\n                    )\n                    FROM passengers p \n                    WHERE p.booking_id = b.id\n                ) AS passengers,\n                -- \uD83D\uDD25 MAIN PAX (PENUMPANG UTAMA)\n                (\n                    SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) \n                    FROM passengers p \n                    WHERE p.booking_id = b.id \n                    ORDER BY p.id ASC \n                    LIMIT 1\n                ) AS main_pax_name,\n                -- \uD83D\uDD25 TOTAL PENUMPANG\n                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax\n            FROM bookings b\n            LEFT JOIN flight_itinerary i ON b.id = i.booking_id\n            WHERE b.pengguna = ? \n            ORDER BY b.created_at DESC\n        ";
          _context3.next = 7;
          return regeneratorRuntime.awrap(db.execute(query, [username]));

        case 7:
          _ref7 = _context3.sent;
          _ref8 = _slicedToArray(_ref7, 1);
          rows = _ref8[0];
          historyData = rows.map(function (item) {
            var now = new Date();
            var limit = item.time_limit ? new Date(item.time_limit) : null;

            var formatTime = function formatTime(dateStr) {
              if (!dateStr) return '--:--';
              var d = new Date(dateStr);
              return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('id-ID', {
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
          _context3.next = 18;
          break;

        case 14:
          _context3.prev = 14;
          _context3.t0 = _context3["catch"](3);
          console.error("❌ Error GetBookingPengguna:", _context3.t0);
          res.status(500).json({
            status: 'ERROR',
            message: 'Gagal memuat data riwayat'
          });

        case 18:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[3, 14]]);
};
/**
 * 3. GET DETAIL BOOKING BY ID (LENGKAP DENGAN SEMUA PENUMPANG)
 */


exports.getBookingDetail = function _callee4(req, res) {
  var id, _ref9, _ref10, rows;

  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          id = req.params.id;
          _context4.prev = 1;
          _context4.next = 4;
          return regeneratorRuntime.awrap(db.execute("SELECT \n                b.*,\n                (b.total_price + b.admin_fee - b.discount) as total_payment,\n                (\n                    SELECT JSON_ARRAYAGG(\n                        JSON_OBJECT(\n                            'id', p.id,\n                            'title', p.title,\n                            'first_name', p.first_name,\n                            'last_name', p.last_name,\n                            'pax_type', p.pax_type,\n                            'phone', p.phone,\n                            'id_number', p.id_number,\n                            'birth_date', p.birth_date\n                        )\n                        ORDER BY p.id ASC\n                    )\n                    FROM passengers p \n                    WHERE p.booking_id = b.id\n                ) AS passengers,\n                (\n                    SELECT JSON_ARRAYAGG(\n                        JSON_OBJECT(\n                            'id', i.id,\n                            'category', i.category,\n                            'flight_number', i.flight_number,\n                            'origin', i.origin,\n                            'destination', i.destination,\n                            'depart_time', i.depart_time,\n                            'arrival_time', i.arrival_time,\n                            'flight_class', i.flight_class\n                        )\n                        ORDER BY i.id ASC\n                    )\n                    FROM flight_itinerary i \n                    WHERE i.booking_id = b.id\n                ) AS itinerary,\n                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax,\n                (\n                    SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) \n                    FROM passengers p \n                    WHERE p.booking_id = b.id \n                    ORDER BY p.id ASC \n                    LIMIT 1\n                ) AS main_pax_name\n             FROM bookings b \n             WHERE b.id = ?", [id]));

        case 4:
          _ref9 = _context4.sent;
          _ref10 = _slicedToArray(_ref9, 1);
          rows = _ref10[0];

          if (!(rows.length === 0)) {
            _context4.next = 9;
            break;
          }

          return _context4.abrupt("return", res.status(404).json({
            status: 'ERROR',
            message: 'Booking tidak ditemukan'
          }));

        case 9:
          res.status(200).json({
            status: 'SUCCESS',
            data: rows[0]
          });
          _context4.next = 16;
          break;

        case 12:
          _context4.prev = 12;
          _context4.t0 = _context4["catch"](1);
          console.error("❌ Error GetBookingDetail:", _context4.t0);
          res.status(500).json({
            status: 'ERROR',
            message: 'Gagal memuat detail booking'
          });

        case 16:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[1, 12]]);
};
/**
 * 4. GET BOOKINGS BY EMAIL (LENGKAP DENGAN SEMUA PENUMPANG)
 */


exports.getBookingsByEmail = function _callee5(req, res) {
  var email, _ref11, _ref12, rows;

  return regeneratorRuntime.async(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          email = req.params.email;
          _context5.prev = 1;
          _context5.next = 4;
          return regeneratorRuntime.awrap(db.execute("SELECT \n                b.*,\n                (b.total_price + b.admin_fee - b.discount) as total_payment,\n                (\n                    SELECT JSON_ARRAYAGG(\n                        JSON_OBJECT(\n                            'id', p.id,\n                            'title', p.title,\n                            'first_name', p.first_name,\n                            'last_name', p.last_name,\n                            'pax_type', p.pax_type,\n                            'phone', p.phone,\n                            'id_number', p.id_number,\n                            'birth_date', p.birth_date\n                        )\n                        ORDER BY p.id ASC\n                    )\n                    FROM passengers p \n                    WHERE p.booking_id = b.id\n                ) AS passengers,\n                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax,\n                (\n                    SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) \n                    FROM passengers p \n                    WHERE p.booking_id = b.id \n                    ORDER BY p.id ASC \n                    LIMIT 1\n                ) AS main_pax_name\n             FROM bookings b \n             WHERE b.customer_email = ? \n             ORDER BY b.created_at DESC", [email]));

        case 4:
          _ref11 = _context5.sent;
          _ref12 = _slicedToArray(_ref11, 1);
          rows = _ref12[0];
          res.status(200).json({
            status: 'SUCCESS',
            results: rows.length,
            data: rows
          });
          _context5.next = 14;
          break;

        case 10:
          _context5.prev = 10;
          _context5.t0 = _context5["catch"](1);
          console.error("❌ Error GetBookingsByEmail:", _context5.t0);
          res.status(500).json({
            status: 'ERROR',
            message: 'Gagal memuat data booking'
          });

        case 14:
        case "end":
          return _context5.stop();
      }
    }
  }, null, null, [[1, 10]]);
};