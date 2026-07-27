// utils/hotelBookingProcessor.js
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');
const { sendBookingEmails } = require('./hotelMailer');

/**
 * Helper: Ekstrak ID numerik dari roomID
 * Contoh: "999678631|roomCateg.Promotionid|19431926|v1_...|A" → "999678631"
 */
function extractNumericId(id) {
    if (!id) return id;
    const str = String(id);
    // Ambil angka pertama (sebelum pipe atau separator apapun)
    const match = str.match(/^(\d+)/);
    if (match) {
        return match[1];
    }
    // Fallback: ambil semua angka
    const numericMatch = str.match(/\d+/);
    return numericMatch ? numericMatch[0] : str;
}

/**
 * Helper: update booking_status dengan aman.
 */
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

        // 1. Ambil data booking
        const [rows] = await connection.execute(
            `SELECT * FROM hotel_bookings WHERE id = ?`,
            [bookingId]
        );

        if (rows.length === 0) {
            throw new Error(`Booking ID ${bookingId} tidak ditemukan.`);
        }

        const booking = rows[0];

        // 2. Cek status
        if (['Accept', 'Processed'].includes(booking.booking_status)) {
            logger.info(`[VENDOR BOOKING] Booking ${bookingId} sudah diproses (status: ${booking.booking_status}).`);
            return { skipped: true, reason: 'already_processed', bookingId, status: booking.booking_status };
        }

        // 3. Validasi data
        const required = ['city_id', 'hotel_id', 'room_id', 'internal_code', 'check_in_date', 'check_out_date'];
        const missing = required.filter(field => !booking[field]);
        if (missing.length > 0) {
            throw new Error(`Data booking tidak lengkap: ${missing.join(', ')}`);
        }

        // 4. Ambil paxes
        const [paxes] = await connection.execute(
            `SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?`,
            [bookingId]
        );

        if (paxes.length === 0) {
            throw new Error(`Data tamu (paxes) untuk booking ${bookingId} kosong.`);
        }

        // 5. Dapatkan token
        const token = await getConsistentToken();

        // 6. Format tanggal
        const checkInISO = new Date(booking.check_in_date).toISOString();
        const checkOutISO = new Date(booking.check_out_date).toISOString();

        // 7. 🔥 EKSTRAK ID NUMERIK (INI YANG PALING PENTING)
        const numericRoomId = extractNumericId(booking.room_id);
        const numericHotelId = extractNumericId(booking.hotel_id);
        const cityId = String(booking.city_id || "").trim();
        const internalCode = String(booking.internal_code || "SUP").trim();

        logger.info(`🔍 [BOOKING ${bookingId}] RoomID: ${numericRoomId}, HotelID: ${numericHotelId}, City: ${cityId}`);

        // 8. Prepare Price Info Payload
        const priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: cityId,
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [{
                roomType: 0,
                isRequestChildBed: false,
                childNum: 0,
                childAges: [0]
            }],
            internalCode: internalCode,
            hotelID: numericHotelId,  // 🔥 Hanya angka
            breakfast: booking.breakfast_type || "Room Only",
            roomID: numericRoomId,    // 🔥 Hanya angka
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_PRICE_INFO", priceInfoPayload);

        // 9. Kirim Price Info
        const priceRes = await axios.post(`${BASE_URL}/Hotel/PriceAndPolicyInfo`, priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const p = priceRes.data;

        logger.debug("RES_VENDOR_PRICE_INFO", p);

        // 10. Cek response
        if (p.status !== "SUCCESS") {
            await safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM');
            const reason = p.respMessage || "Kamar tidak tersedia.";
            logger.error(`🚨 [CRITICAL] Booking ${bookingId} gagal: ${reason}`);
            throw new Error(`${reason} PERLU TINDAKAN MANUAL / REFUND.`);
        }

        // 11. Prepare Booking Payload
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
            hotelID: p.hotelID || numericHotelId,
            breakfast: p.breakfast || booking.breakfast_type || "Room Only",
            roomID: p.roomID || numericRoomId,
            bedType: (p.bedTypes && p.bedTypes[0]) ? { 
                ID: p.bedTypes[0].ID || "", 
                bed: p.bedTypes[0].bed || "" 
            } : { ID: "", bed: "" },
            agentOsRef: `HTL-${bookingId}-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_BOOKING", bookingPayload);

        // 12. Kirim Booking
        const bookingRes = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, bookingPayload, {
            httpsAgent: agent,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const resData = bookingRes.data;

        logger.debug("RES_VENDOR_BOOKING", resData);

        // 13. Cek response Booking
        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            await safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED');
            logger.error(`🚨 [CRITICAL] Booking ${bookingId} ditolak vendor: ${resData.respMessage}`);
            throw new Error(`${resData.respMessage || "Vendor menolak booking"} PERLU TINDAKAN MANUAL / REFUND.`);
        }

        // 14. Proses success
        const finalStatus = isProcessed ? 'Processed' : 'Accept';

        if (isProcessed) {
            resData.reservationNo = resData.reservationNo || `PRC-${Date.now()}`;
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
        }

        // 15. Update database
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

        // 16. Kirim email di background
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