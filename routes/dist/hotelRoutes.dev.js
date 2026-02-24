"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// routes/hotelRoutes.js
var express = require('express');

var router = express.Router();

var axios = require('axios');

var _require = require('../helpers/darmaHelper'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger;

var puppeteer = require('puppeteer'); // --- KONFIGURASI EMAIL ---


var transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'linkutransport@gmail.com',
    pass: 'qbckptzxgdumxtdm'
  }
});

function generateBookingPDF(data, paxes) {
  var browser, page, paymentDate, htmlContent, pdfBuffer;
  return regeneratorRuntime.async(function generateBookingPDF$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.next = 2;
          return regeneratorRuntime.awrap(puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox']
          }));

        case 2:
          browser = _context.sent;
          _context.next = 5;
          return regeneratorRuntime.awrap(browser.newPage());

        case 5:
          page = _context.sent;
          // Format tanggal Indonesia
          paymentDate = new Date().toLocaleString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }); // Template HTML mirip strukur gambar Tiket.com

          htmlContent = "\n    <html>\n    <head>\n        <style>\n            body { font-family: Arial, sans-serif; color: #333; margin: 40px; }\n            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0070BA; padding-bottom: 10px; }\n            .logo { font-size: 24px; font-weight: bold; color: #0070BA; }\n            .itinerary-id { background: #f0f0f0; padding: 5px 10px; border-radius: 5px; font-size: 12px; }\n            .section-title { font-weight: bold; border-bottom: 1px solid #ccc; margin-top: 20px; padding-bottom: 5px; }\n            .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 12px; }\n            .paid-stamp { float: right; color: #4CAF50; border: 4px solid #4CAF50; padding: 10px; border-radius: 50%; font-weight: bold; transform: rotate(-15deg); }\n            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }\n            th { text-align: left; border-bottom: 1px solid #eee; padding: 10px; background: #fafafa; }\n            td { padding: 10px; border-bottom: 1px solid #eee; }\n            .total-box { background: #fff8e1; padding: 15px; text-align: right; margin-top: 10px; font-weight: bold; }\n        </style>\n    </head>\n    <body>\n        <div class=\"header\">\n            <div class=\"logo\">tiket<span style=\"color: #FFC107;\">\u25CF</span>com</div>\n            <div class=\"itinerary-id\">Itinerary ID: <b>".concat(data.reservationNo, "</b></div>\n        </div>\n        \n        <div class=\"paid-stamp\">PAID</div>\n\n        <div class=\"section-title\">Detail Kontak</div>\n        <div class=\"grid\">\n            <div>Nama: <br><b>").concat(paxes[0].title, " ").concat(paxes[0].firstName, " ").concat(paxes[0].lastName, "</b></div>\n            <div>Alamat Email: <br><b>").concat(data.contactEmail, "</b></div>\n            <div>Nomor Telepon: <br><b>").concat(data.contactPhone, "</b></div>\n        </div>\n\n        <div class=\"section-title\">Detail Pembayaran</div>\n        <div class=\"grid\">\n            <div>Waktu Pembayaran: <br><b>").concat(paymentDate, "</b></div>\n            <div>Metode Pembayaran: <br><b>LinkU Wallet / VA</b></div>\n        </div>\n\n        <table>\n            <thead>\n                <tr>\n                    <th>No</th>\n                    <th>Jenis Produk</th>\n                    <th>Deskripsi</th>\n                    <th>Jumlah Total</th>\n                </tr>\n            </thead>\n            <tbody>\n                <tr>\n                    <td>1</td>\n                    <td>Hotel</td>\n                    <td><b>").concat(data.hotelName, "</b><br>").concat(data.roomName, "<br>Check-in: ").concat(data.checkInDate.split('T')[0], "</td>\n                    <td>IDR ").concat(Number(data.totalPrice).toLocaleString('id-ID'), "</td>\n                </tr>\n            </tbody>\n        </table>\n\n        <div class=\"total-box\">\n            Total Pembayaran: <span style=\"color: #f57c00; font-size: 18px;\">IDR ").concat(Number(data.totalPrice).toLocaleString('id-ID'), "</span>\n        </div>\n    </body>\n    </html>");
          _context.next = 10;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 10:
          _context.next = 12;
          return regeneratorRuntime.awrap(page.pdf({
            format: 'A4',
            printBackground: true
          }));

        case 12:
          pdfBuffer = _context.sent;
          _context.next = 15;
          return regeneratorRuntime.awrap(browser.close());

        case 15:
          return _context.abrupt("return", pdfBuffer);

        case 16:
        case "end":
          return _context.stop();
      }
    }
  });
} // 1. HOTEL SEARCH


