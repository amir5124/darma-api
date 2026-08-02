"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// controllers/hotelBookingAdminController.js
var db = require('../config/db');

var _require = require('../utils/hotelMailer'),
    sendBookingEmails = _require.sendBookingEmails,
    generateBookingPDF = _require.generateBookingPDF;

var XLSX = require('xlsx'); // 🔥 Tambahkan ini
// ============================================================
// SOURCE DETECTION (Heuristik)
// ============================================================


var SOURCE_CASE_SQL = "CASE WHEN hb.username IS NULL THEN 'web' ELSE 'app' END";
var HotelBookingAdminController = {
  // ============================================================
  // GET /list - LIST BOOKINGS WITH PAGINATION & FILTERS
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
            limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
            offset = (pageNum - 1) * limitNum;
            whereClauses = ['1=1'];
            params = []; // Filter search

            if (search && search.trim() !== '') {
              whereClauses.push("(\n                    hb.reservation_no LIKE ? OR\n                    hb.hotel_name LIKE ? OR\n                    hb.contact_email LIKE ? OR\n                    hb.contact_phone LIKE ? OR\n                    hb.os_ref_no LIKE ?\n                )");
              likeTerm = "%".concat(search.trim(), "%");
              params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
            } // Filter status


            if (status && status.trim() !== '') {
              whereClauses.push("hb.booking_status = ?");
              params.push(status.trim());
            } // Filter source


            if (source === 'app') {
              whereClauses.push("hb.username IS NOT NULL");
            } else if (source === 'web') {
              whereClauses.push("hb.username IS NULL");
            } // Filter tanggal


            if (date_from) {
              whereClauses.push("hb.check_in_date >= ?");
              params.push(date_from);
            }

            if (date_to) {
              whereClauses.push("hb.check_in_date <= ?");
              params.push(date_to + ' 23:59:59');
            }

            whereSql = whereClauses.join(' AND '); // Hitung total

            _context.next = 15;
            return regeneratorRuntime.awrap(db.query("SELECT COUNT(*) as total FROM hotel_bookings hb WHERE ".concat(whereSql), params));

          case 15:
            _ref = _context.sent;
            _ref2 = _slicedToArray(_ref, 1);
            _ref2$ = _slicedToArray(_ref2[0], 1);
            total = _ref2$[0].total;
            _context.next = 21;
            return regeneratorRuntime.awrap(db.query("SELECT\n                    hb.id,\n                    hb.reservation_no,\n                    hb.voucher_no,\n                    hb.os_ref_no,\n                    hb.agent_os_ref,\n                    hb.hotel_id,\n                    hb.hotel_name,\n                    hb.hotel_address,\n                    hb.internal_code,\n                    hb.check_in_date,\n                    hb.check_out_date,\n                    hb.city_id,\n                    hb.city_name,\n                    hb.room_name,\n                    hb.breakfast_type,\n                    hb.room_count,\n                    hb.contact_email,\n                    hb.contact_phone,\n                    hb.total_price,\n                    hb.commission,\n                    hb.handling_fee,\n                    hb.currency,\n                    hb.booking_status,\n                    hb.username,\n                    hb.booking_date,\n                    hb.created_at,\n                    hb.updated_at,\n                    hb.source,\n                    ".concat(SOURCE_CASE_SQL, " AS source_detected,\n                    hp.payment_status,\n                    hp.payment_method,\n                    hp.payment_reff,\n                    hp.payment_date,\n                    hp.expired_date,\n                    hp.admin_fee AS payment_admin_fee,\n                    (SELECT COUNT(*) FROM hotel_booking_paxes hbp WHERE hbp.booking_id = hb.id) AS guest_count\n                 FROM hotel_bookings hb\n                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n                 WHERE ").concat(whereSql, "\n                 ORDER BY hb.created_at DESC\n                 LIMIT ? OFFSET ?"), [].concat(params, [limitNum, offset])));

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
            console.error("❌ [LIST BOOKINGS ERROR]:", _context.t0.message);
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
  // GET /:id - DETAIL BOOKING
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
            return regeneratorRuntime.awrap(db.query("SELECT\n                    hb.*,\n                    hp.payment_status,\n                    hp.payment_method,\n                    hp.payment_reff,\n                    hp.booking_code,\n                    hp.reference_no,\n                    hp.va_number,\n                    hp.qris_url,\n                    hp.amount AS payment_amount,\n                    hp.admin_fee AS payment_admin_fee,\n                    hp.ticket_status,\n                    hp.payment_date,\n                    hp.expired_date\n                 FROM hotel_bookings hb\n                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n                 WHERE hb.id = ?", [id]));

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
            console.error("❌ [GET BOOKING DETAIL ERROR]:", _context2.t0.message);
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
  },
  // ============================================================
  // 🔥 GET /export-excel - EXPORT TO EXCEL
  // ============================================================
  exportToExcel: function exportToExcel(req, res) {
    var _req$query2, _req$query2$search, search, _req$query2$status, status, _req$query2$source, source, _req$query2$date_from, date_from, _req$query2$date_to, date_to, whereClauses, params, likeTerm, whereSql, _ref11, _ref12, rows, excelData, workbook, worksheet, range, col, headerCell, numberColumns, numberColIndexes, row, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, colIdx, cellRef, totalRevenue, totalCommission, totalHandlingFee, summaryData, summarySheet, fileName, buffer;

    return regeneratorRuntime.async(function exportToExcel$(_context3) {
      while (1) {
        switch (_context3.prev = _context3.next) {
          case 0:
            _context3.prev = 0;
            _req$query2 = req.query, _req$query2$search = _req$query2.search, search = _req$query2$search === void 0 ? '' : _req$query2$search, _req$query2$status = _req$query2.status, status = _req$query2$status === void 0 ? '' : _req$query2$status, _req$query2$source = _req$query2.source, source = _req$query2$source === void 0 ? '' : _req$query2$source, _req$query2$date_from = _req$query2.date_from, date_from = _req$query2$date_from === void 0 ? '' : _req$query2$date_from, _req$query2$date_to = _req$query2.date_to, date_to = _req$query2$date_to === void 0 ? '' : _req$query2$date_to; // Build where clause (sama dengan listBookings)

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

            whereSql = whereClauses.join(' AND '); // Ambil semua data (tanpa pagination)

            _context3.next = 12;
            return regeneratorRuntime.awrap(db.query("SELECT\n                    hb.id,\n                    hb.reservation_no,\n                    hb.voucher_no,\n                    hb.os_ref_no,\n                    hb.agent_os_ref,\n                    hb.hotel_name,\n                    hb.hotel_address,\n                    hb.check_in_date,\n                    hb.check_out_date,\n                    hb.city_name,\n                    hb.room_name,\n                    hb.breakfast_type,\n                    hb.room_count,\n                    hb.contact_email,\n                    hb.contact_phone,\n                    hb.total_price,\n                    hb.commission,\n                    hb.handling_fee,\n                    hb.currency,\n                    hb.booking_status,\n                    hb.username,\n                    hb.booking_date,\n                    hb.created_at,\n                    ".concat(SOURCE_CASE_SQL, " AS source_detected,\n                    hp.payment_status,\n                    hp.payment_method,\n                    hp.payment_date,\n                    hp.admin_fee AS payment_admin_fee,\n                    (SELECT COUNT(*) FROM hotel_booking_paxes hbp WHERE hbp.booking_id = hb.id) AS guest_count\n                 FROM hotel_bookings hb\n                 LEFT JOIN hotel_payments hp ON hp.booking_id = hb.id\n                 WHERE ").concat(whereSql, "\n                 ORDER BY hb.created_at DESC"), params));

          case 12:
            _ref11 = _context3.sent;
            _ref12 = _slicedToArray(_ref11, 1);
            rows = _ref12[0];

            if (!(rows.length === 0)) {
              _context3.next = 17;
              break;
            }

            return _context3.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Tidak ada data untuk diexport"
            }));

          case 17:
            // ============================================
            // FORMAT DATA UNTUK EXCEL
            // ============================================
            excelData = rows.map(function (booking, index) {
              // Format tanggal
              var checkIn = booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }) : '-';
              var checkOut = booking.check_out_date ? new Date(booking.check_out_date).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }) : '-';
              var bookingDate = booking.booking_date ? new Date(booking.booking_date).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }) : '-'; // Status

              var statusMap = {
                'New': 'Baru',
                'Accept': 'Diterima',
                'Processed': 'Diproses',
                'Cancelled': 'Dibatalkan',
                'Reject': 'Ditolak'
              };
              var statusLabel = statusMap[booking.booking_status] || booking.booking_status || '-';
              return {
                'No': index + 1,
                'Reservasi': booking.reservation_no || '-',
                'Voucher': booking.voucher_no || '-',
                'OS Ref No': booking.os_ref_no || '-',
                'Hotel': booking.hotel_name || '-',
                'Kota': booking.city_name || '-',
                'Alamat': booking.hotel_address || '-',
                'Check In': checkIn,
                'Check Out': checkOut,
                'Tipe Kamar': booking.room_name || '-',
                'Jumlah Kamar': booking.room_count || 1,
                'Sarapan': booking.breakfast_type || 'Room Only',
                'Total Harga': Number(booking.total_price) || 0,
                'Komisi': Number(booking.commission) || 0,
                'Handling Fee': Number(booking.handling_fee) || 0,
                'Admin Fee': Number(booking.payment_admin_fee) || 0,
                'Mata Uang': booking.currency || 'IDR',
                'Status': statusLabel,
                'Status Pembayaran': booking.payment_status || 'PENDING',
                'Metode Bayar': booking.payment_method || '-',
                'Sumber': booking.source_detected === 'app' ? 'App' : 'Web',
                'Pengguna': booking.username || 'Guest',
                'Email': booking.contact_email || '-',
                'Telepon': booking.contact_phone || '-',
                'Jumlah Tamu': booking.guest_count || 1,
                'Tanggal Booking': bookingDate,
                'Dibuat': booking.created_at ? new Date(booking.created_at).toLocaleString('id-ID') : '-'
              };
            }); // ============================================
            // BUAT WORKBOOK
            // ============================================

            workbook = XLSX.utils.book_new();
            worksheet = XLSX.utils.json_to_sheet(excelData); // Set column widths

            worksheet['!cols'] = [{
              wch: 5
            }, // No
            {
              wch: 14
            }, // Reservasi
            {
              wch: 14
            }, // Voucher
            {
              wch: 15
            }, // OS Ref No
            {
              wch: 25
            }, // Hotel
            {
              wch: 18
            }, // Kota
            {
              wch: 30
            }, // Alamat
            {
              wch: 20
            }, // Check In
            {
              wch: 20
            }, // Check Out
            {
              wch: 20
            }, // Tipe Kamar
            {
              wch: 12
            }, // Jumlah Kamar
            {
              wch: 15
            }, // Sarapan
            {
              wch: 15
            }, // Total Harga
            {
              wch: 14
            }, // Komisi
            {
              wch: 14
            }, // Handling Fee
            {
              wch: 14
            }, // Admin Fee
            {
              wch: 10
            }, // Mata Uang
            {
              wch: 14
            }, // Status
            {
              wch: 18
            }, // Status Pembayaran
            {
              wch: 15
            }, // Metode Bayar
            {
              wch: 10
            }, // Sumber
            {
              wch: 18
            }, // Pengguna
            {
              wch: 25
            }, // Email
            {
              wch: 18
            }, // Telepon
            {
              wch: 12
            }, // Jumlah Tamu
            {
              wch: 20
            }, // Tanggal Booking
            {
              wch: 22
            } // Dibuat
            ]; // Style header

            range = XLSX.utils.decode_range(worksheet['!ref']);

            for (col = range.s.c; col <= range.e.c; col++) {
              headerCell = XLSX.utils.encode_cell({
                r: 0,
                c: col
              });

              if (worksheet[headerCell]) {
                worksheet[headerCell].s = {
                  font: {
                    bold: true,
                    color: {
                      rgb: "FFFFFF"
                    },
                    sz: 11
                  },
                  fill: {
                    fgColor: {
                      rgb: "24B3AE"
                    }
                  },
                  alignment: {
                    horizontal: "center",
                    vertical: "center"
                  }
                };
              }
            } // Format angka


            numberColumns = ['Total Harga', 'Komisi', 'Handling Fee', 'Admin Fee'];
            numberColIndexes = numberColumns.map(function (col) {
              var headers = Object.keys(excelData[0]);
              return headers.indexOf(col);
            });
            row = 1;

          case 26:
            if (!(row <= excelData.length)) {
              _context3.next = 58;
              break;
            }

            _iteratorNormalCompletion = true;
            _didIteratorError = false;
            _iteratorError = undefined;
            _context3.prev = 30;
            _iterator = numberColIndexes[Symbol.iterator]();

          case 32:
            if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
              _context3.next = 41;
              break;
            }

            colIdx = _step.value;

            if (!(colIdx === -1)) {
              _context3.next = 36;
              break;
            }

            return _context3.abrupt("continue", 38);

          case 36:
            cellRef = XLSX.utils.encode_cell({
              r: row,
              c: colIdx
            });

            if (worksheet[cellRef]) {
              worksheet[cellRef].s = {
                alignment: {
                  horizontal: "right"
                },
                numFmt: '#,##0.00'
              };
            }

          case 38:
            _iteratorNormalCompletion = true;
            _context3.next = 32;
            break;

          case 41:
            _context3.next = 47;
            break;

          case 43:
            _context3.prev = 43;
            _context3.t0 = _context3["catch"](30);
            _didIteratorError = true;
            _iteratorError = _context3.t0;

          case 47:
            _context3.prev = 47;
            _context3.prev = 48;

            if (!_iteratorNormalCompletion && _iterator["return"] != null) {
              _iterator["return"]();
            }

          case 50:
            _context3.prev = 50;

            if (!_didIteratorError) {
              _context3.next = 53;
              break;
            }

            throw _iteratorError;

          case 53:
            return _context3.finish(50);

          case 54:
            return _context3.finish(47);

          case 55:
            row++;
            _context3.next = 26;
            break;

          case 58:
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Hotel Bookings'); // ============================================
            // BUAT SUMMARY SHEET
            // ============================================

            totalRevenue = rows.reduce(function (sum, b) {
              return sum + Number(b.total_price || 0);
            }, 0);
            totalCommission = rows.reduce(function (sum, b) {
              return sum + Number(b.commission || 0);
            }, 0);
            totalHandlingFee = rows.reduce(function (sum, b) {
              return sum + Number(b.handling_fee || 0);
            }, 0);
            summaryData = [['LAPORAN HOTEL BOOKING'], [''], ['Tanggal Export', new Date().toLocaleString('id-ID')], ['Total Booking', rows.length], ['Total Revenue', totalRevenue], ['Total Komisi', totalCommission], ['Total Handling Fee', totalHandlingFee], [''], ['Status Booking'], ['New', rows.filter(function (b) {
              return b.booking_status === 'New';
            }).length], ['Accept', rows.filter(function (b) {
              return b.booking_status === 'Accept';
            }).length], ['Processed', rows.filter(function (b) {
              return b.booking_status === 'Processed';
            }).length], ['Cancelled', rows.filter(function (b) {
              return b.booking_status === 'Cancelled';
            }).length], ['Reject', rows.filter(function (b) {
              return b.booking_status === 'Reject';
            }).length], [''], ['Status Pembayaran'], ['SUCCESS', rows.filter(function (b) {
              return b.payment_status === 'SUCCESS';
            }).length], ['PENDING', rows.filter(function (b) {
              return b.payment_status === 'PENDING' || !b.payment_status;
            }).length], [''], ['Sumber'], ['App', rows.filter(function (b) {
              return b.username !== null;
            }).length], ['Web', rows.filter(function (b) {
              return b.username === null;
            }).length]];
            summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{
              wch: 30
            }, {
              wch: 20
            }]; // Style summary header

            if (summarySheet['A1']) {
              summarySheet['A1'].s = {
                font: {
                  bold: true,
                  sz: 16,
                  color: {
                    rgb: "24B3AE"
                  }
                },
                alignment: {
                  horizontal: "center"
                }
              };
            }

            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary'); // ============================================
            // GENERATE FILE
            // ============================================

            fileName = "Hotel_Bookings";
            if (status) fileName += "_".concat(status);
            fileName += "_".concat(new Date().toISOString().split('T')[0], ".xlsx");
            buffer = XLSX.write(workbook, {
              type: 'buffer',
              bookType: 'xlsx'
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', "attachment; filename=\"".concat(fileName, "\""));
            res.send(buffer);
            _context3.next = 80;
            break;

          case 76:
            _context3.prev = 76;
            _context3.t1 = _context3["catch"](0);
            console.error("❌ [EXPORT EXCEL ERROR]:", _context3.t1.message);
            return _context3.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context3.t1.message
            }));

          case 80:
          case "end":
            return _context3.stop();
        }
      }
    }, null, null, [[0, 76], [30, 43, 47, 55], [48,, 50, 54]]);
  },
  // ============================================================
  // 🔥 POST /:id/resend-eticket - KIRIM ULANG E-TIKET
  // ============================================================
  resendEticket: function resendEticket(req, res) {
    var id, email, _ref13, _ref14, rows, booking, allowedStatus, _ref15, _ref16, paxes, targetEmail;

    return regeneratorRuntime.async(function resendEticket$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            _context4.prev = 0;
            id = req.params.id;
            email = req.body.email;

            if (!(!id || isNaN(id))) {
              _context4.next = 5;
              break;
            }

            return _context4.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Booking ID tidak valid"
            }));

          case 5:
            _context4.next = 7;
            return regeneratorRuntime.awrap(db.query("SELECT id, booking_status, contact_email, os_ref_no, reservation_no, hotel_name, hotel_address, room_name, total_price, handling_fee, check_in_date, check_out_date, breakfast_type, special_requests\n                 FROM hotel_bookings WHERE id = ?", [id]));

          case 7:
            _ref13 = _context4.sent;
            _ref14 = _slicedToArray(_ref13, 1);
            rows = _ref14[0];

            if (!(rows.length === 0)) {
              _context4.next = 12;
              break;
            }

            return _context4.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Booking tidak ditemukan"
            }));

          case 12:
            booking = rows[0];
            allowedStatus = ['Accept', 'Processed'];

            if (allowedStatus.includes(booking.booking_status)) {
              _context4.next = 16;
              break;
            }

            return _context4.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Booking status \"".concat(booking.booking_status, "\" tidak bisa mengirim e-tiket. Status harus Accept atau Processed.")
            }));

          case 16:
            _context4.next = 18;
            return regeneratorRuntime.awrap(db.query("SELECT title, first_name as firstName, last_name as lastName \n                 FROM hotel_booking_paxes \n                 WHERE booking_id = ?", [id]));

          case 18:
            _ref15 = _context4.sent;
            _ref16 = _slicedToArray(_ref15, 1);
            paxes = _ref16[0];
            targetEmail = email || booking.contact_email;

            if (targetEmail) {
              _context4.next = 24;
              break;
            }

            return _context4.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Email tujuan tidak ditemukan. Silakan kirim dengan parameter email."
            }));

          case 24:
            _context4.next = 26;
            return regeneratorRuntime.awrap(sendBookingEmails(parseInt(id)));

          case 26:
            return _context4.abrupt("return", res.json({
              status: "SUCCESS",
              message: "E-Tiket berhasil dikirim ke ".concat(targetEmail),
              booking_id: parseInt(id),
              reservation_no: booking.reservation_no,
              os_ref_no: booking.os_ref_no,
              sent_to: targetEmail,
              booking_status: booking.booking_status
            }));

          case 29:
            _context4.prev = 29;
            _context4.t0 = _context4["catch"](0);
            console.error("❌ [RESEND E-TIKET ERROR]:", _context4.t0.message);
            return _context4.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context4.t0.message
            }));

          case 33:
          case "end":
            return _context4.stop();
        }
      }
    }, null, null, [[0, 29]]);
  },
  // ============================================================
  // 🔥 POST /generate-pdf/:id - DOWNLOAD PDF MANUAL
  // ============================================================
  generatePdf: function generatePdf(req, res) {
    var id, _ref17, _ref18, rows, booking, _ref19, _ref20, paxes, pdfData, pdfBuffer;

    return regeneratorRuntime.async(function generatePdf$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            _context5.prev = 0;
            id = req.params.id;

            if (!(!id || isNaN(id))) {
              _context5.next = 4;
              break;
            }

            return _context5.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Booking ID tidak valid"
            }));

          case 4:
            _context5.next = 6;
            return regeneratorRuntime.awrap(db.query("SELECT * FROM hotel_bookings WHERE id = ?", [id]));

          case 6:
            _ref17 = _context5.sent;
            _ref18 = _slicedToArray(_ref17, 1);
            rows = _ref18[0];

            if (!(rows.length === 0)) {
              _context5.next = 11;
              break;
            }

            return _context5.abrupt("return", res.status(404).json({
              status: "ERROR",
              respMessage: "Booking tidak ditemukan"
            }));

          case 11:
            booking = rows[0];
            _context5.next = 14;
            return regeneratorRuntime.awrap(db.query("SELECT title, first_name as firstName, last_name as lastName \n                 FROM hotel_booking_paxes \n                 WHERE booking_id = ?", [id]));

          case 14:
            _ref19 = _context5.sent;
            _ref20 = _slicedToArray(_ref19, 1);
            paxes = _ref20[0];
            pdfData = {
              reservationNo: booking.reservation_no,
              voucherNo: booking.voucher_no || booking.reservation_no,
              osRefNo: booking.os_ref_no || "-",
              hotelName: booking.hotel_name,
              hotelAddress: booking.hotel_address || "-",
              roomName: booking.room_name || "-",
              totalPrice: booking.total_price || 0,
              handlingFee: booking.handling_fee || 0,
              checkInDate: booking.check_in_date,
              checkOutDate: booking.check_out_date,
              breakfastType: booking.breakfast_type || "Room Only",
              specialRequests: booking.special_requests || "-"
            };
            _context5.next = 20;
            return regeneratorRuntime.awrap(generateBookingPDF(pdfData, paxes));

          case 20:
            pdfBuffer = _context5.sent;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', "attachment; filename=\"E-Voucher-".concat(booking.reservation_no, ".pdf\""));
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
            _context5.next = 31;
            break;

          case 27:
            _context5.prev = 27;
            _context5.t0 = _context5["catch"](0);
            console.error("❌ [GENERATE PDF ERROR]:", _context5.t0.message);
            return _context5.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context5.t0.message
            }));

          case 31:
          case "end":
            return _context5.stop();
        }
      }
    }, null, null, [[0, 27]]);
  },
  // ============================================================
  // 🔥 POST /bulk-resend - KIRIM MASSAL E-TIKET
  // ============================================================
  bulkResendEticket: function bulkResendEticket(req, res) {
    var _req$body, bookingIds, email, results, successCount, failCount, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, id, _ref21, _ref22, rows, booking;

    return regeneratorRuntime.async(function bulkResendEticket$(_context6) {
      while (1) {
        switch (_context6.prev = _context6.next) {
          case 0:
            _context6.prev = 0;
            _req$body = req.body, bookingIds = _req$body.bookingIds, email = _req$body.email;

            if (!(!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0)) {
              _context6.next = 4;
              break;
            }

            return _context6.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "bookingIds harus berupa array ID booking"
            }));

          case 4:
            if (!(bookingIds.length > 50)) {
              _context6.next = 6;
              break;
            }

            return _context6.abrupt("return", res.status(400).json({
              status: "ERROR",
              respMessage: "Maksimal 50 booking per request"
            }));

          case 6:
            results = [];
            successCount = 0;
            failCount = 0;
            _iteratorNormalCompletion2 = true;
            _didIteratorError2 = false;
            _iteratorError2 = undefined;
            _context6.prev = 12;
            _iterator2 = bookingIds[Symbol.iterator]();

          case 14:
            if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
              _context6.next = 44;
              break;
            }

            id = _step2.value;
            _context6.prev = 16;
            _context6.next = 19;
            return regeneratorRuntime.awrap(db.query("SELECT id, booking_status, contact_email \n                         FROM hotel_bookings WHERE id = ?", [id]));

          case 19:
            _ref21 = _context6.sent;
            _ref22 = _slicedToArray(_ref21, 1);
            rows = _ref22[0];

            if (!(rows.length === 0)) {
              _context6.next = 26;
              break;
            }

            results.push({
              id: id,
              status: 'FAILED',
              reason: 'Booking tidak ditemukan'
            });
            failCount++;
            return _context6.abrupt("continue", 41);

          case 26:
            booking = rows[0];

            if (['Accept', 'Processed'].includes(booking.booking_status)) {
              _context6.next = 31;
              break;
            }

            results.push({
              id: id,
              status: 'SKIPPED',
              reason: "Status: ".concat(booking.booking_status)
            });
            failCount++;
            return _context6.abrupt("continue", 41);

          case 31:
            _context6.next = 33;
            return regeneratorRuntime.awrap(sendBookingEmails(parseInt(id)));

          case 33:
            results.push({
              id: id,
              status: 'SUCCESS'
            });
            successCount++;
            _context6.next = 41;
            break;

          case 37:
            _context6.prev = 37;
            _context6.t0 = _context6["catch"](16);
            results.push({
              id: id,
              status: 'FAILED',
              reason: _context6.t0.message
            });
            failCount++;

          case 41:
            _iteratorNormalCompletion2 = true;
            _context6.next = 14;
            break;

          case 44:
            _context6.next = 50;
            break;

          case 46:
            _context6.prev = 46;
            _context6.t1 = _context6["catch"](12);
            _didIteratorError2 = true;
            _iteratorError2 = _context6.t1;

          case 50:
            _context6.prev = 50;
            _context6.prev = 51;

            if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
              _iterator2["return"]();
            }

          case 53:
            _context6.prev = 53;

            if (!_didIteratorError2) {
              _context6.next = 56;
              break;
            }

            throw _iteratorError2;

          case 56:
            return _context6.finish(53);

          case 57:
            return _context6.finish(50);

          case 58:
            return _context6.abrupt("return", res.json({
              status: "SUCCESS",
              message: "Berhasil mengirim ".concat(successCount, " dari ").concat(bookingIds.length, " e-tiket"),
              summary: {
                total: bookingIds.length,
                success: successCount,
                failed: failCount
              },
              results: results
            }));

          case 61:
            _context6.prev = 61;
            _context6.t2 = _context6["catch"](0);
            console.error("❌ [BULK RESEND ERROR]:", _context6.t2.message);
            return _context6.abrupt("return", res.status(500).json({
              status: "ERROR",
              respMessage: _context6.t2.message
            }));

          case 65:
          case "end":
            return _context6.stop();
        }
      }
    }, null, null, [[0, 61], [12, 46, 50, 58], [16, 37], [51,, 53, 57]]);
  }
};
module.exports = HotelBookingAdminController;