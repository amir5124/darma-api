const axios = require('axios');
const moment = require('moment-timezone');
const crypto = require('crypto');
const https = require('https');

const BASE_URL = 'https://uat-backup.darmawisataindonesiah2h.co.id:7080/h2h';
const USER_CONFIG = { userID: "CF0X64HBR8", password: "Darmaj4y4" };

// State untuk manajemen token
let globalAccessToken = null;
let tokenExpiry = null; 
let isRefreshing = false;
let refreshSubscribers = [];

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


// Fungsi antrean agar request lain menunggu proses login selesai
function subscribeTokenRefresh(cb) {
    refreshSubscribers.push(cb);
}

function onRefreshed(token) {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
}

/**
 * Mendapatkan token dengan proteksi multiple-request
 */
async function getConsistentToken(forceRefresh = false) {
    const sekarang = Date.now();
    
    if (!forceRefresh && globalAccessToken && tokenExpiry && sekarang < tokenExpiry) {
        return globalAccessToken;
    }

    if (isRefreshing && !forceRefresh) {
        return new Promise((resolve) => subscribeTokenRefresh(resolve));
    }

    isRefreshing = true;
    try {
        const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
        const securityCode = md5(timestamp + md5(USER_CONFIG.password));
        
        const res = await axios.post(`${BASE_URL}/Session/Login`, {
            token: timestamp, 
            securityCode, 
            language: 0, 
            userID: USER_CONFIG.userID
        }, { httpsAgent: agent });

        if (res.data && res.data.accessToken) {
            globalAccessToken = res.data.accessToken;
            tokenExpiry = Date.now() + (25 * 60 * 1000); // Valid 25 menit
            logger.success(`Token Baru: ${globalAccessToken.substring(0, 8)}...`);
            
            onRefreshed(globalAccessToken);
            return globalAccessToken;
        } else {
            throw new Error(res.data.statusMessage || "Gagal Login");
        }
    } catch (err) {
        logger.error("Login Gagal: " + err.message);
        throw err;
    } finally {
        isRefreshing = false;
    }
}

const api = axios.create({
    baseURL: BASE_URL,
    httpsAgent: agent,
    timeout: 60000 
});

// Interceptor Request
api.interceptors.request.use(async (config) => {
    const token = await getConsistentToken();
    if (!config.data) config.data = {};
    config.data.accessToken = token;
    return config;
}, (error) => Promise.reject(error));

// Interceptor Response
api.interceptors.response.use(
    (response) => {
        const data = response.data;
        const sessionErrors = ["006", "106", "INVALID SESSION", "SESSION EXPIRED"];
        
        if (data && sessionErrors.some(msg => String(data.respCode).includes(msg) || String(data.statusMessage).toUpperCase().includes(msg))) {
            return Promise.reject({ config: response.config, isSessionError: true });
        }
        return response;
    }, 
    async (error) => {
        const originalRequest = error.config;
        if ((error.response?.status === 401 || error.isSessionError) && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const newToken = await getConsistentToken(true);
                // Handle data jika string (axios terkadang mengubah object ke string)
                if (typeof originalRequest.data === 'string') {
                    let parsed = JSON.parse(originalRequest.data);
                    parsed.accessToken = newToken;
                    originalRequest.data = JSON.stringify(parsed);
                } else {
                    originalRequest.data.accessToken = newToken;
                }
                return api(originalRequest);
            } catch (err) {
                return Promise.reject(err);
            }
        }
        return Promise.reject(error);
    }
);

/**
 * HEARTBEAT: Menjaga session tetap hidup setiap 15 menit
 */
setInterval(async () => {
    try {
        await api.post('/Agent/Balance', {});
        logger.info("Heartbeat: Session kept alive via /Agent/Balance");
    } catch (err) {
        logger.error("Heartbeat failed, manual login will trigger on next request.");
    }
}, 15 * 60 * 1000);

module.exports = { 
    api, 
    logger, 
    getConsistentToken, // Tambahkan ini agar bisa dipanggil file lain
    USER_CONFIG, 
    BASE_URL, 
    agent 
};