const db = require('../../config/database');

// Default status bot colors (user's specified colors)
const DEFAULT_STATUS_BOT_COLORS = [
  { id: '782138', title: 'בורדו' },
  { id: '6e267d', title: 'סגול כהה' },
  { id: '8d698f', title: 'סגול לילך' },
  { id: 'c79ecc', title: 'סגול בהיר' },
  { id: '8294c9', title: 'כחול אפרפר' },
  { id: '7d8fa3', title: 'אפור' },
  { id: '243740', title: 'תורכיז כהה' },
  { id: 'ad8673', title: 'חום' },
  { id: '73666b', title: 'חום-סגול' },
  { id: '7acca7', title: 'ירוק בהיר' },
];

/**
 * Get status bot colors for a user (requires auth)
 */
async function getStatusBotColors(req, res) {
  try {
    const userId = req.user?.id;
    
    // If authenticated, try to get user-specific colors from connection
    if (userId) {
      const connResult = await db.query(
        "SELECT custom_colors FROM status_bot_connections WHERE user_id = $1",
        [userId]
      );
      
      if (connResult.rows.length > 0 && connResult.rows[0].custom_colors) {
        try {
          const parsed = typeof connResult.rows[0].custom_colors === 'string' 
            ? JSON.parse(connResult.rows[0].custom_colors) 
            : connResult.rows[0].custom_colors;
          if (Array.isArray(parsed) && parsed.length > 0) {
            return res.json({ colors: parsed, isCustom: true });
          }
        } catch (e) {
          console.error('[Settings] Failed to parse user colors:', e);
        }
      }
    }
    
    // Return defaults
    res.json({ colors: DEFAULT_STATUS_BOT_COLORS, isCustom: false });
  } catch (error) {
    console.error('[Settings] Get status bot colors error:', error);
    res.json({ colors: DEFAULT_STATUS_BOT_COLORS, isCustom: false });
  }
}

/**
 * Update user's status bot colors
 */
async function updateStatusBotColors(req, res) {
  try {
    const userId = req.user.id;
    const { colors } = req.body;
    
    if (!Array.isArray(colors)) {
      return res.status(400).json({ error: 'צבעים חייבים להיות מערך' });
    }
    
    if (colors.length > 10) {
      return res.status(400).json({ error: 'מקסימום 10 צבעים' });
    }
    
    if (colors.length < 1) {
      return res.status(400).json({ error: 'חייב להיות לפחות צבע אחד' });
    }
    
    // Validate each color
    for (const color of colors) {
      if (!color.id || !color.title) {
        return res.status(400).json({ error: 'כל צבע חייב לכלול id ו-title' });
      }
      if (!/^[0-9a-fA-F]{6}$/.test(color.id)) {
        return res.status(400).json({ error: 'קוד צבע לא תקין' });
      }
    }
    
    // Update user's connection with custom colors
    await db.query(`
      UPDATE status_bot_connections 
      SET custom_colors = $1, updated_at = NOW()
      WHERE user_id = $2
    `, [JSON.stringify(colors), userId]);
    
    res.json({ success: true, colors });
  } catch (error) {
    console.error('[Settings] Update status bot colors error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת צבעים' });
  }
}

/**
 * Reset user's status bot colors to defaults
 */
async function resetStatusBotColors(req, res) {
  try {
    const userId = req.user.id;
    
    await db.query(`
      UPDATE status_bot_connections 
      SET custom_colors = NULL, updated_at = NOW()
      WHERE user_id = $1
    `, [userId]);
    
    res.json({ success: true, colors: DEFAULT_STATUS_BOT_COLORS });
  } catch (error) {
    console.error('[Settings] Reset status bot colors error:', error);
    res.status(500).json({ error: 'שגיאה באיפוס צבעים' });
  }
}

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

module.exports = { 
  getSettings, 
  updateSetting, 
  getLogs, 
  getStatusBotColors,
  updateStatusBotColors,
  resetStatusBotColors 
};
