"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// helpers/ticketService.js
var axios = require('axios');

var db = require('../config/db');

var _require = require('./darmaHelper'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken;

function issueTicketForBooking(bookingCode) {
  var _ref, _ref2, rows, b, token, response;

  return regeneratorRuntime.async(function issueTicketForBooking$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.next = 2;
          return regeneratorRuntime.awrap(db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]));

        case 2:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];

          if (!(rows.length === 0)) {
            _context.next = 7;
            break;
          }

          throw new Error("Booking tidak ditemukan: " + bookingCode);

        case 7:
          b = rows[0]; // Guard: kalau sudah ticketed, jangan issue ulang

          if (!((b.ticket_status || '').toLowerCase() === 'ticketed')) {
            _context.next = 10;
            break;
          }

          return _context.abrupt("return", {
            status: "SUCCESS",
            already: true
          });

        case 10:
          _context.next = 12;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 12:
          token = _context.sent;
          _context.next = 15;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Airline/Issued"), {
            airlineID: b.airline_id,
            origin: (b.origin || "").substring(0, 3),
            destination: (b.destination || "").substring(0, 3),
            tripType: b.trip_type || "OneWay",
            departDate: b.depart_date,
            returnDate: "0001-01-01T00:00:00",
            bookingCode: b.booking_code,
            bookingDate: b.created_at,
            // sesuaikan kolom timestamp booking Anda
            airlineAccessCode: b.airline_id,
            userID: USER_CONFIG.userID,
            accessToken: token
          }, {
            httpsAgent: agent
          }));

        case 15:
          response = _context.sent;

          if (!(response.data.status === "SUCCESS")) {
            _context.next = 20;
            break;
          }

          _context.next = 19;
          return regeneratorRuntime.awrap(db.execute("UPDATE bookings SET ticket_status = 'Ticketed' WHERE booking_code = ?", [bookingCode]));

        case 19:
          sendTicketEmail(bookingCode)["catch"](function (e) {
            return console.error("Email Error:", e.message);
          });

        case 20:
          return _context.abrupt("return", response.data);

        case 21:
        case "end":
          return _context.stop();
      }
    }
  });
}

module.exports = {
  issueTicketForBooking: issueTicketForBooking,
  sendTicketEmail: sendTicketEmail,
  getTicketHtmlContent: getTicketHtmlContent,
  generatePdfBuffer: generatePdfBuffer
};