router.post('/search', function _callee(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          _context2.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context2.sent;
          b = req.body; // Payload disesuaikan persis dengan contoh request Anda

          payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,
            // Contoh: "2023-01-01T14:00:00Z"
            checkOutDate: b.checkOutDate,
            // Contoh: "2023-01-02T12:00:00Z"
            roomRequest: b.roomRequest.map(function (room) {
              return {
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Sesuai permintaan: [0]

              };
            }),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_SEARCH5", payload); // Endpoint diganti menjadi Search5 sesuai instruksi

          _context2.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/Search5"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context2.sent;
          logger.debug("RES_HOTEL_SEARCH5", response.data);
          res.json(response.data);
          _context2.next = 18;
          break;

        case 14:
          _context2.prev = 14;
          _context2.t0 = _context2["catch"](0);
          logger.error("Hotel Search5 Error: " + _context2.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context2.t0.message
          });

        case 18:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 14]]);
}); // 2. HOTEL AVAILABLE ROOMS

router.post('/available-rooms', function _callee2(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee2$(_context3) {
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
            hotelID: b.hotelID,
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            // Pastikan roomRequest dipetakan dengan benar sesuai standar strict
            roomRequest: b.roomRequest.map(function (room) {
              return {
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Mengikuti standar [0] jika childNum 0

              };
            }),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_ROOMS_5", payload); // Perhatikan URL: Gunakan /Hotel/AvailableRoom5 jika mengikuti standar Search5

          _context3.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/AvailableRooms5"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context3.sent;
          logger.debug("RES_HOTEL_ROOMS_5", response.data);
          res.json(response.data);
          _context3.next = 18;
          break;

        case 14:
          _context3.prev = 14;
          _context3.t0 = _context3["catch"](0);
          logger.error("Hotel Available Rooms Error: " + _context3.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context3.t0.message
          });

        case 18:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[0, 14]]);
}); // 3. HOTEL PRICE AND POLICY INFO

router.post('/price-info', function _callee3(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee3$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.prev = 0;
          _context4.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context4.sent;
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
          _context4.next = 8;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), payload, {
            httpsAgent: agent
          }));

        case 8:
          response = _context4.sent;
          res.json(response.data);
          _context4.next = 15;
          break;

        case 12:
          _context4.prev = 12;
          _context4.t0 = _context4["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context4.t0.message
          });

        case 15:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[0, 12]]);
}); // Endpoint Gambar Hotel (Utama)

router.get('/image', function _callee4(req, res) {
  var id, response;
  return regeneratorRuntime.async(function _callee4$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          id = req.query.id; // required

          _context5.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/Image?id=").concat(id), {
            httpsAgent: agent,
            responseType: 'arraybuffer' // Karena API mengembalikan stream gambar

          }));

        case 4:
          response = _context5.sent;
          res.set('Content-Type', 'image/jpeg');
          res.send(response.data);
          _context5.next = 12;
          break;

        case 9:
          _context5.prev = 9;
          _context5.t0 = _context5["catch"](0);
          res.status(404).send('Image not found');

        case 12:
        case "end":
          return _context5.stop();
      }
    }
  }, null, null, [[0, 9]]);
}); // Endpoint Gambar Kamar

router.get('/room-image', function _callee5(req, res) {
  var RoomID, response;
  return regeneratorRuntime.async(function _callee5$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.prev = 0;
          RoomID = req.query.RoomID; // required

          _context6.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/RoomImage?RoomID=").concat(RoomID), {
            httpsAgent: agent,
            responseType: 'arraybuffer'
          }));

        case 4:
          response = _context6.sent;
          res.set('Content-Type', 'image/jpeg');
          res.send(response.data);
          _context6.next = 12;
          break;

        case 9:
          _context6.prev = 9;
          _context6.t0 = _context6["catch"](0);
          res.status(404).send('Room image not found');

        case 12:
        case "end":
          return _context6.stop();
      }
    }
  }, null, null, [[0, 9]]);
}); // 4. HOTEL BOOKING ALL SUPPLIER
// 4. HOTEL BOOKING ALL SUPPLIER

