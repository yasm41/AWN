const nodemailer = require("nodemailer");

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    family:4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send the password reset OTP email.
 *
 * @param {string} toEmail  - Recipient email address
 * @param {string} toName   - Recipient display name
 * @param {string} otpCode  - The raw 6-digit OTP to embed in the email
 */
const sendPasswordResetEmail = async (toEmail, toName, otpCode) => {
  // In development/test, skip real SMTP and log the code instead
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    console.log(`\n📧 [DEV] Password reset code for ${toEmail}: ${otpCode}\n`);
    return { messageId: "dev-mode" };
  }

  const transporter = createTransporter();

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "Awn App"}" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Reset your Awn password",
    text: `Hi ${toName},\n\nYour password reset code is: ${otpCode}\n\nThis code expires in 10 minutes.\n\nIf you didn't request a password reset, please ignore this email — your password will remain unchanged.`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        </head>
        <body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="480" cellpadding="0" cellspacing="0"
                  style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                  <tr>
                    <td align="center" style="background:#4F46E5;padding:32px 40px;">
                      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">
                        Awn
                      </h1>
                      <p style="margin:8px 0 0;color:#c7d2fe;font-size:14px;">
                        Your Educational Assistant
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:40px;">
                      <p style="margin:0 0 8px;color:#374151;font-size:16px;">
                        Hi <strong>${toName}</strong>,
                      </p>
                      <p style="margin:0 0 28px;color:#6B7280;font-size:15px;line-height:1.6;">
                        We received a request to reset your password. Use the code below to continue.
                        The code expires in <strong>10 minutes</strong>.
                      </p>

                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding:24px;background:#EEF2FF;border-radius:12px;">
                            <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#4F46E5;
                                         font-family:'Courier New',monospace;">
                              ${otpCode}
                            </span>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:28px 0 0;color:#9CA3AF;font-size:13px;line-height:1.5;">
                        If you didn't request this, you can safely ignore this email —
                        your password will not be changed.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;">
                      <p style="margin:0;color:#9CA3AF;font-size:12px;text-align:center;">
                        © ${new Date().getFullYear()} Awn — Educational Assistant
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};

/**
 * Verify the SMTP connection (useful at server startup or health check)
 */
const verifyEmailConnection = async () => {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return true;
  }
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
  } catch (err) {
    console.error("❌ SMTP connection failed:", err.message);
    return false;
  }
};

module.exports = { sendPasswordResetEmail, verifyEmailConnection };
