// helpers/darmaSandbox.js
const axios = require('axios');
const moment = require('moment-timezone');
const crypto = require('crypto');
const https = require('https');

const BASE_URL = 'https://uat-backup.darmawisataindonesiah2h.co.id:7080/h2h';
const USER_CONFIG = { 
    userID: "CF0X64HBR8", 
    password: "Darmaj4y4" 
};

// State untuk manajemen token
let globalAccessToken = null;
let tokenExpiry = null; 
let isRefreshing = false;
let refreshSubscribers = [];

const agent = new https.Agent({ 
    rejectUnauthorized: false, 
    keepAlive: true 
});

const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

const logger = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
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
        logger.debug("Token Cache", { token: globalAccessToken.substring(0, 8) + '...', expires: new Date(tokenExpiry).toISOString() });
        return globalAccessToken;
    }

    if (isRefreshing && !forceRefresh) {
        logger.info("⏳ Menunggu token sedang direfresh...");
        return new Promise((resolve) => subscribeTokenRefresh(resolve));
    }

    isRefreshing = true;
    try {
        const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
        const securityCode = md5(timestamp + md5(USER_CONFIG.password));
        
        logger.info(`🔄 Requesting new token at ${timestamp}`);
        
        const res = await axios.post(`${BASE_URL}/Session/Login`, {
            token: timestamp, 
            securityCode, 
            language: 0, 
            userID: USER_CONFIG.userID
        }, { 
            httpsAgent: agent,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        logger.debug("Login Response", res.data);

        if (res.data && res.data.accessToken) {
            globalAccessToken = res.data.accessToken;
            tokenExpiry = Date.now() + (25 * 60 * 1000); // Valid 25 menit
            logger.success(`✅ Token Baru: ${globalAccessToken.substring(0, 8)}... (expires in 25 min)`);
            
            onRefreshed(globalAccessToken);
            return globalAccessToken;
        } else {
            throw new Error(res.data.statusMessage || "Gagal Login - No accessToken in response");
        }
    } catch (err) {
        logger.error("❌ Login Gagal: " + err.message);
        if (err.response) {
            logger.error("Response Status:", err.response.status);
            logger.error("Response Data:", JSON.stringify(err.response.data, null, 2));
        }
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
    try {
        const token = await getConsistentToken();
        if (!config.data) config.data = {};
        
        // Jika data sudah string (JSON stringify), parse dulu
        if (typeof config.data === 'string') {
            const parsed = JSON.parse(config.data);
            parsed.accessToken = token;
            config.data = JSON.stringify(parsed);
        } else {
            config.data.accessToken = token;
        }
        
        // Tambahkan headers untuk debugging
        config.headers = {
            ...config.headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        return config;
    } catch (error) {
        logger.error("❌ Interceptor Error:", error.message);
        return Promise.reject(error);
    }
}, (error) => Promise.reject(error));

// Interceptor Response - Handle session expired
api.interceptors.response.use(
    (response) => {
        const data = response.data;
        
        // Cek response untuk session error
        const sessionErrors = ["006", "106", "INVALID SESSION", "SESSION EXPIRED", "request failed"];
        
        if (data && sessionErrors.some(msg => {
            const respCode = String(data.respCode || data.respCode || '');
            const statusMsg = String(data.statusMessage || data.respMessage || '');
            return respCode.includes(msg) || statusMsg.toUpperCase().includes(msg);
        })) {
            logger.warn(`⚠️ Session error detected, will retry with new token`);
            return Promise.reject({ 
                config: response.config, 
                isSessionError: true,
                response: response 
            });
        }
        
        return response;
    }, 
    async (error) => {
        const originalRequest = error.config;
        
        // Jika error karena session atau 401, coba refresh token
        if ((error.response?.status === 401 || error.isSessionError) && !originalRequest._retry) {
            originalRequest._retry = true;
            logger.info(`🔄 Retry request with new token: ${originalRequest.url}`);
            
            try {
                // Force refresh token
                const newToken = await getConsistentToken(true);
                
                // Update data dengan token baru
                if (typeof originalRequest.data === 'string') {
                    let parsed = JSON.parse(originalRequest.data);
                    parsed.accessToken = newToken;
                    originalRequest.data = JSON.stringify(parsed);
                } else {
                    originalRequest.data.accessToken = newToken;
                }
                
                // Retry request
                return api(originalRequest);
            } catch (err) {
                logger.error("❌ Retry failed:", err.message);
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
        const token = await getConsistentToken();
        await api.post('/Agent/Balance', { accessToken: token });
        logger.info("💓 Heartbeat: Session kept alive");
    } catch (err) {
        logger.error("💔 Heartbeat failed:", err.message);
        // Reset token pada heartbeat failure
        globalAccessToken = null;
        tokenExpiry = null;
    }
}, 15 * 60 * 1000);

module.exports = { 
    api, 
    logger, 
    getConsistentToken,
    USER_CONFIG, 
    BASE_URL, 
    agent 
};