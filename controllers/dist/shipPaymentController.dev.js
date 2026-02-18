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
    sendBookingEmail = _require.sendBookingEmail; // Gunakan mailer yang sama


var config = {
  clientId: "testing",
  clientSecret: "123",
  username: "LI307GXIN",
  pin: "2K2NPCBBNNTovgB",
  serverKey: "LinkQu@2020",
  baseUrl: 'https://gateway-dev.linkqu.id/linkqu-partner'
};

function generateSignature(path, method, data) {
  var rawValue = Object.values(data).join('') + config.clientId;
  var cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
  return crypto.createHmac("sha256", config.serverKey).update(path + method + cleaned).digest("hex");
}

var ShipPaymentController = {
  createShipPayment: function createShipPayment(req, res) {
    var connection, _req$body, booking_id, amount, customer_name, customer_phone, customer_email, method, bank_code, admin_fee_applied, feeAdmin, formattedPhone, bankMap, bankName, partner_reff, expired, url_callback, _ref, _ref2, rows, b, commonData, endpoint, payloadLinkQu, resp, linkquData, vaNumber, qrisImage, subject, formatIDR, emailHtml;

    return regeneratorRuntime.async(function createShipPayment$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _req$body = req.body, booking_id = _req$body.booking_id, amount = _req$body.amount, customer_name = _req$body.customer_name, customer_phone = _req$body.customer_phone, customer_email = _req$body.customer_email, method = _req$body.method, bank_code = _req$body.bank_code, admin_fee_applied = _req$body.admin_fee_applied;
            feeAdmin = Number(admin_fee_applied || 0); // 1. Format Phone (Standardisasi ke format Internasional)

            formattedPhone = customer_phone ? customer_phone.toString().trim() : '';
            formattedPhone = formattedPhone.replace(/[^0-9+]/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);
            bankMap = {
              "002": "BRI",
              "008": "MANDIRI",
              "009": "BNI",
              "014": "BCA",
              "451": "BSI",
              "013": "PERMATA"
            };
            bankName = bankMap[bank_code] || bank_code;
            partner_reff = "SHIP-PAY-".concat(Date.now());
            expired = moment.tz('Asia/Jakarta').add(60, 'minutes').format('YYYYMMDDHHmmss');
            url_callback = "https://darma.siappgo.id/api/ship/callback";
            _context.next = 13;
            return regeneratorRuntime.awrap(db.getConnection());

          case 13:
            connection = _context.sent;
            _context.next = 16;
            return regeneratorRuntime.awrap(connection.query("SELECT * FROM bookings_pelni WHERE num_code = ? ORDER BY id DESC LIMIT 1", [booking_id]));

          case 16:
            _ref = _context.sent;
            _ref2 = _slicedToArray(_ref, 1);
            rows = _ref2[0];

            if (!(rows.length === 0)) {
              _context.next = 21;
              break;
            }

            return _context.abrupt("return", res.status(404).json({
              error: "Data booking kapal tidak ditemukan di sistem kami."
            }));

          case 21:
            b = rows[0]; // B. Persiapan Payload LinkQu

            commonData = {
              amount: amount,
              expired: expired,
              partner_reff: partner_reff,
              customer_id: formattedPhone,
              customer_name: customer_name,
              customer_email: customer_email
            };
            endpoint = method === 'VA' ? '/transaction/create/va' : '/transaction/create/qris';
            payloadLinkQu = _objectSpread({}, commonData, {
              username: config.username,
              pin: config.pin,
              url_callback: url_callback
            });

            if (method === 'VA') {
              payloadLinkQu.bank_code = bank_code;
              payloadLinkQu.signature = generateSignature(endpoint, 'POST', {
                amount: amount,
                expired: expired,
                bank_code: bank_code,
                partner_reff: partner_reff,
                customer_id: formattedPhone,
                customer_name: customer_name,
                customer_email: customer_email
              });
            } else {
              payloadLinkQu.signature = generateSignature(endpoint, 'POST', commonData);
            } // C. Request ke API LinkQu (Payment Gateway)


            _context.next = 28;
            return regeneratorRuntime.awrap(axios.post("".concat(config.baseUrl).concat(endpoint), payloadLinkQu, {
              headers: {
                'client-id': config.clientId,
                'client-secret': config.clientSecret,
                'Content-Type': 'application/json'
              }
            }));

          case 28:
            resp = _context.sent;
            linkquData = resp.data; // Ambil VA atau QRIS dari response LinkQu

            vaNumber = linkquData.virtual_account || linkquData.va_number || (linkquData.data ? linkquData.data.va_number : null);
            qrisImage = linkquData.imageqris || linkquData.qr_url || (linkquData.data ? linkquData.data.qr_url : null); // D. UPDATE DATABASE menggunakan ID internal hasil select tadi

            _context.next = 34;
            return regeneratorRuntime.awrap(connection.query("UPDATE bookings_pelni SET \n                payment_reff = ?, \n                payment_method = ?, \n                va_number = ?, \n                qris_url = ?,\n                admin_fee = ?\n             WHERE id = ?", [partner_reff, method === 'VA' ? "VA-".concat(bankName) : 'QRIS', vaNumber, qrisImage, feeAdmin, b.id]));

          case 34:
            // E. Kirim Email Instruksi Pembayaran Kapal
            subject = "[PELNI] Instruksi Pembayaran - ".concat(b.num_code);

            formatIDR = function formatIDR(num) {
              return new Intl.NumberFormat('id-ID').format(num);
            };

            emailHtml = "\n            <div style=\"font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eeeeee; border-radius: 8px; overflow: hidden;\">\n                <div style=\"background: #0054a6; color: white; padding: 30px; text-align: center;\">\n                    <h2 style=\"margin: 0;\">PEMBAYARAN TIKET PELNI</h2>\n                    <p style=\"margin: 5px 0 0 0; opacity: 0.8;\">Segera selesaikan pembayaran Anda</p>\n                </div>\n                <div style=\"padding: 25px; color: #333333;\">\n                    <p>Halo <b>".concat(customer_name, "</b>,</p>\n                    <p>Terima kasih telah memesan tiket kapal di platform kami. Berikut adalah detail pesanan Anda:</p>\n                    \n                    <table style=\"width: 100%; border-collapse: collapse; margin: 20px 0; background: #fcfcfc;\">\n                        <tr><td style=\"padding: 8px; color: #666;\">Kode Reservasi</td><td style=\"padding: 8px;\"><b>").concat(b.num_code, "</b></td></tr>\n                        <tr><td style=\"padding: 8px; color: #666;\">Nama Kapal</td><td style=\"padding: 8px;\">").concat(b.ship_name || 'Pelni Ship', "</td></tr>\n                        <tr><td style=\"padding: 8px; color: #666;\">Rute</td><td style=\"padding: 8px;\">").concat(b.origin_name, " &rarr; ").concat(b.destination_name, "</td></tr>\n                        <tr><td style=\"padding: 8px; color: #666;\">Keberangkatan</td><td style=\"padding: 8px;\">").concat(moment(b.depart_date).format('DD MMM YYYY, HH:mm'), " WIB</td></tr>\n                    </table>\n\n                    <div style=\"background: #fff4f7; padding: 20px; border-radius: 10px; text-align: center; border: 1px dashed #e03f7d;\">\n                        <p style=\"margin:0; font-size: 14px; color: #666;\">Total Tagihan:</p>\n                        <h1 style=\"color: #e03f7d; margin: 5px 0; font-size: 32px;\">Rp ").concat(formatIDR(amount), "</h1>\n                        \n                        ").concat(method === 'VA' ? "\n                            <p style=\"margin-top: 15px; color: #444;\">Transfer ke <b>Bank ".concat(bankName, "</b> Virtual Account:</p>\n                            <div style=\"background: #ffffff; padding: 10px; font-size: 24px; font-weight: bold; letter-spacing: 3px; color: #0054a6; border-radius: 5px;\">").concat(vaNumber, "</div>\n                        ") : "\n                            <p style=\"margin-top: 15px; color: #444;\">Scan Kode QRIS di bawah ini:</p>\n                            <img src=\"".concat(qrisImage, "\" style=\"width: 220px; border: 5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);\" />\n                        "), "\n                    </div>\n                    \n                    <p style=\"font-size: 12px; color: #888; margin-top: 25px; text-align: center;\">\n                        *Pembayaran akan diverifikasi otomatis oleh sistem kami.<br>\n                        Mohon selesaikan pembayaran sebelum 60 menit.\n                    </p>\n                </div>\n                <div style=\"background: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #999;\">\n                    &copy; ").concat(new Date().getFullYear(), " SiappGo - Tiket Kapal Laut Indonesia\n                </div>\n            </div>"); // Kirim email tanpa menunggu (background process)

            sendBookingEmail(customer_email, subject, emailHtml)["catch"](function (e) {
              return console.error("❌ Email Error:", e);
            }); // Berikan response sukses ke Frontend

            return _context.abrupt("return", res.json({
              status: "Success",
              partner_reff: partner_reff,
              data: _objectSpread({}, linkquData, {
                virtual_account: vaNumber,
                qr_url: qrisImage
              })
            }));

          case 41:
            _context.prev = 41;
            _context.t0 = _context["catch"](0);
            console.error("❌ Ship Payment Critical Error:", _context.t0.message);
            return _context.abrupt("return", res.status(500).json({
              error: "Gagal membuat pembayaran: " + _context.t0.message
            }));

          case 45:
            _context.prev = 45;
            if (connection) connection.release();
            return _context.finish(45);

          case 48:
          case "end":
            return _context.stop();
        }
      }
    }, null, null, [[0, 41, 45, 48]]);
  },
  handleShipCallback: function handleShipCallback(req, res) {
    var _req$body2, partner_reff, status;

    return regeneratorRuntime.async(function handleShipCallback$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            console.log("📥 [SHIP CALLBACK] Received:", req.body.partner_reff);
            _context2.prev = 1;
            _req$body2 = req.body, partner_reff = _req$body2.partner_reff, status = _req$body2.status;

            if (!(status === "SUCCESS" || status === "SETTLED")) {
              _context2.next = 6;
              break;
            }

            _context2.next = 6;
            return regeneratorRuntime.awrap(db.query("UPDATE bookings_pelni SET payment_status = 'SUCCESS' WHERE payment_reff = ?", [partner_reff]));

          case 6:
            return _context2.abrupt("return", res.json({
              message: "OK"
            }));

          case 9:
            _context2.prev = 9;
            _context2.t0 = _context2["catch"](1);
            return _context2.abrupt("return", res.status(500).json({
              status: "ERROR",
              message: _context2.t0.message
            }));

          case 12:
          case "end":
            return _context2.stop();
        }
      }
    }, null, null, [[1, 9]]);
  }
};
module.exports = ShipPaymentController;