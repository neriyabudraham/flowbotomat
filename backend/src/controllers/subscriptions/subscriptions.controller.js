const db = require('../../config/database');

/**
 * Get current user's subscription
 */
async function getMySubscription(req, res) {
  try {
    const userId = req.user.id;
    
    // Get subscription including cancelled with future end date
    const result = await db.query(`
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
        sp.allow_export,
        sp.allow_api_access,
        sp.priority_support,
        (SELECT MAX(created_at) FROM payment_history ph WHERE ph.user_id = us.user_id AND ph.status = 'success') as last_charge_date,
        (SELECT COUNT(*) > 0 FROM user_payment_methods pm WHERE pm.user_id = us.user_id AND pm.is_active = true) as has_payment_method
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 
      AND (
        us.status IN ('active', 'trial')
        OR (us.status = 'cancelled' AND (
          (us.expires_at IS NOT NULL AND us.expires_at > NOW())
          OR (us.trial_ends_at IS NOT NULL AND us.trial_ends_at > NOW())
        ))
      )
    `, [userId]);
    
    // If no subscription, return free plan limits
    if (result.rows.length === 0) {
      const freePlanResult = await db.query(
        `SELECT * FROM subscription_plans WHERE price = 0 AND is_active = true LIMIT 1`
      );
      
      return res.json({
        subscription: null,
        plan: freePlanResult.rows[0] || {
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
    
    res.json({ subscription: result.rows[0], plan: result.rows[0] });
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
    let usageResult = await db.query(`
      SELECT * FROM usage_tracking 
      WHERE user_id = $1 AND period_year = $2 AND period_month = $3
    `, [userId, year, month]);
    
    if (usageResult.rows.length === 0) {
      // Create new usage record
      usageResult = await db.query(`
        INSERT INTO usage_tracking (user_id, period_year, period_month)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, year, month]);
    }
    
    // Get user's feature overrides
    const userResult = await db.query(
      'SELECT feature_overrides FROM users WHERE id = $1',
      [userId]
    );
    const featureOverrides = userResult.rows[0]?.feature_overrides || null;
    
    // Get subscription limits (including cancelled with future end date)
    const subResult = await db.query(`
      SELECT sp.max_bot_runs_per_month, sp.max_contacts, sp.max_bots
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 
      AND (
        us.status IN ('active', 'trial')
        OR (us.status = 'cancelled' AND (
          (us.expires_at IS NOT NULL AND us.expires_at > NOW())
          OR (us.trial_ends_at IS NOT NULL AND us.trial_ends_at > NOW())
        ))
      )
    `, [userId]);
    
    // Default to free plan limits if no subscription
    const planLimits = subResult.rows[0] || {
      max_bot_runs_per_month: 500,
      max_contacts: 100,
      max_bots: 1
    };
    
    // Merge: feature overrides take precedence over plan limits
    const limits = { ...planLimits };
    if (featureOverrides) {
      if (featureOverrides.max_bot_runs_per_month !== null && featureOverrides.max_bot_runs_per_month !== undefined) {
        limits.max_bot_runs_per_month = featureOverrides.max_bot_runs_per_month;
      }
      if (featureOverrides.max_contacts !== null && featureOverrides.max_contacts !== undefined) {
        limits.max_contacts = featureOverrides.max_contacts;
      }
      if (featureOverrides.max_bots !== null && featureOverrides.max_bots !== undefined) {
        limits.max_bots = featureOverrides.max_bots;
      }
    }
    
    // Get actual counts
    // Own bots
    const ownBotsResult = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1',
      [userId]
    );
    
    // Bots shared with edit permission (count towards limit)
    const sharedEditBotsResult = await db.query(
      `SELECT COUNT(*) as count FROM bot_shares 
       WHERE shared_with_id = $1 
       AND permission IN ('edit', 'admin')
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    
    // Bots shared with view permission (don't count towards limit)
    const sharedViewBotsResult = await db.query(
      `SELECT COUNT(*) as count FROM bot_shares 
       WHERE shared_with_id = $1 
       AND permission = 'view'
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    
    // Check if user has any disabled bots (affects creation ability)
    const disabledBotsResult = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND is_active = false',
      [userId]
    );
    
    const contactCountResult = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    const ownBots = parseInt(ownBotsResult.rows[0]?.count || 0);
    const sharedEditBots = parseInt(sharedEditBotsResult.rows[0]?.count || 0);
    const sharedViewBots = parseInt(sharedViewBotsResult.rows[0]?.count || 0);
    const disabledBots = parseInt(disabledBotsResult.rows[0]?.count || 0);
    
    res.json({
      usage: usageResult.rows[0],
      limits,
      counts: {
        bots: ownBots + sharedEditBots, // Total that counts towards limit
        ownBots,
        sharedEditBots,
        sharedViewBots,
        disabledBots,
        contacts: parseInt(contactCountResult.rows[0]?.count || 0)
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
    
    const result = await db.query(`
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
    
    res.json({ subscriptions: result.rows });
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
    const userResult = await db.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Verify plan exists
    const planResult = await db.query(
      'SELECT id FROM subscription_plans WHERE id = $1',
      [planId]
    );
    
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'תכנית לא נמצאה' });
    }
    
    // Upsert subscription
    const result = await db.query(`
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
    
    res.json({ subscription: result.rows[0] });
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
    
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [subscriptionId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'מנוי לא נמצא' });
    }
    
    res.json({ subscription: result.rows[0] });
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
 * First checks user feature_overrides, then falls back to subscription plan limits
 */
async function checkLimit(userId, limitType) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  // Get user's feature overrides
  const userResult = await db.query(
    'SELECT feature_overrides FROM users WHERE id = $1',
    [userId]
  );
  const featureOverrides = userResult.rows[0]?.feature_overrides || null;
  
  // Get subscription limits
  // Include: active, trial, AND cancelled with future end date
  const subResult = await db.query(`
    SELECT sp.*, us.status as sub_status, us.expires_at, us.trial_ends_at
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = $1 
    AND (
      us.status IN ('active', 'trial')
      OR (us.status = 'cancelled' AND (
        (us.expires_at IS NOT NULL AND us.expires_at > NOW())
        OR (us.trial_ends_at IS NOT NULL AND us.trial_ends_at > NOW())
      ))
    )
  `, [userId]);
  
  // Default to free plan
  const planLimits = subResult.rows[0] || {
    max_bots: 1,
    max_bot_runs_per_month: 500,
    max_contacts: 100,
    allow_statistics: false,
    allow_waha_creation: false,
    allow_export: false,
    allow_group_forwards: false,
    max_group_forwards: 0,
    max_forward_targets: 0,
    max_livechats: 0,
    allow_livechat: false
  };
  
  // Merge: overrides take precedence over plan limits
  const limits = { ...planLimits };
  if (featureOverrides) {
    for (const key of Object.keys(featureOverrides)) {
      if (featureOverrides[key] !== null && featureOverrides[key] !== undefined) {
        limits[key] = featureOverrides[key];
      }
    }
  }
  
  // -1 means unlimited
  if (limitType === 'bot_runs') {
    if (limits.max_bot_runs_per_month === -1) return { allowed: true, limit: -1, used: 0 };
    
    const usageResult = await db.query(`
      SELECT bot_runs FROM usage_tracking 
      WHERE user_id = $1 AND period_year = $2 AND period_month = $3
    `, [userId, year, month]);
    
    const used = usageResult.rows[0]?.bot_runs || 0;
    return {
      allowed: used < limits.max_bot_runs_per_month,
      limit: limits.max_bot_runs_per_month,
      used
    };
  }
  
  if (limitType === 'bots') {
    if (limits.max_bots === -1) return { allowed: true, limit: -1, used: 0 };
    
    // Count user's own bots
    const ownBotsResult = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1',
      [userId]
    );
    
    // Count bots shared with user for EDIT (not view-only)
    // Edit/Admin shares count towards user's bot limit
    const sharedEditBotsResult = await db.query(
      `SELECT COUNT(*) as count FROM bot_shares 
       WHERE shared_with_id = $1 
       AND permission IN ('edit', 'admin')
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    
    const ownBots = parseInt(ownBotsResult.rows[0]?.count || 0);
    const sharedEditBots = parseInt(sharedEditBotsResult.rows[0]?.count || 0);
    const used = ownBots + sharedEditBots;
    
    return {
      allowed: used < limits.max_bots,
      limit: limits.max_bots,
      used,
      ownBots,
      sharedEditBots
    };
  }
  
  if (limitType === 'contacts') {
    if (limits.max_contacts === -1) return { allowed: true, limit: -1, used: 0 };
    
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    const used = parseInt(countResult.rows[0]?.count || 0);
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
  
  // Group forwards feature check
  if (limitType === 'allow_group_forwards') {
    return { allowed: limits.allow_group_forwards || false };
  }
  
  // Max group forwards limit
  if (limitType === 'max_group_forwards') {
    const maxForwards = limits.max_group_forwards ?? 0;
    if (maxForwards === -1) return { allowed: true, limit: -1, used: 0 };
    if (maxForwards === 0) return { allowed: false, limit: 0, used: 0 };
    
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM group_forwards WHERE user_id = $1',
      [userId]
    );
    
    const used = parseInt(countResult.rows[0]?.count || 0);
    return {
      allowed: used < maxForwards,
      limit: maxForwards,
      used
    };
  }
  
  // Max forward targets per forward
  if (limitType === 'max_forward_targets') {
    const maxTargets = limits.max_forward_targets ?? 0;
    if (maxTargets === -1) return { allowed: true, limit: -1, used: 0 };
    return { allowed: true, limit: maxTargets, used: 0 };
  }
  
  return { allowed: true };
}

/**
 * Alert admin if user has more bots than their plan allows
 * This should not happen normally, but catches edge cases
 */
async function alertAdminIfOverLimit(userId, limitType) {
  try {
    const limitCheck = await checkLimit(userId, limitType);
    
    // If user is at or under limit, no problem
    if (limitCheck.allowed || limitCheck.limit === -1) {
      return;
    }
    
    // User is over limit! This shouldn't happen
    const userResult = await db.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) return;
    
    const user = userResult.rows[0];
    const overBy = limitCheck.used - limitCheck.limit;
    
    console.warn(`[ALERT] User ${user.email} (${userId}) is OVER ${limitType} limit by ${overBy}! Used: ${limitCheck.used}, Limit: ${limitCheck.limit}`);
    
    // Create admin notification
    await db.query(`
      INSERT INTO notifications (
        user_id, 
        notification_type, 
        title, 
        message, 
        metadata,
        is_admin_notification
      ) VALUES (
        $1,
        'admin_alert',
        'משתמש חורג ממכסה',
        $2,
        $3,
        true
      )
    `, [
      userId,
      `המשתמש ${user.name || user.email} חורג ממכסת ${limitType === 'bots' ? 'הבוטים' : limitType} ב-${overBy}. משתמש: ${limitCheck.used}, מכסה: ${limitCheck.limit}`,
      JSON.stringify({
        type: 'over_limit',
        limitType,
        userId,
        userEmail: user.email,
        userName: user.name,
        used: limitCheck.used,
        limit: limitCheck.limit,
        overBy
      })
    ]);
    
    // TODO: Send email to admin
    // await sendAdminEmail({ subject: 'התראה: משתמש חורג ממכסה', ... });
    
  } catch (error) {
    console.error('[Subscriptions] Alert admin error:', error);
    // Don't throw - this is a non-critical operation
  }
}

module.exports = {
  getMySubscription,
  getMyUsage,
  getAllSubscriptions,
  assignSubscription,
  cancelSubscription,
  incrementBotRuns,
  checkLimit,
  alertAdminIfOverLimit
};
