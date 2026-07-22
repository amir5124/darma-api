"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// utils/hotelBookingProcessor.js
//
// Tujuan file ini:
// Memindahkan logic "executeFinalBooking()" yang SEBELUMNYA jalan di browser (dipicu polling)
// menjadi proses server-side yang dipicu langsung oleh payment callback LinkQu.
//
// Ini menyelesaikan masalah: booking ke vendor hotel hilang/tidak terjadi kalau user
// menutup tab / koneksi putus / app di-background setelah bayar.
//
// CATATAN PENTING SEBELUM PAKAI:
// 1. Sesuaikan nama kolom di query SELECT/UPDATE dengan skema tabel `hotel_bookings` kamu
//    yang sebenarnya (saya samakan dengan pola INSERT di hotelRoutes.js /booking dan /draft).
// 2. Fungsi `sendBookingEmails(bookingId)` diasumsikan sudah ada di `utils/hotelMailer.js`
//    (sudah dipakai di endpoint /hotel-bookings/update-after-vendor). Kalau signature-nya
//    beda, sesuaikan pemanggilannya di bagian bawah.
// 3. Pastikan `getConsistentToken`, `BASE_URL`, `USER_CONFIG`, `agent`, `logger` diexport
//    dari '../helpers/darmaHelper' (sudah dipakai konsisten di hotelRoutes.js).
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
 * Memproses booking hotel yang statusnya masih PENDING/PAID ke vendor (Darma),
 * lalu mengupdate DB dan memicu pengiriman email.
 *
 * WAJIB idempotent: kalau dipanggil 2x untuk booking yang sama (misal LinkQu
 * mengirim callback duplikat, yang memang lazim terjadi), booking ke vendor
 * TIDAK boleh dikirim dua kali.
 *
 * @param {number} bookingId - id di tabel hotel_bookings
 * @returns {Promise<object>} hasil proses
 */


function processHotelBookingToVendor(bookingId) {
  var connection, _ref, _ref2, rows, booking, _ref3, _ref4, paxes, token, checkInISO, checkOutISO, priceInfoPayload, priceRes, p, bookingPayload, bookingRes, resData, msg, isProcessed, isAccepted, finalStatus;

  return regeneratorRuntime.async(function processHotelBookingToVendor$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          _context.next = 3;
          return regeneratorRuntime.awrap(db.getConnection());

        case 3:
          connection = _context.sent;
          _context.next = 6;
          return regeneratorRuntime.awrap(connection.execute("SELECT * FROM hotel_bookings WHERE id = ?", [bookingId]));

        case 6:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];

          if (!(rows.length === 0)) {
            _context.next = 11;
            break;
          }

          throw new Error("Booking ID ".concat(bookingId, " tidak ditemukan di database."));

        case 11:
          booking = rows[0]; // 2. IDEMPOTENCY CHECK — Ini kunci utama agar tidak double-booking ke vendor
          //    kalau callback pembayaran terkirim berkali-kali (retry dari LinkQu itu normal).

          if (!['Accept', 'Processed'].includes(booking.booking_status)) {
            _context.next = 15;
            break;
          }

          logger.info("[VENDOR BOOKING] Booking ID ".concat(bookingId, " sudah pernah diproses (status: ").concat(booking.booking_status, "). Dilewati."));
          return _context.abrupt("return", {
            skipped: true,
            reason: 'already_processed',
            bookingId: bookingId,
            status: booking.booking_status
          });

        case 15:
          _context.next = 17;
          return regeneratorRuntime.awrap(connection.execute("SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?", [bookingId]));

        case 17:
          _ref3 = _context.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];

          if (!(paxes.length === 0)) {
            _context.next = 22;
            break;
          }

          throw new Error("Data tamu (paxes) untuk booking ID ".concat(bookingId, " kosong \u2014 tidak bisa lanjut booking ke vendor."));

        case 22:
          _context.next = 24;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 24:
          token = _context.sent;
          // 4. Re-validasi harga & ketersediaan kamar ke vendor (harga bisa berubah sejak draft dibuat)
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
          _context.next = 31;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000
          }));

        case 31:
          priceRes = _context.sent;
          p = priceRes.data;

          if (!(p.status !== "SUCCESS")) {
            _context.next = 37;
            break;
          }

          _context.next = 36;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET booking_status = 'FAILED_VENDOR_NO_ROOM', updated_at = NOW() WHERE id = ?", [bookingId]));

        case 36:
          throw new Error(p.respMessage || "Kamar tidak lagi tersedia di vendor setelah pembayaran. PERLU TINDAKAN MANUAL / REFUND.");

        case 37:
          // 5. Kirim payload booking sungguhan ke vendor
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
          _context.next = 41;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), bookingPayload, {
            httpsAgent: agent,
            timeout: 60000
          }));

        case 41:
          bookingRes = _context.sent;
          resData = bookingRes.data;
          msg = (resData.respMessage || "").toUpperCase();
          isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
          isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

          if (resData.status === "SUCCESS" || isAccepted || isProcessed) {
            _context.next = 51;
            break;
          }

          _context.next = 49;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET booking_status = 'FAILED_VENDOR_REJECTED', updated_at = NOW() WHERE id = ?", [bookingId]));

        case 49:
          logger.error("\uD83D\uDEA8 [CRITICAL] Booking ID ".concat(bookingId, " DIBAYAR tapi DITOLAK vendor: ").concat(resData.respMessage));
          throw new Error(resData.respMessage || "Vendor menolak booking setelah pembayaran diterima. PERLU TINDAKAN MANUAL / REFUND.");

        case 51:
          finalStatus = isProcessed ? 'Processed' : 'Accept';

          if (isProcessed) {
            resData.reservationNo = resData.reservationNo || "PRC-".concat(Date.now());
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
          } // 6. Update DB dengan hasil reservasi dari vendor


          _context.next = 55;
          return regeneratorRuntime.awrap(connection.execute("UPDATE hotel_bookings SET\n                reservation_no = ?,\n                voucher_no = ?,\n                os_ref_no = ?,\n                agent_os_ref = ?,\n                hotel_name = ?,\n                hotel_address = ?,\n                room_name = ?,\n                booking_status = ?,\n                updated_at = NOW()\n             WHERE id = ?", [resData.reservationNo, resData.voucherNo || resData.reservationNo, resData.osRefNo || null, bookingPayload.agentOsRef, resData.hotelName || booking.hotel_name, resData.hotelAddress || booking.hotel_address, resData.roomName || booking.room_name, finalStatus, bookingId]));

        case 55:
          logger.info("\u2705 [VENDOR BOOKING] Booking ID ".concat(bookingId, " sukses -> Reservasi: ").concat(resData.reservationNo, " (").concat(finalStatus, ")")); // 7. Kirim email e-voucher/tiket — non-blocking, jangan sampai email lambat menahan response callback

          sendBookingEmails(bookingId)["catch"](function (err) {
            return logger.error("[MAIL ERROR] Booking ID ".concat(bookingId, ": ").concat(err.message));
          });
          return _context.abrupt("return", {
            success: true,
            status: finalStatus,
            reservationNo: resData.reservationNo,
            bookingId: bookingId
          });

        case 60:
          _context.prev = 60;
          _context.t0 = _context["catch"](0);
          logger.error("\u274C [VENDOR BOOKING ERROR] Booking ID ".concat(bookingId, ": ").concat(_context.t0.message));
          throw _context.t0;

        case 64:
          _context.prev = 64;
          if (connection) connection.release();
          return _context.finish(64);

        case 67:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 60, 64, 67]]);
}

module.exports = {
  processHotelBookingToVendor: processHotelBookingToVendor
};