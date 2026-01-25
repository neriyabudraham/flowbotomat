const db = require('../../config/database');

/**
 * GET /api/auth/me
 */
const me = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Ensure columns exist
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_banner_dismissed BOOLEAN DEFAULT false`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_ever_paid BOOLEAN DEFAULT false`);
    } catch (e) {}
    
    // Get user info
    const userResult = await db.query(
      `SELECT id, email, name, role, language, theme, created_at, avatar_url, google_id, 
              has_ever_paid, referral_banner_dismissed
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get subscription info
    const subResult = await db.query(`
      SELECT 
        us.id as subscription_id,
        us.status as subscription_status,
        us.is_trial,
        us.trial_ends_at,
        us.started_at,
        us.expires_at,
        sp.id as plan_id,
        sp.name as plan_name,
        sp.name_he as plan_name_he,
        sp.price,
        sp.max_bots,
        sp.max_bot_runs_per_month,
        sp.max_contacts,
        sp.allow_statistics,
        sp.allow_waha_creation,
        sp.allow_export,
        sp.allow_api_access,
        sp.priority_support
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status IN ('active', 'trial')
    `, [userId]);

    // Build subscription object
    let subscription = null;
    if (subResult.rows.length > 0) {
      const sub = subResult.rows[0];
      subscription = {
        id: sub.subscription_id,
        status: sub.subscription_status,
        is_trial: sub.is_trial,
        trial_ends_at: sub.trial_ends_at,
        started_at: sub.started_at,
        expires_at: sub.expires_at,
        plan: {
          id: sub.plan_id,
          name: sub.plan_name,
          name_he: sub.plan_name_he,
          price: parseFloat(sub.price),
          max_bots: sub.max_bots,
          max_bot_runs_per_month: sub.max_bot_runs_per_month,
          max_contacts: sub.max_contacts,
          allow_statistics: sub.allow_statistics,
          allow_waha_creation: sub.allow_waha_creation,
          allow_export: sub.allow_export,
          allow_api_access: sub.allow_api_access,
          priority_support: sub.priority_support
        }
      };
    }

    res.json({ 
      user: {
        ...user,
        subscription,
        subscription_plan_id: subscription?.plan?.id || null
      }
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { me };