router.post('/booking', function _callee7(req, res) {
  var connection, token, b, payload, response, resData, isProcessed, _ref, _ref2, bookingResult, newBookingId, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, room, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, pax;

  return regeneratorRuntime.async(function _callee7$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          _context8.prev = 0;
          _context8.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context8.sent;
          b = req.body; // 1. Konstruksi Payload untuk Supplier

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
                specialRequestArray: null,
                requestDescription: room.requestDescription || null,
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || []
              };
            }),
            internalCode: b.internalCode,
            hotelID: b.hotelID,
            breakfast: b.breakfast,
            roomID: b.roomID,
            bedType: {
              ID: "",
              bed: ""
            },
            // Gunakan string kosong untuk menghindari error null
            agentOsRef: b.agentOsRef || "LC-".concat(Date.now()),
            userID: USER_CONFIG.userID,
            accessToken: token
          }; // 2. Kirim ke Supplier

          logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
          _context8.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000 // Timeout lebih lama untuk booking

          }));

        case 9:
          response = _context8.sent;
          resData = response.data;
          logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData)); // 3. Cek Status (Success, Accept, atau Processed)

          isProcessed = resData.status === "ERROR" && resData.respMessage && resData.respMessage.includes("PROCESSED");

          if (!(resData.status === "SUCCESS" || resData.bookingStatus === "Accept" || isProcessed)) {
            _context8.next = 82;
            break;
          }

          // Handle jika status PROCESSED (Ubah ke sukses agar bisa simpan DB)
          if (isProcessed) {
            resData.status = "SUCCESS";
            resData.reservationNo = resData.reservationNo || "PROCESSED-" + Date.now();
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context8.next = 17;
          return regeneratorRuntime.awrap(db.getConnection());

        case 17:
          connection = _context8.sent;
          _context8.next = 20;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 20:
          _context8.next = 22;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_bookings \n                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, \n                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, \n                contact_email, contact_phone, total_price, booking_status) \n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [resData.reservationNo, resData.voucherNo, resData.osRefNo, payload.agentOsRef, resData.hotelID || b.hotelID, resData.hotelName || "Hotel", resData.hotelAddress || "", b.internalCode, resData.checkInDate, resData.checkOutDate, b.cityID, b.roomID, resData.roomName || b.roomName, b.breakfast, b.roomRequest[0].email, b.roomRequest[0].phone, resData.totalPrice || 0, 'Accept']));

        case 22:
          _ref = _context8.sent;
          _ref2 = _slicedToArray(_ref, 1);
          bookingResult = _ref2[0];
          newBookingId = bookingResult.insertId; // 5. Simpan Tamu (hotel_booking_paxes)

          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context8.prev = 29;
          _iterator = b.roomRequest[Symbol.iterator]();

        case 31:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context8.next = 62;
            break;
          }

          room = _step.value;
          _iteratorNormalCompletion2 = true;
          _didIteratorError2 = false;
          _iteratorError2 = undefined;
          _context8.prev = 36;
          _iterator2 = room.paxes[Symbol.iterator]();

        case 38:
          if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
            _context8.next = 45;
            break;
          }

          pax = _step2.value;
          _context8.next = 42;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) \n                        VALUES (?, 'ADULT', ?, ?, ?)", [newBookingId, pax.title, pax.firstName, pax.lastName]));

        case 42:
          _iteratorNormalCompletion2 = true;
          _context8.next = 38;
          break;

        case 45:
          _context8.next = 51;
          break;

        case 47:
          _context8.prev = 47;
          _context8.t0 = _context8["catch"](36);
          _didIteratorError2 = true;
          _iteratorError2 = _context8.t0;

        case 51:
          _context8.prev = 51;
          _context8.prev = 52;

          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }

        case 54:
          _context8.prev = 54;

          if (!_didIteratorError2) {
            _context8.next = 57;
            break;
          }

          throw _iteratorError2;

        case 57:
          return _context8.finish(54);

        case 58:
          return _context8.finish(51);

        case 59:
          _iteratorNormalCompletion = true;
          _context8.next = 31;
          break;

        case 62:
          _context8.next = 68;
          break;

        case 64:
          _context8.prev = 64;
          _context8.t1 = _context8["catch"](29);
          _didIteratorError = true;
          _iteratorError = _context8.t1;

        case 68:
          _context8.prev = 68;
          _context8.prev = 69;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 71:
          _context8.prev = 71;

          if (!_didIteratorError) {
            _context8.next = 74;
            break;
          }

          throw _iteratorError;

        case 74:
          return _context8.finish(71);

        case 75:
          return _context8.finish(68);

        case 76:
          _context8.next = 78;
          return regeneratorRuntime.awrap(connection.commit());

        case 78:
          // 6. Jalankan Worker PDF & Email (Async agar response cepat)
          (function _callee6() {
            var pdfData, pdfBuffer;
            return regeneratorRuntime.async(function _callee6$(_context7) {
              while (1) {
                switch (_context7.prev = _context7.next) {
                  case 0:
                    _context7.prev = 0;
                    pdfData = {
                      reservationNo: resData.reservationNo,
                      hotelName: resData.hotelName || "Hotel",
                      roomName: resData.roomName || "Room",
                      totalPrice: resData.totalPrice || 0,
                      contactEmail: b.roomRequest[0].email,
                      contactPhone: b.roomRequest[0].phone,
                      checkInDate: resData.checkInDate
                    };
                    _context7.next = 4;
                    return regeneratorRuntime.awrap(generateBookingPDF(pdfData, b.roomRequest[0].paxes));

                  case 4:
                    pdfBuffer = _context7.sent;
                    _context7.next = 7;
                    return regeneratorRuntime.awrap(transporter.sendMail({
                      from: '"LinkU Travel" <linkutransport@gmail.com>',
                      to: b.roomRequest[0].email,
                      subject: "E-Tiket Hotel - ".concat(resData.reservationNo),
                      html: "<h3>Halo ".concat(b.roomRequest[0].paxes[0].firstName, ",</h3>\n                               <p>Booking Anda berhasil diproses. Terlampir adalah e-tiket hotel Anda.</p>"),
                      attachments: [{
                        filename: "E-Tiket-".concat(resData.reservationNo, ".pdf"),
                        content: pdfBuffer
                      }]
                    }));

                  case 7:
                    logger.info("Email PDF terkirim ke: ".concat(b.roomRequest[0].email));
                    _context7.next = 13;
                    break;

                  case 10:
                    _context7.prev = 10;
                    _context7.t0 = _context7["catch"](0);
                    logger.error("Worker PDF/Email Error: " + _context7.t0.message);

                  case 13:
                  case "end":
                    return _context7.stop();
                }
              }
            }, null, null, [[0, 10]]);
          })(); // 7. Kirim Response Sukses ke Frontend


          return _context8.abrupt("return", res.json(_objectSpread({
            status: "SUCCESS",
            booking_id: newBookingId
          }, resData)));

        case 82:
          return _context8.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: resData.respMessage || "Gagal melakukan booking."
          }));

        case 83:
          _context8.next = 92;
          break;

        case 85:
          _context8.prev = 85;
          _context8.t2 = _context8["catch"](0);

          if (!connection) {
            _context8.next = 90;
            break;
          }

          _context8.next = 90;
          return regeneratorRuntime.awrap(connection.rollback());

        case 90:
          logger.error("Final Booking Error: " + _context8.t2.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context8.t2.message
          });

        case 92:
          _context8.prev = 92;
          if (connection) connection.release();
          return _context8.finish(92);

        case 95:
        case "end":
          return _context8.stop();
      }
    }
  }, null, null, [[0, 85, 92, 95], [29, 64, 68, 76], [36, 47, 51, 59], [52,, 54, 58], [69,, 71, 75]]);
}); // 5. HOTEL BOOKING DETAIL

router.post('/booking-detail', function _callee8(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee8$(_context9) {
    while (1) {
      switch (_context9.prev = _context9.next) {
        case 0:
          _context9.prev = 0;
          _context9.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context9.sent;
          b = req.body;
          payload = {
            reservationNo: b.reservationNo,
            osRefNo: b.osRefNo,
            agentOsRef: b.agentOsRef,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_DETAIL", payload);
          _context9.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingDetail"), payload, {
            httpsAgent: agent
          }));

        case 9:
          response = _context9.sent;
          logger.debug("RES_HOTEL_DETAIL", response.data);
          res.json(response.data);
          _context9.next = 17;
          break;

        case 14:
          _context9.prev = 14;
          _context9.t0 = _context9["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context9.t0.message
          });

        case 17:
        case "end":
          return _context9.stop();
      }
    }
  }, null, null, [[0, 14]]);
});
module.exports = router;