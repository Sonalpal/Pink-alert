const nodemailer = require('nodemailer');

const sendVerificationEmail = async (toEmail, toName, otp) => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    // If Gmail isn't configured, print the code in the terminal (dev only)
    if (!user || !pass) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Email service is not configured');
        }
        console.log(`[DEV] Verification code for ${toEmail}: ${otp}`);
        return;
    }

    const safeName = String(toName || '').replace(/[<>&"]/g, '');

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });

    await transporter.sendMail({
        from: `"SafeHer India" <${user}>`,
        to: toEmail,
        subject: 'Your SafeHer India verification code',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
                <h2 style="color:#8a2b57">SafeHer India</h2>
                <p>Hi ${safeName},</p>
                <p>Use this code to verify your email address:</p>
                <p style="font-size:32px;letter-spacing:8px;font-weight:bold">${otp}</p>
                <p style="color:#666">This code expires in 10 minutes. If you did not sign up, you can ignore this email.</p>
            </div>`,
    });
};

module.exports = { sendVerificationEmail };