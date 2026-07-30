"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// utils/paymentHelper.js
var axios = require('axios');

var crypto = require('crypto');

var moment = require('moment-timezone');

var db = require('../config/db');

var _require = require('../utils/mailer'),
    sendBookingEmail = _require.sendBookingEmail;

var _require2 = require('../utils/hotelBookingProcessor'),
    processHotelBookingToVendor = _require2.processHotelBookingToVendor;

var logger = require('../helpers/darmaSandbox').logger; // ============================================================
// KONFIGURASI LINKQU (sama dengan hotelPaymentController)
// ============================================================


var LINKQU_CONFIG = {
  clientId: "testing",
  clientSecret: "123",
  username: "LI307GXIN",
  pin: "2K2NPCBBNNTovgB",
  serverKey: "LinkQu@2020",
  baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
}; // ============================================================
// HELPER: Generate Signature LinkQu
// ============================================================

function generateSignature(path, method, data) {
  var rawValue = Object.values(data).join('') + LINKQU_CONFIG.clientId;
  var cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
  return crypto.createHmac("sha256", LINKQU_CONFIG.serverKey).update(path + method + cleaned).digest("hex");
} // ============================================================
// HELPER: Format Phone Number
// ============================================================


function formatPhoneNumber(phone) {
  var formatted = phone ? phone.toString().trim().replace(/[^0-9]/g, '') : '';

  if (formatted.startsWith('0')) {
    formatted = '+62' + formatted.substring(1);
  } else if (formatted.startsWith('8')) {
    formatted = '+62' + formatted;
  } else if (formatted.startsWith('62') && !formatted.startsWith('+')) {
    formatted = '+' + formatted;
  } else if (!formatted.startsWith('+')) {
    formatted = '+62' + formatted;
  }

  if (formatted.length < 10) formatted = '+628123456789';
  return formatted;
} // ============================================================
// HELPER: Get Bank Name
// ============================================================


function getBankName(bankCode) {
  var bankMap = {
    "002": "BRI",
    "008": "MANDIRI",
    "009": "BNI",
    "200": "BTN",
    "014": "BCA",
    "013": "PERMATA",
    "022": "CIMB",
    "441": "DANAMON",
    "016": "MAYBANK",
    "451": "BSI"
  };
  return bankMap[bankCode] || bankCode;
} // ============================================================
// MAIN: Generate Payment via LinkQu
// ============================================================


