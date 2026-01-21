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
      whereClause += ` AND (email ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    
    if (status === 'active') {
      whereClause += ` AND is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` AND is_active = false`;
    } else if (status === 'unverified') {
      whereClause += ` AND is_verified = false`;
    }
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM users WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    // Get users
    const result = await db.query(
      `SELECT id, email, name, role, plan, is_verified, is_active, 
              language, theme, created_at, last_login_at,
              (SELECT COUNT(*) FROM bots WHERE user_id = users.id) as bots_count,
              (SELECT COUNT(*) FROM contacts WHERE user_id = users.id) as contacts_count
       FROM users 
       WHERE ${whereClause}
       ORDER BY created_at DESC
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

module.exports = { getUsers, getUser, updateUser, deleteUser, getStats };
