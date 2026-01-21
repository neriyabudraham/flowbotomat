const db = require('../../config/database');

/**
 * Get all subscription plans (public)
 */
async function getPlans(req, res) {
  try {
    const result = await db.query(`
      SELECT * FROM subscription_plans 
      WHERE is_active = true 
      ORDER BY sort_order
    `);
    
    res.json({ plans: result.rows });
  } catch (error) {
    console.error('[Subscriptions] Get plans error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תכניות' });
  }
}

/**
 * Get single plan by ID
 */
async function getPlan(req, res) {
  try {
    const { planId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [planId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תכנית לא נמצאה' });
    }
    
    res.json({ plan: result.rows[0] });
  } catch (error) {
    console.error('[Subscriptions] Get plan error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תכנית' });
  }
}

/**
 * Create a new plan (admin only)
 */
async function createPlan(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const {
      name, name_he, description, description_he,
      price, currency, billing_period,
      max_bots, max_bot_runs_per_month, max_contacts,
      allow_statistics, allow_waha_creation, allow_export,
      allow_api_access, priority_support, sort_order
    } = req.body;
    
    const result = await db.query(`
      INSERT INTO subscription_plans (
        name, name_he, description, description_he,
        price, currency, billing_period,
        max_bots, max_bot_runs_per_month, max_contacts,
        allow_statistics, allow_waha_creation, allow_export,
        allow_api_access, priority_support, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      name, name_he, description, description_he,
      price || 0, currency || 'ILS', billing_period || 'monthly',
      max_bots || 1, max_bot_runs_per_month || 500, max_contacts || 100,
      allow_statistics || false, allow_waha_creation || false, allow_export || false,
      allow_api_access || false, priority_support || false, sort_order || 0
    ]);
    
    res.json({ plan: result.rows[0] });
  } catch (error) {
    console.error('[Subscriptions] Create plan error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת תכנית' });
  }
}

/**
 * Update a plan (admin only)
 */
async function updatePlan(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { planId } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    const allowedFields = [
      'name', 'name_he', 'description', 'description_he',
      'price', 'currency', 'billing_period',
      'max_bots', 'max_bot_runs_per_month', 'max_contacts',
      'allow_statistics', 'allow_waha_creation', 'allow_export',
      'allow_api_access', 'priority_support', 'is_active', 'sort_order'
    ];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(planId);
    
    const result = await db.query(`
      UPDATE subscription_plans 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תכנית לא נמצאה' });
    }
    
    res.json({ plan: result.rows[0] });
  } catch (error) {
    console.error('[Subscriptions] Update plan error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון תכנית' });
  }
}

/**
 * Delete a plan (admin only)
 */
async function deletePlan(req, res) {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { planId } = req.params;
    
    // Check if plan has active subscriptions
    const subsResult = await db.query(
      `SELECT COUNT(*) as count FROM user_subscriptions WHERE plan_id = $1 AND status = 'active'`,
      [planId]
    );
    
    if (parseInt(subsResult.rows[0]?.count) > 0) {
      return res.status(400).json({ error: 'לא ניתן למחוק תכנית עם מנויים פעילים' });
    }
    
    await db.query('DELETE FROM subscription_plans WHERE id = $1', [planId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Subscriptions] Delete plan error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת תכנית' });
  }
}

module.exports = { getPlans, getPlan, createPlan, updatePlan, deletePlan };
