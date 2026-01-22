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

    // Check if affiliate conversion should happen on email verification
    try {
      const settings = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
      if (settings.rows[0]?.is_active && settings.rows[0]?.conversion_type === 'email_verify') {
        const { completeConversion } = require('../admin/promotions.controller');
        const result = await completeConversion(verification.user_id);
        if (result) {
          console.log(`[Verify] Affiliate conversion completed for user ${verification.user_id}: ₪${result.commission}`);
        }
      }
    } catch (affError) {
      console.error('[Verify] Affiliate conversion error:', affError);
      // Continue - don't fail verification because of affiliate error
    }

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { verify };
