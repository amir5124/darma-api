const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const db = require('../config/db');

// 1. Konfigurasi Nodemailer
const transporter = nodemailer.createTransport({
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
async function generateBookingPDF(data, paxes) {
    console.log("Cek Data Masuk ke PDF:", JSON.stringify(data, null, 2));
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // 1. Perbaikan Parsing Angka
        const hargaDasar = parseFloat(data.totalPrice || data.total_price || 0);
        const biayaHandling = parseFloat(data.handlingFee || data.handling_fee || 0);
         const alamatHotel = data.hotel_address;

        // Total Akhir
        const totalHargaFisik = Math.ceil(hargaDasar + biayaHandling);
        const totalFormatted = totalHargaFisik.toLocaleString('id-ID');

        // Format Tanggal Transaksi
        const paymentDate = new Date().toLocaleDateString('id-ID', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        const formatDateIndo = (dateStr) => {
            if (!dateStr) return "-";
            return new Date(dateStr).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'long', year: 'numeric'
            });
        };

        // 2. Perbaikan Hitung Durasi Malam (Gunakan Math.max agar tidak nol/minus)
        const checkIn = new Date(data.checkInDate || data.check_in_date);
        const checkOut = new Date(data.checkOutDate || data.check_out_date);
        const diffTime = Math.abs(checkOut - checkIn);
        const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

        // 3. Perbaikan Daftar Tamu (Mapping paxes agar mendukung camelCase dan snake_case dari DB)
        const guestNames = paxes && Array.isArray(paxes) && paxes.length > 0
            ? paxes.map((p) => {
                const title = p.title || p.pax_title || '';
                const fName = p.firstName || p.first_name || '';
                const lName = p.lastName || p.last_name || '';
                return `${title} ${fName} ${lName}`.trim();
            }).join(', ')
            : "Guest";

        // 4. Perbaikan Special Request (Pastikan mengambil dari properti yang benar)
        const requestValue = data.specialRequests || data.special_requests || "";
        const finalSpecialRequest = (requestValue && requestValue !== "" && requestValue !== "-" && requestValue !== "null")
            ? requestValue
            : "Tidak ada permintaan khusus";

        const htmlContent = `
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                body { font-family: 'Inter', sans-serif; color: #334155; margin: 0; padding: 30px; background: #fff; line-height: 1.4; }
                .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 4px solid #24b3ae; padding-bottom: 15px; }
                .hotel-title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .hotel-address { font-size: 11px; color: #64748b; max-width: 300px; }
                .voucher-title { text-align: center; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 20px 0; color: #0f172a; }
                .top-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; font-size: 12px; }
                .info-row { display: flex; margin-bottom: 5px; }
                .info-row .label { width: 120px; color: #64748b; }
                .info-row .value { font-weight: 600; color: #1e293b; }
                .dates-container { display: flex; justify-content: space-around; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 30px; }
                .date-box { text-align: center; }
                .date-box .label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 5px; }
                .date-box .value { font-size: 14px; font-weight: 700; color: #24b3ae; }
                .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; color: #475569; }
                .details-grid { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 0 12px; margin-bottom: 30px; }
                .detail-item { display: flex; font-size: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
                .detail-item .label { width: 180px; color: #64748b; }
                .detail-item .value { flex: 1; font-weight: 600; color: #1e293b; }
                .special-request-box { background: #fff9f0; border-left: 4px solid #f59e0b; padding: 10px 15px; font-size: 12px; margin-top: 10px; border-radius: 0 8px 8px 0; }
                .paid-stamp { position: absolute; top: 150px; right: 50px; border: 4px solid #22c55e; color: #22c55e; padding: 10px 20px; font-size: 30px; font-weight: 900; border-radius: 12px; transform: rotate(-15deg); opacity: 0.2; }
                .contact-details { margin-top: 8px; line-height: 1.4; }
                .contact-details p { margin: 0; font-size: 10px; color: #475569; }
                .contact-details strong { color: #24b3ae; }
                .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; }
            </style>
        </head>
        <body>
            <div class="paid-stamp">PAID</div>
            <div class="header">
                <div class="logo-area">
                    <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png" height="50">
                    <div class="contact-details">
                        <p>Contact Service:<strong> 081347423737</strong></p>
                        <p>Instagram:<strong> @linkuapps</strong></p>
                        <p>Facebook:<strong> Linku Nusantara</strong></p>
                    </div>
                </div>
                <div class="hotel-info" style="text-align: right;">
                    <div class="hotel-title">${data.hotelName || data.hotel_name || '-'}</div>
                    <div class="hotel-address">${alamatHotel}</div>
                </div>
            </div>

            <div class="voucher-title">Voucher Reservasi Hotel</div>

            <div class="top-info-grid">
                <div>
                    <div class="info-row"><div class="label">No. Transaksi</div><div class="value">: ${data.voucherNo || data.voucher_no || data.reservationNo || data.reservation_no || '-'}</div></div>
                    <div class="info-row"><div class="label">Tgl Pembelian</div><div class="value">: ${paymentDate}</div></div>
                    <div class="info-row"><div class="label">Dicetak Oleh</div><div class="value">: LinkU</div></div>
                </div>
                <div style="text-align: right;">
                    <div class="info-row" style="justify-content: flex-end;"><div class="label">File No.</div><div class="value">: ${data.reservationNo || data.reservation_no || '-'}</div></div>
                    <div class="info-row" style="justify-content: flex-end;"><div class="label">O/S Ref.</div><div class="value">: ${data.osRefNo || data.os_ref_no || '-'}</div></div>
                </div>
            </div>

            <div class="dates-container">
                <div class="date-box">
                    <div class="label">Tanggal Check-In</div>
                    <div class="value">${formatDateIndo(data.checkInDate || data.check_in_date)}</div>
                </div>
                <div style="color: #cbd5e1; font-size: 24px;">|</div>
                <div class="date-box">
                    <div class="label">Tanggal Check-Out</div>
                    <div class="value">${formatDateIndo(data.checkOutDate || data.check_out_date)}</div>
                </div>
            </div>

            <div class="section-title">Reservation Details</div>
            <div class="details-grid">
                <div class="detail-item">
                    <div class="label">Nama Tamu / Grup</div>
                    <div class="value">: ${guestNames}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Tipe Kamar</div>
                    <div class="value">: ${data.roomName || data.room_name || '-'}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Meals</div>
                    <div class="value">: ${data.breakfastType || data.breakfast || 'Sesuai Kebijakan Hotel'}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Jumlah Malam</div>
                    <div class="value">: ${nights} Malam</div>
                </div>
                <div class="detail-item" style="border:none;">
                    <div class="label">Special Request</div>
                    <div class="value">: 
                        <div class="special-request-box">${finalSpecialRequest}</div>
                    </div>
                </div>
            </div>

            <div class="section-title">Pembayaran</div>
            <div style="font-size: 11px; color: #475569; padding: 0 12px;">
                Voucher Berlaku Untuk Layanan yang Tertera di Atas.<br>
                <b>Status: LUNAS Rp. ${totalFormatted}</b>
            </div>

            <div class="footer">
                1. Voucher hanya berlaku saat tanggal menginap.<br>
                2. Mohon hubungi kami bila melakukan perubahan reservasi.<br>
                3. Permintaan khusus tergantung dari ketersediaan layanan hotel.<br><br>
                <strong>LinkU Travel</strong>
            </div>
        </body>
        </html>`;

        await page.setContent(htmlContent);
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' }
        });

        return pdfBuffer;
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}
/**
 * FUNGSI UTAMA: Mengambil data dari DB, buat PDF, dan kirim Email
 * @param {number} bookingId - ID dari tabel hotel_bookings
 */
