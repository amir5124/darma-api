const axios = require('axios');
const moment = require('moment-timezone');
const crypto = require('crypto');
const https = require('https');

const BASE_URL = ' https://darmawisataindonesiah2h.co.id';
const USER_CONFIG = { userID: "S8MFEIKENB", password: "8MN2WM5VZT" };

let globalAccessToken = null;
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

const logger = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    debug: (label, data) => {
        console.log(`\x1b[35m[DEBUG] === ${label} ===\x1b[0m`);
        console.dir(data, { depth: null });
        console.log(`\x1b[35m[END ${label}]\x1b[0m\n`);
    }
};

async function getConsistentToken(forceRefresh = false) {
    if (forceRefresh) globalAccessToken = null;
    if (!globalAccessToken) {
        try {
            const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
            const securityCode = md5(timestamp + md5(USER_CONFIG.password));
            const res = await axios.post(`${BASE_URL}/Session/Login`, {
                token: timestamp, securityCode, language: 0, userID: USER_CONFIG.userID
            }, { httpsAgent: agent });
            globalAccessToken = res.data.accessToken;
            logger.success(`Token Refresh: ${globalAccessToken.substring(0, 8)}...`);
        } catch (err) {
            logger.error("Login Error: " + err.message);
            throw err;
        }
    }
    return globalAccessToken;
}

module.exports = { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger };