"use strict";

var puppeteer = require('puppeteer');

var QRCode = require('qrcode');

var generateTicketPDF = function generateTicketPDF(data, fee, total) {
  var browser, page, primaryColor, mainQrBase64, paxRows, htmlContent, pdfBuffer;
  return regeneratorRuntime.async(function generateTicketPDF$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.next = 2;
          return regeneratorRuntime.awrap(puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }));

        case 2:
          browser = _context2.sent;
          _context2.prev = 3;
          _context2.next = 6;
          return regeneratorRuntime.awrap(browser.newPage());

        case 6:
          page = _context2.sent;
          primaryColor = "#24b3ae"; // Generate QR Code untuk Booking Number (Besar di Header)

          _context2.next = 10;
          return regeneratorRuntime.awrap(QRCode.toDataURL(data.bookingNumber));

        case 10:
          mainQrBase64 = _context2.sent;
          _context2.next = 13;
          return regeneratorRuntime.awrap(Promise.all(data.paxBookingDetails.map(function _callee(p, index) {
            var ticketQrBase64, isVehicle, labelIdentitas;
            return regeneratorRuntime.async(function _callee$(_context) {
              while (1) {
                switch (_context.prev = _context.next) {
                  case 0:
                    _context.next = 2;
                    return regeneratorRuntime.awrap(QRCode.toDataURL(p.ticketQRCode || p.ticketNumber));

                  case 2:
                    ticketQrBase64 = _context.sent;
                    // Logika deteksi kendaraan (berdasarkan paxType atau ID yang mengandung plat nomor)
                    isVehicle = p.paxType.toLowerCase().includes('kendaraan') || p.paxType.toLowerCase().includes('motor') || p.paxType.toLowerCase().includes('mobil');
                    labelIdentitas = isVehicle ? "No. Polisi" : "No. Identitas";
                    return _context.abrupt("return", "\n                <tr>\n                    <td style=\"text-align: center;\">".concat(index + 1, "</td>\n                    <td>\n                        <div style=\"display: flex; align-items: center;\">\n                            <img src=\"").concat(ticketQrBase64, "\" width=\"50\" style=\"margin-right: 10px;\">\n                            <div>\n                                <b style=\"font-size: 13px;\">").concat(p.paxName, "</b><br>\n                                <small style=\"color: ").concat(primaryColor, "; font-weight: bold;\">").concat(p.ticketNumber, "</small>\n                            </div>\n                        </div>\n                    </td>\n                    <td>\n                        <small style=\"color: #666;\">").concat(labelIdentitas, "</small><br>\n                        <b>").concat(p.ID, "</b>\n                    </td>\n                    <td>").concat(p.paxType, "</td>\n                    <td style=\"text-align: right; font-weight: bold;\">Rp ").concat(p.fare.toLocaleString('id-ID'), "</td>\n                </tr>\n            "));

                  case 6:
                  case "end":
                    return _context.stop();
                }
              }
            });
          })));

        case 13:
          paxRows = _context2.sent;
          htmlContent = "\n        <html>\n        <head>\n            <style>\n                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; line-height: 1.4; }\n                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ".concat(primaryColor, "; padding-bottom: 10px; }\n                .brand { color: ").concat(primaryColor, "; }\n                .brand h1 { margin: 0; font-size: 28px; }\n                .main-qr { text-align: center; }\n                .main-qr img { width: 80px; }\n                \n                .ship-info { background: #f4fbfc; padding: 15px; margin: 20px 0; border-radius: 8px; border: 1px solid #d1eded; display: flex; justify-content: space-between; }\n                .ship-info b { font-size: 16px; color: #333; }\n                \n                table { width: 100%; border-collapse: collapse; margin-top: 10px; }\n                th { background: ").concat(primaryColor, "; color: white; padding: 12px 10px; text-align: left; font-size: 12px; text-transform: uppercase; }\n                td { padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 11px; vertical-align: middle; }\n                \n                .ringkasan-container { margin-top: 20px; display: flex; justify-content: flex-end; }\n                .ringkasan { width: 280px; background: #f9f9f9; padding: 15px; border-radius: 8px; }\n                .ringkasan table td { border: none; padding: 4px 0; font-size: 13px; }\n                .total-row { font-size: 18px !important; font-weight: bold; color: ").concat(primaryColor, "; border-top: 1px solid #ddd !important; }\n                \n                .footer { margin-top: 40px; font-size: 10px; color: #666; border-top: 1px dashed #ccc; padding-top: 15px; }\n                .watermark { position: absolute; top: 40%; left: 25%; transform: rotate(-30deg); font-size: 80px; color: rgba(36, 179, 174, 0.05); z-index: -1; font-weight: bold; }\n            </style>\n        </head>\n        <body>\n            <div class=\"watermark\">LINKU</div>\n            \n            <div class=\"header\">\n                <div class=\"brand\">\n                    <img src=\"https://dlu.co.id/assets/img/logo-dlu.png\" height=\"40\" style=\"margin-bottom: 5px;\">\n                    <h1>E-TIKET</h1>\n                    <small>LINKU</small>\n                </div>\n                <div class=\"main-qr\">\n                    <img src=\"").concat(mainQrBase64, "\"><br>\n                    <small>KODE PESANAN</small><br>\n                    <b style=\"font-size: 20px; color: ").concat(primaryColor, "\">").concat(data.bookingNumber, "</b>\n                </div>\n            </div>\n\n            <div class=\"ship-info\">\n                <div>\n                    <small style=\"color: ").concat(primaryColor, "; font-weight: bold;\">KAPAL</small><br>\n                    <b>").concat(data.shipName, "</b><br>\n                    <span style=\"font-size: 12px;\">Keberangkatan: ").concat(new Date(data.departDate).toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          }), "</span>\n                </div>\n                <div style=\"text-align: right\">\n                    <small style=\"color: ").concat(primaryColor, "; font-weight: bold;\">RUTE</small><br>\n                    <b>").concat(data.originName, "</b><br>\n                    <span style=\"color: ").concat(primaryColor, "; font-weight: bold;\">&darr;</span><br>\n                    <b>").concat(data.destinationName, "</b>\n                </div>\n            </div>\n\n            <table>\n                <thead>\n                    <tr>\n                        <th width=\"5%\">No</th>\n                        <th width=\"40%\">Penumpang / Kendaraan</th>\n                        <th width=\"20%\">Identitas / No. Pol</th>\n                        <th width=\"20%\">Kelas/Tipe</th>\n                        <th width=\"15%\" style=\"text-align: right;\">Tarif</th>\n                    </tr>\n                </thead>\n                <tbody>\n                    ").concat(paxRows.join(''), "\n                </tbody>\n            </table>\n\n            <div class=\"ringkasan-container\">\n                <div class=\"ringkasan\">\n                    <table width=\"100%\">\n                        <tr>\n                            <td>Total Harga Tiket</td>\n                            <td style=\"text-align: right;\">Rp ").concat(data.ticketPrice.toLocaleString('id-ID'), "</td>\n                        </tr>\n                        <tr>\n                            <td>Biaya Layanan (Fee)</td>\n                            <td style=\"text-align: right;\">Rp ").concat(fee.toLocaleString('id-ID'), "</td>\n                        </tr>\n                        <tr class=\"total-row\">\n                            <td>Total Bayar</td>\n                            <td style=\"text-align: right;\">Rp ").concat(total.toLocaleString('id-ID'), "</td>\n                        </tr>\n                    </table>\n                </div>\n            </div>\n\n            <div class=\"footer\">\n                <b>SYARAT & KETENTUAN:</b><br>\n                1. Penumpang wajib sudah berada di terminal 2 jam sebelum keberangkatan.<br>\n                2. Wajib menunjukkan kartu identitas asli (KTP/SIM/Paspor) atau STNK asli untuk kendaraan.<br>\n                3. E-Tiket ini merupakan bukti perjalanan yang sah dan diterbitkan oleh LinkU Transport.\n            </div>\n        </body>\n        </html>\n        ");
          _context2.next = 17;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 17:
          _context2.next = 19;
          return regeneratorRuntime.awrap(page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              top: '20px',
              right: '20px',
              bottom: '20px',
              left: '20px'
            }
          }));

        case 19:
          pdfBuffer = _context2.sent;
          return _context2.abrupt("return", pdfBuffer);

        case 21:
          _context2.prev = 21;
          _context2.next = 24;
          return regeneratorRuntime.awrap(browser.close());

        case 24:
          return _context2.finish(21);

        case 25:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[3,, 21, 25]]);
};

module.exports = {
  generateTicketPDF: generateTicketPDF
};