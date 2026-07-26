const axios = require('axios');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const db = require('../config/db');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken } = require('./darmaSandbox');
const { sendBookingEmail } = require('../utils/mailer');

// ==========================================================
// 1. GENERATE HTML TIKET (dipindahkan apa adanya dari flights.js)
// ==========================================================
async function getTicketHtmlContent(bookingCode, dbConn) {
    const [rows] = await dbConn.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
    if (rows.length === 0) throw new Error("Booking tidak ditemukan");

    const booking = rows[0];
    const ticketPrice = Number(booking.total_price) || 0;
    const adminFee = Number(booking.admin_fee) || 0;
    const totalAmount = ticketPrice + adminFee;
    const eticketNumber = booking.reference_no || '-';
    const payload = typeof booking.payload_request === 'string' ? JSON.parse(booking.payload_request) : booking.payload_request;
    const response = typeof booking.raw_response === 'string' ? JSON.parse(booking.raw_response) : booking.raw_response;

    const calculateDuration = (depart, arrival) => {
        if (!depart || !arrival) return '--';
        const start = new Date(depart);
        const end = new Date(arrival);
        const diffMs = end - start;
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.round(((diffMs % 3600000) / 60000));
        return `${diffHrs}j ${diffMins}m`;
    };

    const baggageMap = { "PBAA": "15kg", "PBAB": "20kg", "PBAC": "25kg", "PBAD": "30kg", "PBAF": "40kg" };
    const mealMap = { "NPCB": "Nasi Padang", "NLCB": "Pak Nasser", "NKCB": "Nasi Kuning", "GCCB": "Thai Green", "CRCB": "Uncle Chin" };
    const airlineNames = { "QZ": "AirAsia", "ID": "Batik Air", "GA": "Garuda Indonesia", "JT": "Lion Air", "QG": "Citilink" };
    const defaultBaggage = {
        "GA": "20kg", "ID": "20kg", "QG": "15kg", "JT": "0kg", "IW": "0kg",
        "QZ": "0kg", "SJ": "20kg", "IN": "20kg", "IU": "20kg", "IP": "20kg", "TN": "10kg"
    };

    const qrDataUrl = await QRCode.toDataURL(response.bookingCodeAirline || booking.booking_code);

    const renderFlightSection = (flightSegments, titleLabel, isReturn = false) => {
        if (!flightSegments || flightSegments.length === 0) return '';
        return flightSegments.map((f) => {
            const departTime = f.fdDepartTime || f.schDepartTime;
            const arrivalTime = f.fdArrivalTime || f.schArrivalTime;
            const dateObj = new Date(departTime);
            const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const fullDateTitle = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const jamDep = departTime.includes('T') ? departTime.split('T')[1].substring(0, 5) : departTime.substring(11, 16);
            const jamArr = arrivalTime.includes('T') ? arrivalTime.split('T')[1].substring(0, 5) : arrivalTime.substring(11, 16);
            const durationText = calculateDuration(departTime, arrivalTime);
            const originPortName = isReturn ? booking.destination_port : booking.origin_port;
            const destPortName = isReturn ? booking.origin_port : booking.destination_port;

            return `
            <div class="flight-box">
                <div class="flight-header">${titleLabel} - ${fullDateTitle}</div>
                <div class="flight-content">
                    <div class="airline-info">
                        <div class="airline-name">${airlineNames[booking.airline_id] || booking.airline_id}</div>
                        <div class="flight-number">${booking.airline_id} ${f.flightNumber}</div>
                        <div class="class-info">Class ${f.fdFlightClass || f.flightClass || 'Y'} (eco)</div>
                    </div>
                    <div class="route-display">
                        <div class="time-block">
                            <div class="date-text">${dateStr}</div>
                            <div class="time-text">${jamDep}</div>
                            <div class="station-text">${f.fdOrigin || f.schOrigin}</div>
                            <div class="port-text">${originPortName || ''}</div>
                        </div>
                        <div class="path-line">
                            <div class="duration">${durationText}</div>
                            <div class="line-container"><span class="circle-hollow"></span><span class="hr-line"></span><span class="circle-solid"></span></div>
                        </div>
                        <div class="time-block" style="text-align: right;">
                            <div class="date-text">${dateStr}</div>
                            <div class="time-text">${jamArr}</div>
                            <div class="station-text">${f.fdDestination || f.schDestination}</div>
                            <div class="port-text">${destPortName || ''}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    };

    const passengers = response.passengers || payload.paxDetails || [];
    const isRoundTrip = payload.tripType === "RoundTrip";

    const paxRows = passengers.map((p, pIdx) => {
        const isInfant = p.type === 'Infant' || parseInt(p.type) === 2;
        const typeLabel = isInfant ? 'Infant<small>Bayi</small>' : (p.type === 'Child' || parseInt(p.type) === 1 ? 'Child<small>Anak</small>' : 'Adult<small>Dewasa</small>');
        const originalPax = payload.paxDetails ? payload.paxDetails[pIdx] : null;
        const adPergi = originalPax?.addOns?.[0] || null;
        const adPulang = isRoundTrip ? (originalPax?.addOns?.[1] || null) : null;
        const getBagLabel = (ad) => {
            if (isInfant) return '-';
            const raw = ad?.baggageString || "";
            return (raw === "" || raw === "-") ? (defaultBaggage[booking.airline_id] || "0kg") : (baggageMap[raw] || raw);
        };
        const bagInfo = isRoundTrip ? `<div style="border-bottom:1px solid #eee; padding-bottom:2px;">🛫 ${getBagLabel(adPergi)}</div><div style="padding-top:2px;">🛬 ${getBagLabel(adPulang)}</div>` : getBagLabel(adPergi);
        const seatInfo = isRoundTrip ? `${adPergi?.seat || '-'} / ${adPulang?.seat || '-'}` : (adPergi?.seat || '-');
        const getMeals = (ad, label) => {
            if (!ad || !ad.meals || ad.meals.length === 0) return '';
            return `<div style="font-size:7px; line-height:1"><b>${label}:</b> ${ad.meals.map(m => mealMap[m] || m).join(', ')}</div>`;
        };
        const mealsInfo = isRoundTrip ? `${getMeals(adPergi, 'Pergi')} ${getMeals(adPulang, 'Pulang')}` || '-' : (adPergi?.meals?.length > 0 ? adPergi.meals.map(m => mealMap[m] || m).join(', ') : '-');

        return `<tr><td style="text-align:center">${pIdx + 1}</td><td><b>${p.title} ${p.firstName} ${p.lastName}</b></td><td>${typeLabel}</td><td style="text-align:center">${seatInfo}</td><td style="text-align:center; font-size:8.5px;">${bagInfo}</td><td style="font-size:8.5px;">${mealsInfo}</td></tr>`;
    }).join('');

    return `
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; color: #333; padding: 0; margin: 0; font-size: 10px; line-height: 1.4; }
            .container { padding: 25px; }
            .header-table { width: 100%; margin-bottom: 10px; }
            .purchased-from { font-size: 9px; color: #777; }
            .port-text { font-size: 7.5px; color: #666; font-weight: normal; text-transform: uppercase; margin-top: 1px; max-width: 120px; }
            .time-block { display: flex; flex-direction: column; }
            .top-icons { display: table; width: 100%; margin: 15px 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
            .icon-item { display: table-cell; vertical-align: middle; }
            .icon-left { text-align: left; width: 33%; }
            .icon-center { text-align: center; width: 34%; }
            .icon-right { text-align: right; width: 33%; }
            .icon-wrapper { display: inline-flex; align-items: center; gap: 8px; text-align: left; }
            .icon-wrapper img { width: 28px; height: 28px; }
            .icon-text { font-size: 8px; color: #444; line-height: 1.2; }
            .icon-text b { display: block; font-size: 8.5px; color: #000; margin-bottom: 1px; }
            .flight-box { border: 1px solid #24b3ae; border-radius: 6px; overflow: hidden; margin-bottom: 15px; }
            .flight-header { background: #24b3ae; color: white; padding: 6px 15px; font-weight: bold; font-size: 10.5px; }
            .flight-content { display: flex; padding: 12px; align-items: center; }
            .airline-info { width: 130px; border-right: 1px solid #eee; }
            .airline-name { font-weight: bold; font-size: 12px; color: #000; }
            .flight-number { font-weight: bold; font-size: 11px; margin: 2px 0; }
            .route-display { flex-grow: 1; display: flex; justify-content: space-between; align-items: center; padding-left: 15px; }
            .time-text { font-size: 16px; font-weight: bold; color: #000; }
            .station-text { font-weight: bold; font-size: 11px; }
            .date-text { color: #24b3ae; font-weight: bold; font-size: 10px; }
            .path-line { flex-grow: 1; text-align: center; padding: 0 15px; }
            .duration { color: #24b3ae; font-size: 9px; font-weight: bold; margin-bottom: 3px; }
            .line-container { display: flex; align-items: center; justify-content: center; }
            .circle-hollow { width: 6px; height: 6px; border: 1px solid #aaa; border-radius: 50%; }
            .circle-solid { width: 7px; height: 7px; background: #24b3ae; border-radius: 50%; }
            .hr-line { flex-grow: 1; height: 1px; background: #ddd; margin: 0 3px; }
            .section-title { background: #019387ff; color: white; padding: 7px 15px; font-weight: bold; border-radius: 6px 6px 0 0; font-size: 10px; }
            .table-container { border: 1px solid #019387ff; border-radius: 0 0 6px 6px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { text-align: left; padding: 10px 8px; background: #fff; border-bottom: 1px solid #24b3ae; color: #000; font-size: 9px; vertical-align: bottom; }
            th small, td small { display: block; color: #999; font-weight: normal; font-size: 7.5px; margin-top: 1px; }
            td { padding: 12px 8px; border-bottom: 1px solid #eee; font-size: 9.5px; word-wrap: break-word; vertical-align: middle; }
            .fare-section { margin-top: 15px; }
            .fare-row { background: #f2f2f2; padding: 10px 15px; display: flex; justify-content: space-between; font-weight: bold; border-radius: 4px; font-size: 10.5px; }
            .total-row { padding: 10px 15px; display: flex; justify-content: flex-end; align-items: center; gap: 30px; }
            .total-amount { font-size: 18px; font-weight: 900; color: #000; }
            .important-note { margin-top: 20px; background: #fff; }
            .note-header { background: #e9ecef; padding: 5px 15px; font-weight: bold; display: flex; align-items: center; gap: 10px; font-size: 11px; }
            .note-content { padding: 10px 0; list-style: none; margin: 0;}
            .note-content li { margin-bottom: 10px; position: relative; padding-left: 20px; font-size: 10px; }
            .note-content li::before { content: attr(data-number); position: absolute; left: 0; font-weight: bold; }
            .note-content small { display: block; color: #777; font-size: 9px; }
            .footer-border { border-bottom: 5px solid #24b3ae; margin-top: 15px; border-radius: 0 0 5px 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <table class="header-table">
                <tr>
                    <td>
                        <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png" height="50" style="margin-bottom: 10px;">
                        <div class="purchased-from">Jln. Negara rt.16 Tengin Baru Kec. Sepaku<br> Kab. Penajam Paser Utara -IKN<br> Telp: 081347423737<br>E-mail: linkuikn@gmail.com</div>
                    </td>
                    <td align="right" style="vertical-align: top;">
                        <img src="${qrDataUrl}" width="75">
                        <div style="margin-top: 5px; text-align: center; width: 85px;">
                            <div style="font-size: 8px; color: #666; text-transform: uppercase;">Booking Code</div>
                            <div style="font-size: 14px; font-weight: bold; color: #24b3ae; letter-spacing: 1px;">${response.bookingCodeAirline || booking.booking_code}</div>
                            <div style="font-size: 7px; color: #666; text-transform: uppercase; margin-top: 4px;">Eticket Number</div>
                            <div style="font-size: 7px; font-weight: bold; color: #333;">${eticketNumber}</div>
                        </div>
                    </td>
                </tr>
            </table>
            <h2 style="color:#24b3ae; border-bottom: 1.5px solid #24b3ae; padding-bottom:5px; margin: 10px 0;">E-ticket | <small style="font-weight:normal; font-size:14px;">E-tiket</small></h2>
            <div class="top-icons">
                <div class="icon-item icon-left"><div class="icon-wrapper"><img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877882/ticket_wdqwvp.png"><div class="icon-text"><b>Show E-ticket & ID Card</b>Perlihatkan E-tiket & Identitas</div></div></div>
                <div class="icon-item icon-center"><div class="icon-wrapper"><img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877884/schedule_zenfxq.png"><div class="icon-text"><b>Check-In 90 min before</b>Check-In minimal 90 menit</div></div></div>
                <div class="icon-item icon-right"><div class="icon-wrapper"><img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877886/plane_ojmtak.png"><div class="icon-text"><b>Local Airport Time</b>Waktu Bandara Setempat</div></div></div>
            </div>
            ${renderFlightSection(response.flightDeparts || response.schDeparts, 'Departure / Pergi')}
            ${(response.flightReturns || (response.schReturns && response.schReturns.length > 0)) ? renderFlightSection(response.flightReturns || response.schReturns, 'Return / Pulang', true) : ''}
            <div class="section-title">Passenger Detail / Detail Penumpang</div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="width:30px; text-align:center">No</th>
                            <th style="width:160px;">Passenger <small>Penumpang</small></th>
                            <th style="width:70px;">Type <small>Tipe</small></th>
                            <th style="width:70px; text-align:center">Seat <small>Kursi</small></th>
                            <th style="width:80px; text-align:center">Baggage <small>Bagasi</small></th>
                            <th style="width:100px;">Add-ons <small>Makanan</small></th>
                        </tr>
                    </thead>
                    <tbody>${paxRows}</tbody>
                </table>
            </div>
            <div class="fare-section">
                <div class="fare-title">Fares Detail | Detail Harga</div>
                <div class="fare-row" style="background: none; border-bottom: 1px solid #eee;">
                    <span>Ticket for ${passengers.length} Passenger <br><small style="font-weight:normal; color:#666;">Tiket untuk ${passengers.length} penumpang</small></span>
                    <span>IDR ${totalAmount.toLocaleString('id-ID')},-</span>
                </div>
                <div class="total-row">
                    <div style="text-align:right"><b>Total Amount</b><br><small style="color:#666">Total Pembayaran</small></div>
                    <div class="total-amount">IDR ${totalAmount.toLocaleString('id-ID')},-</div>
                </div>
            </div>
            <div class="important-note">
                <div class="note-header">Important Note | Catatan Penting</div>
                <ul class="note-content">
                    <li data-number="1.">The name of the <b>identity card (Indonesians KTP)</b> or passport must match the name passenger shown above</li>
                    <li data-number="2.">Please arrive at the airport <b>90 minutes</b> before the flight for domestic travel and <b>2 hours</b> for international travel</li>
                    <li data-number="3.">Check-in closes 45 minutes before departure time.</li>
                    <li data-number="4.">Passengers are allowed to bring up to 7kg of hand luggage onboard.</li>
                </ul>
            </div>
            <div style="text-align: center; color: #000000; margin: 20px 0; font-weight: bold;">Support PT Darmawisata Indonesia</div>
            <div class="footer-border"></div>
        </div>
    </body>
    </html>`;
}

// ==========================================================
// 2. GENERATE PDF BUFFER (dipindahkan dari flights.js)
// ==========================================================
async function generatePdfBuffer(htmlContent) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0.4cm', bottom: '0.4cm', left: '0.4cm', right: '0.4cm' }
    });
    await browser.close();
    return pdfBuffer;
}

// ==========================================================
// 3. KIRIM EMAIL TIKET (dipindahkan dari flights.js)
// ==========================================================
async function sendTicketEmail(bookingCode) {
    try {
        const [rows] = await db.execute("SELECT customer_email FROM bookings WHERE booking_code = ?", [bookingCode]);
        if (rows.length === 0 || !rows[0].customer_email) return;

        const htmlContent = await getTicketHtmlContent(bookingCode, db);
        const pdfBuffer = await generatePdfBuffer(htmlContent);

        const email = rows[0].customer_email;
        const subject = `[LinkU] E-Ticket Berhasil Terbit - ${bookingCode}`;

        const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h3>Tiket Anda <b>${bookingCode}</b> sudah terbit!</h3>
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
            <p style="margin-bottom: 16px;">Terima kasih telah memesan melalui <b>LinkU</b> 🙏✨</p>
            <p style="margin-bottom: 16px;">🎫 E-Tiket resmi Anda telah kami lampirkan pada email ini dalam format <b>PDF</b> 📩</p>
            <p style="margin-bottom: 16px;">Mohon disimpan dengan baik 💾 dan ditunjukkan saat keberangkatan 🛫</p>
            <p style="margin-top: 24px; margin-bottom: 8px;">Terima kasih atas kepercayaan Anda ❤️</p>
            <p style="font-style: color: #24b3ae; font-weight: bold;">LinkU – Satu aplikasi semua kebutuhan 🚀</p>
        </div>
        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px;">
            <p style="margin: 2px 0;">WA : 081347423737</p>
            <p style="margin: 2px 0;">Email : linkuikn@gmail.com</p>
            <p style="margin: 2px 0;">IG : @linkuapps</p>
            <p style="margin: 2px 0;">FB : Linku Nusantara</p>
        </div>
    </div>
`;

        await sendBookingEmail(email, subject, emailBody, [
            {
                filename: `E-Ticket-${bookingCode}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]);

        console.log(`📧 [SUCCESS] E-Ticket dikirim ke ${email}`);
    } catch (err) {
        console.error("❌ Error di sendTicketEmail:", err.message);
    }
}

// ==========================================================
// 4. ISSUE TICKET KE VENDOR (fungsi baru — dipakai oleh callback & route manual)
// ==========================================================
async function issueTicketForBooking(bookingCode) {
    const [rows] = await db.execute("SELECT * FROM bookings WHERE booking_code = ?", [bookingCode]);
    if (rows.length === 0) throw new Error("Booking tidak ditemukan: " + bookingCode);
    const b = rows[0];

    if ((b.ticket_status || '').toLowerCase() === 'ticketed') {
        return { status: "SUCCESS", already: true, respMessage: "Tiket sudah terbit sebelumnya" };
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
            bookingDate: (b.created_at || '').toString().split('.')[0],
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
        sendTicketEmail(bookingCode).catch(e => console.error("Background Email Error:", e.message));
    }

    return response.data;
}

module.exports = {
    issueTicketForBooking,
    sendTicketEmail,
    getTicketHtmlContent,
    generatePdfBuffer
};