"use strict";

var express = require('express');

var router = express.Router();

var axios = require('axios');

var _require = require('../helpers/darmaSandbox'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger;
/**
 * 1. GET SHIP ROUTES (Untuk Dropdown Pelabuhan)
 * Endpoint ini mengambil daftar rute yang tersedia
 */


router.post('/routes', function _callee(req, res) {
  var token, payload, response;
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          _context.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context.sent;
          payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("REQ_SHIP_ROUTES: Fetching available ship routes");
          _context.next = 8;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/Route"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 8:
          response = _context.sent;
          res.json(response.data);
          _context.next = 16;
          break;

        case 12:
          _context.prev = 12;
          _context.t0 = _context["catch"](0);
          logger.error("Ship Route Error: " + _context.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context.t0.message
          });

        case 16:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * 2. SHIP SCHEDULE SEARCH
 */
// routes/shipRoutes.js

router.post('/schedule', function _callee2(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          _context2.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context2.sent;
          b = req.body; // Di shipRoutes.js pastikan begini:

          payload = {
            shipID: "",
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            departStartDate: b.departStartDate,
            departEndDate: b.departEndDate,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("RE-TESTING SHIP SCHEDULE: ".concat(payload.originPort, " -> ").concat(payload.destinationPort));
          _context2.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/Schedule"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }));

        case 9:
          response = _context2.sent;
          res.json(response.data);
          _context2.next = 17;
          break;

        case 13:
          _context2.prev = 13;
          _context2.t0 = _context2["catch"](0);
          logger.error("Ship Schedule Error: " + _context2.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context2.t0.message
          });

        case 17:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 13]]);
});
router.post('/availability', function _callee3(req, res) {
  var token, b, payload, response, finalResponse;
  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.prev = 0;
          _context3.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context3.sent;
          b = req.body; // Payload disusun sesuai dokumentasi yang Anda berikan

          payload = {
            originPort: String(b.originPort),
            originCall: parseInt(b.originCall) || 0,
            destinationPort: String(b.destinationPort),
            destinationCall: parseInt(b.destinationCall) || 0,
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            // Format: "2019-08-24T14:15:22Z"
            subClass: b.subClass || "",
            pax: b.pax.map(function (p) {
              return {
                paxType: parseInt(p.paxType),
                // 0: Adult, 1: Child, 2: Infant
                paxGender: parseInt(p.paxGender),
                // 0: Male, 1: Female
                paxTotal: parseInt(p.paxTotal)
              };
            }),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("REQ_SHIP_AVAILABILITY: Ship ".concat(payload.shipNumber, " from ").concat(payload.originPort));
          logger.debug("PAYLOAD_AVAILABILITY", payload);
          _context3.next = 10;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/Availability"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 10:
          response = _context3.sent;
          logger.debug("RES_SHIP_AVAILABILITY", response.data); // LOGIKA BARU: Jika API tidak kasih numCode, kita buatkan sendiri di backend

          finalResponse = response.data;

          if (finalResponse.status === "SUCCESS" && !finalResponse.numCode) {
            // Kita generate ID unik berdasarkan timestamp
            finalResponse.numCode = "SHIP-".concat(Date.now());
          }

          res.json(finalResponse);
          _context3.next = 21;
          break;

        case 17:
          _context3.prev = 17;
          _context3.t0 = _context3["catch"](0);
          logger.error("Ship Availability Error: " + _context3.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context3.t0.message
          });

        case 21:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[0, 17]]);
});
router.post('/get-room', function _callee4(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.prev = 0;
          _context4.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context4.sent;
          b = req.body; // Payload disusun sesuai spesifikasi Darmawisata

          payload = {
            originPort: String(b.originPort),
            originCall: parseInt(b.originCall),
            destinationPort: String(b.destinationPort),
            destinationCall: parseInt(b.destinationCall),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            // Format ISO "YYYY-MM-DDTHH:mm:ssZ"
            subClass: String(b.subClass),
            pax: b.pax.map(function (p) {
              return {
                paxType: parseInt(p.paxType),
                paxGender: parseInt(p.paxGender),
                paxTotal: parseInt(p.paxTotal)
              };
            }),
            // Data pembeli tiket (Ticket Buyer)
            ticketBuyerName: b.ticketBuyerName || "Guest",
            ticketBuyerEmail: b.ticketBuyerEmail || "guest@mail.com",
            ticketBuyerAddress: b.ticketBuyerAddress || "Indonesia",
            ticketBuyerPhone: b.ticketBuyerPhone || "08123456789",
            family: b.family === true || b.family === "true",
            // Boolean
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("REQ_SHIP_GETROOM: Ship ".concat(payload.shipNumber, " for ").concat(payload.ticketBuyerName));
          logger.debug("PAYLOAD_GETROOM", payload);
          _context4.next = 10;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/GetRoom"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 10:
          response = _context4.sent;
          logger.debug("RES_SHIP_GETROOM", response.data);
          res.json(response.data);
          _context4.next = 19;
          break;

        case 15:
          _context4.prev = 15;
          _context4.t0 = _context4["catch"](0);
          logger.error("Ship GetRoom Error: " + _context4.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context4.t0.response ? _context4.t0.response.data : _context4.t0.message
          });

        case 19:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[0, 15]]);
});
router.post('/booking', function _callee5(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          _context5.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context5.sent;
          b = req.body; // Payload disusun sesuai dokumentasi yang Anda berikan

          payload = {
            numCode: b.numCode || "",
            // Biasanya didapat dari proses sebelumnya atau kosong jika awal
            originPort: String(b.originPort),
            originCall: parseInt(b.originCall),
            destinationPort: String(b.destinationPort),
            destinationCall: parseInt(b.destinationCall),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            // Format: "2019-08-24T14:15:22Z"
            paxDetails: b.paxDetails.map(function (p) {
              return {
                firstName: p.firstName,
                lastName: p.lastName || "",
                // Jika nama hanya satu kata, lastName dikosongkan/isi sama
                birthDate: p.birthDate,
                // Format: "2019-08-24T14:15:22Z"
                ID: p.ID,
                // NIK atau Nomor Identitas
                phone: p.phone,
                paxType: parseInt(p.paxType),
                // 0: Adult, 1: Child, 2: Infant
                paxGender: parseInt(p.paxGender) // 0: Male, 1: Female

              };
            }),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("REQ_SHIP_BOOKING: Booking for ".concat(payload.paxDetails.length, " pax on Ship ").concat(payload.shipNumber));
          logger.debug("PAYLOAD_BOOKING", payload);
          _context5.next = 10;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/Booking"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 10:
          response = _context5.sent;
          logger.debug("RES_SHIP_BOOKING", response.data);
          res.json(response.data);
          _context5.next = 19;
          break;

        case 15:
          _context5.prev = 15;
          _context5.t0 = _context5["catch"](0);
          logger.error("Ship Booking Error: " + _context5.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context5.t0.response ? _context5.t0.response.data : _context5.t0.message
          });

        case 19:
        case "end":
          return _context5.stop();
      }
    }
  }, null, null, [[0, 15]]);
});
/**
 * SHIP ISSUED
 * Proses final untuk menerbitkan tiket (pembayaran)
 */

