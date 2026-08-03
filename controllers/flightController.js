// flightController.js
const db = require('../config/db');
const { sendBookingEmail } = require('../utils/mailer');

/**
 * Mendapatkan riwayat booking sederhana
 */
exports.getMyBookings = async (req, res) => {
    const { username } = req.params;
    try {
        const [rows] = await db.execute(
            `SELECT b.*, 
             (SELECT COUNT(*) FROM passengers p WHERE p.booking_id = b.id) as total_pax,
             (SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', p.id,
                    'title', p.title,
                    'first_name', p.first_name,
                    'last_name', p.last_name,
                    'pax_type', p.pax_type,
                    'phone', p.phone,
                    'id_number', p.id_number,
                    'birth_date', p.birth_date
                )
                ORDER BY p.id ASC
             ) FROM passengers p WHERE p.booking_id = b.id) as passengers
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
    console.log(payload,"data book")

    if (!response || response.status !== "SUCCESS") {
        return res.status(400).json({ 
            status: "ERROR", 
            message: "Gagal menyimpan: Response dari vendor tidak sukses." 
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Helper untuk membersihkan format tanggal ISO ke MySQL format
        const formatDBDate = (dateStr) => {
            if (!dateStr || dateStr.startsWith('0001')) return null;
            return dateStr.replace('T', ' ').replace('Z', '').split('.')[0];
        };

        const finalAdminFee = payload.admin_fee || 0; 

        const finalTotalPrice = response.ticketPrice || response.totalPrice || payload.totalPrice || 0;
        const finalSalesPrice = response.salesPrice || 0;

        const [resBooking] = await connection.execute(
            `INSERT INTO bookings (
                booking_code, reference_no, airline_id, airline_name, 
                trip_type, origin, destination, origin_port, destination_port,
                depart_date, ticket_status, total_price, sales_price, 
                admin_fee, 
                time_limit, 
                user_id, pengguna, access_token, payload_request, raw_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bookingCode || response.booking_code,
                response.referenceNo || response.reference_no,
                payload.airlineID || response.airline_name,
                payload.airlineName || payload.airlineID || response.airline_name,
                payload.tripType || "OneWay",
                payload.origin,
                payload.destination,
                response.origin || payload.origin_port || null,
                response.destination || payload.destination_port || null,
                formatDBDate(payload.departDate || response.depart_date),
                response.ticketStatus || response.ticket_status || "HOLD",
                finalTotalPrice,
                finalSalesPrice,
                finalAdminFee, 
                formatDBDate(response.timeLimit || response.time_limit),
                response.userID || payload.userID,
                username || 'Guest',
                payload.accessToken,
                JSON.stringify(payload),
                JSON.stringify(response)
            ]
        );

        const bookingId = resBooking.insertId;

        // --- B. SIMPAN DATA PENUMPANG (passengers) ---
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

        // --- C. SIMPAN ITINERARY (flight_itinerary) ---
        const itineraryData = (response.flightDeparts && response.flightDeparts.length > 0) 
            ? response.flightDeparts 
            : (payload.schDeparts || []);

        for (const f of itineraryData) {
            await connection.execute(
                `INSERT INTO flight_itinerary (
                    booking_id, category, flight_number, origin, 
                    destination, depart_time, arrival_time, flight_class, pengguna
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookingId, 
                    'Departure', 
                    f.flightNumber, 
                    f.fdOrigin || f.schOrigin, 
                    f.fdDestination || f.schDestination,
                    formatDBDate(f.fdDepartTime || f.schDepartTime), 
                    formatDBDate(f.fdArrivalTime || f.schArrivalTime),
                    f.fdFlightClass || f.flightClass, 
                    username || 'Guest'
                ]
            );
        }

        await connection.commit();
        
        return res.status(200).json({ 
            status: "SUCCESS", 
            id: bookingId, 
            bookingCode: response.bookingCode || response.booking_code,
            message: "Booking berhasil disimpan." 
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Database Error:", error.message);
        return res.status(500).json({ status: "ERROR", message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * 2. AMBIL RIWAYAT BOOKING PENGGUNA (LENGKAP DENGAN SEMUA PENUMPANG)
 */
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
                b.id AS booking_id, 
                b.booking_code, 
                b.booking_code AS bookingCodeAirline,
                b.reference_no, 
                b.airline_name, 
                UPPER(b.ticket_status) AS ticket_status,
                b.total_price, 
                b.sales_price, 
                b.time_limit, 
                b.depart_date,
                b.origin AS origin_code, 
                b.destination AS destination_code,
                b.origin_port, 
                b.destination_port,
                b.access_token AS accessToken, 
                b.payload_request,
                i.flight_number, 
                i.origin, 
                i.destination, 
                i.depart_time, 
                i.arrival_time, 
                i.flight_class,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.id,
                            'title', p.title,
                            'first_name', p.first_name,
                            'last_name', p.last_name,
                            'pax_type', p.pax_type,
                            'phone', p.phone,
                            'id_number', p.id_number,
                            'birth_date', p.birth_date,
                            'eticket_number', p.eticket_number
                        )
                        ORDER BY p.id ASC
                    )
                    FROM passengers p 
                    WHERE p.booking_id = b.id
                ) AS passengers,
                (
                    SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) 
                    FROM passengers p 
                    WHERE p.booking_id = b.id 
                    ORDER BY p.id ASC 
                    LIMIT 1
                ) AS main_pax_name,
                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax
            FROM bookings b
            LEFT JOIN flight_itinerary i ON b.id = i.booking_id
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
                return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
            };

            const status = item.ticket_status ? item.ticket_status.toUpperCase() : "BOOKED";
            const isTicketed = status === 'TICKETED';
            const isExpired = !isTicketed && limit ? now > limit : false;

            return {
                ...item,
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

        res.status(200).json({ 
            status: 'SUCCESS', 
            results: historyData.length, 
            data: historyData 
        });
    } catch (error) {
        console.error("❌ Error GetBookingPengguna:", error);
        res.status(500).json({ status: 'ERROR', message: 'Gagal memuat data riwayat' });
    }
};

/**
 * 3. GET DETAIL BOOKING BY ID (LENGKAP DENGAN SEMUA PENUMPANG)
 */
exports.getBookingDetail = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(
            `SELECT 
                b.*,
                (b.total_price + b.admin_fee - b.discount) as total_payment,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.id,
                            'title', p.title,
                            'first_name', p.first_name,
                            'last_name', p.last_name,
                            'pax_type', p.pax_type,
                            'phone', p.phone,
                            'id_number', p.id_number,
                            'birth_date', p.birth_date,
                            'eticket_number', p.eticket_number
                        )
                        ORDER BY p.id ASC
                    )
                    FROM passengers p 
                    WHERE p.booking_id = b.id
                ) AS passengers,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', i.id,
                            'category', i.category,
                            'flight_number', i.flight_number,
                            'origin', i.origin,
                            'destination', i.destination,
                            'depart_time', i.depart_time,
                            'arrival_time', i.arrival_time,
                            'flight_class', i.flight_class
                        )
                        ORDER BY i.id ASC
                    )
                    FROM flight_itinerary i 
                    WHERE i.booking_id = b.id
                ) AS itinerary,
                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax,
                (
                    SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) 
                    FROM passengers p 
                    WHERE p.booking_id = b.id 
                    ORDER BY p.id ASC 
                    LIMIT 1
                ) AS main_pax_name
             FROM bookings b 
             WHERE b.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                status: 'ERROR',
                message: 'Booking tidak ditemukan'
            });
        }

        res.status(200).json({
            status: 'SUCCESS',
            data: rows[0]
        });

    } catch (error) {
        console.error("❌ Error GetBookingDetail:", error);
        res.status(500).json({ 
            status: 'ERROR', 
            message: 'Gagal memuat detail booking' 
        });
    }
};

