"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var puppeteer = require('puppeteer');

var nodemailer = require('nodemailer');

var db = require('../config/db'); // 1. Konfigurasi Nodemailer


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
 * Fungsi Internal: Menghasilkan Buffer PDF menggunakan Puppeteer
 */

function generateBookingPDF(data, paxes) {
  var browser, page, hargaDasar, biayaHandling, alamatHotel, totalHargaFisik, totalFormatted, paymentDate, formatDateIndo, checkIn, checkOut, diffTime, nights, guestNames, requestValue, finalSpecialRequest, htmlContent, pdfBuffer;
  return regeneratorRuntime.async(function generateBookingPDF$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          console.log("Cek Data Masuk ke PDF:", JSON.stringify(data, null, 2));
          _context.prev = 1;
          _context.next = 4;
          return regeneratorRuntime.awrap(puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }));

        case 4:
          browser = _context.sent;
          _context.next = 7;
          return regeneratorRuntime.awrap(browser.newPage());

        case 7:
          page = _context.sent;
          // 1. Perbaikan Parsing Angka
          hargaDasar = parseFloat(data.totalPrice || data.total_price || 0);
          biayaHandling = parseFloat(data.handlingFee || data.handling_fee || 0);
          alamatHotel = data.hotel_address; // Total Akhir

          totalHargaFisik = Math.ceil(hargaDasar + biayaHandling);
          totalFormatted = totalHargaFisik.toLocaleString('id-ID'); // Format Tanggal Transaksi

          paymentDate = new Date().toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          });

          formatDateIndo = function formatDateIndo(dateStr) {
            if (!dateStr) return "-";
            return new Date(dateStr).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            });
          }; // 2. Perbaikan Hitung Durasi Malam (Gunakan Math.max agar tidak nol/minus)


          checkIn = new Date(data.checkInDate || data.check_in_date);
          checkOut = new Date(data.checkOutDate || data.check_out_date);
          diffTime = Math.abs(checkOut - checkIn);
          nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1; // 3. Perbaikan Daftar Tamu (Mapping paxes agar mendukung camelCase dan snake_case dari DB)

          guestNames = paxes && Array.isArray(paxes) && paxes.length > 0 ? paxes.map(function (p) {
            var title = p.title || p.pax_title || '';
            var fName = p.firstName || p.first_name || '';
            var lName = p.lastName || p.last_name || '';
            return "".concat(title, " ").concat(fName, " ").concat(lName).trim();
          }).join(', ') : "Guest"; // 4. Perbaikan Special Request (Pastikan mengambil dari properti yang benar)

          requestValue = data.specialRequests || data.special_requests || "";
          finalSpecialRequest = requestValue && requestValue !== "" && requestValue !== "-" && requestValue !== "null" ? requestValue : "Tidak ada permintaan khusus";
          htmlContent = "\n        <html>\n        <head>\n            <style>\n                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');\n                body { font-family: 'Inter', sans-serif; color: #334155; margin: 0; padding: 30px; background: #fff; line-height: 1.4; }\n                .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 4px solid #24b3ae; padding-bottom: 15px; }\n                .hotel-title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }\n                .hotel-address { font-size: 11px; color: #64748b; max-width: 300px; }\n                .voucher-title { text-align: center; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 20px 0; color: #0f172a; }\n                .top-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; font-size: 12px; }\n                .info-row { display: flex; margin-bottom: 5px; }\n                .info-row .label { width: 120px; color: #64748b; }\n                .info-row .value { font-weight: 600; color: #1e293b; }\n                .dates-container { display: flex; justify-content: space-around; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 30px; }\n                .date-box { text-align: center; }\n                .date-box .label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 5px; }\n                .date-box .value { font-size: 14px; font-weight: 700; color: #24b3ae; }\n                .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; color: #475569; }\n                .details-grid { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 0 12px; margin-bottom: 30px; }\n                .detail-item { display: flex; font-size: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }\n                .detail-item .label { width: 180px; color: #64748b; }\n                .detail-item .value { flex: 1; font-weight: 600; color: #1e293b; }\n                .special-request-box { background: #fff9f0; border-left: 4px solid #f59e0b; padding: 10px 15px; font-size: 12px; margin-top: 10px; border-radius: 0 8px 8px 0; }\n                .paid-stamp { position: absolute; top: 150px; right: 50px; border: 4px solid #22c55e; color: #22c55e; padding: 10px 20px; font-size: 30px; font-weight: 900; border-radius: 12px; transform: rotate(-15deg); opacity: 0.2; }\n                .contact-details { margin-top: 8px; line-height: 1.4; }\n                .contact-details p { margin: 0; font-size: 10px; color: #475569; }\n                .contact-details strong { color: #24b3ae; }\n                .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; }\n            </style>\n        </head>\n        <body>\n            <div class=\"paid-stamp\">PAID</div>\n            <div class=\"header\">\n                <div class=\"logo-area\">\n                    <img src=\"https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png\" height=\"50\">\n                    <div class=\"contact-details\">\n                        <p>Contact Service:<strong> 081347423737</strong></p>\n                        <p>Instagram:<strong> @linkuapps</strong></p>\n                        <p>Facebook:<strong> Linku Nusantara</strong></p>\n                    </div>\n                </div>\n                <div class=\"hotel-info\" style=\"text-align: right;\">\n                    <div class=\"hotel-title\">".concat(data.hotelName || data.hotel_name || '-', "</div>\n                    <div class=\"hotel-address\">").concat(alamatHotel, "</div>\n                </div>\n            </div>\n\n            <div class=\"voucher-title\">Voucher Reservasi Hotel</div>\n\n            <div class=\"top-info-grid\">\n                <div>\n                    <div class=\"info-row\"><div class=\"label\">No. Transaksi</div><div class=\"value\">: ").concat(data.voucherNo || data.voucher_no || data.reservationNo || data.reservation_no || '-', "</div></div>\n                    <div class=\"info-row\"><div class=\"label\">Tgl Pembelian</div><div class=\"value\">: ").concat(paymentDate, "</div></div>\n                    <div class=\"info-row\"><div class=\"label\">Dicetak Oleh</div><div class=\"value\">: LinkU</div></div>\n                </div>\n                <div style=\"text-align: right;\">\n                    <div class=\"info-row\" style=\"justify-content: flex-end;\"><div class=\"label\">File No.</div><div class=\"value\">: ").concat(data.reservationNo || data.reservation_no || '-', "</div></div>\n                    <div class=\"info-row\" style=\"justify-content: flex-end;\"><div class=\"label\">O/S Ref.</div><div class=\"value\">: ").concat(data.osRefNo || data.os_ref_no || '-', "</div></div>\n                </div>\n            </div>\n\n            <div class=\"dates-container\">\n                <div class=\"date-box\">\n                    <div class=\"label\">Tanggal Check-In</div>\n                    <div class=\"value\">").concat(formatDateIndo(data.checkInDate || data.check_in_date), "</div>\n                </div>\n                <div style=\"color: #cbd5e1; font-size: 24px;\">|</div>\n                <div class=\"date-box\">\n                    <div class=\"label\">Tanggal Check-Out</div>\n                    <div class=\"value\">").concat(formatDateIndo(data.checkOutDate || data.check_out_date), "</div>\n                </div>\n            </div>\n\n            <div class=\"section-title\">Reservation Details</div>\n            <div class=\"details-grid\">\n                <div class=\"detail-item\">\n                    <div class=\"label\">Nama Tamu / Grup</div>\n                    <div class=\"value\">: ").concat(guestNames, "</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Tipe Kamar</div>\n                    <div class=\"value\">: ").concat(data.roomName || data.room_name || '-', "</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Meals</div>\n                    <div class=\"value\">: ").concat(data.breakfastType || data.breakfast || 'Sesuai Kebijakan Hotel', "</div>\n                </div>\n                <div class=\"detail-item\">\n                    <div class=\"label\">Jumlah Malam</div>\n                    <div class=\"value\">: ").concat(nights, " Malam</div>\n                </div>\n                <div class=\"detail-item\" style=\"border:none;\">\n                    <div class=\"label\">Special Request</div>\n                    <div class=\"value\">: \n                        <div class=\"special-request-box\">").concat(finalSpecialRequest, "</div>\n                    </div>\n                </div>\n            </div>\n\n            <div class=\"section-title\">Pembayaran</div>\n            <div style=\"font-size: 11px; color: #475569; padding: 0 12px;\">\n                Voucher Berlaku Untuk Layanan yang Tertera di Atas.<br>\n                <b>Status: LUNAS Rp. ").concat(totalFormatted, "</b>\n            </div>\n\n            <div class=\"footer\">\n                1. Voucher hanya berlaku saat tanggal menginap.<br>\n                2. Mohon hubungi kami bila melakukan perubahan reservasi.<br>\n                3. Permintaan khusus tergantung dari ketersediaan layanan hotel.<br><br>\n                <strong>LinkU Travel</strong>\n            </div>\n        </body>\n        </html>");
          _context.next = 25;
          return regeneratorRuntime.awrap(page.setContent(htmlContent));

        case 25:
          _context.next = 27;
          return regeneratorRuntime.awrap(page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              top: '0px',
              bottom: '0px',
              left: '0px',
              right: '0px'
            }
          }));

        case 27:
          pdfBuffer = _context.sent;
          return _context.abrupt("return", pdfBuffer);

        case 31:
          _context.prev = 31;
          _context.t0 = _context["catch"](1);
          console.error("Error generating PDF:", _context.t0);
          throw _context.t0;

        case 35:
          _context.prev = 35;

          if (!browser) {
            _context.next = 39;
            break;
          }

          _context.next = 39;
          return regeneratorRuntime.awrap(browser.close());

        case 39:
          return _context.finish(35);

        case 40:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[1, 31, 35, 40]]);
}
/**
 * FUNGSI UTAMA: Mengambil data dari DB, buat PDF, dan kirim Email
 * @param {number} bookingId - ID dari tabel hotel_bookings
 */


