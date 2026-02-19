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

        /**
         * 1. Helper untuk merapikan format DateTime ISO ke MySQL format (YYYY-MM-DD HH:mm:ss)
         * Menghindari error jika ada milidetik atau karakter 'T'
         */
        const formatMySQLDateTime = (dateStr) => {
            if (!dateStr) return null;
            return dateStr.replace('T', ' ').substring(0, 19);
        };

        // 2. Insert ke Tabel Utama (bookings_pelni)
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
                response.bookingNumber || response.bokingNumber || response.pnr || null,
                response.numCode || payload.numCode || null,
                response.shipNumber || payload.shipNumber || null,
                response.shipName || "KM. PELNI",
                response.originPort || payload.originPort || null,
                response.originName || null,
                response.destinationPort || payload.destinationPort || null,
                response.destinationName || null,
                formatMySQLDateTime(response.departDate), 
                formatMySQLDateTime(response.arrivalDate),
                response.ticketStatus || "HOLD",
                response.ticketPrice || 0, 
                response.salesPrice || 0,
                payload.adminFee || 0, 
                formatMySQLDateTime(response.issuedDateTimeLimit || response.timeLimit),
                response.userID || payload.userID || null,
                username || 'Guest',
                payload.ticketBuyerEmail || null,
                JSON.stringify(payload) || null,
                JSON.stringify(response) || null
            ]
        );

        const bookingId = resBooking.insertId;

        // 3. Simpan Data Penumpang ke booking_passengers_pelni
        // Mengutamakan data dari response (paxBookingDetails) lalu fallback ke payload
        const paxs = response.paxBookingDetails || payload.paxDetails || [];
        
        for (const p of paxs) {
            // Logika Nama: Gabung firstName & lastName jika paxName tidak ada
            let fullName = p.paxName;
            if (!fullName && p.firstName) {
                fullName = `${p.firstName} ${p.lastName || ''}`.trim();
            }

            await connection.execute(
                `INSERT INTO booking_passengers_pelni (
                    booking_id, pax_name, pax_type, pax_gender, 
                    birth_date, id_number, phone, 
                    deck, cabin, bed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookingId,
                    (fullName || 'NONAME').toUpperCase(),
                    p.paxType || 'Adult',
                    p.paxGender || 'M',
                    p.birthDate ? p.birthDate.split('T')[0] : null,
                    p.ID || p.id_number || null, // Penting: Hindari undefined
                    p.phone || '',
                    p.deck || '-',
                    p.cabin || '-',
                    p.bed || '-'
                ]
            );
        }

        await connection.commit();
        
        res.status(200).json({ 
            status: "SUCCESS", 
            id: bookingId, 
            bookingCode: response.bookingNumber || response.bokingNumber,
            message: "Booking PELNI berhasil disimpan." 
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Database PELNI Error:", error.message);
        res.status(500).json({ 
            status: "ERROR", 
            message: "Database Error: " + error.message 
        });
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