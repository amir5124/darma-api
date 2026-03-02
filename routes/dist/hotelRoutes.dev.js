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
  var browser, page, totalHargaFisik, totalFormatted, paymentDate, formatDate, namaTamu, noTelp, htmlContent, pdfBuffer;
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
          // 1. Perbaikan Pembulatan Harga (Tanpa dibagi 1000 agar angka tetap utuh)
          // Math.ceil digunakan untuk membulatkan ke atas sesuai permintaan Anda (250238.66 -> 250239)
          totalHargaFisik = Math.ceil(Number(data.totalPrice || 0));
          totalFormatted = totalHargaFisik.toLocaleString('id-ID'); // 2. Format Tanggal Indonesia untuk Waktu Pembayaran

          paymentDate = new Date().toLocaleString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }); // 3. Format Tanggal Check-in

          formatDate = function formatDate(dateStr) {
            if (!dateStr) return "-";
            return new Date(dateStr).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });
          }; // 4. Penanganan data Undefined untuk Nama dan Telepon


          namaTamu = paxes && paxes[0] ? "".concat(paxes[0].title || '', " ").concat(paxes[0].firstName || '', " ").concat(paxes[0].lastName || '').trim() : "Guest";
          noTelp = data.contactPhone && data.contactPhone !== "undefined" ? data.contactPhone : "-";
          htmlContent = "\n    <html>\n    <head>\n        <style>\n            @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');\n            body { font-family: 'Open Sans', sans-serif; color: #444; margin: 0; padding: 40px; background: #fff; }\n            \n            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }\n            .itinerary-info { text-align: right; }\n            .itinerary-label { display: block; background: #24b3ae; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 5px; }\n\n            .paid-badge { \n                float: right; width: 80px; height: 80px; border: 5px solid #4CAF50; border-radius: 50%; \n                display: flex; align-items: center; justify-content: center; color: #4CAF50; \n                font-weight: 900; font-size: 20px; transform: rotate(-20deg); opacity: 0.8;\n                margin-top: -10px; margin-right: 20px;\n            }\n\n            .section-header { \n                color: #24b3ae; font-size: 16px; font-weight: 700; \n                border-bottom: 2px solid #f0f0f0; margin: 25px 0 10px 0; padding-bottom: 5px; \n            }\n            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }\n            .info-item label { display: block; font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 3px; }\n            .info-item span { font-size: 13px; font-weight: 600; color: #333; }\n\n            table { width: 100%; border-collapse: collapse; margin-top: 15px; }\n            th { background: #f8f8f8; color: #24b3ae; text-align: left; padding: 12px; font-size: 12px; border-bottom: 1px solid #eee; }\n            td { padding: 15px 12px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }\n            .product-type { font-weight: 700; color: #e03f7d; }\n            \n            .summary-container { margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 15px; }\n            .total-row { display: flex; justify-content: flex-end; align-items: center; padding: 5px 0; }\n            .total-label { font-size: 14px; font-weight: 600; margin-right: 20px; }\n            .total-amount { font-size: 22px; font-weight: 800; color: #e03f7d; }\n            \n            .footer-note { font-size: 10px; color: #aaa; margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }\n        </style>\n    </head>\n    <body>\n      <div class=\"header\">\n        <div class=\"logo-area\">\n            <img src=\"https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png\" \n                 height=\"50\" style=\"margin-bottom: 10px; display: block;\">\n            <div style=\"font-size: 12px; color: #555; line-height: 1.5;\">\n                <div>Powered by Darmawisata Indonesia</div>\n                <div>Dipesan dan dibayar oleh Darmawisata Indonesia</div>\n            </div>\n        </div>\n        <div class=\"itinerary-info\">\n            <span class=\"itinerary-label\">Itinerary ID: ".concat(data.reservationNo, "</span>\n        </div>\n      </div>\n\n      <div class=\"paid-badge\">PAID</div>\n\n      <div class=\"section-header\">Detail Kontak</div>\n      <div class=\"info-grid\">\n          <div class=\"info-item\">\n              <label>Nama Pengambil</label>\n              <span>").concat(namaTamu, "</span>\n          </div>\n          <div class=\"info-item\">\n              <label>Alamat Email</label>\n              <span>").concat(data.contactEmail || '-', "</span>\n          </div>\n          <div class=\"info-item\">\n              <label>Nomor Telepon</label>\n              <span>").concat(noTelp, "</span>\n          </div>\n      </div>\n\n      <div class=\"section-header\">Detail Pembayaran</div>\n      <div class=\"info-grid\">\n          <div class=\"info-item\">\n              <label>Waktu Pembayaran</label>\n              <span>").concat(paymentDate, "</span>\n          </div>\n          <div class=\"info-item\">\n              <label>Metode Pembayaran</label>\n              <span>Koin Aplikasi</span>\n          </div>\n          <div class=\"info-item\">\n              <label>Status</label>\n              <span style=\"color: #4CAF50;\">Sukses</span>\n          </div>\n      </div>\n\n      <table>\n          <thead>\n              <tr>\n                  <th width=\"5%\">No</th>\n                  <th width=\"15%\">Jenis Produk</th>\n                  <th width=\"55%\">Deskripsi</th>\n                  <th width=\"25%\" style=\"text-align: right;\">Jumlah Total</th>\n              </tr>\n          </thead>\n          <tbody>\n              <tr>\n                  <td>1</td>\n                  <td class=\"product-type\">Hotel</td>\n                  <td>\n                      <div style=\"font-weight: 700; font-size: 14px; margin-bottom: 5px;\">").concat(data.hotelName, "</div>\n                      <div style=\"color: #666; margin-bottom: 10px;\">").concat(data.roomName, "</div>\n                      <div style=\"display: flex; gap: 20px;\">\n                          <div><small style=\"color:#999\">CHECK-IN</small><br><b>").concat(formatDate(data.checkInDate), "</b></div>\n                          <div><small style=\"color:#999\">DURASI</small><br><b>1 Kamar</b></div>\n                      </div>\n                  </td>\n                  <td style=\"text-align: right; font-weight: 700;\">\n                     IDR ").concat(totalFormatted, "\n                  </td>\n              </tr>\n          </tbody>\n      </table>\n\n      <div class=\"summary-container\">\n          <div class=\"total-row\">\n              <div class=\"total-label\">Biaya Administrasi</div>\n              <div style=\"width: 150px; text-align: right; font-weight: 600; color: #4CAF50;\">GRATIS</div>\n          </div>\n          <div class=\"total-row\" style=\"margin-top: 10px;\">\n              <div class=\"total-label\" style=\"font-size: 16px;\">Total Pembayaran</div>\n              <div class=\"total-amount\" style=\"width: 180px; text-align: right;\">\n                  IDR ").concat(totalFormatted, "\n              </div>\n          </div>\n      </div>\n\n      <div class=\"footer-note\">\n          Bukti transaksi ini sah dan dihasilkan secara otomatis oleh sistem LinkU Travel.<br>\n          Silakan hubungi Customer Care kami jika Anda memiliki pertanyaan mengenai pesanan ini.\n      </div>\n    </body>\n    </html>");
          _context.next = 15;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 15:
          _context.next = 17;
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

        case 17:
          pdfBuffer = _context.sent;
          _context.next = 20;
          return regeneratorRuntime.awrap(browser.close());

        case 20:
          return _context.abrupt("return", pdfBuffer);

        case 21:
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
}); // 5. HOTEL BOOKING DETAIL

