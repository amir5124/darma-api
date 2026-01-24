const db = require('../config/db'); // Sesuaikan path jika db.js ada di folder root atau config

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

    try {
        // Query ini menggabungkan itinerary dan menghitung total pax dalam satu tarikan
        const query = `
            SELECT 
                b.id AS booking_id,
                b.booking_code,
                b.airline_name,
                b.ticket_status,
                b.total_price,
                b.time_limit,
                b.depart_date,
                i.flight_number,
                i.origin,
                i.destination,
                i.depart_time,
                i.arrival_time,
                i.flight_class,
                p.first_name AS main_pax_first,
                p.last_name AS main_pax_last,
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

        // Mapping data untuk menambahkan logika expire dan formatting
        const historyData = rows.map(item => {
            const now = new Date();
            const limit = new Date(item.time_limit);
            
            return {
                ...item,
                // Status Expired: Jika waktu sekarang sudah melewati time_limit
                isExpired: now > limit,
                // Format tanggal agar ramah di mata (opsional, bisa dilakukan di frontend)
                formattedLimit: item.time_limit ? new Date(item.time_limit).toLocaleString('id-ID') : 'N/A'
            };
        });

        res.status(200).json({
            status: 'SUCCESS',
            results: historyData.length,
            data: historyData
        });

    } catch (error) {
        console.error("Error GetBookingPengguna:", error);
        res.status(500).json({
            status: 'ERROR',
            message: 'Gagal memuat riwayat pemesanan',
            error: error.message
        });
    }
};

/**
 * Menyimpan data Create Booking ke MySQL
 */
exports.saveBooking = async (req, res) => {
    // Payload: data yang dikirim ke API vendor
    // Response: hasil sukses dari API vendor (mengandung bookingCode)
    // Username: identitas user dari frontend
    const { payload, response, username } = req.body;

    if (!response || response.status !== "SUCCESS") {
        return res.status(400).json({ status: 'ERROR', message: 'Invalid response data' });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // 1. Simpan ke tabel bookings
        const [resBooking] = await connection.execute(
            `INSERT INTO bookings (
                booking_code, reference_no, airline_id, airline_name, 
                trip_type, origin, destination, depart_date, 
                ticket_status, total_price, time_limit, user_id, pengguna
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bookingCode,
                response.referenceNo,
                payload.airlineID,
                "Air Asia", // Bisa diambil dinamis jika ada di response
                payload.tripType,
                payload.origin,
                payload.destination,
                payload.departDate.replace('T', ' ').replace('Z', ''),
                "HOLD",
                response.salesPrice,
                response.timeLimit,
                response.userID,
                username
            ]
        );

        const bookingId = resBooking.insertId;

        // 2. Loop Penumpang (paxDetails)
        for (const p of payload.paxDetails) {
            const [resPax] = await connection.execute(
                `INSERT INTO passengers (
                    booking_id, title, first_name, last_name, 
                    pax_type, phone, id_number, birth_date, pengguna
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookingId,
                    p.title.toUpperCase(),
                    p.firstName.toUpperCase(),
                    (p.lastName || p.firstName).toUpperCase(),
                    p.type === 0 ? 'Adult' : (p.type === 1 ? 'Child' : 'Infant'),
                    payload.contactCountryCodePhone + payload.contactRemainingPhoneNo,
                    p.IDNumber || "",
                    p.birthDate ? p.birthDate.split('T')[0] : '1900-01-01',
                    username
                ]
            );

            const paxId = resPax.insertId;

            // 3. Simpan Add-ons per penumpang (Baggage, Meals, Seat)
            if (p.addOns && p.addOns.length > 0) {
                for (const ad of p.addOns) {
                    await connection.execute(
                        `INSERT INTO passenger_addons (
                            passenger_id, segment_idx, baggage_code, 
                            seat_number, meals_json, pengguna
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            paxId,
                            0, // Default 0 untuk Depart
                            ad.baggageString || "",
                            ad.seat || "",
                            JSON.stringify(ad.meals || []),
                            username
                        ]
                    );
                }
            }
        }

        // 4. Simpan Itinerary Penerbangan (Jadwal)
        if (response.flightDeparts && response.flightDeparts.length > 0) {
            for (const f of response.flightDeparts) {
                await connection.execute(
                    `INSERT INTO flight_itinerary (
                        booking_id, category, flight_number, origin, 
                        destination, depart_time, arrival_time, flight_class, pengguna
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId,
                        'Departure',
                        f.flightNumber,
                        f.fdOrigin,
                        f.fdDestination,
                        f.fdDepartTime.replace('T', ' '),
                        f.fdArrivalTime.replace('T', ' '),
                        f.fdFlightClass,
                        username
                    ]
                );
            }
        }

        await connection.commit();
        
        res.status(201).json({ 
            status: 'SUCCESS', 
            message: 'Booking saved successfully',
            db_id: bookingId,
            booking_code: response.bookingCode 
        });

    } catch (error) {
        await connection.rollback();
        console.error("Database Error:", error);
        res.status(500).json({ status: 'ERROR', message: error.message });
    } finally {
        connection.release();
    }
};