function generatePayment(bookingData) {
  var connection, booking_id, amount, customer_name, customer_phone, customer_email, _bookingData$method, method, _bookingData$bank_cod, bank_code, _bookingData$admin_fe, admin_fee_applied, finalAmount, feeAdmin, finalCustomerName, finalCustomerEmail, formattedPhone, bankName, partner_reff, expired, url_callback, _ref, _ref2, rows, booking, commonData, endpoint, payloadLinkQu, signatureData, resp, linkquData, vaNumber, qrisImage, mysqlExpired, formatIDR, emailHtml;

  return regeneratorRuntime.async(function generatePayment$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          booking_id = bookingData.booking_id, amount = bookingData.amount, customer_name = bookingData.customer_name, customer_phone = bookingData.customer_phone, customer_email = bookingData.customer_email, _bookingData$method = bookingData.method, method = _bookingData$method === void 0 ? 'QRIS' : _bookingData$method, _bookingData$bank_cod = bookingData.bank_code, bank_code = _bookingData$bank_cod === void 0 ? null : _bookingData$bank_cod, _bookingData$admin_fe = bookingData.admin_fee_applied, admin_fee_applied = _bookingData$admin_fe === void 0 ? 0 : _bookingData$admin_fe; // Validasi

          if (!(!booking_id || !amount)) {
            _context.next = 4;
            break;
          }

          throw new Error('booking_id dan amount wajib diisi');

        case 4:
          finalAmount = Math.round(Number(amount));
          feeAdmin = Number(admin_fee_applied || 0);
          finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
          finalCustomerEmail = (customer_email || 'guest@mail.com').trim();
          formattedPhone = formatPhoneNumber(customer_phone);
          bankName = getBankName(bank_code);
          partner_reff = "PAY-HTL-".concat(Date.now());
          expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
          url_callback = "https://darma.siappgo.id/api/hotel-booking-v2/payment-webhook"; // Ambil data booking

          _context.next = 15;
          return regeneratorRuntime.awrap(db.getConnection());

        case 15:
          connection = _context.sent;
          _context.next = 18;
          return regeneratorRuntime.awrap(connection.query("SELECT * FROM hotel_bookings WHERE id = ?", [booking_id]));

        case 18:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];

          if (!(rows.length === 0)) {
            _context.next = 23;
            break;
          }

          throw new Error("Data booking hotel tidak ditemukan");

        case 23:
          booking = rows[0]; // Prepare data untuk LinkQu

          commonData = {
            amount: finalAmount,
            expired: expired,
            partner_reff: partner_reff,
            customer_id: formattedPhone,
            customer_name: finalCustomerName,
            customer_email: finalCustomerEmail
          };
          endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
          payloadLinkQu = _objectSpread({}, commonData, {
            username: LINKQU_CONFIG.username,
            pin: LINKQU_CONFIG.pin,
            url_callback: url_callback
          }); // Tambahkan bank_code untuk VA

          if (method === 'VA') {
            payloadLinkQu.bank_code = bank_code;
            signatureData = {
              amount: finalAmount,
              expired: expired,
              bank_code: bank_code,
              partner_reff: partner_reff,
              customer_id: formattedPhone,
              customer_name: finalCustomerName,
              customer_email: finalCustomerEmail
            };
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', signatureData);
          } else {
            payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
          }

          logger.info("\uD83D\uDE80 [LINKQU] Sending to ".concat(endpoint, " with Reff: ").concat(partner_reff));
          logger.debug("\uD83D\uDCE6 Payload:", JSON.stringify(payloadLinkQu)); // Kirim ke LinkQu

          _context.next = 32;
          return regeneratorRuntime.awrap(axios.post("".concat(LINKQU_CONFIG.baseUrl).concat(endpoint), payloadLinkQu, {
            headers: {
              'client-id': LINKQU_CONFIG.clientId,
              'client-secret': LINKQU_CONFIG.clientSecret
            }
          }));

        case 32:
          resp = _context.sent;
          linkquData = resp.data;
          logger.info("\u2705 [LINKQU] Success:", JSON.stringify(linkquData));
          vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? linkquData.data.va_number : null);
          qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.qr_url : null);

          if (!(!vaNumber && !qrisImage)) {
            _context.next = 39;
            break;
          }

          throw new Error("Gagal mendapatkan instruksi pembayaran dari LinkQu: " + JSON.stringify(linkquData));

        case 39:
          // Simpan ke database
          mysqlExpired = moment(expired, 'YYYYMMDDHHmmss').format('YYYY-MM-DD HH:mm:ss');
          _context.next = 42;
          return regeneratorRuntime.awrap(connection.query("INSERT INTO hotel_payments \n                (booking_id, payment_reff, payment_method, va_number, qris_url, \n                 admin_fee, amount, payment_status, expired_date, created_at)\n             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())\n             ON DUPLICATE KEY UPDATE \n                payment_reff = VALUES(payment_reff),\n                payment_method = VALUES(payment_method),\n                va_number = VALUES(va_number),\n                qris_url = VALUES(qris_url),\n                admin_fee = VALUES(admin_fee),\n                amount = VALUES(amount),\n                payment_status = 'PENDING',\n                expired_date = VALUES(expired_date)", [booking_id, partner_reff, method === 'VA' ? "VA-".concat(bankName) : 'QRIS', vaNumber, qrisImage, feeAdmin, finalAmount, mysqlExpired]));

        case 42:
          // Kirim email (jika diperlukan)
          formatIDR = function formatIDR(num) {
            return new Intl.NumberFormat('id-ID').format(num);
          };

          emailHtml = "\n            <div style=\"font-family: Arial; max-width: 600px; margin: auto; border: 1px solid #24b3ae;\">\n                <div style=\"background: #24b3ae; color: white; padding: 15px; text-align: center;\">\n                    <h3>INSTRUKSI PEMBAYARAN HOTEL</h3>\n                </div>\n                <div style=\"padding: 20px;\">\n                    <p>Halo ".concat(finalCustomerName, ", silakan selesaikan pembayaran untuk <b>").concat(booking.hotel_name, "</b></p>\n                    <table style=\"width: 100%; margin-bottom: 20px;\">\n                        <tr><td>No. Transaksi</td><td>: <b>").concat(booking.reservation_no, "</b></td></tr>\n                        <tr><td>Metode</td><td>: ").concat(method, " ").concat(bankName || '', "</td></tr>\n                    </table>\n                    <div style=\"background: #f9f9f9; padding: 20px; text-align: center; border-radius: 10px;\">\n                        <small>NOMOR PEMBAYARAN</small>\n                        <h2 style=\"color: #e03f7d; margin: 10px 0;\">").concat(vaNumber || 'Lihat QRIS', "</h2>\n                        ").concat(qrisImage ? "<img src=\"".concat(qrisImage, "\" width=\"200\" />") : '', "\n                        <h3 style=\"margin: 0;\">TOTAL: Rp ").concat(formatIDR(finalAmount), "</h3>\n                    </div>\n                </div>\n            </div>"); // Kirim email di background

          sendBookingEmail(finalCustomerEmail, "Bayar Hotel - ".concat(booking.reservation_no), emailHtml)["catch"](function (e) {
            return logger.error("Email Error:", e.message);
          });
          connection.release();
          return _context.abrupt("return", {
            success: true,
            partner_reff: partner_reff,
            method: method,
            bankName: bankName,
            va_number: vaNumber,
            qris_url: qrisImage,
            amount: finalAmount,
            expired_at: moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss'),
            payment_info: {
              method: method,
              bankName: bankName,
              va_number: vaNumber,
              qris_url: qrisImage,
              amount: finalAmount,
              expired_at: moment(expired, 'YYYYMMDDHHmmss').format('HH:mm:ss')
            }
          });

        case 49:
          _context.prev = 49;
          _context.t0 = _context["catch"](0);
          if (connection) connection.release();
          logger.error('[PAYMENT GENERATE] Error:', _context.t0.message);

          if (_context.t0.response) {
            logger.error('[PAYMENT GENERATE] Response:', _context.t0.response.data);
          }

          throw _context.t0;

        case 55:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 49]]);
} // ============================================================
// CHECK PAYMENT STATUS (Polling ke LinkQu)
// ============================================================


