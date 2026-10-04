const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../config/db'); // mysql2/promise pool
const { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger } = require('../helpers/darmaSandbox');

// =====================================================
// HELPERS
// =====================================================

// Helper kecil biar tiap endpoint gak nulis ulang boilerplate axios call
async function callDarma(path, payload, logLabel) {
    const token = await getConsistentToken();
    const finalPayload = {
        ...payload,
        trainID: payload.trainID || USER_CONFIG.trainID,
        userID: USER_CONFIG.userID,
        accessToken: token
    };

    logger.info(`${logLabel}: calling ${path}`);

    const response = await axios.post(`${BASE_URL}${path}`, finalPayload, {
        httpsAgent: agent,
        headers: { 'Content-Type': 'application/json' }
    });

    return response.data;
}

// "2026-10-02T15:41:53.6529353+07:00" -> "2026-10-02 15:41:53" (aman untuk DATETIME MySQL)
const toSqlDT = (v) => (v ? String(v).substring(0, 19).replace('T', ' ') : null);
// "1992-09-29T00:00:00" -> "1992-09-29"
const toSqlDate = (v) => (v ? String(v).substring(0, 10) : null);

const PAX_TYPE_MAP = { adult: 0, child: 1, infant: 2 };
const toPaxType = (t) => {
    if (typeof t === 'number') return t;
    return PAX_TYPE_MAP[String(t || '').toLowerCase()] ?? 0;
};

const mapStatus = (s) => {
    const v = String(s || '').toUpperCase();
    if (v.startsWith('TICKET') || v === 'ISSUED') return 'TICKETED';
    if (v.startsWith('CANCEL')) return 'CANCELED';
    return 'BOOKED';
};

const isSuccess = (data) => data && data.status === 'SUCCESS';

