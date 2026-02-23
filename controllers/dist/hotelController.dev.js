"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var axios = require('axios');

var db = require('../config/db');

var nodemailer = require('nodemailer');

var _require = require('../helpers/darmaSandbox'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger; // --- KONFIGURASI EMAIL ---


var transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'linkutransport@gmail.com',
    pass: 'qbckptzxgdumxtdm'
  }
});
var primaryColor = "#24b3ae";
var secondaryColor = "#e03f7d";
var hotelController = {
  // 1. SEARCH HOTELS
  search: function search(req, res) {
    var token, b, payload, response;
    return regeneratorRuntime.async(function search$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _context.next = 3;
            return regeneratorRuntime.awrap(getConsistentToken());

          case 3:
            token = _context.sent;
            b = req.body;
            payload = {
              paxPassport: b.paxPassport || "ID",
              countryID: b.countryID || "ID",
              cityID: String(b.cityID),
              checkInDate: b.checkInDate,
              checkOutDate: b.checkOutDate,
              roomRequest: b.roomRequest.map(function (room) {
                return {
                  roomType: parseInt(room.roomType) || 0,
                  isRequestChildBed: Boolean(room.isRequestChildBed),
                  childNum: parseInt(room.childNum) || 0,
                  childAges: room.childAges || [0]
                };
              }),
              userID: USER_CONFIG.userID,
              accessToken: token
            };
            _context.next = 8;
            return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/Search5"), payload, {
              httpsAgent: agent,
              headers: {
                'Content-Type': 'application/json'
              }
            }));

          case 8:
            response = _context.sent;
            res.json(response.data);
            _context.next = 16;
            break;

          case 12:
            _context.prev = 12;
            _context.t0 = _context["catch"](0);
            logger.error("Hotel Search Error: " + _context.t0.message);
            res.status(500).json({
              status: "ERROR",
              respMessage: _context.t0.message
            });

          case 16:
          case "end":
            return _context.stop();
        }
      }
    }, null, null, [[0, 12]]);
  },
  // 2. AVAILABLE ROOMS
  availableRooms: function availableRooms(req, res) {
    var token, b, payload, response;
    return regeneratorRuntime.async(function availableRooms$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            _context2.prev = 0;
            _context2.next = 3;
            return regeneratorRuntime.awrap(getConsistentToken());

          case 3:
            token = _context2.sent;
            b = req.body;
            payload = {
              hotelID: b.hotelID,
              paxPassport: b.paxPassport || "ID",
              countryID: b.countryID || "ID",
              cityID: String(b.cityID),
              checkInDate: b.checkInDate,
              checkOutDate: b.checkOutDate,
              roomRequest: b.roomRequest.map(function (room) {
                return {
                  roomType: parseInt(room.roomType) || 0,
                  isRequestChildBed: Boolean(room.isRequestChildBed),
                  childNum: parseInt(room.childNum) || 0,
                  childAges: room.childAges || [0]
                };
              }),
              userID: USER_CONFIG.userID,
              accessToken: token
            };
            _context2.next = 8;
            return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/AvailableRooms5"), payload, {
              httpsAgent: agent
            }));

          case 8:
            response = _context2.sent;
            res.json(response.data);
            _context2.next = 15;
            break;

          case 12:
            _context2.prev = 12;
            _context2.t0 = _context2["catch"](0);
            res.status(500).json({
              status: "ERROR",
              respMessage: _context2.t0.message
            });

          case 15:
          case "end":
            return _context2.stop();
        }
      }
    }, null, null, [[0, 12]]);
  },
  // 3. PRICE AND POLICY INFO
  getPriceInfo: function getPriceInfo(req, res) {
    var token, b, payload, response;
    return regeneratorRuntime.async(function getPriceInfo$(_context3) {
      while (1) {
        switch (_context3.prev = _context3.next) {
          case 0:
            _context3.prev = 0;
            _context3.next = 3;
            return regeneratorRuntime.awrap(getConsistentToken());

          case 3:
            token = _context3.sent;
            b = req.body;
            payload = {
              paxPassport: b.paxPassport || "ID",
              countryID: b.countryID || "ID",
              cityID: b.cityID,
              checkInDate: b.checkInDate,
              checkOutDate: b.checkOutDate,
              roomRequest: b.roomRequest,
              internalCode: b.internalCode,
              hotelID: b.hotelID,
              breakfast: b.breakfast,
              roomID: b.roomID,
              userID: USER_CONFIG.userID,
              accessToken: token
            };
            _context3.next = 8;
            return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), payload, {
              httpsAgent: agent
            }));

          case 8:
            response = _context3.sent;
            res.json(response.data);
            _context3.next = 15;
            break;

          case 12:
            _context3.prev = 12;
            _context3.t0 = _context3["catch"](0);
            res.status(500).json({
              status: "ERROR",
              respMessage: _context3.t0.message
            });

          case 15:
          case "end":
            return _context3.stop();
        }
      }
    }, null, null, [[0, 12]]);
  },
  // 4. BOOKING (INSERT TO DB & EMAIL KONFIRMASI)
  booking: function booking(req, res) {
    var connection, token, b, payload, response, resData, _ref, _ref2, bookingResult, newBookingId, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, room, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, pax, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, age, expiredDate;

    return regeneratorRuntime.async(function booking$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            _context4.prev = 0;
            _context4.next = 3;
            return regeneratorRuntime.awrap(getConsistentToken());

          case 3:
            token = _context4.sent;
            b = req.body; // 1. Validasi Input Dasar

            if (!(!b.roomRequest || !b.roomRequest[0])) {
              _context4.next = 7;
              break;
            }

            return _context4.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Data paxes tidak lengkap."
            }));

          case 7:
            payload = {
              paxPassport: b.paxPassport || "ID",
              countryID: b.countryID || "ID",
              cityID: String(b.cityID),
              checkInDate: b.checkInDate.endsWith('Z') ? b.checkInDate : b.checkInDate + 'Z',
              checkOutDate: b.checkOutDate.endsWith('Z') ? b.checkOutDate : b.checkOutDate + 'Z',
              roomRequest: b.roomRequest.map(function (room) {
                return {
                  paxes: room.paxes.map(function (pax) {
                    return {
                      title: pax.title || 'Mr.',
                      firstName: (pax.firstName || '').trim(),
                      lastName: (pax.lastName || '').trim()
                    };
                  }),
                  isSmokingRoom: Boolean(room.isSmokingRoom),
                  phone: String(room.phone || ''),
                  email: String(room.email || ''),
                  roomType: 0,
                  childNum: parseInt(room.childNum) || 0,
                  childAges: room.childAges || []
                };
              }),
              internalCode: b.internalCode,
              hotelID: b.hotelID,
              breakfast: b.breakfast,
              roomID: b.roomID,
              bedType: {
                ID: null,
                bed: null
              },
              agentOsRef: b.agentOsRef || "HTL-".concat(Date.now()),
              userID: USER_CONFIG.userID,
              accessToken: token
            }; // 2. Request ke Supplier

            _context4.next = 10;
            return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
              httpsAgent: agent,
              timeout: 30000 // Robustness: Tambahkan timeout 30 detik

            }));

          case 10:
            response = _context4.sent;
            resData = response.data;

            if (!(resData.status === "SUCCESS")) {
              _context4.next = 113;
              break;
            }

            _context4.next = 15;
            return regeneratorRuntime.awrap(db.getConnection());

          case 15:
            connection = _context4.sent;
            _context4.next = 18;
            return regeneratorRuntime.awrap(connection.beginTransaction());

          case 18:
            _context4.next = 20;
            return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_bookings \n                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, \n                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, \n                contact_email, contact_phone, total_price, booking_status) \n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [resData.reservationNo, resData.voucherNo, resData.osRefNo, resData.agentOsRef, resData.hotelID, resData.hotelName, resData.hotelAddress, b.internalCode, resData.checkInDate, resData.checkOutDate, resData.cityID, resData.roomID, resData.roomName, resData.breakfast, b.roomRequest[0].email, b.roomRequest[0].phone, resData.totalPrice, 'Accept']));

          case 20:
            _ref = _context4.sent;
            _ref2 = _slicedToArray(_ref, 1);
            bookingResult = _ref2[0];
            newBookingId = bookingResult.insertId;
            console.log(newBookingId, "id"); // 4. Simpan Paxes (Looping yang aman)

            _iteratorNormalCompletion = true;
            _didIteratorError = false;
            _iteratorError = undefined;
            _context4.prev = 28;
            _iterator = b.roomRequest[Symbol.iterator]();

          case 30:
            if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
              _context4.next = 89;
              break;
            }

            room = _step.value;

            if (!room.paxes) {
              _context4.next = 59;
              break;
            }

            _iteratorNormalCompletion2 = true;
            _didIteratorError2 = false;
            _iteratorError2 = undefined;
            _context4.prev = 36;
            _iterator2 = room.paxes[Symbol.iterator]();

          case 38:
            if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
              _context4.next = 45;
              break;
            }

            pax = _step2.value;
            _context4.next = 42;
            return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) \n                            VALUES (?, 'ADULT', ?, ?, ?)", [newBookingId, pax.title, pax.firstName, pax.lastName]));

          case 42:
            _iteratorNormalCompletion2 = true;
            _context4.next = 38;
            break;

          case 45:
            _context4.next = 51;
            break;

          case 47:
            _context4.prev = 47;
            _context4.t0 = _context4["catch"](36);
            _didIteratorError2 = true;
            _iteratorError2 = _context4.t0;

          case 51:
            _context4.prev = 51;
            _context4.prev = 52;

            if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
              _iterator2["return"]();
            }

          case 54:
            _context4.prev = 54;

            if (!_didIteratorError2) {
              _context4.next = 57;
              break;
            }

            throw _iteratorError2;

          case 57:
            return _context4.finish(54);

          case 58:
            return _context4.finish(51);

          case 59:
            if (!(room.childNum > 0 && room.childAges)) {
              _context4.next = 86;
              break;
            }

            _iteratorNormalCompletion3 = true;
            _didIteratorError3 = false;
            _iteratorError3 = undefined;
            _context4.prev = 63;
            _iterator3 = room.childAges[Symbol.iterator]();

          case 65:
            if (_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done) {
              _context4.next = 72;
              break;
            }

            age = _step3.value;
            _context4.next = 69;
            return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, age) \n                            VALUES (?, 'CHILD', ?)", [newBookingId, age]));

          case 69:
            _iteratorNormalCompletion3 = true;
            _context4.next = 65;
            break;

          case 72:
            _context4.next = 78;
            break;

          case 74:
            _context4.prev = 74;
            _context4.t1 = _context4["catch"](63);
            _didIteratorError3 = true;
            _iteratorError3 = _context4.t1;

          case 78:
            _context4.prev = 78;
            _context4.prev = 79;

            if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
              _iterator3["return"]();
            }

          case 81:
            _context4.prev = 81;

            if (!_didIteratorError3) {
              _context4.next = 84;
              break;
            }

            throw _iteratorError3;

          case 84:
            return _context4.finish(81);

          case 85:
            return _context4.finish(78);

          case 86:
            _iteratorNormalCompletion = true;
            _context4.next = 30;
            break;

          case 89:
            _context4.next = 95;
            break;

          case 91:
            _context4.prev = 91;
            _context4.t2 = _context4["catch"](28);
            _didIteratorError = true;
            _iteratorError = _context4.t2;

          case 95:
            _context4.prev = 95;
            _context4.prev = 96;

            if (!_iteratorNormalCompletion && _iterator["return"] != null) {
              _iterator["return"]();
            }

          case 98:
            _context4.prev = 98;

            if (!_didIteratorError) {
              _context4.next = 101;
              break;
            }

            throw _iteratorError;

          case 101:
            return _context4.finish(98);

          case 102:
            return _context4.finish(95);

          case 103:
            // 5. Simpan Payment Record
            expiredDate = new Date();
            expiredDate.setHours(expiredDate.getHours() + 2);
            _context4.next = 107;
            return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_payments (booking_id, booking_code, amount, expired_date, payment_status) \n                VALUES (?, ?, ?, ?, 'PENDING')", [newBookingId, resData.reservationNo, resData.totalPrice, expiredDate]));

          case 107:
            _context4.next = 109;
            return regeneratorRuntime.awrap(connection.commit());

          case 109:
            // 6. Kirim Email (Async - Jangan biarkan error email menggagalkan transaksi)
            transporter.sendMail({
              from: '"LinkU Travel" <linkutransport@gmail.com>',
              to: b.roomRequest[0].email,
              subject: "Konfirmasi Booking - ".concat(resData.reservationNo),
              html: generateEmailHtml(resData, b.roomRequest[0].paxes[0].firstName) // Gunakan helper function

            })["catch"](function (err) {
              return logger.error("Email Error: " + err.message);
            }); // 7. FINAL RESPONSE (Pastikan booking_id terkirim paling atas)

            return _context4.abrupt("return", res.json(_objectSpread({
              status: "SUCCESS",
              booking_id: newBookingId
            }, resData)));

          case 113:
            return _context4.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: resData.respMessage || "Gagal melakukan booking ke supplier."
            }));

          case 114:
            _context4.next = 123;
            break;

          case 116:
            _context4.prev = 116;
            _context4.t3 = _context4["catch"](0);

            if (!connection) {
              _context4.next = 121;
              break;
            }

            _context4.next = 121;
            return regeneratorRuntime.awrap(connection.rollback());

          case 121:
            logger.error("Booking Error: " + _context4.t3.message);
            res.status(500).json({
              status: "ERROR",
              respMessage: _context4.t3.message
            });

          case 123:
            _context4.prev = 123;
            if (connection) connection.release();
            return _context4.finish(123);

          case 126:
          case "end":
            return _context4.stop();
        }
      }
    }, null, null, [[0, 116, 123, 126], [28, 91, 95, 103], [36, 47, 51, 59], [52,, 54, 58], [63, 74, 78, 86], [79,, 81, 85], [96,, 98, 102]]);
  },
  // 5. SELECT PAYMENT METHOD (LINKQU INSTRUCTION EMAIL)
  // Asumsi: Method ini dipanggil saat user memilih bank/metode bayar LinkQu di aplikasi Anda
  selectPayment: function selectPayment(req, res) {
    var _req$body, reservationNo, paymentMethod, vaNumber, amount, email, customerName, exp, htmlInstruction;

    return regeneratorRuntime.async(function selectPayment$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            _req$body = req.body, reservationNo = _req$body.reservationNo, paymentMethod = _req$body.paymentMethod, vaNumber = _req$body.vaNumber, amount = _req$body.amount, email = _req$body.email, customerName = _req$body.customerName;
            _context5.prev = 1;
            exp = new Date();
            exp.setHours(exp.getHours() + 2); // Email 2: Instruksi Bayar Modern

            htmlInstruction = "\n            <div style=\"font-family: sans-serif; max-width: 600px; margin: auto; border-top: 5px solid ".concat(secondaryColor, ";\">\n                <div style=\"padding: 20px; background: #fff; text-align: center;\">\n                    <h3 style=\"color: ").concat(primaryColor, ";\">Selesaikan Pembayaran Anda</h3>\n                    <p style=\"color: #666;\">Gunakan detail di bawah ini untuk membayar melalui ").concat(paymentMethod, "</p>\n                </div>\n                <div style=\"background: #f9f9f9; padding: 30px; border-radius: 10px; margin: 0 20px;\">\n                    <p style=\"text-align: center; margin: 0; color: #888;\">NOMOR PEMBAYARAN / VA</p>\n                    <h1 style=\"text-align: center; color: ").concat(secondaryColor, "; letter-spacing: 2px; margin: 10px 0;\">").concat(vaNumber, "</h1>\n                    <div style=\"border-top: 1px solid #ddd; margin: 20px 0;\"></div>\n                    <table style=\"width: 100%;\">\n                        <tr><td>Total Tagihan</td><td style=\"text-align: right; font-weight: bold;\">Rp ").concat(Number(amount).toLocaleString(), "</td></tr>\n                        <tr><td>Batas Waktu</td><td style=\"text-align: right; color: red;\">").concat(exp.toLocaleString(), "</td></tr>\n                    </table>\n                </div>\n                <div style=\"padding: 20px; font-size: 12px; color: #999; text-align: center;\">\n                    Sistem akan memverifikasi pembayaran Anda secara otomatis.\n                </div>\n            </div>");
            _context5.next = 7;
            return regeneratorRuntime.awrap(transporter.sendMail({
              from: '"Payment Center" <noreply@travel.com>',
              to: email,
              subject: "Instruksi Pembayaran ".concat(reservationNo),
              html: htmlInstruction
            }));

          case 7:
            res.json({
              status: "SUCCESS",
              message: "Instruction email sent"
            });
            _context5.next = 13;
            break;

          case 10:
            _context5.prev = 10;
            _context5.t0 = _context5["catch"](1);
            res.status(500).json({
              error: _context5.t0.message
            });

          case 13:
          case "end":
            return _context5.stop();
        }
      }
    }, null, null, [[1, 10]]);
  },
  // 6. PAYMENT NOTIFICATION (CALLBACK & E-TICKET EMAIL)
  handlePaymentNotification: function handlePaymentNotification(req, res) {
    var _req$body2, reservationNo, paymentStatus, paymentMethod, paymentReff, _ref3, _ref4, bookingRows, _ref5, _ref6, paxes, htmlTicket;

    return regeneratorRuntime.async(function handlePaymentNotification$(_context6) {
      while (1) {
        switch (_context6.prev = _context6.next) {
          case 0:
            _req$body2 = req.body, reservationNo = _req$body2.reservationNo, paymentStatus = _req$body2.paymentStatus, paymentMethod = _req$body2.paymentMethod, paymentReff = _req$body2.paymentReff;
            _context6.prev = 1;

            if (!(paymentStatus === 'SETTLED')) {
              _context6.next = 19;
              break;
            }

            _context6.next = 5;
            return regeneratorRuntime.awrap(db.execute("UPDATE hotel_payments SET \n                    payment_status = 'SETTLED', \n                    payment_method = ?, \n                    payment_reff = ?, \n                    payment_date = NOW(), \n                    ticket_status = 'ISSUED' \n                    WHERE booking_code = ?", [paymentMethod, paymentReff, reservationNo]));

          case 5:
            _context6.next = 7;
            return regeneratorRuntime.awrap(db.execute("SELECT b.*, p.payment_method, p.payment_date \n                     FROM hotel_bookings b \n                     JOIN hotel_payments p ON b.id = p.booking_id \n                     WHERE b.reservation_no = ?", [reservationNo]));

          case 7:
            _ref3 = _context6.sent;
            _ref4 = _slicedToArray(_ref3, 1);
            bookingRows = _ref4[0];
            _context6.next = 12;
            return regeneratorRuntime.awrap(db.execute("SELECT * FROM hotel_booking_paxes WHERE booking_id = ?", [bookingRows[0].id]));

          case 12:
            _ref5 = _context6.sent;
            _ref6 = _slicedToArray(_ref5, 1);
            paxes = _ref6[0];
            // --- EMAIL 3: E-TICKET (MODERN DESIGN) ---
            htmlTicket = "\n                <div style=\"font-family: Arial; max-width: 600px; margin: auto; border: 1px solid ".concat(primaryColor, "; border-radius: 8px; overflow: hidden;\">\n                    <div style=\"background: ").concat(primaryColor, "; color: white; padding: 25px; text-align: center;\">\n                        <h1 style=\"margin: 0; font-size: 24px;\">HOTEL VOUCHER</h1>\n                        <p style=\"margin: 5px 0 0;\">Reservasi No: ").concat(reservationNo, "</p>\n                    </div>\n                    <div style=\"padding: 25px;\">\n                        <h2 style=\"color: ").concat(primaryColor, "; margin-top: 0;\">").concat(bookingRows[0].hotel_name, "</h2>\n                        <p style=\"font-size: 14px; color: #555;\">").concat(bookingRows[0].hotel_address, "</p>\n                        \n                        <div style=\"background: #fcfcfc; border: 1px solid #eee; padding: 15px; margin: 20px 0; border-radius: 5px;\">\n                            <table style=\"width: 100%;\">\n                                <tr>\n                                    <td><small style=\"color: #999;\">CHECK-IN</small><br><b>").concat(new Date(bookingRows[0].check_in_date).toDateString(), "</b></td>\n                                    <td><small style=\"color: #999;\">CHECK-OUT</small><br><b>").concat(new Date(bookingRows[0].check_out_date).toDateString(), "</b></td>\n                                </tr>\n                            </table>\n                        </div>\n\n                        <h4 style=\"border-bottom: 2px solid #f0f0f0; padding-bottom: 5px;\">DETAIL TAMU</h4>\n                        <ul style=\"padding-left: 20px; font-size: 14px;\">\n                            ").concat(paxes.map(function (p) {
              return "<li>".concat(p.title, " ").concat(p.first_name, " ").concat(p.last_name, "</li>");
            }).join(''), "\n                        </ul>\n\n                        <div style=\"margin-top: 30px; text-align: center;\">\n                            <div style=\"display: inline-block; background: #e8f5f4; color: ").concat(primaryColor, "; padding: 10px 20px; border-radius: 20px; font-weight: bold;\">\n                                PEMBAYARAN LUNAS (").concat(paymentMethod, ")\n                            </div>\n                        </div>\n                    </div>\n                    <div style=\"background: #333; color: #fff; padding: 15px; text-align: center; font-size: 11px;\">\n                        Tunjukkan voucher ini saat check-in. Terima kasih telah memesan melalui kami.\n                    </div>\n                </div>");
            _context6.next = 18;
            return regeneratorRuntime.awrap(transporter.sendMail({
              from: '"Customer Service" <noreply@travel.com>',
              to: bookingRows[0].contact_email,
              subject: "[E-TICKET] Voucher Hotel Anda - ".concat(reservationNo),
              html: htmlTicket
            }));

          case 18:
            return _context6.abrupt("return", res.json({
              status: "SUCCESS",
              message: "Ticket Issued & Email Sent"
            }));

          case 19:
            res.json({
              status: "OK"
            });
            _context6.next = 25;
            break;

          case 22:
            _context6.prev = 22;
            _context6.t0 = _context6["catch"](1);
            res.status(500).json({
              error: _context6.t0.message
            });

          case 25:
          case "end":
            return _context6.stop();
        }
      }
    }, null, null, [[1, 22]]);
  },
  // 7. BOOKING DETAIL
  bookingDetail: function bookingDetail(req, res) {
    var token, b, payload, response;
    return regeneratorRuntime.async(function bookingDetail$(_context7) {
      while (1) {
        switch (_context7.prev = _context7.next) {
          case 0:
            _context7.prev = 0;
            _context7.next = 3;
            return regeneratorRuntime.awrap(getConsistentToken());

          case 3:
            token = _context7.sent;
            b = req.body;
            payload = {
              reservationNo: b.reservationNo,
              osRefNo: b.osRefNo,
              agentOsRef: b.agentOsRef,
              userID: USER_CONFIG.userID,
              accessToken: token
            };
            _context7.next = 8;
            return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingDetail"), payload, {
              httpsAgent: agent
            }));

          case 8:
            response = _context7.sent;
            res.json(response.data);
            _context7.next = 15;
            break;

          case 12:
            _context7.prev = 12;
            _context7.t0 = _context7["catch"](0);
            res.status(500).json({
              status: "ERROR",
              respMessage: _context7.t0.message
            });

          case 15:
          case "end":
            return _context7.stop();
        }
      }
    }, null, null, [[0, 12]]);
  },
  // 8. IMAGES
  // Endpoint untuk Gambar Hotel / Logo
  getHotelImage: function getHotelImage(req, res) {
    var id, response;
    return regeneratorRuntime.async(function getHotelImage$(_context8) {
      while (1) {
        switch (_context8.prev = _context8.next) {
          case 0:
            _context8.prev = 0;
            id = req.query.id;

            if (id) {
              _context8.next = 4;
              break;
            }

            return _context8.abrupt("return", res.status(400).send('ID is required'));

          case 4:
            _context8.next = 6;
            return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/Image?id=").concat(id), {
              httpsAgent: agent,
              responseType: 'arraybuffer'
            }));

          case 6:
            response = _context8.sent;
            res.set('Content-Type', 'image/jpeg');
            res.send(response.data);
            _context8.next = 14;
            break;

          case 11:
            _context8.prev = 11;
            _context8.t0 = _context8["catch"](0);
            res.status(404).send('Hotel image not found');

          case 14:
          case "end":
            return _context8.stop();
        }
      }
    }, null, null, [[0, 11]]);
  },
  // Endpoint untuk Gambar Kamar
  getRoomImage: function getRoomImage(req, res) {
    var RoomID, response;
    return regeneratorRuntime.async(function getRoomImage$(_context9) {
      while (1) {
        switch (_context9.prev = _context9.next) {
          case 0:
            _context9.prev = 0;
            // Kita ambil RoomID dari query string
            RoomID = req.query.RoomID;

            if (RoomID) {
              _context9.next = 4;
              break;
            }

            return _context9.abrupt("return", res.status(400).send('RoomID is required'));

          case 4:
            _context9.next = 6;
            return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/RoomImage?RoomID=").concat(RoomID), {
              httpsAgent: agent,
              responseType: 'arraybuffer'
            }));

          case 6:
            response = _context9.sent;
            res.set('Content-Type', 'image/jpeg');
            res.send(response.data);
            _context9.next = 14;
            break;

          case 11:
            _context9.prev = 11;
            _context9.t0 = _context9["catch"](0);
            res.status(404).send('Room image not found');

          case 14:
          case "end":
            return _context9.stop();
        }
      }
    }, null, null, [[0, 11]]);
  }
};
module.exports = hotelController;