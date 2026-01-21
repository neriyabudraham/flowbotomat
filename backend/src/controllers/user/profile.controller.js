const pool = require('../../config/database');
const { hashPassword, comparePassword } = require('../../services/auth/hash.service');

/**
 * Get user profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, email, name, language, created_at 
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Update user profile
 */
async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { name, language } = req.body;
    
    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name), 
           language = COALESCE($2, language),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, name, language`,
      [name, language, userId]
    );
    
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון פרופיל' });
  }
}

/**
 * Change password
 */
async function changePassword(req, res) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'נדרשת סיסמה נוכחית וחדשה' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'סיסמה חדשה חייבת להכיל לפחות 8 תווים' });
    }
    
    // Get current password hash
    const userRes = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Verify current password
    const isValid = await comparePassword(currentPassword, userRes.rows[0].password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'סיסמה נוכחית שגויה' });
    }
    
    // Hash new password
    const newHash = await hashPassword(newPassword);
    
    // Update
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );
    
    res.json({ success: true, message: 'הסיסמה עודכנה בהצלחה' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'שגיאה בשינוי סיסמה' });
  }
}

module.exports = { getProfile, updateProfile, changePassword };
