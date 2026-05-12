const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

/**
 * Generate E-Tiket PDF untuk Kapal Pelni
 * Dipanggil setelah status "Ticketed" (post-issued)
 *
 * @param {object} bookingDetail  - Full response dari /booking-detail
 * @param {number} serviceFee     - Biaya layanan aplikasi
 * @param {number} totalAmount    - Total yang dibayar user
 */
const generatePelniTicketPDF = async (bookingDetail, serviceFee = 0, totalAmount = 0) => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        const primaryColor = '#24b3ae'; // Biru Pelni

        // Format tanggal Indonesia
        const fmtDate = (isoStr) => {
            if (!isoStr) return '-';
            return new Date(isoStr).toLocaleDateString('id-ID', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
        };
        const fmtDateTime = (isoStr) => {
            if (!isoStr) return '-';
            const d = new Date(isoStr);
            return d.toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric'
            }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
        };
        const fmtIDR = (num) => 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');

        // QR Code utama (Booking Number)
        const mainQrBase64 = await QRCode.toDataURL(
            bookingDetail.bokingNumber || bookingDetail.numCode || 'UNKNOWN'
        );

        // Hitung durasi perjalanan
        const durHours = bookingDetail.departDateTime && bookingDetail.arrivalDateTime
            ? Math.round((new Date(bookingDetail.arrivalDateTime) - new Date(bookingDetail.departDateTime)) / 36e5)
            : null;

        // Baris penumpang
        const paxRows = await Promise.all(
            (bookingDetail.paxBookingDetails || []).map(async (p, i) => {
                const isVehicle = (p.paxType || '').toLowerCase().includes('kendaraan')
                    || (p.paxType || '').toLowerCase().includes('motor')
                    || (p.paxType || '').toLowerCase().includes('mobil');

                const labelId = isVehicle ? 'No. Polisi' : 'No. Identitas';

                // QR tiket per penumpang (gunakan ticketQRCode jika ada, fallback ticketNumber atau nama)
                const qrContent = p.ticketQRCode || p.ticketNumber || `${bookingDetail.bokingNumber}-${i + 1}`;
                const paxQr = await QRCode.toDataURL(qrContent);

                const noteHtml = p.pax_note
                    ? `<div style="margin-top:3px;font-style:italic;color:#e67e22;font-size:10px;">Catatan: ${p.pax_note}</div>`
                    : '';

                return `
                <tr>
                   <td style="text-align:center;width:30px;">${i + 1}</td>
<td>
    <div style="display:flex;align-items:center;gap:10px;">
        <div>
            <b style="font-size:13px;">
                ${p.paxName
                        ? [...new Set(p.paxName.trim().split(/\s+/))].join(' ').toUpperCase()
                        : '-'
                    }
            </b><br/>
            <small style="color:${primaryColor};font-weight:bold;">
                ${bookingDetail.numCode || '-'}
            </small>
            ${noteHtml}
        </div>
    </div>
</td>
<td>
    <small style="color:#666;">${labelId}</small><br/>
    <b>${p.ID || '-'}</b>
</td>
    <div class="flex flex-col items-center">
        <b class="text-sm">${p.paxType || '-'}</b>
        <div class="mt-1">
            ${p.paxGender === 'M'
                        ? `<span class="text-[10px] block text-slate-500">Laki-laki</span>`
                        : `<span class="text-[10px] block text-slate-500">Perempuan</span>`
                    }
        </div>
    </div>
</td>
                    <td>
                        Dek <b>${p.deck || '-'}</b><br/>
                        Kabin <b>${p.cabin || '-'}</b> · Kasur <b>${p.bed || '-'}</b>
                    </td>
                    <td style="text-align:right;font-weight:bold;">${fmtIDR(p.fare)}</td>
                </tr>`;
            })
        );

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8"/>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    padding: 24px;
                    color: #333;
                    line-height: 1.5;
                    font-size: 12px;
                }

                /* ── HEADER ── */
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 3px solid ${primaryColor};
                    padding-bottom: 12px;
                    margin-bottom: 18px;
                }
                .brand h1 { color: ${primaryColor}; font-size: 26px; margin-top: 4px; }
                .brand p  { color: #555; font-size: 11px; }
                .main-qr  { text-align: center; }
                .main-qr img { width: 90px; }
                .main-qr .booking-no {
                    font-size: 22px;
                    font-weight: bold;
                    color: ${primaryColor};
                    letter-spacing: 3px;
                }

                /* ── INFO KAPAL ── */
                .ship-card {
                    background: #eaf4ff;
                    border: 1px solid #b3d4f5;
                    border-radius: 10px;
                    padding: 14px 18px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 18px;
                }
                .ship-card .col { flex: 1; }
                .ship-card .col-center { text-align: center; flex: 0.6; }
                .ship-card .col-right  { text-align: right; }
                .label-sm { font-size: 10px; color: ${primaryColor}; font-weight: bold; text-transform: uppercase; }
                .route-arrow { font-size: 22px; color: ${primaryColor}; }

                /* ── STATUS BADGE ── */
                .badge {
                    display: inline-block;
                    padding: 3px 10px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: bold;
                    background: #d4edda;
                    color: #155724;
                }

                /* ── TABLE PENUMPANG ── */
                table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
                thead th {
                    background: ${primaryColor};
                    color: #fff;
                    padding: 10px 8px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                tbody td {
                    padding: 10px 8px;
                    border-bottom: 1px solid #eee;
                    vertical-align: middle;
                    font-size: 11px;
                }
                tbody tr:last-child td { border-bottom: none; }

                /* ── RINGKASAN BIAYA ── */
                .summary-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
                .summary-box {
                    width: 290px;
                    border: 1px solid #ddd;
                    border-radius: 10px;
                    overflow: hidden;
                }
                .summary-box table { margin: 0; }
                .summary-box thead th { font-size: 12px; padding: 10px 14px; }
                .summary-box tbody td { padding: 8px 14px; font-size: 12px; border: none; }
                .summary-box .total-row td {
                    font-size: 15px;
                    font-weight: bold;
                    color: ${primaryColor};
                    border-top: 1px solid #ddd !important;
                    padding-top: 10px;
                }

                /* ── INFO BOOKING ── */
                .meta-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px 20px;
                    background: #f9f9f9;
                    border-radius: 8px;
                    padding: 12px 16px;
                    margin-bottom: 18px;
                    font-size: 11px;
                }
                .meta-grid .item-label { color: #888; }
                .meta-grid .item-value { font-weight: bold; color: #333; }

                /* ── FOOTER ── */
                .footer {
                    font-size: 10px;
                    color: #777;
                    border-top: 1px dashed #ccc;
                    padding-top: 14px;
                    line-height: 1.8;
                }
                .footer b { color: #333; }

                /* ── WATERMARK ── */
                .watermark {
                    position: fixed;
                    top: 38%;
                    left: 18%;
                    transform: rotate(-30deg);
                    font-size: 90px;
                    color: rgba(26,111,180,0.04);
                    font-weight: bold;
                    z-index: 0;
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <div class="watermark">LINKU</div>

            <!-- HEADER -->
            <div class="header">
                <div class="brand">
                    <div style="font-size:13px;font-weight:bold;color:#555;">E-TIKET RESMI</div>
                     <img src="https://res.cloudinary.com/dgsdmgcc7/image/upload/v1768877917/WhatsApp_Image_2026-01-20_at_09.45.43-removebg-preview_lqkgrw.png" height="50">
                    <p>LinkU Transport</p>
                </div>
                <div class="main-qr">
                    <img src="${mainQrBase64}" /><br/>
                    <div style="font-size:10px;color:#888;margin-top:4px;">KODE BOOKING</div>
                    <div class="booking-no">${bookingDetail.bokingNumber || '-'}</div>
                    <span class="badge">${bookingDetail.ticketStatus || 'Ticketed'}</span>
                </div>
            </div>

            <!-- INFO KAPAL & RUTE -->
            <div class="ship-card">
                <div class="col">
                    <div class="label-sm">Kapal</div>
                    <div style="font-size:15px;font-weight:bold;">${bookingDetail.shipName || '-'}</div>
                    <div style="font-size:11px;color:#555;margin-top:2px;">No. Kapal: ${bookingDetail.shipNumber}</div>
                </div>
                <div class="col-center">
                    <div class="label-sm">Rute</div>
                    <div style="font-weight:bold;">${bookingDetail.originName || bookingDetail.originPort}</div>
                    <div class="route-arrow">↓</div>
                    <div style="font-weight:bold;">${bookingDetail.destinationName || bookingDetail.destinationPort}</div>
                    ${durHours ? `<div style="font-size:10px;color:#888;margin-top:4px;">~${durHours} jam perjalanan</div>` : ''}
                </div>
                <div class="col-right">
                    <div class="label-sm">Berangkat</div>
                    <div style="font-weight:bold;">${fmtDateTime(bookingDetail.departDateTime)}</div>
                    <div style="margin-top:8px;" class="label-sm">Tiba (estimasi)</div>
                    <div style="font-weight:bold;">${fmtDateTime(bookingDetail.arrivalDateTime)}</div>
                </div>
            </div>

            <!-- META INFO BOOKING -->
            <div class="meta-grid">
                <div>
                    <div class="item-label">Tanggal Pemesanan</div>
                    <div class="item-value">${fmtDateTime(bookingDetail.bookingDateTime)}</div>
                </div>
                <div>
                    <div class="item-label">Tanggal Issued</div>
                    <div class="item-value">${fmtDateTime(bookingDetail.issuedDateTime)}</div>
                </div>
                <div>
                    <div class="item-label">Total Penumpang</div>
                    <div class="item-value">${bookingDetail.totalTicket || (bookingDetail.paxBookingDetails || []).length} orang</div>
                </div>
                <div>
                    <div class="item-label">Kode NumCode</div>
                    <div class="item-value">${bookingDetail.numCode || '-'}</div>
                </div>
            </div>

            <!-- TABEL PENUMPANG -->
            <table>
                <thead>
                    <tr>
                        <th style="width:30px;">No</th>
                        <th>Penumpang / Tiket</th>
                        <th>Identitas</th>
                        <th>Tipe / Gender</th>
                        <th>Kamar</th>
                        <th style="text-align:right;">Tarif</th>
                    </tr>
                </thead>
                <tbody>
                    ${paxRows.join('')}
                </tbody>
            </table>

            <!-- RINGKASAN BIAYA -->
            <div class="summary-wrap">
                <div class="summary-box">
                    <table>
                        <thead>
                            <tr><th colspan="2">Rincian Pembayaran</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Harga Tiket</td>
                                <td style="text-align:right;">${fmtIDR(bookingDetail.ticketPrice)}</td>
                            </tr>
                            ${serviceFee > 0 ? `
                            <tr>
                                <td>Biaya Layanan</td>
                                <td style="text-align:right;">${fmtIDR(serviceFee)}</td>
                            </tr>` : ''}
                            <tr class="total-row">
                                <td>Total Bayar</td>
                                <td style="text-align:right;">${fmtIDR(totalAmount || bookingDetail.ticketPrice)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- FOOTER -->
            <div class="footer">
                <b>SYARAT &amp; KETENTUAN:</b><br/>
                1. Penumpang wajib hadir di terminal paling lambat <b>2 jam sebelum keberangkatan</b>.<br/>
                2. Wajib menunjukkan <b>kartu identitas asli</b> (KTP/SIM/Paspor) yang sesuai data tiket.<br/>
                
                3. E-Tiket ini merupakan bukti perjalanan yang sah dan diterbitkan secara elektronik.<br/>
                4. Dilarang memindahtangankan tiket kepada pihak lain.<br/>
                <br/>
                <div style="display:flex;justify-content:space-between;">
                    <span>Dicetak: ${new Date().toLocaleString('id-ID')}</span>
                    <span>www.pelni.co.id</span>
                </div>
            </div>
        </body>
        </html>`;

        await page.setContent(html, { waitUntil: 'networkidle0' });

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

/**
 * Generate HTML Invoice (untuk email booking awal, sebelum issued)
 *
 * @param {object} bookingData   - Data booking dari DB + response API
 * @param {object} passengers    - Array passengers_pelni
 * @param {number} serviceFee
 * @param {number} totalAmount
 */
const generateBookingInvoiceHTML = (bookingData, passengers = [], serviceFee = 0, totalAmount = 0) => {
    const primaryColor = '#1a6fb4';
    const fmtIDR = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
    const fmtDT = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long',
            year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) + ' WIB';
    };

    const paxRows = passengers.map((p, i) => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${i + 1}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;"><b>${p.pax_name}</b></td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.pax_type}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.id_number}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">
                ${fmtIDR(p.fare_individual)}
            </td>
        </tr>`).join('');

    return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden;">
        <!-- Header -->
        <div style="background:${primaryColor};color:#fff;padding:20px 24px;">
            <div style="font-size:22px;font-weight:bold;">⚓ PELNI — Konfirmasi Pemesanan</div>
            <div style="font-size:13px;opacity:0.85;margin-top:4px;">Pemesanan tiket kapal Anda telah berhasil dibuat</div>
        </div>

        <!-- Body -->
        <div style="padding:24px;">
            <p style="margin-bottom:16px;">
                Halo, berikut adalah detail pemesanan tiket kapal Anda.
                Tiket resmi (e-tiket) akan dikirimkan setelah pembayaran dan penerbitan tiket selesai.
            </p>

            <!-- Info Kapal -->
            <div style="background:#eaf4ff;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
                <table width="100%" style="border-collapse:collapse;">
                    <tr>
                        <td width="50%">
                            <div style="font-size:10px;color:${primaryColor};font-weight:bold;text-transform:uppercase;">Kapal</div>
                            <div style="font-size:16px;font-weight:bold;">${bookingData.ship_name || '-'}</div>
                            <div style="font-size:11px;color:#555;">${bookingData.ship_number}</div>
                        </td>
                        <td style="text-align:right;">
                            <div style="font-size:10px;color:${primaryColor};font-weight:bold;text-transform:uppercase;">Rute</div>
                            <div style="font-weight:bold;">${bookingData.origin_name} → ${bookingData.destination_name}</div>
                            <div style="font-size:11px;color:#555;">${fmtDT(bookingData.depart_date_time)}</div>
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Kode Booking -->
            <div style="text-align:center;background:#f5f5f5;border-radius:8px;padding:14px;margin-bottom:18px;">
                <div style="font-size:11px;color:#888;">KODE BOOKING</div>
                <div style="font-size:28px;font-weight:bold;color:${primaryColor};letter-spacing:4px;">
                    ${bookingData.booking_number || 'Menunggu...'}
                </div>
                <div style="font-size:11px;color:#888;">NumCode: ${bookingData.num_code}</div>
            </div>

            <!-- Tabel Penumpang -->
            <div style="font-weight:bold;margin-bottom:8px;">Daftar Penumpang</div>
            <table width="100%" style="border-collapse:collapse;margin-bottom:18px;">
                <thead>
                    <tr style="background:${primaryColor};color:#fff;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;">No</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;">Nama</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;">Tipe</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;">Identitas</th>
                        <th style="padding:8px 12px;text-align:right;font-size:11px;">Tarif</th>
                    </tr>
                </thead>
                <tbody>${paxRows}</tbody>
            </table>

            <!-- Rincian Biaya -->
            <div style="display:flex;justify-content:flex-end;">
                <table style="width:260px;border-collapse:collapse;font-size:13px;">
                    <tr>
                        <td style="padding:6px 0;">Harga Tiket</td>
                        <td style="text-align:right;padding:6px 0;">${fmtIDR(bookingData.base_ticket_price)}</td>
                    </tr>
                    ${serviceFee > 0 ? `
                    <tr>
                        <td style="padding:6px 0;">Biaya Layanan</td>
                        <td style="text-align:right;padding:6px 0;">${fmtIDR(serviceFee)}</td>
                    </tr>` : ''}
                    <tr style="font-weight:bold;font-size:15px;color:${primaryColor};border-top:1px solid #ddd;">
                        <td style="padding:10px 0 6px;">Total Bayar</td>
                        <td style="text-align:right;padding:10px 0 6px;">${fmtIDR(totalAmount)}</td>
                    </tr>
                </table>
            </div>

            <hr style="border:none;border-top:1px dashed #ccc;margin:20px 0;"/>
            <p style="font-size:11px;color:#777;line-height:1.8;">
                ⚠️ <b>Penting:</b> Harap tiba di terminal minimal 2 jam sebelum keberangkatan.<br/>
                Wajib membawa identitas asli sesuai data pada tiket.<br/>
                E-tiket resmi akan dikirim ke email ini setelah tiket diterbitkan.
            </p>
        </div>

        <!-- Footer -->
        <div style="background:#f5f5f5;padding:14px 24px;text-align:center;font-size:11px;color:#888;">
            © ${new Date().getFullYear()} Layanan Tiket Kapal Pelni · www.pelni.co.id
        </div>
    </div>`;
};

module.exports = { generatePelniTicketPDF, generateBookingInvoiceHTML };