function checkPaymentStatus(partnerReff) {
  var resp, data, isSuccess, _ref3, _ref4, rows, bookingId, pStatus;

  return regeneratorRuntime.async(function checkPaymentStatus$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          logger.info("\uD83D\uDD0D [POLLING VENDOR] Memeriksa Reff: ".concat(partnerReff));
          _context2.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(LINKQU_CONFIG.baseUrl, "/transaction/check-status"), {
            params: {
              partner_reff: partnerReff,
              username: LINKQU_CONFIG.username,
              pin: LINKQU_CONFIG.pin
            },
            headers: {
              'client-id': LINKQU_CONFIG.clientId,
              'client-secret': LINKQU_CONFIG.clientSecret
            },
            validateStatus: function validateStatus(status) {
              return status < 500;
            }
          }));

        case 4:
          resp = _context2.sent;
          data = resp.data;
          isSuccess = data.status && (data.status.toUpperCase() === 'SUCCESS' || data.status.toUpperCase() === 'SETTLED') || data.response_code === '00' || data.response_desc && data.response_desc.includes('SUCCESS'); // Ambil data dari database

          _context2.next = 9;
          return regeneratorRuntime.awrap(db.query("SELECT p.booking_id, p.payment_status, b.booking_status \n             FROM hotel_payments p\n             JOIN hotel_bookings b ON p.booking_id = b.id\n             WHERE p.payment_reff = ?", [partnerReff]));

        case 9:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          rows = _ref4[0];
          bookingId = null;

          if (rows.length > 0) {
            bookingId = rows[0].booking_id;
          } // Jika payment sukses, update database dan trigger vendor booking


          if (!(isSuccess && bookingId)) {
            _context2.next = 22;
            break;
          }

          logger.info("\u2705 [POLLING VENDOR SUCCESS] Transaksi ".concat(partnerReff, " VALID"));
          _context2.next = 18;
          return regeneratorRuntime.awrap(db.query("UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?", [partnerReff]));

        case 18:
          _context2.next = 20;
          return regeneratorRuntime.awrap(db.query("UPDATE hotel_bookings SET booking_status = 'PAID' WHERE id = ? AND booking_status NOT IN ('Accept', 'Processed')", [bookingId]));

        case 20:
          // 🔥 Trigger vendor booking (sama seperti di handleCallback)
          processHotelBookingToVendor(bookingId).then(function (result) {
            if (result.skipped) {
              logger.info("\u2139\uFE0F [VENDOR BOOKING/POLLING] Booking ".concat(bookingId, " dilewati: ").concat(result.reason));
            } else {
              logger.info("\u2705 [VENDOR BOOKING/POLLING] Booking ".concat(bookingId, " berhasil -> ").concat(result.reservationNo));
            }
          })["catch"](function (err) {
            logger.error("\uD83D\uDEA8 [CRITICAL/POLLING] Booking ".concat(bookingId, " dibayar tapi booking vendor GAGAL:"), err.message);
          });
          return _context2.abrupt("return", {
            status: 'SUCCESS',
            payment_status: 'SUCCESS',
            booking_id: bookingId,
            data: data
          });

        case 22:
          if (!(rows.length > 0)) {
            _context2.next = 26;
            break;
          }

          pStatus = (rows[0].payment_status || "").toUpperCase();

          if (!['SUCCESS', 'SETTLED', 'PAID'].includes(pStatus)) {
            _context2.next = 26;
            break;
          }

          return _context2.abrupt("return", {
            status: 'SUCCESS',
            payment_status: 'SUCCESS',
            booking_id: bookingId,
            data: data
          });

        case 26:
          logger.info("\u23F3 [POLLING PENDING] Reff ".concat(partnerReff, " belum dibayar."));
          return _context2.abrupt("return", {
            status: 'PENDING',
            message: 'Menunggu pembayaran',
            booking_id: bookingId
          });

        case 30:
          _context2.prev = 30;
          _context2.t0 = _context2["catch"](0);
          logger.error("\u274C [POLLING ERROR] ".concat(partnerReff, ":"), _context2.t0.message);
          return _context2.abrupt("return", {
            status: 'PENDING',
            error: _context2.t0.message
          });

        case 34:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 30]]);
} // ============================================================
// WEBHOOK HANDLER (LinkQu Callback)
// ============================================================


