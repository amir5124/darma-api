"use strict";

var express = require('express');

var router = express.Router();

var axios = require('axios');

var _require = require('../helpers/darmaHelper'),
    BASE_URL = _require.BASE_URL,
    USER_CONFIG = _require.USER_CONFIG,
    agent = _require.agent,
    getConsistentToken = _require.getConsistentToken,
    logger = _require.logger;

router.post('/get-balance', function _callee(req, res) {
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
          logger.info("Mengecek Saldo Agen...");
          _context.next = 8;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Agent/Balance"), payload, {
            httpsAgent: agent
          }));

        case 8:
          response = _context.sent;
          res.json(response.data);
          _context.next = 15;
          break;

        case 12:
          _context.prev = 12;
          _context.t0 = _context["catch"](0);
          res.status(500).json({
            status: "ERROR",
            respMessage: _context.t0.message
          });

        case 15:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
module.exports = router;