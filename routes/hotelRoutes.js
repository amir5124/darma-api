// routes/hotelRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');
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
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // 1. Perbaikan Pembulatan Harga (Tanpa dibagi 1000 agar angka tetap utuh)
    // Math.ceil digunakan untuk membulatkan ke atas sesuai permintaan Anda (250238.66 -> 250239)
    const totalHargaFisik = Math.ceil(Number(data.totalPrice || 0));
    const totalFormatted = totalHargaFisik.toLocaleString('id-ID');

    // 2. Format Tanggal Indonesia untuk Waktu Pembayaran
    const paymentDate = new Date().toLocaleString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // 3. Format Tanggal Check-in
    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    // 4. Penanganan data Undefined untuk Nama dan Telepon
    const namaTamu = paxes && paxes[0]
        ? `${paxes[0].title || ''} ${paxes[0].firstName || ''} ${paxes[0].lastName || ''}`.trim()
        : "Guest";

    const noTelp = data.contactPhone && data.contactPhone !== "undefined" ? data.contactPhone : "-";

    const htmlContent = `
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
            body { font-family: 'Open Sans', sans-serif; color: #444; margin: 0; padding: 40px; background: #fff; }
            
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
            .itinerary-info { text-align: right; }
            .itinerary-label { display: block; background: #24b3ae; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 5px; }

            .paid-badge { 
                float: right; width: 80px; height: 80px; border: 5px solid #4CAF50; border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; color: #4CAF50; 
                font-weight: 900; font-size: 20px; transform: rotate(-20deg); opacity: 0.8;
                margin-top: -10px; margin-right: 20px;
            }

            .section-header { 
                color: #24b3ae; font-size: 16px; font-weight: 700; 
                border-bottom: 2px solid #f0f0f0; margin: 25px 0 10px 0; padding-bottom: 5px; 
            }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-item label { display: block; font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 3px; }
            .info-item span { font-size: 13px; font-weight: 600; color: #333; }

            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #f8f8f8; color: #24b3ae; text-align: left; padding: 12px; font-size: 12px; border-bottom: 1px solid #eee; }
            td { padding: 15px 12px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
            .product-type { font-weight: 700; color: #e03f7d; }
            
            .summary-container { margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 15px; }
            .total-row { display: flex; justify-content: flex-end; align-items: center; padding: 5px 0; }
            .total-label { font-size: 14px; font-weight: 600; margin-right: 20px; }
            .total-amount { font-size: 22px; font-weight: 800; color: #e03f7d; }
            
            .footer-note { font-size: 10px; color: #aaa; margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-area">
            <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png" 
                 height="50" style="margin-bottom: 10px; display: block;">
            <div style="font-size: 12px; color: #555; line-height: 1.5;">
                <div>Powered by Darmawisata Indonesia</div>
                <div>Dipesan dan dibayar oleh Darmawisata Indonesia</div>
            </div>
        </div>
        <div class="itinerary-info">
            <span class="itinerary-label">Itinerary ID: ${data.reservationNo}</span>
        </div>
      </div>

      <div class="paid-badge">PAID</div>

      <div class="section-header">Detail Kontak</div>
      <div class="info-grid">
          <div class="info-item">
              <label>Nama Pengambil</label>
              <span>${namaTamu}</span>
          </div>
          <div class="info-item">
              <label>Alamat Email</label>
              <span>${data.contactEmail || '-'}</span>
          </div>
          <div class="info-item">
              <label>Nomor Telepon</label>
              <span>${noTelp}</span>
          </div>
      </div>

      <div class="section-header">Detail Pembayaran</div>
      <div class="info-grid">
          <div class="info-item">
              <label>Waktu Pembayaran</label>
              <span>${paymentDate}</span>
          </div>
          <div class="info-item">
              <label>Metode Pembayaran</label>
              <span>Koin Aplikasi</span>
          </div>
          <div class="info-item">
              <label>Status</label>
              <span style="color: #4CAF50;">Sukses</span>
          </div>
      </div>

      <table>
          <thead>
              <tr>
                  <th width="5%">No</th>
                  <th width="15%">Jenis Produk</th>
                  <th width="55%">Deskripsi</th>
                  <th width="25%" style="text-align: right;">Jumlah Total</th>
              </tr>
          </thead>
          <tbody>
              <tr>
                  <td>1</td>
                  <td class="product-type">Hotel</td>
                  <td>
                      <div style="font-weight: 700; font-size: 14px; margin-bottom: 5px;">${data.hotelName}</div>
                      <div style="color: #666; margin-bottom: 10px;">${data.roomName}</div>
                      <div style="display: flex; gap: 20px;">
                          <div><small style="color:#999">CHECK-IN</small><br><b>${formatDate(data.checkInDate)}</b></div>
                          <div><small style="color:#999">DURASI</small><br><b>1 Kamar</b></div>
                      </div>
                  </td>
                  <td style="text-align: right; font-weight: 700;">
                     IDR ${totalFormatted}
                  </td>
              </tr>
          </tbody>
      </table>

      <div class="summary-container">
          <div class="total-row">
              <div class="total-label">Biaya Administrasi</div>
              <div style="width: 150px; text-align: right; font-weight: 600; color: #4CAF50;">GRATIS</div>
          </div>
          <div class="total-row" style="margin-top: 10px;">
              <div class="total-label" style="font-size: 16px;">Total Pembayaran</div>
              <div class="total-amount" style="width: 180px; text-align: right;">
                  IDR ${totalFormatted}
              </div>
          </div>
      </div>

      <div class="footer-note">
          Bukti transaksi ini sah dan dihasilkan secara otomatis oleh sistem LinkU Travel.<br>
          Silakan hubungi Customer Care kami jika Anda memiliki pertanyaan mengenai pesanan ini.
      </div>
    </body>
    </html>`;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    await browser.close();
    return pdfBuffer;
}

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
        
        // 1. Cari data di DB lokal berdasarkan nomor reservasi (bisa PRC- atau nomor asli)
        const [localRows] = await connection.execute(
            "SELECT * FROM hotel_bookings WHERE reservation_no = ?",
            [b.reservationNo]
        );

        if (localRows.length === 0) {
            return res.status(404).json({ status: "ERROR", respMessage: "Booking tidak ditemukan di database lokal." });
        }

        const localData = localRows[0];

        // 2. Konstruksi Payload untuk Supplier
        // Jika di DB lokal masih "PRC-", kirim reservationNo KOSONG ke supplier
        // Supplier akan mengenali booking melalui osRefNo
        const payload = {
            reservationNo: (localData.reservation_no.startsWith("PRC-")) ? "" : localData.reservation_no,
            osRefNo: String(localData.os_ref_no),
            agentOsRef: localData.agent_os_ref || "",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("CHECK_DETAIL_PAYLOAD: " + JSON.stringify(payload));

        const response = await axios.post(`${BASE_URL}/Hotel/BookingDetail`, payload, { httpsAgent: agent });
        const resData = response.data;

        // 3. LOGIKA UPDATE: Jika status di Supplier sudah 'Accept'
        if (resData.status === "SUCCESS" && resData.bookingDetail) {
            const detail = resData.bookingDetail;
            const cleanStatus = (detail.bookingStatus || "").trim();

            // Jika status sekarang 'Accept' dan sebelumnya di lokal masih 'Processed' (atau nomor masih PRC-)
            if (cleanStatus === "Accept") {
                
                // Ambil data paxes untuk generate PDF
                const [paxes] = await connection.execute(
                    "SELECT title, first_name as firstName, last_name as lastName FROM hotel_booking_paxes WHERE booking_id = ?",
                    [localData.id]
                );

                const pdfData = {
                    reservationNo: detail.reservationNo, // Nomor ASLI (DI2026...)
                    hotelName: detail.hotelName || localData.hotel_name,
                    roomName: detail.roomName || localData.room_name,
                    totalPrice: detail.totalPrice || localData.total_price,
                    contactEmail: localData.contact_email,
                    contactPhone: localData.contact_phone,
                    checkInDate: detail.checkInDate || localData.check_in_date
                };

                // Generate & Kirim Email (Hanya dilakukan saat transisi dari Processed ke Accept)
                if (localData.booking_status !== 'Accept') {
                    try {
                        const pdfBuffer = await generateBookingPDF(pdfData, paxes);
                        await transporter.sendMail({
                            from: '"LinkU Travel" <linkutransport@gmail.com>',
                            to: localData.contact_email,
                            subject: `E-Tiket Hotel Berhasil - ${detail.reservationNo}`,
                            html: `<p>Pesanan Anda ${detail.reservationNo} telah berhasil dikonfirmasi.</p>`,
                            attachments: [{ filename: `E-Tiket-${detail.reservationNo}.pdf`, content: pdfBuffer }]
                        });
                        logger.info(`Email Update Accept Terkirim: ${detail.reservationNo}`);
                    } catch (mailErr) {
                        logger.error("Gagal kirim email update: " + mailErr.message);
                    }
                }

                // UPDATE DATABASE: Timpa nomor PRC- dengan nomor ASLI dari supplier
                await connection.execute(
                    `UPDATE hotel_bookings SET 
                        reservation_no = ?, 
                        voucher_no = ?, 
                        booking_status = 'Accept',
                        updated_at = NOW() 
                     WHERE id = ?`,
                    [detail.reservationNo, detail.voucherNo, localData.id]
                );

                // Tambahkan flag agar frontend tahu ada perubahan nomor reservasi
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

        // 1. Ambil username dari request body (fallback ke "guest")
        const username = b.username || "guest";

        // 2. Konstruksi Payload untuk Supplier
        // Perbaikan: Menjamin tidak ada nilai NULL pada mandatory fields
        const payload = {
            paxPassport: b.paxPassport || "ID",
            countryID: b.countryID || "ID",
            cityID: String(b.cityID),
            checkInDate: b.checkInDate.endsWith('Z') ? b.checkInDate : b.checkInDate + 'Z',
            checkOutDate: b.checkOutDate.endsWith('Z') ? b.checkOutDate : b.checkOutDate + 'Z',
            roomRequest: b.roomRequest.map(room => ({
                paxes: room.paxes.map(pax => ({
                    title: pax.title || 'Mr.',
                    firstName: (pax.firstName || '').trim(),
                    lastName: (pax.lastName || '').trim()
                })),
                isSmokingRoom: Boolean(room.isSmokingRoom),
                phone: String(room.phone || ''),
                email: String(room.email || ''),
                // Supplier menolak NULL. Jika kosong, kirim array kosong []
                specialRequestArray: room.specialRequestArray || [], 
                // Supplier menolak NULL. Jika kosong, kirim string kosong ""
                requestDescription: room.requestDescription || "", 
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                // Pastikan childAges adalah array, minimal [0] jika childNum > 0 tapi data kosong
                childAges: (room.childAges && room.childAges.length > 0) ? room.childAges : [0]
            })),
            internalCode: b.internalCode || "SUP",
            hotelID: b.hotelID,
            breakfast: b.breakfast || "Room Only",
            roomID: b.roomID,
            // Perbaikan: Mengirim string kosong daripada null untuk bedType
            bedType: { 
                ID: (b.bedType && b.bedType.ID) ? String(b.bedType.ID) : "", 
                bed: (b.bedType && b.bedType.bed) ? String(b.bedType.bed) : "" 
            },
            agentOsRef: b.agentOsRef || `LC-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // 3. Kirim ke Supplier
        logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
        const response = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        const resData = response.data;
        logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData));

        // 4. Logika Deteksi Status (Kritikal)
        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        if (resData.status === "SUCCESS" || isAccepted || isProcessed) {

            // Jika statusnya diproses (waiting), normalisasi agar bisa masuk DB
            let currentStatus = 'Accept';
            if (isProcessed) {
                currentStatus = 'Processed';
                resData.reservationNo = resData.reservationNo || "PRC-" + Date.now();
                resData.voucherNo = resData.voucherNo || resData.reservationNo;
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            // 5. Simpan ke Database
            const [bookingResult] = await connection.execute(
                `INSERT INTO hotel_bookings 
                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, 
                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, 
                contact_email, contact_phone, total_price, booking_status, username) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resData.reservationNo || null,
                    resData.voucherNo || null,
                    resData.osRefNo || null,
                    payload.agentOsRef || null,
                    String(resData.hotelID || b.hotelID),
                    resData.hotelName || b.hotelName || "Hotel",
                    resData.hotelAddress || "",
                    b.internalCode || null,
                    resData.checkInDate || b.checkInDate.replace('Z', ''),
                    resData.checkOutDate || b.checkOutDate.replace('Z', ''),
                    String(b.cityID),
                    String(b.roomID),
                    resData.roomName || b.roomName || "",
                    b.breakfast || "",
                    b.roomRequest[0].email || "",
                    b.roomRequest[0].phone || "",
                    parseFloat(resData.totalPrice || 0),
                    currentStatus,
                    username
                ]
            );

            const newBookingId = bookingResult.insertId;

            // 6. Simpan Data Tamu
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
            logger.info(`Booking Berhasil Disimpan: ID ${newBookingId}, User: ${username}`);

            // 7. Worker PDF & Email
            if (currentStatus === 'Accept') {
                (async () => {
                    try {
                        const pdfData = {
                            reservationNo: resData.reservationNo,
                            hotelName: resData.hotelName || b.hotelName || "Hotel",
                            roomName: resData.roomName || b.roomName || "Room",
                            totalPrice: resData.totalPrice || 0,
                            contactEmail: b.roomRequest[0].email,
                            contactPhone: b.roomRequest[0].phone,
                            checkInDate: resData.checkInDate || b.checkInDate
                        };

                        const pdfBuffer = await generateBookingPDF(pdfData, b.roomRequest[0].paxes);

                        await transporter.sendMail({
                            from: '"LinkU Travel" <linkutransport@gmail.com>',
                            to: b.roomRequest[0].email,
                            subject: `E-Tiket Hotel - ${resData.reservationNo}`,
                            html: `<p>Booking Anda berhasil dikonfirmasi. Terlampir adalah e-tiket hotel Anda.</p>`,
                            attachments: [{
                                filename: `E-Tiket-${resData.reservationNo}.pdf`,
                                content: pdfBuffer
                            }]
                        });
                    } catch (err) {
                        logger.error("Worker PDF/Email Error: " + err.message);
                    }
                })();
            }

            return res.json({
                status: "SUCCESS",
                booking_id: newBookingId,
                internalStatus: currentStatus,
                ...resData,
                reservationNo: resData.reservationNo
            });

        } else {
            return res.status(400).json({
                status: "ERROR",
                respMessage: resData.respMessage || "Gagal melakukan booking ke supplier."
            });
        }

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error("Final Booking Error: " + error.message);
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