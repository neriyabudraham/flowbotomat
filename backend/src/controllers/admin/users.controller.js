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
    
    // Get users with subscription info
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.plan, u.is_verified, u.is_active, 
              u.language, u.theme, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM bots WHERE user_id = u.id) as bots_count,
              (SELECT COUNT(*) FROM contacts WHERE user_id = u.id) as contacts_count,
              us.status as subscription_status,
              us.billing_period,
              us.is_trial,
              us.trial_ends_at,
              us.next_charge_date,
              sp.name as plan_name,
              sp.name_he as plan_name_he,
              sp.price as plan_price
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
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
    const { planId, status, expiresAt, isManual, adminNotes } = req.body;
    
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
          user_id, plan_id, status, expires_at, is_manual, admin_notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [id, planId, status || 'active', expiresAt || null, isManual !== false, adminNotes || null]);
      
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
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }
    
    values.push(id);
    
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE user_id = $${paramIndex}
      RETURNING *
    `, values);
    
    res.json({ subscription: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Update user subscription error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מנוי' });
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
