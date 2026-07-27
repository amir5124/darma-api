"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// utils/hotelBookingProcessor.js
var axios = require('axios');

var db = require('../config/db');

var _require = require('../helpers/darmaHelper'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger;

var _require2 = require('./hotelMailer'),
    sendBookingEmails = _require2.sendBookingEmails;
/**
 * Helper: update booking_status dengan aman.
 * Kalau UPDATE ini sendiri gagal (misal kolom kepanjangan di masa depan),
 * jangan biarkan error-nya menutupi pesan error bisnis asli — cukup log terpisah.
 */


function safeUpdateStatus(connection, bookingId, status) {
  var extra,
      safeStatus,
      _args = arguments;
  return regeneratorRuntime.async(function safeUpdateStatus$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          extra = _args.length > 3 && _args[3] !== undefined ? _args[3] : {};
          _context.prev = 1;
          // Truncate defensif — jaga-jaga kalau suatu saat ada status baru yang lebih panjang dari kolom
          safeStatus = String(status).substring(0, 45);
          _context.next = 5;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET booking_status = ?, updated_at = NOW() WHERE id = ?", [safeStatus, bookingId]));

        case 5:
          _context.next = 10;
          break;

        case 7:
          _context.prev = 7;
          _context.t0 = _context["catch"](1);
          logger.error("\u26A0\uFE0F [STATUS UPDATE FAILED] Booking ".concat(bookingId, " gagal update status ke '").concat(status, "': ").concat(_context.t0.message)); // Sengaja tidak di-throw — supaya error bisnis asli (di pemanggil) tetap yang muncul ke log/alert

        case 10:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[1, 7]]);
}