router.post('/booking-detail', function _callee7(req, res) {
  var connection, token, b, _ref, _ref2, localRows, localData, payload, response, resData, detail, cleanStatus, _ref3, _ref4, paxes, pdfData, pdfBuffer;

  return regeneratorRuntime.async(function _callee7$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          _context8.prev = 0;
          _context8.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context8.sent;
          b = req.body;
          _context8.next = 7;
          return regeneratorRuntime.awrap(db.getConnection());

        case 7:
          connection = _context8.sent;
          _context8.next = 10;
          return regeneratorRuntime.awrap(connection.execute("SELECT * FROM hotel_bookings WHERE reservation_no = ?", [b.reservationNo]));

        case 10:
          _ref = _context8.sent;
          _ref2 = _slicedToArray(_ref, 1);
          localRows = _ref2[0];

          if (!(localRows.length === 0)) {
            _context8.next = 15;
            break;
          }

          return _context8.abrupt("return", res.status(404).json({
            status: "ERROR",
            respMessage: "Booking tidak ditemukan di database lokal."
          }));

        case 15:
          localData = localRows[0]; // 2. Konstruksi Payload untuk Supplier
          // Jika di DB lokal masih "PRC-", kirim reservationNo KOSONG ke supplier
          // Supplier akan mengenali booking melalui osRefNo

          payload = {
            reservationNo: localData.reservation_no.startsWith("PRC-") ? "" : localData.reservation_no,
            osRefNo: String(localData.os_ref_no),
            agentOsRef: localData.agent_os_ref || "",
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("CHECK_DETAIL_PAYLOAD: " + JSON.stringify(payload));
          _context8.next = 20;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingDetail"), payload, {
            httpsAgent: agent
          }));

        case 20:
          response = _context8.sent;
          resData = response.data; // 3. LOGIKA UPDATE: Jika status di Supplier sudah 'Accept'

          if (!(resData.status === "SUCCESS" && resData.bookingDetail)) {
            _context8.next = 49;
            break;
          }

          detail = resData.bookingDetail;
          cleanStatus = (detail.bookingStatus || "").trim(); // Jika status sekarang 'Accept' dan sebelumnya di lokal masih 'Processed' (atau nomor masih PRC-)

          if (!(cleanStatus === "Accept")) {
            _context8.next = 49;
            break;
          }

          _context8.next = 28;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?", [localData.id]));

        case 28:
          _ref3 = _context8.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];
          pdfData = {
            reservationNo: detail.reservationNo,
            // Nomor ASLI (DI2026...)
            hotelName: detail.hotelName || localData.hotel_name,
            roomName: detail.roomName || localData.room_name,
            totalPrice: detail.totalPrice || localData.total_price,
            contactEmail: localData.contact_email,
            contactPhone: localData.contact_phone,
            checkInDate: detail.checkInDate || localData.check_in_date
          }; // Generate & Kirim Email (Hanya dilakukan saat transisi dari Processed ke Accept)

          if (!(localData.booking_status !== 'Accept')) {
            _context8.next = 45;
            break;
          }

          _context8.prev = 33;
          _context8.next = 36;
          return regeneratorRuntime.awrap(generateBookingPDF(pdfData, paxes));

        case 36:
          pdfBuffer = _context8.sent;
          _context8.next = 39;
          return regeneratorRuntime.awrap(transporter.sendMail({
            from: '"LinkU Travel" <linkutransport@gmail.com>',
            to: localData.contact_email,
            subject: "E-Tiket Hotel Berhasil - ".concat(detail.reservationNo),
            html: "<p>Pesanan Anda ".concat(detail.reservationNo, " telah berhasil dikonfirmasi.</p>"),
            attachments: [{
              filename: "E-Tiket-".concat(detail.reservationNo, ".pdf"),
              content: pdfBuffer
            }]
          }));

        case 39:
          logger.info("Email Update Accept Terkirim: ".concat(detail.reservationNo));
          _context8.next = 45;
          break;

        case 42:
          _context8.prev = 42;
          _context8.t0 = _context8["catch"](33);
          logger.error("Gagal kirim email update: " + _context8.t0.message);

        case 45:
          _context8.next = 47;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET \n                        reservation_no = ?, \n                        voucher_no = ?, \n                        booking_status = 'Accept',\n                        updated_at = NOW() \n                     WHERE id = ?", [detail.reservationNo, detail.voucherNo, localData.id]));

        case 47:
          // Tambahkan flag agar frontend tahu ada perubahan nomor reservasi
          resData.updatedToAccept = true;
          resData.newReservationNo = detail.reservationNo;

        case 49:
          res.json(resData);
          _context8.next = 56;
          break;

        case 52:
          _context8.prev = 52;
          _context8.t1 = _context8["catch"](0);
          logger.error("Booking Detail Error: " + _context8.t1.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context8.t1.message
          });

        case 56:
          _context8.prev = 56;
          if (connection) connection.release();
          return _context8.finish(56);

        case 59:
        case "end":
          return _context8.stop();
      }
    }
  }, null, null, [[0, 52, 56, 59], [33, 42]]);
});
router.post('/booking', function _callee9(req, res) {
  var connection, token, b, username, payload, response, resData, msg, isProcessed, isAccepted, currentStatus, _ref5, _ref6, bookingResult, newBookingId, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, room, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, pax;

  return regeneratorRuntime.async(function _callee9$(_context10) {
    while (1) {
      switch (_context10.prev = _context10.next) {
        case 0:
          _context10.prev = 0;
          _context10.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context10.sent;
          b = req.body; // 1. Ambil username dari request body (fallback ke "guest")

          username = b.username || "guest"; // 2. Konstruksi Payload untuk Supplier

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
          }; // 3. Kirim ke Supplier

          logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
          _context10.next = 10;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }));

        case 10:
          response = _context10.sent;
          resData = response.data;
          logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData)); // 4. Logika Deteksi Status (Kritikal)
          // Cek apakah pesan mengandung kata "PROCESSED" meskipun statusnya FAILED atau ERROR

          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED"); // Cek apakah supplier memberikan status booking "Accept" (biasanya di field bookingStatus)

          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

          if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            _context10.next = 87;
            break;
          }

          // Jika statusnya diproses (waiting), normalisasi agar bisa masuk DB
          currentStatus = 'Accept';

          if (isProcessed) {
            currentStatus = 'Processed';
            resData.reservationNo = resData.reservationNo || "PRC-" + Date.now();
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context10.next = 21;
          return regeneratorRuntime.awrap(db.getConnection());

        case 21:
          connection = _context10.sent;
          _context10.next = 24;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 24:
          _context10.next = 26;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_bookings \n                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, \n                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, \n                contact_email, contact_phone, total_price, booking_status, username) \n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [resData.reservationNo || null, resData.voucherNo || null, resData.osRefNo || null, payload.agentOsRef || null, String(resData.hotelID || b.hotelID), resData.hotelName || b.hotelName || "Hotel", resData.hotelAddress || "", b.internalCode || null, resData.checkInDate || b.checkInDate.replace('Z', ''), resData.checkOutDate || b.checkOutDate.replace('Z', ''), String(b.cityID), String(b.roomID), resData.roomName || b.roomName || "", b.breakfast || "", b.roomRequest[0].email || "", b.roomRequest[0].phone || "", parseFloat(resData.totalPrice || 0), currentStatus, // 'Accept' atau 'Processed'
          username]));

        case 26:
          _ref5 = _context10.sent;
          _ref6 = _slicedToArray(_ref5, 1);
          bookingResult = _ref6[0];
          newBookingId = bookingResult.insertId; // 6. Simpan Data Tamu

          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context10.prev = 33;
          _iterator = b.roomRequest[Symbol.iterator]();

        case 35:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context10.next = 66;
            break;
          }

          room = _step.value;
          _iteratorNormalCompletion2 = true;
          _didIteratorError2 = false;
          _iteratorError2 = undefined;
          _context10.prev = 40;
          _iterator2 = room.paxes[Symbol.iterator]();

        case 42:
          if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
            _context10.next = 49;
            break;
          }

          pax = _step2.value;
          _context10.next = 46;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) \n                        VALUES (?, 'ADULT', ?, ?, ?)", [newBookingId, pax.title, pax.firstName, pax.lastName]));

        case 46:
          _iteratorNormalCompletion2 = true;
          _context10.next = 42;
          break;

        case 49:
          _context10.next = 55;
          break;

        case 51:
          _context10.prev = 51;
          _context10.t0 = _context10["catch"](40);
          _didIteratorError2 = true;
          _iteratorError2 = _context10.t0;

        case 55:
          _context10.prev = 55;
          _context10.prev = 56;

          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }

        case 58:
          _context10.prev = 58;

          if (!_didIteratorError2) {
            _context10.next = 61;
            break;
          }

          throw _iteratorError2;

        case 61:
          return _context10.finish(58);

        case 62:
          return _context10.finish(55);

        case 63:
          _iteratorNormalCompletion = true;
          _context10.next = 35;
          break;

        case 66:
          _context10.next = 72;
          break;

        case 68:
          _context10.prev = 68;
          _context10.t1 = _context10["catch"](33);
          _didIteratorError = true;
          _iteratorError = _context10.t1;

        case 72:
          _context10.prev = 72;
          _context10.prev = 73;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 75:
          _context10.prev = 75;

          if (!_didIteratorError) {
            _context10.next = 78;
            break;
          }

          throw _iteratorError;

        case 78:
          return _context10.finish(75);

        case 79:
          return _context10.finish(72);

        case 80:
          _context10.next = 82;
          return regeneratorRuntime.awrap(connection.commit());

        case 82:
          logger.info("Booking Berhasil Disimpan: ID ".concat(newBookingId, ", User: ").concat(username)); // 7. Worker PDF & Email (Hanya jika status 'Accept', bukan 'Processed')

          if (currentStatus === 'Accept') {
            (function _callee8() {
              var pdfData, pdfBuffer;
              return regeneratorRuntime.async(function _callee8$(_context9) {
                while (1) {
                  switch (_context9.prev = _context9.next) {
                    case 0:
                      _context9.prev = 0;
                      pdfData = {
                        reservationNo: resData.reservationNo,
                        hotelName: resData.hotelName || "Hotel",
                        roomName: resData.roomName || "Room",
                        totalPrice: resData.totalPrice || 0,
                        contactEmail: b.roomRequest[0].email,
                        contactPhone: b.roomRequest[0].phone,
                        // PASTIKAN INI ADA
                        checkInDate: resData.checkInDate
                      }; // Paxes harus berupa array objek yang punya firstName dan lastName

                      _context9.next = 4;
                      return regeneratorRuntime.awrap(generateBookingPDF(pdfData, b.roomRequest[0].paxes));

                    case 4:
                      pdfBuffer = _context9.sent;
                      _context9.next = 7;
                      return regeneratorRuntime.awrap(transporter.sendMail({
                        from: '"LinkU Travel" <linkutransport@gmail.com>',
                        to: b.roomRequest[0].email,
                        subject: "E-Tiket Hotel - ".concat(resData.reservationNo),
                        html: "<h3>Halo ".concat(b.roomRequest[0].paxes[0].firstName, ",</h3>\n                                   <p>Booking Anda berhasil dikonfirmasi. Terlampir adalah e-tiket hotel Anda.</p>"),
                        attachments: [{
                          filename: "E-Tiket-".concat(resData.reservationNo, ".pdf"),
                          content: pdfBuffer
                        }]
                      }));

                    case 7:
                      logger.info("Email PDF terkirim ke: ".concat(b.roomRequest[0].email));
                      _context9.next = 13;
                      break;

                    case 10:
                      _context9.prev = 10;
                      _context9.t0 = _context9["catch"](0);
                      logger.error("Worker PDF/Email Error: " + _context9.t0.message);

                    case 13:
                    case "end":
                      return _context9.stop();
                  }
                }
              }, null, null, [[0, 10]]);
            })();
          } // 8. Kirim Response ke Frontend


          return _context10.abrupt("return", res.json(_objectSpread({
            status: "SUCCESS",
            booking_id: newBookingId,
            internalStatus: currentStatus
          }, resData, {
            reservationNo: resData.reservationNo // Memastikan resNo terkirim

          })));

        case 87:
          return _context10.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: resData.respMessage || "Gagal melakukan booking ke supplier."
          }));

        case 88:
          _context10.next = 97;
          break;

        case 90:
          _context10.prev = 90;
          _context10.t2 = _context10["catch"](0);

          if (!connection) {
            _context10.next = 95;
            break;
          }

          _context10.next = 95;
          return regeneratorRuntime.awrap(connection.rollback());

        case 95:
          logger.error("Final Booking Error: " + _context10.t2.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context10.t2.message
          });

        case 97:
          _context10.prev = 97;
          if (connection) connection.release();
          return _context10.finish(97);

        case 100:
        case "end":
          return _context10.stop();
      }
    }
  }, null, null, [[0, 90, 97, 100], [33, 68, 72, 80], [40, 51, 55, 63], [56,, 58, 62], [73,, 75, 79]]);
});
router.post('/booking', function _callee11(req, res) {
  var connection, token, b, username, payload, response, resData, msg, isProcessed, isAccepted, currentStatus, _ref7, _ref8, bookingResult, newBookingId, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, room, _iteratorNormalCompletion4, _didIteratorError4, _iteratorError4, _iterator4, _step4, pax;

  return regeneratorRuntime.async(function _callee11$(_context12) {
    while (1) {
      switch (_context12.prev = _context12.next) {
        case 0:
          _context12.prev = 0;
          _context12.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context12.sent;
          b = req.body; // 1. Ambil username dari request body (fallback ke "guest")

          username = b.username || "guest"; // 2. Konstruksi Payload untuk Supplier
          // Perbaikan: Menjamin tidak ada nilai NULL pada mandatory fields

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
                // Supplier menolak NULL. Jika kosong, kirim array kosong []
                specialRequestArray: room.specialRequestArray || [],
                // Supplier menolak NULL. Jika kosong, kirim string kosong ""
                requestDescription: room.requestDescription || "",
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                // Pastikan childAges adalah array, minimal [0] jika childNum > 0 tapi data kosong
                childAges: room.childAges && room.childAges.length > 0 ? room.childAges : [0]
              };
            }),
            internalCode: b.internalCode || "SUP",
            hotelID: b.hotelID,
            breakfast: b.breakfast || "Room Only",
            roomID: b.roomID,
            // Perbaikan: Mengirim string kosong daripada null untuk bedType
            bedType: {
              ID: b.bedType && b.bedType.ID ? String(b.bedType.ID) : "",
              bed: b.bedType && b.bedType.bed ? String(b.bedType.bed) : ""
            },
            agentOsRef: b.agentOsRef || "LC-".concat(Date.now()),
            userID: USER_CONFIG.userID,
            accessToken: token
          }; // 3. Kirim ke Supplier

          logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
          _context12.next = 10;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }));

        case 10:
          response = _context12.sent;
          resData = response.data;
          logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData)); // 4. Logika Deteksi Status (Kritikal)

          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

          if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            _context12.next = 87;
            break;
          }

          // Jika statusnya diproses (waiting), normalisasi agar bisa masuk DB
          currentStatus = 'Accept';

          if (isProcessed) {
            currentStatus = 'Processed';
            resData.reservationNo = resData.reservationNo || "PRC-" + Date.now();
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context12.next = 21;
          return regeneratorRuntime.awrap(db.getConnection());

        case 21:
          connection = _context12.sent;
          _context12.next = 24;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 24:
          _context12.next = 26;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_bookings \n                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, \n                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, \n                contact_email, contact_phone, total_price, booking_status, username) \n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [resData.reservationNo || null, resData.voucherNo || null, resData.osRefNo || null, payload.agentOsRef || null, String(resData.hotelID || b.hotelID), resData.hotelName || b.hotelName || "Hotel", resData.hotelAddress || "", b.internalCode || null, resData.checkInDate || b.checkInDate.replace('Z', ''), resData.checkOutDate || b.checkOutDate.replace('Z', ''), String(b.cityID), String(b.roomID), resData.roomName || b.roomName || "", b.breakfast || "", b.roomRequest[0].email || "", b.roomRequest[0].phone || "", parseFloat(resData.totalPrice || 0), currentStatus, username]));

        case 26:
          _ref7 = _context12.sent;
          _ref8 = _slicedToArray(_ref7, 1);
          bookingResult = _ref8[0];
          newBookingId = bookingResult.insertId; // 6. Simpan Data Tamu

          _iteratorNormalCompletion3 = true;
          _didIteratorError3 = false;
          _iteratorError3 = undefined;
          _context12.prev = 33;
          _iterator3 = b.roomRequest[Symbol.iterator]();

        case 35:
          if (_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done) {
            _context12.next = 66;
            break;
          }

          room = _step3.value;
          _iteratorNormalCompletion4 = true;
          _didIteratorError4 = false;
          _iteratorError4 = undefined;
          _context12.prev = 40;
          _iterator4 = room.paxes[Symbol.iterator]();

        case 42:
          if (_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done) {
            _context12.next = 49;
            break;
          }

          pax = _step4.value;
          _context12.next = 46;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) \n                        VALUES (?, 'ADULT', ?, ?, ?)", [newBookingId, pax.title, pax.firstName, pax.lastName]));

        case 46:
          _iteratorNormalCompletion4 = true;
          _context12.next = 42;
          break;

        case 49:
          _context12.next = 55;
          break;

        case 51:
          _context12.prev = 51;
          _context12.t0 = _context12["catch"](40);
          _didIteratorError4 = true;
          _iteratorError4 = _context12.t0;

        case 55:
          _context12.prev = 55;
          _context12.prev = 56;

          if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
            _iterator4["return"]();
          }

        case 58:
          _context12.prev = 58;

          if (!_didIteratorError4) {
            _context12.next = 61;
            break;
          }

          throw _iteratorError4;

        case 61:
          return _context12.finish(58);

        case 62:
          return _context12.finish(55);

        case 63:
          _iteratorNormalCompletion3 = true;
          _context12.next = 35;
          break;

        case 66:
          _context12.next = 72;
          break;

        case 68:
          _context12.prev = 68;
          _context12.t1 = _context12["catch"](33);
          _didIteratorError3 = true;
          _iteratorError3 = _context12.t1;

        case 72:
          _context12.prev = 72;
          _context12.prev = 73;

          if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
            _iterator3["return"]();
          }

        case 75:
          _context12.prev = 75;

          if (!_didIteratorError3) {
            _context12.next = 78;
            break;
          }

          throw _iteratorError3;

        case 78:
          return _context12.finish(75);

        case 79:
          return _context12.finish(72);

        case 80:
          _context12.next = 82;
          return regeneratorRuntime.awrap(connection.commit());

        case 82:
          logger.info("Booking Berhasil Disimpan: ID ".concat(newBookingId, ", User: ").concat(username)); // 7. Worker PDF & Email

          if (currentStatus === 'Accept') {
            (function _callee10() {
              var pdfData, pdfBuffer;
              return regeneratorRuntime.async(function _callee10$(_context11) {
                while (1) {
                  switch (_context11.prev = _context11.next) {
                    case 0:
                      _context11.prev = 0;
                      pdfData = {
                        reservationNo: resData.reservationNo,
                        hotelName: resData.hotelName || b.hotelName || "Hotel",
                        roomName: resData.roomName || b.roomName || "Room",
                        totalPrice: resData.totalPrice || 0,
                        contactEmail: b.roomRequest[0].email,
                        contactPhone: b.roomRequest[0].phone,
                        checkInDate: resData.checkInDate || b.checkInDate
                      };
                      _context11.next = 4;
                      return regeneratorRuntime.awrap(generateBookingPDF(pdfData, b.roomRequest[0].paxes));

                    case 4:
                      pdfBuffer = _context11.sent;
                      _context11.next = 7;
                      return regeneratorRuntime.awrap(transporter.sendMail({
                        from: '"LinkU Travel" <linkutransport@gmail.com>',
                        to: b.roomRequest[0].email,
                        subject: "E-Tiket Hotel - ".concat(resData.reservationNo),
                        html: "<p>Booking Anda berhasil dikonfirmasi. Terlampir adalah e-tiket hotel Anda.</p>",
                        attachments: [{
                          filename: "E-Tiket-".concat(resData.reservationNo, ".pdf"),
                          content: pdfBuffer
                        }]
                      }));

                    case 7:
                      _context11.next = 12;
                      break;

                    case 9:
                      _context11.prev = 9;
                      _context11.t0 = _context11["catch"](0);
                      logger.error("Worker PDF/Email Error: " + _context11.t0.message);

                    case 12:
                    case "end":
                      return _context11.stop();
                  }
                }
              }, null, null, [[0, 9]]);
            })();
          }

          return _context12.abrupt("return", res.json(_objectSpread({
            status: "SUCCESS",
            booking_id: newBookingId,
            internalStatus: currentStatus
          }, resData, {
            reservationNo: resData.reservationNo
          })));

        case 87:
          return _context12.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: resData.respMessage || "Gagal melakukan booking ke supplier."
          }));

        case 88:
          _context12.next = 97;
          break;

        case 90:
          _context12.prev = 90;
          _context12.t2 = _context12["catch"](0);

          if (!connection) {
            _context12.next = 95;
            break;
          }

          _context12.next = 95;
          return regeneratorRuntime.awrap(connection.rollback());

        case 95:
          logger.error("Final Booking Error: " + _context12.t2.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context12.t2.message
          });

        case 97:
          _context12.prev = 97;
          if (connection) connection.release();
          return _context12.finish(97);

        case 100:
        case "end":
          return _context12.stop();
      }
    }
  }, null, null, [[0, 90, 97, 100], [33, 68, 72, 80], [40, 51, 55, 63], [56,, 58, 62], [73,, 75, 79]]);
});
router.get('/history', function _callee13(req, res) {
  var connection, _req$query, username, _req$query$page, page, _req$query$limit, limit, limitNum, pageNum, offsetNum, _ref9, _ref10, _ref10$, total, _ref11, _ref12, bookings, bookingsWithPaxes;

  return regeneratorRuntime.async(function _callee13$(_context14) {
    while (1) {
      switch (_context14.prev = _context14.next) {
        case 0:
          _context14.prev = 0;
          _req$query = req.query, username = _req$query.username, _req$query$page = _req$query.page, page = _req$query$page === void 0 ? 1 : _req$query$page, _req$query$limit = _req$query.limit, limit = _req$query$limit === void 0 ? 10 : _req$query$limit; // 1. Validasi input awal

          if (username) {
            _context14.next = 4;
            break;
          }

          return _context14.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: "Parameter 'username' wajib diisi."
          }));

        case 4:
          // Pastikan page dan limit adalah angka yang valid (integer)
          limitNum = parseInt(limit) || 10;
          pageNum = parseInt(page) || 1;
          offsetNum = (pageNum - 1) * limitNum;
          _context14.next = 9;
          return regeneratorRuntime.awrap(db.getConnection());

        case 9:
          connection = _context14.sent;
          _context14.next = 12;
          return regeneratorRuntime.awrap(connection.execute("SELECT COUNT(*) as total FROM hotel_bookings WHERE username = ?", [username]));

        case 12:
          _ref9 = _context14.sent;
          _ref10 = _slicedToArray(_ref9, 1);
          _ref10$ = _slicedToArray(_ref10[0], 1);
          total = _ref10$[0].total;
          _context14.next = 18;
          return regeneratorRuntime.awrap(connection.query("SELECT \n                hb.id,\n                hb.reservation_no,\n                hb.voucher_no,\n                hb.hotel_name,\n                hb.hotel_address,\n                hb.room_name,\n                hb.breakfast_type,\n                hb.check_in_date,\n                hb.check_out_date,\n                hb.total_price,\n                hb.currency,\n                hb.booking_status,\n                hb.contact_email,\n                hb.contact_phone,\n                hb.room_count,\n                hb.booking_date,\n                hb.username\n            FROM hotel_bookings hb\n            WHERE hb.username = ?\n            ORDER BY hb.booking_date DESC\n            LIMIT ".concat(limitNum, " OFFSET ").concat(offsetNum), [username]));

        case 18:
          _ref11 = _context14.sent;
          _ref12 = _slicedToArray(_ref11, 1);
          bookings = _ref12[0];
          _context14.next = 23;
          return regeneratorRuntime.awrap(Promise.all(bookings.map(function _callee12(booking) {
            var _ref13, _ref14, paxes;

            return regeneratorRuntime.async(function _callee12$(_context13) {
              while (1) {
                switch (_context13.prev = _context13.next) {
                  case 0:
                    _context13.next = 2;
                    return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name, last_name, pax_type\n                 FROM hotel_booking_paxes\n                 WHERE booking_id = ?", [booking.id]));

                  case 2:
                    _ref13 = _context13.sent;
                    _ref14 = _slicedToArray(_ref13, 1);
                    paxes = _ref14[0];
                    return _context13.abrupt("return", _objectSpread({}, booking, {
                      paxes: paxes
                    }));

                  case 6:
                  case "end":
                    return _context13.stop();
                }
              }
            });
          })));

        case 23:
          bookingsWithPaxes = _context14.sent;
          return _context14.abrupt("return", res.json({
            status: "SUCCESS",
            username: username,
            total: total,
            page: pageNum,
            limit: limitNum,
            total_pages: Math.ceil(total / limitNum),
            data: bookingsWithPaxes
          }));

        case 27:
          _context14.prev = 27;
          _context14.t0 = _context14["catch"](0);
          logger.error("History Booking Error: " + _context14.t0.message);
          return _context14.abrupt("return", res.status(500).json({
            status: "ERROR",
            respMessage: "Internal Server Error: " + _context14.t0.message
          }));

        case 31:
          _context14.prev = 31;
          if (connection) connection.release();
          return _context14.finish(31);

        case 34:
        case "end":
          return _context14.stop();
      }
    }
  }, null, null, [[0, 27, 31, 34]]);
}); // ============================================================
// ENDPOINT: GET /api/hotels/history/:reservation_no
// Ambil detail satu booking berdasarkan reservation_no
// ============================================================

