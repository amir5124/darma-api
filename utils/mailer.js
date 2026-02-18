const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'linkutransport@gmail.com',
        pass: 'qbckptzxgdumxtdm' 
    }
});

/**
 * Fungsi Utility untuk mengirim email (Updated)
 * @param {string} to - Alamat email tujuan
 * @param {string} subject - Judul email
 * @param {string} htmlContent - Isi email dalam format HTML
 * @param {Array} attachments - (Opsional) Array berisi objek lampiran
 */
const sendBookingEmail = async (to, subject, htmlContent, attachments = []) => {
    try {
        const mailOptions = {
            from: '"LinkU Travel" <no-reply@linkutransport.id>',
            to: to,
            subject: subject,
            html: htmlContent,
            attachments: attachments // <--- INI PERUBAHANNYA: Menambahkan dukungan lampiran
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email berhasil dikirim ke ${to}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error("❌ Mailer Error:", error.message);
        throw error;
    }
};

module.exports = { sendBookingEmail };