const db = require('../../config/database');
const bcrypt = require('bcrypt');

/**
 * POST /api/auth/verify-reset-token
 * Verify reset token/code is valid (without using it)
 */
const verifyResetToken = async (req, res) => {
  try {
    const { token, code, email } = req.body;

    if (!token && (!code || !email)) {
      return res.status(400).json({ error: 'נדרש טוקן או קוד עם אימייל' });
    }

    let result;

    if (token) {
      // Verify by token
      result = await db.query(
        `SELECT vt.*, u.email 
         FROM verification_tokens vt
         JOIN users u ON vt.user_id = u.id
         WHERE vt.token = $1 
         AND vt.type = 'password_reset' 
         AND vt.used_at IS NULL 
         AND vt.expires_at > NOW()`,
        [token]
      );
    } else {
      // Verify by code + email
      const normalizedEmail = email.toLowerCase().trim();
      result = await db.query(
        `SELECT vt.*, u.email 
         FROM verification_tokens vt
         JOIN users u ON vt.user_id = u.id
         WHERE vt.code = $1 
         AND u.email = $2
         AND vt.type = 'password_reset' 
         AND vt.used_at IS NULL 
         AND vt.expires_at > NOW()`,
        [code, normalizedEmail]
      );
    }

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'הקישור או הקוד אינם תקינים או שפג תוקפם',
        code: 'INVALID_TOKEN'
      });
    }

    res.json({ 
      valid: true,
      email: result.rows[0].email
    });

  } catch (error) {
    console.error('[ResetPassword] Verify token error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
};

/**
 * POST /api/auth/reset-password
 * Reset password with token/code
 */
const resetPassword = async (req, res) => {
  try {
    const { token, code, email, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
    }

    if (!token && (!code || !email)) {
      return res.status(400).json({ error: 'נדרש טוקן או קוד עם אימייל' });
    }

    let result;

    if (token) {
      // Verify by token
      result = await db.query(
        `SELECT vt.*, u.email 
         FROM verification_tokens vt
         JOIN users u ON vt.user_id = u.id
         WHERE vt.token = $1 
         AND vt.type = 'password_reset' 
         AND vt.used_at IS NULL 
         AND vt.expires_at > NOW()`,
        [token]
      );
    } else {
      // Verify by code + email
      const normalizedEmail = email.toLowerCase().trim();
      result = await db.query(
        `SELECT vt.*, u.email 
         FROM verification_tokens vt
         JOIN users u ON vt.user_id = u.id
         WHERE vt.code = $1 
         AND u.email = $2
         AND vt.type = 'password_reset' 
         AND vt.used_at IS NULL 
         AND vt.expires_at > NOW()`,
        [code, normalizedEmail]
      );
    }

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'הקישור או הקוד אינם תקינים או שפג תוקפם',
        code: 'INVALID_TOKEN'
      });
    }

    const verificationToken = result.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, verificationToken.user_id]
    );

    // Mark token as used
    await db.query(
      'UPDATE verification_tokens SET used_at = NOW() WHERE id = $1',
      [verificationToken.id]
    );

    // Delete all other password reset tokens for this user
    await db.query(
      `DELETE FROM verification_tokens WHERE user_id = $1 AND type = 'password_reset' AND id != $2`,
      [verificationToken.user_id, verificationToken.id]
    );

    console.log(`[ResetPassword] Password reset successful for user: ${verificationToken.email}`);

    res.json({ 
      success: true, 
      message: 'הסיסמה שונתה בהצלחה' 
    });

  } catch (error) {
    console.error('[ResetPassword] Error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
};

module.exports = { verifyResetToken, resetPassword };