async function sendBookingEmails(bookingId) {
    try {
        const [rows] = await db.execute("SELECT * FROM hotel_bookings WHERE id = ?", [bookingId]);
        if (rows.length === 0) return;
        const bookingData = rows[0];

        const [paxes] = await db.execute(
            "SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?",
            [bookingId]
        );

        // Map data untuk PDF
        const pdfData = {
            reservationNo: bookingData.reservation_no,
            osRefNo: bookingData.os_ref_no,
            hotelName: bookingData.hotel_name,
            hotelAddress: bookingData.hotel_address,
            roomName: bookingData.room_name,
            totalPrice: bookingData.total_price,
            handlingFee: bookingData.handling_fee,
            checkInDate: bookingData.check_in_date,
            checkOutDate: bookingData.check_out_date,
            breakfastType: bookingData.breakfast_type,
            specialRequests: bookingData.special_requests || "-"
        };

        const pdfBuffer = await generateBookingPDF(pdfData, paxes);

        // URL ARAHKAN KE FRONTEND (Bukan ke API)
        const statusTrackingUrl = `https://siappgo.id/tracking?no=${bookingData.reservation_no}`;

        const mailOptions = {
            from: '"LinkU Travel" <linkutransport@gmail.com>',
            to: bookingData.contact_email,
            subject: `E-Tiket Hotel - ${bookingData.reservation_no}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                    <h2>Booking Berhasil!</h2>
                    <p>Halo Bapak/Ibu, pesanan Anda sudah dikonfirmasi.</p><p> Cek secara berkala tutan dibawah ini untuk update status booking</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${statusTrackingUrl}" 
                           style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                           Cek Status Booking
                        </a>
                    </div>
                    <p>Voucher PDF telah terlampir di email ini.</p>
                </div>
            `,
            attachments: [{ filename: `Transaksi-${bookingData.reservation_no}.pdf`, content: pdfBuffer }]
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error kirim email:", error);
    }
}

module.exports = {
    sendBookingEmails,
    generateBookingPDF // Tetap diekspor jika ingin digunakan manual
};