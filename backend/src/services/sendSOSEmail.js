const transporter = require('./emailTransport');

const escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sendSOSEmail = async ({ guardians, userName, lat, lon, accuracy }) => {
    const recipients = guardians.filter((g) => g.guardianEmail);
    if (recipients.length === 0) return { sent: 0, failed: 0, sentTo: [] };

    const hasLocation = Number.isFinite(lat) && Number.isFinite(lon);
    const mapsLink = hasLocation ? `https://www.google.com/maps?q=${lat},${lon}` : null;
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const safeUser = escapeHtml(userName);

    const results = await Promise.allSettled(
        recipients.map((g) =>
            transporter.sendMail({
                from: `"PinkAlert SOS" <${process.env.EMAIL_USER}>`,
                to: g.guardianEmail,
                subject: `🚨 SOS ALERT: ${userName} needs help`,
                priority: 'high',
                headers: { 'X-Priority': '1', Importance: 'high' },
                text:
                    `SOS ALERT: ${userName} has triggered an emergency alert at ${time}.\n` +
                    (hasLocation ? `Location: ${mapsLink}\n` : 'Location was not available.\n') +
                    `Please call them now. If you cannot reach them, call 112.`,
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:2px solid #dc2626;border-radius:12px;padding:20px">
                        <h2 style="color:#dc2626;margin-top:0">🚨 Emergency Alert</h2>
                        <p>Hi ${escapeHtml(g.guardianName)},</p>
                        <p><strong>${safeUser}</strong> has triggered an SOS and may need help.</p>
                        <p style="color:#555">Time: ${time}</p>
                        ${
                            hasLocation
                                ? `<a href="${mapsLink}"
                                      style="display:inline-block;background:#8B4A6A;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">
                                      📍 Open Location in Google Maps
                                   </a>
                                   <p style="color:#555;font-size:13px">Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}${
                                       Number.isFinite(accuracy) ? ` (accuracy about ${Math.round(accuracy)} m)` : ''
                                   }</p>`
                                : '<p style="color:#b45309"><strong>Location was not available.</strong> Please call them right away.</p>'
                        }
                        <p style="color:#666;font-size:13px;margin-top:16px">
                            Please call them immediately. If you cannot reach them, contact the police on 112.
                        </p>
                    </div>`,
            })
        )
    );

    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error(`SOS email to ${recipients[i].guardianEmail} failed:`, r.reason?.message);
        }
    });

    const sentTo = recipients
        .filter((_, i) => results[i].status === 'fulfilled')
        .map((g) => g._id);

    return { sent: sentTo.length, failed: results.length - sentTo.length, sentTo };
};

module.exports = sendSOSEmail;