/**
 * 4. GET BOOKINGS BY EMAIL (LENGKAP DENGAN SEMUA PENUMPANG)
 */
exports.getBookingsByEmail = async (req, res) => {
    const { email } = req.params;

    try {
        const [rows] = await db.execute(
            `SELECT 
                b.*,
                (b.total_price + b.admin_fee - b.discount) as total_payment,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.id,
                            'title', p.title,
                            'first_name', p.first_name,
                            'last_name', p.last_name,
                            'pax_type', p.pax_type,
                            'phone', p.phone,
                            'id_number', p.id_number,
                            'birth_date', p.birth_date,
                            'eticket_number', p.eticket_number
                        )
                        ORDER BY p.id ASC
                    )
                    FROM passengers p 
                    WHERE p.booking_id = b.id
                ) AS passengers,
                (SELECT COUNT(*) FROM passengers WHERE booking_id = b.id) AS total_pax,
                (
                    SELECT CONCAT(p.title, ' ', p.first_name, ' ', p.last_name) 
                    FROM passengers p 
                    WHERE p.booking_id = b.id 
                    ORDER BY p.id ASC 
                    LIMIT 1
                ) AS main_pax_name
             FROM bookings b 
             WHERE b.customer_email = ? 
             ORDER BY b.created_at DESC`,
            [email]
        );

        res.status(200).json({
            status: 'SUCCESS',
            results: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("❌ Error GetBookingsByEmail:", error);
        res.status(500).json({ 
            status: 'ERROR', 
            message: 'Gagal memuat data booking' 
        });
    }
};