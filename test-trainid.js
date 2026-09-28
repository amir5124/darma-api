/**
 * test-trainid.js
 *
 * Script diagnostik: coba beberapa kandidat trainID ke Darma /Train/Route
 * satu-satu, biar ketahuan mana yang valid tanpa harus tebak manual di Postman.
 *
 * Cara pakai (di server kamu, satu folder sama dengan helpers/darmaSandbox.js):
 *   node test-trainid.js
 */

const axios = require('axios');
const { BASE_URL, USER_CONFIG, agent, getConsistentToken } = require('./helpers/darmaSandbox');

// Kandidat nilai yang mau dicoba. Silakan tambah/kurangi sendiri.
const CANDIDATES = [
    // Kode stasiun KAI umum
    'PK', 'GMR', 'BD', 'SMT', 'SBI', 'YK', 'SLO', 'CN',
    // Kemungkinan format numerik / string umum
    '1', '01', '001', '0', 'KAI', 'KA', 'KERETA', 'TRAIN', 'TRAIN01', 'TRAIN1', 'DARMA', 'KAI01', 'KAI001',
    // Kemungkinan trainID sama dengan userID (kadang API begini menyamakan)
    USER_CONFIG.userID,
];

async function tryOne(trainID) {
    const token = await getConsistentToken();
    const payload = {
        trainID,
        userID: USER_CONFIG.userID,
        accessToken: token
    };
    try {
        const res = await axios.post(`${BASE_URL}/Train/Route`, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' }
        });
        return res.data;
    } catch (e) {
        return { status: 'ERROR', respMessage: e.message };
    }
}

(async () => {
    console.log('=== Uji coba trainID ke /Train/Route ===\n');
    for (const id of CANDIDATES) {
        if (!id) continue;
        const data = await tryOne(id);
        const ok = data.status && !/error|fail/i.test(data.status);
        console.log(
            `trainID="${id}" -> status=${data.status || '-'} | pesan=${data.respMessage || '-'} ${ok ? '  <== KEMUNGKINAN VALID' : ''}`
        );
        // jeda kecil biar tidak dianggap spam ke server Darma
        await new Promise(r => setTimeout(r, 400));
    }
    console.log('\nSelesai. Kalau semua tetap "invalid", trainID memang harus didapat dari Darma langsung (bukan bisa ditebak).');
})();