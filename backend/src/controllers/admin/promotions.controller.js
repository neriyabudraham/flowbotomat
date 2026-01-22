const db = require('../../config/database');

/**
 * Get all promotions (admin)
 */
async function getAllPromotions(req, res) {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const result = await db.query(`
      SELECT p.*, 
             sp.name_he as plan_name_he,
             sp.price as plan_price,
             u.name as created_by_name,
             owner.name as coupon_owner_name,
             owner.email as coupon_owner_email
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users owner ON p.coupon_owner_id = owner.id
      ORDER BY p.created_at DESC
    `);
    
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error('[Promotions] Get all error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מבצעים' });
  }
}

/**
 * Get active promotions (public - for pricing page)
 */
async function getActivePromotions(req, res) {
  try {
    const result = await db.query(`
      SELECT p.id, p.name, p.description, 
             p.discount_type, p.discount_value, p.promo_months,
             p.price_after_promo, p.price_after_discount_type, p.price_after_discount_value,
             p.plan_id, p.is_new_users_only, p.coupon_code,
             sp.name_he as plan_name_he, sp.price as plan_price
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      WHERE p.is_active = true
        AND (p.start_date IS NULL OR p.start_date <= NOW())
        AND (p.end_date IS NULL OR p.end_date > NOW())
        AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
        AND p.coupon_owner_id IS NULL  -- Don't show personal coupons publicly
    `);
    
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error('[Promotions] Get active error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מבצעים' });
  }
}

/**
 * Create a promotion (admin)
 */