router.get('/history/:reservation_no', function _callee14(req, res) {
  var connection, reservation_no, username, _ref15, _ref16, _ref16$, booking, _ref17, _ref18, paxes;

  return regeneratorRuntime.async(function _callee14$(_context15) {
    while (1) {
      switch (_context15.prev = _context15.next) {
        case 0:
          _context15.prev = 0;
          reservation_no = req.params.reservation_no;
          username = req.query.username;

          if (username) {
            _context15.next = 5;
            break;
          }

          return _context15.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: "Parameter 'username' wajib diisi."
          }));

        case 5:
          _context15.next = 7;
          return regeneratorRuntime.awrap(db.getConnection());

        case 7:
          connection = _context15.sent;
          _context15.next = 10;
          return regeneratorRuntime.awrap(connection.execute("SELECT * FROM hotel_bookings \n             WHERE reservation_no = ? AND username = ?", [reservation_no, username]));

        case 10:
          _ref15 = _context15.sent;
          _ref16 = _slicedToArray(_ref15, 1);
          _ref16$ = _slicedToArray(_ref16[0], 1);
          booking = _ref16$[0];

          if (booking) {
            _context15.next = 16;
            break;
          }

          return _context15.abrupt("return", res.status(404).json({
            status: "ERROR",
            respMessage: "Booking tidak ditemukan."
          }));

        case 16:
          _context15.next = 18;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name, last_name, pax_type\n             FROM hotel_booking_paxes\n             WHERE booking_id = ?", [booking.id]));

        case 18:
          _ref17 = _context15.sent;
          _ref18 = _slicedToArray(_ref17, 1);
          paxes = _ref18[0];
          booking.paxes = paxes;
          return _context15.abrupt("return", res.json({
            status: "SUCCESS",
            data: booking
          }));

        case 25:
          _context15.prev = 25;
          _context15.t0 = _context15["catch"](0);
          logger.error("Detail Booking Error: " + _context15.t0.message);
          return _context15.abrupt("return", res.status(500).json({
            status: "ERROR",
            respMessage: _context15.t0.message
          }));

        case 29:
          _context15.prev = 29;
          if (connection) connection.release();
          return _context15.finish(29);

        case 32:
        case "end":
          return _context15.stop();
      }
    }
  }, null, null, [[0, 25, 29, 32]]);
});
module.exports = router;