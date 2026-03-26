const mysql = require('mysql2/promise');

// Definisi Pool Anda
const db = mysql.createPool({
    host: process.env.MYSQL_HOST || '31.97.48.240',
    user: process.env.MYSQL_USER || 'mysql',
    password: process.env.MYSQL_PASSWORD || 'bjDn1rW3iM0FZdAWGh7iALAl9878Za4RTtwOnKrzDbSIAVuCJf9ASEP8zKVxDcB0',
    database: process.env.MYSQL_DATABASE || 'default',
    port: process.env.MYSQL_PORT || 3306,
    ssl: {
        rejectUnauthorized: false // Wajib ada agar tidak ETIMEDOUT
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- TAMBAHKAN KODE INI UNTUK CEK KONEKSI ---
db.getConnection()
    .then(connection => {
        console.log('✅ Database Terkoneksi: Berhasil masuk ke MySQL Coolify!');
        connection.release(); // Lepas kembali koneksi ke pool
    })
    .catch(err => {
        console.error('❌ Database Gagal Terkoneksi:');
        console.error('Pesan Error:', err.message);
        console.error('Periksa Host, User, atau Password di Coolify!');
    });

module.exports = db;