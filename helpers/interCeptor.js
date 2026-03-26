const axios = require('axios');
const moment = require('moment-timezone');
const crypto = require('crypto');
const https = require('https');

// --- KONFIGURASI ---
const BASE_URL = 'https://uat-backup.darmawisataindonesiah2h.co.id:7080/h2h';
const USER_CONFIG = { userID: "CF0X64HBR8", password: "Darmaj4y4" };

// --- STATE MANAJEMEN TOKEN ---
let globalAccessToken = null;
let tokenExpiry = null; 

// Helper Agent untuk performa & bypass SSL jika diperlukan
const agent = new https.Agent({ 
    rejectUnauthorized: false, 
    keepAlive: true 
});

// Helper MD5
const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

// Logger Sederhana
const logger = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
};

/**
 * FUNGSI LOGIN / REFRESH TOKEN
 */
async function getConsistentToken(forceRefresh = false) {
    const sekarang = Date.now();
    
    // Refresh jika force, token kosong, atau sudah mendekati 25 menit
    if (forceRefresh || !globalAccessToken || (tokenExpiry && sekarang > tokenExpiry)) {
        try {
            const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");
            const securityCode = md5(timestamp + md5(USER_CONFIG.password));
            
            logger.info("Meminta Access Token baru ke server...");

            const res = await axios.post(`${BASE_URL}/Session/Login`, {
                token: timestamp, 
                securityCode, 
                language: 0, 
                userID: USER_CONFIG.userID
            }, { httpsAgent: agent });

            if (res.data && res.data.accessToken) {
                globalAccessToken = res.data.accessToken;
                // Expiry diset 25 menit (Darma biasanya 30 menit)
                tokenExpiry = sekarang + (25 * 60 * 1000); 
                logger.success(`Token Diperbarui: ${globalAccessToken.substring(0, 8)}...`);
            } else {
                throw new Error(res.data.statusMessage || "Gagal Login");
            }
        } catch (err) {
            logger.error("Login Error: " + err.message);
            throw err;
        }
    }
    return globalAccessToken;
}

/**
 * INSTANCE AXIOS CUSTOM
 */
const api = axios.create({
    baseURL: BASE_URL,
    httpsAgent: agent,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' }
});

/**
 * INTERCEPTOR REQUEST
 * Otomatis menyuntikkan accessToken ke setiap body request
 */
api.interceptors.request.use(async (config) => {
    // 1. Ambil token (akan otomatis login jika belum ada/expired)
    const token = await getConsistentToken();
    
    // 2. Pastikan data adalah object
    if (!config.data) config.data = {};
    
    // 3. Suntikkan accessToken dan userID ke body (Standar Darma)
    config.data.accessToken = token;
    if (!config.data.userID) config.data.userID = USER_CONFIG.userID;
    
    return config;
}, (error) => Promise.reject(error));

/**
 * INTERCEPTOR RESPONSE
 * Menangani kasus jika server mengembalikan error session expired di tengah jalan
 */
api.interceptors.response.use(
    (response) => {
        const data = response.data;
        // Daftar respCode atau message yang menandakan session tidak valid
        const sessionErrors = ["006", "106", "INVALID SESSION", "SESSION EXPIRED"];
        
        const isError = sessionErrors.some(msg => 
            String(data.respCode).includes(msg) || 
            String(data.statusMessage).toUpperCase().includes(msg)
        );

        if (isError) {
            logger.info("Session Invalid terdeteksi, mencoba retry...");
            return Promise.reject({ config: response.config, isSessionError: true });
        }
        
        return response;
    }, 
    async (error) => {
        const originalRequest = error.config;

        // Jika error 401 ATAU error session dari interceptor di atas
        if ((error.response?.status === 401 || error.isSessionError) && !originalRequest._retry) {
            originalRequest._retry = true; 
            
            try {
                // Paksa ambil token baru
                const newToken = await getConsistentToken(true);
                
                // Update payload request lama dengan token baru
                if (typeof originalRequest.data === 'string') {
                    const parsed = JSON.parse(originalRequest.data);
                    parsed.accessToken = newToken;
                    originalRequest.data = JSON.stringify(parsed);
                } else {
                    originalRequest.data.accessToken = newToken;
                }
                
                // Jalankan ulang request yang gagal tadi
                logger.info("Mengulangi request dengan token baru...");
                return api(originalRequest); 
            } catch (retryErr) {
                return Promise.reject(retryErr);
            }
        }
        return Promise.reject(error);
    }
);

module.exports = { 
    api, 
    USER_CONFIG, 
    logger 
};