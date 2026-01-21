const db = require('../../config/database');
const { hashPassword } = require('../../services/auth/hash.service');
const { createVerification } = require('../../services/auth/verification.service');
const { sendMail } = require('../../services/mail/transport.service');
const { getVerificationEmail } = require('../../services/mail/templates.service');

/**
 * POST /api/auth/signup
 */
const signup = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [email.toLowerCase(), passwordHash, name || null]
    );

    const userId = result.rows[0].id;

    // Create verification
    const { token, code } = await createVerification(userId, 'email_verify');
    const verifyLink = `${process.env.APP_URL}/verify?token=${token}`;

    // Send email
    await sendMail(
      email,
      'אימות חשבון FlowBotomat',
      getVerificationEmail(code, verifyLink, 'he')
    );

    res.status(201).json({
      success: true,
      message: 'User created. Verification email sent.',
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { signup };
