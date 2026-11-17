const transporter = require('./emailTransport');

const sendGuardianVerification = async ({ to, guardianName, userName, token }) => {
    const link = `${process.env.BACKEND_URL}/api/guardians/verify/${token}`;

    await transporter.sendMail({
        from: `"PinkAlert" <${process.env.EMAIL_USER}>`,
        to,
        subject: `${userName} wants to add you as a safety guardian`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:20px;border:1px solid #e5d3dc;border-radius:12px">
                <h2 style="color:#8B4A6A;margin-top:0">Guardian request</h2>
                <p>Hi ${guardianName},</p>
                <p><strong>${userName}</strong> has added you as a trusted guardian on PinkAlert.
                If they ever trigger an SOS, you will get an email with their live location.</p>
                <a href="${link}"
                   style="display:inline-block;background:#8B4A6A;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">
                   Accept and verify my email
                </a>
                <p style="color:#666;font-size:13px;margin-top:16px">
                    This link expires in 24 hours. If you don't know ${userName}, ignore this email.
                </p>
            </div>`,
    });
};

module.exports = sendGuardianVerification;