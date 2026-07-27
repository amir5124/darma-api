// utils/hotelBookingProcessor.js
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');
const { sendBookingEmails } = require('./hotelMailer');

// ❌ HAPUS function extractNumericId(...) { ... } — tidak diperlukan lagi

async function safeUpdateStatus(connection, bookingId, status) {
    try {
        const safeStatus = String(status).substring(0, 45);
        await connection.execute(
            `UPDATE hotel_bookings SET booking_status = ?, updated_at = NOW() WHERE id = ?`,
            [safeStatus, bookingId]
        );
    } catch (dbErr) {
        logger.error(`⚠️ [STATUS UPDATE FAILED] Booking ${bookingId}: ${dbErr.message}`);
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
            throw new Error(`Booking ID ${bookingId} tidak ditemukan.`);
        }

        const booking = rows[0];

        if (['Accept', 'Processed'].includes(booking.booking_status)) {
            logger.info(`[VENDOR BOOKING] Booking ${bookingId} sudah diproses (status: ${booking.booking_status}).`);
            return { skipped: true, reason: 'already_processed', bookingId, status: booking.booking_status };
        }

        const required = ['city_id', 'hotel_id', 'room_id', 'internal_code', 'check_in_date', 'check_out_date'];
        const missing = required.filter(field => !booking[field]);
        if (missing.length > 0) {
            throw new Error(`Data booking tidak lengkap: ${missing.join(', ')}`);
        }

        const [paxes] = await connection.execute(
            `SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?`,
            [bookingId]
        );

        if (paxes.length === 0) {
            throw new Error(`Data tamu (paxes) untuk booking ${bookingId} kosong.`);
        }

        const token = await getConsistentToken();

        const checkInISO = new Date(booking.check_in_date).toISOString();
        const checkOutISO = new Date(booking.check_out_date).toISOString();

        // ✅ PAKAI LANGSUNG hasil dari cleanIdForStorage di draft route — jangan dipotong lagi
        const roomId = String(booking.room_id || "").trim();
        const hotelId = String(booking.hotel_id || "").trim();
        const cityId = String(booking.city_id || "").trim();
        const internalCode = String(booking.internal_code || "SUP").trim();

        logger.info(`🔍 [BOOKING ${bookingId}] RoomID: ${roomId}, HotelID: ${hotelId}, City: ${cityId}`);

        const roomRequestOriginal = {
            roomType: booking.room_type !== null && booking.room_type !== undefined ? Number(booking.room_type) : 0,
            isRequestChildBed: false,
            childNum: booking.child_num || 0,
            childAges: booking.child_ages
                ? (typeof booking.child_ages === 'string' ? JSON.parse(booking.child_ages) : booking.child_ages)
                : [0]
        };

        const priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: cityId,
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [roomRequestOriginal],   // ✅ pakai nilai asli, bukan hardcode
            internalCode: internalCode,
            hotelID: hotelId,
            breakfast: booking.breakfast_type || "Room Only",
            roomID: roomId,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_PRICE_INFO", priceInfoPayload);

        const priceRes = await axios.post(`${BASE_URL}/Hotel/PriceAndPolicyInfo`, priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        const p = priceRes.data;
        logger.debug("RES_VENDOR_PRICE_INFO", p);

        if (p.status !== "SUCCESS") {
            await safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM');
            const reason = p.respMessage || "Kamar tidak tersedia.";
            logger.error(`🚨 [CRITICAL] Booking ${bookingId} gagal: ${reason}`);
            throw new Error(`${reason} PERLU TINDAKAN MANUAL / REFUND.`);
        }

        const bookingPayload = {
            paxPassport: p.paxPassport || "ID",
            countryID: p.countryID || "ID",
            cityID: p.cityID || cityId,
            checkInDate: p.checkInDate || checkInISO,
            checkOutDate: p.checkOutDate || checkOutISO,
            roomRequest: (p.roomRequest || []).map(room => ({
                ...room,
                paxes: paxes.map(px => ({
                    title: px.title || 'Mr.',
                    firstName: (px.firstName || 'Guest').trim(),
                    lastName: (px.lastName || 'User').trim()
                })),
                email: booking.contact_email || 'guest@mail.com',
                phone: booking.contact_phone || '08123456789'
            })),
            internalCode: p.internalCode || internalCode,
            hotelID: p.hotelID || hotelId,
            breakfast: p.breakfast || booking.breakfast_type || "Room Only",
            roomID: p.roomID || roomId,
            bedType: (p.bedTypes && p.bedTypes[0]) ? {
                ID: p.bedTypes[0].ID || "",
                bed: p.bedTypes[0].bed || ""
            } : { ID: "", bed: "" },
            agentOsRef: `HTL-${bookingId}-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_BOOKING", bookingPayload);

        const bookingRes = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, bookingPayload, {
            httpsAgent: agent,
            timeout: 60000,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        const resData = bookingRes.data;
        logger.debug("RES_VENDOR_BOOKING", resData);

        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            await safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED');
            logger.error(`🚨 [CRITICAL] Booking ${bookingId} ditolak vendor: ${resData.respMessage}`);
            throw new Error(`${resData.respMessage || "Vendor menolak booking"} PERLU TINDAKAN MANUAL / REFUND.`);
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
                resData.reservationNo || booking.reservation_no,
                resData.voucherNo || resData.reservationNo || booking.voucher_no,
                resData.osRefNo || booking.os_ref_no || null,
                bookingPayload.agentOsRef,
                resData.hotelName || booking.hotel_name,
                resData.hotelAddress || booking.hotel_address,
                resData.roomName || booking.room_name,
                finalStatus,
                bookingId
            ]
        );

        logger.success(`✅ [VENDOR BOOKING] Booking ${bookingId} sukses -> ${resData.reservationNo} (${finalStatus})`);

        sendBookingEmails(bookingId).catch(err =>
            logger.error(`[MAIL ERROR] Booking ${bookingId}: ${err.message}`)
        );

        return {
            success: true,
            status: finalStatus,
            reservationNo: resData.reservationNo,
            bookingId,
            vendorResponse: resData
        };

    } catch (err) {
        logger.error(`❌ [VENDOR BOOKING ERROR] Booking ${bookingId}: ${err.message}`);
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = { processHotelBookingToVendor };