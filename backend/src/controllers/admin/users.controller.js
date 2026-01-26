const db = require('../../config/database');

/**
 * Get all users with pagination and filters
 */
async function getUsers(req, res) {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      whereClause += ` AND (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (role) {
      whereClause += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    
    if (status === 'active') {
      whereClause += ` AND u.is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` AND u.is_active = false`;
    } else if (status === 'unverified') {
      whereClause += ` AND u.is_verified = false`;
    }
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM users u WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    // Get users with subscription info and referrer
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.plan, u.is_verified, u.is_active, 
              u.language, u.theme, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM bots WHERE user_id = u.id) as bots_count,
              (SELECT COUNT(*) FROM contacts WHERE user_id = u.id) as contacts_count,
              us.status as subscription_status,
              us.is_manual,
              us.expires_at,
              us.started_at,
              us.trial_ends_at,
              us.custom_discount_mode,
              us.referral_discount_percent as custom_discount_percent,
              us.custom_fixed_price,
              us.referral_discount_type as custom_discount_type,
              us.referral_months_remaining as custom_discount_months,
              us.custom_discount_plan_id,
              us.skip_trial,
              sp.name as plan_name,
              sp.name_he as plan_name_he,
              sp.price as plan_price,
              ref_user.name as referred_by_name,
              ref_user.email as referred_by_email,
              ar.status as referral_status,
              aff.id as referred_by_affiliate_id
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       LEFT JOIN affiliate_referrals ar ON ar.referred_user_id = u.id
       LEFT JOIN affiliates aff ON aff.id = ar.affiliate_id
       LEFT JOIN users ref_user ON ref_user.id = aff.user_id
       WHERE ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    
    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Admin] Get users error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתמשים' });
  }
}

/**
 * Get single user details
 */
async function getUser(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT u.*, 
              (SELECT COUNT(*) FROM bots WHERE user_id = u.id) as bots_count,
              (SELECT COUNT(*) FROM contacts WHERE user_id = u.id) as contacts_count,
              (SELECT COUNT(*) FROM messages m 
               JOIN contacts c ON m.contact_id = c.id 
               WHERE c.user_id = u.id) as messages_count,
              wc.status as whatsapp_status, wc.phone_number as whatsapp_phone
       FROM users u
       LEFT JOIN whatsapp_connections wc ON wc.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    const { password_hash, ...user } = result.rows[0];
    res.json({ user });
  } catch (error) {
    console.error('[Admin] Get user error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתמש' });
  }
}

/**
 * Update user
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, role, plan, is_active, is_verified } = req.body;
    
    // Prevent changing own role if not superadmin
    if (req.user.id === id && role && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'לא ניתן לשנות את התפקיד שלך' });
    }
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (plan !== undefined) {
      updates.push(`plan = $${paramIndex++}`);
      values.push(plan);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (is_verified !== undefined) {
      updates.push(`is_verified = $${paramIndex++}`);
      values.push(is_verified);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }
    
    values.push(id);
    
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramIndex} 
       RETURNING id, email, name, role, is_active, is_verified`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Update user error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון משתמש' });
  }
}

/**
 * Delete user
 */
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    
    // Prevent deleting yourself
    if (req.user.id === id) {
      return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
    }
    
    // Check if user exists
    const check = await db.query('SELECT role FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Prevent deleting superadmin
    if (check.rows[0].role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'לא ניתן למחוק סופר-אדמין' });
    }
    
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Delete user error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת משתמש' });
  }
}

/**
 * Get dashboard statistics
 */
