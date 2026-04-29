const puppeteer = require('puppeteer');

const generateTicketPDF = async (data, fee, total) => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // Penumpang Rows
    const paxRows = data.paxBookingDetails.map((p, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><b>${p.paxName}</b><br><small>${p.ticketNumber}</small></td>
            <td>${p.ID}</td>
            <td>${p.paxType}</td>
            <td style="text-align: right;">Rp ${p.fare.toLocaleString('id-ID')}</td>
        </tr>
    `).join('');

    // HTML Content (Mirip Layout Gambar)
    const htmlContent = `
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica', sans-serif; padding: 30px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #00468C; padding-bottom: 10px; }
            .ship-info { background: #f0f4f8; padding: 15px; margin: 20px 0; border-radius: 5px; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #00468C; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; }
            .ringkasan { margin-top: 30px; width: 300px; float: right; }
            .ringkasan table td { border: none; padding: 5px; }
            .footer { margin-top: 100px; font-size: 10px; color: #777; border-top: 1px solid #ccc; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <img src="https://dlu.co.id/assets/img/logo-dlu.png" height="50">
            </div>
            <div style="text-align: right">
                <small>KODE PESANAN</small><br>
                <b style="font-size: 24px; color: #00468C;">${data.bookingNumber}</b>
            </div>
        </div>

        <h2 style="color: #00468C;">E-Tiket: ${data.shipName}</h2>
        
        <div class="ship-info">
            <div>
                <small>BERANGKAT</small><br>
                <b>${data.originName}</b><br>
                ${new Date(data.departDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div style="text-align: right">
                <small>ESTIMASI TIBA</small><br>
                <b>${data.destinationName}</b>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>No</th>
                    <th>Nama Penumpang</th>
                    <th>No. Identitas</th>
                    <th>Kelas</th>
                    <th>Tarif</th>
                </tr>
            </thead>
            <tbody>
                ${paxRows}
            </tbody>
        </table>

        <div class="ringkasan">
            <table>
                <tr>
                    <td>Total Tiket</td>
                    <td style="text-align: right;">Rp ${data.ticketPrice.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                    <td>Biaya Layanan</td>
                    <td style="text-align: right;">Rp ${fee.toLocaleString('id-ID')}</td>
                </tr>
                <tr style="font-weight: bold; font-size: 16px; color: #00468C;">
                    <td>Total Bayar</td>
                    <td style="text-align: right;">Rp ${total.toLocaleString('id-ID')}</td>
                </tr>
            </table>
        </div>

        <div style="clear: both;"></div>
        <div class="footer">
            * Harap berada di terminal penumpang 2 jam sebelum keberangkatan.<br>
            * Wajib membawa kartu identitas asli (KTP/SIM/Paspor).
        </div>
    </body>
    </html>
    `;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return pdfBuffer;
};

module.exports = { generateTicketPDF };