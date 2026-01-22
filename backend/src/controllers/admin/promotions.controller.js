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
             sp.name as plan_name, 
             sp.name_he as plan_name_he,
             sp.price as plan_price,
             u.name as created_by_name
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN users u ON p.created_by = u.id
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
      SELECT p.id, p.name, p.name_he, p.description_he, 
             p.promo_price, p.promo_months, p.regular_price,
             p.plan_id, p.is_new_users_only, p.coupon_code,
             sp.name as plan_name, sp.name_he as plan_name_he
      FROM promotions p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      WHERE p.is_active = true
        AND (p.start_date IS NULL OR p.start_date <= NOW())
        AND (p.end_date IS NULL OR p.end_date > NOW())
        AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
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
      name_he,
      description,
      description_he,
      plan_id,
      promo_price,
      promo_months,
      regular_price,
      billing_period,
      is_new_users_only,
      start_date,
      end_date,
      coupon_code,
      max_uses
    } = req.body;
    
    if (!name || !promo_price || !promo_months) {
      return res.status(400).json({ error: 'נדרשים שם, מחיר מבצע ומספר חודשים' });
    }
    
    const result = await db.query(`
      INSERT INTO promotions (
        name, name_he, description, description_he,
        plan_id, promo_price, promo_months, regular_price,
        billing_period, is_new_users_only,
        start_date, end_date, coupon_code, max_uses,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      name, name_he || name, description, description_he,
      plan_id || null, promo_price, promo_months, regular_price || null,
      billing_period || 'monthly', is_new_users_only !== false,
      start_date || null, end_date || null, 
      coupon_code?.toUpperCase() || null, max_uses || null,
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
      name_he,
      description,
      description_he,
      plan_id,
      promo_price,
      promo_months,
      regular_price,
      billing_period,
      is_new_users_only,
      is_active,
      start_date,
      end_date,
      coupon_code,
      max_uses
    } = req.body;
    
    const result = await db.query(`
      UPDATE promotions SET
        name = COALESCE($1, name),
        name_he = COALESCE($2, name_he),
        description = COALESCE($3, description),
        description_he = COALESCE($4, description_he),
        plan_id = COALESCE($5, plan_id),
        promo_price = COALESCE($6, promo_price),
        promo_months = COALESCE($7, promo_months),
        regular_price = $8,
        billing_period = COALESCE($9, billing_period),
        is_new_users_only = COALESCE($10, is_new_users_only),
        is_active = COALESCE($11, is_active),
        start_date = $12,
        end_date = $13,
        coupon_code = $14,
        max_uses = $15,
        updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `, [
      name, name_he, description, description_he,
      plan_id, promo_price, promo_months, regular_price,
      billing_period, is_new_users_only, is_active,
      start_date, end_date, coupon_code?.toUpperCase(), max_uses,
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
    
    res.json({
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name_he || promotion.name,
        promo_price: promotion.promo_price,
        promo_months: promotion.promo_months,
        regular_price: promotion.regular_price || promotion.plan_price,
        plan_id: promotion.plan_id,
        description: promotion.description_he
      },
      message: `${promotion.promo_months} חודשים ראשונים ב-₪${promotion.promo_price}/חודש!`
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
        SUM(promo_price_used * promo_months) FILTER (WHERE status IN ('active', 'completed')) as total_promo_revenue
      FROM user_promotions
      WHERE promotion_id = $1
    `, [promotionId]);
    
    const users = await db.query(`
      SELECT up.*, u.name, u.email
      FROM user_promotions up
      JOIN users u ON up.user_id = u.id
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

module.exports = {
  getAllPromotions,
  getActivePromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  validateCoupon,
  getPromotionStats
};
