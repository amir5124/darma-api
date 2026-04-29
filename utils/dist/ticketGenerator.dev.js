"use strict";

var puppeteer = require('puppeteer');

var generateTicketPDF = function generateTicketPDF(data, fee, total) {
  var browser, page, paxRows, htmlContent, pdfBuffer;
  return regeneratorRuntime.async(function generateTicketPDF$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.next = 2;
          return regeneratorRuntime.awrap(puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox']
          }));

        case 2:
          browser = _context.sent;
          _context.next = 5;
          return regeneratorRuntime.awrap(browser.newPage());

        case 5:
          page = _context.sent;
          // Penumpang Rows
          paxRows = data.paxBookingDetails.map(function (p, index) {
            return "\n        <tr>\n            <td>".concat(index + 1, "</td>\n            <td><b>").concat(p.paxName, "</b><br><small>").concat(p.ticketNumber, "</small></td>\n            <td>").concat(p.ID, "</td>\n            <td>").concat(p.paxType, "</td>\n            <td style=\"text-align: right;\">Rp ").concat(p.fare.toLocaleString('id-ID'), "</td>\n        </tr>\n    ");
          }).join(''); // HTML Content (Mirip Layout Gambar)

          htmlContent = "\n    <html>\n    <head>\n        <style>\n            body { font-family: 'Helvetica', sans-serif; padding: 30px; color: #333; }\n            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #00468C; padding-bottom: 10px; }\n            .ship-info { background: #f0f4f8; padding: 15px; margin: 20px 0; border-radius: 5px; display: flex; justify-content: space-between; }\n            table { width: 100%; border-collapse: collapse; margin-top: 20px; }\n            th { background: #00468C; color: white; padding: 10px; text-align: left; }\n            td { padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; }\n            .ringkasan { margin-top: 30px; width: 300px; float: right; }\n            .ringkasan table td { border: none; padding: 5px; }\n            .footer { margin-top: 100px; font-size: 10px; color: #777; border-top: 1px solid #ccc; padding-top: 10px; }\n        </style>\n    </head>\n    <body>\n        <div class=\"header\">\n            <div>\n                <img src=\"https://dlu.co.id/assets/img/logo-dlu.png\" height=\"50\">\n            </div>\n            <div style=\"text-align: right\">\n                <small>KODE PESANAN</small><br>\n                <b style=\"font-size: 24px; color: #00468C;\">".concat(data.bookingNumber, "</b>\n            </div>\n        </div>\n\n        <h2 style=\"color: #00468C;\">E-Tiket: ").concat(data.shipName, "</h2>\n        \n        <div class=\"ship-info\">\n            <div>\n                <small>BERANGKAT</small><br>\n                <b>").concat(data.originName, "</b><br>\n                ").concat(new Date(data.departDate).toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }), "\n            </div>\n            <div style=\"text-align: right\">\n                <small>ESTIMASI TIBA</small><br>\n                <b>").concat(data.destinationName, "</b>\n            </div>\n        </div>\n\n        <table>\n            <thead>\n                <tr>\n                    <th>No</th>\n                    <th>Nama Penumpang</th>\n                    <th>No. Identitas</th>\n                    <th>Kelas</th>\n                    <th>Tarif</th>\n                </tr>\n            </thead>\n            <tbody>\n                ").concat(paxRows, "\n            </tbody>\n        </table>\n\n        <div class=\"ringkasan\">\n            <table>\n                <tr>\n                    <td>Total Tiket</td>\n                    <td style=\"text-align: right;\">Rp ").concat(data.ticketPrice.toLocaleString('id-ID'), "</td>\n                </tr>\n                <tr>\n                    <td>Biaya Layanan</td>\n                    <td style=\"text-align: right;\">Rp ").concat(fee.toLocaleString('id-ID'), "</td>\n                </tr>\n                <tr style=\"font-weight: bold; font-size: 16px; color: #00468C;\">\n                    <td>Total Bayar</td>\n                    <td style=\"text-align: right;\">Rp ").concat(total.toLocaleString('id-ID'), "</td>\n                </tr>\n            </table>\n        </div>\n\n        <div style=\"clear: both;\"></div>\n        <div class=\"footer\">\n            * Harap berada di terminal penumpang 2 jam sebelum keberangkatan.<br>\n            * Wajib membawa kartu identitas asli (KTP/SIM/Paspor).\n        </div>\n    </body>\n    </html>\n    ");
          _context.next = 10;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 10:
          _context.next = 12;
          return regeneratorRuntime.awrap(page.pdf({
            format: 'A4',
            printBackground: true
          }));

        case 12:
          pdfBuffer = _context.sent;
          _context.next = 15;
          return regeneratorRuntime.awrap(browser.close());

        case 15:
          return _context.abrupt("return", pdfBuffer);

        case 16:
        case "end":
          return _context.stop();
      }
    }
  });
};

module.exports = {
  generateTicketPDF: generateTicketPDF
};