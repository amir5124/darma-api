const db = require('../config/db');
const { sendShipBookingEmail } = require('../utils/mailer'); 

/**
 * Menyimpan data booking PELNI setelah dapat response SUCCESS dari vendor
 */
exports.saveShipBooking = async (req, res) => {
    const { payload, response, username } = req.body;

    if (!response || response.status !== "SUCCESS") {
        return res.status(400).json({ 
            status: "ERROR", 
            message: "Gagal menyimpan: Response vendor tidak sukses." 
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Insert ke Tabel Utama (bookings_pelni)
        // Menggunakan struktur yang mirip dengan tabel pesawat Anda
        const [resBooking] = await connection.execute(
            `INSERT INTO bookings_pelni (
                booking_code, num_code, ship_number, ship_name,
                origin_port, origin_name, destination_port, destination_name,
                depart_date, arrival_date, ticket_status,
                total_price, sales_price, admin_fee, time_limit, 
                user_id, pengguna, customer_email, 
                payload_request, raw_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                response.bokingNumber || response.bookingNumber, // PNR PELNI
                response.numCode || payload.numCode,
                response.shipNumber || payload.shipNumber,
                response.shipName || "KM. PELNI",
                response.originPort || payload.originPort,
                response.originName || null,
                response.destinationPort || payload.destinationPort,
                response.destinationName || null,
                response.departDateTime ? response.departDateTime.replace('T', ' ') : null,
                response.arrivalDateTime ? response.arrivalDateTime.replace('T', ' ') : null,
                response.ticketStatus || "HOLD",
                response.ticketPrice || payload.totalPrice, // total_price
                response.salesPrice || 0,
                payload.adminFee || 0, // Admin Fee aplikasi/LinkQu
                response.issuedDateTimeLimit || response.timeLimit,
                response.userID || payload.userID,
                username || 'Guest',
                payload.ticketBuyerEmail || null,
                JSON.stringify(payload),
                JSON.stringify(response)
            ]
        );

        const bookingId = resBooking.insertId;

        // 2. Simpan Data Penumpang ke booking_passengers_pelni
        const paxs = response.paxBookingDetails || payload.paxDetails;
        if (paxs && paxs.length > 0) {
            for (const p of paxs) {
                await connection.execute(
                    `INSERT INTO booking_passengers_pelni (
                        booking_id, pax_name, pax_type, pax_gender, 
                        birth_date, id_number, phone, 
                        deck, cabin, bed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId,
                        (p.paxName || `${p.firstName} ${p.lastName}`).toUpperCase(),
                        p.paxType || 'Adult',
                        p.paxGender || 'M',
                        p.birthDate ? p.birthDate.split('T')[0] : null,
                        p.ID || p.id_number,
                        p.phone || '',
                        p.deck || '-',
                        p.cabin || '-',
                        p.bed || '-'
                    ]
                );
            }
        }

        await connection.commit();
        
        // Logika kirim email instruksi pembayaran
        // sendShipBookingEmail(bookingId); 

        res.status(200).json({ 
            status: "SUCCESS", 
            id: bookingId, 
            bookingCode: response.bokingNumber,
            message: "Booking PELNI berhasil disimpan." 
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Database PELNI Error:", error.message);
        res.status(500).json({ status: "ERROR", message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Ambil riwayat booking PELNI per pengguna
 */
exports.getShipHistory = async (req, res) => {
    const { username } = req.params;
    try {
        const query = `
            SELECT b.*, 
            (SELECT COUNT(*) FROM booking_passengers_pelni p WHERE p.booking_id = b.id) as total_pax
            FROM bookings_pelni b 
            WHERE b.pengguna = ? 
            ORDER BY b.created_at DESC`;
            
        const [rows] = await db.execute(query, [username]);
        res.json({ status: 'SUCCESS', data: rows });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};