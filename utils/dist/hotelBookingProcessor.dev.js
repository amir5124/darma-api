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
    getConsistentToken = _require.getConsistentToken;

var _require2 = require('./hotelMailer'),
    sendBookingEmails = _require2.sendBookingEmails;
/**
 * Helper: Bersihkan ID dari separator '~||~'
 * Contoh: "67553690~||~10" → "67553690"
 *         "1063745958|...|A~||~67553690~||~10~||~SUP" → "1063745958|...|A"
 */


function cleanId(id) {
  if (!id) return id; // Jika ada '~||~', ambil bagian sebelum separator pertama

  var parts = String(id).split('~||~');
  return parts[0] || id;
}
/**
 * Helper: Bersihkan roomID yang mungkin mengandung separator
 * Room ID format: "1063745958|roomCateg.Promotionid|22633273|v1_...|A~||~67553690~||~10~||~SUP"
 * Yang dibutuhkan hanya bagian sebelum '~||~'
 */


function cleanRoomId(roomId) {
  if (!roomId) return roomId;
  var parts = String(roomId).split('~||~');
  return parts[0] || roomId;
}
/**
 * Helper: update booking_status dengan aman.
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
          safeStatus = String(status).substring(0, 45);
          _context.next = 5;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET booking_status = ?, updated_at = NOW() WHERE id = ?", [safeStatus, bookingId]));

        case 5:
          _context.next = 10;
          break;

        case 7:
          _context.prev = 7;
          _context.t0 = _context["catch"](1);
          console.error("\u26A0\uFE0F [STATUS UPDATE FAILED] Booking ".concat(bookingId, " gagal update status ke '").concat(status, "': ").concat(_context.t0.message));

        case 10:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[1, 7]]);
}
/**
 * Helper: validasi data booking sebelum dikirim ke vendor
 */


function validateBookingData(booking) {
  var required = ['city_id', 'hotel_id', 'room_id', 'internal_code', 'check_in_date', 'check_out_date'];
  var missing = required.filter(function (field) {
    return !booking[field];
  });

  if (missing.length > 0) {
    throw new Error("Data booking tidak lengkap. Field yang kosong: ".concat(missing.join(', ')));
  }

  return true;
}