function handlePaymentWebhook(webhookData) {
  var partner_reff, status, statusUpper, _ref5, _ref6, rows, bookingId;

  return regeneratorRuntime.async(function handlePaymentWebhook$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.prev = 0;
          partner_reff = webhookData.partner_reff, status = webhookData.status;
          statusUpper = status ? status.toUpperCase() : "";
          logger.info("\uD83D\uDCE5 [PAYMENT WEBHOOK] Received: ".concat(partner_reff, " - ").concat(statusUpper));

          if (!(statusUpper === "SUCCESS" || statusUpper === "SETTLED")) {
            _context3.next = 23;
            break;
          }

          _context3.next = 7;
          return regeneratorRuntime.awrap(db.query("SELECT p.booking_id FROM hotel_payments p WHERE p.payment_reff = ?", [partner_reff]));

        case 7:
          _ref5 = _context3.sent;
          _ref6 = _slicedToArray(_ref5, 1);
          rows = _ref6[0];

          if (!(rows.length > 0)) {
            _context3.next = 21;
            break;
          }

          bookingId = rows[0].booking_id;
          _context3.next = 14;
          return regeneratorRuntime.awrap(db.query("UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?", [partner_reff]));

        case 14:
          _context3.next = 16;
          return regeneratorRuntime.awrap(db.query("UPDATE hotel_bookings SET booking_status = 'PAID' WHERE id = ? AND booking_status NOT IN ('Accept', 'Processed')", [bookingId]));

        case 16:
          logger.info("\u2705 [PAYMENT WEBHOOK] Reff ".concat(partner_reff, " set to PAID. Memproses booking ke vendor...")); // 🔥 Trigger vendor booking

          processHotelBookingToVendor(bookingId).then(function (result) {
            if (result.skipped) {
              logger.info("\u2139\uFE0F [VENDOR BOOKING/WEBHOOK] Booking ".concat(bookingId, " dilewati: ").concat(result.reason));
            } else {
              logger.info("\u2705 [VENDOR BOOKING/WEBHOOK] Booking ".concat(bookingId, " berhasil -> ").concat(result.reservationNo));
            }
          })["catch"](function (err) {
            logger.error("\uD83D\uDEA8 [CRITICAL/WEBHOOK] Booking ".concat(bookingId, " dibayar tapi booking vendor GAGAL:"), err.message);
          });
          return _context3.abrupt("return", {
            success: true,
            booking_id: bookingId,
            status: 'SETTLED'
          });

        case 21:
          logger.warn("\u26A0\uFE0F [PAYMENT WEBHOOK] Payment Reff ".concat(partner_reff, " not found in database."));
          return _context3.abrupt("return", {
            success: false,
            message: 'Payment reference not found'
          });

        case 23:
          return _context3.abrupt("return", {
            success: true,
            status: statusUpper || 'PENDING'
          });

        case 26:
          _context3.prev = 26;
          _context3.t0 = _context3["catch"](0);
          logger.error("\u274C [PAYMENT WEBHOOK ERROR]:", _context3.t0.message);
          throw _context3.t0;

        case 30:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[0, 26]]);
} // ============================================================
// CHECK PAYMENT FROM DATABASE (untuk internal)
// ============================================================


