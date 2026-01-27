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
    if (!response || response.status !== "SUCCESS") return null;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // LOGIKA HARGA ROBUST: Cek semua kemungkinan nama field dari vendor
        const finalTotalPrice = response.ticketPrice || response.totalPrice || payload.totalPrice || 0;
        const finalSalesPrice = response.salesPrice || 0;

        const [resBooking] = await connection.execute(
            `INSERT INTO bookings (
                booking_code, reference_no, airline_id, airline_name, 
                trip_type, origin, destination, depart_date, 
                ticket_status, total_price, sales_price, time_limit, 
                user_id, pengguna, access_token, payload_request, raw_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bookingCode,
                response.referenceNo,
                payload.airlineID,
                payload.airlineName || payload.airlineID,
                payload.tripType || "OneWay",
                payload.origin,
                payload.destination,
                payload.departDate ? payload.departDate.replace('T', ' ').replace('Z', '').split('.')[0] : null,
                response.ticketStatus || "HOLD",
                finalTotalPrice, 
                finalSalesPrice,
                response.timeLimit,
                response.userID,
                username,
                payload.accessToken,
                JSON.stringify(payload), // Simpan Payload Request sebagai JSON
                JSON.stringify(response)
            ]
        );

        const bookingId = resBooking.insertId;

        // SIMPAN DATA PENUMPANG
        if (payload.paxDetails) {
            for (const p of payload.paxDetails) {
                const [resPax] = await connection.execute(
                    `INSERT INTO passengers (booking_id, title, first_name, last_name, pax_type, phone, id_number, birth_date, pengguna) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId, p.title.toUpperCase(), p.firstName.toUpperCase(), (p.lastName || p.firstName).toUpperCase(),
                        p.type === 0 ? 'Adult' : (p.type === 1 ? 'Child' : 'Infant'),
                        (payload.contactCountryCodePhone || "") + (payload.contactRemainingPhoneNo || ""),
                        p.idNumber || p.IDNumber || "", p.birthDate ? p.birthDate.split('T')[0] : '1900-01-01', username
                    ]
                );

                const paxId = resPax.insertId;
                if (p.addOns) {
                    for (const ad of p.addOns) {
                        await connection.execute(
                            `INSERT INTO passenger_addons (passenger_id, segment_idx, baggage_code, seat_number, meals_json, pengguna) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [paxId, 0, ad.baggageString || "", ad.seat || "", JSON.stringify(ad.meals || []), username]
                        );
                    }
                }
            }
        }

      // 4. SIMPAN ITINERARY PENERBANGAN (flight_itinerary)
if (response.flightDeparts && response.flightDeparts.length > 0) {
    for (const f of response.flightDeparts) {
        // Fungsi pembersih format tanggal ISO (membuang T dan Z)
        const cleanDate = (dateStr) => {
            if (!dateStr) return null;
            // Menghapus 'T', menghapus 'Z', dan mengambil bagian waktu utama saja
            return dateStr.replace('T', ' ').replace('Z', '').split('.')[0];
        };

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
                cleanDate(f.fdDepartTime), // Perbaikan: Format dibersihkan
                cleanDate(f.fdArrivalTime), // Perbaikan: Format dibersihkan
                f.fdFlightClass,
                username || null
            ]
        );
    }
}

        await connection.commit();
        console.log(`✅ Sukses simpan DB: ${response.bookingCode}`);
    } catch (error) {
        await connection.rollback();
        console.error("❌ DB Save Error:", error.message);
    } finally {
        connection.release();
    }
};