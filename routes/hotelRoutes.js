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

    // Format tanggal Indonesia untuk waktu pembayaran
    const paymentDate = new Date().toLocaleString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Format tanggal Check-in & Check-out
    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    };

    const htmlContent = `
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
            body { font-family: 'Open Sans', sans-serif; color: #444; margin: 0; padding: 40px; background: #fff; }
            
            /* Header Section */
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
            .logo-area { font-size: 28px; font-weight: 800; color: #24b3ae; }
            .logo-dot { color: #e03f7d; }
            .itinerary-info { text-align: right; }
            .itinerary-label { display: block; background: #24b3ae; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 5px; }
            .booked-by { font-size: 11px; color: #888; }

            /* Paid Stamp */
            .paid-badge { 
                float: right; width: 80px; height: 80px; border: 5px solid #4CAF50; border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; color: #4CAF50; 
                font-weight: 900; font-size: 20px; transform: rotate(-20deg); opacity: 0.8;
                margin-top: -10px; margin-right: 20px;
            }

            /* Section Styling */
            .section-header { 
                color: #24b3ae; font-size: 16px; font-weight: 700; 
                border-bottom: 2px solid #f0f0f0; margin: 25px 0 10px 0; padding-bottom: 5px; 
            }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-item label { display: block; font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 3px; }
            .info-item span { font-size: 13px; font-weight: 600; color: #333; }

            /* Table Styling */
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #f8f8f8; color: #24b3ae; text-align: left; padding: 12px; font-size: 12px; border-bottom: 1px solid #eee; }
            td { padding: 15px 12px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
            .product-type { font-weight: 700; color: #e03f7d; }
            
            /* Footer/Total Area */
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
             height="50" 
             style="margin-bottom: 10px; display: block;">
        
        <div style="font-size: 12px; color: #555; line-height: 1.5;">
            <div class="powered-by">Powered by Darmawisata Indonesia</div>
            <div class="booked-by-new">Dipesan dan dibayar oleh Darmawisata Indonesia</div>
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
                <span>${paxes[0].title} ${paxes[0].firstName} ${paxes[0].lastName}</span>
            </div>
            <div class="info-item">
                <label>Alamat Email</label>
                <span>${data.contactEmail}</span>
            </div>
            <div class="info-item">
                <label>Nomor Telepon</label>
                <span>${data.contactPhone}</span>
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
                        IDR ${Number(data.totalPrice).toLocaleString('id-ID')}
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
                    IDR ${Number(data.totalPrice).toLocaleString('id-ID')}
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


router.post('/booking', async (req, res) => {
    let connection;
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // ✅ TAMBAHAN: Ambil username dari request body
        const username = b.username || "guest";

        // 1. Konstruksi Payload untuk Supplier
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
                specialRequestArray: null,
                requestDescription: room.requestDescription || null,
                roomType: 0,
                isRequestChildBed: false,
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || []
            })),
            internalCode: b.internalCode,
            hotelID: b.hotelID,
            breakfast: b.breakfast,
            roomID: b.roomID,
            bedType: { ID: "", bed: "" },
            agentOsRef: b.agentOsRef || `LC-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // 2. Kirim ke Supplier
        logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
        const response = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        const resData = response.data;
        logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData));

        // 3. Cek Status
        const isProcessed = resData.status === "ERROR" && resData.respMessage && resData.respMessage.includes("PROCESSED");

        if (resData.status === "SUCCESS" || resData.bookingStatus === "Accept" || isProcessed) {

            if (isProcessed) {
                resData.status = "SUCCESS";
                resData.reservationNo = resData.reservationNo || "PROCESSED-" + Date.now();
                resData.voucherNo = resData.voucherNo || resData.reservationNo;
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            // 4. Simpan ke Database — ✅ tambahkan kolom `username`
            const [bookingResult] = await connection.execute(
                `INSERT INTO hotel_bookings 
                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, 
                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, 
                contact_email, contact_phone, total_price, booking_status, username) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resData.reservationNo, resData.voucherNo, resData.osRefNo, payload.agentOsRef,
                    resData.hotelID || b.hotelID, resData.hotelName || "Hotel", resData.hotelAddress || "",
                    b.internalCode, resData.checkInDate, resData.checkOutDate, b.cityID, b.roomID,
                    resData.roomName || b.roomName, b.breakfast, b.roomRequest[0].email, b.roomRequest[0].phone,
                    resData.totalPrice || 0, 'Accept',
                    username  // ✅ TAMBAHAN
                ]
            );

            const newBookingId = bookingResult.insertId;

            // 5. Simpan Tamu
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

            // 6. Worker PDF & Email (Async)
            (async () => {
                try {
                    const pdfData = {
                        reservationNo: resData.reservationNo,
                        hotelName: resData.hotelName || "Hotel",
                        roomName: resData.roomName || "Room",
                        totalPrice: resData.totalPrice || 0,
                        contactEmail: b.roomRequest[0].email,
                        contactPhone: b.roomRequest[0].phone,
                        checkInDate: resData.checkInDate
                    };

                    const pdfBuffer = await generateBookingPDF(pdfData, b.roomRequest[0].paxes);

                    await transporter.sendMail({
                        from: '"LinkU Travel" <linkutransport@gmail.com>',
                        to: b.roomRequest[0].email,
                        subject: `E-Tiket Hotel - ${resData.reservationNo}`,
                        html: `<h3>Halo ${b.roomRequest[0].paxes[0].firstName},</h3>
                               <p>Booking Anda berhasil diproses. Terlampir adalah e-tiket hotel Anda.</p>`,
                        attachments: [{
                            filename: `E-Tiket-${resData.reservationNo}.pdf`,
                            content: pdfBuffer
                        }]
                    });
                    logger.info(`Email PDF terkirim ke: ${b.roomRequest[0].email}`);
                } catch (err) {
                    logger.error("Worker PDF/Email Error: " + err.message);
                }
            })();

            // 7. Response Sukses
            return res.json({
                status: "SUCCESS",
                booking_id: newBookingId,
                username: username,  // ✅ Opsional: kembalikan ke frontend jika dibutuhkan
                ...resData
            });

        } else {
            return res.status(400).json({
                status: "ERROR",
                respMessage: resData.respMessage || "Gagal melakukan booking."
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
// 5. HOTEL BOOKING DETAIL
router.post('/booking-detail', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;
        const payload = {
            reservationNo: b.reservationNo,
            osRefNo: b.osRefNo,
            agentOsRef: b.agentOsRef,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_HOTEL_DETAIL", payload);
        const response = await axios.post(`${BASE_URL}/Hotel/BookingDetail`, payload, { httpsAgent: agent });
        logger.debug("RES_HOTEL_DETAIL", response.data);

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

module.exports = router;