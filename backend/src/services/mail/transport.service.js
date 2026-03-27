const nodemailer = require('nodemailer');
const db = require('../../config/database');

let transporter = null;

// Cache for sub-account email resolution (email#sub_N → parent email + account name)
const subAccountCache = new Map();

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

  let realTo = to;
  let realSubject = subject;

  // Sub-account emails: resolve parent's real email and tag the subject
  if (to && to.includes('#sub_')) {
    try {
      let cached = subAccountCache.get(to);
      if (!cached) {
        const result = await db.query(
          `SELECT u.name as sub_name, p.email as parent_email
           FROM users u
           JOIN linked_accounts la ON la.child_user_id = u.id
           JOIN users p ON p.id = la.parent_user_id
           WHERE u.email = $1
           LIMIT 1`,
          [to]
        );
        if (result.rows.length > 0) {
          cached = { parentEmail: result.rows[0].parent_email, subName: result.rows[0].sub_name };
          subAccountCache.set(to, cached);
        }
      }
      if (cached) {
        realTo = cached.parentEmail;
        realSubject = `[${cached.subName}] ${subject}`;
      }
    } catch (e) {
      // Fallback: strip #sub_N suffix to get a deliverable address
      realTo = to.split('#')[0];
    }
  }

  await transport.sendMail({
    from: `"Botomat" <${process.env.SMTP_USER}>`,
    to: realTo,
    subject: realSubject,
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
