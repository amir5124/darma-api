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

var _require = require('../helpers/darmaSandbox'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger;

var puppeteer = require('puppeteer');

var nodemailer = require('nodemailer');

var db = require('../config/db'); // --- KONFIGURASI EMAIL ---


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
  var browser, page, paymentDate, formatDate, htmlContent, pdfBuffer;
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
          // Format tanggal Indonesia untuk waktu pembayaran
          paymentDate = new Date().toLocaleString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }); // Format tanggal Check-in & Check-out

          formatDate = function formatDate(dateStr) {
            return new Date(dateStr).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });
          };

          htmlContent = "\n    <html>\n    <head>\n        <style>\n            @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');\n            body { font-family: 'Open Sans', sans-serif; color: #444; margin: 0; padding: 40px; background: #fff; }\n            \n            /* Header Section */\n            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }\n            .logo-area { font-size: 28px; font-weight: 800; color: #24b3ae; }\n            .logo-dot { color: #e03f7d; }\n            .itinerary-info { text-align: right; }\n            .itinerary-label { display: block; background: #24b3ae; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 5px; }\n            .booked-by { font-size: 11px; color: #888; }\n\n            /* Paid Stamp */\n            .paid-badge { \n                float: right; width: 80px; height: 80px; border: 5px solid #4CAF50; border-radius: 50%; \n                display: flex; align-items: center; justify-content: center; color: #4CAF50; \n                font-weight: 900; font-size: 20px; transform: rotate(-20deg); opacity: 0.8;\n                margin-top: -10px; margin-right: 20px;\n            }\n\n            /* Section Styling */\n            .section-header { \n                color: #24b3ae; font-size: 16px; font-weight: 700; \n                border-bottom: 2px solid #f0f0f0; margin: 25px 0 10px 0; padding-bottom: 5px; \n            }\n            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }\n            .info-item label { display: block; font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 3px; }\n            .info-item span { font-size: 13px; font-weight: 600; color: #333; }\n\n            /* Table Styling */\n            table { width: 100%; border-collapse: collapse; margin-top: 15px; }\n            th { background: #f8f8f8; color: #24b3ae; text-align: left; padding: 12px; font-size: 12px; border-bottom: 1px solid #eee; }\n            td { padding: 15px 12px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }\n            .product-type { font-weight: 700; color: #e03f7d; }\n            \n            /* Footer/Total Area */\n            .summary-container { margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 15px; }\n            .total-row { display: flex; justify-content: flex-end; align-items: center; padding: 5px 0; }\n            .total-label { font-size: 14px; font-weight: 600; margin-right: 20px; }\n            .total-amount { font-size: 22px; font-weight: 800; color: #e03f7d; }\n            \n            .footer-note { font-size: 10px; color: #aaa; margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }\n        </style>\n    </head>\n    <body>\n      <div class=\"header\">\n    <div class=\"logo-area\">\n        <img src=\"https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png\" \n             height=\"50\" \n             style=\"margin-bottom: 10px; display: block;\">\n        \n        <div style=\"font-size: 12px; color: #555; line-height: 1.5;\">\n            <div class=\"powered-by\">Powered by Darmawisata Indonesia</div>\n            <div class=\"booked-by-new\">Dipesan dan dibayar oleh Darmawisata Indonesia</div>\n        </div>\n    </div>\n\n    <div class=\"itinerary-info\">\n        <span class=\"itinerary-label\">Itinerary ID: ".concat(data.reservationNo, "</span>\n    </div>\n</div>\n\n        <div class=\"paid-badge\">PAID</div>\n\n        <div class=\"section-header\">Detail Kontak</div>\n        <div class=\"info-grid\">\n            <div class=\"info-item\">\n                <label>Nama Pengambil</label>\n                <span>").concat(paxes[0].title, " ").concat(paxes[0].firstName, " ").concat(paxes[0].lastName, "</span>\n            </div>\n            <div class=\"info-item\">\n                <label>Alamat Email</label>\n                <span>").concat(data.contactEmail, "</span>\n            </div>\n            <div class=\"info-item\">\n                <label>Nomor Telepon</label>\n                <span>").concat(data.contactPhone, "</span>\n            </div>\n        </div>\n\n        <div class=\"section-header\">Detail Pembayaran</div>\n        <div class=\"info-grid\">\n            <div class=\"info-item\">\n                <label>Waktu Pembayaran</label>\n                <span>").concat(paymentDate, "</span>\n            </div>\n            <div class=\"info-item\">\n                <label>Metode Pembayaran</label>\n                <span>Koin Aplikasi</span>\n            </div>\n            <div class=\"info-item\">\n                <label>Status</label>\n                <span style=\"color: #4CAF50;\">Sukses</span>\n            </div>\n        </div>\n\n        <table>\n            <thead>\n                <tr>\n                    <th width=\"5%\">No</th>\n                    <th width=\"15%\">Jenis Produk</th>\n                    <th width=\"55%\">Deskripsi</th>\n                    <th width=\"25%\" style=\"text-align: right;\">Jumlah Total</th>\n                </tr>\n            </thead>\n            <tbody>\n                <tr>\n                    <td>1</td>\n                    <td class=\"product-type\">Hotel</td>\n                    <td>\n                        <div style=\"font-weight: 700; font-size: 14px; margin-bottom: 5px;\">").concat(data.hotelName, "</div>\n                        <div style=\"color: #666; margin-bottom: 10px;\">").concat(data.roomName, "</div>\n                        <div style=\"display: flex; gap: 20px;\">\n                            <div><small style=\"color:#999\">CHECK-IN</small><br><b>").concat(formatDate(data.checkInDate), "</b></div>\n                            <div><small style=\"color:#999\">DURASI</small><br><b>1 Kamar</b></div>\n                        </div>\n                    </td>\n                    <td style=\"text-align: right; font-weight: 700;\">\n                        IDR ").concat(Number(data.totalPrice).toLocaleString('id-ID'), "\n                    </td>\n                </tr>\n            </tbody>\n        </table>\n\n        <div class=\"summary-container\">\n            <div class=\"total-row\">\n                <div class=\"total-label\">Biaya Administrasi</div>\n                <div style=\"width: 150px; text-align: right; font-weight: 600; color: #4CAF50;\">GRATIS</div>\n            </div>\n            <div class=\"total-row\" style=\"margin-top: 10px;\">\n                <div class=\"total-label\" style=\"font-size: 16px;\">Total Pembayaran</div>\n                <div class=\"total-amount\" style=\"width: 180px; text-align: right;\">\n                    IDR ").concat(Number(data.totalPrice).toLocaleString('id-ID'), "\n                </div>\n            </div>\n        </div>\n\n        <div class=\"footer-note\">\n            Bukti transaksi ini sah dan dihasilkan secara otomatis oleh sistem LinkU Travel.<br>\n            Silakan hubungi Customer Care kami jika Anda memiliki pertanyaan mengenai pesanan ini.\n        </div>\n    </body>\n    </html>");
          _context.next = 11;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 11:
          _context.next = 13;
          return regeneratorRuntime.awrap(page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              top: '20px',
              bottom: '20px',
              left: '20px',
              right: '20px'
            }
          }));

        case 13:
          pdfBuffer = _context.sent;
          _context.next = 16;
          return regeneratorRuntime.awrap(browser.close());

        case 16:
          return _context.abrupt("return", pdfBuffer);

        case 17:
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
}); // POST /api/hotels/search-by-name

