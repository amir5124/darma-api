const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');
const { generateTicketPDF } = require('../utils/ticketGenerator');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');

/**
 * GET SHIP DLU ROUTES
 * Mendapatkan daftar pelabuhan asal dan tujuan untuk kapal DLU
 */
router.post('/route', async (req, res) => {
    try {
        // Mengambil token yang valid secara otomatis dari helper
        const token = await getConsistentToken();

        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_ROUTE: Fetching DLU ship routes");

        const response = await axios.post(`${BASE_URL}/ShipDlu/Route`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_ROUTE", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Route Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.response ? error.response.data : error.message
        });
    }
});

/**
 * GET SHIP DLU CLASS TYPES
 * Mendapatkan daftar tipe kelas yang tersedia pada layanan DLU
 */
router.post('/class-types', async (req, res) => {
    try {
        // Mengambil token otomatis dari helper
        const token = await getConsistentToken();

        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_CLASSTYPES: Fetching DLU class types list");

        const response = await axios.post(`${BASE_URL}/ShipDlu/ClassTypes`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_CLASSTYPES", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Class Types Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.response ? error.response.data : error.message
        });
    }
});

/**
 * GET SHIP DLU VEHICLE TYPES
 * Mendapatkan daftar tipe kendaraan yang bisa diangkut oleh DLU
 */
router.post('/vehicle-types', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_VEHICLETYPES: Fetching DLU vehicle categories");

        const response = await axios.post(`${BASE_URL}/ShipDlu/VehicleTypes`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Ship DLU Vehicle Types Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

/**
 * GET SHIP DLU TICKET TYPES
 * Mendapatkan daftar tipe tiket yang tersedia (Orang/Kendaraan/Barang)
 */
router.post('/ticket-types', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_TICKETTYPES: Fetching DLU ticket categories");

        const response = await axios.post(`${BASE_URL}/ShipDlu/TicketTypes`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_TICKETTYPES", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Ticket Types Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.response ? error.response.data : error.message
        });
    }
});

/**
 * GET SHIP DLU ROOM CLASSES
 * Mendapatkan daftar kategori kamar/ruangan pada kapal DLU
 */
router.post('/room-classes', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const payload = {
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info("REQ_SHPDLU_ROOMCLASSES: Fetching DLU room class categories");

        const response = await axios.post(`${BASE_URL}/ShipDlu/RoomClasses`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        logger.debug("RES_SHPDLU_ROOMCLASSES", response.data);
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Room Classes Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.response ? error.response.data : error.message
        });
    }
});

/**
 * POST SHIP DLU SCHEDULE
 * Mencari jadwal kapal DLU berdasarkan rute, rentang tanggal, dan tipe layanan
 */
