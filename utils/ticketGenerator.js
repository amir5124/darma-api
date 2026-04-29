const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const generateTicketPDF = async (data, fee, total) => {
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    try {
        const page = await browser.newPage();
        const primaryColor = "#24b3ae";

        // Generate QR Code untuk Booking Number (Besar di Header)
        const mainQrBase64 = await QRCode.toDataURL(data.bookingNumber);

        // Generate Rows dan QR Code untuk setiap Pax/Kendaraan
        const paxRows = await Promise.all(data.paxBookingDetails.map(async (p, index) => {
            // Generate QR Code kecil untuk setiap tiket
            const ticketQrBase64 = await QRCode.toDataURL(p.ticketQRCode || p.ticketNumber);
            
            // Logika deteksi kendaraan (berdasarkan paxType atau ID yang mengandung plat nomor)
            const isVehicle = p.paxType.toLowerCase().includes('kendaraan') || p.paxType.toLowerCase().includes('motor') || p.paxType.toLowerCase().includes('mobil');
            const labelIdentitas = isVehicle ? "No. Polisi" : "No. Identitas";

            return `
                <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td>
                        <div style="display: flex; align-items: center;">
                           
                            <div>
                                <b style="font-size: 13px;">${p.paxName}</b><br>
                                <small style="color: ${primaryColor}; font-weight: bold;">${p.ticketNumber}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        <small style="color: #666;">${labelIdentitas}</small><br>
                        <b>${p.ID}</b>
                    </td>
                    <td>${p.paxType}</td>
                    <td style="text-align: right; font-weight: bold;">Rp ${p.fare.toLocaleString('id-ID')}</td>
                </tr>
            `;
        }));

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; line-height: 1.4; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${primaryColor}; padding-bottom: 10px; }
                .brand { color: ${primaryColor}; }
                .brand h1 { margin: 0; font-size: 28px; }
                .main-qr { text-align: center; }
                .main-qr img { width: 80px; }
                
                .ship-info { background: #f4fbfc; padding: 15px; margin: 20px 0; border-radius: 8px; border: 1px solid #d1eded; display: flex; justify-content: space-between; }
                .ship-info b { font-size: 16px; color: #333; }
                
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: ${primaryColor}; color: white; padding: 12px 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
                td { padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 11px; vertical-align: middle; }
                
                .ringkasan-container { margin-top: 20px; display: flex; justify-content: flex-end; }
                .ringkasan { width: 280px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
                .ringkasan table td { border: none; padding: 4px 0; font-size: 13px; }
                .total-row { font-size: 18px !important; font-weight: bold; color: ${primaryColor}; border-top: 1px solid #ddd !important; }
                
                .footer { margin-top: 40px; font-size: 10px; color: #666; border-top: 1px dashed #ccc; padding-top: 15px; }
                .watermark { position: absolute; top: 40%; left: 25%; transform: rotate(-30deg); font-size: 80px; color: rgba(36, 179, 174, 0.05); z-index: -1; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="watermark">LINKU</div>
            
            <div class="header">
                <div class="brand">
                   <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png" height="50">
                    <h1>E-TIKET</h1>
                    <small>LINKU</small>
                </div>
                <div class="main-qr">
                    <img src="${mainQrBase64}"><br>
                    <small>KODE PESANAN</small><br>
                    <b style="font-size: 20px; color: ${primaryColor}">${data.bookingNumber}</b>
                </div>
            </div>

            <div class="ship-info">
                <div>
                    <small style="color: ${primaryColor}; font-weight: bold;">KAPAL</small><br>
                    <b>${data.shipName}</b><br>
                    <span style="font-size: 12px;">Keberangkatan: ${new Date(data.departDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <div style="text-align: right">
                    <small style="color: ${primaryColor}; font-weight: bold;">RUTE</small><br>
                    <b>${data.originName}</b><br>
                    <span style="color: ${primaryColor}; font-weight: bold;">&darr;</span><br>
                    <b>${data.destinationName}</b>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="5%">No</th>
                        <th width="40%">Penumpang / Kendaraan</th>
                        <th width="20%">Identitas / No. Pol</th>
                        <th width="20%">Kelas/Tipe</th>
                        <th width="15%" style="text-align: right;">Tarif</th>
                    </tr>
                </thead>
                <tbody>
                    ${paxRows.join('')}
                </tbody>
            </table>

            <div class="ringkasan-container">
                <div class="ringkasan">
                    <table width="100%">
                        <tr>
                            <td>Total Harga Tiket</td>
                            <td style="text-align: right;">Rp ${data.ticketPrice.toLocaleString('id-ID')}</td>
                        </tr>
                        <tr>
                            <td>Biaya Layanan (Fee)</td>
                            <td style="text-align: right;">Rp ${fee.toLocaleString('id-ID')}</td>
                        </tr>
                        <tr class="total-row">
                            <td>Total Bayar</td>
                            <td style="text-align: right;">Rp ${total.toLocaleString('id-ID')}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <div class="footer">
                <b>SYARAT & KETENTUAN:</b><br>
                1. Penumpang wajib sudah berada di terminal 2 jam sebelum keberangkatan.<br>
                2. Wajib menunjukkan kartu identitas asli (KTP/SIM/Paspor) atau STNK asli untuk kendaraan.<br>
                3. E-Tiket ini merupakan bukti perjalanan yang sah dan diterbitkan oleh LinkU Transport.
            </div>
        </body>
        </html>
        `;

        await page.setContent(htmlContent);
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });
        
        return pdfBuffer;
    } finally {
        await browser.close();
    }
};

module.exports = { generateTicketPDF };