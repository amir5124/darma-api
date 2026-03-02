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
  var browser, page, totalHargaFisik, totalFormatted, paymentDate, formatDateIndo, checkIn, checkOut, diffTime, nights, guestNames, requestValue, finalSpecialRequest, htmlContent, pdfBuffer;
  return regeneratorRuntime.async(function generateBookingPDF$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          _context.next = 3;
          return regeneratorRuntime.awrap(puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }));

        case 3:
          browser = _context.sent;
          _context.next = 6;
          return regeneratorRuntime.awrap(browser.newPage());

        case 6:
          page = _context.sent;
          // 1. Pembulatan Harga
          totalHargaFisik = Math.ceil(Number(data.totalPrice || 0));
          totalFormatted = totalHargaFisik.toLocaleString('id-ID'); // 2. Format Tanggal Transaksi (Tanggal Pembelian)

          paymentDate = new Date().toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          }); // 3. Helper Format Tanggal (Check-in/Out)

          formatDateIndo = function formatDateIndo(dateStr) {
            if (!dateStr) return "-";
            return new Date(dateStr).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            });
          }; // 4. Hitung Durasi Malam


          checkIn = new Date(data.checkInDate);
          checkOut = new Date(data.checkOutDate);
          diffTime = Math.abs(checkOut - checkIn);
          nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1; // 5. Daftar Tamu

          guestNames = paxes && paxes.length > 0 ? paxes.map(function (p) {
            return "".concat(p.title || '', " ").concat(p.firstName || '', " ").concat(p.lastName || '');
          }).join(', ') : "Guest"; // 6. Normalisasi Special Request (Menangani data dari API maupun DB)

          requestValue = data.specialRequests || data.special_requests || "";
          finalSpecialRequest = requestValue && requestValue !== "" && requestValue !== "-" ? requestValue : "Tidak ada permintaan khusus";
          htmlContent = "\n        <html>\n        <head>\n            <style>\n                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');\n                body { font-family: 'Inter', sans-serif; color: #334155; margin: 0; padding: 30px; background: #fff; line-height: 1.4; }\n                \n                .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 4px solid #24b3ae; padding-bottom: 15px; }\n                .hotel-title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }\n                .hotel-address { font-size: 11px; color: #64748b; max-width: 300px; }\n                \n                .voucher-title { text-align: center; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 20px 0; color: #0f172a; }\n\n                .top-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; font-size: 12px; }\n                .info-row { display: flex; margin-bottom: 5px; }\n                .info-row .label { width: 120px; color: #64748b; }\n                .info-row .value { font-weight: 600; color: #1e293b; }\n\n                .dates-container { \n                    display: flex; justify-content: space-around; background: #f8fafc; \n                    border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 30px;\n                }\n                .date-box { text-align: center; }\n                .date-box .label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 5px; }\n                .date-box .value { font-size: 14px; font-weight: 700; color: #24b3ae; }\n\n                .section-title { \n                    font-size: 13px; font-weight: 800; text-transform: uppercase; \n                    background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; color: #475569;\n                }\n\n                .details-grid { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 0 12px; margin-bottom: 30px; }\n                .detail-item { display: flex; font-size: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }\n                .detail-item .label { width: 180px; color: #64748b; }\n                .detail-item .value { flex: 1; font-weight: 600; color: #1e293b; }\n                \n                .special-request-box { \n                    background: #fff9f0; border-left: 4px solid #f59e0b; padding: 10px 15px; \n                    font-size: 12px; margin-top: 10px; border-radius: 0 8px 8px 0;\n                }\n\n                .paid-stamp { \n                    position: absolute; top: 150px; right: 50px; border: 4px solid #22c55e; \n                    color: #22c55e; padding: 10px 20px; font-size: 30px; font-weight: 900; \n                    border-radius: 12px; transform: rotate(-15deg); opacity: 0.2;\n                }\n\n                .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; }\n            </style>\n        </head>\n        <body>\n            <div class=\"paid-stamp\">PAID</div>\n\n            <div class=\"header\">\n                <div class=\"logo-area\">\n                    <img src=\"https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png\" height=\"50\">\n                </div>\n                <div class=\"hotel-info\" style=\"text-align: right;\">\n                    <div class=\"hotel-title\">".concat(data.hotelName, "</div>\n                    <div class=\"hotel-address\">").concat(data.hotelAddress || 'Alamat hotel tersedia di sistem', "</div>\n                </div>\n            </div>\n\n            <div class=\"voucher-title\">Voucher Reservasi Hotel</div>\n\n            <div class=\"top-info-grid\">\n                <div>\n                    <div class=\"info-row\"><div class=\"label\">Voucher No.</div><div class=\"value\">: ").concat(data.voucherNo || data.reservationNo, "</div></div>\n                    <div class=\"info-row\"><div class=\"label\">Tgl Pembelian</div><div class=\"value\">: ").concat(paymentDate, "</div></div>\n                </div>\n                <div style=\"text-align: right;\">\n                    <div class=\"info-row\" style=\"justify-content: flex-end;\"><div class=\"label\">File No.</div><div class=\"value\">: ").concat(data.reservationNo, "</div></div>\n                    <div class=\"info-row\" style=\"justify-content: flex-end;\"><div class=\"label\">O/S Ref.</div><div class=\"value\">: ").concat(data.osRefNo || '-', "</div></div>\n                </div>\n            </div>\n\n            <div class=\"dates-container\">\n                <div class=\"date-box\">\n                    <div class=\"label\">Tanggal Check-In</div>\n                    <div class=\"value\">").concat(formatDateIndo(data.checkInDate), "</div>\n                </div>\n                <div style=\"color: #cbd5e1; font-size: 24px;\">|</div>\n                <div class=\"date-box\">\n                    <div class=\"label\">Tanggal Check-Out</div>\n                    <div class=\"value\">").concat(formatDateIndo(data.checkOutDate), "</div>\n                </div>\n            </div>\n\n            <div class=\"section-title\">Reservation Details</div>\n            <div class=\"details-grid\">\n                <div class=\"detail-item\">\n                    <div class=\"label\">Nama Tamu / Grup</div>\n                    <div class=\"value\">: ").concat(guestNames, "</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Total Kamar</div>\n                    <div class=\"value\">: 1 Kamar</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Tipe Kamar</div>\n                    <div class=\"value\">: ").concat(data.roomName, "</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Meals</div>\n                    <div class=\"value\">: ").concat(data.breakfastType || data.breakfast || 'Sesuai Kebijakan Hotel', "</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Total Pax</div>\n                    <div class=\"value\">: ").concat(paxes.length, " Tamu</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Jumlah Malam</div>\n                    <div class=\"value\">: ").concat(nights, " Malam</div>\n                </div>\n                <div class=\"detail-item\" style=\"border:none;\">\n                    <div class=\"label\">Special Request</div>\n                    <div class=\"value\">: \n                        <div class=\"special-request-box\">\n                            ").concat(finalSpecialRequest, "\n                        </div>\n                    </div>\n                </div>\n            </div>\n\n            <div class=\"section-title\">Pembayaran</div>\n            <div style=\"font-size: 11px; color: #475569; padding: 0 12px;\">\n                Voucher Berlaku Untuk Layanan yang Tertera di Atas. Tambahan Layanan Harus Berdasarkan Permintaan.<br>\n                <b>Status: LUNAS (Paid via Koin Aplikasi) - IDR ").concat(totalFormatted, "</b>\n            </div>\n\n            <div class=\"footer\">\n                1. Voucher hanya berlaku saat tanggal menginap.<br>\n                2. Mohon hubungi kami bila melakukan perubahan reservasi.<br>\n                3. Permintaan khusus tergantung dari ketersediaan layanan hotel pada saat check-in.<br><br>\n                <strong>LinkU Travel</strong>\n            </div>\n        </body>\n        </html>");
          _context.next = 21;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 21:
          _context.next = 23;
          return regeneratorRuntime.awrap(page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              top: '0px',
              bottom: '0px',
              left: '0px',
              right: '0px'
            }
          }));

        case 23:
          pdfBuffer = _context.sent;
          return _context.abrupt("return", pdfBuffer);

        case 27:
          _context.prev = 27;
          _context.t0 = _context["catch"](0);
          console.error("Error generating PDF:", _context.t0);
          throw _context.t0;

        case 31:
          _context.prev = 31;

          if (!browser) {
            _context.next = 35;
            break;
          }

          _context.next = 35;
          return regeneratorRuntime.awrap(browser.close());

        case 35:
          return _context.finish(31);

        case 36:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 27, 31, 36]]);
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
  var connection, token, b, _ref, _ref2, localRows, localData, payload, response, resData, detail, cleanStatus, _ref3, _ref4, paxes, pdfData, isTransition, isForceResend, pdfBuffer;

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
            respMessage: "Booking tidak ditemukan."
          }));

        case 15:
          localData = localRows[0];
          payload = {
            reservationNo: localData.reservation_no.startsWith("PRC-") ? "" : localData.reservation_no,
            osRefNo: String(localData.os_ref_no),
            agentOsRef: localData.agent_os_ref || "",
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          _context8.next = 19;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingDetail"), payload, {
            httpsAgent: agent
          }));

        case 19:
          response = _context8.sent;
          resData = response.data;

          if (!(resData.status === "SUCCESS" && resData.bookingDetail)) {
            _context8.next = 50;
            break;
          }

          detail = resData.bookingDetail;
          cleanStatus = (detail.bookingStatus || "").trim();

          if (!(cleanStatus === "Accept")) {
            _context8.next = 50;
            break;
          }

          _context8.next = 27;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?", [localData.id]));

        case 27:
          _ref3 = _context8.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];
          // PERBAIKAN DI SINI: Lengkapi properti untuk PDF
          pdfData = {
            reservationNo: detail.reservationNo,
            osRefNo: detail.osRefNo || localData.os_ref_no,
            hotelName: detail.hotelName || localData.hotel_name,
            hotelAddress: detail.hotelAddress || localData.hotel_address,
            roomName: detail.roomName || localData.room_name,
            totalPrice: detail.totalPrice || localData.total_price,
            contactEmail: localData.contact_email,
            contactPhone: localData.contact_phone,
            checkInDate: detail.checkInDate || localData.check_in_date,
            checkOutDate: detail.checkOutDate || localData.check_out_date,
            specialRequests: localData.special_requests || "-",
            breakfastType: detail.breakfast || localData.breakfast_type
          };
          isTransition = localData.booking_status !== 'Accept';
          isForceResend = b.forceResend === true;

          if (!(isTransition || isForceResend)) {
            _context8.next = 46;
            break;
          }

          _context8.prev = 34;
          _context8.next = 37;
          return regeneratorRuntime.awrap(generateBookingPDF(pdfData, paxes));

        case 37:
          pdfBuffer = _context8.sent;
          _context8.next = 40;
          return regeneratorRuntime.awrap(transporter.sendMail({
            from: '"LinkU Travel" <linkutransport@gmail.com>',
            to: localData.contact_email,
            subject: "E-Tiket Hotel - ".concat(detail.reservationNo),
            html: "<p>Berikut adalah e-tiket untuk pesanan hotel Anda di <b>".concat(pdfData.hotelName, "</b>.</p>"),
            attachments: [{
              filename: "E-Tiket-".concat(detail.reservationNo, ".pdf"),
              content: pdfBuffer
            }]
          }));

        case 40:
          logger.info("Email Terkirim (".concat(isForceResend ? 'Resend' : 'Update', "): ").concat(detail.reservationNo));
          _context8.next = 46;
          break;

        case 43:
          _context8.prev = 43;
          _context8.t0 = _context8["catch"](34);
          logger.error("Gagal kirim email di detail: " + _context8.t0.message);

        case 46:
          _context8.next = 48;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET \n                        reservation_no = ?, \n                        voucher_no = ?, \n                        booking_status = 'Accept',\n                        updated_at = NOW() \n                     WHERE id = ?", [detail.reservationNo, detail.voucherNo, localData.id]));

        case 48:
          resData.updatedToAccept = true;
          resData.newReservationNo = detail.reservationNo;

        case 50:
          res.json(resData);
          _context8.next = 57;
          break;

        case 53:
          _context8.prev = 53;
          _context8.t1 = _context8["catch"](0);
          logger.error("Booking Detail Error: " + _context8.t1.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context8.t1.message
          });

        case 57:
          _context8.prev = 57;
          if (connection) connection.release();
          return _context8.finish(57);

        case 60:
        case "end":
          return _context8.stop();
      }
    }
  }, null, null, [[0, 53, 57, 60], [34, 43]]);
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
          b = req.body;
          username = b.username || "guest";
          payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate.endsWith('Z') ? b.checkInDate : b.checkInDate + 'Z',
            checkOutDate: b.checkOutDate.endsWith('Z') ? b.checkOutDate : b.checkOutDate + 'Z',
            roomRequest: b.roomRequest.map(function (room) {
              return {
                paxes: room.paxes && room.paxes.length > 0 ? room.paxes.map(function (pax) {
                  return {
                    title: pax.title || 'Mr.',
                    firstName: (pax.firstName || 'Guest').trim(),
                    lastName: (pax.lastName || 'User').trim()
                  };
                }) : [{
                  title: 'Mr.',
                  firstName: 'Guest',
                  lastName: 'User'
                }],
                isSmokingRoom: Boolean(room.isSmokingRoom),
                phone: String(room.phone || '08123456789'),
                email: String(room.email || 'guest@mail.com'),
                specialRequestArray: room.specialRequestArray || [],
                requestDescription: room.requestDescription || "",
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges && room.childAges.length > 0 ? room.childAges : [0]
              };
            }),
            internalCode: b.internalCode || "SUP",
            hotelID: b.hotelID,
            breakfast: b.breakfast || "Room Only",
            roomID: b.roomID,
            bedType: {
              ID: b.bedType && b.bedType.ID ? String(b.bedType.ID) : "",
              bed: b.bedType && b.bedType.bed ? String(b.bedType.bed) : ""
            },
            agentOsRef: b.agentOsRef || "LC-".concat(Date.now()),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          _context10.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }));

        case 9:
          response = _context10.sent;
          resData = response.data;
          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

          if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            _context10.next = 84;
            break;
          }

          currentStatus = 'Accept';

          if (isProcessed) {
            currentStatus = 'Processed';
            resData.reservationNo = resData.reservationNo || "PRC-" + Date.now();
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context10.next = 19;
          return regeneratorRuntime.awrap(db.getConnection());

        case 19:
          connection = _context10.sent;
          _context10.next = 22;
          return regeneratorRuntime.awrap(connection.beginTransaction());

        case 22:
          _context10.next = 24;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_bookings \n                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, \n                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, \n                contact_email, contact_phone, total_price, booking_status, username, special_requests) \n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [resData.reservationNo, resData.voucherNo, resData.osRefNo, payload.agentOsRef, String(resData.hotelID || b.hotelID), resData.hotelName || b.hotelName || "Hotel", resData.hotelAddress || "", b.internalCode, resData.checkInDate || b.checkInDate.replace('Z', ''), resData.checkOutDate || b.checkOutDate.replace('Z', ''), String(b.cityID), String(b.roomID), resData.roomName || b.roomName || "", b.breakfast || "", b.roomRequest[0].email, b.roomRequest[0].phone, parseFloat(resData.totalPrice || 0), currentStatus, username, payload.roomRequest[0].requestDescription]));

        case 24:
          _ref5 = _context10.sent;
          _ref6 = _slicedToArray(_ref5, 1);
          bookingResult = _ref6[0];
          newBookingId = bookingResult.insertId;
          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context10.prev = 31;
          _iterator = b.roomRequest[Symbol.iterator]();

        case 33:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            _context10.next = 64;
            break;
          }

          room = _step.value;
          _iteratorNormalCompletion2 = true;
          _didIteratorError2 = false;
          _iteratorError2 = undefined;
          _context10.prev = 38;
          _iterator2 = room.paxes[Symbol.iterator]();

        case 40:
          if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
            _context10.next = 47;
            break;
          }

          pax = _step2.value;
          _context10.next = 44;
          return regeneratorRuntime.awrap(connection.execute("INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) \n                        VALUES (?, 'ADULT', ?, ?, ?)", [newBookingId, pax.title, pax.firstName, pax.lastName]));

        case 44:
          _iteratorNormalCompletion2 = true;
          _context10.next = 40;
          break;

        case 47:
          _context10.next = 53;
          break;

        case 49:
          _context10.prev = 49;
          _context10.t0 = _context10["catch"](38);
          _didIteratorError2 = true;
          _iteratorError2 = _context10.t0;

        case 53:
          _context10.prev = 53;
          _context10.prev = 54;

          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }

        case 56:
          _context10.prev = 56;

          if (!_didIteratorError2) {
            _context10.next = 59;
            break;
          }

          throw _iteratorError2;

        case 59:
          return _context10.finish(56);

        case 60:
          return _context10.finish(53);

        case 61:
          _iteratorNormalCompletion = true;
          _context10.next = 33;
          break;

        case 64:
          _context10.next = 70;
          break;

        case 66:
          _context10.prev = 66;
          _context10.t1 = _context10["catch"](31);
          _didIteratorError = true;
          _iteratorError = _context10.t1;

        case 70:
          _context10.prev = 70;
          _context10.prev = 71;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 73:
          _context10.prev = 73;

          if (!_didIteratorError) {
            _context10.next = 76;
            break;
          }

          throw _iteratorError;

        case 76:
          return _context10.finish(73);

        case 77:
          return _context10.finish(70);

        case 78:
          _context10.next = 80;
          return regeneratorRuntime.awrap(connection.commit());

        case 80:
          if (currentStatus === 'Accept') {
            (function _callee8() {
              var _ref7, _ref8, paxesForPdf, pdfData, pdfBuffer;

              return regeneratorRuntime.async(function _callee8$(_context9) {
                while (1) {
                  switch (_context9.prev = _context9.next) {
                    case 0:
                      _context9.prev = 0;
                      _context9.next = 3;
                      return regeneratorRuntime.awrap(db.execute("SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?", [newBookingId]));

                    case 3:
                      _ref7 = _context9.sent;
                      _ref8 = _slicedToArray(_ref7, 1);
                      paxesForPdf = _ref8[0];
                      // PERBAIKAN DI SINI: Lengkapi properti untuk PDF
                      pdfData = {
                        reservationNo: resData.reservationNo,
                        osRefNo: resData.osRefNo,
                        // Tambahkan ini
                        hotelName: resData.hotelName || b.hotelName || "Hotel",
                        hotelAddress: resData.hotelAddress || "",
                        // Tambahkan ini
                        roomName: resData.roomName || b.roomName || "Room",
                        totalPrice: resData.totalPrice || 0,
                        contactEmail: b.roomRequest[0].email,
                        contactPhone: b.roomRequest[0].phone,
                        checkInDate: resData.checkInDate || b.checkInDate,
                        checkOutDate: resData.checkOutDate || b.checkOutDate,
                        specialRequests: payload.roomRequest[0].requestDescription || "-"
                      };
                      _context9.next = 9;
                      return regeneratorRuntime.awrap(generateBookingPDF(pdfData, paxesForPdf));

                    case 9:
                      pdfBuffer = _context9.sent;
                      _context9.next = 12;
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

                    case 12:
                      _context9.next = 17;
                      break;

                    case 14:
                      _context9.prev = 14;
                      _context9.t0 = _context9["catch"](0);
                      console.error("Background Mail Error: " + _context9.t0.message);

                    case 17:
                    case "end":
                      return _context9.stop();
                  }
                }
              }, null, null, [[0, 14]]);
            })();
          }

          return _context10.abrupt("return", res.json(_objectSpread({
            status: "SUCCESS",
            booking_id: newBookingId,
            internalStatus: currentStatus
          }, resData)));

        case 84:
          return _context10.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: resData.respMessage || "Kamar tidak tersedia."
          }));

        case 85:
          _context10.next = 93;
          break;

        case 87:
          _context10.prev = 87;
          _context10.t2 = _context10["catch"](0);

          if (!connection) {
            _context10.next = 92;
            break;
          }

          _context10.next = 92;
          return regeneratorRuntime.awrap(connection.rollback());

        case 92:
          res.status(500).json({
            status: "ERROR",
            respMessage: _context10.t2.message
          });

        case 93:
          _context10.prev = 93;
          if (connection) connection.release();
          return _context10.finish(93);

        case 96:
        case "end":
          return _context10.stop();
      }
    }
  }, null, null, [[0, 87, 93, 96], [31, 66, 70, 78], [38, 49, 53, 61], [54,, 56, 60], [71,, 73, 77]]);
});
router.get('/history', function _callee11(req, res) {
  var connection, _req$query, username, _req$query$page, page, _req$query$limit, limit, limitNum, pageNum, offsetNum, _ref9, _ref10, _ref10$, total, _ref11, _ref12, bookings, bookingsWithPaxes;

  return regeneratorRuntime.async(function _callee11$(_context12) {
    while (1) {
      switch (_context12.prev = _context12.next) {
        case 0:
          _context12.prev = 0;
          _req$query = req.query, username = _req$query.username, _req$query$page = _req$query.page, page = _req$query$page === void 0 ? 1 : _req$query$page, _req$query$limit = _req$query.limit, limit = _req$query$limit === void 0 ? 10 : _req$query$limit; // 1. Validasi input awal

          if (username) {
            _context12.next = 4;
            break;
          }

          return _context12.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: "Parameter 'username' wajib diisi."
          }));

        case 4:
          // Pastikan page dan limit adalah angka yang valid (integer)
          limitNum = parseInt(limit) || 10;
          pageNum = parseInt(page) || 1;
          offsetNum = (pageNum - 1) * limitNum;
          _context12.next = 9;
          return regeneratorRuntime.awrap(db.getConnection());

        case 9:
          connection = _context12.sent;
          _context12.next = 12;
          return regeneratorRuntime.awrap(connection.execute("SELECT COUNT(*) as total FROM hotel_bookings WHERE username = ?", [username]));

        case 12:
          _ref9 = _context12.sent;
          _ref10 = _slicedToArray(_ref9, 1);
          _ref10$ = _slicedToArray(_ref10[0], 1);
          total = _ref10$[0].total;
          _context12.next = 18;
          return regeneratorRuntime.awrap(connection.query("SELECT \n                hb.id,\n                hb.reservation_no,\n                hb.voucher_no,\n                hb.hotel_name,\n                hb.hotel_address,\n                hb.room_name,\n                hb.breakfast_type,\n                hb.check_in_date,\n                hb.check_out_date,\n                hb.total_price,\n                hb.currency,\n                hb.booking_status,\n                hb.contact_email,\n                hb.contact_phone,\n                hb.room_count,\n                hb.booking_date,\n                hb.username\n            FROM hotel_bookings hb\n            WHERE hb.username = ?\n            ORDER BY hb.booking_date DESC\n            LIMIT ".concat(limitNum, " OFFSET ").concat(offsetNum), [username]));

        case 18:
          _ref11 = _context12.sent;
          _ref12 = _slicedToArray(_ref11, 1);
          bookings = _ref12[0];
          _context12.next = 23;
          return regeneratorRuntime.awrap(Promise.all(bookings.map(function _callee10(booking) {
            var _ref13, _ref14, paxes;

            return regeneratorRuntime.async(function _callee10$(_context11) {
              while (1) {
                switch (_context11.prev = _context11.next) {
                  case 0:
                    _context11.next = 2;
                    return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name, last_name, pax_type\n                 FROM hotel_booking_paxes\n                 WHERE booking_id = ?", [booking.id]));

                  case 2:
                    _ref13 = _context11.sent;
                    _ref14 = _slicedToArray(_ref13, 1);
                    paxes = _ref14[0];
                    return _context11.abrupt("return", _objectSpread({}, booking, {
                      paxes: paxes
                    }));

                  case 6:
                  case "end":
                    return _context11.stop();
                }
              }
            });
          })));

        case 23:
          bookingsWithPaxes = _context12.sent;
          return _context12.abrupt("return", res.json({
            status: "SUCCESS",
            username: username,
            total: total,
            page: pageNum,
            limit: limitNum,
            total_pages: Math.ceil(total / limitNum),
            data: bookingsWithPaxes
          }));

        case 27:
          _context12.prev = 27;
          _context12.t0 = _context12["catch"](0);
          logger.error("History Booking Error: " + _context12.t0.message);
          return _context12.abrupt("return", res.status(500).json({
            status: "ERROR",
            respMessage: "Internal Server Error: " + _context12.t0.message
          }));

        case 31:
          _context12.prev = 31;
          if (connection) connection.release();
          return _context12.finish(31);

        case 34:
        case "end":
          return _context12.stop();
      }
    }
  }, null, null, [[0, 27, 31, 34]]);
}); // ============================================================
// ENDPOINT: GET /api/hotels/history/:reservation_no
// Ambil detail satu booking berdasarkan reservation_no
// ============================================================

