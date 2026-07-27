// utils/hotelBookingProcessor.js
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');
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

/**
 * Helper: validasi data booking sebelum dikirim ke vendor
 */
function validateBookingData(booking) {
    const required = ['city_id', 'hotel_id', 'room_id', 'internal_code', 'check_in_date', 'check_out_date'];
    const missing = required.filter(field => !booking[field]);
    
    if (missing.length > 0) {
        throw new Error(`Data booking tidak lengkap. Field yang kosong: ${missing.join(', ')}`);
    }
    
    // Validasi format room_id - pastikan tidak ada karakter aneh
    if (booking.room_id && booking.room_id.includes('~||~')) {
        // Gunakan logger.info atau console.log sebagai ganti logger.warn
        console.warn(`⚠️ [WARNING] Room ID mengandung separator '~||~', ini mungkin dari format lama. Room ID: ${booking.room_id}`);
        logger.info(`⚠️ Room ID mengandung separator '~||~', ini mungkin dari format lama. Room ID: ${booking.room_id}`);
    }
    
    return true;
}

async function processHotelBookingToVendor(bookingId) {
    let connection;
    try {
        connection = await db.getConnection();

        // 1. Ambil data booking dari database
        const [rows] = await connection.execute(
            `SELECT * FROM hotel_bookings WHERE id = ?`,
            [bookingId]
        );

        if (rows.length === 0) {
            throw new Error(`Booking ID ${bookingId} tidak ditemukan di database.`);
        }

        const booking = rows[0];

        // 2. Cek status - sudah diproses atau belum
        if (['Accept', 'Processed'].includes(booking.booking_status)) {
            logger.info(`[VENDOR BOOKING] Booking ID ${bookingId} sudah pernah diproses (status: ${booking.booking_status}). Dilewati.`);
            return { skipped: true, reason: 'already_processed', bookingId, status: booking.booking_status };
        }

        // 3. Validasi data booking
        try {
            validateBookingData(booking);
        } catch (validationError) {
            await safeUpdateStatus(connection, bookingId, 'FAILED_INVALID_DATA');
            logger.error(`❌ [VALIDATION ERROR] Booking ${bookingId}: ${validationError.message}`);
            throw validationError;
        }

        // 4. Ambil data paxes
        const [paxes] = await connection.execute(
            `SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?`,
            [bookingId]
        );

        if (paxes.length === 0) {
            throw new Error(`Data tamu (paxes) untuk booking ID ${bookingId} kosong — tidak bisa lanjut booking ke vendor.`);
        }

        // 5. Dapatkan token
        const token = await getConsistentToken();

        // 6. Format tanggal
        const checkInISO = new Date(booking.check_in_date).toISOString();
        const checkOutISO = new Date(booking.check_out_date).toISOString();

        // 7. Gunakan data persis dari database, jangan ubah format
        const cleanRoomId = String(booking.room_id).trim();
        const cleanHotelId = String(booking.hotel_id).trim();
        const cleanCityId = String(booking.city_id || "").trim();
        const cleanInternalCode = String(booking.internal_code || "SUP").trim();

        // 8. LOG data sebelum kirim ke vendor
        console.log(`🔍 [PRE-VENDOR CHECK] Booking ${bookingId}:`, {
            cityID: cleanCityId,
            hotelID: cleanHotelId,
            roomID: cleanRoomId,
            internalCode: cleanInternalCode,
            checkIn: checkInISO,
            checkOut: checkOutISO,
            paxesCount: paxes.length
        });

        // 9. Prepare Price Info Payload - PASTIKAN SAMA PERSIS dengan data dari database
        const priceInfoPayload = {
            paxPassport: "ID",
            countryID: "ID",
            cityID: cleanCityId,
            checkInDate: checkInISO,
            checkOutDate: checkOutISO,
            roomRequest: [{
                roomType: 0,
                isRequestChildBed: false,
                childNum: 0,
                childAges: [0]
            }],
            internalCode: cleanInternalCode,
            hotelID: cleanHotelId,
            breakfast: booking.breakfast_type || "Room Only",
            roomID: cleanRoomId,
            userID: USER_CONFIG.userID,
            accessToken: token
        };

        logger.debug("REQ_VENDOR_PRICE_INFO (post-payment)", JSON.stringify(priceInfoPayload, null, 2));

        // 10. Kirim Price Info ke vendor
        const priceRes = await axios.post(`${BASE_URL}/Hotel/PriceAndPolicyInfo`, priceInfoPayload, {
            httpsAgent: agent,
            timeout: 30000
        });

        const p = priceRes.data;

        logger.debug("RES_VENDOR_PRICE_INFO (post-payment)", JSON.stringify(p, null, 2));

        // 11. Cek response Price Info
        if (p.status !== "SUCCESS") {
            await safeUpdateStatus(connection, bookingId, 'FAILED_NO_ROOM');
            const reason = p.respMessage || "Kamar tidak lagi tersedia di vendor setelah pembayaran.";
            
            // Log detail error
            console.error(`🚨 [CRITICAL] Booking ID ${bookingId} DIBAYAR tapi kamar/harga tidak valid lagi:`, {
                reason: reason,
                sentData: {
                    cityID: cleanCityId,
                    hotelID: cleanHotelId,
                    roomID: cleanRoomId,
                    internalCode: cleanInternalCode
                },
                vendorResponse: p
            });
            
            throw new Error(`${reason} PERLU TINDAKAN MANUAL / REFUND.`);
        }

        // 12. Gunakan data dari response Price Info, tapi pastikan konsisten
        const vendorRoomId = p.roomID || cleanRoomId;
        const vendorHotelId = p.hotelID || cleanHotelId;
        const vendorCityId = p.cityID || cleanCityId;
        const vendorInternalCode = p.internalCode || cleanInternalCode;

        // 13. Log perbedaan jika ada (gunakan console.warn atau logger.info)
        if (vendorRoomId !== cleanRoomId) {
            console.warn(`⚠️ [ROOM_ID MISMATCH] Booking ${bookingId}: DB="${cleanRoomId}" vs Vendor="${vendorRoomId}"`);
            logger.info(`⚠️ [ROOM_ID MISMATCH] Booking ${bookingId}: DB="${cleanRoomId}" vs Vendor="${vendorRoomId}"`);
        }

        // 14. Prepare Booking Payload
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

        logger.debug("REQ_VENDOR_BOOKING (post-payment)", JSON.stringify(bookingPayload, null, 2));

        // 15. Kirim Booking ke vendor
        const bookingRes = await axios.post(`${BASE_URL}/Hotel/BookingAllSupplier`, bookingPayload, {
            httpsAgent: agent,
            timeout: 60000
        });

        const resData = bookingRes.data;

        logger.debug("RES_VENDOR_BOOKING (post-payment)", JSON.stringify(resData, null, 2));

        // 16. Cek response Booking
        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        // 17. Handle error booking
        if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            await safeUpdateStatus(connection, bookingId, 'FAILED_REJECTED');
            
            console.error(`🚨 [CRITICAL] Booking ID ${bookingId} DIBAYAR tapi DITOLAK vendor:`, {
                respMessage: resData.respMessage,
                status: resData.status,
                bookingStatus: resData.bookingStatus,
                sentData: {
                    cityID: vendorCityId,
                    hotelID: vendorHotelId,
                    roomID: vendorRoomId,
                    internalCode: vendorInternalCode
                }
            });
            
            throw new Error(`${resData.respMessage || "Vendor menolak booking"} PERLU TINDAKAN MANUAL / REFUND.`);
        }

        // 18. Proses success
        const finalStatus = isProcessed ? 'Processed' : 'Accept';

        if (isProcessed) {
            resData.reservationNo = resData.reservationNo || `PRC-${Date.now()}`;
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
        }

        // 19. Update database
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

        logger.info(`✅ [VENDOR BOOKING] Booking ID ${bookingId} sukses -> Reservasi: ${resData.reservationNo} (${finalStatus})`);

        // 20. Kirim email di background
        sendBookingEmails(bookingId).catch(err =>
            logger.error(`[MAIL ERROR] Booking ID ${bookingId}: ${err.message}`)
        );

        return { 
            success: true, 
            status: finalStatus, 
            reservationNo: resData.reservationNo, 
            bookingId,
            vendorResponse: resData
        };

    } catch (err) {
        logger.error(`❌ [VENDOR BOOKING ERROR] Booking ID ${bookingId}: ${err.message}`);
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = { processHotelBookingToVendor };