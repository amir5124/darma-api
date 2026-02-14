const db = require('../config/db'); // Sesuaikan path jika db.js ada di folder root atau config
 const { sendBookingEmail } = require('../utils/mailer'); 
/**
 * Mendapatkan riwayat booking berdasarkan username (pengguna)
 */
exports.getMyBookings = async (req, res) => {
    const { username } = req.params;
    try {
        const [rows] = await db.execute(
            `SELECT b.*, 
             (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.id) as total_pax
             FROM bookings b 
             WHERE b.pengguna = ? 
             ORDER BY b.created_at DESC`,
            [username]
        );
        res.json({ status: 'SUCCESS', data: rows });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

exports.getBookingPengguna = async (req, res) => {
    const { username } = req.params;

    if (!username || username === 'undefined' || username === 'null' || username === '{username}') {
        return res.status(200).json({
            status: 'SUCCESS', results: 0, data: [], message: 'Username tidak valid'
        });
    }

    try {
        const query = `
            SELECT 
                b.id AS booking_id, b.booking_code, b.booking_code AS bookingCodeAirline,
                b.reference_no, b.airline_name, UPPER(b.ticket_status) AS ticket_status,
                b.total_price, b.sales_price, b.time_limit, b.depart_date,
                b.origin AS origin_code, b.destination AS destination_code,
                b.origin_port, b.destination_port, -- Kolom nama lengkap baru
                b.access_token AS accessToken, b.payload_request,
                i.flight_number, i.origin, i.destination, i.depart_time, i.arrival_time, i.flight_class,
                p.first_name AS main_pax_first, p.last_name AS main_pax_last,
                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax
            FROM bookings b
            LEFT JOIN flight_itinerary i ON b.id = i.booking_id
            LEFT JOIN passengers p ON b.id = p.booking_id AND p.id = (
                SELECT MIN(id) FROM passengers WHERE booking_id = b.id
            )
            WHERE b.pengguna = ? 
            ORDER BY b.created_at DESC
        `;

        const [rows] = await db.execute(query, [username]);

        const historyData = rows.map(item => {
            const now = new Date();
            const limit = item.time_limit ? new Date(item.time_limit) : null;

            const formatTime = (dateStr) => {
                if (!dateStr) return '--:--';
                const d = new Date(dateStr);
                return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
            };

            const status = item.ticket_status ? item.ticket_status.toUpperCase() : "BOOKED";
            const isTicketed = status === 'TICKETED';
            const isExpired = !isTicketed && limit ? now > limit : false;

            return {
                ...item,
                // Logika tampilan: Utamakan nama lengkap (port), fallback ke kode (SUB/CGK)
                origin: item.origin_port || item.origin || item.origin_code,
                destination: item.destination_port || item.destination || item.destination_code,
                ticket_status: status,
                isExpired: isExpired,
                canPay: !isTicketed && !isExpired,
                jam_berangkat: formatTime(item.depart_time),
                jam_tiba: formatTime(item.arrival_time),
                formattedLimit: limit ? limit.toLocaleString('id-ID', {
                    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : 'N/A'
            };
        });

        res.status(200).json({ status: 'SUCCESS', results: historyData.length, data: historyData });
    } catch (error) {
        console.error("❌ Error GetBookingPengguna:", error);
        res.status(500).json({ status: 'ERROR', message: 'Gagal memuat data' });
    }
};


exports.saveBooking = async (req, res) => {
    const { payload, response, username } = req.body;

    // 1. Validasi awal: Jangan biarkan proses lanjut jika data dari vendor gagal
    if (!response || response.status !== "SUCCESS") {
        return res.status(400).json({ 
            status: "ERROR", 
            message: "Gagal menyimpan: Response dari vendor tidak sukses." 
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const finalTotalPrice = response.ticketPrice || response.totalPrice || payload.totalPrice || 0;
        const finalSalesPrice = response.salesPrice || 0;

        // 2. Insert Table Bookings
        const [resBooking] = await connection.execute(
            `INSERT INTO bookings (
                booking_code, reference_no, airline_id, airline_name, 
                trip_type, origin, destination, origin_port, destination_port,
                depart_date, ticket_status, total_price, sales_price, time_limit, 
                user_id, pengguna, access_token, payload_request, raw_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bookingCode,
                response.referenceNo,
                payload.airlineID,
                payload.airlineName || payload.airlineID,
                payload.tripType || "OneWay",
                payload.origin,
                payload.destination,
                response.origin || null,
                response.destination || null,
                payload.departDate ? payload.departDate.replace('T', ' ').replace('Z', '').split('.')[0] : null,
                response.ticketStatus || "HOLD",
                finalTotalPrice,
                finalSalesPrice,
                response.timeLimit,
                response.userID,
                username || 'Guest',
                payload.accessToken,
                JSON.stringify(payload),
                JSON.stringify(response)
            ]
        );

        const bookingId = resBooking.insertId;

        // 3. Simpan Data Penumpang
        if (payload.paxDetails && payload.paxDetails.length > 0) {
            for (const p of payload.paxDetails) {
                const [resPax] = await connection.execute(
                    `INSERT INTO passengers (booking_id, title, first_name, last_name, pax_type, phone, id_number, birth_date, pengguna) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId, 
                        (p.title || 'MR').toUpperCase(), 
                        (p.firstName || '').toUpperCase(), 
                        (p.lastName || p.firstName || '').toUpperCase(),
                        p.type === 0 ? 'Adult' : (p.type === 1 ? 'Child' : 'Infant'),
                        (payload.contactCountryCodePhone || "") + (payload.contactRemainingPhoneNo || ""),
                        p.idNumber || p.IDNumber || "", 
                        p.birthDate ? p.birthDate.split('T')[0] : '1900-01-01', 
                        username || 'Guest'
                    ]
                );

                const paxId = resPax.insertId;
                
                // Add-ons (Bagasi/Kursi)
                if (p.addOns && p.addOns.length > 0) {
                    for (const ad of p.addOns) {
                        await connection.execute(
                            `INSERT INTO passenger_addons (passenger_id, segment_idx, baggage_code, seat_number, meals_json, pengguna) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [paxId, 0, ad.baggageString || ad.baggageCode || "", ad.seat || "", JSON.stringify(ad.meals || []), username || 'Guest']
                        );
                    }
                }
            }
        }

        // 4. Simpan Itinerary Penerbangan
        if (response.flightDeparts && response.flightDeparts.length > 0) {
            for (const f of response.flightDeparts) {
                const cleanDate = (dateStr) => {
                    if (!dateStr) return null;
                    return dateStr.replace('T', ' ').replace('Z', '').split('.')[0];
                };

                await connection.execute(
                    `INSERT INTO flight_itinerary (
                        booking_id, category, flight_number, origin, 
                        destination, depart_time, arrival_time, flight_class, pengguna
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId, 'Departure', f.flightNumber, f.fdOrigin, f.fdDestination,
                        cleanDate(f.fdDepartTime), cleanDate(f.fdArrivalTime),
                        f.fdFlightClass, username || null
                    ]
                );
            }
        }

        // 5. Commit Transaksi
        await connection.commit();
        
        console.log(`✅ Berhasil Simpan ke Database. ID: ${bookingId}`);

        // --- 6. PROSES KIRIM EMAIL KONFIRMASI ---
        const customerEmail = payload.contactEmail || (payload.paxDetails && payload.paxDetails[0]?.Email);
        
        if (customerEmail) {
            const subject = `[SiapPgo] Konfirmasi Booking - ${response.bookingCode}`;
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="background-color: #24b3ae; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Booking Berhasil!</h1>
                    </div>
                    <div style="padding: 20px; border: 1px solid #eee;">
                        <p>Halo <strong>${username || 'Pelanggan'}</strong>,</p>
                        <p>Pesanan tiket pesawat Anda telah kami terima dan sedang dalam status <strong>HOLD</strong>.</p>
                        
                        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 10px; background: #f9f9f9; border: 1px solid #ddd;"><strong>Kode Booking</strong></td>
                                <td style="padding: 10px; border: 1px solid #ddd; color: #24b3ae; font-weight: bold; font-size: 18px;">${response.bookingCode}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; background: #f9f9f9; border: 1px solid #ddd;"><strong>Batas Waktu Bayar</strong></td>
                                <td style="padding: 10px; border: 1px solid #ddd; color: #e11d48;">${response.timeLimit}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; background: #f9f9f9; border: 1px solid #ddd;"><strong>Total Pembayaran</strong></td>
                                <td style="padding: 10px; border: 1px solid #ddd;">Rp ${new Intl.NumberFormat('id-ID').format(finalTotalPrice)}</td>
                            </tr>
                        </table>

                        <div style="background: #f0fdfa; padding: 15px; border-left: 4px solid #24b3ae;">
                            <h4 style="margin-top: 0; color: #134e4a;">Detail Penerbangan:</h4>
                            ${response.detail}
                        </div>

                        <p style="margin-top: 20px;">Segera lakukan pembayaran sebelum batas waktu berakhir untuk menghindari pembatalan otomatis oleh maskapai.</p>
                        <hr style="border: 0; border-top: 1px solid #eee;" />
                        <p style="font-size: 12px; color: #777;">Email ini dikirim otomatis oleh sistem SiapPgo Travel. Harap tidak membalas email ini.</p>
                    </div>
                </div>
            `;

            // Kirim secara background (tanpa await agar respons API tetap cepat)
            sendBookingEmail(customerEmail, subject, emailHtml)
                .then(() => console.log(`📧 Email konfirmasi terkirim ke: ${customerEmail}`))
                .catch(err => console.error(`❌ Gagal kirim email: ${err.message}`));
        }

        // RESPON SUKSES WAJIB MENGIRIM ID
        return res.status(200).json({ 
            status: "SUCCESS", 
            id: bookingId, 
            bookingCode: response.bookingCode,
            message: "Booking berhasil disimpan dan email sedang dikirim." 
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Database Error:", error.message);
        
        return res.status(500).json({ 
            status: "ERROR", 
            message: "Gagal menyimpan ke database internal: " + error.message 
        });
    } finally {
        if (connection) connection.release();
    }
};