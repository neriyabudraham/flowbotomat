const pool = require('../../config/database');
const { hashPassword, comparePassword } = require('../../services/auth/hash.service');

/**
 * Get user profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, email, name, language, created_at, avatar_url, google_id,
              CASE WHEN password_hash IS NOT NULL THEN true ELSE false END as has_password
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
 * If user has no password (Google signup), they can create one without currentPassword
 */
async function changePassword(req, res) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ error: 'נדרשת סיסמה חדשה' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'סיסמה חדשה חייבת להכיל לפחות 8 תווים' });
    }
    
    // Get current password hash
    const userRes = await pool.query(
      'SELECT password_hash, google_id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    const hasPassword = !!userRes.rows[0].password_hash;
    const isGoogleUser = !!userRes.rows[0].google_id;
    
    // If user has a password, they must provide the current one
    if (hasPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'נדרשת סיסמה נוכחית' });
      }
      
      const isValid = await comparePassword(currentPassword, userRes.rows[0].password_hash);
      if (!isValid) {
        return res.status(400).json({ error: 'סיסמה נוכחית שגויה' });
      }
    }
    
    // Hash new password
    const newHash = await hashPassword(newPassword);
    
    // Update
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );
    
    const message = hasPassword ? 'הסיסמה עודכנה בהצלחה' : 'סיסמה נוצרה בהצלחה! כעת תוכל להתחבר גם עם אימייל וסיסמה';
    res.json({ success: true, message, hadPassword: hasPassword });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'שגיאה בשינוי סיסמה' });
  }
}

/**
 * Get user subscription
 */
async function getSubscription(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT 
        us.*,
        sp.name as plan_name,
        sp.name_he as plan_name_he,
        sp.price as plan_price,
        sp.max_bots,
        sp.max_bot_runs_per_month,
        sp.max_contacts,
        sp.allow_statistics,
        sp.allow_waha_creation,
        sp.allow_export
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = $1 AND us.status = 'active'
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.json({ subscription: null });
    }
    
    res.json({ subscription: result.rows[0] });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי מנוי' });
  }
}

/**
 * Get live chat settings
 */
async function getLiveChatSettings(req, res) {
  try {
    const userId = req.user.id;
    
    // First ensure the settings column exists
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS livechat_settings JSONB DEFAULT '{}'::jsonb`);
    } catch (e) {
      // Column might already exist
    }
    
    const result = await pool.query(
      `SELECT livechat_settings FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    const settings = result.rows[0].livechat_settings || {};
    res.json({
      on_manual_message: settings.on_manual_message || 'pause_temp',
      pause_duration: settings.pause_duration || 30,
      pause_unit: settings.pause_unit || 'minutes',
    });
  } catch (error) {
    console.error('Get live chat settings error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  }
}

/**
 * Update live chat settings
 */
async function updateLiveChatSettings(req, res) {
  try {
    const userId = req.user.id;
    const { on_manual_message, pause_duration, pause_unit } = req.body;
    
    // First ensure the settings column exists
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS livechat_settings JSONB DEFAULT '{}'::jsonb`);
    } catch (e) {
      // Column might already exist
    }
    
    const settings = {
      on_manual_message: on_manual_message || 'pause_temp',
      pause_duration: pause_duration || 30,
      pause_unit: pause_unit || 'minutes',
    };
    
    await pool.query(
      `UPDATE users SET livechat_settings = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(settings), userId]
    );
    
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Update live chat settings error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת הגדרות' });
  }
}

module.exports = { getProfile, updateProfile, changePassword, getSubscription, getLiveChatSettings, updateLiveChatSettings };
