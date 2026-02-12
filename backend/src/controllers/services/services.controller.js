const db = require('../../config/database');
const sumitService = require('../../services/payment/sumit.service');

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * Get all active services (public)
 */
async function getServices(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        id, slug, name, name_he, description, description_he,
        price, yearly_price, billing_period, trial_days,
        icon, color, external_url, features,
        is_coming_soon, sort_order
      FROM additional_services
      WHERE is_active = true
      ORDER BY sort_order ASC, name_he ASC
    `);
    
    res.json({ services: result.rows });
  } catch (error) {
    console.error('[Services] Get services error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שירותים' });
  }
}

// ============================================
// USER ENDPOINTS (authenticated)
// ============================================

/**
 * Get user's active service subscriptions
 */
async function getMyServices(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        uss.*,
        s.slug, s.name, s.name_he, s.description_he,
        s.price, s.yearly_price, s.icon, s.color, s.external_url, s.features
      FROM user_service_subscriptions uss
      JOIN additional_services s ON s.id = uss.service_id
      WHERE uss.user_id = $1 AND uss.status IN ('active', 'trial')
      ORDER BY uss.started_at DESC
    `, [userId]);
    
    res.json({ subscriptions: result.rows });
  } catch (error) {
    console.error('[Services] Get my services error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת השירותים שלך' });
  }
}

/**
 * Subscribe to a service
 * 
 * Payment flow (identical to main subscription):
 * - Always requires a payment method (sumit_customer_id)
 * - Always creates a standing order in Sumit
 * - For trials: first charge is scheduled for trial end date
 * - For immediate: charges immediately
 * - Cancellation removes the standing order from Sumit
 */