// Transaksi DB
async function withTx(fn) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// Log request/response Darma (tanpa accessToken). Tidak pernah melempar error.
async function logApi(endpoint, bookingCode, reqBody, respData, httpOk = true) {
    try {
        const safeResp = respData ? { ...respData } : null;
        if (safeResp) delete safeResp.accessToken;

        await db.query(
            `INSERT INTO kai_api_logs
             (endpoint, booking_code, http_ok, resp_status, resp_message, request_json, response_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                endpoint,
                bookingCode || null,
                httpOk ? 1 : 0,
                safeResp?.status || null,
                safeResp?.respMessage ? String(safeResp.respMessage).substring(0, 255) : null,
                JSON.stringify(reqBody || {}),
                safeResp ? JSON.stringify(safeResp) : null
            ]
        );
    } catch (e) {
        logger.error(`API log insert failed: ${e.message}`);
    }
}

// Jalankan penyimpanan DB; kalau gagal JANGAN gagalkan response (booking sudah terjadi di Darma).
async function saveSafe(label, fn) {
    try {
        await fn();
        return true;
    } catch (e) {
        logger.error(`${label} DB save failed: ${e.message}`);
        return false;
    }
}

// Kirim response + penanda kalau DB gagal menyimpan
function respond(res, data, dbSaved) {
    if (dbSaved === false) {
        return res.json({ ...data, dbWarning: 'Transaksi sukses di provider tapi gagal disimpan ke database lokal' });
    }
    return res.json(data);
}

// Upsert booking. Nilai null/undefined tidak menimpa data lama (COALESCE).
async function upsertBooking(conn, obj) {
    const cols = Object.keys(obj);
    const keep = ['booking_code', 'booking_date_raw', 'booking_date'];
    const updCols = cols.filter((c) => !keep.includes(c));

    const sql =
        `INSERT INTO kai_bookings (${cols.join(',')})
         VALUES (${cols.map(() => '?').join(',')})
         ON DUPLICATE KEY UPDATE ${updCols.map((c) => `${c}=COALESCE(VALUES(${c}), ${c})`).join(',')}`;

    await conn.query(sql, cols.map((c) => (obj[c] === undefined ? null : obj[c])));

    const [rows] = await conn.query('SELECT id FROM kai_bookings WHERE booking_code = ? LIMIT 1', [obj.booking_code]);
    return rows[0].id;
}

async function getBookingId(conn, bookingCode) {
    const [rows] = await conn.query('SELECT id FROM kai_bookings WHERE booking_code = ? LIMIT 1', [bookingCode]);
    return rows.length ? rows[0].id : null;
}

// =====================================================
// FUNGSI PENYIMPANAN KE DB
// =====================================================

// --- BOOKING: simpan booking + penumpang (gabungan request + response) ---
async function saveBooking(reqBody, data) {
    await withTx(async (conn) => {
        const bookingId = await upsertBooking(conn, {
            booking_code: data.bookingCode,
            booking_date_raw: data.bookingDate,
            booking_date: toSqlDT(data.bookingDate),
            train_id: reqBody.trainID || USER_CONFIG.trainID,
            train_name: data.trainName,
            train_number: data.trainNumber || reqBody.trainNumber,
            origin: data.origin || reqBody.origin,
            destination: data.destination || reqBody.destination,
            origin_full: data.originFull,
            destination_full: data.destinationFull,
            depart_time: toSqlDT(data.departTime),
            arrival_time: toSqlDT(data.arrivalTime),
            availability_class: data.availabilityClass || reqBody.availabilityClass,
            sub_class: data.subClass || reqBody.subClass,
            contact_name: reqBody.contactName,
            contact_phone: reqBody.contactPhone,
            pax_adult: reqBody.paxAdult || 0,
            pax_child: reqBody.paxChild || 0,
            pax_infant: reqBody.paxInfant || 0,
            ticket_price: data.ticketPrice || 0,
            admin_fee: data.adminFee || 0,
            markup_fee: data.trainMarkup || 0,
            sales_price: data.salesPrice || 0,
            discount: data.discount || 0,
            issued_time_limit: toSqlDT(data.issuedTimeLimit),
            booking_status: 'BOOKED',
            darma_user_id: data.userID
        });

        // Booking ulang dengan kode sama -> ganti penumpang lama
        await conn.query('DELETE FROM kai_booking_passengers WHERE booking_id = ?', [bookingId]);

        const reqPax = reqBody.passengers || [];
        const respPax = data.passengers || [];
        const total = Math.max(reqPax.length, respPax.length);

        for (let i = 0; i < total; i++) {
            const rq = reqPax[i] || {};
            const rs = respPax[i] || {};

            await conn.query(
                `INSERT INTO kai_booking_passengers
                 (booking_id, name, pax_type, doc_type, id_number, birth_date, phone, is_vaccine,
                  seat_label, wagon_number, wagon_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookingId,
                    rs.name || rq.name,
                    toPaxType(rq.type ?? rs.type),
                    rq.Doctype ?? null,
                    rq.IDNumber || rs.ID || null,
                    toSqlDate(rq.birthDate || rs.birthDate),
                    rq.phone || rs.phone || null,
                    rs.isVaccine ? 1 : 0,
                    rs.seat || null,
                    rs.wagonNumber || null,
                    rs.wagonCode || null
                ]
            );
        }
    });
}

// --- TAKE SEAT: update kursi pilihan per penumpang ---
async function saveTakeSeat(reqBody) {
    await withTx(async (conn) => {
        const bookingId = await getBookingId(conn, reqBody.bookingCode);
        if (!bookingId) {
            logger.warn(`TakeSeat: booking ${reqBody.bookingCode} tidak ada di DB lokal, skip update`);
            return;
        }

        for (const p of reqBody.passengers || []) {
            await conn.query(
                `UPDATE kai_booking_passengers
                 SET seat_number = ?, wagon_number = ?, wagon_code = ?
                 WHERE booking_id = ? AND LOWER(name) = LOWER(?)`,
                [p.seatNumber, p.wagonNumber, p.wagonCode, bookingId, p.name]
            );
        }
    });
}

