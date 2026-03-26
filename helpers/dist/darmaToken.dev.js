"use strict";

var axios = require('axios');

var moment = require('moment-timezone');

var crypto = require('crypto');

var https = require('https');

var BASE_URL = 'https://darmawisataindonesiah2h.co.id';
var USER_CONFIG = {
  userID: "S8MFEIKENB",
  password: "8MN2WM5VZT"
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
      depth: null,
      colors: true
    });
    console.log("\x1B[35m[END ".concat(label, "]\x1B[0m\n"));
  }
};

function getConsistentToken() {
  var forceRefresh,
      timestamp,
      securityCode,
      payload,
      res,
      _args = arguments;
  return regeneratorRuntime.async(function getConsistentToken$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          forceRefresh = _args.length > 0 && _args[0] !== undefined ? _args[0] : false;

          if (forceRefresh) {
            logger.info("Force refresh dipicu, menghapus token lama...");
            globalAccessToken = null;
          }

          if (globalAccessToken) {
            _context.next = 23;
            break;
          }

          _context.prev = 3;
          timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
          securityCode = md5(timestamp + md5(USER_CONFIG.password));
          payload = {
            token: timestamp,
            securityCode: securityCode,
            language: 0,
            userID: USER_CONFIG.userID
          };
          logger.info("Mencoba login ke server...");
          logger.debug("Login Payload", payload);
          _context.next = 11;
          return regeneratorRuntime.awrap(axios.post("".concat(BASE_URL, "/Session/Login"), payload, {
            httpsAgent: agent
          }));

        case 11:
          res = _context.sent;
          // Cek apakah response sukses dari sisi API (biasanya ada respCode/status)
          logger.debug("Login Response Data", res.data);

          if (res.data && res.data.accessToken) {
            globalAccessToken = res.data.accessToken;
            logger.success("Token berhasil didapat: ".concat(globalAccessToken.substring(0, 12), "..."));
          } else {
            logger.error("Login gagal: Access Token tidak ditemukan dalam response.");
          }

          _context.next = 21;
          break;

        case 16:
          _context.prev = 16;
          _context.t0 = _context["catch"](3);
          logger.error("Login Error: ".concat(_context.t0.message));

          if (_context.t0.response) {
            logger.debug("Error Response Body", _context.t0.response.data);
          }

          throw _context.t0;

        case 21:
          _context.next = 24;
          break;

        case 23:
          logger.info("Menggunakan token yang sudah ada (Cache).");

        case 24:
          return _context.abrupt("return", globalAccessToken);

        case 25:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[3, 16]]);
}

module.exports = {
  BASE_URL: BASE_URL,
  USER_CONFIG: USER_CONFIG,
  agent: agent,
  getConsistentToken: getConsistentToken,
  logger: logger
};