async function subscribeToService(req, res) {
  try {
    const userId = req.user.id;
    const { serviceId } = req.params;
    const { billingPeriod = 'monthly' } = req.body;
    
    // Get service details
    const serviceResult = await db.query(
      'SELECT * FROM additional_services WHERE id = $1 AND is_active = true',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'שירות לא נמצא' });
    }
    
    const service = serviceResult.rows[0];
    
    // Check if already subscribed
    const existingResult = await db.query(
      'SELECT * FROM user_service_subscriptions WHERE user_id = $1 AND service_id = $2',
      [userId, serviceId]
    );
    
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.status === 'active' || existing.status === 'trial') {
        return res.status(400).json({ error: 'כבר יש לך מנוי פעיל לשירות זה' });
      }
    }
    
    // Get user's payment info from user_payment_methods
    const userResult = await db.query(`
      SELECT u.*, upm.sumit_customer_id, upm.last_4_digits, upm.card_brand
      FROM users u
      LEFT JOIN user_payment_methods upm ON upm.user_id = u.id AND upm.sumit_customer_id IS NOT NULL
      WHERE u.id = $1
      LIMIT 1
    `, [userId]);
    
    const user = userResult.rows[0];
    
    // Always require payment method for paid services
    if (service.price > 0 && !user.sumit_customer_id) {
      return res.status(400).json({ 
        error: 'נדרש אמצעי תשלום',
        needsPaymentMethod: true 
      });
    }
    
    // Check if user has custom trial for this service
    const customTrialResult = await db.query(
      'SELECT * FROM user_service_trials WHERE user_id = $1 AND service_id = $2',
      [userId, serviceId]
    );
    
    const trialDays = customTrialResult.rows.length > 0 
      ? customTrialResult.rows[0].custom_trial_days 
      : service.trial_days;
    
    // Determine price
    const price = billingPeriod === 'yearly' 
      ? (service.yearly_price || service.price * 10) 
      : service.price;
    
    // Calculate dates
    const now = new Date();
    let status = 'active';
    let isTrial = false;
    let trialEndsAt = null;
    let nextChargeDate = null;
    let sumitStandingOrderId = null;
    
    if (trialDays > 0) {
      status = 'trial';
      isTrial = true;
      trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
      nextChargeDate = trialEndsAt;
    } else {
      // Calculate next charge date based on billing period
      if (billingPeriod === 'yearly') {
        nextChargeDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      } else {
        nextChargeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
    }
    
    // Create standing order in Sumit (for both trial and immediate)
    // For trial: startDate = trialEndsAt (first charge at trial end)
    // For immediate: startDate = null (charge now)
    if (price > 0 && user.sumit_customer_id) {
      try {
        const durationMonths = billingPeriod === 'yearly' ? 12 : 1;
        const startDate = isTrial ? trialEndsAt : null; // Trial = future, immediate = now
        
        console.log(`[Services] Creating standing order - Trial: ${isTrial}, StartDate: ${startDate?.toISOString() || 'immediate'}, Amount: ${price}`);
        
        const standingOrderResponse = await sumitService.chargeRecurring({
          customerId: user.sumit_customer_id,
          amount: price,
          description: `מנוי ${service.name_he} - ${billingPeriod === 'yearly' ? 'שנתי' : 'חודשי'}`,
          durationMonths: durationMonths,
          recurrence: null, // unlimited
          startDate: startDate, // null = immediate, future date = scheduled
        });
        
        if (!standingOrderResponse.success) {
          console.error('[Services] Sumit standing order failed:', standingOrderResponse.error);
          return res.status(400).json({ 
            error: standingOrderResponse.error || 'שגיאה ביצירת הוראת קבע'
          });
        }
        
        sumitStandingOrderId = standingOrderResponse.standingOrderId;
        console.log(`[Services] ✅ Standing order created: ${sumitStandingOrderId}`);
        
      } catch (err) {
        console.error('[Services] Sumit error:', err);
        return res.status(400).json({ error: 'שגיאה בתשלום' });
      }
    }
    
    // Create or update subscription
    let subscription;
    if (existingResult.rows.length > 0) {
      // Reactivate existing subscription
      const updateResult = await db.query(`
        UPDATE user_service_subscriptions
        SET status = $1, is_trial = $2, trial_ends_at = $3, 
            next_charge_date = $4, billing_period = $5,
            started_at = NOW(), cancelled_at = NULL,
            sumit_standing_order_id = $6, updated_at = NOW()
        WHERE user_id = $7 AND service_id = $8
        RETURNING *
      `, [status, isTrial, trialEndsAt, nextChargeDate, billingPeriod, 
          sumitStandingOrderId, userId, serviceId]);
      subscription = updateResult.rows[0];
    } else {
      // Create new subscription
      const insertResult = await db.query(`
        INSERT INTO user_service_subscriptions 
        (user_id, service_id, status, is_trial, trial_ends_at, 
         next_charge_date, billing_period, sumit_standing_order_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [userId, serviceId, status, isTrial, trialEndsAt, 
          nextChargeDate, billingPeriod, sumitStandingOrderId]);
      subscription = insertResult.rows[0];
    }
    
    // If immediate payment was made (not trial), log it
    if (!isTrial && price > 0 && sumitStandingOrderId) {
      await db.query(`
        INSERT INTO service_payment_history 
        (user_id, service_id, subscription_id, amount, status, payment_type, description)
        VALUES ($1, $2, $3, $4, 'success', 'recurring', $5)
      `, [userId, serviceId, subscription.id, price, `הרשמה ל${service.name_he}`]);
    }
    
    // Delete used custom trial if exists
    if (customTrialResult.rows.length > 0) {
      await db.query(
        'DELETE FROM user_service_trials WHERE user_id = $1 AND service_id = $2',
        [userId, serviceId]
      );
    }
    
    res.json({ 
      success: true, 
      subscription,
      message: isTrial 
        ? `התחלת תקופת ניסיון ל-${trialDays} ימים. החיוב יבוצע בתאריך ${trialEndsAt.toLocaleDateString('he-IL')}`
        : `נרשמת בהצלחה ל${service.name_he}`
    });
    
  } catch (error) {
    console.error('[Services] Subscribe error:', error);
    res.status(500).json({ error: 'שגיאה בהרשמה לשירות' });
  }
}

/**
 * Cancel service subscription
 * 
 * This cancels the standing order in Sumit and marks the subscription as cancelled
 */
async function cancelSubscription(req, res) {
  try {
    const userId = req.user.id;
    const { serviceId } = req.params;
    
    // Get subscription with user's Sumit customer ID
    const subResult = await db.query(`
      SELECT uss.*, s.name_he, upm.sumit_customer_id
      FROM user_service_subscriptions uss
      JOIN additional_services s ON s.id = uss.service_id
      LEFT JOIN user_payment_methods upm ON upm.user_id = uss.user_id AND upm.sumit_customer_id IS NOT NULL
      WHERE uss.user_id = $1 AND uss.service_id = $2
    `, [userId, serviceId]);
    
    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'מנוי לא נמצא' });
    }
    
    const subscription = subResult.rows[0];
    
    if (subscription.status === 'cancelled') {
      return res.status(400).json({ error: 'המנוי כבר בוטל' });
    }
    
    // Cancel standing order in Sumit if exists
    if (subscription.sumit_standing_order_id && subscription.sumit_customer_id) {
      try {
        console.log(`[Services] Cancelling standing order ${subscription.sumit_standing_order_id} for customer ${subscription.sumit_customer_id}`);
        const cancelResult = await sumitService.cancelRecurring(
          subscription.sumit_standing_order_id,
          subscription.sumit_customer_id
        );
        
        if (cancelResult.success) {
          console.log(`[Services] ✅ Standing order cancelled in Sumit`);
        } else {
          console.error('[Services] Sumit cancel warning:', cancelResult.error);
          // Continue anyway - we'll cancel in our DB
        }
      } catch (err) {
        console.error('[Services] Sumit cancel error:', err);
        // Continue anyway - we'll cancel in our DB
      }
    }
    
    // Update subscription status
    await db.query(`
      UPDATE user_service_subscriptions
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND service_id = $2
    `, [userId, serviceId]);
    
    res.json({ 
      success: true, 
      message: `המנוי ל${subscription.name_he} בוטל בהצלחה`
    });
    
  } catch (error) {
    console.error('[Services] Cancel subscription error:', error);
    res.status(500).json({ error: 'שגיאה בביטול המנוי' });
  }
}

/**
 * Get usage for a service
 */
async function getServiceUsage(req, res) {
  try {
    const userId = req.user.id;
    const { serviceId } = req.params;
    
    const now = new Date();
    
    const result = await db.query(`
      SELECT * FROM service_usage
      WHERE user_id = $1 AND service_id = $2 
      AND period_year = $3 AND period_month = $4
    `, [userId, serviceId, now.getFullYear(), now.getMonth() + 1]);
    
    res.json({ usage: result.rows[0] || { usage_data: {} } });
    
  } catch (error) {
    console.error('[Services] Get usage error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני שימוש' });
  }
}

/**
 * Check if user has access to a specific service
 */
async function checkServiceAccess(req, res) {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    
    const result = await db.query(`
      SELECT uss.*, s.slug, s.name_he, s.external_url, s.features
      FROM user_service_subscriptions uss
      JOIN additional_services s ON s.id = uss.service_id
      WHERE uss.user_id = $1 AND s.slug = $2 
      AND uss.status IN ('active', 'trial')
    `, [userId, slug]);
    
    if (result.rows.length === 0) {
      return res.json({ hasAccess: false });
    }
    
    const subscription = result.rows[0];
    
    // Check if trial expired
    if (subscription.is_trial && subscription.trial_ends_at) {
      if (new Date(subscription.trial_ends_at) < new Date()) {
        return res.json({ hasAccess: false, trialExpired: true });
      }
    }
    
    res.json({ 
      hasAccess: true, 
      subscription,
      externalUrl: subscription.external_url 
    });
    
  } catch (error) {
    console.error('[Services] Check access error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת גישה' });
  }
}

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * Get all services (admin)
 */
async function adminGetServices(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM user_service_subscriptions WHERE service_id = s.id AND status IN ('active', 'trial')) as active_subscriptions
      FROM additional_services s
      ORDER BY s.sort_order ASC, s.name_he ASC
    `);
    
    res.json({ services: result.rows });
  } catch (error) {
    console.error('[Admin Services] Get services error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שירותים' });
  }
}

