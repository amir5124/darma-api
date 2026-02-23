const axios = require('axios');
const db = require('../config/db');
const nodemailer = require('nodemailer');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');

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

const primaryColor = "#24b3ae";
const secondaryColor = "#e03f7d";

const hotelController = {
    // 1. SEARCH HOTELS
    search: async (req, res) => {
        try {
            const token = await getConsistentToken();
            const b = req.body;
            const payload = {
                paxPassport: b.paxPassport || "ID",
                countryID: b.countryID || "ID",
                cityID: String(b.cityID),
                checkInDate: b.checkInDate,
                checkOutDate: b.checkOutDate,
                roomRequest: b.roomRequest.map(room => ({
                    roomType: parseInt(room.roomType) || 0,
                    isRequestChildBed: Boolean(room.isRequestChildBed),
                    childNum: parseInt(room.childNum) || 0,
                    childAges: room.childAges || [0]
                })),
                userID: USER_CONFIG.userID,
                accessToken: token
            };

            const response = await axios.post(`${BASE_URL}/Hotel/Search5`, payload, {
                httpsAgent: agent,
                headers: { 'Content-Type': 'application/json' }
            });
            res.json(response.data);
        } catch (error) {
            logger.error("Hotel Search Error: " + error.message);
            res.status(500).json({ status: "ERROR", respMessage: error.message });
        }
    },

    // 2. AVAILABLE ROOMS
    availableRooms: async (req, res) => {
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
                roomRequest: b.roomRequest.map(room => ({
                    roomType: parseInt(room.roomType) || 0,
                    isRequestChildBed: Boolean(room.isRequestChildBed),
                    childNum: parseInt(room.childNum) || 0,
                    childAges: room.childAges || [0]
                })),
                userID: USER_CONFIG.userID,
                accessToken: token
            };

            const response = await axios.post(`${BASE_URL}/Hotel/AvailableRooms5`, payload, { httpsAgent: agent });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({ status: "ERROR", respMessage: error.message });
        }
    },

    // 3. PRICE AND POLICY INFO
    getPriceInfo: async (req, res) => {
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
    },

    // 4. BOOKING (INSERT TO DB & EMAIL KONFIRMASI)
   booking: async (req, res) => {
    let connection;
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // 1. Validasi Input Dasar
        if (!b.roomRequest || !b.roomRequest[0]) {
            return res.status(400).json({ status: "ERROR", respMessage: "Data paxes tidak lengkap." });
        }

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
                roomType: 0,
                childNum: parseInt(room.childNum) || 0,
                childAges: room.childAges || []
            })),
            internalCode: b.internalCode,
            hotelID: b.hotelID,
            breakfast: b.breakfast,
            roomID: b.roomID,
            bedType: { ID: null, bed: null },
            agentOsRef: b.agentOsRef || `HTL-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        // 2. Request ke Supplier
        const response = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, payload, { 
            httpsAgent: agent,
            timeout: 30000 // Robustness: Tambahkan timeout 30 detik
        });
        
        const resData = response.data;

        if (resData.status === "SUCCESS") {
            connection = await db.getConnection();
            await connection.beginTransaction();

            // 3. Simpan Main Booking
            const [bookingResult] = await connection.execute(
                `INSERT INTO hotel_bookings 
                (reservation_no, voucher_no, os_ref_no, agent_os_ref, hotel_id, hotel_name, hotel_address, 
                internal_code, check_in_date, check_out_date, city_id, room_id, room_name, breakfast_type, 
                contact_email, contact_phone, total_price, booking_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resData.reservationNo, resData.voucherNo, resData.osRefNo, resData.agentOsRef,
                    resData.hotelID, resData.hotelName, resData.hotelAddress, b.internalCode,
                    resData.checkInDate, resData.checkOutDate, resData.cityID, resData.roomID,
                    resData.roomName, resData.breakfast, b.roomRequest[0].email, b.roomRequest[0].phone,
                    resData.totalPrice, 'Accept'
                ]
            );

            const newBookingId = bookingResult.insertId;
            Cconsole.log(newBookingId,"id")

            // 4. Simpan Paxes (Looping yang aman)
            for (const room of b.roomRequest) {
                if (room.paxes) {
                    for (const pax of room.paxes) {
                        await connection.execute(
                            `INSERT INTO hotel_booking_paxes (booking_id, pax_type, title, first_name, last_name) 
                            VALUES (?, 'ADULT', ?, ?, ?)`,
                            [newBookingId, pax.title, pax.firstName, pax.lastName]
                        );
                    }
                }
                if (room.childNum > 0 && room.childAges) {
                    for (const age of room.childAges) {
                        await connection.execute(
                            `INSERT INTO hotel_booking_paxes (booking_id, pax_type, age) 
                            VALUES (?, 'CHILD', ?)`,
                            [newBookingId, age]
                        );
                    }
                }
            }

            // 5. Simpan Payment Record
            const expiredDate = new Date();
            expiredDate.setHours(expiredDate.getHours() + 2);

            await connection.execute(
                `INSERT INTO hotel_payments (booking_id, booking_code, amount, expired_date, payment_status) 
                VALUES (?, ?, ?, ?, 'PENDING')`,
                [newBookingId, resData.reservationNo, resData.totalPrice, expiredDate]
            );

            await connection.commit();

            // 6. Kirim Email (Async - Jangan biarkan error email menggagalkan transaksi)
            transporter.sendMail({
                from: '"LinkU Travel" <linkutransport@gmail.com>',
                to: b.roomRequest[0].email,
                subject: `Konfirmasi Booking - ${resData.reservationNo}`,
                html: generateEmailHtml(resData, b.roomRequest[0].paxes[0].firstName) // Gunakan helper function
            }).catch(err => logger.error("Email Error: " + err.message));

            // 7. FINAL RESPONSE (Pastikan booking_id terkirim paling atas)
            return res.json({
                status: "SUCCESS",
                booking_id: newBookingId, // Kunci utama untuk Frontend
                ...resData
            });

        } else {
            // Jika supplier gagal
            return res.status(400).json({ 
                status: "ERROR", 
                respMessage: resData.respMessage || "Gagal melakukan booking ke supplier." 
            });
        }

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error("Booking Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    } finally {
        if (connection) connection.release();
    }
},



    // 5. SELECT PAYMENT METHOD (LINKQU INSTRUCTION EMAIL)
    // Asumsi: Method ini dipanggil saat user memilih bank/metode bayar LinkQu di aplikasi Anda
    selectPayment: async (req, res) => {
        const { reservationNo, paymentMethod, vaNumber, amount, email, customerName } = req.body;
        try {
            const exp = new Date();
            exp.setHours(exp.getHours() + 2);

            // Email 2: Instruksi Bayar Modern
            const htmlInstruction = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border-top: 5px solid ${secondaryColor};">
                <div style="padding: 20px; background: #fff; text-align: center;">
                    <h3 style="color: ${primaryColor};">Selesaikan Pembayaran Anda</h3>
                    <p style="color: #666;">Gunakan detail di bawah ini untuk membayar melalui ${paymentMethod}</p>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 10px; margin: 0 20px;">
                    <p style="text-align: center; margin: 0; color: #888;">NOMOR PEMBAYARAN / VA</p>
                    <h1 style="text-align: center; color: ${secondaryColor}; letter-spacing: 2px; margin: 10px 0;">${vaNumber}</h1>
                    <div style="border-top: 1px solid #ddd; margin: 20px 0;"></div>
                    <table style="width: 100%;">
                        <tr><td>Total Tagihan</td><td style="text-align: right; font-weight: bold;">Rp ${Number(amount).toLocaleString()}</td></tr>
                        <tr><td>Batas Waktu</td><td style="text-align: right; color: red;">${exp.toLocaleString()}</td></tr>
                    </table>
                </div>
                <div style="padding: 20px; font-size: 12px; color: #999; text-align: center;">
                    Sistem akan memverifikasi pembayaran Anda secara otomatis.
                </div>
            </div>`;

            await transporter.sendMail({
                from: '"Payment Center" <noreply@travel.com>',
                to: email,
                subject: `Instruksi Pembayaran ${reservationNo}`,
                html: htmlInstruction
            });

            res.json({ status: "SUCCESS", message: "Instruction email sent" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // 6. PAYMENT NOTIFICATION (CALLBACK & E-TICKET EMAIL)
    handlePaymentNotification: async (req, res) => {
        const { reservationNo, paymentStatus, paymentMethod, paymentReff } = req.body;
        try {
            if (paymentStatus === 'SETTLED') {
                await db.execute(
                    `UPDATE hotel_payments SET 
                    payment_status = 'SETTLED', 
                    payment_method = ?, 
                    payment_reff = ?, 
                    payment_date = NOW(), 
                    ticket_status = 'ISSUED' 
                    WHERE booking_code = ?`,
                    [paymentMethod, paymentReff, reservationNo]
                );

                const [bookingRows] = await db.execute(
                    `SELECT b.*, p.payment_method, p.payment_date 
                     FROM hotel_bookings b 
                     JOIN hotel_payments p ON b.id = p.booking_id 
                     WHERE b.reservation_no = ?`, [reservationNo]
                );

                const [paxes] = await db.execute("SELECT * FROM hotel_booking_paxes WHERE booking_id = ?", [bookingRows[0].id]);

                // --- EMAIL 3: E-TICKET (MODERN DESIGN) ---
                const htmlTicket = `
                <div style="font-family: Arial; max-width: 600px; margin: auto; border: 1px solid ${primaryColor}; border-radius: 8px; overflow: hidden;">
                    <div style="background: ${primaryColor}; color: white; padding: 25px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px;">HOTEL VOUCHER</h1>
                        <p style="margin: 5px 0 0;">Reservasi No: ${reservationNo}</p>
                    </div>
                    <div style="padding: 25px;">
                        <h2 style="color: ${primaryColor}; margin-top: 0;">${bookingRows[0].hotel_name}</h2>
                        <p style="font-size: 14px; color: #555;">${bookingRows[0].hotel_address}</p>
                        
                        <div style="background: #fcfcfc; border: 1px solid #eee; padding: 15px; margin: 20px 0; border-radius: 5px;">
                            <table style="width: 100%;">
                                <tr>
                                    <td><small style="color: #999;">CHECK-IN</small><br><b>${new Date(bookingRows[0].check_in_date).toDateString()}</b></td>
                                    <td><small style="color: #999;">CHECK-OUT</small><br><b>${new Date(bookingRows[0].check_out_date).toDateString()}</b></td>
                                </tr>
                            </table>
                        </div>

                        <h4 style="border-bottom: 2px solid #f0f0f0; padding-bottom: 5px;">DETAIL TAMU</h4>
                        <ul style="padding-left: 20px; font-size: 14px;">
                            ${paxes.map(p => `<li>${p.title} ${p.first_name} ${p.last_name}</li>`).join('')}
                        </ul>

                        <div style="margin-top: 30px; text-align: center;">
                            <div style="display: inline-block; background: #e8f5f4; color: ${primaryColor}; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                                PEMBAYARAN LUNAS (${paymentMethod})
                            </div>
                        </div>
                    </div>
                    <div style="background: #333; color: #fff; padding: 15px; text-align: center; font-size: 11px;">
                        Tunjukkan voucher ini saat check-in. Terima kasih telah memesan melalui kami.
                    </div>
                </div>`;

                await transporter.sendMail({
                    from: '"Customer Service" <noreply@travel.com>',
                    to: bookingRows[0].contact_email,
                    subject: `[E-TICKET] Voucher Hotel Anda - ${reservationNo}`,
                    html: htmlTicket
                });

                return res.json({ status: "SUCCESS", message: "Ticket Issued & Email Sent" });
            }
            res.json({ status: "OK" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // 7. BOOKING DETAIL
    bookingDetail: async (req, res) => {
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
            const response = await axios.post(`${BASE_URL}/Hotel/BookingDetail`, payload, { httpsAgent: agent });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({ status: "ERROR", respMessage: error.message });
        }
    },

    // 8. IMAGES
    // Endpoint untuk Gambar Hotel / Logo
    getHotelImage: async (req, res) => {
        try {
            const id = req.query.id;
            if (!id) return res.status(400).send('ID is required');

            const response = await axios.get(`${BASE_URL}/Hotel/Image?id=${id}`, {
                httpsAgent: agent,
                responseType: 'arraybuffer'
            });
            res.set('Content-Type', 'image/jpeg');
            res.send(response.data);
        } catch (error) {
            res.status(404).send('Hotel image not found');
        }
    },

    // Endpoint untuk Gambar Kamar
    getRoomImage: async (req, res) => {
        try {
            // Kita ambil RoomID dari query string
            const RoomID = req.query.RoomID;
            if (!RoomID) return res.status(400).send('RoomID is required');

            const response = await axios.get(`${BASE_URL}/Hotel/RoomImage?RoomID=${RoomID}`, {
                httpsAgent: agent,
                responseType: 'arraybuffer'
            });
            res.set('Content-Type', 'image/jpeg');
            res.send(response.data);
        } catch (error) {
            res.status(404).send('Room image not found');
        }
    },
};

module.exports = hotelController;