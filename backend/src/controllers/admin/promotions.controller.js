const db = require('../../config/database');

// =====================================================
// PROMOTIONS (מבצעים אוטומטיים)
// =====================================================

async function getAllPromotions(req, res) {
  try {
    const result = await db.query(`
      SELECT p.*, sp.name_he as plan_name_he, sp.price as plan_price
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      ORDER BY p.priority DESC, p.created_at DESC
    `);
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error('[Promotions] Get all error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מבצעים' });
  }
}

async function getActivePromotions(req, res) {
  try {
    const userId = req.user?.id;
    let isNewUser = true;
    
    if (userId) {
      const userCheck = await db.query('SELECT has_ever_paid FROM users WHERE id = $1', [userId]);
      isNewUser = !userCheck.rows[0]?.has_ever_paid;
    }
    
    const result = await db.query(`
      SELECT p.*, sp.name_he as plan_name_he, sp.price as plan_price
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      WHERE p.is_active = true
        AND (p.start_date IS NULL OR p.start_date <= NOW())
        AND (p.end_date IS NULL OR p.end_date > NOW())
        AND (p.is_new_users_only = false OR $1 = true)
      ORDER BY p.priority DESC
    `, [isNewUser]);
    
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error('[Promotions] Get active error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מבצעים' });
  }
}

async function createPromotion(req, res) {
  try {
    const {
      name, description, badge_text, plan_id,
      discount_type, discount_value, promo_months,
      is_new_users_only, start_date, end_date, priority
    } = req.body;
    
    const result = await db.query(`
      INSERT INTO promotions (
        name, description, badge_text, plan_id,
        discount_type, discount_value, promo_months,
        is_new_users_only, start_date, end_date, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name, description, badge_text, plan_id || null,
      discount_type || 'fixed', discount_value, promo_months || 1,
      is_new_users_only !== false, start_date || null, end_date || null, priority || 0
    ]);
    
    res.json({ promotion: result.rows[0], message: 'מבצע נוצר בהצלחה' });
  } catch (error) {
    console.error('[Promotions] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת מבצע' });
  }
}

async function updatePromotion(req, res) {
  try {
    const { promotionId } = req.params;
    const {
      name, description, badge_text, plan_id,
      discount_type, discount_value, promo_months,
      is_new_users_only, is_active, start_date, end_date, priority
    } = req.body;
    
    const result = await db.query(`
      UPDATE promotions SET
        name = COALESCE($1, name),
        description = $2,
        badge_text = $3,
        plan_id = $4,
        discount_type = COALESCE($5, discount_type),
        discount_value = COALESCE($6, discount_value),
        promo_months = COALESCE($7, promo_months),
        is_new_users_only = COALESCE($8, is_new_users_only),
        is_active = COALESCE($9, is_active),
        start_date = $10,
        end_date = $11,
        priority = COALESCE($12, priority),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      name, description, badge_text, plan_id,
      discount_type, discount_value, promo_months,
      is_new_users_only, is_active, start_date, end_date, priority,
      promotionId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'מבצע לא נמצא' });
    }
    
    res.json({ promotion: result.rows[0], message: 'מבצע עודכן' });
  } catch (error) {
    console.error('[Promotions] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מבצע' });
  }
}

async function deletePromotion(req, res) {
  try {
    const { promotionId } = req.params;
    await db.query('DELETE FROM promotions WHERE id = $1', [promotionId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Promotions] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת מבצע' });
  }
}

// =====================================================
// COUPONS (קודי קופון)
// =====================================================

async function getAllCoupons(req, res) {
  try {
    const result = await db.query(`
      SELECT c.*, sp.name_he as plan_name_he,
             (SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = c.id) as times_used
      FROM coupons c
      LEFT JOIN subscription_plans sp ON c.plan_id = sp.id
      ORDER BY c.created_at DESC
    `);
    res.json({ coupons: result.rows });
  } catch (error) {
    console.error('[Coupons] Get all error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קופונים' });
  }
}