async function getStats(req, res) {
  try {
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_week,
        (SELECT COUNT(*) FROM bots) as total_bots,
        (SELECT COUNT(*) FROM bots WHERE is_active = true) as active_bots,
        (SELECT COUNT(*) FROM contacts) as total_contacts,
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours') as messages_today,
        (SELECT COUNT(*) FROM whatsapp_connections WHERE status = 'connected') as connected_whatsapp
    `);
    
    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('[Admin] Get stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Update user subscription (admin)
 */
async function updateUserSubscription(req, res) {
  try {
    const { id } = req.params;
    const { 
      planId, status, expiresAt, isManual, adminNotes,
      // Discount settings
      customDiscountMode, customDiscountPercent, customFixedPrice, customDiscountType, customDiscountMonths, customDiscountPlanId, skipTrial,
      // Referral settings
      affiliateId
    } = req.body;
    
    // Verify user exists
    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Check if user has subscription
    const subCheck = await db.query(
      'SELECT id FROM user_subscriptions WHERE user_id = $1',
      [id]
    );
    
    if (subCheck.rows.length === 0) {
      // Create new subscription
      const result = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, expires_at, is_manual, admin_notes,
          custom_discount_mode, referral_discount_percent, custom_fixed_price, 
          referral_discount_type, referral_months_remaining, custom_discount_plan_id, skip_trial
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        id, planId, status || 'active', expiresAt || null, isManual !== false, adminNotes || null,
        customDiscountMode || null,
        customDiscountMode === 'percent' ? customDiscountPercent : null,
        customDiscountMode === 'fixed_price' ? customFixedPrice : null,
        customDiscountType || null,
        customDiscountType === 'custom_months' ? customDiscountMonths : 
          customDiscountType === 'first_year' ? 12 :
          customDiscountType === 'forever' ? -1 : 0,
        customDiscountPlanId || null,
        skipTrial || false
      ]);
      
      // Handle affiliate assignment
      if (affiliateId) {
        await assignUserToAffiliate(id, affiliateId);
      }
      
      return res.json({ subscription: result.rows[0] });
    }
    
    // Update existing subscription
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (planId !== undefined) {
      updates.push(`plan_id = $${paramIndex++}`);
      values.push(planId);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(expiresAt);
      updates.push(`next_charge_date = $${paramIndex++}`);
      values.push(expiresAt);
    }
    if (isManual !== undefined) {
      updates.push(`is_manual = $${paramIndex++}`);
      values.push(isManual);
    }
    if (adminNotes !== undefined) {
      updates.push(`admin_notes = $${paramIndex++}`);
      values.push(adminNotes);
    }
    
    // Discount settings
    if (customDiscountMode !== undefined) {
      updates.push(`custom_discount_mode = $${paramIndex++}`);
      values.push(customDiscountMode);
      
      // Set the appropriate value based on mode
      if (customDiscountMode === 'percent') {
        updates.push(`referral_discount_percent = $${paramIndex++}`);
        values.push(customDiscountPercent || 0);
        updates.push(`custom_fixed_price = $${paramIndex++}`);
        values.push(null);
      } else if (customDiscountMode === 'fixed_price') {
        updates.push(`custom_fixed_price = $${paramIndex++}`);
        values.push(customFixedPrice || 0);
        updates.push(`referral_discount_percent = $${paramIndex++}`);
        values.push(null);
      } else {
        // Clear both if mode is null
        updates.push(`referral_discount_percent = $${paramIndex++}`);
        values.push(null);
        updates.push(`custom_fixed_price = $${paramIndex++}`);
        values.push(null);
      }
    }
    if (customDiscountType !== undefined) {
      updates.push(`referral_discount_type = $${paramIndex++}`);
      values.push(customDiscountType);
      
      // Calculate months remaining
      let monthsRemaining = 0;
      if (customDiscountType === 'custom_months') {
        monthsRemaining = customDiscountMonths || 1;
      } else if (customDiscountType === 'first_year') {
        monthsRemaining = 12;
      } else if (customDiscountType === 'forever') {
        monthsRemaining = -1; // -1 means forever
      }
      updates.push(`referral_months_remaining = $${paramIndex++}`);
      values.push(monthsRemaining);
    }
    if (customDiscountPlanId !== undefined) {
      updates.push(`custom_discount_plan_id = $${paramIndex++}`);
      values.push(customDiscountPlanId || null);
    }
    if (skipTrial !== undefined) {
      updates.push(`skip_trial = $${paramIndex++}`);
      values.push(skipTrial || false);
    }
    
    if (updates.length === 0 && !affiliateId) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }
    
    let result;
    if (updates.length > 0) {
      values.push(id);
      result = await db.query(`
        UPDATE user_subscriptions 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE user_id = $${paramIndex}
        RETURNING *
      `, values);
    } else {
      result = await db.query('SELECT * FROM user_subscriptions WHERE user_id = $1', [id]);
    }
    
    // Handle affiliate assignment
    if (affiliateId) {
      await assignUserToAffiliate(id, affiliateId);
    }
    
    res.json({ subscription: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Update user subscription error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מנוי' });
  }
}

/**
 * Helper to assign a user to an affiliate
 */
async function assignUserToAffiliate(userId, affiliateId) {
  try {
    // Check if referral already exists
    const existingRef = await db.query(
      'SELECT id FROM affiliate_referrals WHERE referred_user_id = $1',
      [userId]
    );
    
    if (existingRef.rows.length > 0) {
      // Update existing referral
      await db.query(`
        UPDATE affiliate_referrals 
        SET affiliate_id = $1, updated_at = NOW()
        WHERE referred_user_id = $2
      `, [affiliateId, userId]);
    } else {
      // Create new referral
      await db.query(`
        INSERT INTO affiliate_referrals (affiliate_id, referred_user_id, status)
        VALUES ($1, $2, 'registered')
      `, [affiliateId, userId]);
      
      // Increment affiliate signup count
      await db.query(`
        UPDATE affiliates SET total_signups = total_signups + 1 WHERE id = $1
      `, [affiliateId]);
    }
  } catch (error) {
    console.error('[Admin] Assign user to affiliate error:', error);
  }
}

/**
 * Get all subscription plans
 */
async function getPlans(req, res) {
  try {
    const result = await db.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price ASC'
    );
    res.json({ plans: result.rows });
  } catch (error) {
    console.error('[Admin] Get plans error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תוכניות' });
  }
}

module.exports = { getUsers, getUser, updateUser, deleteUser, getStats, updateUserSubscription, getPlans };
