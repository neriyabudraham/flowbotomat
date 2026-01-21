const db = require('../../config/database');

/**
 * Get all system settings
 */
async function getSettings(req, res) {
  try {
    const result = await db.query(
      'SELECT key, value, description, updated_at FROM system_settings ORDER BY key'
    );
    
    // Convert to object
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = {
        value: row.value,
        description: row.description,
        updated_at: row.updated_at,
      };
    }
    
    res.json({ settings });
  } catch (error) {
    console.error('[Admin] Get settings error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  }
}

/**
 * Update a setting
 */
async function updateSetting(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (!value) {
      return res.status(400).json({ error: 'ערך חובה' });
    }
    
    const result = await db.query(
      `INSERT INTO system_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3
       RETURNING key, value, updated_at`,
      [key, JSON.stringify(value), req.user.id]
    );
    
    res.json({ setting: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Update setting error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרה' });
  }
}

/**
 * Get system logs
 */
async function getLogs(req, res) {
  try {
    const { page = 1, limit = 50, type, severity } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;
    
    if (type) {
      whereClause += ` AND error_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    if (severity) {
      whereClause += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }
    
    const countResult = await db.query(
      `SELECT COUNT(*) FROM error_logs WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    const result = await db.query(
      `SELECT el.*, u.email as user_email, b.name as bot_name
       FROM error_logs el
       LEFT JOIN users u ON el.user_id = u.id
       LEFT JOIN bots b ON el.flow_id = b.id
       WHERE ${whereClause}
       ORDER BY el.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    
    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Admin] Get logs error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת לוגים' });
  }
}

module.exports = { getSettings, updateSetting, getLogs };
