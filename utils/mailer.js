const nodemailer = require('nodemailer');

/**
 * Konfigurasi Transporter
 * Jika menggunakan Gmail, pastikan sudah mengaktifkan "App Password".
 */
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Ganti jika menggunakan provider lain (misal: Mailgun, SMTP Hosting)
    port: 465,
    secure: true, // true untuk port 465, false untuk port 587
    auth: {
        user: 'linkutransport@gmail.com', // Alamat email pengirim
        pass: 'qbckptzxgdumxtdm'  // Password Aplikasi (BUKAN password email biasa)
    }
});

/**
 * Fungsi Utility untuk mengirim email
 * @param {string} to - Alamat email tujuan
 * @param {string} subject - Judul email
 * @param {string} htmlContent - Isi email dalam format HTML
 */
const sendBookingEmail = async (to, subject, htmlContent) => {
    try {
        const mailOptions = {
            from: '"LinkU Travel" <no-reply@linkutransport.id>',
            to: to,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email berhasil dikirim: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error("❌ Mailer Error:", error.message);
        throw error;
    }
};

module.exports = { sendBookingEmail };