"use strict";

var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'linkutransport@gmail.com',
    pass: 'qbckptzxgdumxtdm'
  }
});
/**
 * Fungsi Utility untuk mengirim email (Updated)
 * @param {string} to - Alamat email tujuan
 * @param {string} subject - Judul email
 * @param {string} htmlContent - Isi email dalam format HTML
 * @param {Array} attachments - (Opsional) Array berisi objek lampiran
 */

var sendBookingEmail = function sendBookingEmail(to, subject, htmlContent) {
  var attachments,
      mailOptions,
      info,
      _args = arguments;
  return regeneratorRuntime.async(function sendBookingEmail$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          attachments = _args.length > 3 && _args[3] !== undefined ? _args[3] : [];
          _context.prev = 1;
          mailOptions = {
            from: '"LinkU Travel" <no-reply@linkutransport.id>',
            to: to,
            subject: subject,
            html: htmlContent,
            attachments: attachments // <--- INI PERUBAHANNYA: Menambahkan dukungan lampiran

          };
          _context.next = 5;
          return regeneratorRuntime.awrap(transporter.sendMail(mailOptions));

        case 5:
          info = _context.sent;
          console.log("\uD83D\uDCE7 Email berhasil dikirim ke ".concat(to, ": ").concat(info.messageId));
          return _context.abrupt("return", info);

        case 10:
          _context.prev = 10;
          _context.t0 = _context["catch"](1);
          console.error("❌ Mailer Error:", _context.t0.message);
          throw _context.t0;

        case 14:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[1, 10]]);
};

module.exports = {
  sendBookingEmail: sendBookingEmail
};