// routes/hotelRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const db = require('../config/db');
// --- KONFIGURASI EMAIL ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'linkutransport@gmail.com',
        pass: 'qbckptzxgdumxtdm'
    }
});



async function generateBookingPDF(data, paxes) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        const hargaDasar = parseFloat(data.totalPrice || 0);
    const biayaHandling = parseFloat(data.handlingFee || 0);
    
    // Total Akhir
    const totalHargaFisik = Math.ceil(hargaDasar + biayaHandling);
    const totalFormatted = totalHargaFisik.toLocaleString('id-ID');

        // 2. Format Tanggal Transaksi (Tanggal Pembelian)
        const paymentDate = new Date().toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        // 3. Helper Format Tanggal (Check-in/Out)
        const formatDateIndo = (dateStr) => {
            if (!dateStr) return "-";
            return new Date(dateStr).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        };

        // 4. Hitung Durasi Malam
        const checkIn = new Date(data.checkInDate);
        const checkOut = new Date(data.checkOutDate);
        const diffTime = Math.abs(checkOut - checkIn);
        const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

        // 5. Daftar Tamu
        const guestNames = paxes && paxes.length > 0
            ? paxes.map((p) => `${p.title || ''} ${p.firstName || ''} ${p.lastName || ''}`).join(', ')
            : "Guest";

        // 6. Normalisasi Special Request (Menangani data dari API maupun DB)
        const requestValue = data.specialRequests || data.special_requests || "";
        const finalSpecialRequest = (requestValue && requestValue !== "" && requestValue !== "-")
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

                .dates-container { 
                    display: flex; justify-content: space-around; background: #f8fafc; 
                    border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 30px;
                }
                .date-box { text-align: center; }
                .date-box .label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 5px; }
                .date-box .value { font-size: 14px; font-weight: 700; color: #24b3ae; }

                .section-title { 
                    font-size: 13px; font-weight: 800; text-transform: uppercase; 
                    background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; color: #475569;
                }

                .details-grid { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 0 12px; margin-bottom: 30px; }
                .detail-item { display: flex; font-size: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
                .detail-item .label { width: 180px; color: #64748b; }
                .detail-item .value { flex: 1; font-weight: 600; color: #1e293b; }
                
                .special-request-box { 
                    background: #fff9f0; border-left: 4px solid #f59e0b; padding: 10px 15px; 
                    font-size: 12px; margin-top: 10px; border-radius: 0 8px 8px 0;
                }

                .paid-stamp { 
                    position: absolute; top: 150px; right: 50px; border: 4px solid #22c55e; 
                    color: #22c55e; padding: 10px 20px; font-size: 30px; font-weight: 900; 
                    border-radius: 12px; transform: rotate(-15deg); opacity: 0.2;
                }

                .contact-details {
    margin-top: 8px;
    line-height: 1.4;
}

.contact-details p {
    margin: 0;
    font-size: 10px; 
    color: #475569;
    font-family: sans-serif;
}

.contact-details strong {
    color: #24b3ae; 
}

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
        <div class="hotel-title">${data.hotelName}</div>
        <div class="hotel-address">${data.hotelAddress || 'Alamat hotel tersedia di sistem'}</div>
    </div>
</div>

            <div class="voucher-title">Voucher Reservasi Hotel</div>

            <div class="top-info-grid">
                <div>
                    <div class="info-row"><div class="label">Voucher No.</div><div class="value">: ${data.voucherNo || data.reservationNo}</div></div>
                    <div class="info-row"><div class="label">Tgl Pembelian</div><div class="value">: ${paymentDate}</div></div>
                      <div class="info-row"><div class="label">Dicetak Oleh</div><div class="value">: LinkU</div></div>
                </div>
                <div style="text-align: right;">
                    <div class="info-row" style="justify-content: flex-end;"><div class="label">File No.</div><div class="value">: ${data.reservationNo}</div></div>
                    <div class="info-row" style="justify-content: flex-end;"><div class="label">O/S Ref.</div><div class="value">: ${data.osRefNo || '-'}</div></div>
                </div>
            </div>

            <div class="dates-container">
                <div class="date-box">
                    <div class="label">Tanggal Check-In</div>
                    <div class="value">${formatDateIndo(data.checkInDate)}</div>
                </div>
                <div style="color: #cbd5e1; font-size: 24px;">|</div>
                <div class="date-box">
                    <div class="label">Tanggal Check-Out</div>
                    <div class="value">${formatDateIndo(data.checkOutDate)}</div>
                </div>
            </div>

            <div class="section-title">Reservation Details</div>
            <div class="details-grid">
                <div class="detail-item">
                    <div class="label">Nama Tamu / Grup</div>
                    <div class="value">: ${guestNames}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Total Kamar</div>
                    <div class="value">: 1 Kamar</div>
                </div>
                <div class="detail-item">
                    <div class="label">Tipe Kamar</div>
                    <div class="value">: ${data.roomName}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Meals</div>
                    <div class="value">: ${data.breakfastType || data.breakfast || 'Sesuai Kebijakan Hotel'}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Total Pax</div>
                    <div class="value">: ${paxes.length} Tamu</div>
                </div>
                <div class="detail-item">
                    <div class="label">Jumlah Malam</div>
                    <div class="value">: ${nights} Malam</div>
                </div>
                <div class="detail-item" style="border:none;">
                    <div class="label">Special Request</div>
                    <div class="value">: 
                        <div class="special-request-box">
                            ${finalSpecialRequest}
                        </div>
                    </div>
                </div>
            </div>

            <div class="section-title">Pembayaran</div>
            <div style="font-size: 11px; color: #475569; padding: 0 12px;">
                Voucher Berlaku Untuk Layanan yang Tertera di Atas. Tambahan Layanan Harus Berdasarkan Permintaan.<br>
                <b>Status: LUNAS (Paid via Koin Aplikasi) Rp. ${totalFormatted}</b>
            </div>

            <div class="footer">
                1. Voucher hanya berlaku saat tanggal menginap.<br>
                2. Mohon hubungi kami bila melakukan perubahan reservasi.<br>
                3. Permintaan khusus tergantung dari ketersediaan layanan hotel pada saat check-in.<br><br>
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

router.post('/city', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Pastikan field mandatory (userID & accessToken) masuk ke dalam payload utama
        const payload = {
            countryID: b.countryID || "ID",
            cityNameFilter: b.cityNameFilter || "",
            userID: USER_CONFIG.userID, // Pastikan ini tidak null
            accessToken: token          // Pastikan ini tidak null
        };

        logger.debug("SENDING_TO_VENDOR", payload);

        const response = await axios.post(`${BASE_URL}/Hotel/City`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "FAILED", respMessage: error.message });
    }
});
// 1. HOTEL SEARCH
router.post('/search', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Payload disesuaikan persis dengan contoh request Anda
        const payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,   // Contoh: "2023-01-01T14:00:00Z"
            checkOutDate: b.checkOutDate, // Contoh: "2023-01-02T12:00:00Z"
            roomRequest: b.roomRequest.map(room => ({
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Sesuai permintaan: [0]
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_SEARCH5", payload);

        // Endpoint diganti menjadi Search5 sesuai instruksi
        const response = await axios.post(`${BASE_URL}/Hotel/Search5`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_HOTEL_SEARCH5", response.data);
        res.json(response.data);
    } catch (error) {
        logger.error("Hotel Search5 Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// POST /api/hotels/search-by-name
router.post('/search-by-name', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const { hotelName } = req.body;

        if (!hotelName || hotelName.trim().length < 2) {
            return res.status(400).json({
                status: "ERROR",
                respMessage: "hotelName minimal 2 karakter."
            });
        }

        const payload = {
            hotelNameFilter: hotelName.trim(),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_SEARCH_BY_NAME", JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Hotel/HotelList5`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        const resData = response.data;
        logger.debug("RES_HOTEL_SEARCH_BY_NAME", JSON.stringify(resData));

        // Kembalikan raw response dulu agar kita bisa lihat strukturnya
        return res.json(resData);

    } catch (error) {
        logger.error("Search By Name Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// 2. HOTEL AVAILABLE ROOMS
router.post('/available-rooms', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            hotelID: b.hotelID,
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            // Pastikan roomRequest dipetakan dengan benar sesuai standar strict
            roomRequest: b.roomRequest.map(room => ({
                roomType: parseInt(room.roomType) || 0,
                isRequestChildBed: Boolean(room.isRequestChildBed),
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || [0] // Mengikuti standar [0] jika childNum 0
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_ROOMS_5", payload);

        // Perhatikan URL: Gunakan /Hotel/AvailableRoom5 jika mengikuti standar Search5
        const response = await axios.post(`${BASE_URL}/Hotel/AvailableRooms5`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_HOTEL_ROOMS_5", response.data);

        res.json(response.data);
    } catch (error) {
        logger.error("Hotel Available Rooms Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// 3. HOTEL PRICE AND POLICY INFO
router.post('/price-info', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
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

        const response = await axios.post(`${BASE_URL}/Hotel/PriceAndPolicyInfo`, payload, { httpsAgent: agent });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// Endpoint Gambar Hotel (Utama)
router.get('/image', async (req, res) => {
    try {
        const id = req.query.id; // required
        const response = await axios.get(`${BASE_URL}/Hotel/Image?id=${id}`, {
            httpsAgent: agent,
            responseType: 'arraybuffer' // Karena API mengembalikan stream gambar
        });
        res.set('Content-Type', 'image/jpeg');
        res.send(response.data);
    } catch (error) {
        res.status(404).send('Image not found');
    }
});

// Endpoint Gambar Kamar
router.get('/room-image', async (req, res) => {
    try {
        const RoomID = req.query.RoomID; // required
        const response = await axios.get(`${BASE_URL}/Hotel/RoomImage?RoomID=${RoomID}`, {
            httpsAgent: agent,
            responseType: 'arraybuffer'
        });
        res.set('Content-Type', 'image/jpeg');
        res.send(response.data);
    } catch (error) {
        res.status(404).send('Room image not found');
    }
});



// 5. HOTEL BOOKING DETAIL
router.post('/booking-detail', async (req, res) => {
    let connection;
    try {
        const token = await getConsistentToken();
        const b = req.body;

        connection = await db.getConnection();

        const [localRows] = await connection.execute(
            "SELECT * FROM hotel_bookings WHERE reservation_no = ?",
            [b.reservationNo]
        );

        if (localRows.length === 0) {
            return res.status(404).json({ status: "ERROR", respMessage: "Booking tidak ditemukan." });
        }

        const localData = localRows[0];

        const payload = {
            reservationNo: (localData.reservation_no.startsWith("PRC-")) ? "" : localData.reservation_no,
            osRefNo: String(localData.os_ref_no),
            agentOsRef: localData.agent_os_ref || "",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Hotel/BookingDetail`, payload, { httpsAgent: agent });
        const resData = response.data;

        if (resData.status === "SUCCESS" && resData.bookingDetail) {
            const detail = resData.bookingDetail;
            const cleanStatus = (detail.bookingStatus || "").trim();

            if (cleanStatus === "Accept") {
                const [paxes] = await connection.execute(
                    "SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?",
                    [localData.id]
                );

                // PERBAIKAN DI SINI: Lengkapi properti untuk PDF
               // Di dalam router.post('/booking-detail', ...)
// ... setelah blok const [paxes] ...

const pdfData = {
    reservationNo: detail.reservationNo,
    osRefNo: detail.osRefNo || localData.os_ref_no,
    hotelName: detail.hotelName || localData.hotel_name,
    hotelAddress: detail.hotelAddress || localData.hotel_address,
    roomName: detail.roomName || localData.room_name,
    // Mengambil dari database agar akurat
    totalPrice: localData.total_price, 
    handlingFee: localData.handling_fee, // Tambahkan ini
    contactEmail: localData.contact_email,
    contactPhone: localData.contact_phone,
    checkInDate: detail.checkInDate || localData.check_in_date,
    checkOutDate: detail.checkOutDate || localData.check_out_date,
    specialRequests: localData.special_requests || "-",
    breakfastType: detail.breakfast || localData.breakfast_type
};

                const isTransition = (localData.booking_status !== 'Accept');
                const isForceResend = (b.forceResend === true);

                if (isTransition || isForceResend) {
                    try {
                        const pdfBuffer = await generateBookingPDF(pdfData, paxes);
                        await transporter.sendMail({
                            from: '"LinkU Travel" <linkutransport@gmail.com>',
                            to: localData.contact_email,
                            subject: `E-Tiket Hotel - ${detail.reservationNo}`,
                            html: `<p>Halo Bapak/Ibu,

Booking hotel Anda telah berhasil dikonfirmasi.

Silakan menggunakan voucher yang terlampir pada email ini untuk proses check-in di hotel.

Detail reservasi dapat dilihat pada voucher yang terlampir.

Terima kasih telah menggunakan layanan LinkU.

Jika membutuhkan bantuan, silakan hubungi layanan pelanggan kami.

Salam hangat,
LinkU
Layanan terbaikmu</p>`,
                            attachments: [{ filename: `E-Tiket-${detail.reservationNo}.pdf`, content: pdfBuffer }]
                        });
                        logger.info(`Email Terkirim (${isForceResend ? 'Resend' : 'Update'}): ${detail.reservationNo}`);
                    } catch (mailErr) {
                        logger.error("Gagal kirim email di detail: " + mailErr.message);
                    }
                }

                await connection.execute(
                    `UPDATE hotel_bookings SET 
                        reservation_no = ?, 
                        voucher_no = ?, 
                        booking_status = 'Accept',
                        updated_at = NOW() 
                     WHERE id = ?`,
                    [detail.reservationNo, detail.voucherNo, localData.id]
                );

                resData.updatedToAccept = true;
                resData.newReservationNo = detail.reservationNo;
            }
        }

        res.json(resData);
    } catch (error) {
        logger.error("Booking Detail Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/booking', async (req, res) => {
    let connection;
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const username = b.username || "guest";

        const payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate.endsWith('Z') ? b.checkInDate : b.checkInDate + 'Z',
            checkOutDate: b.checkOutDate.endsWith('Z') ? b.checkOutDate : b.checkOutDate + 'Z',
            roomRequest: b.roomRequest.map(room => ({
                paxes: (room.paxes && room.paxes.length > 0) ? room.paxes.map(pax => ({
                    title: pax.title || 'Mr.',
                    firstName: (pax.firstName || 'Guest').trim(),
                    lastName: (pax.lastName || 'User').trim()
                })) : [{ title: 'Mr.', firstName: 'Guest', lastName: 'User' }],
                isSmokingRoom: Boolean(room.isSmokingRoom),
                phone: String(room.phone || '08123456789'),
                email: String(room.email || 'guest@mail.com'),
                specialRequestArray: room.specialRequestArray || [],
                requestDescription: room.requestDescription || "",
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                childAges: (room.childAges && room.childAges.length > 0) ? room.childAges : [0]
            })),
            internalCode: b.internalCode || "SUP",
            hotelID: b.hotelID,
            breakfast: b.breakfast || "Room Only",
            roomID: b.roomID,
            bedType: {
                ID: (b.bedType && b.bedType.ID) ? String(b.bedType.ID) : "",
                bed: (b.bedType && b.bedType.bed) ? String(b.bedType.bed) : ""
            },
            agentOsRef: b.agentOsRef || `LC-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        const resData = response.data;
        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        if (resData.status === "SUCCESS" || isAccepted || isProcessed) {
            let currentStatus = 'Accept';
            if (isProcessed) {
                currentStatus = 'Processed';
                resData.reservationNo = resData.reservationNo || "PRC-" + Date.now();
                resData.voucherNo = resData.voucherNo || resData.reservationNo;
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            // 1. Ambil nilai totalPrice dari price-info (yang dikirim frontend)
            // Kita bulatkan agar tidak ada angka desimal .6667 di database
            // 1. Ambil nilai dari body request (b = req.body)
            const finalModalDariPriceInfo = Math.round(parseFloat(b.totalPrice || resData.totalPrice || 0));
            const komisiTercatat = Math.round(parseFloat(b.commission || 0));
            // Ambil handlingFee dari frontend, jika kosong otomatis 0
            const handlingFeeTercatat = Math.round(parseFloat(b.handlingFee || 0));

            const [bookingResult] = await connection.execute(
                `INSERT INTO hotel_bookings 
    (
        reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, 
        hotel_name, hotel_address, internal_code, check_in_date, check_out_date, 
        city_id, room_id, room_name, breakfast_type, contact_email, 
        contact_phone, total_price, commission, handling_fee, booking_status, 
        username, special_requests
    ) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resData.reservationNo,
                    resData.voucherNo,
                    resData.osRefNo,
                    payload.agentOsRef,
                    String(resData.hotelID || b.hotelID),
                    resData.hotelName || b.hotelName || "Hotel",
                    resData.hotelAddress || "",
                    b.internalCode,
                    resData.checkInDate || b.checkInDate.replace('Z', ''),
                    resData.checkOutDate || b.checkOutDate.replace('Z', ''),
                    String(b.cityID),
                    String(b.roomID),
                    resData.roomName || b.roomName || "",
                    b.breakfast || "",
                    b.roomRequest[0].email,
                    b.roomRequest[0].phone,
                    finalModalDariPriceInfo, // Contoh: 163288
                    komisiTercatat,          // Contoh: 15000
                    handlingFeeTercatat,     // Contoh: 5000 (Sesuai input user)
                    currentStatus,
                    username,
                    payload.roomRequest[0].requestDescription
                ]
            );

            const newBookingId = bookingResult.insertId;
            for (const room of b.roomRequest) {
                for (const pax of room.paxes) {
                    await connection.execute(
                        `INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) 
                        VALUES (?, 'ADULT', ?, ?, ?)`,
                        [newBookingId, pax.title, pax.firstName, pax.lastName]
                    );
                }
            }

            await connection.commit();

            if (currentStatus === 'Accept') {
                (async () => {
                    try {
                        const [paxesForPdf] = await db.execute(
                            "SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?",
                            [newBookingId]
                        );

                        // PERBAIKAN DI SINI: Lengkapi properti untuk PDF
                        const pdfData = {
                            reservationNo: resData.reservationNo,
                            osRefNo: resData.osRefNo, // Tambahkan ini
                            hotelName: resData.hotelName || b.hotelName || "Hotel",
                            hotelAddress: resData.hotelAddress || "", // Tambahkan ini
                            roomName: resData.roomName || b.roomName || "Room",
                            totalPrice: resData.totalPrice || 0,
                            contactEmail: b.roomRequest[0].email,
                            contactPhone: b.roomRequest[0].phone,
                            checkInDate: resData.checkInDate || b.checkInDate,
                            checkOutDate: resData.checkOutDate || b.checkOutDate,
                            specialRequests: payload.roomRequest[0].requestDescription || "-"
                        };

                        const pdfBuffer = await generateBookingPDF(pdfData, paxesForPdf);

                        await transporter.sendMail({
                            from: '"LinkU Travel" <linkutransport@gmail.com>',
                            to: b.roomRequest[0].email,
                            subject: `E-Tiket Hotel - ${resData.reservationNo}`,
                            html: `<p>Halo Bapak/Ibu,

Booking hotel Anda telah berhasil dikonfirmasi.

Silakan menggunakan voucher yang terlampir pada email ini untuk proses check-in di hotel.

Detail reservasi dapat dilihat pada voucher yang terlampir.

Terima kasih telah menggunakan layanan LinkU.

Jika membutuhkan bantuan, silakan hubungi layanan pelanggan kami.

Salam hangat,
LinkU
Layanan terbaikmu</p>`,
                            attachments: [{ filename: `E-Tiket-${resData.reservationNo}.pdf`, content: pdfBuffer }]
                        });
                    } catch (err) {
                        console.error("Background Mail Error: " + err.message);
                    }
                })();
            }

            return res.json({
                status: "SUCCESS",
                booking_id: newBookingId,
                internalStatus: currentStatus,
                ...resData
            });

        } else {
            return res.status(400).json({ status: "ERROR", respMessage: resData.respMessage || "Kamar tidak tersedia." });
        }
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/history', async (req, res) => {
    let connection;
    try {
        const { username, page = 1, limit = 10 } = req.query;

        // 1. Validasi input awal
        if (!username) {
            return res.status(400).json({
                status: "ERROR",
                respMessage: "Parameter 'username' wajib diisi."
            });
        }

        // Pastikan page dan limit adalah angka yang valid (integer)
        const limitNum = parseInt(limit) || 10;
        const pageNum = parseInt(page) || 1;
        const offsetNum = (pageNum - 1) * limitNum;

        connection = await db.getConnection();

        // 2. Ambil total data untuk pagination (Gunakan execute untuk parameter username)
        const [[{ total }]] = await connection.execute(
            `SELECT COUNT(*) as total FROM hotel_bookings WHERE username = ?`,
            [username]
        );

        // 3. Ambil data booking
        // CATATAN: Menggunakan .query() dengan template literal untuk LIMIT/OFFSET 
        // karena banyak versi mysql2/mysql driver yang error jika LIMIT dikirim sebagai argumen ?
        const [bookings] = await connection.query(
            `SELECT 
                hb.id,
                hb.reservation_no,
                hb.voucher_no,
                hb.hotel_name,
                hb.hotel_address,
                hb.room_name,
                hb.breakfast_type,
                hb.check_in_date,
                hb.check_out_date,
                hb.total_price,
                hb.currency,
                hb.booking_status,
                hb.contact_email,
                hb.contact_phone,
                hb.room_count,
                hb.booking_date,
                hb.commission,
                hb.handling_fee,
                hb.username
            FROM hotel_bookings hb
            WHERE hb.username = ?
            ORDER BY hb.booking_date DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}`,
            [username]
        );

        // 4. Ambil paxes untuk setiap booking secara paralel (lebih efisien)
        const bookingsWithPaxes = await Promise.all(bookings.map(async (booking) => {
            const [paxes] = await connection.execute(
                `SELECT title, first_name, last_name, pax_type
                 FROM hotel_booking_paxes
                 WHERE booking_id = ?`,
                [booking.id]
            );
            return { ...booking, paxes };
        }));

        // 5. Response Sukses
        return res.json({
            status: "SUCCESS",
            username: username,
            total: total,
            page: pageNum,
            limit: limitNum,
            total_pages: Math.ceil(total / limitNum),
            data: bookingsWithPaxes
        });

    } catch (error) {
        logger.error("History Booking Error: " + error.message);
        return res.status(500).json({
            status: "ERROR",
            respMessage: "Internal Server Error: " + error.message
        });
    } finally {
        if (connection) connection.release();
    }
});


// ============================================================
// ENDPOINT: GET /api/hotels/history/:reservation_no
// Ambil detail satu booking berdasarkan reservation_no
// ============================================================

router.get('/history/:reservation_no', async (req, res) => {
    let connection;
    try {
        const { reservation_no } = req.params;
        const { username } = req.query;

        if (!username) {
            return res.status(400).json({
                status: "ERROR",
                respMessage: "Parameter 'username' wajib diisi."
            });
        }

        connection = await db.getConnection();

        const [[booking]] = await connection.execute(
            `SELECT * FROM hotel_bookings 
             WHERE reservation_no = ? AND username = ?`,
            [reservation_no, username]
        );

        if (!booking) {
            return res.status(404).json({
                status: "ERROR",
                respMessage: "Booking tidak ditemukan."
            });
        }

        const [paxes] = await connection.execute(
            `SELECT title, first_name, last_name, pax_type
             FROM hotel_booking_paxes
             WHERE booking_id = ?`,
            [booking.id]
        );

        booking.paxes = paxes;

        return res.json({
            status: "SUCCESS",
            data: booking
        });

    } catch (error) {
        logger.error("Detail Booking Error: " + error.message);
        return res.status(500).json({
            status: "ERROR",
            respMessage: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;