router.post('/search-by-name', function _callee2(req, res) {
  var token, hotelName, payload, response, resData;
  return regeneratorRuntime.async(function _callee2$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.prev = 0;
          _context3.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context3.sent;
          hotelName = req.body.hotelName;

          if (!(!hotelName || hotelName.trim().length < 2)) {
            _context3.next = 7;
            break;
          }

          return _context3.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: "hotelName minimal 2 karakter."
          }));

        case 7:
          payload = {
            hotelNameFilter: hotelName.trim(),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_SEARCH_BY_NAME", JSON.stringify(payload));
          _context3.next = 11;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/HotelList5"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }));

        case 11:
          response = _context3.sent;
          resData = response.data;
          logger.debug("RES_HOTEL_SEARCH_BY_NAME", JSON.stringify(resData)); // Kembalikan raw response dulu agar kita bisa lihat strukturnya

          return _context3.abrupt("return", res.json(resData));

        case 17:
          _context3.prev = 17;
          _context3.t0 = _context3["catch"](0);
          logger.error("Search By Name Error: " + _context3.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context3.t0.message
          });

        case 21:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[0, 17]]);
}); // 2. HOTEL AVAILABLE ROOMS

router.post('/available-rooms', function _callee3(req, res) {
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

          _context4.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/AvailableRooms5"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context4.sent;
          logger.debug("RES_HOTEL_ROOMS_5", response.data);
          res.json(response.data);
          _context4.next = 18;
          break;

        case 14:
          _context4.prev = 14;
          _context4.t0 = _context4["catch"](0);
          logger.error("Hotel Available Rooms Error: " + _context4.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context4.t0.message
          });

        case 18:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[0, 14]]);
}); // 3. HOTEL PRICE AND POLICY INFO

