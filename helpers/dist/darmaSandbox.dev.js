"use strict";

var axios = require('axios');

var moment = require('moment-timezone');

var crypto = require('crypto');

var https = require('https');

var BASE_URL = 'https://uat.darmawisataindonesiah2h.co.id:7080/h2h/';
var USER_CONFIG = {
  userID: "CF0X64HBR8",
  password: "Darmaj4y4"
};
var globalAccessToken = null;
var agent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true
});

var md5 = function md5(data) {
  return crypto.createHash('md5').update(data).digest('hex');
};

var logger = {
  info: function info(msg) {
    return console.log("\x1B[36m[INFO]\x1B[0m ".concat(msg));
  },
  success: function success(msg) {
    return console.log("\x1B[32m[SUCCESS]\x1B[0m ".concat(msg));
  },
  error: function error(msg) {
    return console.log("\x1B[31m[ERROR]\x1B[0m ".concat(msg));
  },
  debug: function debug(label, data) {
    console.log("\x1B[35m[DEBUG] === ".concat(label, " ===\x1B[0m"));
    console.dir(data, {
      depth: null
    });
    console.log("\x1B[35m[END ".concat(label, "]\x1B[0m\n"));
  }
};

function getConsistentToken() {
  var forceRefresh,
      timestamp,
      securityCode,
      res,
      _args = arguments;
  return regeneratorRuntime.async(function getConsistentToken$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          forceRefresh = _args.length > 0 && _args[0] !== undefined ? _args[0] : false;
          if (forceRefresh) globalAccessToken = null;

          if (globalAccessToken) {
            _context.next = 17;
            break;
          }

          _context.prev = 3;
          timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
          securityCode = md5(timestamp + md5(USER_CONFIG.password));
          _context.next = 8;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Session/Login"), {
            token: timestamp,
            securityCode: securityCode,
            language: 0,
            userID: USER_CONFIG.userID
          }, {
            httpsAgent: agent
          }));

        case 8:
          res = _context.sent;
          globalAccessToken = res.data.accessToken;
          logger.success("Token Refresh: ".concat(globalAccessToken.substring(0, 8), "..."));
          _context.next = 17;
          break;

        case 13:
          _context.prev = 13;
          _context.t0 = _context["catch"](3);
          logger.error("Login Error: " + _context.t0.message);
          throw _context.t0;

        case 17:
          return _context.abrupt("return", globalAccessToken);

        case 18:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[3, 13]]);
}

module.exports = {
  BASE_URL: BASE_URL,
  USER_CONFIG: USER_CONFIG,
  agent: agent,
  getConsistentToken: getConsistentToken,
  logger: logger
};