async function createPromotion(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const {
      name,
      description,
      plan_id,
      discount_type,
      discount_value,
      promo_months,
      price_after_promo,
      price_after_discount_type,
      price_after_discount_value,
      is_new_users_only,
      start_date,
      end_date,
      coupon_code,
      max_uses,
      coupon_owner_id
    } = req.body;
    
    if (!name || discount_value === undefined || !promo_months) {
      return res.status(400).json({ error: 'נדרשים שם, ערך הנחה ומספר חודשים' });
    }
    
    const result = await db.query(`
      INSERT INTO promotions (
        name, description,
        plan_id, discount_type, discount_value, promo_months,
        price_after_promo, price_after_discount_type, price_after_discount_value,
        is_new_users_only,
        start_date, end_date, coupon_code, max_uses, coupon_owner_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      name, description || null,
      plan_id || null, discount_type || 'fixed', discount_value, promo_months,
      price_after_promo || null, price_after_discount_type || null, price_after_discount_value || null,
      is_new_users_only !== false,
      start_date || null, end_date || null, 
      coupon_code?.toUpperCase() || null, max_uses || null, coupon_owner_id || null,
      req.user.id
    ]);
    
    console.log(`[Promotions] Created: ${result.rows[0].id} by ${req.user.id}`);
    
    res.json({ promotion: result.rows[0], message: 'מבצע נוצר בהצלחה' });
  } catch (error) {
    console.error('[Promotions] Create error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'קוד קופון כבר קיים' });
    }
    res.status(500).json({ error: 'שגיאה ביצירת מבצע' });
  }
}

/**
 * Update a promotion (admin)
 */
async function updatePromotion(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { promotionId } = req.params;
    const {
      name,
      description,
      plan_id,
      discount_type,
      discount_value,
      promo_months,
      price_after_promo,
      price_after_discount_type,
      price_after_discount_value,
      is_new_users_only,
      is_active,
      start_date,
      end_date,
      coupon_code,
      max_uses,
      coupon_owner_id
    } = req.body;
    
    const result = await db.query(`
      UPDATE promotions SET
        name = COALESCE($1, name),
        description = $2,
        plan_id = $3,
        discount_type = COALESCE($4, discount_type),
        discount_value = COALESCE($5, discount_value),
        promo_months = COALESCE($6, promo_months),
        price_after_promo = $7,
        price_after_discount_type = $8,
        price_after_discount_value = $9,
        is_new_users_only = COALESCE($10, is_new_users_only),
        is_active = COALESCE($11, is_active),
        start_date = $12,
        end_date = $13,
        coupon_code = $14,
        max_uses = $15,
        coupon_owner_id = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *
    `, [
      name, description, plan_id, discount_type, discount_value, promo_months,
      price_after_promo, price_after_discount_type, price_after_discount_value,
      is_new_users_only, is_active, start_date, end_date, 
      coupon_code?.toUpperCase(), max_uses, coupon_owner_id,
      promotionId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'מבצע לא נמצא' });
    }
    
    res.json({ promotion: result.rows[0], message: 'מבצע עודכן בהצלחה' });
  } catch (error) {
    console.error('[Promotions] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מבצע' });
  }
}

/**
 * Delete a promotion (admin)
 */
async function deletePromotion(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { promotionId } = req.params;
    
    // Check if promotion is in use
    const inUse = await db.query(
      'SELECT COUNT(*) as count FROM user_promotions WHERE promotion_id = $1 AND status = $2',
      [promotionId, 'active']
    );
    
    if (parseInt(inUse.rows[0]?.count || 0) > 0) {
      return res.status(400).json({ 
        error: 'לא ניתן למחוק מבצע שנמצא בשימוש. ניתן לבטל אותו במקום.',
        activeUsers: parseInt(inUse.rows[0].count)
      });
    }
    
    await db.query('DELETE FROM promotions WHERE id = $1', [promotionId]);
    
    res.json({ success: true, message: 'מבצע נמחק בהצלחה' });
  } catch (error) {
    console.error('[Promotions] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת מבצע' });
  }
}

/**
 * Validate a coupon code
 * Returns promo details and calculates actual discount
 */
async function validateCoupon(req, res) {
  try {
    const { code, planId } = req.body;
    const userId = req.user?.id;
    
    if (!code) {
      return res.status(400).json({ error: 'נדרש קוד קופון' });
    }
    
    const promo = await db.query(`
      SELECT p.*, sp.name_he as plan_name_he, sp.price as plan_price
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      WHERE UPPER(p.coupon_code) = UPPER($1)
        AND p.is_active = true
        AND (p.start_date IS NULL OR p.start_date <= NOW())
        AND (p.end_date IS NULL OR p.end_date > NOW())
        AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
    `, [code]);
    
    if (promo.rows.length === 0) {
      return res.status(400).json({ 
        error: 'קוד קופון לא תקף או פג תוקפו',
        valid: false
      });
    }
    
    const promotion = promo.rows[0];
    
    // Check if plan matches (if promotion is plan-specific)
    if (promotion.plan_id && planId && promotion.plan_id !== planId) {
      return res.status(400).json({ 
        error: `קופון זה תקף רק לתכנית ${promotion.plan_name_he}`,
        valid: false
      });
    }
    
    // Check if user is new (if required)
    if (promotion.is_new_users_only && userId) {
      const userPaid = await db.query(
        'SELECT has_ever_paid FROM users WHERE id = $1',
        [userId]
      );
      
      if (userPaid.rows[0]?.has_ever_paid) {
        return res.status(400).json({ 
          error: 'קופון זה מיועד למשתמשים חדשים בלבד',
          valid: false
        });
      }
      
      // Also check if user already used this promotion
      const alreadyUsed = await db.query(
        'SELECT id FROM user_promotions WHERE user_id = $1 AND promotion_id = $2',
        [userId, promotion.id]
      );
      
      if (alreadyUsed.rows.length > 0) {
        return res.status(400).json({ 
          error: 'כבר השתמשת בקופון זה',
          valid: false
        });
      }
    }
    
    // Get plan price for calculations if planId provided
    let originalPrice = promotion.plan_price;
    if (planId && !promotion.plan_id) {
      const planResult = await db.query(
        'SELECT price FROM subscription_plans WHERE id = $1',
        [planId]
      );
      if (planResult.rows.length > 0) {
        originalPrice = parseFloat(planResult.rows[0].price);
      }
    }
    
    // Calculate actual discount
    const discountType = promotion.discount_type;
    const discountValue = parseFloat(promotion.discount_value);
    let finalPrice;
    let discountAmount;
    
    if (discountType === 'percentage') {
      discountAmount = (originalPrice * discountValue) / 100;
      finalPrice = originalPrice - discountAmount;
    } else {
      discountAmount = discountValue;
      finalPrice = Math.max(0, originalPrice - discountValue);
    }
    
    // Get coupon owner info for attribution
    let couponOwner = null;
    if (promotion.coupon_owner_id) {
      const ownerResult = await db.query(
        'SELECT id, name FROM users WHERE id = $1',
        [promotion.coupon_owner_id]
      );
      if (ownerResult.rows.length > 0) {
        couponOwner = ownerResult.rows[0];
      }
    }
    
    res.json({
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        description: promotion.description,
        discount_type: promotion.discount_type,
        discount_value: promotion.discount_value,
        promo_months: promotion.promo_months,
        plan_id: promotion.plan_id,
        coupon_owner_id: promotion.coupon_owner_id
      },
      calculation: {
        original_price: originalPrice,
        discount_amount: Math.round(discountAmount * 100) / 100,
        final_price: Math.round(finalPrice * 100) / 100,
        promo_months: promotion.promo_months
      },
      referred_by: couponOwner,
      message: discountType === 'percentage'
        ? `${promotion.promo_months} חודשים ראשונים ב-${discountValue}% הנחה!`
        : `${promotion.promo_months} חודשים ראשונים עם ₪${discountValue} הנחה!`
    });
  } catch (error) {
    console.error('[Promotions] Validate coupon error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת קופון' });
  }
}

/**
 * Get promotion usage stats (admin)
 */
async function getPromotionStats(req, res) {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { promotionId } = req.params;
    
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_uses,
        COUNT(*) FILTER (WHERE status = 'active') as active_uses,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_uses,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_uses,
        SUM(discount_applied) as total_discount_given
      FROM user_promotions
      WHERE promotion_id = $1
    `, [promotionId]);
    
    const users = await db.query(`
      SELECT up.*, u.name, u.email, ref.name as referred_by_name
      FROM user_promotions up
      JOIN users u ON up.user_id = u.id
      LEFT JOIN users ref ON up.referred_by_user_id = ref.id
      WHERE up.promotion_id = $1
      ORDER BY up.created_at DESC
      LIMIT 50
    `, [promotionId]);
    
    res.json({
      stats: stats.rows[0],
      recentUsers: users.rows
    });
  } catch (error) {
    console.error('[Promotions] Get stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

// =====================================================
// REFERRAL SYSTEM
// =====================================================

/**
 * Get referral settings (admin)
 */
async function getReferralSettings(req, res) {
  try {
    const result = await db.query('SELECT * FROM referral_settings LIMIT 1');
    res.json({ settings: result.rows[0] || null });
  } catch (error) {
    console.error('[Referral] Get settings error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  }
}

/**
 * Update referral settings (admin)
 */
async function updateReferralSettings(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const {
      credit_per_referral,
      referral_trigger,
      min_credit_to_redeem,
      redeem_type,
      redeem_value,
      is_active
    } = req.body;
    
    const result = await db.query(`
      UPDATE referral_settings SET
        credit_per_referral = COALESCE($1, credit_per_referral),
        referral_trigger = COALESCE($2, referral_trigger),
        min_credit_to_redeem = COALESCE($3, min_credit_to_redeem),
        redeem_type = COALESCE($4, redeem_type),
        redeem_value = COALESCE($5, redeem_value),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      RETURNING *
    `, [credit_per_referral, referral_trigger, min_credit_to_redeem, redeem_type, redeem_value, is_active]);
    
    res.json({ settings: result.rows[0], message: 'הגדרות עודכנו בהצלחה' });
  } catch (error) {
    console.error('[Referral] Update settings error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרות' });
  }
}

/**
 * Get user's referral data
 */
async function getUserReferral(req, res) {
  try {
    const userId = req.user.id;
    
    // Get or create referral record
    let referral = await db.query(
      'SELECT * FROM user_referrals WHERE user_id = $1',
      [userId]
    );
    
    if (referral.rows.length === 0) {
      // Generate unique referral code
      const code = generateReferralCode(userId);
      
      await db.query(`
        INSERT INTO user_referrals (user_id, referral_code)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, code]);
      
      referral = await db.query(
        'SELECT * FROM user_referrals WHERE user_id = $1',
        [userId]
      );
    }
    
    // Get referral settings
    const settings = await db.query('SELECT * FROM referral_settings LIMIT 1');
    
    // Get recent referrals
    const history = await db.query(`
      SELECT rh.*, u.name, u.email
      FROM referral_history rh
      JOIN users u ON rh.referred_user_id = u.id
      WHERE rh.referrer_id = $1
      ORDER BY rh.created_at DESC
      LIMIT 20
    `, [userId]);
    
    res.json({
      referral: referral.rows[0],
      settings: settings.rows[0],
      history: history.rows
    });
  } catch (error) {
    console.error('[Referral] Get user referral error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני הפניה' });
  }
}

/**
 * Register a referral (when user signs up with referral code)
 */
async function registerReferral(userId, referralCode) {
  try {
    if (!referralCode) return null;
    
    // Find referrer
    const referrer = await db.query(
      'SELECT ur.*, u.id as user_id FROM user_referrals ur JOIN users u ON ur.user_id = u.id WHERE ur.referral_code = $1',
      [referralCode.toUpperCase()]
    );
    
    if (referrer.rows.length === 0) {
      console.log(`[Referral] Code ${referralCode} not found`);
      return null;
    }
    
    const referrerId = referrer.rows[0].user_id;
    
    // Don't allow self-referral
    if (referrerId === userId) {
      console.log(`[Referral] Self-referral attempt blocked`);
      return null;
    }
    
    // Create referral history record
    await db.query(`
      INSERT INTO referral_history (referrer_id, referred_user_id, referral_code, status)
      VALUES ($1, $2, $3, 'pending')
      ON CONFLICT (referrer_id, referred_user_id) DO NOTHING
    `, [referrerId, userId, referralCode.toUpperCase()]);
    
    // Update user with referral info
    await db.query(`
      UPDATE users SET referred_by_user_id = $1, referred_by_code = $2 WHERE id = $3
    `, [referrerId, referralCode.toUpperCase(), userId]);
    
    // Increment total referrals
    await db.query(`
      UPDATE user_referrals SET total_referrals = total_referrals + 1 WHERE user_id = $1
    `, [referrerId]);
    
    console.log(`[Referral] User ${userId} referred by ${referrerId} with code ${referralCode}`);
    
    return { referrerId, referralCode };
  } catch (error) {
    console.error('[Referral] Register error:', error);
    return null;
  }
}

/**
 * Complete a referral (credit the referrer)
 * Called when trigger condition is met (email verified or subscription)
 */
async function completeReferral(userId, triggerType) {
  try {
    // Get referral settings
    const settings = await db.query('SELECT * FROM referral_settings LIMIT 1');
    if (!settings.rows[0]?.is_active) {
      console.log('[Referral] Program is disabled');
      return null;
    }
    
    const { credit_per_referral, referral_trigger } = settings.rows[0];
    
    // Check if trigger matches
    if (referral_trigger !== triggerType) {
      console.log(`[Referral] Trigger mismatch: expected ${referral_trigger}, got ${triggerType}`);
      return null;
    }
    
    // Find pending referral for this user
    const referral = await db.query(`
      SELECT * FROM referral_history 
      WHERE referred_user_id = $1 AND status = 'pending'
    `, [userId]);
    
    if (referral.rows.length === 0) {
      console.log(`[Referral] No pending referral for user ${userId}`);
      return null;
    }
    
    const ref = referral.rows[0];
    
    // Credit the referrer
    await db.query(`
      UPDATE user_referrals SET 
        credit_balance = credit_balance + $1,
        total_earned = total_earned + $1,
        successful_referrals = successful_referrals + 1,
        updated_at = NOW()
      WHERE user_id = $2
    `, [credit_per_referral, ref.referrer_id]);
    
    // Update referral history
    await db.query(`
      UPDATE referral_history SET 
        status = 'credited',
        credit_amount = $1,
        credited_at = NOW(),
        trigger_type = $2,
        trigger_date = NOW(),
        updated_at = NOW()
      WHERE id = $3
    `, [credit_per_referral, triggerType, ref.id]);
    
    console.log(`[Referral] Credited ${credit_per_referral} ILS to user ${ref.referrer_id} for referral of ${userId}`);
    
    return { referrerId: ref.referrer_id, credit: credit_per_referral };
  } catch (error) {
    console.error('[Referral] Complete error:', error);
    return null;
  }
}

/**
 * Redeem referral credits
 */
async function redeemCredits(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user's referral data
    const referral = await db.query(
      'SELECT * FROM user_referrals WHERE user_id = $1',
      [userId]
    );
    
    if (referral.rows.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו נתוני הפניה' });
    }
    
    const userReferral = referral.rows[0];
    
    // Get settings
    const settings = await db.query('SELECT * FROM referral_settings LIMIT 1');
    const { min_credit_to_redeem, redeem_type, redeem_value } = settings.rows[0];
    
    // Check minimum
    if (parseFloat(userReferral.credit_balance) < parseFloat(min_credit_to_redeem)) {
      return res.status(400).json({ 
        error: `נדרש מינימום ₪${min_credit_to_redeem} כדי לממש. יש לך ₪${userReferral.credit_balance}`,
        current: userReferral.credit_balance,
        required: min_credit_to_redeem
      });
    }
    
    // Get user's subscription
    const subscription = await db.query(
      `SELECT * FROM user_subscriptions WHERE user_id = $1 AND status IN ('active', 'trial')`,
      [userId]
    );
    
    if (subscription.rows.length === 0) {
      return res.status(400).json({ error: 'נדרש מנוי פעיל כדי לממש זיכויים' });
    }
    
    const sub = subscription.rows[0];
    
    // Redeem based on type
    if (redeem_type === 'month_free') {
      // Extend subscription by X months
      const monthsToAdd = parseInt(redeem_value) || 1;
      const currentExpiry = sub.expires_at || sub.next_charge_date || new Date();
      const newExpiry = new Date(currentExpiry);
      newExpiry.setMonth(newExpiry.getMonth() + monthsToAdd);
      
      await db.query(`
        UPDATE user_subscriptions SET 
          referral_month_free_until = $1,
          expires_at = $1,
          next_charge_date = $1,
          updated_at = NOW()
        WHERE user_id = $2
      `, [newExpiry, userId]);
      
      // Log redemption
      await db.query(`
        INSERT INTO referral_redemptions (user_id, redeem_type, credit_used, subscription_id, description)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, 'month_free', min_credit_to_redeem, sub.id, `${monthsToAdd} חודשים חינם`]);
      
      // Deduct credits
      await db.query(`
        UPDATE user_referrals SET 
          credit_balance = credit_balance - $1,
          total_redeemed = total_redeemed + $1,
          updated_at = NOW()
        WHERE user_id = $2
      `, [min_credit_to_redeem, userId]);
      
      res.json({ 
        success: true, 
        message: `קיבלת ${monthsToAdd} חודשים חינם! המנוי שלך הוארך עד ${newExpiry.toLocaleDateString('he-IL')}`,
        new_expiry: newExpiry
      });
    } else {
      // Discount on next payment - would need to integrate with payment system
      return res.status(400).json({ error: 'סוג מימוש לא נתמך כרגע' });
    }
  } catch (error) {
    console.error('[Referral] Redeem error:', error);
    res.status(500).json({ error: 'שגיאה במימוש זיכויים' });
  }
}

/**
 * Generate unique referral code
 */
function generateReferralCode(userId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Add short user identifier to ensure uniqueness
  const userSuffix = userId.slice(-4).toUpperCase();
  return code + userSuffix.replace(/-/g, '');
}

/**
 * Admin: Get all referral stats
 */
async function getAllReferralStats(req, res) {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const stats = await db.query(`
      SELECT 
        COUNT(DISTINCT referrer_id) as total_referrers,
        COUNT(*) as total_referrals,
        COUNT(*) FILTER (WHERE status = 'credited') as credited_referrals,
        SUM(credit_amount) FILTER (WHERE status = 'credited') as total_credits_given
      FROM referral_history
    `);
    
    const topReferrers = await db.query(`
      SELECT ur.*, u.name, u.email
      FROM user_referrals ur
      JOIN users u ON ur.user_id = u.id
      WHERE ur.successful_referrals > 0
      ORDER BY ur.successful_referrals DESC
      LIMIT 20
    `);
    
    res.json({
      stats: stats.rows[0],
      topReferrers: topReferrers.rows
    });
  } catch (error) {
    console.error('[Referral] Get all stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

module.exports = {
  // Promotions
  getAllPromotions,
  getActivePromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  validateCoupon,
  getPromotionStats,
  // Referral
  getReferralSettings,
  updateReferralSettings,
  getUserReferral,
  registerReferral,
  completeReferral,
  redeemCredits,
  getAllReferralStats
};
