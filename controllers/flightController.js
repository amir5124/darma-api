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

exports.saveBooking = async (req, res) => {
    const { payload, response, username } = req.body;

    if (!response || response.status !== "SUCCESS") {
        return res && res.status ? res.status(400).json({ status: 'ERROR', message: 'Invalid vendor response' }) : null;
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // 1. SIMPAN KE TABEL BOOKINGS (Total 17 Kolom sesuai struktur Anda)
        const [resBooking] = await connection.execute(
            `INSERT INTO bookings (
                booking_code, reference_no, airline_id, airline_name, 
                trip_type, origin, destination, depart_date, 
                ticket_status, total_price, sales_price, time_limit, 
                user_id, pengguna, access_token, payload_request, raw_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bookingCode,                   // booking_code
                response.referenceNo,                   // reference_no
                payload.airlineID,                      // airline_id
                payload.airlineName || payload.airlineID, // airline_name
                payload.tripType || "OneWay",            // trip_type
                payload.origin,                         // origin
                payload.destination,                    // destination
                payload.departDate ? payload.departDate.replace('T', ' ').replace('Z', '').split('.')[0] : null, // depart_date
                "HOLD",                                 // ticket_status
                response.totalPrice || 0,               // total_price (Harga modal/NTA)
                response.salesPrice || 0,               // sales_price (Harga jual)
                response.timeLimit,                     // time_limit
                response.userID,                        // user_id
                username || null,                       // pengguna (PENTING untuk GetBookingPengguna)
                payload.accessToken,                    // access_token
                JSON.stringify(payload),                // payload_request (JSON format)
                JSON.stringify(response)                // raw_response (JSON format)
            ]
        );

        const bookingId = resBooking.insertId;

        // 2. SIMPAN DATA PENUMPANG
        if (payload.paxDetails && payload.paxDetails.length > 0) {
            for (const p of payload.paxDetails) {
                const [resPax] = await connection.execute(
                    `INSERT INTO passengers (
                        booking_id, title, first_name, last_name, 
                        pax_type, phone, id_number, birth_date, pengguna
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId,
                        (p.title || "").toUpperCase(),
                        (p.firstName || "").toUpperCase(),
                        (p.lastName || p.firstName || "").toUpperCase(),
                        p.type === 0 ? 'Adult' : (p.type === 1 ? 'Child' : 'Infant'),
                        (payload.contactCountryCodePhone || "") + (payload.contactRemainingPhoneNo || ""),
                        p.IDNumber || "",
                        p.birthDate ? p.birthDate.split('T')[0] : '1900-01-01',
                        username || null
                    ]
                );

                const paxId = resPax.insertId;

                // 3. SIMPAN ADD-ONS
                if (p.addOns && p.addOns.length > 0) {
                    for (const ad of p.addOns) {
                        await connection.execute(
                            `INSERT INTO passenger_addons (
                                passenger_id, segment_idx, baggage_code, 
                                seat_number, meals_json, pengguna
                            ) VALUES (?, ?, ?, ?, ?, ?)`,
                            [paxId, 0, ad.baggageString || "", ad.seat || "", JSON.stringify(ad.meals || []), username || null]
                        );
                    }
                }
            }
        }

        // 4. SIMPAN ITINERARY
        if (response.flightDeparts && response.flightDeparts.length > 0) {
            for (const f of response.flightDeparts) {
                await connection.execute(
                    `INSERT INTO flight_itinerary (
                        booking_id, category, flight_number, origin, 
                        destination, depart_time, arrival_time, flight_class, pengguna
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId, 'Departure', f.flightNumber, f.fdOrigin, f.fdDestination,
                        f.fdDepartTime ? f.fdDepartTime.replace('T', ' ').split('.')[0] : null,
                        f.fdArrivalTime ? f.fdArrivalTime.replace('T', ' ').split('.')[0] : null,
                        f.fdFlightClass, username || null
                    ]
                );
            }
        }

        await connection.commit();
        console.log(`✅ Booking Archived: ${response.bookingCode} for ${username}`);
        
        if (res && typeof res.status === 'function') {
            res.status(201).json({ status: 'SUCCESS', db_id: bookingId });
        }

    } catch (error) {
        await connection.rollback();
        console.error("❌ Database Error Detail:", error.message);
        if (res && typeof res.status === 'function') {
            res.status(500).json({ status: 'ERROR', message: error.message });
        }
    } finally {
        connection.release();
    }
};

exports.getBookingPengguna = async (req, res) => {
    const { username } = req.params;

    if (!username || username === 'undefined' || username === 'null') {
        return res.status(200).json({ status: 'SUCCESS', results: 0, data: [] });
    }

    try {
        const query = `
            SELECT 
                b.id AS booking_id, b.booking_code, b.airline_name,
                UPPER(b.ticket_status) AS ticket_status,
                b.total_price, b.sales_price, b.time_limit, b.depart_date,
                b.access_token AS accessToken,
                i.flight_number, i.origin, i.destination,
                i.depart_time, i.arrival_time, i.flight_class,
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
            const limit = item.time_limit ? new Date(item.time_limit) : null;
            const now = new Date();
            
            return {
                ...item,
                isExpired: (!item.ticket_status.includes('TICKETED') && limit) ? now > limit : false,
                jam_berangkat: item.depart_time ? new Date(item.depart_time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : 'N/A',
                jam_tiba: item.arrival_time ? new Date(item.arrival_time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : 'N/A'
            };
        });

        res.status(200).json({ status: 'SUCCESS', results: historyData.length, data: historyData });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};