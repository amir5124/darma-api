const db = require('../config/db');
const { generatePelniTicketPDF, generateBookingInvoiceHTML } = require('../utils/pelniTicketGenerator');
const nodemailer = require('nodemailer');


// ─── Mailer Setup ──────────────────────────────────────────────
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
            to,
            subject,
            html,
            attachments,
        });
        console.log(`[Mail] ✅ Terkirim ke: ${to}`);
    } catch (err) {
        console.error(`[Mail] ❌ Gagal kirim ke ${to}:`, err.message);
        // Non-blocking — jangan throw, agar tidak ganggu flow utama
    }
};

// ─── Helper: Simpan Log API ke logs_pelni ──────────────────────
const saveLog = async (conn, { bookingId, numCode, stage, response }) => {
    try {
        await conn.execute(
            `INSERT INTO logs_pelni (booking_id, num_code, api_stage, raw_response)
             VALUES (?, ?, ?, ?)`,
            [bookingId || null, numCode || null, stage, JSON.stringify(response)]
        );
    } catch (err) {
        console.error(`[Log] ❌ Gagal simpan log stage ${stage}:`, err.message);
    }
};

// ─── Helper: Format tanggal ISO → MySQL DATETIME ──────────────
const toMySQL = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

const shipController = {

    /**
     * POST /api/ship/save-booking
     *
     * Dipanggil dari frontend setelah semua step API (availability → get-room → booking → issued) selesai.
     * Body berisi akumulasi response dari semua step + data user + biaya layanan.
     *
     * Body yang diharapkan:
     * {
     *   scheduleData,       // response /schedule (untuk originName, destinationName, dll)
     *   availabilityData,   // response /availability (numCode awal)
     *   getRoomData,        // response /get-room    (rooms, ticketPrice, numCode final)
     *   bookingData,        // response /booking     (paxBookingDetails, numCode, dll)
     *   issuedData,         // response /issued      (bookingNumber, bookingStatus)
     *   bookingDetailData,  // response /booking-detail (data lengkap final)
     *   userEmail,          // email user untuk kirim invoice/etiket
     *   userName,           // nama user
     *   serviceFee,         // biaya layanan app (number)
     *   totalAmount,        // total yang dibayar user
     * }
     */
    saveShipBooking: async (req, res) => {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const {
                scheduleData,
                availabilityData,
                getRoomData,
                bookingData,
                issuedData,
                bookingDetailData,
                userEmail,
                userName,
                serviceFee = 0,
                totalAmount,
            } = req.body;

            // Prioritaskan bookingDetailData karena paling lengkap (post-issued)
            const detail = bookingDetailData || {};
            const booking = bookingData || {};
            const getRoomRes = getRoomData || {};
            const issued = issuedData || {};

            // Nilai-nilai utama
            const numCode = detail.numCode || booking.numCode || getRoomRes.numCode || null;
            const bookingNumber = detail.bokingNumber || issued.bookingNumber || null;
            const ticketStatus = detail.ticketStatus || issued.bookingStatus || 'Pending';
            const ticketPrice = detail.ticketPrice || getRoomRes.ticketPrice || booking.ticketPrice || 0;
            const salesPrice = detail.salesPrice || booking.salesPrice || null;
            const shipMarkup = detail.shipMarkup || booking.shipMarkup || 0;
            const shipNumber = detail.shipNumber || booking.shipNumber || null;
            const shipName = detail.shipName || booking.shipName || null;
            const originPort = detail.originPort || booking.originPort || null;
            const destPort = detail.destinationPort || booking.destinationPort || null;
            const originName = detail.originName || scheduleData?.originName || null;
            const destName = detail.destinationName || scheduleData?.destinationName || null;
            const departDT = detail.departDateTime || booking.departDate || null;
            const arrivalDT = detail.arrivalDateTime || null;
            const bookingDT = detail.bookingDateTime || booking.bookingDateTime || null;
            const issuedDT = detail.issuedDateTime || null;
            const issuedLimit = detail.issuedDateTimeLimit || booking.issuedDateTimeLimit || null;
            const totalTicket = detail.totalTicket || (booking.paxBookingDetails || []).length || 1;
            const finalTotal = totalAmount ?? (Number(ticketPrice) + Number(serviceFee));

            if (!numCode) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'numCode tidak ditemukan di payload.' });
            }

            // ── 1. UPSERT ke bookings_pelni ──────────────────────────
            const [existing] = await connection.execute(
                'SELECT id FROM bookings_pelni WHERE num_code = ?',
                [numCode]
            );

            let bookingId;

            if (existing.length > 0) {
                // Update jika sudah ada (misalnya dipanggil ulang setelah issued)
                bookingId = existing[0].id;
                await connection.execute(
                    `UPDATE bookings_pelni SET
                        booking_number   = ?,
                        ship_name        = ?,
                        origin_name      = ?,
                        destination_name = ?,
                        arrival_date_time = ?,
                        sales_price      = ?,
                        base_ticket_price = ?,
                        service_fee      = ?,
                        total_amount     = ?,
                        ticket_status    = ?,
                        issued_date_time = ?,
                        time_limit       = ?,
                        updated_at       = NOW()
                     WHERE id = ?`,
                    [
                        bookingNumber,
                        shipName,
                        originName,
                        destName,
                        toMySQL(arrivalDT),
                        salesPrice,
                        ticketPrice,
                        serviceFee,
                        finalTotal,
                        ticketStatus,
                        toMySQL(issuedDT),
                        toMySQL(issuedLimit),
                        bookingId,
                    ]
                );
                console.log(`[Ship] ♻️  Updated booking ID ${bookingId} (${numCode})`);
            } else {
                // Insert baru
                const [insertRes] = await connection.execute(
                    `INSERT INTO bookings_pelni (
                        num_code, booking_number, user_id,
                        ship_number, ship_name,
                        origin_port, origin_name,
                        destination_port, destination_name,
                        depart_date_time, arrival_date_time,
                        base_ticket_price, service_fee, sales_price,
                        total_amount, ticket_status,
                        issued_date_time, time_limit
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        numCode,
                        bookingNumber,
                        req.body.userId || null,   // ID user lokal (opsional)
                        shipNumber,
                        shipName,
                        originPort,
                        originName,
                        destPort,
                        destName,
                        toMySQL(departDT),
                        toMySQL(arrivalDT),
                        ticketPrice,
                        serviceFee,
                        salesPrice,
                        finalTotal,
                        ticketStatus,
                        toMySQL(issuedDT),
                        toMySQL(issuedLimit),
                    ]
                );
                bookingId = insertRes.insertId;
                console.log(`[Ship] ✅ Inserted booking ID ${bookingId} (${numCode})`);
            }

            // ── 2. UPSERT passengers_pelni ────────────────────────────
            const paxList = detail.paxBookingDetails || booking.paxBookingDetails || [];

            for (const p of paxList) {
                const [existPax] = await connection.execute(
                    'SELECT id FROM passengers_pelni WHERE booking_id = ? AND id_number = ?',
                    [bookingId, p.ID || '']
                );

                const birthDate = p.birthDate
                    ? new Date(p.birthDate).toISOString().slice(0, 10)
                    : null;

                if (existPax.length > 0) {
                    // Update data tiket setelah issued (ticketNumber, ticketQRCode)
                    await connection.execute(
                        `UPDATE passengers_pelni SET
                            ticket_number  = ?,
                            ticket_qr_code = ?,
                            deck           = ?,
                            cabin          = ?,
                            bed            = ?,
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
                            p.paxGender === 'M' || p.paxGender === 0 ? 'M' : 'F',
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

            // ── 3. Simpan LOG semua stage yang dikirim ────────────────
            const stages = {
                AVAILABILITY: availabilityData,
                GET_ROOM: getRoomData,
                BOOKING: bookingData,
                ISSUED: issuedData,
                BOOKING_DETAIL: bookingDetailData,
            };

            for (const [stage, data] of Object.entries(stages)) {
                if (data) await saveLog(connection, { bookingId, numCode, stage, response: data });
            }

            await connection.commit();

            // ── 4. KIRIM EMAIL sesuai status ──────────────────────────
            const emailTarget = userEmail || req.body.ticketBuyerEmail || null;

            if (emailTarget) {
                const [savedPassengers] = await connection.execute(
                    'SELECT * FROM passengers_pelni WHERE booking_id = ?',
                    [bookingId]
                );

                const savedBookingRow = {
                    num_code: numCode,
                    booking_number: bookingNumber,
                    ship_number: shipNumber,
                    ship_name: shipName,
                    origin_name: originName,
                    destination_name: destName,
                    depart_date_time: departDT,
                    arrival_date_time: arrivalDT,
                    base_ticket_price: ticketPrice,
                };

                const isTicketed = ticketStatus === 'Ticketed'
                    || ticketStatus === 'SUCCESS'
                    || ticketStatus?.toLowerCase() === 'ticketed';

                if (isTicketed) {
                    // ── Kirim E-TIKET PDF ──
                    console.log(`[Mail] 🎫 Generating e-tiket PDF untuk ${emailTarget}...`);
                    try {
                        const pdfBuffer = await generatePelniTicketPDF(
                            {
                                ...detail,
                                // Pastikan field yang mungkin null dari API diisi dari DB
                                shipName: shipName,
                                originName: originName,
                                destinationName: destName,
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
                            serviceFee,
                            finalTotal
                        );

                        await sendEmail({
                            to: emailTarget,
                            subject: `🎫 E-Tiket Kapal Pelni — ${bookingNumber || numCode}`,
                            html: `
                                <p>Halo ${userName || 'Penumpang'},</p>
                                <p>Tiket Anda telah diterbitkan! Silakan cek lampiran PDF untuk e-tiket resmi Anda.</p>
                                <p>
                                    <b>Kapal:</b> ${shipName}<br/>
                                    <b>Rute:</b> ${originName} → ${destName}<br/>
                                    <b>Berangkat:</b> ${departDT ? new Date(departDT).toLocaleString('id-ID') : '-'}<br/>
                                    <b>Kode Booking:</b> <span style="font-size:20px;font-weight:bold;letter-spacing:3px;">${bookingNumber}</span>
                                </p>
                                <p style="color:#888;font-size:12px;">
                                    Harap tiba di terminal minimal 2 jam sebelum keberangkatan dan bawa identitas asli.
                                </p>`,
                            attachments: [
                                {
                                    filename: `etiket-pelni-${bookingNumber || numCode}.pdf`,
                                    content: pdfBuffer,
                                    contentType: 'application/pdf',
                                },
                            ],
                        });
                    } catch (pdfErr) {
                        console.error('[Mail] ❌ Gagal generate/kirim PDF:', pdfErr.message);
                    }
                } else {
                    // ── Kirim Invoice Booking (sebelum issued) ──
                    console.log(`[Mail] 📄 Mengirim invoice booking ke ${emailTarget}...`);
                    const invoiceHTML = generateBookingInvoiceHTML(
                        savedBookingRow,
                        savedPassengers,
                        serviceFee,
                        finalTotal
                    );

                    await sendEmail({
                        to: emailTarget,
                        subject: `📋 Konfirmasi Pemesanan Kapal Pelni — ${bookingNumber || numCode}`,
                        html: invoiceHTML,
                    });
                }
            }

            return res.json({
                success: true,
                message: 'Data booking berhasil disimpan.',
                booking_id: bookingId,
                num_code: numCode,
                booking_number: bookingNumber,
                ticket_status: ticketStatus,
            });

        } catch (err) {
            await connection.rollback();
            console.error('[Ship] ❌ saveShipBooking Error:', err.message, err.stack);
            return res.status(500).json({ success: false, message: err.message });
        } finally {
            connection.release();
        }
    },

    /**
     * GET /api/ship/history/:username
     * Ambil riwayat pesanan kapal berdasarkan user (bisa pakai user_id atau email)
     */
    getShipHistory: async (req, res) => {
        const { username } = req.params;
        const connection = await db.getConnection();

        try {
            // Ambil semua booking milik user + jumlah penumpang per booking
            const [bookings] = await connection.execute(
                `SELECT
                    b.id,
                    b.num_code,
                    b.booking_number,
                    b.ship_number,
                    b.ship_name,
                    b.origin_name,
                    b.destination_name,
                    b.depart_date_time,
                    b.arrival_date_time,
                    b.base_ticket_price,
                    b.service_fee,
                    b.total_amount,
                    b.ticket_status,
                    b.issued_date_time,
                    b.time_limit,
                    b.created_at,
                    COUNT(p.id) AS total_passengers
                 FROM bookings_pelni b
                 LEFT JOIN passengers_pelni p ON p.booking_id = b.id
                 WHERE b.user_id = ?
                 GROUP BY b.id
                 ORDER BY b.created_at DESC`,
                [username]
            );

            // Untuk setiap booking, ambil juga daftar penumpangnya
            const result = await Promise.all(
                bookings.map(async (b) => {
                    const [passengers] = await connection.execute(
                        `SELECT
                            pax_name, pax_type, pax_gender,
                            id_number, deck, cabin, bed,
                            ticket_number, fare_individual
                         FROM passengers_pelni
                         WHERE booking_id = ?`,
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
     * Kirim ulang e-tiket ke email (berguna jika user minta kirim ulang)
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

            if (b.ticket_status !== 'Ticketed') {
                return res.status(400).json({
                    success: false,
                    message: `Tiket belum diterbitkan. Status saat ini: ${b.ticket_status}`
                });
            }

            const [passengers] = await connection.execute(
                'SELECT * FROM passengers_pelni WHERE booking_id = ?',
                [b.id]
            );

            // Ambil log booking-detail untuk data lengkap
            const [logs] = await connection.execute(
                `SELECT raw_response FROM logs_pelni
                 WHERE booking_id = ? AND api_stage = 'BOOKING_DETAIL'
                 ORDER BY created_at DESC LIMIT 1`,
                [b.id]
            );

            const detailData = logs.length > 0
                ? (typeof logs[0].raw_response === 'string'
                    ? JSON.parse(logs[0].raw_response)
                    : logs[0].raw_response)
                : {};

            const pdfBuffer = await generatePelniTicketPDF(
                {
                    ...detailData,
                    shipName: b.ship_name,
                    originName: b.origin_name,
                    destinationName: b.destination_name,
                    bokingNumber: b.booking_number,
                    numCode: b.num_code,
                    ticketPrice: b.base_ticket_price,
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
                b.service_fee,
                b.total_amount
            );

            await sendEmail({
                to: email,
                subject: `🎫 [Kirim Ulang] E-Tiket Kapal Pelni — ${b.booking_number}`,
                html: `<p>Berikut adalah e-tiket Anda untuk perjalanan <b>${b.origin_name} → ${b.destination_name}</b> dengan kapal <b>${b.ship_name}</b>.</p>`,
                attachments: [
                    {
                        filename: `etiket-pelni-${b.booking_number}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf',
                    },
                ],
            });

            return res.json({ success: true, message: `E-tiket berhasil dikirim ulang ke ${email}` });

        } catch (err) {
            console.error('[Ship] ❌ resendTicket Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        } finally {
            connection.release();
        }
    },
};

module.exports = shipController;