function processHotelBookingToVendor(bookingId) {
  var connection, _ref, _ref2, rows, booking, _ref3, _ref4, paxes, token, checkInISO, checkOutISO, priceInfoPayload, priceRes, p, reason, bookingPayload, bookingRes, resData, msg, isProcessed, isAccepted, finalStatus;

  return regeneratorRuntime.async(function processHotelBookingToVendor$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          _context2.next = 3;
          return regeneratorRuntime.awrap(db.getConnection());

        case 3:
          connection = _context2.sent;
          _context2.next = 6;
          return regeneratorRuntime.awrap(connection.execute("SELECT * FROM hotel_bookings WHERE id = ?", [bookingId]));

        case 6:
          _ref = _context2.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];

          if (!(rows.length === 0)) {
            _context2.next = 11;
            break;
          }

          throw new Error("Booking ID ".concat(bookingId, " tidak ditemukan di database."));

        case 11:
          booking = rows[0];

          if (!['Accept', 'Processed'].includes(booking.booking_status)) {
            _context2.next = 15;
            break;
          }

          logger.info("[VENDOR BOOKING] Booking ID ".concat(bookingId, " sudah pernah diproses (status: ").concat(booking.booking_status, "). Dilewati."));
          return _context2.abrupt("return", {
            skipped: true,
            reason: 'already_processed',
            bookingId: bookingId,
            status: booking.booking_status
          });

        case 15:
          _context2.next = 17;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?", [bookingId]));

        case 17:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];

          if (!(paxes.length === 0)) {
            _context2.next = 22;
            break;
          }

          throw new Error("Data tamu (paxes) untuk booking ID ".concat(bookingId, " kosong \u2014 tidak bisa lanjut booking ke vendor."));

        case 22:
          _context2.next = 24;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 24:
          token = _context2.sent;
          checkInISO = new Date(booking.check_in_date).toISOString();
          checkOutISO = new Date(booking.check_out_date).toISOString();
          priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: String(booking.city_id || ""),
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [{
              roomType: 0,
              isRequestChildBed: false,
              childNum: 0,
              childAges: [0]
            }],
            internalCode: booking.internal_code,
            hotelID: String(booking.hotel_id),
            breakfast: booking.breakfast_type,
            roomID: String(booking.room_id),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_VENDOR_PRICE_INFO (post-payment)", priceInfoPayload);
          _context2.next = 31;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000
          }));

        case 31:
          priceRes = _context2.sent;
          p = priceRes.data; // ✅ LOG RESPONSE — ini yang hilang sebelumnya, bikin kita tidak tahu alasan gagal

          logger.debug("RES_VENDOR_PRICE_INFO (post-payment)", JSON.stringify(p));

          if (!(p.status !== "SUCCESS")) {
            _context2.next = 40;
            break;
          }

          _context2.next = 37;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM'));

        case 37:
          reason = p.respMessage || "Kamar tidak lagi tersedia di vendor setelah pembayaran.";
          logger.error("\uD83D\uDEA8 [CRITICAL] Booking ID ".concat(bookingId, " DIBAYAR tapi kamar/harga tidak valid lagi: ").concat(reason));
          throw new Error(reason + " PERLU TINDAKAN MANUAL / REFUND.");

        case 40:
          bookingPayload = {
            paxPassport: p.paxPassport || "ID",
            countryID: p.countryID || "ID",
            cityID: p.cityID,
            checkInDate: p.checkInDate,
            checkOutDate: p.checkOutDate,
            roomRequest: (p.roomRequest || []).map(function (room) {
              return _objectSpread({}, room, {
                paxes: paxes.map(function (px) {
                  return {
                    title: px.title || 'Mr.',
                    firstName: (px.firstName || 'Guest').trim(),
                    lastName: (px.lastName || 'User').trim()
                  };
                }),
                email: booking.contact_email,
                phone: booking.contact_phone
              });
            }),
            internalCode: p.internalCode,
            hotelID: p.hotelID,
            breakfast: p.breakfast,
            roomID: p.roomID,
            bedType: p.bedTypes && p.bedTypes[0] ? {
              ID: p.bedTypes[0].ID,
              bed: p.bedTypes[0].bed
            } : {
              ID: "",
              bed: ""
            },
            agentOsRef: "HTL-".concat(bookingId, "-").concat(Date.now()),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_VENDOR_BOOKING (post-payment)", bookingPayload);
          _context2.next = 44;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), bookingPayload, {
            httpsAgent: agent,
            timeout: 60000
          }));

        case 44:
          bookingRes = _context2.sent;
          resData = bookingRes.data; // ✅ LOG RESPONSE — sama, wajib ada untuk audit

          logger.debug("RES_VENDOR_BOOKING (post-payment)", JSON.stringify(resData));
          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

          if (resData.status === "SUCCESS" || isAccepted || isProcessed) {
            _context2.next = 55;
            break;
          }

          _context2.next = 53;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED'));

        case 53:
          logger.error("\uD83D\uDEA8 [CRITICAL] Booking ID ".concat(bookingId, " DIBAYAR tapi DITOLAK vendor: ").concat(resData.respMessage));
          throw new Error(resData.respMessage || "Vendor menolak booking setelah pembayaran diterima. PERLU TINDAKAN MANUAL / REFUND.");

        case 55:
          finalStatus = isProcessed ? 'Processed' : 'Accept';

          if (isProcessed) {
            resData.reservationNo = resData.reservationNo || "PRC-".concat(Date.now());
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context2.next = 59;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET\n                reservation_no = ?,\n                voucher_no = ?,\n                os_ref_no = ?,\n                agent_os_ref = ?,\n                hotel_name = ?,\n                hotel_address = ?,\n                room_name = ?,\n                booking_status = ?,\n                updated_at = NOW()\n             WHERE id = ?", [resData.reservationNo, resData.voucherNo || resData.reservationNo, resData.osRefNo || null, bookingPayload.agentOsRef, resData.hotelName || booking.hotel_name, resData.hotelAddress || booking.hotel_address, resData.roomName || booking.room_name, finalStatus, bookingId]));

        case 59:
          logger.info("\u2705 [VENDOR BOOKING] Booking ID ".concat(bookingId, " sukses -> Reservasi: ").concat(resData.reservationNo, " (").concat(finalStatus, ")"));
          sendBookingEmails(bookingId)["catch"](function (err) {
            return logger.error("[MAIL ERROR] Booking ID ".concat(bookingId, ": ").concat(err.message));
          });
          return _context2.abrupt("return", {
            success: true,
            status: finalStatus,
            reservationNo: resData.reservationNo,
            bookingId: bookingId
          });

        case 64:
          _context2.prev = 64;
          _context2.t0 = _context2["catch"](0);
          logger.error("\u274C [VENDOR BOOKING ERROR] Booking ID ".concat(bookingId, ": ").concat(_context2.t0.message));
          throw _context2.t0;

        case 68:
          _context2.prev = 68;
          if (connection) connection.release();
          return _context2.finish(68);

        case 71:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 64, 68, 71]]);
}

module.exports = {
  processHotelBookingToVendor: processHotelBookingToVendor
};