function processHotelBookingToVendor(bookingId) {
  var connection, _ref, _ref2, rows, booking, _ref3, _ref4, paxes, token, checkInISO, checkOutISO, rawRoomId, rawHotelId, cleanCityId, cleanInternalCode, cleanRoomIdForVendor, cleanHotelIdForVendor, priceInfoPayload, priceRes, p, reason, vendorRoomId, vendorHotelId, vendorCityId, vendorInternalCode, bookingPayload, bookingRes, resData, msg, isProcessed, isAccepted, finalStatus;

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
          booking = rows[0]; // 2. Cek status - sudah diproses atau belum

          if (!['Accept', 'Processed'].includes(booking.booking_status)) {
            _context2.next = 15;
            break;
          }

          console.info("[VENDOR BOOKING] Booking ID ".concat(bookingId, " sudah pernah diproses (status: ").concat(booking.booking_status, "). Dilewati."));
          return _context2.abrupt("return", {
            skipped: true,
            reason: 'already_processed',
            bookingId: bookingId,
            status: booking.booking_status
          });

        case 15:
          _context2.prev = 15;
          validateBookingData(booking);
          _context2.next = 25;
          break;

        case 19:
          _context2.prev = 19;
          _context2.t0 = _context2["catch"](15);
          _context2.next = 23;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_INVALID_DATA'));

        case 23:
          console.error("\u274C [VALIDATION ERROR] Booking ".concat(bookingId, ": ").concat(_context2.t0.message));
          throw _context2.t0;

        case 25:
          _context2.next = 27;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?", [bookingId]));

        case 27:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];

          if (!(paxes.length === 0)) {
            _context2.next = 32;
            break;
          }

          throw new Error("Data tamu (paxes) untuk booking ID ".concat(bookingId, " kosong \u2014 tidak bisa lanjut booking ke vendor."));

        case 32:
          _context2.next = 34;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 34:
          token = _context2.sent;
          // 6. Format tanggal
          checkInISO = new Date(booking.check_in_date).toISOString();
          checkOutISO = new Date(booking.check_out_date).toISOString(); // 7. 🔥 PERBAIKAN: BERSIHKAN ID DARI SEPARATOR '~||~'

          rawRoomId = String(booking.room_id || "").trim();
          rawHotelId = String(booking.hotel_id || "").trim();
          cleanCityId = String(booking.city_id || "").trim();
          cleanInternalCode = String(booking.internal_code || "SUP").trim(); // 🔥 KRITIS: Bersihkan room_id dan hotel_id

          cleanRoomIdForVendor = cleanRoomId(rawRoomId);
          cleanHotelIdForVendor = cleanId(rawHotelId);
          console.log("\uD83D\uDD0D [CLEANING] Booking ".concat(bookingId, ":"), {
            originalRoomId: rawRoomId,
            cleanRoomId: cleanRoomIdForVendor,
            originalHotelId: rawHotelId,
            cleanHotelId: cleanHotelIdForVendor,
            cityId: cleanCityId,
            internalCode: cleanInternalCode
          }); // 8. LOG data sebelum kirim ke vendor

          console.log("\uD83D\uDD0D [PRE-VENDOR CHECK] Booking ".concat(bookingId, ":"), {
            cityID: cleanCityId,
            hotelID: cleanHotelIdForVendor,
            roomID: cleanRoomIdForVendor,
            internalCode: cleanInternalCode,
            checkIn: checkInISO,
            checkOut: checkOutISO,
            paxesCount: paxes.length
          }); // 9. Prepare Price Info Payload - GUNAKAN ID YANG SUDAH DIBERSIHKAN

          priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: cleanCityId,
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [{
              roomType: 0,
              isRequestChildBed: false,
              childNum: 0,
              childAges: [0]
            }],
            internalCode: cleanInternalCode,
            hotelID: cleanHotelIdForVendor,
            // 🔥 Sudah dibersihkan
            breakfast: booking.breakfast_type || "Room Only",
            roomID: cleanRoomIdForVendor,
            // 🔥 Sudah dibersihkan
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          console.debug("REQ_VENDOR_PRICE_INFO (post-payment)", JSON.stringify(priceInfoPayload, null, 2)); // 10. Kirim Price Info ke vendor

          _context2.next = 49;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000
          }));

        case 49:
          priceRes = _context2.sent;
          p = priceRes.data;
          console.debug("RES_VENDOR_PRICE_INFO (post-payment)", JSON.stringify(p, null, 2)); // 11. Cek response Price Info

          if (!(p.status !== "SUCCESS")) {
            _context2.next = 58;
            break;
          }

          _context2.next = 55;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM'));

        case 55:
          reason = p.respMessage || "Kamar tidak lagi tersedia di vendor setelah pembayaran.";
          console.error("\uD83D\uDEA8 [CRITICAL] Booking ID ".concat(bookingId, " DIBAYAR tapi kamar/harga tidak valid lagi:"), {
            reason: reason,
            sentData: {
              cityID: cleanCityId,
              hotelID: cleanHotelIdForVendor,
              roomID: cleanRoomIdForVendor,
              internalCode: cleanInternalCode
            },
            vendorResponse: p
          });
          throw new Error("".concat(reason, " PERLU TINDAKAN MANUAL / REFUND."));

        case 58:
          // 12. Gunakan data dari response Price Info
          vendorRoomId = p.roomID || cleanRoomIdForVendor;
          vendorHotelId = p.hotelID || cleanHotelIdForVendor;
          vendorCityId = p.cityID || cleanCityId;
          vendorInternalCode = p.internalCode || cleanInternalCode; // 13. Prepare Booking Payload

          bookingPayload = {
            paxPassport: p.paxPassport || "ID",
            countryID: p.countryID || "ID",
            cityID: vendorCityId,
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
            internalCode: vendorInternalCode,
            hotelID: vendorHotelId,
            breakfast: p.breakfast || booking.breakfast_type || "Room Only",
            roomID: vendorRoomId,
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
          console.debug("REQ_VENDOR_BOOKING (post-payment)", JSON.stringify(bookingPayload, null, 2)); // 14. Kirim Booking ke vendor

          _context2.next = 66;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), bookingPayload, {
            httpsAgent: agent,
            timeout: 60000
          }));

        case 66:
          bookingRes = _context2.sent;
          resData = bookingRes.data;
          console.debug("RES_VENDOR_BOOKING (post-payment)", JSON.stringify(resData, null, 2)); // 15. Cek response Booking

          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept"; // 16. Handle error booking

          if (resData.status === "SUCCESS" || isAccepted || isProcessed) {
            _context2.next = 77;
            break;
          }

          _context2.next = 75;
          return regeneratorRuntime.awrap(safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED'));

        case 75:
          console.error("\uD83D\uDEA8 [CRITICAL] Booking ID ".concat(bookingId, " DIBAYAR tapi DITOLAK vendor:"), {
            respMessage: resData.respMessage,
            status: resData.status,
            bookingStatus: resData.bookingStatus,
            sentData: {
              cityID: vendorCityId,
              hotelID: vendorHotelId,
              roomID: vendorRoomId,
              internalCode: vendorInternalCode
            }
          });
          throw new Error("".concat(resData.respMessage || "Vendor menolak booking", " PERLU TINDAKAN MANUAL / REFUND."));

        case 77:
          // 17. Proses success
          finalStatus = isProcessed ? 'Processed' : 'Accept';

          if (isProcessed) {
            resData.reservationNo = resData.reservationNo || "PRC-".concat(Date.now());
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          } // 18. Update database - simpan juga ID yang sudah dibersihkan


          _context2.next = 81;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET\n                reservation_no = ?,\n                voucher_no = ?,\n                os_ref_no = ?,\n                agent_os_ref = ?,\n                hotel_name = ?,\n                hotel_address = ?,\n                room_name = ?,\n                booking_status = ?,\n                updated_at = NOW()\n             WHERE id = ?", [resData.reservationNo || booking.reservation_no, resData.voucherNo || resData.reservationNo || booking.voucher_no, resData.osRefNo || booking.os_ref_no || null, bookingPayload.agentOsRef, resData.hotelName || booking.hotel_name, resData.hotelAddress || booking.hotel_address, resData.roomName || booking.room_name, finalStatus, bookingId]));

        case 81:
          console.info("\u2705 [VENDOR BOOKING] Booking ID ".concat(bookingId, " sukses -> Reservasi: ").concat(resData.reservationNo, " (").concat(finalStatus, ")")); // 19. Kirim email di background

          sendBookingEmails(bookingId)["catch"](function (err) {
            return console.error("[MAIL ERROR] Booking ID ".concat(bookingId, ": ").concat(err.message));
          });
          return _context2.abrupt("return", {
            success: true,
            status: finalStatus,
            reservationNo: resData.reservationNo,
            bookingId: bookingId,
            vendorResponse: resData
          });

        case 86:
          _context2.prev = 86;
          _context2.t1 = _context2["catch"](0);
          console.error("\u274C [VENDOR BOOKING ERROR] Booking ID ".concat(bookingId, ": ").concat(_context2.t1.message));
          throw _context2.t1;

        case 90:
          _context2.prev = 90;
          if (connection) connection.release();
          return _context2.finish(90);

        case 93:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 86, 90, 93], [15, 19]]);
}

module.exports = {
  processHotelBookingToVendor: processHotelBookingToVendor
};