router.get('/history/:reservation_no', function _callee12(req, res) {
  var connection, reservation_no, username, _ref15, _ref16, _ref16$, booking, _ref17, _ref18, paxes;

  return regeneratorRuntime.async(function _callee12$(_context13) {
    while (1) {
      switch (_context13.prev = _context13.next) {
        case 0:
          _context13.prev = 0;
          reservation_no = req.params.reservation_no;
          username = req.query.username;

          if (username) {
            _context13.next = 5;
            break;
          }

          return _context13.abrupt("return", res.status(400).json({
            status: "ERROR",
            respMessage: "Parameter 'username' wajib diisi."
          }));

        case 5:
          _context13.next = 7;
          return regeneratorRuntime.awrap(db.getConnection());

        case 7:
          connection = _context13.sent;
          _context13.next = 10;
          return regeneratorRuntime.awrap(connection.execute("SELECT * FROM hotel_bookings \n             WHERE reservation_no = ? AND username = ?", [reservation_no, username]));

        case 10:
          _ref15 = _context13.sent;
          _ref16 = _slicedToArray(_ref15, 1);
          _ref16$ = _slicedToArray(_ref16[0], 1);
          booking = _ref16$[0];

          if (booking) {
            _context13.next = 16;
            break;
          }

          return _context13.abrupt("return", res.status(404).json({
            status: "ERROR",
            respMessage: "Booking tidak ditemukan."
          }));

        case 16:
          _context13.next = 18;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name, last_name, pax_type\n             FROM hotel_booking_paxes\n             WHERE booking_id = ?", [booking.id]));

        case 18:
          _ref17 = _context13.sent;
          _ref18 = _slicedToArray(_ref17, 1);
          paxes = _ref18[0];
          booking.paxes = paxes;
          return _context13.abrupt("return", res.json({
            status: "SUCCESS",
            data: booking
          }));

        case 25:
          _context13.prev = 25;
          _context13.t0 = _context13["catch"](0);
          logger.error("Detail Booking Error: " + _context13.t0.message);
          return _context13.abrupt("return", res.status(500).json({
            status: "ERROR",
            respMessage: _context13.t0.message
          }));

        case 29:
          _context13.prev = 29;
          if (connection) connection.release();
          return _context13.finish(29);

        case 32:
        case "end":
          return _context13.stop();
      }
    }
  }, null, null, [[0, 25, 29, 32]]);
});
module.exports = router;