router.post('/price-info', function _callee4(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee4$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          _context5.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context5.sent;
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
          _context5.next = 8;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), payload, {
            httpsAgent: agent
          }));

        case 8:
          response = _context5.sent;
          res.json(response.data);
          _context5.next = 15;
          break;

        case 12:
          _context5.prev = 12;
          _context5.t0 = _context5["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context5.t0.message
          });

        case 15:
        case "end":
          return _context5.stop();
      }
    }
  }, null, null, [[0, 12]]);
}); // Endpoint Gambar Hotel (Utama)

router.get('/image', function _callee5(req, res) {
  var id, response;
  return regeneratorRuntime.async(function _callee5$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.prev = 0;
          id = req.query.id; // required

          _context6.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/Image?id=").concat(id), {
            httpsAgent: agent,
            responseType: 'arraybuffer' // Karena API mengembalikan stream gambar

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
          res.status(404).send('Image not found');

        case 12:
        case "end":
          return _context6.stop();
      }
    }
  }, null, null, [[0, 9]]);
}); // Endpoint Gambar Kamar

router.get('/room-image', function _callee6(req, res) {
  var RoomID, response;
  return regeneratorRuntime.async(function _callee6$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          _context7.prev = 0;
          RoomID = req.query.RoomID; // required

          _context7.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/RoomImage?RoomID=").concat(RoomID), {
            httpsAgent: agent,
            responseType: 'arraybuffer'
          }));

        case 4:
          response = _context7.sent;
          res.set('Content-Type', 'image/jpeg');
          res.send(response.data);
          _context7.next = 12;
          break;

        case 9:
          _context7.prev = 9;
          _context7.t0 = _context7["catch"](0);
          res.status(404).send('Room image not found');

        case 12:
        case "end":
          return _context7.stop();
      }
    }
  }, null, null, [[0, 9]]);
});
router.post('/booking', function _callee8(req, res) {
  var connection, token, b, username, payload, response, resData, isProcessed, _ref, _ref2, bookingResult, newBookingId, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, room, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, pax;

  return regeneratorRuntime.async(function _callee8$(_context9) {
    while (1) {
      switch (_context9.prev = _context9.next) {
        case 0:
          _context9.prev = 0;
          _context9.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context9.sent;
          b = req.body; // ✅ TAMBAHAN: Ambil username dari request body

          username = b.username || "guest"; // 1. Konstruksi Payload untuk Supplier

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
            agentOsRef: b.agentOsRef || "LC-".concat(Date.now()),
            userID: USER_CONFIG.userID,
            accessToken: token
          }; // 2. Kirim ke Supplier

          logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
          _context9.next = 10;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }));

        case 10:
          response = _context9.sent;
          resData = response.data;
          logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData)); // 3. Cek Status

          isProcessed = resData.status === "ERROR" && resData.respMessage && resData.respMessage.includes("PROCESSED");

          if (!(resData.status === "SUCCESS" || resData.bookingStatus === "Accept" || isProcessed)) {
            _context9.next = 83;
            break;
          }

          if (isProcessed) {
            resData.status = "SUCCESS";
            resData.reservationNo = resData.reservationNo || "PROCESSED-" + Date.now();
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context9.next = 18;
          return regeneratorRuntime.awrap(db.getConnection());

        case 18:
          connection = _context9.sent;
          _context9.next = 21;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 21:
          _context9.next = 23;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_bookings \n                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, \n                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, \n                contact_email, contact_phone, total_price, booking_status, username) \n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [resData.reservationNo, resData.voucherNo, resData.osRefNo, payload.agentOsRef, resData.hotelID || b.hotelID, resData.hotelName || "Hotel", resData.hotelAddress || "", b.internalCode, resData.checkInDate, resData.checkOutDate, b.cityID, b.roomID, resData.roomName || b.roomName, b.breakfast, b.roomRequest[0].email, b.roomRequest[0].phone, resData.totalPrice || 0, 'Accept', username // ✅ TAMBAHAN
          ]));

        case 23:
          _ref = _context9.sent;
          _ref2 = _slicedToArray(_ref, 1);
          bookingResult = _ref2[0];
          newBookingId = bookingResult.insertId; // 5. Simpan Tamu

          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context9.prev = 30;
          _iterator = b.roomRequest[Symbol.iterator]();

        case 32:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context9.next = 63;
            break;
          }

          room = _step.value;
          _iteratorNormalCompletion2 = true;
          _didIteratorError2 = false;
          _iteratorError2 = undefined;
          _context9.prev = 37;
          _iterator2 = room.paxes[Symbol.iterator]();

        case 39:
          if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
            _context9.next = 46;
            break;
          }

          pax = _step2.value;
          _context9.next = 43;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) \n                        VALUES (?, 'ADULT', ?, ?, ?)", [newBookingId, pax.title, pax.firstName, pax.lastName]));

        case 43:
          _iteratorNormalCompletion2 = true;
          _context9.next = 39;
          break;

        case 46:
          _context9.next = 52;
          break;

        case 48:
          _context9.prev = 48;
          _context9.t0 = _context9["catch"](37);
          _didIteratorError2 = true;
          _iteratorError2 = _context9.t0;

        case 52:
          _context9.prev = 52;
          _context9.prev = 53;

          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }

        case 55:
          _context9.prev = 55;

          if (!_didIteratorError2) {
            _context9.next = 58;
            break;
          }

          throw _iteratorError2;

        case 58:
          return _context9.finish(55);

        case 59:
          return _context9.finish(52);

        case 60:
          _iteratorNormalCompletion = true;
          _context9.next = 32;
          break;

        case 63:
          _context9.next = 69;
          break;

        case 65:
          _context9.prev = 65;
          _context9.t1 = _context9["catch"](30);
          _didIteratorError = true;
          _iteratorError = _context9.t1;

        case 69:
          _context9.prev = 69;
          _context9.prev = 70;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 72:
          _context9.prev = 72;

          if (!_didIteratorError) {
            _context9.next = 75;
            break;
          }

          throw _iteratorError;

        case 75:
          return _context9.finish(72);

        case 76:
          return _context9.finish(69);

        case 77:
          _context9.next = 79;
          return regeneratorRuntime.awrap(connection.commit());

        case 79:
          // 6. Worker PDF & Email (Async)
          (function _callee7() {
            var pdfData, pdfBuffer;
            return regeneratorRuntime.async(function _callee7$(_context8) {
              while (1) {
                switch (_context8.prev = _context8.next) {
                  case 0:
                    _context8.prev = 0;
                    pdfData = {
                      reservationNo: resData.reservationNo,
                      hotelName: resData.hotelName || "Hotel",
                      roomName: resData.roomName || "Room",
                      totalPrice: resData.totalPrice || 0,
                      contactEmail: b.roomRequest[0].email,
                      contactPhone: b.roomRequest[0].phone,
                      checkInDate: resData.checkInDate
                    };
                    _context8.next = 4;
                    return regeneratorRuntime.awrap(generateBookingPDF(pdfData, b.roomRequest[0].paxes));

                  case 4:
                    pdfBuffer = _context8.sent;
                    _context8.next = 7;
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
                    _context8.next = 13;
                    break;

                  case 10:
                    _context8.prev = 10;
                    _context8.t0 = _context8["catch"](0);
                    logger.error("Worker PDF/Email Error: " + _context8.t0.message);

                  case 13:
                  case "end":
                    return _context8.stop();
                }
              }
            }, null, null, [[0, 10]]);
          })(); // 7. Response Sukses


          return _context9.abrupt("return", res.json(_objectSpread({
            status: "SUCCESS",
            booking_id: newBookingId,
            username: username
          }, resData)));

        case 83:
          return _context9.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: resData.respMessage || "Gagal melakukan booking."
          }));

        case 84:
          _context9.next = 93;
          break;

        case 86:
          _context9.prev = 86;
          _context9.t2 = _context9["catch"](0);

          if (!connection) {
            _context9.next = 91;
            break;
          }

          _context9.next = 91;
          return regeneratorRuntime.awrap(connection.rollback());

        case 91:
          logger.error("Final Booking Error: " + _context9.t2.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context9.t2.message
          });

        case 93:
          _context9.prev = 93;
          if (connection) connection.release();
          return _context9.finish(93);

        case 96:
        case "end":
          return _context9.stop();
      }
    }
  }, null, null, [[0, 86, 93, 96], [30, 65, 69, 77], [37, 48, 52, 60], [53,, 55, 59], [70,, 72, 76]]);
}); // 5. HOTEL BOOKING DETAIL

router.post('/booking-detail', function _callee9(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee9$(_context10) {
    while (1) {
      switch (_context10.prev = _context10.next) {
        case 0:
          _context10.prev = 0;
          _context10.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context10.sent;
          b = req.body;
          payload = {
            reservationNo: b.reservationNo,
            osRefNo: b.osRefNo,
            agentOsRef: b.agentOsRef,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_DETAIL", payload);
          _context10.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingDetail"), payload, {
            httpsAgent: agent
          }));

        case 9:
          response = _context10.sent;
          logger.debug("RES_HOTEL_DETAIL", response.data);
          res.json(response.data);
          _context10.next = 17;
          break;

        case 14:
          _context10.prev = 14;
          _context10.t0 = _context10["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context10.t0.message
          });

        case 17:
        case "end":
          return _context10.stop();
      }
    }
  }, null, null, [[0, 14]]);
});
module.exports = router;