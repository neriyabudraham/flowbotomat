const db = require('../config/database');

// Cache for free plan limits (refreshes every 5 minutes)
let freePlanCache = null;
let freePlanCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the free plan limits from database
 */
async function getFreePlanLimits() {
  const now = Date.now();
  if (freePlanCache && (now - freePlanCacheTime) < CACHE_TTL) {
    return freePlanCache;
  }
  
  const result = await db.query(`
    SELECT max_contacts, max_bots, max_bot_runs_per_month
    FROM subscription_plans
    WHERE price = 0 AND is_active = true
    ORDER BY sort_order ASC
    LIMIT 1
  `);
  
  if (result.rows.length > 0) {
    freePlanCache = result.rows[0];
    freePlanCacheTime = now;
    return freePlanCache;
  }
  
  // Fallback if no free plan exists
  return { max_contacts: 0, max_bots: 0, max_bot_runs_per_month: 0 };
}

/**
 * Check and enforce contact limit before creating a new contact
 * Returns: { allowed: boolean, limit: number, used: number, error?: string }
 * 
 * Status Bot subscribers get unlimited contacts by default
 */
async function checkContactLimit(userId) {
  // Get user's feature overrides
  const userResult = await db.query(
    'SELECT feature_overrides FROM users WHERE id = $1',
    [userId]
  );
  const featureOverrides = userResult.rows[0]?.feature_overrides || null;
  
  // Check if user has an active Status Bot subscription (unlimited contacts)
  const statusBotResult = await db.query(`
    SELECT uss.id 
    FROM user_service_subscriptions uss
    JOIN additional_services s ON s.id = uss.service_id
    WHERE uss.user_id = $1 
    AND s.slug = 'status-bot'
    AND (
      uss.status IN ('active', 'trial')
      OR (uss.status = 'cancelled' AND (
        (uss.expires_at IS NOT NULL AND uss.expires_at > NOW())
        OR (uss.trial_ends_at IS NOT NULL AND uss.trial_ends_at > NOW())
      ))
    )
  `, [userId]);
  
  // Status Bot users get unlimited contacts
  if (statusBotResult.rows.length > 0) {
    return { allowed: true, limit: -1, used: 0, statusBotUnlimited: true };
  }
  
  // Get subscription limits
  const subResult = await db.query(`
    SELECT sp.max_contacts
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
  
  // Get free plan limits as fallback
  const freePlan = await getFreePlanLimits();
  let maxContacts = freePlan.max_contacts;
  
  // Check feature overrides first (highest priority)
  if (featureOverrides?.max_contacts !== null && featureOverrides?.max_contacts !== undefined) {
    maxContacts = featureOverrides.max_contacts;
  } else if (subResult.rows[0]?.max_contacts !== undefined) {
    maxContacts = subResult.rows[0].max_contacts;
  }
  
  // -1 means unlimited
  if (maxContacts === -1) {
    return { allowed: true, limit: -1, used: 0 };
  }
  
  // Count current contacts (excluding groups)
  const countResult = await db.query(
    `SELECT COUNT(*) as count FROM contacts WHERE user_id = $1 AND phone NOT LIKE '%@g.us'`,
    [userId]
  );
  const used = parseInt(countResult.rows[0]?.count || 0);
  
  return {
    allowed: used < maxContacts,
    limit: maxContacts,
    used,
    error: used >= maxContacts 
      ? `הגעת למגבלת אנשי הקשר (${maxContacts}). שדרג את החבילה שלך להוספת אנשי קשר נוספים.`
      : null
  };
}

/**
 * Check and enforce bot limit before creating a new bot
 */
async function checkBotLimit(userId) {
  // Get user's feature overrides
  const userResult = await db.query(
    'SELECT feature_overrides FROM users WHERE id = $1',
    [userId]
  );
  const featureOverrides = userResult.rows[0]?.feature_overrides || null;
  
  // Get subscription limits
  const subResult = await db.query(`
    SELECT sp.max_bots
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
  
  // Get free plan limits as fallback
  const freePlan = await getFreePlanLimits();
  let maxBots = freePlan.max_bots;
  
  // Check feature overrides first
  if (featureOverrides?.max_bots !== null && featureOverrides?.max_bots !== undefined) {
    maxBots = featureOverrides.max_bots;
  } else if (subResult.rows[0]?.max_bots !== undefined) {
    maxBots = subResult.rows[0].max_bots;
  }
  
  // -1 means unlimited
  if (maxBots === -1) {
    return { allowed: true, limit: -1, used: 0 };
  }
  
  // Count own bots
  const ownBotsResult = await db.query(
    'SELECT COUNT(*) as count FROM bots WHERE user_id = $1',
    [userId]
  );
  
  // Count shared edit bots
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
    allowed: used < maxBots,
    limit: maxBots,
    used,
    ownBots,
    sharedEditBots,
    error: used >= maxBots 
      ? `הגעת למגבלת הבוטים (${maxBots}). שדרג את החבילה שלך או מחק בוט קיים.`
      : null
  };
}

/**
 * Check and enforce bot runs limit
 */
async function checkBotRunsLimit(userId) {
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
  const subResult = await db.query(`
    SELECT sp.max_bot_runs_per_month
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
  
  // Get free plan limits as fallback
  const freePlan = await getFreePlanLimits();
  let maxRuns = freePlan.max_bot_runs_per_month;
  
  if (featureOverrides?.max_bot_runs_per_month !== null && featureOverrides?.max_bot_runs_per_month !== undefined) {
    maxRuns = featureOverrides.max_bot_runs_per_month;
  } else if (subResult.rows[0]?.max_bot_runs_per_month !== undefined) {
    maxRuns = subResult.rows[0].max_bot_runs_per_month;
  }
  
  // -1 means unlimited
  if (maxRuns === -1) {
    return { allowed: true, limit: -1, used: 0 };
  }
  
  // Get usage for this month
  const usageResult = await db.query(`
    SELECT bot_runs FROM usage_tracking 
    WHERE user_id = $1 AND period_year = $2 AND period_month = $3
  `, [userId, year, month]);
  
  const used = usageResult.rows[0]?.bot_runs || 0;
  
  return {
    allowed: used < maxRuns,
    limit: maxRuns,
    used,
    error: used >= maxRuns
      ? `הגעת למגבלת ההרצות החודשית (${maxRuns}). שדרג את החבילה שלך או המתן לחודש הבא.`
      : null
  };
}

/**
 * Safe contact creation with limit enforcement
 * Returns: { success: boolean, contact?: object, error?: string }
 */
async function createContactWithLimit(userId, phone, waId, displayName, options = {}) {
  const { skipLimitCheck = false, isGroup = false } = options;
  
  // Groups don't count towards contact limit
  if (!isGroup && !skipLimitCheck) {
    const limitCheck = await checkContactLimit(userId);
    if (!limitCheck.allowed) {
      console.log(`[Limits] Contact creation blocked for user ${userId}: ${limitCheck.error}`);
      return { success: false, error: limitCheck.error, limitExceeded: true };
    }
  }
  
  try {
    const result = await db.query(
      `INSERT INTO contacts (user_id, phone, wa_id, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, phone) DO UPDATE SET 
         display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), contacts.display_name),
         updated_at = NOW()
       RETURNING *`,
      [userId, phone, waId, displayName]
    );
    
    return { success: true, contact: result.rows[0] };
  } catch (error) {
    console.error('[Limits] Error creating contact:', error);
    return { success: false, error: 'שגיאה ביצירת איש קשר' };
  }
}

module.exports = {
  checkContactLimit,
  checkBotLimit,
  checkBotRunsLimit,
  createContactWithLimit
};
