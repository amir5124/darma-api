const axios = require('axios');
const moment = require('moment-timezone');
const crypto = require('crypto');
const https = require('https');

const BASE_URL = 'https://darmawisataindonesiah2h.co.id';
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
        console.dir(data, { depth: null, colors: true });
        console.log(`\x1b[35m[END ${label}]\x1b[0m\n`);
    }
};

async function getConsistentToken(forceRefresh = false) {
    if (forceRefresh) {
        logger.info("Force refresh dipicu, menghapus token lama...");
        globalAccessToken = null;
    }

    if (!globalAccessToken) {
        try {
            const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
            const securityCode = md5(timestamp + md5(USER_CONFIG.password));
            
            const payload = {
                token: timestamp, 
                securityCode, 
                language: 0, 
                userID: USER_CONFIG.userID
            };

            logger.info("Mencoba login ke server...");
            logger.debug("Login Payload", payload);

            const res = await axios.post(`${BASE_URL}/Session/Login`, payload, { httpsAgent: agent });

            // Cek apakah response sukses dari sisi API (biasanya ada respCode/status)
            logger.debug("Login Response Data", res.data);

            if (res.data && res.data.accessToken) {
                globalAccessToken = res.data.accessToken;
                logger.success(`Token berhasil didapat: ${globalAccessToken.substring(0, 12)}...`);
            } else {
                logger.error("Login gagal: Access Token tidak ditemukan dalam response.");
            }

        } catch (err) {
            logger.error(`Login Error: ${err.message}`);
            if (err.response) {
                logger.debug("Error Response Body", err.response.data);
            }
            throw err;
        }
    } else {
        logger.info("Menggunakan token yang sudah ada (Cache).");
    }
    
    return globalAccessToken;
}

module.exports = { BASE_URL, USER_CONFIG, agent, getConsistentToken, logger };