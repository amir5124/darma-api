const db = require('../config/db');
const { generatePelniTicketPDF, generateBookingInvoiceHTML } = require('../utils/pelniTicketGenerator');
const nodemailer = require('nodemailer');

// ─── Mapping kolom DB yang BENAR (sesuai SHOW COLUMNS) ─────────
// bookings_pelni:
//   id, booking_code, reference_no, payment_reff, payment_method,
//   payment_status, va_number, qris_url, admin_fee, num_code,
//   ship_number, ship_name, origin_port, origin_name,
//   destination_port, destination_name, depart_date, arrival_date,
//   ticket_status, total_price, sales_price, time_limit,
//   user_id, pengguna, customer_email, payload_request, raw_response, created_at
//
// passengers_pelni: (tidak berubah, sudah benar)
// logs_pelni:       (tidak berubah, sudah benar)
// ───────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT || '465'),
    secure: true,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
    try {
        await transporter.sendMail({
            from: `"Tiket Kapal Pelni" <${process.env.MAIL_USER}>`,
            to, subject, html, attachments,
        });
        console.log(`[Mail] ✅ Terkirim ke: ${to}`);
    } catch (err) {
        console.error(`[Mail] ❌ Gagal kirim ke ${to}:`, err.message);
    }
};

const saveLog = async (conn, { bookingId, numCode, stage, response }) => {
    try {
        await conn.execute(
            `INSERT INTO logs_pelni (booking_id, num_code, api_stage, raw_response)
             VALUES (?, ?, ?, ?)`,
            [bookingId || null, numCode || null, stage, JSON.stringify(response)]
        );
    } catch (err) {
        console.error(`[Log] ❌ Gagal simpan log ${stage}:`, err.message);
    }
};

// ISO string → MySQL DATETIME string, null-safe
const toMySQL = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
};

