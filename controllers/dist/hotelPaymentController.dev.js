"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var axios = require('axios');

var crypto = require('crypto');

var moment = require('moment-timezone');

var db = require('../config/db');

var _require = require('../utils/mailer'),
    sendBookingEmail = _require.sendBookingEmail;

var _require2 = require('../utils/hotelMailer'),
    sendBookingEmails = _require2.sendBookingEmails;

var config = {
  clientId: "testing",
  clientSecret: "123",
  username: "LI307GXIN",
  pin: "2K2NPCBBNNTovgB",
  serverKey: "LinkQu@2020",
  baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
};
/**
 * Helper untuk Signature Generator
 */

function generateSignature(path, method, data) {
  var rawValue = Object.values(data).join('') + config.clientId;
  var cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
  return crypto.createHmac("sha256", config.serverKey).update(path + method + cleaned).digest("hex");
}
/**
 * Helper untuk mengambil nilai valid (Anti-Strip)
 */


var getValidValue = function getValidValue(vendorVal, dbVal) {
  if (vendorVal && vendorVal !== "-" && vendorVal !== "" && vendorVal !== "null") {
    return vendorVal;
  }

  return dbVal || "-";
};

var HotelPaymentController = {
  createPayment: function createPayment(req, res) {
    var connection, _req$body, booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied, finalAmount, feeAdmin, finalCustomerName, finalCustomerEmail, formattedPhone, bankMap, bankName, partner_reff, expired, url_callback, _ref, _ref2, rows, b, commonData, endpoint, payloadLinkQu, signatureData, resp, linkquData, vaNumber, qrisImage, mysqlExpired, formatIDR, emailHtml;

    return regeneratorRuntime.async(function createPayment$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _req$body = req.body, booking_id = _req$body.booking_id, amount = _req$body.amount, customer_name = _req$body.customer_name, customer_phone = _req$body.customer_phone, customer_email = _req$body.customer_email, method = _req$body.method, bank_code = _req$body.bank_code, admin_fee_applied = _req$body.admin_fee_applied;
            finalAmount = Math.round(Number(amount));
            feeAdmin = Number(admin_fee_applied || 0);
            finalCustomerName = (customer_name || 'Customer').substring(0, 30).trim();
            finalCustomerEmail = (customer_email || 'guest@mail.com').trim();
            formattedPhone = customer_phone ? customer_phone.toString().trim().replace(/[^0-9]/g, '') : '';

            if (formattedPhone.startsWith('0')) {
              formattedPhone = '+62' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('8')) {
              formattedPhone = '+62' + formattedPhone;
            } else if (formattedPhone.startsWith('62') && !formattedPhone.startsWith('+')) {
              formattedPhone = '+' + formattedPhone;
            } else if (!formattedPhone.startsWith('+')) {
              formattedPhone = '+62' + formattedPhone;
            }

            if (formattedPhone.length < 10) formattedPhone = '+628123456789';
            bankMap = {
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
            bankName = bankMap[bank_code] || bank_code;
            partner_reff = "PAY-HTL-".concat(Date.now());
            expired = moment.tz('Asia/Jakarta').add(2, 'hours').format('YYYYMMDDHHmmss');
            url_callback = "https://darma.siappgo.id/api/hotel-payments/callback";
            _context.next = 16;
            return regeneratorRuntime.awrap(db.getConnection());

          case 16:
            connection = _context.sent;
            _context.next = 19;
            return regeneratorRuntime.awrap(connection.query("SELECT * FROM hotel_bookings WHERE id = ?", [booking_id]));

          case 19:
            _ref = _context.sent;
            _ref2 = _slicedToArray(_ref, 1);
            rows = _ref2[0];

            if (!(rows.length === 0)) {
              _context.next = 24;
              break;
            }

            return _context.abrupt("return", res.status(404).json({
              error: "Data booking hotel tidak ditemukan"
            }));

          case 24:
            b = rows[0];
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
              username: config.username,
              pin: config.pin,
              url_callback: url_callback
            });

            if (method === 'VA') {
              payloadLinkQu.bank_code = bank_code;
              signatureData = _objectSpread({}, commonData, {
                bank_code: bank_code
              });
              payloadLinkQu.signature = generateSignature(endpoint, 'POST', signatureData);
            } else {
              payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            }

            console.log("\uD83D\uDE80 [LINKQU REQ] Reff: ".concat(partner_reff));
            _context.next = 32;
            return regeneratorRuntime.awrap(axios.post("".concat(config.baseUrl).concat(endpoint), payloadLinkQu, {
              headers: {
                'client-id': config.clientId,
                'client-secret': config.clientSecret
              }
            }));

          case 32:
            resp = _context.sent;
            linkquData = resp.data;
            vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? linkquData.data.va_number : null);
            qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.qr_url : null);

            if (!(!vaNumber && !qrisImage)) {
              _context.next = 38;
              break;
            }

            throw new Error("Gagal mendapatkan instruksi pembayaran.");

          case 38:
            mysqlExpired = moment(expired, 'YYYYMMDDHHmmss').format('YYYY-MM-DD HH:mm:ss');
            _context.next = 41;
            return regeneratorRuntime.awrap(connection.query("INSERT INTO hotel_payments \n                    (booking_id, payment_reff, payment_method, va_number, qris_url, admin_fee, amount, payment_status, expired_date, created_at)\n                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())\n                 ON DUPLICATE KEY UPDATE \n                    payment_reff = VALUES(payment_reff),\n                    payment_method = VALUES(payment_method),\n                    va_number = VALUES(va_number),\n                    qris_url = VALUES(qris_url),\n                    payment_status = 'PENDING',\n                    expired_date = VALUES(expired_date)", [booking_id, partner_reff, method === 'VA' ? "VA-".concat(bankName) : 'QRIS', vaNumber, qrisImage, feeAdmin, finalAmount, mysqlExpired]));

          case 41:
            formatIDR = function formatIDR(num) {
              return new Intl.NumberFormat('id-ID').format(num);
            };

            emailHtml = "\n            <div style=\"font-family: Arial; max-width: 600px; margin: auto; border: 1px solid #24b3ae;\">\n                <div style=\"background: #24b3ae; color: white; padding: 15px; text-align: center;\"><h3>INSTRUKSI PEMBAYARAN</h3></div>\n                <div style=\"padding: 20px;\">\n                    <p>Halo ".concat(finalCustomerName, ", silakan bayar untuk <b>").concat(b.hotel_name, "</b></p>\n                    <h2 style=\"color: #e03f7d; text-align: center;\">").concat(vaNumber || 'Lihat QRIS', "</h2>\n                    <h3 style=\"text-align: center;\">TOTAL: Rp ").concat(formatIDR(finalAmount), "</h3>\n                </div>\n            </div>");
            sendBookingEmail(finalCustomerEmail, "Bayar Hotel - ".concat(b.reservation_no), emailHtml)["catch"](function (e) {
              return console.error("Email Error:", e.message);
            });
            return _context.abrupt("return", res.json({
              status: "Success",
              partner_reff: partner_reff,
              payment_info: {
                method: method,
                bankName: bankName,
                va_number: vaNumber,
                qris_url: qrisImage,
                amount: finalAmount
              }
            }));

          case 47:
            _context.prev = 47;
            _context.t0 = _context["catch"](0);
            console.error("❌ HTL Payment Error:", _context.t0.message);
            return _context.abrupt("return", res.status(500).json({
              status: "Error",
              message: "Gagal membuat kode pembayaran."
            }));

          case 51:
            _context.prev = 51;
            if (connection) connection.release();
            return _context.finish(51);

          case 54:
          case "end":
            return _context.stop();
        }
      }
    }, null, null, [[0, 47, 51, 54]]);
  },
  handleCallback: function handleCallback(req, res) {
    var _req$body2, partner_reff, status, statusUpper, _ref3, _ref4, rows, booking_id;

    return regeneratorRuntime.async(function handleCallback$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            console.log("📥 [HTL CALLBACK]", req.body);
            _context2.prev = 1;
            _req$body2 = req.body, partner_reff = _req$body2.partner_reff, status = _req$body2.status;
            statusUpper = status ? status.toUpperCase() : "";

            if (!(statusUpper === "SUCCESS" || statusUpper === "SETTLED")) {
              _context2.next = 18;
              break;
            }

            _context2.next = 7;
            return regeneratorRuntime.awrap(db.query("SELECT p.booking_id, b.reservation_no, b.os_ref_no \n                     FROM hotel_payments p \n                     JOIN hotel_bookings b ON p.booking_id = b.id \n                     WHERE p.payment_reff = ?", [partner_reff]));

          case 7:
            _ref3 = _context2.sent;
            _ref4 = _slicedToArray(_ref3, 1);
            rows = _ref4[0];

            if (!(rows.length > 0)) {
              _context2.next = 18;
              break;
            }

            booking_id = rows[0].booking_id; // 2. UPDATE SINKRON (AWAIT)
            // Pastikan database terupdate sebelum trigger email/PDF

            _context2.next = 14;
            return regeneratorRuntime.awrap(db.query("UPDATE hotel_payments SET payment_status = 'SETTLED', payment_date = NOW() WHERE payment_reff = ?", [partner_reff]));

          case 14:
            _context2.next = 16;
            return regeneratorRuntime.awrap(db.query("UPDATE hotel_bookings SET booking_status = 'Success' WHERE id = ?", [booking_id]));

          case 16:
            // 3. TRIGGER EMAIL DENGAN JEDA (Agar data matang di DB)
            // Fungsi ini di dalamnya harus melakukan SELECT ulang ke DB
            setTimeout(function () {
              sendBookingEmails(booking_id)["catch"](function (err) {
                return console.error("Email Voucher Error:", err);
              });
            }, 1500);
            console.log("\u2705 [HTL CALLBACK] Reff ".concat(partner_reff, " Finalized."));

          case 18:
            return _context2.abrupt("return", res.json({
              message: "OK"
            }));

          case 21:
            _context2.prev = 21;
            _context2.t0 = _context2["catch"](1);
            console.error("❌ HTL Callback Error:", _context2.t0.message);
            return _context2.abrupt("return", res.status(500).json({
              status: "ERROR"
            }));

          case 25:
          case "end":
            return _context2.stop();
        }
      }
    }, null, null, [[1, 21]]);
  },
  checkStatus: function checkStatus(req, res) {
    var reff, _ref5, _ref6, rows, b, resp, data, isSuccess, bookingId;

    return regeneratorRuntime.async(function checkStatus$(_context3) {
      while (1) {
        switch (_context3.prev = _context3.next) {
          case 0:
            reff = req.params.reff;
            _context3.prev = 1;
            _context3.next = 4;
            return regeneratorRuntime.awrap(db.query("SELECT p.booking_id, p.payment_status, b.booking_status, b.reservation_no \n                 FROM hotel_payments p\n                 JOIN hotel_bookings b ON p.booking_id = b.id\n                 WHERE p.payment_reff = ?", [reff]));

          case 4:
            _ref5 = _context3.sent;
            _ref6 = _slicedToArray(_ref5, 1);
            rows = _ref6[0];

            if (!(rows.length > 0)) {
              _context3.next = 11;
              break;
            }

            b = rows[0];

            if (!(['SUCCESS', 'SETTLED', 'PAID'].includes(b.payment_status.toUpperCase()) || b.booking_status.toUpperCase() === 'SUCCESS')) {
              _context3.next = 11;
              break;
            }

            return _context3.abrupt("return", res.json({
              status: 'SUCCESS',
              payment_status: 'SUCCESS',
              reservation_no: b.reservation_no
            }));

          case 11:
            _context3.next = 13;
            return regeneratorRuntime.awrap(axios.get("".concat(config.baseUrl, "/transaction/check-status"), {
              params: {
                partner_reff: reff,
                username: config.username,
                pin: config.pin
              },
              headers: {
                'client-id': config.clientId,
                'client-secret': config.clientSecret
              },
              validateStatus: function validateStatus(status) {
                return status < 500;
              }
            }));

          case 13:
            resp = _context3.sent;
            data = resp.data;
            isSuccess = data.status && ['SUCCESS', 'SETTLED'].includes(data.status.toUpperCase()) || data.response_code === '00';

            if (!isSuccess) {
              _context3.next = 22;
              break;
            }

            bookingId = rows[0].booking_id; // Update DB secara menyeluruh

            _context3.next = 20;
            return regeneratorRuntime.awrap(db.query("UPDATE hotel_payments p\n                     JOIN hotel_bookings b ON p.booking_id = b.id\n                     SET p.payment_status = 'SETTLED', p.payment_date = NOW(), b.booking_status = 'Success'\n                     WHERE p.payment_reff = ?", [reff]));

          case 20:
            // Kirim email setelah update sukses
            sendBookingEmails(bookingId)["catch"](function (err) {
              return console.error("Polling Email Error:", err);
            });
            return _context3.abrupt("return", res.json({
              status: 'SUCCESS',
              message: 'Pembayaran Berhasil',
              data: data
            }));

          case 22:
            return _context3.abrupt("return", res.json({
              status: 'PENDING',
              message: 'Menunggu pembayaran'
            }));

          case 25:
            _context3.prev = 25;
            _context3.t0 = _context3["catch"](1);
            return _context3.abrupt("return", res.json({
              status: 'PENDING',
              error: _context3.t0.message
            }));

          case 28:
          case "end":
            return _context3.stop();
        }
      }
    }, null, null, [[1, 25]]);
  }
};
module.exports = HotelPaymentController;