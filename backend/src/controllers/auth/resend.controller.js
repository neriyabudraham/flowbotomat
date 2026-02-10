const db = require('../../config/database');
const { createVerification, checkAttempts } = require('../../services/auth/verification.service');
const { sendMail } = require('../../services/mail/transport.service');
const { getVerificationEmail } = require('../../services/mail/templates.service');

/**
 * POST /api/auth/resend-verification
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find user
    const result = await db.query(
      'SELECT id, is_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Check attempts
    const canResend = await checkAttempts(user.id, 'email_verify');
    if (!canResend) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    // Create new verification
    const { token, code } = await createVerification(user.id, 'email_verify');
    const verifyLink = `${process.env.APP_URL}/verify?token=${token}`;

    // Send email
    await sendMail(
      email,
      'אימות חשבון Botomat',
      getVerificationEmail(code, verifyLink, 'he')
    );

    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { resendVerification };
