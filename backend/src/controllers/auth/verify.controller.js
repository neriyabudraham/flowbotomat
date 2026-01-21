const db = require('../../config/database');
const { validateVerification, markAsUsed } = require('../../services/auth/verification.service');

/**
 * POST /api/auth/verify
 */
const verify = async (req, res) => {
  try {
    const { token, code, email } = req.body;

    if (!token && (!code || !email)) {
      return res.status(400).json({ error: 'Token or code with email required' });
    }

    // Find verification
    const verification = await validateVerification(token, code, email);

    if (!verification) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Update user as verified
    await db.query(
      'UPDATE users SET is_verified = TRUE, verified_at = NOW() WHERE id = $1',
      [verification.user_id]
    );

    // Mark token as used
    await markAsUsed(verification.id);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { verify };
