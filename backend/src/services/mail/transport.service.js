const nodemailer = require('nodemailer');

let transporter = null;

/**
 * Initialize mail transporter
 */
const initTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

/**
 * Send email
 */
const sendMail = async (to, subject, html) => {
  const transport = initTransporter();

  await transport.sendMail({
    from: `"FlowBotomat" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
};

/**
 * Test SMTP connection
 */
const testConnection = async () => {
  try {
    const transport = initTransporter();
    await transport.verify();
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  initTransporter,
  sendMail,
  testConnection,
};