router.post('/schedule', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Pastikan mandatory data tidak null dan tipe data sesuai (Integer jika diperlukan)
        const payload = {
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            departStartDate: b.departStartDate,
            departEndDate: b.departEndDate,
            // Jika ID kosong, berikan default "0" atau angka yang valid sesuai dokumentasi DLU
            paxClass: b.paxClass ? String(b.paxClass) : "0",
            ticketType: b.ticketType ? String(b.ticketType) : "0",
            vehicleType: b.vehicleType ? String(b.vehicleType) : "0",
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHPDLU_SCHEDULE: ${payload.originPort} to ${payload.destinationPort}`);

        // Debugging: Pastikan payload di console backend sudah benar
        console.log("Payload Sent to DLU:", payload);

        const response = await axios.post(`${BASE_URL}/ShipDlu/Schedule`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        // Jika API membalas SUCCESS tapi data kosong, pastikan format tetap konsisten
        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Schedule Error: " + error.message);
        res.status(500).json({
            status: "FAILED",
            respMessage: error.response ? JSON.stringify(error.response.data) : error.message
        });
    }
});

/**
 * POST SHIP DLU SELECT SCHEDULE
 * Mengunci jadwal dan tarif yang dipilih sebelum proses booking
 */
router.post('/select-schedule', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        // Validasi sederhana untuk memastikan fares adalah array
        if (!b.fares || !Array.isArray(b.fares)) {
            return res.status(400).json({ status: "FAILED", respMessage: "Fares harus berupa array" });
        }

        const payload = {
            shipNumber: String(b.shipNumber),
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            departDate: b.departDate, // Format: 2025-12-29T00:00:00Z
            fares: b.fares.map(f => ({
                count: parseInt(f.count),
                data: f.data
            })),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.info(`REQ_SHPDLU_SELECT: Selecting ship ${payload.shipNumber}`);

        const response = await axios.post(`${BASE_URL}/ShipDlu/SelectDLUSchedule`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);

    } catch (error) {
        logger.error("Ship DLU Select Schedule Error: " + error.message);
        res.status(500).json({
            status: "ERROR",
            respMessage: error.response ? error.response.data : error.message
        });
    }
});

/**
 * POST SHIP DLU PRICE
 * Validasi harga final berdasarkan data penumpang yang telah diisi
 */
router.post('/price', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const payload = {
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            fares: b.fares || [],
            // Mapping listPax agar semua field mandatory terisi
            listPax: (b.listPax || []).map(pax => ({
                name: pax.name || "",
                gender: String(pax.gender), // "0" atau "1"
                id: pax.id || "",
                dob: pax.dob || "",
                note: pax.note || "",
                price: parseFloat(pax.price) || 0,
                admin: parseFloat(pax.admin) || 0,
                paxType: pax.paxType || "",   // MANDATORY
                paxClass: pax.paxClass || "", // MANDATORY
                paxGroup: pax.paxGroup || "", // MANDATORY
                paxInfo: pax.paxInfo || "",
                city: pax.city || ""          // MANDATORY
            })),
            listVehicle: b.listVehicle || [],
            listRoom: b.listRoom || [],
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        const response = await axios.post(`${BASE_URL}/ShipDlu/Price`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        logger.error("Ship DLU Price Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

/**
 * POST SHIP DLU ISSUED
 * Tahap akhir: Melakukan issued/penerbitan tiket resmi
 */
router.post('/issued', async (req, res) => {
    try {
        const token = await getConsistentToken();
        const b = req.body;

        const cleanPax = (p) => ({
            paxGroup: p.paxGroup || "",
            gender: String(p.gender || "0"),
            name: p.name || "",
            id: p.id || "",
            dob: p.dob || "",
            city: p.city || "",
            note: p.note || "",
            admin: parseFloat(p.admin || 0),
            price: parseFloat(p.price || 0),
            paxType: p.paxType || "",
            paxClass: p.paxClass || "",
            paxInfo: p.paxInfo || ""
        });

        const firstPaxReguler = b.listPax?.[0];
        const firstPaxRoom = b.listRoom?.[0]?.paxes?.[0];
        const referencePax = firstPaxReguler || firstPaxRoom || {};

        const payload = {
            numCode: String(b.numCode),
            originPort: String(b.originPort),
            destinationPort: String(b.destinationPort),
            shipNumber: String(b.shipNumber),
            departDate: b.departDate,
            listPax: (b.listPax || []).map(p => cleanPax(p)),
            listRoom: (b.listRoom || []).map(r => ({
                info: r.info || "",
                roomClass: r.roomClass || "",
                price: parseFloat(r.price || 0),
                admin: parseFloat(r.admin || 0),
                paxes: (r.paxes || []).map(p => cleanPax(p))
            })),
            listVehicle: b.listVehicle || [],
            bookerData: {
                gender: String(b.bookerData?.gender || referencePax.gender || "0"),
                name: b.bookerData?.name || referencePax.name || "",
                id: b.bookerData?.id || referencePax.id || "",
                email: b.bookerData?.email || "",
                phone: b.bookerData?.phone || "",
                city: b.bookerData?.city || referencePax.city || ""
            },
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        console.log(`[DLU_PROXY] Forwarding to Vendor: ${payload.numCode}`);

        const response = await axios.post(`${BASE_URL}/ShipDlu/Issued`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });

        // Langsung kirim balik apa adanya dari vendor
        res.json(response.data);

    } catch (error) {
        console.error(`[DLU_PROXY] Error: ${error.message}`);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

router.post('/save-booking', async (req, res) => {
    try {
        // 1. Ambil data dari req.body
        const { resData, bookerData, serviceFee, username, rawPaxes } = req.body;

        if (!resData || resData.status !== "SUCCESS") {
            return res.status(400).json({ status: "ERROR", message: "Data tidak valid" });
        }

        console.log(`[DLU_DB] Memulai penyimpanan data: ${resData.bookingNumber} untuk user: ${username || 'Guest'}`);

        const MY_SERVICE_FEE = parseFloat(serviceFee || 15000);
        const vendorTicketPrice = parseFloat(resData.ticketPrice || 0);
        const finalTotalUser = vendorTicketPrice + MY_SERVICE_FEE;

        // A. Simpan Header
        const [header] = await db.execute(
            `INSERT INTO bookings_dlu (
                booking_number, num_code, ship_name, origin_name, 
                destination_name, depart_date, ticket_price, 
                service_fee, total_bayar, customer_name, 
                customer_phone, customer_email, status, raw_response,
                username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                resData.bookingNumber,
                resData.numCode,
                resData.shipName,
                resData.originName,
                resData.destinationName,
                resData.departDate,
                vendorTicketPrice,
                MY_SERVICE_FEE,
                finalTotalUser,
                bookerData.name,
                bookerData.phone,
                bookerData.email,
                'SUCCESS',
                JSON.stringify(resData),
                username || null
            ]
        );

        const newBookingId = header.insertId;

        // B. Simpan Detail Pax & Suntik Data Note untuk PDF
        if (resData.paxBookingDetails?.length > 0) {
            // Kita map ulang resData agar memiliki note untuk keperluan generate PDF nanti
            resData.paxBookingDetails = resData.paxBookingDetails.map((pax, index) => {
                const originalNote = rawPaxes && rawPaxes[index] ? rawPaxes[index].note : null;
                return {
                    ...pax,
                    note: pax.note || originalNote // Menyisipkan note ke memori resData
                };
            });

            // Siapkan values untuk insert database
            const paxValues = resData.paxBookingDetails.map((pax) => {
                return [
                    newBookingId,
                    pax.paxName,
                    pax.paxType,
                    pax.ID,
                    pax.paxGender || '-',
                    pax.ticketNumber,
                    pax.ticketQRCode,
                    pax.fare,
                    pax.admin,
                    pax.note // Sudah berisi originalNote dari proses map di atas
                ];
            });

            await db.query(
                `INSERT INTO booking_pax_details_dlu (
                    booking_id, pax_name, pax_type, id_number, 
                    gender, ticket_number, ticket_qr_code, fare, admin_vendor,
                    pax_note
                ) VALUES ?`,
                [paxValues]
            );
        }

        // --- C. PROSES GENERATE PDF & KIRIM EMAIL ---
        try {
            console.log(`[DLU_MAIL] Menghasilkan PDF untuk: ${resData.bookingNumber}`);
            
            // resData di sini sudah mengandung property .note dari hasil map di atas
            const pdfBuffer = await generateTicketPDF(resData, MY_SERVICE_FEE, finalTotalUser);

            const emailSubject = `E-Tiket Kapal ${resData.shipName} - ${resData.bookingNumber}`;
            const emailHtml = `
                <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
                    <h2>Halo, ${bookerData.name}!</h2>
                    <p>Terima kasih telah melakukan pemesanan di <b>LinkU Transport</b>.</p>
                    <p>Pembayaran Anda telah berhasil diverifikasi. Berikut adalah rincian tiket Anda:</p>
                    <ul>
                        <li><b>Kapal:</b> ${resData.shipName}</li>
                        <li><b>Rute:</b> ${resData.originName} &rarr; ${resData.destinationName}</li>
                        <li><b>Kode Pesanan:</b> ${resData.bookingNumber}</li>
                    </ul>
                    <p>Silakan temukan <b>E-Tiket resmi</b> Anda pada lampiran PDF di email ini.</p>
                    <br>
                    <p>Salam hangat,<br>Team LinkU Transport</p>
                </div>
            `;

            await sendBookingEmail(bookerData.email, emailSubject, emailHtml, [
                {
                    filename: `ETiket_DLU_${resData.bookingNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]);

            console.log(`[DLU_MAIL] Email berhasil dikirim ke ${bookerData.email}`);
        } catch (errorMail) {
            console.error(`[DLU_MAIL] Gagal mengirim email: ${errorMail.message}`);
        }

        console.log(`[DLU_DB] Berhasil simpan ID: ${newBookingId}`);
        res.json({ status: "SUCCESS", databaseId: newBookingId });

    } catch (error) {
        console.error(`[DLU_DB] Error: ${error.message}`);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

router.post('/dlu-bookings/draft', async (req, res) => {
    try {
        const { bookerData, routeData, serviceFee, username } = req.body;

        // Generate nomor referensi internal
        const tempBookingNo = 'DLU-WAIT-' + Date.now();
        const MY_SERVICE_FEE = parseFloat(serviceFee || 15000);
        const ticketPrice = parseFloat(routeData.ticketPrice || 0);
        const finalTotal = ticketPrice + MY_SERVICE_FEE;

        const [result] = await db.execute(
            `INSERT INTO bookings_dlu (
                booking_number, ship_name, origin_name, destination_name, 
                depart_date, ticket_price, service_fee, total_bayar, 
                customer_name, customer_phone, customer_email, 
                status, username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?)`,
            [
                tempBookingNo, routeData.shipName, routeData.originName, 
                routeData.destinationName, routeData.departDate, ticketPrice,
                MY_SERVICE_FEE, finalTotal, bookerData.name, 
                bookerData.phone, bookerData.email, username || null
            ]
        );

        res.json({ 
            status: "SUCCESS", 
            booking_id: result.insertId, 
            booking_number: tempBookingNo,
            total_bayar: finalTotal 
        });
    } catch (error) {
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

router.post('/dlu-bookings/update-after-vendor', async (req, res) => {
    try {
        // resData adalah response SUKSES dari vendor (Darmawisata)
        const { resData, booking_id, rawPaxes, serviceFee } = req.body;

        console.log(`[DLU_SYNC] Sinkronisasi data vendor untuk ID: ${booking_id}`);

        const MY_SERVICE_FEE = parseFloat(serviceFee || 15000);
        const finalTotalUser = parseFloat(resData.ticketPrice) + MY_SERVICE_FEE;

        // 1. Update Header dengan data asli dari Vendor
        await db.execute(
            `UPDATE bookings_dlu SET 
                booking_number = ?, 
                num_code = ?, 
                status = 'SUCCESS', 
                raw_response = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [resData.bookingNumber, resData.numCode, JSON.stringify(resData), booking_id]
        );

        // 2. Simpan Detail Pax (Logika yang sama dengan /save-booking lama)
        if (resData.paxBookingDetails?.length > 0) {
            const paxValues = resData.paxBookingDetails.map((pax, index) => {
                const originalNote = rawPaxes && rawPaxes[index] ? rawPaxes[index].note : null;
                return [
                    booking_id,
                    pax.paxName,
                    pax.paxType,
                    pax.ID,
                    pax.paxGender || '-',
                    pax.ticketNumber,
                    pax.ticketQRCode,
                    pax.fare,
                    pax.admin,
                    originalNote
                ];
            });

            await db.query(
                `INSERT INTO booking_pax_details_dlu (
                    booking_id, pax_name, pax_type, id_number, 
                    gender, ticket_number, ticket_qr_code, fare, admin_vendor, pax_note
                ) VALUES ?`,
                [paxValues]
            );
        }

        // 3. Kirim Email (Sama dengan logika Anda sebelumnya)
        // Jalankan di background agar user tidak menunggu lama
        sendEmailDlu(booking_id, resData, MY_SERVICE_FEE, finalTotalUser);

        res.json({ status: "SUCCESS", message: "Booking finalized" });

    } catch (error) {
        console.error(`[DLU_SYNC_ERR]: ${error.message}`);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

// Fungsi Helper Email agar kode rapi
/**
 * Fungsi Helper untuk Generate PDF dan Kirim Email Kapal DLU
 * @param {number} id - ID database internal (bookings_dlu.id)
 * @param {object} resData - Response object sukses dari vendor
 * @param {number} fee - Nilai Service Fee
 * @param {number} total - Total Bayar User (Ticket + Fee)
 */
async function sendEmailDlu(id, resData, fee, total) {
    try {
        console.log(`[DLU_MAIL] Memproses Email & PDF untuk Booking: ${resData.bookingNumber}`);

        // 1. Generate PDF Buffer menggunakan fungsi generateTicketPDF yang sudah ada
        // Pastikan fungsi ini sudah di-import/tersedia di scope file ini
        const pdfBuffer = await generateTicketPDF(resData, fee, total);

        // 2. Siapkan Subjek Email
        const emailSubject = `E-Tiket Kapal ${resData.shipName} - ${resData.bookingNumber}`;

        // 3. Susun Konten HTML Email
        // Menggunakan data dari resData (sesuai field vendor)
        const emailHtml = `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #00529b;">LinkU Transport</h2>
                    <hr style="border: 0; border-top: 1px solid #eee;">
                </div>
                
                <p>Halo, <b>${resData.customerName || 'Pelanggan'}</b>!</p>
                <p>Terima kasih telah melakukan pemesanan tiket kapal di <b>LinkU Transport</b>.</p>
                <p>Pembayaran Anda telah berhasil diverifikasi dan tiket Anda telah diterbitkan (Issued). Berikut adalah rincian perjalanan Anda:</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #666;">Nama Kapal</td>
                            <td style="padding: 5px 0;"><b>: ${resData.shipName}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #666;">Rute</td>
                            <td style="padding: 5px 0;"><b>: ${resData.originName} &rarr; ${resData.destinationName}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #666;">Jadwal Keberangkatan</td>
                            <td style="padding: 5px 0;"><b>: ${resData.departDate}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #666;">Kode Pesanan (PNR)</td>
                            <td style="padding: 5px 0;"><b style="color: #d32f2f;">: ${resData.numCode}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #666;">Nomor Reservasi</td>
                            <td style="padding: 5px 0;"><b>: ${resData.bookingNumber}</b></td>
                        </tr>
                    </table>
                </div>

                <p>Silakan temukan <b>E-Tiket resmi</b> Anda pada lampiran email ini. Anda dapat mencetak atau menunjukkan file PDF tersebut saat melakukan check-in di pelabuhan.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
                    <p>Pesan ini dikirim secara otomatis oleh sistem LinkU Transport.<br>
                    Jika ada pertanyaan, silakan hubungi Customer Service kami.</p>
                </div>
            </div>
        `;

        // 4. Kirim Email melalui fungsi sendBookingEmail
        // Pastikan email tujuan diambil dari data pemesan (resData.customerEmail atau parameter tambahan)
        const targetEmail = resData.customerEmail || resData.email;

        if (!targetEmail) {
            throw new Error("Email tujuan tidak ditemukan dalam resData");
        }

        await sendBookingEmail(targetEmail, emailSubject, emailHtml, [
            {
                filename: `ETiket_DLU_${resData.numCode || resData.bookingNumber}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]);

        console.log(`[DLU_MAIL] ✅ Email Berhasil dikirim ke: ${targetEmail}`);
        return true;

    } catch (e) {
        console.error(`[DLU_MAIL] ❌ Gagal mengirim email untuk ID ${id}:`, e.message);
        // Kita tidak me-reject agar tidak mengganggu proses response API utama
        return false;
    }
}

router.get('/booking-history/:username', async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.status(400).json({ status: "ERROR", message: "Username harus diisi" });
        }

        // 1. Ambil semua data header booking berdasarkan username
        // Kita urutkan berdasarkan ID terbaru (descending)
        const [bookings] = await db.execute(
            `SELECT * FROM bookings_dlu WHERE username = ? ORDER BY id DESC`,
            [username]
        );

        if (bookings.length === 0) {
            return res.json({ status: "SUCCESS", message: "Belum ada riwayat pemesanan", data: [] });
        }

        // 2. Ambil semua detail pax untuk booking yang ditemukan
        // Kita gunakan Promise.all agar proses pengambilan detail berjalan efisien
        const historyData = await Promise.all(bookings.map(async (booking) => {
            const [paxes] = await db.execute(
                `SELECT * FROM booking_pax_details_dlu WHERE booking_id = ?`,
                [booking.id]
            );
            
            return {
                ...booking,
                pax_details: paxes // Menyisipkan array penumpang ke dalam objek booking
            };
        }));

        console.log(`[DLU_DB] History diambil untuk user: ${username} (${bookings.length} data)`);
        
        res.json({
            status: "SUCCESS",
            data: historyData
        });

    } catch (error) {
        console.error(`[DLU_DB] Error Get History: ${error.message}`);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

router.post('/get-eticket', async (req, res) => {
    const bookingNumber = req.body.bookingNumber;

    try {
        const token = await getConsistentToken();

        // 1. Log Payload (Data yang dikirim ke Vendor)
        const payload = {
            bookingNumber: bookingNumber,
            userID: USER_CONFIG.userID,
            accessToken: token ? "TOKEN_EXISTS" : "TOKEN_EMPTY" // Jangan log token asli demi keamanan
        };
        console.log(`%c[VEND-REQ] GetEticket | Booking: ${bookingNumber}`, 'color: #00ff00', payload);

        const response = await axios.post(`${BASE_URL}/ShipDlu/GetEticket`, {
            bookingNumber: bookingNumber,
            userID: USER_CONFIG.userID,
            accessToken: token
        }, {
            httpsAgent: agent,
            responseType: 'arraybuffer'
        });

        // 2. Log Response (Info meta data dari Vendor)
        console.log(`%c[VEND-RES] GetEticket | Success | Size: ${response.data.byteLength} bytes`, 'color: #00fbff');

        // Validasi jika data kosong
        if (!response.data || response.data.byteLength === 0) {
            console.error(`%c[VEND-ERR] GetEticket | PDF Empty!`, 'color: #ff0000');
            return res.status(404).send("File tiket kosong dari server pusat.");
        }

        res.contentType("application/pdf");
        res.send(response.data);

    } catch (error) {
        // 3. Log Error secara detail
        console.error(`%c[VEND-ERR] GetEticket | Error: ${error.message}`, 'color: #ff0000');

        // Jika error dari axios, log detail response-nya (jika bukan binary)
        if (error.response && error.response.data) {
            try {
                const errData = JSON.parse(Buffer.from(error.response.data).toString());
                console.error("Detail Error Vendor:", errData);
            } catch (e) {
                console.error("Gagal parse error vendor (Kemungkinan data tetap binary)");
            }
        }

        res.status(500).send("Gagal mengambil tiket");
    }
});

module.exports = router;