async function createCoupon(req, res) {
  try {
    const {
      code, name, discount_type, discount_value,
      duration_type, duration_months, plan_id,
      max_uses, max_uses_per_user, is_new_users_only,
      start_date, end_date
    } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'נדרש קוד קופון' });
    }
    
    const result = await db.query(`
      INSERT INTO coupons (
        code, name, discount_type, discount_value,
        duration_type, duration_months, plan_id,
        max_uses, max_uses_per_user, is_new_users_only,
        start_date, end_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      code.toUpperCase(), name, discount_type || 'fixed', discount_value,
      duration_type || 'once', duration_months, plan_id || null,
      max_uses, max_uses_per_user || 1, is_new_users_only || false,
      start_date || null, end_date || null, req.user.id
    ]);
    
    res.json({ coupon: result.rows[0], message: 'קופון נוצר בהצלחה' });
  } catch (error) {
    console.error('[Coupons] Create error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'קוד קופון כבר קיים' });
    }
    res.status(500).json({ error: 'שגיאה ביצירת קופון' });
  }
}

async function updateCoupon(req, res) {
  try {
    const { couponId } = req.params;
    const {
      code, name, discount_type, discount_value,
      duration_type, duration_months, plan_id,
      max_uses, max_uses_per_user, is_new_users_only, is_active,
      start_date, end_date
    } = req.body;
    
    const result = await db.query(`
      UPDATE coupons SET
        code = COALESCE($1, code),
        name = $2,
        discount_type = COALESCE($3, discount_type),
        discount_value = COALESCE($4, discount_value),
        duration_type = COALESCE($5, duration_type),
        duration_months = $6,
        plan_id = $7,
        max_uses = $8,
        max_uses_per_user = COALESCE($9, max_uses_per_user),
        is_new_users_only = COALESCE($10, is_new_users_only),
        is_active = COALESCE($11, is_active),
        start_date = $12,
        end_date = $13,
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `, [
      code?.toUpperCase(), name, discount_type, discount_value,
      duration_type, duration_months, plan_id,
      max_uses, max_uses_per_user, is_new_users_only, is_active,
      start_date, end_date, couponId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קופון לא נמצא' });
    }
    
    res.json({ coupon: result.rows[0], message: 'קופון עודכן' });
  } catch (error) {
    console.error('[Coupons] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון קופון' });
  }
}

async function deleteCoupon(req, res) {
  try {
    const { couponId } = req.params;
    await db.query('DELETE FROM coupons WHERE id = $1', [couponId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Coupons] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת קופון' });
  }
}

async function validateCoupon(req, res) {
  try {
    const { code, planId } = req.body;
    const userId = req.user?.id;
    
    if (!code) {
      return res.status(400).json({ error: 'נדרש קוד קופון', valid: false });
    }
    
    const coupon = await db.query(`
      SELECT c.*, sp.name_he as plan_name_he, sp.price as plan_price
      FROM coupons c
      LEFT JOIN subscription_plans sp ON c.plan_id = sp.id
      WHERE UPPER(c.code) = UPPER($1)
        AND c.is_active = true
        AND (c.start_date IS NULL OR c.start_date <= NOW())
        AND (c.end_date IS NULL OR c.end_date > NOW())
        AND (c.max_uses IS NULL OR c.current_uses < c.max_uses)
    `, [code]);
    
    if (coupon.rows.length === 0) {
      return res.status(400).json({ error: 'קוד קופון לא תקף', valid: false });
    }
    
    const c = coupon.rows[0];
    
    // Check plan restriction
    if (c.plan_id && planId && c.plan_id !== planId) {
      return res.status(400).json({ error: `קופון תקף רק לתכנית ${c.plan_name_he}`, valid: false });
    }
    
    // Check user restrictions
    if (userId) {
      // Check if new user only
      if (c.is_new_users_only) {
        const userPaid = await db.query('SELECT has_ever_paid FROM users WHERE id = $1', [userId]);
        if (userPaid.rows[0]?.has_ever_paid) {
          return res.status(400).json({ error: 'קופון למשתמשים חדשים בלבד', valid: false });
        }
      }
      
      // Check max uses per user
      const userUsage = await db.query(
        'SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = $1 AND user_id = $2',
        [c.id, userId]
      );
      if (parseInt(userUsage.rows[0].count) >= c.max_uses_per_user) {
        return res.status(400).json({ error: 'כבר השתמשת בקופון זה', valid: false });
      }
    }
    
    // Calculate discount
    let planPrice = c.plan_price;
    if (planId && !c.plan_id) {
      const plan = await db.query('SELECT price FROM subscription_plans WHERE id = $1', [planId]);
      if (plan.rows.length > 0) planPrice = parseFloat(plan.rows[0].price);
    }
    
    let discountAmount, finalPrice;
    if (c.discount_type === 'percentage') {
      discountAmount = (planPrice * parseFloat(c.discount_value)) / 100;
    } else {
      discountAmount = parseFloat(c.discount_value);
    }
    finalPrice = Math.max(0, planPrice - discountAmount);
    
    // Duration text
    let durationText;
    switch (c.duration_type) {
      case 'forever': durationText = 'לכל החיים'; break;
      case 'months': durationText = `ל-${c.duration_months} חודשים`; break;
      default: durationText = 'לתשלום הראשון';
    }
    
    res.json({
      valid: true,
      coupon: {
        id: c.id,
        code: c.code,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
        duration_type: c.duration_type,
        duration_months: c.duration_months
      },
      calculation: {
        original_price: planPrice,
        discount_amount: Math.round(discountAmount * 100) / 100,
        final_price: Math.round(finalPrice * 100) / 100
      },
      message: `${c.discount_type === 'percentage' ? c.discount_value + '%' : '₪' + c.discount_value} הנחה ${durationText}`
    });
  } catch (error) {
    console.error('[Coupons] Validate error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת קופון' });
  }
}

async function getCouponStats(req, res) {
  try {
    const { couponId } = req.params;
    
    const usage = await db.query(`
      SELECT cu.*, u.name, u.email
      FROM coupon_usage cu
      JOIN users u ON cu.user_id = u.id
      WHERE cu.coupon_id = $1
      ORDER BY cu.created_at DESC
      LIMIT 50
    `, [couponId]);
    
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_uses,
        SUM(discount_applied) as total_discount
      FROM coupon_usage WHERE coupon_id = $1
    `, [couponId]);
    
    res.json({ usage: usage.rows, stats: stats.rows[0] });
  } catch (error) {
    console.error('[Coupons] Stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

// =====================================================
// AFFILIATE PROGRAM (תוכנית שותפים)
// =====================================================

async function getAffiliateSettings(req, res) {
  try {
    const result = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
    res.json({ settings: result.rows[0] || null });
  } catch (error) {
    console.error('[Affiliate] Get settings error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  }
}

async function getAffiliateTerms(req, res) {
  try {
    const result = await db.query('SELECT content FROM affiliate_terms ORDER BY updated_at DESC LIMIT 1');
    res.json({ content: result.rows[0]?.content || '' });
  } catch (error) {
    console.error('[Affiliate] Get terms error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תנאים' });
  }
}

async function updateAffiliateTerms(req, res) {
  try {
    const { content } = req.body;
    const userId = req.user.id;
    
    // Check if terms exist
    const existing = await db.query('SELECT id FROM affiliate_terms LIMIT 1');
    
    if (existing.rows.length > 0) {
      await db.query(`
        UPDATE affiliate_terms SET content = $1, updated_at = NOW(), updated_by = $2
        WHERE id = $3
      `, [content, userId, existing.rows[0].id]);
    } else {
      await db.query(`
        INSERT INTO affiliate_terms (content, updated_by) VALUES ($1, $2)
      `, [content, userId]);
    }
    
    res.json({ success: true, message: 'תנאי התוכנית עודכנו' });
  } catch (error) {
    console.error('[Affiliate] Update terms error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון תנאים' });
  }
}

async function updateAffiliateSettings(req, res) {
  try {
    const {
      commission_amount, commission_type, min_payout_amount,
      conversion_type, cookie_days, is_active,
      referral_discount_percent, referral_discount_type, referral_expiry_minutes
    } = req.body;
    
    // Ensure columns exist
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE affiliate_settings ADD COLUMN IF NOT EXISTS referral_discount_percent INTEGER DEFAULT 10;
        ALTER TABLE affiliate_settings ADD COLUMN IF NOT EXISTS referral_discount_type VARCHAR(50) DEFAULT 'first_payment';
        ALTER TABLE affiliate_settings ADD COLUMN IF NOT EXISTS referral_expiry_minutes INTEGER DEFAULT 60;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    
    const result = await db.query(`
      UPDATE affiliate_settings SET
        commission_amount = COALESCE($1, commission_amount),
        commission_type = COALESCE($2, commission_type),
        min_payout_amount = COALESCE($3, min_payout_amount),
        conversion_type = COALESCE($4, conversion_type),
        cookie_days = COALESCE($5, cookie_days),
        is_active = COALESCE($6, is_active),
        referral_discount_percent = COALESCE($7, referral_discount_percent),
        referral_discount_type = COALESCE($8, referral_discount_type),
        referral_expiry_minutes = COALESCE($9, referral_expiry_minutes),
        updated_at = NOW()
      RETURNING *
    `, [commission_amount, commission_type, min_payout_amount, conversion_type, cookie_days, is_active, referral_discount_percent, referral_discount_type, referral_expiry_minutes]);
    
    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('[Affiliate] Update settings error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרות' });
  }
}

async function getAffiliateStats(req, res) {
  try {
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM affiliates WHERE is_active = true) as total_affiliates,
        (SELECT SUM(total_clicks) FROM affiliates) as total_clicks,
        (SELECT SUM(total_conversions) FROM affiliates) as total_conversions,
        (SELECT SUM(total_earned) FROM affiliates) as total_commissions,
        (SELECT SUM(available_balance) FROM affiliates) as pending_payouts
    `);
    
    const topAffiliates = await db.query(`
      SELECT a.*, u.name, u.email
      FROM affiliates a
      JOIN users u ON a.user_id = u.id
      WHERE a.total_conversions > 0
      ORDER BY a.total_earned DESC
      LIMIT 20
    `);
    
    const pendingPayouts = await db.query(`
      SELECT p.*, u.name, u.email
      FROM affiliate_payouts p
      JOIN affiliates a ON p.affiliate_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at DESC
    `);
    
    res.json({
      stats: stats.rows[0],
      topAffiliates: topAffiliates.rows,
      pendingPayouts: pendingPayouts.rows
    });
  } catch (error) {
    console.error('[Affiliate] Stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

async function processPayoutRequest(req, res) {
  try {
    const { payoutId } = req.params;
    const { action, admin_notes } = req.body; // 'approve', 'reject', 'mark_paid'
    
    let status;
    switch (action) {
      case 'approve': status = 'approved'; break;
      case 'reject': status = 'rejected'; break;
      case 'mark_paid': status = 'paid'; break;
      default: return res.status(400).json({ error: 'פעולה לא תקינה' });
    }
    
    const payout = await db.query('SELECT * FROM affiliate_payouts WHERE id = $1', [payoutId]);
    if (payout.rows.length === 0) {
      return res.status(404).json({ error: 'בקשה לא נמצאה' });
    }
    
    await db.query(`
      UPDATE affiliate_payouts SET
        status = $1,
        admin_notes = $2,
        processed_by = $3,
        processed_at = NOW()
      WHERE id = $4
    `, [status, admin_notes, req.user.id, payoutId]);
    
    // If paid, update affiliate balance
    if (status === 'paid') {
      await db.query(`
        UPDATE affiliates SET
          total_paid_out = total_paid_out + $1,
          available_balance = available_balance - $1,
          updated_at = NOW()
        WHERE id = $2
      `, [payout.rows[0].amount, payout.rows[0].affiliate_id]);
    }
    
    // If rejected, restore balance
    if (status === 'rejected') {
      await db.query(`
        UPDATE affiliates SET
          available_balance = available_balance + $1,
          updated_at = NOW()
        WHERE id = $2
      `, [payout.rows[0].amount, payout.rows[0].affiliate_id]);
    }
    
    res.json({ success: true, message: 'בקשה עודכנה' });
  } catch (error) {
    console.error('[Affiliate] Process payout error:', error);
    res.status(500).json({ error: 'שגיאה בעיבוד בקשה' });
  }
}

// =====================================================
// USER AFFILIATE (API למשתמשים)
// =====================================================

async function getMyAffiliate(req, res) {
  try {
    const userId = req.user.id;
    
    // Get or create affiliate account
    let affiliate = await db.query('SELECT * FROM affiliates WHERE user_id = $1', [userId]);
    
    if (affiliate.rows.length === 0) {
      // Generate unique ref code
      const refCode = generateRefCode();
      
      await db.query(`
        INSERT INTO affiliates (user_id, ref_code)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, refCode]);
      
      affiliate = await db.query('SELECT * FROM affiliates WHERE user_id = $1', [userId]);
    }
    
    // Get settings
    const settings = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
    
    // Get recent referrals
    const referrals = await db.query(`
      SELECT ar.*, u.name, u.email, u.created_at as signup_date
      FROM affiliate_referrals ar
      JOIN users u ON ar.referred_user_id = u.id
      WHERE ar.affiliate_id = $1
      ORDER BY ar.created_at DESC
      LIMIT 20
    `, [affiliate.rows[0].id]);
    
    // Get payout history
    const payouts = await db.query(`
      SELECT * FROM affiliate_payouts
      WHERE affiliate_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [affiliate.rows[0].id]);
    
    res.json({
      affiliate: affiliate.rows[0],
      settings: settings.rows[0],
      referrals: referrals.rows,
      payouts: payouts.rows,
      shareLink: `${process.env.FRONTEND_URL || 'https://flow.botomat.co.il'}?ref=${affiliate.rows[0].ref_code}`
    });
  } catch (error) {
    console.error('[Affiliate] Get my affiliate error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
}

async function requestPayout(req, res) {
  try {
    const userId = req.user.id;
    const { payout_method, payout_details } = req.body;
    
    const affiliate = await db.query('SELECT * FROM affiliates WHERE user_id = $1', [userId]);
    if (affiliate.rows.length === 0) {
      return res.status(400).json({ error: 'לא נמצא חשבון שותפים' });
    }
    
    const aff = affiliate.rows[0];
    const settings = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
    const minPayout = parseFloat(settings.rows[0]?.min_payout_amount || 100);
    
    if (parseFloat(aff.available_balance) < minPayout) {
      return res.status(400).json({ 
        error: `נדרש מינימום ₪${minPayout} למשיכה. יש לך ₪${aff.available_balance}`,
        current: aff.available_balance,
        required: minPayout
      });
    }
    
    // Check for pending request
    const pendingRequest = await db.query(
      `SELECT id FROM affiliate_payouts WHERE affiliate_id = $1 AND status = 'pending'`,
      [aff.id]
    );
    if (pendingRequest.rows.length > 0) {
      return res.status(400).json({ error: 'יש לך כבר בקשת משיכה בהמתנה' });
    }
    
    // Create payout request
    await db.query(`
      INSERT INTO affiliate_payouts (affiliate_id, amount, payout_method, payout_details)
      VALUES ($1, $2, $3, $4)
    `, [aff.id, aff.available_balance, payout_method || 'credit', payout_details || {}]);
    
    // Deduct from available (move to pending)
    await db.query(`
      UPDATE affiliates SET
        available_balance = 0,
        updated_at = NOW()
      WHERE id = $1
    `, [aff.id]);
    
    res.json({ success: true, message: `בקשת משיכה של ₪${aff.available_balance} נשלחה!` });
  } catch (error) {
    console.error('[Affiliate] Request payout error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת בקשה' });
  }
}

// Redeem affiliate credits as discount on next payment
async function redeemCredits(req, res) {
  try {
    const userId = req.user.id;
    
    const affiliate = await db.query('SELECT * FROM affiliates WHERE user_id = $1', [userId]);
    if (affiliate.rows.length === 0) {
      return res.status(400).json({ error: 'לא נמצא חשבון שותפים' });
    }
    
    const aff = affiliate.rows[0];
    const settings = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
    const minRedeem = parseFloat(settings.rows[0]?.min_payout_amount || 100);
    const balance = parseFloat(aff.available_balance);
    
    if (balance < minRedeem) {
      return res.status(400).json({ 
        error: `נדרש מינימום ${minRedeem} נקודות למימוש. יש לך ${balance} נקודות`,
        current: balance,
        required: minRedeem
      });
    }
    
    // Add credit to user account
    await db.query(`
      UPDATE users SET
        affiliate_credit = COALESCE(affiliate_credit, 0) + $1,
        updated_at = NOW()
      WHERE id = $2
    `, [balance, userId]);
    
    // Record redemption
    await db.query(`
      INSERT INTO affiliate_payouts (affiliate_id, amount, payout_method, status, processed_at)
      VALUES ($1, $2, 'credit', 'paid', NOW())
    `, [aff.id, balance]);
    
    // Update affiliate balance
    await db.query(`
      UPDATE affiliates SET
        available_balance = 0,
        total_paid_out = total_paid_out + $1,
        updated_at = NOW()
      WHERE id = $2
    `, [balance, aff.id]);
    
    res.json({ 
      success: true, 
      message: `מעולה! ${balance} נקודות (₪${balance}) נוספו לחשבונך כזיכוי. הסכום יקוזז מהתשלום הבא שלך.`,
      credited: balance
    });
  } catch (error) {
    console.error('[Affiliate] Redeem credits error:', error);
    res.status(500).json({ error: 'שגיאה במימוש נקודות' });
  }
}

// Track click (called from frontend when someone visits with ref code)
async function trackClick(req, res) {
  try {
    const { ref_code, landing_page, referrer_url } = req.body;
    
    if (!ref_code) {
      return res.status(400).json({ error: 'Missing ref code' });
    }
    
    const affiliate = await db.query('SELECT id FROM affiliates WHERE ref_code = $1', [ref_code.toUpperCase()]);
    if (affiliate.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid ref code' });
    }
    
    const affiliateId = affiliate.rows[0].id;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    
    // Create click record
    const click = await db.query(`
      INSERT INTO affiliate_clicks (affiliate_id, ref_code, ip_address, user_agent, referrer_url, landing_page)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [affiliateId, ref_code.toUpperCase(), ip, userAgent, referrer_url, landing_page]);
    
    // Update total clicks
    await db.query('UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE id = $1', [affiliateId]);
    
    // Get discount settings to return to frontend
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE affiliate_settings ADD COLUMN IF NOT EXISTS referral_expiry_minutes INTEGER DEFAULT 60;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    
    const settings = await db.query('SELECT referral_discount_percent, referral_discount_type, referral_expiry_minutes FROM affiliate_settings LIMIT 1');
    const discountPercent = settings.rows[0]?.referral_discount_percent || 10;
    const expiryMinutes = settings.rows[0]?.referral_expiry_minutes || 60;
    
    res.json({ 
      click_id: click.rows[0].id,
      discount_percent: discountPercent,
      expiry_minutes: expiryMinutes
    });
  } catch (error) {
    console.error('[Affiliate] Track click error:', error);
    res.status(500).json({ error: 'Error tracking click' });
  }
}