/**
 * Create new service (admin)
 */
async function adminCreateService(req, res) {
  try {
    const {
      slug, name, name_he, description, description_he,
      price, yearly_price, billing_period,
      trial_days, allow_custom_trial,
      icon, color, external_url, features,
      is_active, is_coming_soon, sort_order
    } = req.body;
    
    // Check slug uniqueness
    const existingResult = await db.query(
      'SELECT id FROM additional_services WHERE slug = $1',
      [slug]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Slug כבר קיים' });
    }
    
    const result = await db.query(`
      INSERT INTO additional_services (
        slug, name, name_he, description, description_he,
        price, yearly_price, billing_period,
        trial_days, allow_custom_trial,
        icon, color, external_url, features,
        is_active, is_coming_soon, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      slug, name, name_he, description || null, description_he || null,
      price || 0, yearly_price || null, billing_period || 'monthly',
      trial_days || 0, allow_custom_trial !== false,
      icon || null, color || null, external_url || null, 
      JSON.stringify(features || {}),
      is_active !== false, is_coming_soon || false, sort_order || 0
    ]);
    
    res.json({ success: true, service: result.rows[0] });
    
  } catch (error) {
    console.error('[Admin Services] Create service error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת שירות' });
  }
}

/**
 * Update service (admin)
 */
async function adminUpdateService(req, res) {
  try {
    const { serviceId } = req.params;
    const {
      slug, name, name_he, description, description_he,
      price, yearly_price, billing_period,
      trial_days, allow_custom_trial,
      icon, color, external_url, features,
      is_active, is_coming_soon, sort_order
    } = req.body;
    
    // Check if service exists
    const existingResult = await db.query(
      'SELECT * FROM additional_services WHERE id = $1',
      [serviceId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'שירות לא נמצא' });
    }
    
    // Check slug uniqueness if changed
    if (slug && slug !== existingResult.rows[0].slug) {
      const slugCheck = await db.query(
        'SELECT id FROM additional_services WHERE slug = $1 AND id != $2',
        [slug, serviceId]
      );
      if (slugCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Slug כבר קיים' });
      }
    }
    
    const result = await db.query(`
      UPDATE additional_services SET
        slug = COALESCE($1, slug),
        name = COALESCE($2, name),
        name_he = COALESCE($3, name_he),
        description = COALESCE($4, description),
        description_he = COALESCE($5, description_he),
        price = COALESCE($6, price),
        yearly_price = $7,
        billing_period = COALESCE($8, billing_period),
        trial_days = COALESCE($9, trial_days),
        allow_custom_trial = COALESCE($10, allow_custom_trial),
        icon = $11,
        color = $12,
        external_url = $13,
        features = COALESCE($14, features),
        is_active = COALESCE($15, is_active),
        is_coming_soon = COALESCE($16, is_coming_soon),
        sort_order = COALESCE($17, sort_order),
        updated_at = NOW()
      WHERE id = $18
      RETURNING *
    `, [
      slug, name, name_he, description, description_he,
      price, yearly_price, billing_period,
      trial_days, allow_custom_trial,
      icon, color, external_url,
      features ? JSON.stringify(features) : null,
      is_active, is_coming_soon, sort_order,
      serviceId
    ]);
    
    res.json({ success: true, service: result.rows[0] });
    
  } catch (error) {
    console.error('[Admin Services] Update service error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון שירות' });
  }
}

/**
 * Delete service (admin)
 */
async function adminDeleteService(req, res) {
  try {
    const { serviceId } = req.params;
    
    // Check for active subscriptions
    const subsResult = await db.query(
      'SELECT COUNT(*) FROM user_service_subscriptions WHERE service_id = $1 AND status IN (\'active\', \'trial\')',
      [serviceId]
    );
    
    if (parseInt(subsResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'לא ניתן למחוק שירות עם מנויים פעילים' 
      });
    }
    
    await db.query('DELETE FROM additional_services WHERE id = $1', [serviceId]);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[Admin Services] Delete service error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת שירות' });
  }
}

/**
 * Get service subscriptions (admin)
 */
async function adminGetServiceSubscriptions(req, res) {
  try {
    const { serviceId } = req.params;
    
    const result = await db.query(`
      SELECT 
        uss.*,
        u.email, u.name as user_name,
        s.name_he as service_name
      FROM user_service_subscriptions uss
      JOIN users u ON u.id = uss.user_id
      JOIN additional_services s ON s.id = uss.service_id
      WHERE uss.service_id = $1
      ORDER BY uss.started_at DESC
    `, [serviceId]);
    
    res.json({ subscriptions: result.rows });
    
  } catch (error) {
    console.error('[Admin Services] Get subscriptions error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מנויים' });
  }
}

/**
 * Grant custom trial to user (admin)
 */
async function adminGrantTrial(req, res) {
  try {
    const { serviceId } = req.params;
    const { userId, trialDays, reason } = req.body;
    const adminId = req.user.id;
    
    if (!userId || !trialDays) {
      return res.status(400).json({ error: 'נדרש userId ו-trialDays' });
    }
    
    // Upsert trial grant
    await db.query(`
      INSERT INTO user_service_trials (user_id, service_id, custom_trial_days, reason, granted_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, service_id) 
      DO UPDATE SET custom_trial_days = $3, reason = $4, granted_by = $5, granted_at = NOW()
    `, [userId, serviceId, trialDays, reason || null, adminId]);
    
    res.json({ 
      success: true, 
      message: `הוקצה תקופת ניסיון של ${trialDays} ימים` 
    });
    
  } catch (error) {
    console.error('[Admin Services] Grant trial error:', error);
    res.status(500).json({ error: 'שגיאה בהקצאת תקופת ניסיון' });
  }
}

/**
 * Assign service subscription to user (admin)
 */
async function adminAssignSubscription(req, res) {
  try {
    const { serviceId } = req.params;
    const { userId, status, expiresAt, customPrice, adminNotes } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'נדרש userId' });
    }
    
    // Get service details
    const serviceResult = await db.query(
      'SELECT * FROM additional_services WHERE id = $1',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'שירות לא נמצא' });
    }
    
    // Check if subscription exists
    const existingResult = await db.query(
      'SELECT * FROM user_service_subscriptions WHERE user_id = $1 AND service_id = $2',
      [userId, serviceId]
    );
    
    let subscription;
    if (existingResult.rows.length > 0) {
      // Update existing
      const updateResult = await db.query(`
        UPDATE user_service_subscriptions SET
          status = COALESCE($1, status),
          expires_at = $2,
          custom_price = $3,
          admin_notes = $4,
          is_manual = true,
          updated_at = NOW()
        WHERE user_id = $5 AND service_id = $6
        RETURNING *
      `, [status || 'active', expiresAt || null, customPrice || null, 
          adminNotes || null, userId, serviceId]);
      subscription = updateResult.rows[0];
    } else {
      // Create new
      const insertResult = await db.query(`
        INSERT INTO user_service_subscriptions 
        (user_id, service_id, status, expires_at, custom_price, admin_notes, is_manual)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING *
      `, [userId, serviceId, status || 'active', expiresAt || null, 
          customPrice || null, adminNotes || null]);
      subscription = insertResult.rows[0];
    }
    
    res.json({ success: true, subscription });
    
  } catch (error) {
    console.error('[Admin Services] Assign subscription error:', error);
    res.status(500).json({ error: 'שגיאה בהקצאת מנוי' });
  }
}

/**
 * Cancel user's service subscription (admin)
 */
async function adminCancelSubscription(req, res) {
  try {
    const { serviceId, userId } = req.params;
    
    // Get subscription with Sumit customer ID
    const subResult = await db.query(`
      SELECT uss.*, upm.sumit_customer_id
      FROM user_service_subscriptions uss
      LEFT JOIN user_payment_methods upm ON upm.user_id = uss.user_id AND upm.sumit_customer_id IS NOT NULL
      WHERE uss.user_id = $1 AND uss.service_id = $2
    `, [userId, serviceId]);
    
    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'מנוי לא נמצא' });
    }
    
    const subscription = subResult.rows[0];
    
    // Cancel standing order if exists
    if (subscription.sumit_standing_order_id && subscription.sumit_customer_id) {
      try {
        console.log(`[Admin Services] Cancelling standing order ${subscription.sumit_standing_order_id} for customer ${subscription.sumit_customer_id}`);
        await sumitService.cancelRecurring(
          subscription.sumit_standing_order_id,
          subscription.sumit_customer_id
        );
        console.log(`[Admin Services] ✅ Standing order cancelled in Sumit`);
      } catch (err) {
        console.error('[Admin Services] Sumit cancel error:', err);
      }
    }
    
    await db.query(`
      UPDATE user_service_subscriptions SET
        status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1 AND service_id = $2
    `, [userId, serviceId]);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[Admin Services] Cancel subscription error:', error);
    res.status(500).json({ error: 'שגיאה בביטול מנוי' });
  }
}

/**
 * Initialize tables (run once on server start)
 */
async function initializeTables() {
  try {
    // Create tables if not exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS additional_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        name_he VARCHAR(100) NOT NULL,
        description TEXT,
        description_he TEXT,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        yearly_price DECIMAL(10,2),
        billing_period VARCHAR(20) DEFAULT 'monthly',
        trial_days INTEGER DEFAULT 0,
        allow_custom_trial BOOLEAN DEFAULT true,
        icon VARCHAR(50),
        color VARCHAR(100),
        external_url VARCHAR(255),
        features JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        is_coming_soon BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_service_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'active',
        is_trial BOOLEAN DEFAULT false,
        trial_ends_at TIMESTAMP,
        started_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        next_charge_date TIMESTAMP,
        cancelled_at TIMESTAMP,
        sumit_standing_order_id VARCHAR(100),
        billing_period VARCHAR(20) DEFAULT 'monthly',
        custom_price DECIMAL(10,2),
        admin_notes TEXT,
        is_manual BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service_id)
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS service_payment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES user_service_subscriptions(id) ON DELETE SET NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL,
        payment_type VARCHAR(20) DEFAULT 'recurring',
        sumit_transaction_id VARCHAR(100),
        sumit_document_number VARCHAR(50),
        description TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS service_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
        period_year INTEGER NOT NULL,
        period_month INTEGER NOT NULL,
        usage_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service_id, period_year, period_month)
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_service_trials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
        custom_trial_days INTEGER NOT NULL,
        reason TEXT,
        granted_by UUID REFERENCES users(id),
        granted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service_id)
      )
    `);
    
    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_service_subs_user ON user_service_subscriptions(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_service_subs_status ON user_service_subscriptions(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_additional_services_slug ON additional_services(slug)`);
    
    // Seed Status Bot service
    await db.query(`
      INSERT INTO additional_services (
        slug, name, name_he, description, description_he,
        price, yearly_price, billing_period,
        trial_days, allow_custom_trial,
        icon, color, external_url, features,
        is_active, is_coming_soon, sort_order
      ) VALUES (
        'status-bot',
        'Status Upload Bot',
        'בוט העלאת סטטוסים',
        'Upload WhatsApp statuses easily via web or WhatsApp message',
        'העלה סטטוסים לווצאפ בקלות מממשק אחד, עקוב אחרי צפיות ותגובות, והעלה סטטוסים גם דרך הודעת WhatsApp',
        250,
        2500,
        'monthly',
        0,
        true,
        'sms',
        'from-green-500 to-emerald-600',
        '/status-bot/dashboard',
        '{"unlimited_uploads": true, "view_tracking": true, "reaction_tracking": true, "authorized_numbers": true}',
        true,
        false,
        1
      ) ON CONFLICT (slug) DO NOTHING
    `);
    
    console.log('✅ Additional services tables initialized');
  } catch (error) {
    console.error('[Services] Table initialization error:', error.message);
  }
}

// Initialize tables on module load
initializeTables();

module.exports = {
  // Public
  getServices,
  
  // User
  getMyServices,
  subscribeToService,
  cancelSubscription,
  getServiceUsage,
  checkServiceAccess,
  
  // Admin
  adminGetServices,
  adminCreateService,
  adminUpdateService,
  adminDeleteService,
  adminGetServiceSubscriptions,
  adminGrantTrial,
  adminAssignSubscription,
  adminCancelSubscription,
};