router.post('/issued', function _callee6(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee6$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.prev = 0;
          _context6.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context6.sent;
          b = req.body;
          payload = {
            numCode: String(b.numCode),
            bookingDate: b.bookingDate,
            // Format ISO "2025-12-28T01:20:42Z"
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("REQ_SHIP_ISSUED: Issued for numCode ".concat(payload.numCode));
          _context6.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/Issued"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context6.sent;
          logger.debug("RES_SHIP_ISSUED", response.data);
          res.json(response.data);
          _context6.next = 18;
          break;

        case 14:
          _context6.prev = 14;
          _context6.t0 = _context6["catch"](0);
          logger.error("Ship Issued Error: " + _context6.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context6.t0.response ? _context6.t0.response.data : _context6.t0.message
          });

        case 18:
        case "end":
          return _context6.stop();
      }
    }
  }, null, null, [[0, 14]]);
});
/**
 * SHIP BOOKING DETAIL
 * Mendapatkan detail lengkap transaksi berdasarkan Nomor Booking atau NumCode
 */

router.post('/booking-detail', function _callee7(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee7$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          _context7.prev = 0;
          _context7.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context7.sent;
          // Mengambil token yang valid
          b = req.body;
          payload = {
            bokingNumber: b.bokingNumber || "",
            // Nomor PNR/Booking
            numCode: b.numCode || "",
            // Kode transaksi internal
            bookingDate: b.bookingDate,
            // Format ISO "2025-12-28T01:27:24Z"
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.info("REQ_BOOKING_DETAIL: Fetching detail for ".concat(payload.bokingNumber || payload.numCode));
          _context7.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Ship/BookingDetail"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context7.sent;
          logger.debug("RES_BOOKING_DETAIL", response.data);
          res.json(response.data);
          _context7.next = 18;
          break;

        case 14:
          _context7.prev = 14;
          _context7.t0 = _context7["catch"](0);
          logger.error("Ship Booking Detail Error: " + _context7.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context7.t0.response ? _context7.t0.response.data : _context7.t0.message
          });

        case 18:
        case "end":
          return _context7.stop();
      }
    }
  }, null, null, [[0, 14]]);
});
module.exports = router;