const shipController = {

    /**
     * POST /api/ship/save-booking
     *
     * Kolom DB yang dipakai (sesuai SHOW COLUMNS):
     *  bookings_pelni → booking_code, num_code, ship_number, ship_name,
     *                   origin_port, origin_name, destination_port, destination_name,
     *                   depart_date, arrival_date, ticket_status, total_price,
     *                   sales_price, time_limit, user_id, pengguna,
     *                   customer_email, payload_request, raw_response
     */
    saveShipBooking: async (req, res) => {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const {
                scheduleData = {},
                availabilityData = {},
                getRoomData = {},
                bookingData = {},
                issuedData = {},
                bookingDetailData = {},
                userEmail,
                userName,
                userId,
                serviceFee = 0,
                totalAmount,
            } = req.body;

            // ── Resolve nilai dari berbagai sumber response ──────────
            const detail = bookingDetailData || {};
            const booking = bookingData || {};
            const issued = issuedData || {};
            const room = getRoomData || {};

            // booking_code  ← bokingNumber (dari booking-detail) atau bookingNumber (dari issued)
            const bookingCode = detail.bokingNumber
                || issued.bookingNumber
                || booking.bookingNumber
                || null;

            // num_code ← numCode dari get-room (paling awal) atau booking/detail
            const numCode = detail.numCode
                || booking.numCode
                || room.numCode
                || null;

            const ticketStatus = detail.ticketStatus
                || issued.bookingStatus
                || 'Pending';

            const ticketPrice = Number(detail.ticketPrice || room.ticketPrice || booking.ticketPrice || 0);
            const salesPrice = Number(detail.salesPrice || booking.salesPrice || 0) || null;
            const shipNumber = detail.shipNumber || booking.shipNumber || null;
            const shipName = detail.shipName || booking.shipName || null;
            const originPort = detail.originPort || booking.originPort || null;
            const destPort = detail.destinationPort || booking.destinationPort || null;
            const originName = detail.originName || scheduleData.originName || null;
            const destName = detail.destinationName || scheduleData.destinationName || null;
            const departDT = detail.departDateTime || booking.departDate || null;
            const arrivalDT = detail.arrivalDateTime || null;
            const issuedLimit = detail.issuedDateTimeLimit || booking.issuedDateTimeLimit || null;
            const finalTotal = Number(totalAmount ?? (ticketPrice + Number(serviceFee)));

            if (!numCode) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'numCode tidak ditemukan di payload.' });
            }

            console.log(`[Ship] 📥 save-booking → numCode: ${numCode}, bookingCode: ${bookingCode}, status: ${ticketStatus}`);

            // ── 1. UPSERT bookings_pelni ─────────────────────────────
            const [existing] = await connection.execute(
                'SELECT id FROM bookings_pelni WHERE num_code = ?',
                [numCode]
            );

            let bookingId;

            if (existing.length > 0) {
                bookingId = existing[0].id;

                // UPDATE — kolom sesuai SHOW COLUMNS
                await connection.execute(
                    `UPDATE bookings_pelni SET
                        booking_code      = COALESCE(?, booking_code),
                        ship_name         = COALESCE(?, ship_name),
                        origin_name       = COALESCE(?, origin_name),
                        destination_name  = COALESCE(?, destination_name),
                        arrival_date      = COALESCE(?, arrival_date),
                        sales_price       = COALESCE(?, sales_price),
                        total_price       = ?,
                        ticket_status     = ?,
                        time_limit        = COALESCE(?, time_limit),
                        raw_response      = ?
                     WHERE id = ?`,
                    [
                        bookingCode,
                        shipName,
                        originName,
                        destName,
                        toMySQL(arrivalDT),
                        salesPrice,
                        finalTotal,
                        ticketStatus,
                        toMySQL(issuedLimit),
                        JSON.stringify(detail),
                        bookingId,
                    ]
                );
                console.log(`[Ship] ♻️  Updated bookings_pelni ID ${bookingId}`);

            } else {
                // INSERT — kolom sesuai SHOW COLUMNS
                const [insertRes] = await connection.execute(
                    `INSERT INTO bookings_pelni (
                        booking_code, num_code, user_id, pengguna, customer_email,
                        ship_number, ship_name,
                        origin_port, origin_name,
                        destination_port, destination_name,
                        depart_date, arrival_date,
                        total_price, sales_price,
                        ticket_status, time_limit,
                        payload_request, raw_response
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingCode,
                        numCode,
                        userId || null,
                        userName || null,
                        userEmail || null,
                        shipNumber,
                        shipName,
                        originPort,
                        originName,
                        destPort,
                        destName,
                        toMySQL(departDT),
                        toMySQL(arrivalDT),
                        finalTotal,
                        salesPrice,
                        ticketStatus,
                        toMySQL(issuedLimit),
                        JSON.stringify(req.body),   // payload_request: simpan seluruh body untuk audit
                        JSON.stringify(detail),     // raw_response: response booking-detail
                    ]
                );
                bookingId = insertRes.insertId;
                console.log(`[Ship] ✅ Inserted bookings_pelni ID ${bookingId}`);
            }

            // ── 2. UPSERT passengers_pelni ────────────────────────────
            const paxList = detail.paxBookingDetails
                || booking.paxBookingDetails
                || [];

            for (const p of paxList) {
                const [existPax] = await connection.execute(
                    'SELECT id FROM passengers_pelni WHERE booking_id = ? AND id_number = ?',
                    [bookingId, p.ID || '']
                );

                const birthDate = p.birthDate
                    ? new Date(p.birthDate).toISOString().slice(0, 10)
                    : null;

                if (existPax.length > 0) {
                    await connection.execute(
                        `UPDATE passengers_pelni SET
                            ticket_number   = COALESCE(?, ticket_number),
                            ticket_qr_code  = COALESCE(?, ticket_qr_code),
                            deck            = COALESCE(?, deck),
                            cabin           = COALESCE(?, cabin),
                            bed             = COALESCE(?, bed),
                            fare_individual = ?
                         WHERE id = ?`,
                        [
                            p.ticketNumber || null,
                            p.ticketQRCode || null,
                            p.deck || null,
                            p.cabin || null,
                            p.bed || null,
                            p.fare || 0,
                            existPax[0].id,
                        ]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO passengers_pelni (
                            booking_id, pax_name, pax_type, pax_gender,
                            id_number, phone, birth_date,
                            deck, cabin, bed,
                            ticket_number, ticket_qr_code, fare_individual
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            bookingId,
                            p.paxName || '',
                            p.paxType || 'Adult',
                            (p.paxGender === 'M' || p.paxGender === 0) ? 'M' : 'F',
                            p.ID || '',
                            p.phone || null,
                            birthDate,
                            p.deck || null,
                            p.cabin || null,
                            p.bed || null,
                            p.ticketNumber || null,
                            p.ticketQRCode || null,
                            p.fare || 0,
                        ]
                    );
                }
            }

            // ── 3. Simpan log semua stage ─────────────────────────────
            const stages = {
                AVAILABILITY: req.body.availabilityData,
                GET_ROOM: req.body.getRoomData,
                BOOKING: req.body.bookingData,
                ISSUED: req.body.issuedData,
                BOOKING_DETAIL: req.body.bookingDetailData,
            };
            for (const [stage, data] of Object.entries(stages)) {
                if (data) await saveLog(connection, { bookingId, numCode, stage, response: data });
            }

            await connection.commit();

            // ── 4. Kirim email (non-blocking) ─────────────────────────
            const emailTarget = userEmail || null;
            if (emailTarget) {
                const [savedPassengers] = await connection.execute(
                    'SELECT * FROM passengers_pelni WHERE booking_id = ?',
                    [bookingId]
                );

                const savedBookingRow = {
                    num_code: numCode,
                    booking_number: bookingCode,   // untuk template email (field JS, bukan DB)
                    ship_number: shipNumber,
                    ship_name: shipName,
                    origin_name: originName,
                    destination_name: destName,
                    depart_date_time: departDT,
                    arrival_date_time: arrivalDT,
                    base_ticket_price: ticketPrice,
                };

                const isTicketed = ['ticketed', 'success', 'settled']
                    .includes((ticketStatus || '').toLowerCase());

                if (isTicketed) {
                    // Kirim E-TIKET PDF
                    console.log(`[Mail] 🎫 Generate PDF untuk ${emailTarget}...`);
                    try {
                        const pdfBuffer = await generatePelniTicketPDF(
                            {
                                ...detail,
                                shipName,
                                originName,
                                destinationName: destName,
                                bokingNumber: bookingCode,
                                numCode,
                                ticketPrice,
                                ticketStatus,
                                paxBookingDetails: savedPassengers.map(p => ({
                                    paxName: p.pax_name,
                                    paxType: p.pax_type,
                                    paxGender: p.pax_gender,
                                    ID: p.id_number,
                                    deck: p.deck,
                                    cabin: p.cabin,
                                    bed: p.bed,
                                    fare: p.fare_individual,
                                    ticketNumber: p.ticket_number,
                                    ticketQRCode: p.ticket_qr_code,
                                    pax_note: p.pax_note || null,
                                })),
                            },
                            Number(serviceFee),
                            finalTotal
                        );

                        await sendEmail({
                            to: emailTarget,
                            subject: `🎫 E-Tiket Kapal Pelni — ${bookingCode || numCode}`,
                            html: `
                                <p>Halo ${userName || 'Penumpang'},</p>
                                <p>Tiket Anda telah diterbitkan! Lihat lampiran PDF untuk e-tiket resmi.</p>
                                <p>
                                    <b>Kapal:</b> ${shipName}<br/>
                                    <b>Rute:</b> ${originName} → ${destName}<br/>
                                    <b>Kode Booking:</b>
                                    <span style="font-size:20px;font-weight:bold;letter-spacing:3px;">
                                        ${bookingCode}
                                    </span>
                                </p>
                                <p style="color:#888;font-size:12px;">
                                    Hadir di terminal minimal 2 jam sebelum keberangkatan. Bawa identitas asli.
                                </p>`,
                            attachments: [{
                                filename: `etiket-pelni-${bookingCode || numCode}.pdf`,
                                content: pdfBuffer,
                                contentType: 'application/pdf',
                            }],
                        });
                    } catch (pdfErr) {
                        console.error('[Mail] ❌ PDF error:', pdfErr.message);
                    }
                } else {
                    // Kirim Invoice Booking (sebelum issued)
                    console.log(`[Mail] 📄 Invoice booking ke ${emailTarget}...`);
                    const invoiceHTML = generateBookingInvoiceHTML(
                        savedBookingRow,
                        savedPassengers,
                        Number(serviceFee),
                        finalTotal
                    );
                    await sendEmail({
                        to: emailTarget,
                        subject: `📋 Konfirmasi Pemesanan Kapal Pelni — ${bookingCode || numCode}`,
                        html: invoiceHTML,
                    });
                }
            }

            return res.json({
                success: true,
                message: 'Data booking berhasil disimpan.',
                booking_id: bookingId,
                num_code: numCode,
                booking_code: bookingCode,
                ticket_status: ticketStatus,
            });

        } catch (err) {
            await connection.rollback();
            console.error('[Ship] ❌ saveShipBooking Error:', err.message);
            console.error(err.stack);
            return res.status(500).json({ success: false, message: err.message });
        } finally {
            connection.release();
        }
    },

    /**
     * GET /api/ship/history/:userId
     */
    getShipHistory: async (req, res) => {
        const { username } = req.params;
        const connection = await db.getConnection();
        try {
            const [bookings] = await connection.execute(
                `SELECT
                    b.id,
                    b.booking_code,
                    b.num_code,
                    b.ship_number,
                    b.ship_name,
                    b.origin_name,
                    b.destination_name,
                    b.depart_date,
                    b.arrival_date,
                    b.total_price,
                    b.sales_price,
                    b.ticket_status,
                    b.time_limit,
                    b.pengguna,
                    b.customer_email,
                    b.created_at,
                    COUNT(p.id) AS total_passengers
                 FROM bookings_pelni b
                 LEFT JOIN passengers_pelni p ON p.booking_id = b.id
                 WHERE b.user_id = ?
                 GROUP BY b.id
                 ORDER BY b.created_at DESC`,
                [username]
            );

            const result = await Promise.all(
                bookings.map(async (b) => {
                    const [passengers] = await connection.execute(
                        `SELECT pax_name, pax_type, pax_gender, id_number,
                                deck, cabin, bed, ticket_number, fare_individual
                         FROM passengers_pelni WHERE booking_id = ?`,
                        [b.id]
                    );
                    return { ...b, passengers };
                })
            );

            return res.json({ success: true, data: result });
        } catch (err) {
            console.error('[Ship] ❌ getShipHistory Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        } finally {
            connection.release();
        }
    },

    /**
     * POST /api/ship/resend-ticket
     */
    resendTicket: async (req, res) => {
        const { numCode, email } = req.body;
        if (!numCode || !email) {
            return res.status(400).json({ success: false, message: 'numCode dan email wajib diisi.' });
        }

        const connection = await db.getConnection();
        try {
            const [bookings] = await connection.execute(
                'SELECT * FROM bookings_pelni WHERE num_code = ?',
                [numCode]
            );
            if (bookings.length === 0) {
                return res.status(404).json({ success: false, message: 'Booking tidak ditemukan.' });
            }

            const b = bookings[0];

            if ((b.ticket_status || '').toLowerCase() !== 'ticketed') {
                return res.status(400).json({
                    success: false,
                    message: `Tiket belum diterbitkan. Status: ${b.ticket_status}`
                });
            }

            const [passengers] = await connection.execute(
                'SELECT * FROM passengers_pelni WHERE booking_id = ?',
                [b.id]
            );

            // Ambil raw_response (booking-detail) yang tersimpan di tabel
            const detailData = b.raw_response
                ? (typeof b.raw_response === 'string' ? JSON.parse(b.raw_response) : b.raw_response)
                : {};

            const pdfBuffer = await generatePelniTicketPDF(
                {
                    ...detailData,
                    shipName: b.ship_name,
                    originName: b.origin_name,
                    destinationName: b.destination_name,
                    bokingNumber: b.booking_code,   // ← kolom DB yang benar
                    numCode: b.num_code,
                    ticketPrice: b.total_price,
                    ticketStatus: b.ticket_status,
                    paxBookingDetails: passengers.map(p => ({
                        paxName: p.pax_name,
                        paxType: p.pax_type,
                        paxGender: p.pax_gender,
                        ID: p.id_number,
                        deck: p.deck,
                        cabin: p.cabin,
                        bed: p.bed,
                        fare: p.fare_individual,
                        ticketNumber: p.ticket_number,
                        ticketQRCode: p.ticket_qr_code,
                    })),
                },
                0,          // serviceFee tidak tersimpan terpisah di tabel ini
                b.total_price
            );

            await sendEmail({
                to: email,
                subject: `🎫 [Kirim Ulang] E-Tiket Kapal Pelni — ${b.booking_code}`,
                html: `<p>Berikut e-tiket Anda: <b>${b.origin_name} → ${b.destination_name}</b> dengan <b>${b.ship_name}</b>.</p>`,
                attachments: [{
                    filename: `etiket-pelni-${b.booking_code}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }],
            });

            return res.json({ success: true, message: `E-tiket dikirim ulang ke ${email}` });

        } catch (err) {
            console.error('[Ship] ❌ resendTicket Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        } finally {
            connection.release();
        }
    },
};

module.exports = shipController;