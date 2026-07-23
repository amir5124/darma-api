"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var db = require('../config/db'); // ============================================================
// Controller: Melihat data booking hotel secara LENGKAP.
// Menggabungkan data dari hotel_bookings + hotel_payments +
// hotel_booking_paxes + hotel_booking_facilities, TANPA peduli
// booking itu dibuat lewat flow aplikasi (hotelRoutes.js) atau
// flow web (hotelController.js) — karena keduanya menulis ke
// tabel yang sama.
//
// CATATAN PENTING soal "source" (aplikasi vs web):
// Skema tabel hotel_bookings TIDAK punya kolom eksplisit untuk
// menandai asal booking. Sebagai gantinya dipakai heuristik:
//   - Flow WEB (hotelController.js)   -> tidak pernah mengisi kolom `username` -> selalu NULL
//   - Flow APLIKASI (hotelRoutes.js)  -> selalu mengisi `username` (fallback 'guest') -> selalu NOT NULL
// Ini best-effort berdasarkan kode yang ada sekarang. Kalau ke depannya
// ingin akurat 100%, sebaiknya tambahkan kolom eksplisit, misalnya:
//   ALTER TABLE hotel_bookings ADD COLUMN booking_source VARCHAR(20) DEFAULT 'app';
// lalu set 'web' secara eksplisit di controller hotelController.js (dokumen 10).
// ============================================================