function getPaymentStatusFromDB(bookingId) {
  var _ref7, _ref8, rows;

  return regeneratorRuntime.async(function getPaymentStatusFromDB$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.prev = 0;
          _context4.next = 3;
          return regeneratorRuntime.awrap(db.query("SELECT * FROM hotel_payments WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1", [bookingId]));

        case 3:
          _ref7 = _context4.sent;
          _ref8 = _slicedToArray(_ref7, 1);
          rows = _ref8[0];

          if (!(rows.length === 0)) {
            _context4.next = 8;
            break;
          }

          return _context4.abrupt("return", {
            success: false,
            message: 'Payment not found'
          });

        case 8:
          return _context4.abrupt("return", {
            success: true,
            data: rows[0]
          });

        case 11:
          _context4.prev = 11;
          _context4.t0 = _context4["catch"](0);
          logger.error('[GET PAYMENT DB] Error:', _context4.t0.message);
          throw _context4.t0;

        case 15:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[0, 11]]);
} // ============================================================
// EXPORT MODULE
// ============================================================


module.exports = {
  // Main functions
  generatePayment: generatePayment,
  checkPaymentStatus: checkPaymentStatus,
  handlePaymentWebhook: handlePaymentWebhook,
  getPaymentStatusFromDB: getPaymentStatusFromDB,
  // Helpers
  formatPhoneNumber: formatPhoneNumber,
  getBankName: getBankName,
  generateSignature: generateSignature,
  LINKQU_CONFIG: LINKQU_CONFIG
};