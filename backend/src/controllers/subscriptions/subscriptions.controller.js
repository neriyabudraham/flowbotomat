const db = require('../../config/database');

/**
 * Get current user's subscription
 */
async function getMySubscription(req, res) {
  try {
    const userId = req.user.id;
    
    const { data } = await db.query(`
      SELECT 
        us.*,
        sp.name as plan_name,
        sp.name_he as plan_name_he,
        sp.price,
        sp.max_bots,
        sp.max_bot_runs_per_month,
        sp.max_contacts,
        sp.allow_statistics,
        sp.allow_waha_creation,
        sp.allow_export
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status = 'active'
    `, [userId]);
    
    // If no subscription, return free plan limits
    if (!data || data.length === 0) {
      const { data: freePlan } = await db.query(
        `SELECT * FROM subscription_plans WHERE price = 0 AND is_active = true LIMIT 1`
      );
      
      return res.json({
        subscription: null,
        plan: freePlan?.[0] || {
          name_he: 'חינם',
          max_bots: 1,
          max_bot_runs_per_month: 500,
          max_contacts: 100,
          allow_statistics: false,
          allow_waha_creation: false,
          allow_export: false
        }
      });
    }
    
    res.json({ subscription: data[0], plan: data[0] });
  } catch (error) {
    console.error('[Subscriptions] Get my subscription error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מנוי' });
  }
}

/**
 * Get user's current usage for the month
 */
async function getMyUsage(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Get or create usage record
    let { data } = await db.query(`
      SELECT * FROM usage_tracking 
      WHERE user_id = $1 AND period_year = $2 AND period_month = $3
    `, [userId, year, month]);
    
    if (!data || data.length === 0) {
      // Create new usage record
      const { data: newUsage } = await db.query(`
        INSERT INTO usage_tracking (user_id, period_year, period_month)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, year, month]);
      data = newUsage;
    }
    
    // Get subscription limits
    const { data: subData } = await db.query(`
      SELECT sp.max_bot_runs_per_month, sp.max_contacts, sp.max_bots
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status = 'active'
    `, [userId]);
    
    // Default to free plan limits if no subscription
    const limits = subData?.[0] || {
      max_bot_runs_per_month: 500,
      max_contacts: 100,
      max_bots: 1
    };
    
    // Get actual counts
    const { data: botCount } = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1',
      [userId]
    );
    
    const { data: contactCount } = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      usage: data[0],
      limits,
      counts: {
        bots: parseInt(botCount?.[0]?.count || 0),
        contacts: parseInt(contactCount?.[0]?.count || 0)
      }
    });
  } catch (error) {
    console.error('[Subscriptions] Get usage error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שימוש' });
  }
}

/**
 * Admin: Get all subscriptions
 */
async function getAllSubscriptions(req, res) {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { data } = await db.query(`
      SELECT 
        us.*,
        u.name as user_name,
        u.email as user_email,
        sp.name_he as plan_name
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscription_plans sp ON us.plan_id = sp.id
      ORDER BY us.created_at DESC
    `);
    
    res.json({ subscriptions: data });
  } catch (error) {
    console.error('[Subscriptions] Get all error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מנויים' });
  }
}

/**
 * Admin: Assign subscription to user
 */
async function assignSubscription(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { userId, planId, expiresAt, adminNotes } = req.body;
    
    // Verify user exists
    const { data: user } = await db.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    
    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Verify plan exists
    const { data: plan } = await db.query(
      'SELECT id FROM subscription_plans WHERE id = $1',
      [planId]
    );
    
    if (!plan || plan.length === 0) {
      return res.status(404).json({ error: 'תכנית לא נמצאה' });
    }
    
    // Upsert subscription
    const { data } = await db.query(`
      INSERT INTO user_subscriptions (user_id, plan_id, expires_at, is_manual, admin_notes)
      VALUES ($1, $2, $3, true, $4)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        plan_id = $2, 
        expires_at = $3, 
        status = 'active',
        is_manual = true,
        admin_notes = $4,
        updated_at = NOW()
      RETURNING *
    `, [userId, planId, expiresAt || null, adminNotes || null]);
    
    res.json({ subscription: data[0] });
  } catch (error) {
    console.error('[Subscriptions] Assign error:', error);
    res.status(500).json({ error: 'שגיאה בהקצאת מנוי' });
  }
}

/**
 * Admin: Cancel user subscription
 */
async function cancelSubscription(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { subscriptionId } = req.params;
    
    const { data } = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [subscriptionId]);
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'מנוי לא נמצא' });
    }
    
    res.json({ subscription: data[0] });
  } catch (error) {
    console.error('[Subscriptions] Cancel error:', error);
    res.status(500).json({ error: 'שגיאה בביטול מנוי' });
  }
}

/**
 * Increment bot runs counter
 */
async function incrementBotRuns(userId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  await db.query(`
    INSERT INTO usage_tracking (user_id, period_year, period_month, bot_runs)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (user_id, period_year, period_month) 
    DO UPDATE SET bot_runs = usage_tracking.bot_runs + 1, updated_at = NOW()
  `, [userId, year, month]);
}

/**
 * Check if user has reached their limit
 */
async function checkLimit(userId, limitType) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  // Get subscription limits
  const { data: subData } = await db.query(`
    SELECT sp.*
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = $1 AND us.status = 'active'
  `, [userId]);
  
  // Default to free plan
  const limits = subData?.[0] || {
    max_bots: 1,
    max_bot_runs_per_month: 500,
    max_contacts: 100,
    allow_statistics: false,
    allow_waha_creation: false,
    allow_export: false
  };
  
  // -1 means unlimited
  if (limitType === 'bot_runs') {
    if (limits.max_bot_runs_per_month === -1) return { allowed: true, limit: -1, used: 0 };
    
    const { data: usage } = await db.query(`
      SELECT bot_runs FROM usage_tracking 
      WHERE user_id = $1 AND period_year = $2 AND period_month = $3
    `, [userId, year, month]);
    
    const used = usage?.[0]?.bot_runs || 0;
    return {
      allowed: used < limits.max_bot_runs_per_month,
      limit: limits.max_bot_runs_per_month,
      used
    };
  }
  
  if (limitType === 'bots') {
    if (limits.max_bots === -1) return { allowed: true, limit: -1, used: 0 };
    
    const { data: count } = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1',
      [userId]
    );
    
    const used = parseInt(count?.[0]?.count || 0);
    return {
      allowed: used < limits.max_bots,
      limit: limits.max_bots,
      used
    };
  }
  
  if (limitType === 'contacts') {
    if (limits.max_contacts === -1) return { allowed: true, limit: -1, used: 0 };
    
    const { data: count } = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    const used = parseInt(count?.[0]?.count || 0);
    return {
      allowed: used < limits.max_contacts,
      limit: limits.max_contacts,
      used
    };
  }
  
  if (limitType === 'statistics') {
    return { allowed: limits.allow_statistics };
  }
  
  if (limitType === 'waha_creation') {
    return { allowed: limits.allow_waha_creation };
  }
  
  if (limitType === 'export') {
    return { allowed: limits.allow_export };
  }
  
  return { allowed: true };
}

module.exports = {
  getMySubscription,
  getMyUsage,
  getAllSubscriptions,
  assignSubscription,
  cancelSubscription,
  incrementBotRuns,
  checkLimit
};
