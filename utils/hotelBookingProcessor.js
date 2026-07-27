// utils/hotelBookingProcessor.js
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');
const { sendBookingEmails } = require('./hotelMailer');

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

async function requestWithRetry(url, payload, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            logger.info(`🔄 [RETRY ${i+1}/${maxRetries}] Sending request to ${url}`);
            
            const response = await axios.post(url, payload, {
                httpsAgent: agent,
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (response.data && response.data.status === "FAILED") {
                const msg = (response.data.respMessage || "").toUpperCase();
                if (msg.includes("SESSION") || msg.includes("INVALID") || msg.includes("EXPIRED")) {
                    logger.warn(`⚠️ Session error detected, will retry with new token`);
                    await getConsistentToken(true);
                    continue;
                }
                return response;
            }
            
            return response;
        } catch (error) {
            lastError = error;
            logger.error(`❌ [RETRY ${i+1}/${maxRetries}] Failed:`, error.message);
            
            if (error.response) {
                logger.error(`Response status: ${error.response.status}`);
                logger.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
            }
            
            if (i < maxRetries - 1) {
                logger.info(`⏳ Waiting 2 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (error.response?.status === 401 || error.response?.status === 403) {
                    logger.info('🔄 Token expired, getting new token...');
                    await getConsistentToken(true);
                }
            }
        }
    }
    throw lastError;
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

        logger.info(`🔑 Getting token for booking ${bookingId}...`);
        const token = await getConsistentToken();
        logger.info(`✅ Token obtained: ${token ? token.substring(0, 10) + '...' : 'NULL'}`);

        const checkInISO = new Date(booking.check_in_date).toISOString();
        const checkOutISO = new Date(booking.check_out_date).toISOString();

        // 🔥 GUNAKAN ID LENGKAP (TIDAK DIEKSTRAK) — SESUAI DOKUMENTASI API
        const roomId = String(booking.room_id || "").trim();
        const hotelId = String(booking.hotel_id || "").trim();
        const cityId = String(booking.city_id || "").trim();
        const internalCode = String(booking.internal_code || "SUP").trim();

        logger.info(`🔍 [BOOKING ${bookingId}]`, {
            roomId: roomId.substring(0, 50) + '...',
            hotelId: hotelId,
            cityId: cityId,
            internalCode: internalCode
        });

        // 🔥 AMBIL ROOM TYPE DARI DATABASE
        const roomType = booking.room_type !== null && booking.room_type !== undefined ? Number(booking.room_type) : 0;
        const childNum = booking.child_num || 0;

        // 🔥 PERBAIKAN: Jangan ubah childAges jika kosong
        let childAges = [];
        try {
            if (booking.child_ages) {
                childAges = typeof booking.child_ages === 'string' 
                    ? JSON.parse(booking.child_ages) 
                    : booking.child_ages;
                if (!Array.isArray(childAges)) {
                    childAges = [];
                }
            }
            // ✅ Biarkan kosong jika memang kosong
        } catch (e) {
            childAges = [];
        }

        // 🔥 PASTIKAN childAges SAMA PERSIS dengan saat search
        logger.info(`🔍 [ROOM REQUEST] Booking ${bookingId}:`, {
            roomType: roomType,
            childNum: childNum,
            childAges: JSON.stringify(childAges)
        });

        const roomRequestOriginal = {
            roomType: roomType,
            isRequestChildBed: false,
            childNum: childNum,
            childAges: childAges  // ✅ BISA KOSONG []
        };

        const priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: cityId,
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [roomRequestOriginal],
            internalCode: internalCode,
            hotelID: hotelId,
            breakfast: booking.breakfast_type || "Room Only",
            roomID: roomId,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_PRICE_INFO", priceInfoPayload);

        const priceRes = await requestWithRetry(
            `${BASE_URL}/Hotel/PriceAndPolicyInfo`,
            priceInfoPayload
        );

        const p = priceRes.data;
        logger.debug("RES_VENDOR_PRICE_INFO", p);

        if (p.status !== "SUCCESS") {
            await safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM');
            const reason = p.respMessage || "Kamar tidak tersedia.";
            logger.error(`🚨 [CRITICAL] Booking ${bookingId} gagal: ${reason}`);
            throw new Error(`${reason} PERLU TINDAKAN MANUAL / REFUND.`);
        }

        const vendorRoomId = p.roomID || roomId;
        const vendorHotelId = p.hotelID || hotelId;
        const vendorCityId = p.cityID || cityId;
        const vendorInternalCode = p.internalCode || internalCode;

        const bookingPayload = {
            paxPassport: p.paxPassport || "ID",
            countryID: p.countryID || "ID",
            cityID: vendorCityId,
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
            internalCode: vendorInternalCode,
            hotelID: vendorHotelId,
            breakfast: p.breakfast || booking.breakfast_type || "Room Only",
            roomID: vendorRoomId,
            bedType: (p.bedTypes && p.bedTypes[0]) ? {
                ID: p.bedTypes[0].ID || "",
                bed: p.bedTypes[0].bed || ""
            } : { ID: "", bed: "" },
            agentOsRef: `HTL-${bookingId}-${Date.now()}`,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_BOOKING", bookingPayload);

        const bookingRes = await requestWithRetry(
            `${BASE_URL}/Hotel/BookingAllSupplier`,
            bookingPayload,
            3
        );

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