// Register referral (called when user signs up)
async function registerReferral(userId, refCode, clickId = null) {
  try {
    if (!refCode) return null;
    
    const affiliate = await db.query(
      'SELECT * FROM affiliates WHERE ref_code = $1 AND is_active = true',
      [refCode.toUpperCase()]
    );
    
    if (affiliate.rows.length === 0) return null;
    
    const aff = affiliate.rows[0];
    
    // Don't allow self-referral
    if (aff.user_id === userId) return null;
    
    // Check if already referred
    const existing = await db.query(
      'SELECT id FROM affiliate_referrals WHERE referred_user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0) return null;
    
    // Create referral
    await db.query(`
      INSERT INTO affiliate_referrals (affiliate_id, referred_user_id, click_id, status)
      VALUES ($1, $2, $3, 'pending')
    `, [aff.id, userId, clickId]);
    
    // Update affiliate stats
    await db.query('UPDATE affiliates SET total_signups = total_signups + 1 WHERE id = $1', [aff.id]);
    
    // Update user
    await db.query(
      'UPDATE users SET referred_by_affiliate_id = $1, referral_click_id = $2 WHERE id = $3',
      [aff.id, clickId, userId]
    );
    
    // Update click if provided
    if (clickId) {
      await db.query(
        'UPDATE affiliate_clicks SET converted_user_id = $1, converted_at = NOW() WHERE id = $2',
        [userId, clickId]
      );
    }
    
    console.log(`[Affiliate] Registered referral: user ${userId} by affiliate ${aff.id}`);
    return { affiliateId: aff.id };
  } catch (error) {
    console.error('[Affiliate] Register referral error:', error);
    return null;
  }
}

// Complete conversion (called when user pays)
async function completeConversion(userId) {
  try {
    const settings = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
    if (!settings.rows[0]?.is_active) return null;
    
    const referral = await db.query(
      `SELECT ar.*, a.user_id as affiliate_user_id
       FROM affiliate_referrals ar
       JOIN affiliates a ON ar.affiliate_id = a.id
       WHERE ar.referred_user_id = $1 AND ar.status = 'pending'`,
      [userId]
    );
    
    if (referral.rows.length === 0) return null;
    
    const ref = referral.rows[0];
    const commission = parseFloat(settings.rows[0].commission_amount);
    
    // Update referral
    await db.query(`
      UPDATE affiliate_referrals SET
        status = 'converted',
        commission_amount = $1,
        converted_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `, [commission, ref.id]);
    
    // Update affiliate balance
    await db.query(`
      UPDATE affiliates SET
        total_conversions = total_conversions + 1,
        total_earned = total_earned + $1,
        available_balance = available_balance + $1,
        updated_at = NOW()
      WHERE id = $2
    `, [commission, ref.affiliate_id]);
    
    console.log(`[Affiliate] Conversion completed: ₪${commission} to affiliate ${ref.affiliate_id}`);
    return { commission, affiliateId: ref.affiliate_id };
  } catch (error) {
    console.error('[Affiliate] Complete conversion error:', error);
    return null;
  }
}

function generateRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = {
  // Promotions
  getAllPromotions,
  getActivePromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  // Coupons
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  getCouponStats,
  // Affiliate Admin
  getAffiliateSettings,
  updateAffiliateSettings,
  getAffiliateStats,
  processPayoutRequest,
  getAffiliateTerms,
  updateAffiliateTerms,
  // Affiliate User
  getMyAffiliate,
  requestPayout,
  redeemCredits,
  trackClick,
  registerReferral,
  completeConversion
};
