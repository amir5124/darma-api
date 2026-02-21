"use strict";

// routes/hotelRoutes.js
var express = require('express');

var router = express.Router();

var axios = require('axios');

var _require = require('../helpers/darmaSandbox'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger; // 1. HOTEL SEARCH


router.post('/search', function _callee(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          _context.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context.sent;
          b = req.body; // Payload disesuaikan persis dengan contoh request Anda

          payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,
            // Contoh: "2023-01-01T14:00:00Z"
            checkOutDate: b.checkOutDate,
            // Contoh: "2023-01-02T12:00:00Z"
            roomRequest: b.roomRequest.map(function (room) {
              return {
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Sesuai permintaan: [0]

              };
            }),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_SEARCH5", payload); // Endpoint diganti menjadi Search5 sesuai instruksi

          _context.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/Search5"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context.sent;
          logger.debug("RES_HOTEL_SEARCH5", response.data);
          res.json(response.data);
          _context.next = 18;
          break;

        case 14:
          _context.prev = 14;
          _context.t0 = _context["catch"](0);
          logger.error("Hotel Search5 Error: " + _context.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context.t0.message
          });

        case 18:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 14]]);
}); // 2. HOTEL AVAILABLE ROOMS

router.post('/available-rooms', function _callee2(req, res) {
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
          b = req.body;
          payload = {
            hotelID: b.hotelID,
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            // Pastikan roomRequest dipetakan dengan benar sesuai standar strict
            roomRequest: b.roomRequest.map(function (room) {
              return {
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Mengikuti standar [0] jika childNum 0

              };
            }),
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_ROOMS_5", payload); // Perhatikan URL: Gunakan /Hotel/AvailableRoom5 jika mengikuti standar Search5

          _context2.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/AvailableRooms5"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context2.sent;
          logger.debug("RES_HOTEL_ROOMS_5", response.data);
          res.json(response.data);
          _context2.next = 18;
          break;

        case 14:
          _context2.prev = 14;
          _context2.t0 = _context2["catch"](0);
          logger.error("Hotel Available Rooms Error: " + _context2.t0.message);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context2.t0.message
          });

        case 18:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 14]]);
}); // 3. HOTEL PRICE AND POLICY INFO

router.post('/price-info', function _callee3(req, res) {
  var token, b, payload, response;
  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.prev = 0;
          _context3.next = 3;
          return regeneratorRuntime.awrap(getConsistentToken());

        case 3:
          token = _context3.sent;
          b = req.body;
          payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: b.cityID,
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            roomRequest: b.roomRequest,
            internalCode: b.internalCode,
            hotelID: b.hotelID,
            breakfast: b.breakfast,
            roomID: b.roomID,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          _context3.next = 8;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/PriceAndPolicyInfo"), payload, {
            httpsAgent: agent
          }));

        case 8:
          response = _context3.sent;
          res.json(response.data);
          _context3.next = 15;
          break;

        case 12:
          _context3.prev = 12;
          _context3.t0 = _context3["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context3.t0.message
          });

        case 15:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[0, 12]]);
}); // Endpoint Gambar Hotel (Utama)

router.get('/image', function _callee4(req, res) {
  var id, response;
  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.prev = 0;
          id = req.query.id; // required

          _context4.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/Image?id=").concat(id), {
            httpsAgent: agent,
            responseType: 'arraybuffer' // Karena API mengembalikan stream gambar

          }));

        case 4:
          response = _context4.sent;
          res.set('Content-Type', 'image/jpeg');
          res.send(response.data);
          _context4.next = 12;
          break;

        case 9:
          _context4.prev = 9;
          _context4.t0 = _context4["catch"](0);
          res.status(404).send('Image not found');

        case 12:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[0, 9]]);
}); // Endpoint Gambar Kamar

router.get('/room-image', function _callee5(req, res) {
  var RoomID, response;
  return regeneratorRuntime.async(function _callee5$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          RoomID = req.query.RoomID; // required

          _context5.next = 4;
          return regeneratorRuntime.awrap(axios.get("".concat(BASE_URL, "/Hotel/RoomImage?RoomID=").concat(RoomID), {
            httpsAgent: agent,
            responseType: 'arraybuffer'
          }));

        case 4:
          response = _context5.sent;
          res.set('Content-Type', 'image/jpeg');
          res.send(response.data);
          _context5.next = 12;
          break;

        case 9:
          _context5.prev = 9;
          _context5.t0 = _context5["catch"](0);
          res.status(404).send('Room image not found');

        case 12:
        case "end":
          return _context5.stop();
      }
    }
  }, null, null, [[0, 9]]);
}); // 4. HOTEL BOOKING ALL SUPPLIER
// 4. HOTEL BOOKING ALL SUPPLIER

router.post('/booking', function _callee6(req, res) {
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
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            // PASTIKAN ada Z di akhir jika di frontend belum ada
            checkInDate: b.checkInDate.endsWith('Z') ? b.checkInDate : b.checkInDate + 'Z',
            checkOutDate: b.checkOutDate.endsWith('Z') ? b.checkOutDate : b.checkOutDate + 'Z',
            roomRequest: b.roomRequest.map(function (room) {
              return {
                paxes: room.paxes.map(function (pax) {
                  return {
                    title: pax.title,
                    firstName: pax.firstName.trim(),
                    lastName: pax.lastName.trim()
                  };
                }),
                isSmokingRoom: Boolean(room.isSmokingRoom),
                phone: String(room.phone),
                email: String(room.email),
                specialRequestArray: null,
                requestDescription: room.requestDescription || null,
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0]
              };
            }),
            internalCode: b.internalCode,
            hotelID: b.hotelID,
            breakfast: b.breakfast,
            roomID: b.roomID,
            bedType: {
              ID: null,
              bed: null
            },
            agentOsRef: b.agentOsRef,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
          _context6.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingAllSupplier"), payload, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 9:
          response = _context6.sent;
          logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(response.data));
          res.json(response.data);
          _context6.next = 17;
          break;

        case 14:
          _context6.prev = 14;
          _context6.t0 = _context6["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context6.t0.message
          });

        case 17:
        case "end":
          return _context6.stop();
      }
    }
  }, null, null, [[0, 14]]);
}); // 5. HOTEL BOOKING DETAIL

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
          b = req.body;
          payload = {
            reservationNo: b.reservationNo,
            osRefNo: b.osRefNo,
            agentOsRef: b.agentOsRef,
            userID: USER_CONFIG.userID,
            accessToken: token
          };
          logger.debug("REQ_HOTEL_DETAIL", payload);
          _context7.next = 9;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Hotel/BookingDetail"), payload, {
            httpsAgent: agent
          }));

        case 9:
          response = _context7.sent;
          logger.debug("RES_HOTEL_DETAIL", response.data);
          res.json(response.data);
          _context7.next = 17;
          break;

        case 14:
          _context7.prev = 14;
          _context7.t0 = _context7["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context7.t0.message
          });

        case 17:
        case "end":
          return _context7.stop();
      }
    }
  }, null, null, [[0, 14]]);
});
module.exports = router;