// --- ISSUED: tandai TICKETED ---
async function saveIssued(reqBody, data) {
    const [r] = await db.query(
        `UPDATE kai_bookings
         SET booking_status = 'TICKETED', issued_date = ?
         WHERE booking_code = ?`,
        [toSqlDT(data.respTime), reqBody.bookingCode]
    );
    if (!r.affectedRows) {
        logger.warn(`Issued: booking ${reqBody.bookingCode} tidak ada di DB lokal`);
    }
}

// --- BOOKING DETAIL: sinkronkan data lengkap (upsert) ---
async function saveBookingDetail(reqBody, data) {
    await withTx(async (conn) => {
        // booking_date_raw HANYA dari request (bookingDate di response detail sudah terpotong)
        const bookingId = await upsertBooking(conn, {
            booking_code: data.bookingCode,
            booking_date_raw: reqBody.bookingDate,
            booking_date: toSqlDT(reqBody.bookingDate),
            train_id: data.trainID,
            train_name: data.trainName,
            train_number: data.trainNumber,
            origin: data.origin,
            destination: data.destination,
            origin_full: data.originFull,
            destination_full: data.destinationFull,
            depart_time: toSqlDT(data.departTime),
            arrival_time: toSqlDT(data.arrivalTime),
            availability_class: data.trainClass,
            sub_class: data.subClass,
            contact_name: data.contactName,
            contact_phone: data.contactPhone,
            pax_adult: data.paxAdult || 0,
            pax_child: data.paxChild || 0,
            pax_infant: data.paxInfant || 0,
            ticket_price: data.ticketPrice || 0,
            admin_fee: data.adminFee || 0,
            markup_fee: data.markupFee || 0,
            sales_price: data.salesPrice || 0,
            discount: data.discount || 0,
            issued_time_limit: toSqlDT(data.issuedTimeLimit),
            issued_date: toSqlDT(data.issuedDate),
            booking_status: mapStatus(data.ticketStatus),
            darma_user_id: data.userID
        });

        const [existing] = await conn.query(
            'SELECT COUNT(*) AS c FROM kai_booking_passengers WHERE booking_id = ?',
            [bookingId]
        );

        for (const p of data.passengers || []) {
            const [upd] = await conn.query(
                `UPDATE kai_booking_passengers
                 SET seat_label = ?, wagon_number_ticket = ?, wagon_code = COALESCE(?, wagon_code),
                     is_vaccine = ?, id_number = COALESCE(?, id_number),
                     birth_date = COALESCE(?, birth_date), phone = COALESCE(?, phone)
                 WHERE booking_id = ? AND LOWER(name) = LOWER(?)`,
                [
                    p.seat || null,
                    p.wagonNumber || null,
                    p.wagonCode || null,
                    p.isVaccine ? 1 : 0,
                    p.ID || null,
                    toSqlDate(p.birthDate),
                    p.phone || null,
                    bookingId,
                    p.name
                ]
            );

            // Booking belum pernah tersimpan lokal -> buat penumpangnya dari detail
            if (!upd.affectedRows && existing[0].c === 0) {
                await conn.query(
                    `INSERT INTO kai_booking_passengers
                     (booking_id, name, pax_type, id_number, birth_date, phone, is_vaccine,
                      seat_label, wagon_number_ticket, wagon_code)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        bookingId,
                        p.name,
                        toPaxType(p.type),
                        p.ID || null,
                        toSqlDate(p.birthDate),
                        p.phone || null,
                        p.isVaccine ? 1 : 0,
                        p.seat || null,
                        p.wagonNumber || null,
                        p.wagonCode || null
                    ]
                );
            }
        }
    });
}

// --- CANCEL: tandai CANCELED ---
async function saveCancel(reqBody, data) {
    const [r] = await db.query(
        `UPDATE kai_bookings
         SET booking_status = 'CANCELED', canceled_at = ?
         WHERE booking_code = ?`,
        [toSqlDT(data.respTime), reqBody.bookingCode]
    );
    if (!r.affectedRows) {
        logger.warn(`Cancel: booking ${reqBody.bookingCode} tidak ada di DB lokal`);
    }
}

// =====================================================
// 0. GET TRAIN LIST (sumber trainID yang valid)
// POST /Train/List
// =====================================================
router.post('/list', async (req, res) => {
    try {
        const data = await callDarma('/Train/List', {}, 'REQ_TRAIN_LIST');

        res.json(data);
    } catch (error) {
        logger.error("Train List Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 1. GET TRAIN ROUTES
// POST /Train/Route
// =====================================================
router.post('/routes', async (req, res) => {
    try {
        const { trainID } = req.body;

        const data = await callDarma('/Train/Route', { trainID }, 'REQ_TRAIN_ROUTES');

        res.json(data);
    } catch (error) {
        logger.error("Train Route Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 2. GET TRAIN SCHEDULE
// POST /Train/Schedule
// =====================================================
router.post('/schedule', async (req, res) => {
    try {
        const {
            trainID,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            origin,
            destination
        } = req.body;

        const data = await callDarma('/Train/Schedule', {
            trainID,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            origin,
            destination
        }, 'REQ_TRAIN_SCHEDULE');

        res.json(data);
    } catch (error) {
        logger.error("Train Schedule Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 3. GET SEAT MAP
// POST /Train/SeatMap
// =====================================================
router.post('/seatmap', async (req, res) => {
    try {
        const {
            origin,
            destination,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            trainNumber,
            trainID,
            subClass,
            bookingCode,
            bookingDate
        } = req.body;

        const data = await callDarma('/Train/SeatMap', {
            origin,
            destination,
            paxAdult,
            paxChild,
            paxInfant,
            departDate,
            trainNumber,
            trainID,
            subClass,
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_SEATMAP');

        res.json(data);
    } catch (error) {
        logger.error("Train SeatMap Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 4. TAKE SEAT
// POST /Train/TakeSeat
// =====================================================
router.post('/take-seat', async (req, res) => {
    try {
        const {
            passengers,
            bookingCode,
            bookingDate,
            trainID
        } = req.body;

        const data = await callDarma('/Train/TakeSeat', {
            passengers,
            bookingCode,
            bookingDate,
            trainID
        }, 'REQ_TRAIN_TAKESEAT');

        await logApi('take-seat', bookingCode, req.body, data);

        let dbSaved;
        if (isSuccess(data)) {
            dbSaved = await saveSafe('TakeSeat', () => saveTakeSeat(req.body));
        }

        respond(res, data, dbSaved);
    } catch (error) {
        logger.error("Train TakeSeat Error: " + error.message);
        await logApi('take-seat', req.body?.bookingCode, req.body, { status: 'ERROR', respMessage: error.message }, false);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 5. BOOKING
// POST /Train/Booking
// =====================================================
router.post('/booking', async (req, res) => {
    try {
        const {
            origin,
            destination,
            departDate,
            trainNumber,
            availabilityClass,
            subClass,
            contactName,
            contactPhone,
            paxAdult,
            paxChild,
            paxInfant,
            passengers,
            trainID
        } = req.body;

        const data = await callDarma('/Train/Booking', {
            origin,
            destination,
            departDate,
            trainNumber,
            availabilityClass,
            subClass,
            contactName,
            contactPhone,
            paxAdult,
            paxChild,
            paxInfant,
            passengers,
            trainID
        }, 'REQ_TRAIN_BOOKING');

        await logApi('booking', data?.bookingCode, req.body, data);

        let dbSaved;
        if (isSuccess(data) && data.bookingCode) {
            dbSaved = await saveSafe('Booking', () => saveBooking(req.body, data));
        }

        respond(res, data, dbSaved);
    } catch (error) {
        logger.error("Train Booking Error: " + error.message);
        await logApi('booking', null, req.body, { status: 'ERROR', respMessage: error.message }, false);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 6. ISSUED
// POST /Train/Issued
// =====================================================
router.post('/issued', async (req, res) => {
    try {
        const { bookingCode, bookingDate } = req.body;

        const data = await callDarma('/Train/Issued', {
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_ISSUED');

        await logApi('issued', bookingCode, req.body, data);

        let dbSaved;
        if (isSuccess(data)) {
            dbSaved = await saveSafe('Issued', () => saveIssued(req.body, data));
        }

        respond(res, data, dbSaved);
    } catch (error) {
        logger.error("Train Issued Error: " + error.message);
        await logApi('issued', req.body?.bookingCode, req.body, { status: 'ERROR', respMessage: error.message }, false);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 7. BOOKING DETAIL
// POST /Train/BookingDetail
// =====================================================
router.post('/booking-detail', async (req, res) => {
    try {
        const { bookingCode, bookingDate } = req.body;

        const data = await callDarma('/Train/BookingDetail', {
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_BOOKING_DETAIL');

        await logApi('booking-detail', bookingCode, req.body, data);

        let dbSaved;
        if (isSuccess(data)) {
            dbSaved = await saveSafe('BookingDetail', () => saveBookingDetail(req.body, data));
        }

        respond(res, data, dbSaved);
    } catch (error) {
        logger.error("Train BookingDetail Error: " + error.message);
        await logApi('booking-detail', req.body?.bookingCode, req.body, { status: 'ERROR', respMessage: error.message }, false);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 8. CANCEL
// POST /Train/Cancel
// =====================================================
router.post('/cancel', async (req, res) => {
    try {
        const { bookingCode, bookingDate } = req.body;

        const data = await callDarma('/Train/Cancel', {
            bookingCode,
            bookingDate
        }, 'REQ_TRAIN_CANCEL');

        await logApi('cancel', bookingCode, req.body, data);

        let dbSaved;
        if (isSuccess(data)) {
            dbSaved = await saveSafe('Cancel', () => saveCancel(req.body, data));
        }

        respond(res, data, dbSaved);
    } catch (error) {
        logger.error("Train Cancel Error: " + error.message);
        await logApi('cancel', req.body?.bookingCode, req.body, { status: 'ERROR', respMessage: error.message }, false);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

// =====================================================
// 9. DATA LOKAL (dari database, tanpa call ke Darma)
// GET /db/bookings?status=TICKETED&limit=50&offset=0
// GET /db/bookings/:bookingCode
// =====================================================
router.get('/db/bookings', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const offset = parseInt(req.query.offset, 10) || 0;
        const params = [];
        let where = '';

        if (req.query.status) {
            where = 'WHERE booking_status = ?';
            params.push(String(req.query.status).toUpperCase());
        }

        const [rows] = await db.query(
            `SELECT * FROM kai_bookings ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({ status: 'SUCCESS', data: rows });
    } catch (error) {
        logger.error("DB Bookings List Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

router.get('/db/bookings/:bookingCode', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM kai_bookings WHERE booking_code = ? LIMIT 1', [req.params.bookingCode]);
        if (!rows.length) {
            return res.status(404).json({ status: 'NOT_FOUND', respMessage: 'Booking tidak ditemukan' });
        }

        const [pax] = await db.query(
            'SELECT * FROM kai_booking_passengers WHERE booking_id = ? ORDER BY id',
            [rows[0].id]
        );

        res.json({ status: 'SUCCESS', data: { ...rows[0], passengers: pax } });
    } catch (error) {
        logger.error("DB Booking Detail Error: " + error.message);
        res.status(500).json({ status: "ERROR", respMessage: error.message });
    }
});

module.exports = router;