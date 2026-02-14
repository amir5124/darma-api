"use strict";

var nodemailer = require('nodemailer');
/**
 * Konfigurasi Transporter
 * Jika menggunakan Gmail, pastikan sudah mengaktifkan "App Password".
 */


var transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  // Ganti jika menggunakan provider lain (misal: Mailgun, SMTP Hosting)
  port: 465,
  secure: true,
  // true untuk port 465, false untuk port 587
  auth: {
    user: 'linkutransport@gmail.com',
    // Alamat email pengirim
    pass: 'qbckptzxgdumxtdm' // Password Aplikasi (BUKAN password email biasa)

  }
});
/**
 * Fungsi Utility untuk mengirim email
 * @param {string} to - Alamat email tujuan
 * @param {string} subject - Judul email
 * @param {string} htmlContent - Isi email dalam format HTML
 */

var sendBookingEmail = function sendBookingEmail(to, subject, htmlContent) {
  var mailOptions, info;
  return regeneratorRuntime.async(function sendBookingEmail$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          mailOptions = {
            from: '"SiapPgo Travel" <no-reply@siappgo.id>',
            to: to,
            subject: subject,
            html: htmlContent
          };
          _context.next = 4;
          return regeneratorRuntime.awrap(transporter.sendMail(mailOptions));

        case 4:
          info = _context.sent;
          console.log("\uD83D\uDCE7 Email berhasil dikirim: ".concat(info.messageId));
          return _context.abrupt("return", info);

        case 9:
          _context.prev = 9;
          _context.t0 = _context["catch"](0);
          console.error("❌ Mailer Error:", _context.t0.message);
          throw _context.t0;

        case 13:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 9]]);
};

module.exports = {
  sendBookingEmail: sendBookingEmail
};