const db = require('../../config/database');
const { createVerification } = require('../../services/auth/verification.service');
const { sendMail } = require('../../services/mail/transport.service');
const { getPasswordResetEmail } = require('../../services/mail/templates.service');

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'נדרש אימייל' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const userResult = await db.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [normalizedEmail]
    );

    // Always return success to prevent email enumeration attacks
    // But only actually send email if user exists
    if (userResult.rows.length === 0) {
      console.log(`[ForgotPassword] User not found: ${normalizedEmail}`);
      // Still return success to prevent enumeration
      return res.json({ 
        success: true, 
        message: 'אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה' 
      });
    }

    const user = userResult.rows[0];

    // Delete any existing password reset tokens for this user
    await db.query(
      `DELETE FROM verification_tokens WHERE user_id = $1 AND type = 'password_reset'`,
      [user.id]
    );

    // Create new password reset token
    const { token, code } = await createVerification(user.id, 'password_reset');
    
    // Build reset link
    const resetLink = `${process.env.APP_URL || 'https://flow.botomat.co.il'}/reset-password?token=${token}`;

    // Send email
    try {
      await sendMail(
        user.email,
        'איפוס סיסמה - FlowBotomat',
        getPasswordResetEmail(code, resetLink, 'he')
      );
      console.log(`[ForgotPassword] Reset email sent to: ${user.email}`);
    } catch (emailErr) {
      console.error('[ForgotPassword] Failed to send email:', emailErr);
      return res.status(500).json({ error: 'שגיאה בשליחת המייל' });
    }

    res.json({ 
      success: true, 
      message: 'אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה' 
    });

  } catch (error) {
    console.error('[ForgotPassword] Error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
};

module.exports = { forgotPassword };
