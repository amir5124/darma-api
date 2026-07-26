// helpers/ticketService.js
const axios = require('axios');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken } = require('./darmaHelper');

async function issueTicketForBooking(bookingCode) {
    const [rows] = await db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
    if (rows.length === 0) throw new Error("Booking tidak ditemukan: " + bookingCode);
    const b = rows[0];

    // Guard: kalau sudah ticketed, jangan issue ulang
    if ((b.ticket_status || '').toLowerCase() === 'ticketed') {
        return { status: "SUCCESS", already: true };
    }

    const token = await getConsistentToken();
    const response = await axios.post(
        `${BASE_URL}/Airline/Issued`,
        {
            airlineID: b.airline_id,
            origin: (b.origin || "").substring(0, 3),
            destination: (b.destination || "").substring(0, 3),
            tripType: b.trip_type || "OneWay",
            departDate: b.depart_date,
            returnDate: "0001-01-01T00:00:00",
            bookingCode: b.booking_code,
            bookingDate: b.created_at, // sesuaikan kolom timestamp booking Anda
            airlineAccessCode: b.airline_id,
            userID: USER_CONFIG.userID,
            accessToken: token
        },
        { httpsAgent: agent }
    );

    if (response.data.status === "SUCCESS") {
        await db.execute(
            "UPDATE bookings SET ticket_status = 'Ticketed' WHERE booking_code = ?",
            [bookingCode]
        );
        sendTicketEmail(bookingCode).catch(e => console.error("Email Error:", e.message));
    }
    return response.data;
}

module.exports = { issueTicketForBooking, sendTicketEmail, getTicketHtmlContent, generatePdfBuffer };