// utils/hotelBookingProcessor.js
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');
const { sendBookingEmails } = require('./hotelMailer');

/**
 * Helper: update booking_status dengan aman.
 * Kalau UPDATE ini sendiri gagal (misal kolom kepanjangan di masa depan),
 * jangan biarkan error-nya menutupi pesan error bisnis asli — cukup log terpisah.
 */
async function safeUpdateStatus(connection, bookingId, status, extra = {}) {
    try {
        // Truncate defensif — jaga-jaga kalau suatu saat ada status baru yang lebih panjang dari kolom
        const safeStatus = String(status).substring(0, 45);
        await connection.execute(
            `UPDATE hotel_bookings SET booking_status = ?, updated_at = NOW() WHERE id = ?`,
            [safeStatus, bookingId]
        );
    } catch (dbErr) {
        logger.error(`⚠️ [STATUS UPDATE FAILED] Booking ${bookingId} gagal update status ke '${status}': ${dbErr.message}`);
        // Sengaja tidak di-throw — supaya error bisnis asli (di pemanggil) tetap yang muncul ke log/alert
    }
}

async function processHotelBookingToVendor(bookingId) {
    let connection;
    try {
        connection = await db.getConnection();

        const [rows] = await connection.execute(
            `SELECT * FROM hotel_bookings WHERE id = ?`,
            [bookingId]
        );

        if (rows.length === 0) {
            throw new Error(`Booking ID ${bookingId} tidak ditemukan di database.`);
        }

        const booking = rows[0];

        if (['Accept', 'Processed'].includes(booking.booking_status)) {
            logger.info(`[VENDOR BOOKING] Booking ID ${bookingId} sudah pernah diproses (status: ${booking.booking_status}). Dilewati.`);
            return { skipped: true, reason: 'already_processed', bookingId, status: booking.booking_status };
        }

        const [paxes] = await connection.execute(
            `SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?`,
            [bookingId]
        );

        if (paxes.length === 0) {
            throw new Error(`Data tamu (paxes) untuk booking ID ${bookingId} kosong — tidak bisa lanjut booking ke vendor.`);
        }

        const token = await getConsistentToken();

        const checkInISO = new Date(booking.check_in_date).toISOString();
        const checkOutISO = new Date(booking.check_out_date).toISOString();

        const priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: String(booking.city_id || ""),
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [{
                roomType: 0,
                isRequestChildBed: false,
                childNum: 0,
                childAges: [0]
            }],
            internalCode: booking.internal_code,
            hotelID: String(booking.hotel_id),
            breakfast: booking.breakfast_type,
            roomID: String(booking.room_id),
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_PRICE_INFO (post-payment)", priceInfoPayload);

        const priceRes = await axios.post(`${BASE_URL}/Hotel/PriceAndPolicyInfo`, priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000
        });

        const p = priceRes.data;

        // ✅ LOG RESPONSE — ini yang hilang sebelumnya, bikin kita tidak tahu alasan gagal
        logger.debug("RES_VENDOR_PRICE_INFO (post-payment)", JSON.stringify(p));

        if (p.status !== "SUCCESS") {
            await safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM');
            const reason = p.respMessage || "Kamar tidak lagi tersedia di vendor setelah pembayaran.";
            logger.error(`🚨 [CRITICAL] Booking ID ${bookingId} DIBAYAR tapi kamar/harga tidak valid lagi: ${reason}`);
            throw new Error(reason + " PERLU TINDAKAN MANUAL / REFUND.");
        }

        const bookingPayload = {
            paxPassport: p.paxPassport || "ID",
            countryID: p.countryID || "ID",
            cityID: p.cityID,
            checkInDate: p.checkInDate,
            checkOutDate: p.checkOutDate,
            roomRequest: (p.roomRequest || []).map(room => ({
                ...room,
                paxes: paxes.map(px => ({
                    title: px.title || 'Mr.',
                    firstName: (px.firstName || 'Guest').trim(),
                    lastName: (px.lastName || 'User').trim()
                })),
                email: booking.contact_email,
                phone: booking.contact_phone
            })),
            internalCode: p.internalCode,
            hotelID: p.hotelID,
            breakfast: p.breakfast,
            roomID: p.roomID,
            bedType: (p.bedTypes && p.bedTypes[0]) ? { ID: p.bedTypes[0].ID, bed: p.bedTypes[0].bed } : { ID: "", bed: "" },
            agentOsRef: `HTL-${bookingId}-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_BOOKING (post-payment)", bookingPayload);

        const bookingRes = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, bookingPayload, {
            httpsAgent: agent,
            timeout: 60000
        });

        const resData = bookingRes.data;

        // ✅ LOG RESPONSE — sama, wajib ada untuk audit
        logger.debug("RES_VENDOR_BOOKING (post-payment)", JSON.stringify(resData));

        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            await safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED');
            logger.error(`🚨 [CRITICAL] Booking ID ${bookingId} DIBAYAR tapi DITOLAK vendor: ${resData.respMessage}`);
            throw new Error(resData.respMessage || "Vendor menolak booking setelah pembayaran diterima. PERLU TINDAKAN MANUAL / REFUND.");
        }

        const finalStatus = isProcessed ? 'Processed' : 'Accept';

        if (isProcessed) {
            resData.reservationNo = resData.reservationNo || `PRC-${Date.now()}`;
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
        }

        await connection.execute(
            `UPDATE hotel_bookings SET
                reservation_no = ?,
                voucher_no = ?,
                os_ref_no = ?,
                agent_os_ref = ?,
                hotel_name = ?,
                hotel_address = ?,
                room_name = ?,
                booking_status = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [
                resData.reservationNo,
                resData.voucherNo || resData.reservationNo,
                resData.osRefNo || null,
                bookingPayload.agentOsRef,
                resData.hotelName || booking.hotel_name,
                resData.hotelAddress || booking.hotel_address,
                resData.roomName || booking.room_name,
                finalStatus,
                bookingId
            ]
        );

        logger.info(`✅ [VENDOR BOOKING] Booking ID ${bookingId} sukses -> Reservasi: ${resData.reservationNo} (${finalStatus})`);

        sendBookingEmails(bookingId).catch(err =>
            logger.error(`[MAIL ERROR] Booking ID ${bookingId}: ${err.message}`)
        );

        return { success: true, status: finalStatus, reservationNo: resData.reservationNo, bookingId };

    } catch (err) {
        logger.error(`❌ [VENDOR BOOKING ERROR] Booking ID ${bookingId}: ${err.message}`);
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = { processHotelBookingToVendor };