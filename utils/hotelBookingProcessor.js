// utils/hotelBookingProcessor.js
//
// Tujuan file ini:
// Memindahkan logic "executeFinalBooking()" yang SEBELUMNYA jalan di browser (dipicu polling)
// menjadi proses server-side yang dipicu langsung oleh payment callback LinkQu.
//
// Ini menyelesaikan masalah: booking ke vendor hotel hilang/tidak terjadi kalau user
// menutup tab / koneksi putus / app di-background setelah bayar.
//
// CATATAN PENTING SEBELUM PAKAI:
// 1. Sesuaikan nama kolom di query SELECT/UPDATE dengan skema tabel `hotel_bookings` kamu
//    yang sebenarnya (saya samakan dengan pola INSERT di hotelRoutes.js /booking dan /draft).
// 2. Fungsi `sendBookingEmails(bookingId)` diasumsikan sudah ada di `utils/hotelMailer.js`
//    (sudah dipakai di endpoint /hotel-bookings/update-after-vendor). Kalau signature-nya
//    beda, sesuaikan pemanggilannya di bagian bawah.
// 3. Pastikan `getConsistentToken`, `BASE_URL`, `USER_CONFIG`, `agent`, `logger` diexport
//    dari '../helpers/darmaHelper' (sudah dipakai konsisten di hotelRoutes.js).

const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaHelper');
const { sendBookingEmails } = require('./hotelMailer');

/**
 * Memproses booking hotel yang statusnya masih PENDING/PAID ke vendor (Darma),
 * lalu mengupdate DB dan memicu pengiriman email.
 *
 * WAJIB idempotent: kalau dipanggil 2x untuk booking yang sama (misal LinkQu
 * mengirim callback duplikat, yang memang lazim terjadi), booking ke vendor
 * TIDAK boleh dikirim dua kali.
 *
 * @param {number} bookingId - id di tabel hotel_bookings
 * @returns {Promise<object>} hasil proses
 */
async function processHotelBookingToVendor(bookingId) {
    let connection;
    try {
        connection = await db.getConnection();

        // 1. Ambil data booking (hasil dari /hotel-bookings/draft sebelumnya)
        const [rows] = await connection.execute(
            `SELECT * FROM hotel_bookings WHERE id = ?`,
            [bookingId]
        );

        if (rows.length === 0) {
            throw new Error(`Booking ID ${bookingId} tidak ditemukan di database.`);
        }

        const booking = rows[0];

        // 2. IDEMPOTENCY CHECK — Ini kunci utama agar tidak double-booking ke vendor
        //    kalau callback pembayaran terkirim berkali-kali (retry dari LinkQu itu normal).
        if (['Accept', 'Processed'].includes(booking.booking_status)) {
            logger.info(`[VENDOR BOOKING] Booking ID ${bookingId} sudah pernah diproses (status: ${booking.booking_status}). Dilewati.`);
            return { skipped: true, reason: 'already_processed', bookingId, status: booking.booking_status };
        }

        // 3. Ambil data tamu yang sudah disimpan waktu draft dibuat
        const [paxes] = await connection.execute(
            `SELECT title, first_name AS firstName, last_name AS lastName FROM hotel_booking_paxes WHERE booking_id = ?`,
            [bookingId]
        );

        if (paxes.length === 0) {
            throw new Error(`Data tamu (paxes) untuk booking ID ${bookingId} kosong — tidak bisa lanjut booking ke vendor.`);
        }

        const token = await getConsistentToken();

        // 4. Re-validasi harga & ketersediaan kamar ke vendor (harga bisa berubah sejak draft dibuat)
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

        if (p.status !== "SUCCESS") {
            // Kamar sudah tidak tersedia setelah customer bayar — kasus langka tapi harus ditangani manual
            await connection.execute(
                `UPDATE hotel_bookings SET booking_status = 'FAILED_VENDOR_NO_ROOM', updated_at = NOW() WHERE id = ?`,
                [bookingId]
            );
            throw new Error(p.respMessage || "Kamar tidak lagi tersedia di vendor setelah pembayaran. PERLU TINDAKAN MANUAL / REFUND.");
        }

        // 5. Kirim payload booking sungguhan ke vendor
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
        const msg = (resData.respMessage || "").toUpperCase();
        const isProcessed = (resData.status === "FAILED" || resData.status === "ERROR") && msg.includes("PROCESSED");
        const isAccepted = resData.bookingStatus && resData.bookingStatus.trim() === "Accept";

        if (!(resData.status === "SUCCESS" || isAccepted || isProcessed)) {
            // Vendor menolak PADAHAL customer sudah bayar — kasus paling kritis.
            // Jangan biarkan ini silent — tandai khusus supaya kelihatan di dashboard admin.
            await connection.execute(
                `UPDATE hotel_bookings SET booking_status = 'FAILED_VENDOR_REJECTED', updated_at = NOW() WHERE id = ?`,
                [bookingId]
            );
            logger.error(`🚨 [CRITICAL] Booking ID ${bookingId} DIBAYAR tapi DITOLAK vendor: ${resData.respMessage}`);
            throw new Error(resData.respMessage || "Vendor menolak booking setelah pembayaran diterima. PERLU TINDAKAN MANUAL / REFUND.");
        }

        const finalStatus = isProcessed ? 'Processed' : 'Accept';

        if (isProcessed) {
            resData.reservationNo = resData.reservationNo || `PRC-${Date.now()}`;
            resData.voucherNo = resData.voucherNo || resData.reservationNo;
        }

        // 6. Update DB dengan hasil reservasi dari vendor
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

        // 7. Kirim email e-voucher/tiket — non-blocking, jangan sampai email lambat menahan response callback
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