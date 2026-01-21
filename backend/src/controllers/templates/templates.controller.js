const db = require('../../config/database');

// Get all templates
async function getTemplates(req, res) {
  try {
    const { type, category } = req.query;
    const userId = req.user?.id;
    
    let query = `
      SELECT t.*, u.name as creator_name, u.email as creator_email
      FROM templates t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE t.is_active = true
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filter by type
    if (type) {
      query += ` AND t.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    // Filter by category
    if (category && category !== 'all') {
      query += ` AND t.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    // For community templates, only show approved or own
    query += ` AND (t.type = 'system' OR t.is_approved = true OR t.creator_id = $${paramIndex})`;
    params.push(userId || '00000000-0000-0000-0000-000000000000');
    
    query += ' ORDER BY t.type DESC, t.installs_count DESC, t.created_at DESC';
    
    const result = await db.query(query, params);
    
    // Get categories
    const categoriesRes = await db.query(
      `SELECT DISTINCT category FROM templates WHERE is_active = true ORDER BY category`
    );
    
    res.json({
      templates: result.rows,
      categories: categoriesRes.rows.map(r => r.category)
    });
  } catch (error) {
    console.error('[Templates] Error listing:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבניות' });
  }
}

// Get single template
async function getTemplate(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT t.*, u.name as creator_name 
       FROM templates t 
       LEFT JOIN users u ON t.creator_id = u.id
       WHERE t.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('[Templates] Error getting:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבנית' });
  }
}

// Create community template from existing bot
async function createTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { name, description, botId, category, tags } = req.body;
    
    if (!name || !botId) {
      return res.status(400).json({ error: 'שם ובוט הם שדות חובה' });
    }
    
    // Get bot flow data
    const botRes = await db.query(
      'SELECT flow_data FROM bots WHERE id = $1 AND user_id = $2',
      [botId, userId]
    );
    
    if (botRes.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const result = await db.query(
      `INSERT INTO templates (name, description, category, type, creator_id, flow_data, tags)
       VALUES ($1, $2, $3, 'community', $4, $5, $6)
       RETURNING *`,
      [name, description || '', category || 'general', userId, botRes.rows[0].flow_data, tags || []]
    );
    
    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    console.error('[Templates] Error creating:', error);
    res.status(500).json({ error: 'שגיאה ביצירת תבנית' });
  }
}

// Install template to create new bot
async function installTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { botName } = req.body;
    
    // Get template
    const templateRes = await db.query(
      'SELECT * FROM templates WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (templateRes.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    const template = templateRes.rows[0];
    
    // Create new bot from template
    const botRes = await db.query(
      `INSERT INTO bots (user_id, name, description, flow_data, is_active)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [
        userId, 
        botName || `${template.name} (עותק)`,
        template.description || '',
        template.flow_data
      ]
    );
    
    // Track install
    await db.query(
      `INSERT INTO template_installs (template_id, user_id, bot_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [id, userId, botRes.rows[0].id]
    );
    
    // Update install count
    await db.query(
      'UPDATE templates SET installs_count = installs_count + 1 WHERE id = $1',
      [id]
    );
    
    res.status(201).json({ 
      bot: botRes.rows[0],
      message: 'התבנית הותקנה בהצלחה!'
    });
  } catch (error) {
    console.error('[Templates] Error installing:', error);
    res.status(500).json({ error: 'שגיאה בהתקנת תבנית' });
  }
}

// Delete own template
async function deleteTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(
      `DELETE FROM templates WHERE id = $1 AND creator_id = $2 AND type = 'community'
       RETURNING id`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה או שאין הרשאה למחוק' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Templates] Error deleting:', error);
    res.status(500).json({ error: 'שגיאה במחיקת תבנית' });
  }
}

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  installTemplate,
  deleteTemplate
};
