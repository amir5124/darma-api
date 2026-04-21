"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var express = require('express');

var cors = require('cors');

var path = require('path'); // <-- Tambahkan ini untuk manajemen path file


var _require = require('./helpers/darmaHelper'),
    logger = _require.logger; // 1. Import Routes


var flightRoutes = require('./routes/flightRoutes');

var agentRoutes = require('./routes/agentRoutes');

var hotelRoutes = require('./routes/hotelRoutes');

var shipRoutes = require('./routes/shipRoutes');

var shpdluRoutes = require('./routes/shipdluRoutes');

var trainRoutes = require('./routes/trainRoutes');

var historyRoutes = require('./routes/historyRoutes');

var paymentRoutes = require('./routes/paymentRoutes');

var shipPaymentRoutes = require('./routes/shipPaymentRoutes');

var hotelPaymentRoutes = require('./routes/hotelPaymentRoutes');

var app = express(); // Middleware

app.use(express.json());
app.use(cors()); // Melayani file statis dari folder 'public' (seperti gambar, css, js frontend)

app.use(express["static"]('public'));
/**
 * 3. ROUTE KHUSUS TRACKING (CARA 2)
 * Ketika user klik link dari email: https://darma.siappgo.id/tracking?no=...
 * Maka server akan mengirimkan file tracking.html
 */
// Endpoint untuk melayani file HTML

app.get('/tracking', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
}); // Endpoint API yang akan dipanggil oleh JavaScript di tracking.html

app.get('/api/tracking-data', function _callee(req, res) {
  var _req$query, no, os, _ref, _ref2, rows, booking, _ref3, _ref4, paxes;

  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _req$query = req.query, no = _req$query.no, os = _req$query.os;

          if (!(!no && !os)) {
            _context.next = 3;
            break;
          }

          return _context.abrupt("return", res.status(400).json({
            status: "Error",
            message: "Parameter tidak lengkap"
          }));

        case 3:
          _context.prev = 3;
          _context.next = 6;
          return regeneratorRuntime.awrap(db.execute("SELECT * FROM hotel_bookings WHERE reservation_no = ? OR os_ref_no = ? LIMIT 1", [no || null, os || null]));

        case 6:
          _ref = _context.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];

          if (!(rows.length === 0)) {
            _context.next = 11;
            break;
          }

          return _context.abrupt("return", res.status(404).json({
            status: "Error",
            message: "Data tidak ditemukan"
          }));

        case 11:
          booking = rows[0]; // Ambil data tamu

          _context.next = 14;
          return regeneratorRuntime.awrap(db.execute("SELECT title, first_name, last_name FROM hotel_booking_paxes WHERE booking_id = ?", [booking.id]));

        case 14:
          _ref3 = _context.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];
          res.json({
            status: "Success",
            data: booking,
            paxes: paxes
          });
          _context.next = 23;
          break;

        case 20:
          _context.prev = 20;
          _context.t0 = _context["catch"](3);
          res.status(500).json({
            status: "Error",
            message: _context.t0.message
          });

        case 23:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[3, 20]]);
}); // 2. Daftarkan API Routes

app.use('/api/flights', flightRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/hotel-payments', hotelPaymentRoutes);
app.use('/api/ship', shipRoutes);
app.use('/api/shipdlu', shpdluRoutes);
app.use('/api/train', trainRoutes);
app.use('/api/booking-history', historyRoutes);
app.use('/api', paymentRoutes);
app.use('/api/pay/ship', shipPaymentRoutes);
var PORT = 3000;
app.listen(PORT, function () {
  logger.success("=============================================");
  logger.success("   SERVER DARMAWISATA MULTI-PRODUK JALAN");
  logger.success("   Port           : ".concat(PORT));
  logger.success("   Tracking Link  : /tracking"); // <-- Info baru

  logger.success("   API Hotel      : /api/hotels");
  logger.success("   API Kereta     : /api/train");
  logger.success("=============================================");
});