var SOURCE_CASE_SQL = "CASE WHEN hb.username IS NULL THEN 'web' ELSE 'app' END";
var HotelBookingAdminController = {
  // ============================================================
  // GET /api/hotel-bookings-admin/list
  // Query params (semua opsional):
  //   page, limit          -> pagination (default page=1, limit=20)
  //   search                -> cari di reservation_no, hotel_name, contact_email, contact_phone
  //   status                -> filter booking_status (PENDING, PAID, Accept, Processed, FAILED_VENDOR_*, dll)
  //   source                -> 'app' | 'web' | (kosong = semua)
  //   date_from, date_to    -> filter check_in_date (format YYYY-MM-DD)
  // ============================================================
  listBookings: function listBookings(req, res) {
    var _req$query, _req$query$page, page, _req$query$limit, limit, _req$query$search, search, _req$query$status, status, _req$query$source, source, _req$query$date_from, date_from, _req$query$date_to, date_to, pageNum, limitNum, offset, whereClauses, params, likeTerm, whereSql, _ref, _ref2, _ref2$, total, _ref3, _ref4, rows;

    return regeneratorRuntime.async(function listBookings$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _req$query = req.query, _req$query$page = _req$query.page, page = _req$query$page === void 0 ? 1 : _req$query$page, _req$query$limit = _req$query.limit, limit = _req$query$limit === void 0 ? 20 : _req$query$limit, _req$query$search = _req$query.search, search = _req$query$search === void 0 ? '' : _req$query$search, _req$query$status = _req$query.status, status = _req$query$status === void 0 ? '' : _req$query$status, _req$query$source = _req$query.source, source = _req$query$source === void 0 ? '' : _req$query$source, _req$query$date_from = _req$query.date_from, date_from = _req$query$date_from === void 0 ? '' : _req$query$date_from, _req$query$date_to = _req$query.date_to, date_to = _req$query$date_to === void 0 ? '' : _req$query$date_to;
            pageNum = Math.max(1, parseInt(page) || 1);
            limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20)); // cap 100 per halaman

            offset = (pageNum - 1) * limitNum;
            whereClauses = ['1=1'];
            params = [];

            if (search && search.trim() !== '') {
              whereClauses.push("(\n                    hb.reservation_no LIKE ? OR\n                    hb.hotel_name LIKE ? OR\n                    hb.contact_email LIKE ? OR\n                    hb.contact_phone LIKE ? OR\n                    hb.os_ref_no LIKE ?\n                )");
              likeTerm = "%".concat(search.trim(), "%");
              params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
            }

            if (status && status.trim() !== '') {
              whereClauses.push("hb.booking_status = ?");
              params.push(status.trim());
            }

            if (source === 'app') {
              whereClauses.push("hb.username IS NOT NULL");
            } else if (source === 'web') {
              whereClauses.push("hb.username IS NULL");
            }

            if (date_from) {
              whereClauses.push("hb.check_in_date >= ?");
              params.push(date_from);
            }

            if (date_to) {
              whereClauses.push("hb.check_in_date <= ?");
              params.push(date_to + ' 23:59:59');
            }

            whereSql = whereClauses.join(' AND '); // 1. Hitung total data untuk pagination

            _context.next = 15;
            return regeneratorRuntime.awrap(db.query("SELECT COUNT(*) as total FROM hotel_bookings hb WHERE ".concat(whereSql), params));

          case 15:
            _ref = _context.sent;
            _ref2 = _slicedToArray(_ref, 1);
            _ref2$ = _slicedToArray(_ref2[0], 1);
            total = _ref2$[0].total;
            _context.next = 21;
            return regeneratorRuntime.awrap(db.query("SELECT\n                    hb.id,\n                    hb.reservation_no,\n                    hb.voucher_no,\n                    hb.os_ref_no,\n                    hb.agent_os_ref,\n                    hb.hotel_id,\n                    hb.hotel_name,\n                    hb.hotel_address,\n                    hb.internal_code,\n                    hb.check_in_date,\n                    hb.check_out_date,\n                    hb.city_id,\n                    hb.city_name,\n                    hb.room_name,\n                    hb.breakfast_type,\n                    hb.room_count,\n                    hb.contact_email,\n                    hb.contact_phone,\n                    hb.total_price,\n                    hb.commission,\n                    hb.handling_fee,\n                    hb.currency,\n                    hb.booking_status,\n                    hb.username,\n                    hb.booking_date,\n                    hb.created_at,\n                    hb.updated_at,\n                    ".concat(SOURCE_CASE_SQL, " AS source,\n                    hp.payment_status,\n                    hp.payment_method,\n                    hp.payment_reff,\n                    hp.payment_date,\n                    hp.expired_date,\n                    hp.admin_fee AS payment_admin_fee,\n                    (SELECT COUNT(*) FROM hotel_booking_paxes hbp WHERE hbp.booking_id = hb.id) AS guest_count\n                 FROM hotel_bookings hb\n                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n                 WHERE ").concat(whereSql, "\n                 ORDER BY hb.created_at DESC\n                 LIMIT ? OFFSET ?"), [].concat(params, [limitNum, offset])));

          case 21:
            _ref3 = _context.sent;
            _ref4 = _slicedToArray(_ref3, 1);
            rows = _ref4[0];
            return _context.abrupt("return", res.json({
              status: "SUCCESS",
              pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
              },
              data: rows
            }));

          case 27:
            _context.prev = 27;
            _context.t0 = _context["catch"](0);
            console.error("❌ [BOOKING ADMIN LIST ERROR]:", _context.t0.message);
            return _context.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context.t0.message
            }));

          case 31:
          case "end":
            return _context.stop();
        }
      }
    }, null, null, [[0, 27]]);
  },
  // ============================================================
  // GET /api/hotel-bookings-admin/:id
  // Detail lengkap satu booking: data utama + payment + paxes + facilities
  // ============================================================
  getBookingDetail: function getBookingDetail(req, res) {
    var id, _ref5, _ref6, rows, booking, _ref7, _ref8, paxes, _ref9, _ref10, facilities;

    return regeneratorRuntime.async(function getBookingDetail$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            _context2.prev = 0;
            id = req.params.id;
            _context2.next = 4;
            return regeneratorRuntime.awrap(db.query("SELECT\n                    hb.*,\n                    ".concat(SOURCE_CASE_SQL, " AS source,\n                    hp.payment_status,\n                    hp.payment_method,\n                    hp.payment_reff,\n                    hp.booking_code,\n                    hp.reference_no,\n                    hp.va_number,\n                    hp.qris_url,\n                    hp.amount AS payment_amount,\n                    hp.admin_fee AS payment_admin_fee,\n                    hp.ticket_status,\n                    hp.payment_date,\n                    hp.expired_date\n                 FROM hotel_bookings hb\n                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n                 WHERE hb.id = ?"), [id]));

          case 4:
            _ref5 = _context2.sent;
            _ref6 = _slicedToArray(_ref5, 1);
            rows = _ref6[0];

            if (!(rows.length === 0)) {
              _context2.next = 9;
              break;
            }

            return _context2.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Booking tidak ditemukan."
            }));

          case 9:
            booking = rows[0];
            _context2.next = 12;
            return regeneratorRuntime.awrap(db.query("SELECT id, pax_type, title, first_name, last_name, age\n                 FROM hotel_booking_paxes\n                 WHERE booking_id = ?\n                 ORDER BY id ASC", [id]));

          case 12:
            _ref7 = _context2.sent;
            _ref8 = _slicedToArray(_ref7, 1);
            paxes = _ref8[0];
            _context2.next = 17;
            return regeneratorRuntime.awrap(db.query("SELECT id, facility_name\n                 FROM hotel_booking_facilities\n                 WHERE booking_id = ?", [id]));

          case 17:
            _ref9 = _context2.sent;
            _ref10 = _slicedToArray(_ref9, 1);
            facilities = _ref10[0];
            return _context2.abrupt("return", res.json({
              status: "SUCCESS",
              data: _objectSpread({}, booking, {
                paxes: paxes,
                facilities: facilities
              })
            }));

          case 23:
            _context2.prev = 23;
            _context2.t0 = _context2["catch"](0);
            console.error("❌ [BOOKING ADMIN DETAIL ERROR]:", _context2.t0.message);
            return _context2.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context2.t0.message
            }));

          case 27:
          case "end":
            return _context2.stop();
        }
      }
    }, null, null, [[0, 23]]);
  }
};
module.exports = HotelBookingAdminController;