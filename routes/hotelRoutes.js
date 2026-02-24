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

    // Format tanggal Indonesia
    const paymentDate = new Date().toLocaleString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Template HTML mirip strukur gambar Tiket.com
    const htmlContent = `
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; color: #333; margin: 40px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0070BA; padding-bottom: 10px; }
            .logo { font-size: 24px; font-weight: bold; color: #0070BA; }
            .itinerary-id { background: #f0f0f0; padding: 5px 10px; border-radius: 5px; font-size: 12px; }
            .section-title { font-weight: bold; border-bottom: 1px solid #ccc; margin-top: 20px; padding-bottom: 5px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 12px; }
            .paid-stamp { float: right; color: #4CAF50; border: 4px solid #4CAF50; padding: 10px; border-radius: 50%; font-weight: bold; transform: rotate(-15deg); }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { text-align: left; border-bottom: 1px solid #eee; padding: 10px; background: #fafafa; }
            td { padding: 10px; border-bottom: 1px solid #eee; }
            .total-box { background: #fff8e1; padding: 15px; text-align: right; margin-top: 10px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">tiket<span style="color: #FFC107;">●</span>com</div>
            <div class="itinerary-id">Itinerary ID: <b>${data.reservationNo}</b></div>
        </div>
        
        <div class="paid-stamp">PAID</div>

        <div class="section-title">Detail Kontak</div>
        <div class="grid">
            <div>Nama: <br><b>${paxes[0].title} ${paxes[0].firstName} ${paxes[0].lastName}</b></div>
            <div>Alamat Email: <br><b>${data.contactEmail}</b></div>
            <div>Nomor Telepon: <br><b>${data.contactPhone}</b></div>
        </div>

        <div class="section-title">Detail Pembayaran</div>
        <div class="grid">
            <div>Waktu Pembayaran: <br><b>${paymentDate}</b></div>
            <div>Metode Pembayaran: <br><b>LinkU Wallet / VA</b></div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>No</th>
                    <th>Jenis Produk</th>
                    <th>Deskripsi</th>
                    <th>Jumlah Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>Hotel</td>
                    <td><b>${data.hotelName}</b><br>${data.roomName}<br>Check-in: ${data.checkInDate.split('T')[0]}</td>
                    <td>IDR ${Number(data.totalPrice).toLocaleString('id-ID')}</td>
                </tr>
            </tbody>
        </table>

        <div class="total-box">
            Total Pembayaran: <span style="color: #f57c00; font-size: 18px;">IDR ${Number(data.totalPrice).toLocaleString('id-ID')}</span>
        </div>
    </body>
    </html>`;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
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

// 4. HOTEL BOOKING ALL SUPPLIER
// 4. HOTEL BOOKING ALL SUPPLIER
router.post('/booking', async (req, res) => {
    let connection;
    try {
        const token = await getConsistentToken();
        const b = req.body;

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
            bedType: { ID: "", bed: "" }, // Gunakan string kosong untuk menghindari error null
            agentOsRef: b.agentOsRef || `LC-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // 2. Kirim ke Supplier
        logger.debug("REQ_HOTEL_BOOKING_FINAL", JSON.stringify(payload));
        const response = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, payload, { 
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // Timeout lebih lama untuk booking
        });
        
        const resData = response.data;
        logger.debug("RES_HOTEL_BOOKING_FINAL", JSON.stringify(resData));

        // 3. Cek Status (Success, Accept, atau Processed)
        const isProcessed = resData.status === "ERROR" && resData.respMessage && resData.respMessage.includes("PROCESSED");

        if (resData.status === "SUCCESS" || resData.bookingStatus === "Accept" || isProcessed) {
            
            // Handle jika status PROCESSED (Ubah ke sukses agar bisa simpan DB)
            if (isProcessed) {
                resData.status = "SUCCESS";
                resData.reservationNo = resData.reservationNo || "PROCESSED-" + Date.now();
                resData.voucherNo = resData.voucherNo || resData.reservationNo;
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            // 4. Simpan ke Database (hotel_bookings)
            const [bookingResult] = await connection.execute(
                `INSERT INTO hotel_bookings 
                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, 
                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, 
                contact_email, contact_phone, total_price, booking_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resData.reservationNo, resData.voucherNo, resData.osRefNo, payload.agentOsRef,
                    resData.hotelID || b.hotelID, resData.hotelName || "Hotel", resData.hotelAddress || "", 
                    b.internalCode, resData.checkInDate, resData.checkOutDate, b.cityID, b.roomID,
                    resData.roomName || b.roomName, b.breakfast, b.roomRequest[0].email, b.roomRequest[0].phone,
                    resData.totalPrice || 0, 'Accept'
                ]
            );

            const newBookingId = bookingResult.insertId;

            // 5. Simpan Tamu (hotel_booking_paxes)
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

            // 6. Jalankan Worker PDF & Email (Async agar response cepat)
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

            // 7. Kirim Response Sukses ke Frontend
            return res.json({
                status: "SUCCESS",
                booking_id: newBookingId,
                ...resData
            });

        } else {
            // Jika benar-benar gagal dari supplier
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