function sendBookingEmails(bookingId) {
  var _ref, _ref2, rows, b, _ref3, _ref4, paxes, pdfData, pdfBuffer, trackingParams, statusTrackingUrl, mailOptions;

  return regeneratorRuntime.async(function sendBookingEmails$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          _context2.next = 3;
          return regeneratorRuntime.awrap(new Promise(function (resolve) {
            return setTimeout(resolve, 2000);
          }));

        case 3:
          _context2.next = 5;
          return regeneratorRuntime.awrap(db.execute("SELECT * FROM hotel_bookings WHERE id = ?", [bookingId]));

        case 5:
          _ref = _context2.sent;
          _ref2 = _slicedToArray(_ref, 1);
          rows = _ref2[0];

          if (!(rows.length === 0)) {
            _context2.next = 11;
            break;
          }

          console.error("[Email Error] Booking ID ".concat(bookingId, " tidak ditemukan."));
          return _context2.abrupt("return");

        case 11:
          b = rows[0]; // 2. Ambil data tamu (paxes)

          _context2.next = 14;
          return regeneratorRuntime.awrap(db.execute("SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?", [bookingId]));

        case 14:
          _ref3 = _context2.sent;
          _ref4 = _slicedToArray(_ref3, 1);
          paxes = _ref4[0];
          // 3. Mapping data untuk Generator PDF
          pdfData = {
            reservationNo: b.reservation_no,
            osRefNo: b.os_ref_no && b.os_ref_no !== "-" ? b.os_ref_no : "-",
            hotelName: b.hotel_name,
            hotelAddress: b.hotel_address,
            roomName: b.room_name,
            totalPrice: b.total_price,
            handlingFee: b.handling_fee || 0,
            checkInDate: b.check_in_date,
            checkOutDate: b.check_out_date,
            breakfastType: b.breakfast_type,
            specialRequests: b.special_requests || "-"
          };
          _context2.next = 20;
          return regeneratorRuntime.awrap(generateBookingPDF(pdfData, paxes));

        case 20:
          pdfBuffer = _context2.sent;
          // 4. URL TRACKING (Sangat Penting untuk membawa 'os')
          // Parameter 'os' digunakan oleh tracking.html untuk hit API /booking-detail
          trackingParams = new URLSearchParams({
            no: b.reservation_no,
            os: b.os_ref_no || '',
            agent: b.agent_os_ref || ''
          }).toString();
          statusTrackingUrl = "https://darma.siappgo.id/tracking?".concat(trackingParams); // 5. Konfigurasi Email

          mailOptions = {
            from: '"LinkU Travel" <linkutransport@gmail.com>',
            to: b.contact_email,
            // Subjek dinamis: mendahulukan OS Ref agar mudah dicari di inbox
            subject: "E-Voucher Hotel [".concat(b.os_ref_no || b.reservation_no, "] - ").concat(b.hotel_name),
            html: "\n                <div style=\"font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 30px; border-radius: 16px; color: #1e293b; line-height: 1.5;\">\n                    <div style=\"text-align: center; margin-bottom: 20px;\">\n                        <img src=\"https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png\" height=\"50\" alt=\"LinkU Logo\">\n                    </div>\n                    \n                    <h2 style=\"color: #24b3ae; text-align: center; margin-top: 0;\">Konfirmasi Reservasi \uD83C\uDF89</h2>\n                    <p>Halo <strong>".concat(b.contact_name || 'Pelanggan Setia', "</strong>,</p>\n                    <p>Terima kasih telah memilih LinkU. Pesanan hotel Anda telah berhasil diproses. Berikut adalah ringkasan reservasi Anda:</p>\n                    \n                    <div style=\"background-color: #f1f5f9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #24b3ae;\">\n                        <table style=\"width: 100%; border-collapse: collapse; font-size: 14px;\">\n                            <tr>\n                                <td style=\"padding: 5px 0; color: #64748b;\">No. Reservasi</td>\n                                <td style=\"padding: 5px 0;\">: <strong>").concat(b.reservation_no, "</strong></td>\n                            </tr>\n                            <tr>\n                                <td style=\"padding: 5px 0; color: #64748b;\">O/S Ref No. (Darma)</td>\n                                <td style=\"padding: 5px 0;\">: <strong style=\"color: #24b3ae;\">").concat(b.os_ref_no || 'Sedang Diproses', "</strong></td>\n                            </tr>\n                            <tr>\n                                <td style=\"padding: 5px 0; color: #64748b;\">Hotel</td>\n                                <td style=\"padding: 5px 0;\">: <strong>").concat(b.hotel_name, "</strong></td>\n                            </tr>\n                            <tr>\n                                <td style=\"padding: 5px 0; color: #64748b;\">Check-In</td>\n                                <td style=\"padding: 5px 0;\">: <strong>").concat(new Date(b.check_in_date).toLocaleDateString('id-ID', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }), "</strong></td>\n                            </tr>\n                        </table>\n                    </div>\n\n                    <p>E-Voucher PDF telah kami lampirkan pada email ini. Anda juga dapat memantau status terbaru melalui tombol di bawah:</p>\n                    \n                    <div style=\"text-align: center; margin: 35px 0;\">\n                        <a href=\"").concat(statusTrackingUrl, "\" \n                           style=\"background-color: #24b3ae; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(36, 179, 174, 0.2);\">\n                            CEK STATUS & VOUCHER REAL-TIME\n                        </a>\n                    </div>\n\n                    <div style=\"background: #fff9eb; padding: 15px; border-radius: 8px; border: 1px solid #ffeeba; font-size: 13px; color: #856404; margin-bottom: 20px;\">\n                        <strong>Informasi Penting:</strong> Saat check-in, Anda cukup menunjukkan E-Voucher yang ada di lampiran email ini atau melalui link di atas kepada pihak resepsionis hotel.\n                    </div>\n\n                    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\">\n                    <p style=\"text-align: center; color: #94a3b8; font-size: 12px; margin: 0;\">\n                        <strong>LinkU Nusantara</strong><br>\n                        Gedung LinkU, Tangerang, Indonesia<br>\n                        Layanan Perjalanan Terbaikmu \uD83D\uDE80\n                    </p>\n                </div>\n            "),
            attachments: [{
              filename: "E-Voucher-".concat(b.os_ref_no || b.reservation_no, ".pdf"),
              content: pdfBuffer
            }]
          }; // 6. Kirim Email

          _context2.next = 26;
          return regeneratorRuntime.awrap(transporter.sendMail(mailOptions));

        case 26:
          console.log("[Email Sent] Success for ID ".concat(bookingId, ": ").concat(b.reservation_no));
          _context2.next = 32;
          break;

        case 29:
          _context2.prev = 29;
          _context2.t0 = _context2["catch"](0);
          console.error("[Email Error] Gagal mengirim email untuk ID ".concat(bookingId, ":"), _context2.t0.message);

        case 32:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[0, 29]]);
}

module.exports = {
  sendBookingEmails: sendBookingEmails,
  generateBookingPDF: generateBookingPDF // Tetap diekspor jika ingin digunakan manual

};