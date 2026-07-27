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

var _require = require('../helpers/darmaSandbox'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger;

var _require2 = require('./hotelMailer'),
    sendBookingEmails = _require2.sendBookingEmails; // ❌ HAPUS function extractNumericId(...) { ... } — tidak diperlukan lagi


function safeUpdateStatus(connection, bookingId, status) {
  var safeStatus;
  return regeneratorRuntime.async(function safeUpdateStatus$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          safeStatus = String(status).substring(0, 45);
          _context.next = 4;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET booking_status = ?, updated_at = NOW() WHERE id = ?", [safeStatus, bookingId]));

        case 4:
          _context.next = 9;
          break;

        case 6:
          _context.prev = 6;
          _context.t0 = _context["catch"](0);
          logger.error("\u26A0\uFE0F [STATUS UPDATE FAILED] Booking ".concat(bookingId, ": ").concat(_context.t0.message));

        case 9:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 6]]);
}

function processHotelBookingToVendor(bookingId) {
  var connection, _ref, _ref2, rows, booking, required, missing, _ref3, _ref4, paxes, token, checkInISO, checkOutISO, roomId, hotelId, cityId, internalCode, roomRequestOriginal, priceInfoPayload, priceRes, p, reason, bookingPayload, bookingRes, resData, msg, isProcessed, isAccepted, finalStatus;

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

          throw new Error("Booking ID ".concat(bookingId, " tidak ditemukan."));

        case 11:
          booking = rows[0];

          if (!['Accept', 'Processed'].includes(booking.booking_status)) {
            _context2.next = 15;
            break;
          }

          logger.info("[VENDOR BOOKING] Booking ".concat(bookingId, " sudah diproses (status: ").concat(booking.booking_status, ")."));
          return _context2.abrupt("return", {
            skipped: true,
            reason: 'already_processed',
            bookingId: bookingId,
            status: booking.booking_status
          });

        case 15:
          required = ['city_id', 'hotel_id', 'room_id', 'internal_code', 'check_in_date', 'check_out_date'];
          missing = required.filter(function (field) {
            return !booking[field];
          });

          if (!(missing.length > 0)) {
            _context2.next = 19;
            break;
          }

          throw new Error("Data booking tidak lengkap: ".concat(missing.join(', ')));

        case 19:
          _context2.next = 21;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?", [bookingId]));

        case 21:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];

          if (!(paxes.length === 0)) {
            _context2.next = 26;
            break;
          }

          throw new Error("Data tamu (paxes) untuk booking ".concat(bookingId, " kosong."));

        case 26:
          _context2.next = 28;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 28:
          token = _context2.sent;
          checkInISO = new Date(booking.check_in_date).toISOString();
          checkOutISO = new Date(booking.check_out_date).toISOString(); // ✅ PAKAI LANGSUNG hasil dari cleanIdForStorage di draft route — jangan dipotong lagi

          roomId = String(booking.room_id || "").trim();
          hotelId = String(booking.hotel_id || "").trim();
          cityId = String(booking.city_id || "").trim();
          internalCode = String(booking.internal_code || "SUP").trim();
          logger.info("\uD83D\uDD0D [BOOKING ".concat(bookingId, "] RoomID: ").concat(roomId, ", HotelID: ").concat(hotelId, ", City: ").concat(cityId));
          roomRequestOriginal = {
            roomType: booking.room_type !== null && booking.room_type !== undefined ? Number(booking.room_type) : 0,
            isRequestChildBed: false,
            childNum: booking.child_num || 0,
            childAges: booking.child_ages ? typeof booking.child_ages === 'string' ? JSON.parse(booking.child_ages) : booking.child_ages : [0]
          };
          priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: cityId,
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [roomRequestOriginal],
            // ✅ pakai nilai asli, bukan hardcode
            internalCode: internalCode,
            hotelID: hotelId,
            breakfast: booking.breakfast_type || "Room Only",
            roomID: roomId,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_VENDOR_PRICE_INFO", priceInfoPayload);
          _context2.next = 41;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }));

        case 41:
          priceRes = _context2.sent;
          p = priceRes.data;
          logger.debug("RES_VENDOR_PRICE_INFO", p);

          if (!(p.status !== "SUCCESS")) {
            _context2.next = 50;
            break;
          }

          _context2.next = 47;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM'));

        case 47:
          reason = p.respMessage || "Kamar tidak tersedia.";
          logger.error("\uD83D\uDEA8 [CRITICAL] Booking ".concat(bookingId, " gagal: ").concat(reason));
          throw new Error("".concat(reason, " PERLU TINDAKAN MANUAL / REFUND."));

        case 50:
          bookingPayload = {
            paxPassport: p.paxPassport || "ID",
            countryID: p.countryID || "ID",
            cityID: p.cityID || cityId,
            checkInDate: p.checkInDate || checkInISO,
            checkOutDate: p.checkOutDate || checkOutISO,
            roomRequest: (p.roomRequest || []).map(function (room) {
              return _objectSpread({}, room, {
                paxes: paxes.map(function (px) {
                  return {
                    title: px.title || 'Mr.',
                    firstName: (px.firstName || 'Guest').trim(),
                    lastName: (px.lastName || 'User').trim()
                  };
                }),
                email: booking.contact_email || 'guest@mail.com',
                phone: booking.contact_phone || '08123456789'
              });
            }),
            internalCode: p.internalCode || internalCode,
            hotelID: p.hotelID || hotelId,
            breakfast: p.breakfast || booking.breakfast_type || "Room Only",
            roomID: p.roomID || roomId,
            bedType: p.bedTypes && p.bedTypes[0] ? {
              ID: p.bedTypes[0].ID || "",
              bed: p.bedTypes[0].bed || ""
            } : {
              ID: "",
              bed: ""
            },
            agentOsRef: "HTL-".concat(bookingId, "-").concat(Date.now()),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_VENDOR_BOOKING", bookingPayload);
          _context2.next = 54;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), bookingPayload, {
            httpsAgent: agent,
            timeout: 60000,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }));

        case 54:
          bookingRes = _context2.sent;
          resData = bookingRes.data;
          logger.debug("RES_VENDOR_BOOKING", resData);
          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

          if (resData.status === "SUCCESS" || isAccepted || isProcessed) {
            _context2.next = 65;
            break;
          }

          _context2.next = 63;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED'));

        case 63:
          logger.error("\uD83D\uDEA8 [CRITICAL] Booking ".concat(bookingId, " ditolak vendor: ").concat(resData.respMessage));
          throw new Error("".concat(resData.respMessage || "Vendor menolak booking", " PERLU TINDAKAN MANUAL / REFUND."));

        case 65:
          finalStatus = isProcessed ? 'Processed' : 'Accept';

          if (isProcessed) {
            resData.reservationNo = resData.reservationNo || "PRC-".concat(Date.now());
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          }

          _context2.next = 69;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET\n                reservation_no = ?,\n                voucher_no = ?,\n                os_ref_no = ?,\n                agent_os_ref = ?,\n                hotel_name = ?,\n                hotel_address = ?,\n                room_name = ?,\n                booking_status = ?,\n                updated_at = NOW()\n             WHERE id = ?", [resData.reservationNo || booking.reservation_no, resData.voucherNo || resData.reservationNo || booking.voucher_no, resData.osRefNo || booking.os_ref_no || null, bookingPayload.agentOsRef, resData.hotelName || booking.hotel_name, resData.hotelAddress || booking.hotel_address, resData.roomName || booking.room_name, finalStatus, bookingId]));

        case 69:
          logger.success("\u2705 [VENDOR BOOKING] Booking ".concat(bookingId, " sukses -> ").concat(resData.reservationNo, " (").concat(finalStatus, ")"));
          sendBookingEmails(bookingId)["catch"](function (err) {
            return logger.error("[MAIL ERROR] Booking ".concat(bookingId, ": ").concat(err.message));
          });
          return _context2.abrupt("return", {
            success: true,
            status: finalStatus,
            reservationNo: resData.reservationNo,
            bookingId: bookingId,
            vendorResponse: resData
          });

        case 74:
          _context2.prev = 74;
          _context2.t0 = _context2["catch"](0);
          logger.error("\u274C [VENDOR BOOKING ERROR] Booking ".concat(bookingId, ": ").concat(_context2.t0.message));
          throw _context2.t0;

        case 78:
          _context2.prev = 78;
          if (connection) connection.release();
          return _context2.finish(78);

        case 81:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 74, 78, 81]]);
}

module.exports = {
  processHotelBookingToVendor: processHotelBookingToVendor
};