const db = require('../../config/database');

/**
 * Get all published templates (for users)
 */
async function getTemplates(req, res) {
  try {
    const { category, search, featured } = req.query;
    
    let whereClause = 'is_published = true';
    const params = [];
    let paramIndex = 1;
    
    if (category && category !== 'all') {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    
    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR name_he ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR description_he ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (featured === 'true') {
      whereClause += ' AND is_featured = true';
    }
    
    const result = await db.query(`
      SELECT 
        t.*,
        u.name as creator_name,
        u.email as creator_email
      FROM bot_templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE ${whereClause}
      ORDER BY is_featured DESC, sort_order ASC, use_count DESC, created_at DESC
    `, params);
    
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('[Templates] Get templates error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבניות' });
  }
}

/**
 * Get template categories
 */
async function getCategories(req, res) {
  try {
    const result = await db.query(`
      SELECT * FROM template_categories 
      WHERE is_active = true 
      ORDER BY sort_order ASC
    `);
    
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('[Templates] Get categories error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קטגוריות' });
  }
}

/**
 * Get single template
 */
async function getTemplate(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT 
        t.*,
        u.name as creator_name,
        u.email as creator_email
      FROM bot_templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('[Templates] Get template error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבנית' });
  }
}

/**
 * Use template - create a bot from template
 */
async function useTemplate(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name } = req.body;
    
    // Get template
    const templateResult = await db.query(
      'SELECT * FROM bot_templates WHERE id = $1 AND is_published = true',
      [id]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    const template = templateResult.rows[0];
    
    // Check if user has premium access if template is premium
    if (template.is_premium) {
      const subResult = await db.query(
        `SELECT id FROM user_subscriptions WHERE user_id = $1 AND status IN ('active', 'trial')`,
        [userId]
      );
      if (subResult.rows.length === 0) {
        return res.status(403).json({ 
          error: 'תבנית זו זמינה למנויים בלבד',
          upgrade_required: true
        });
      }
    }
    
    // Create bot from template
    const botResult = await db.query(`
      INSERT INTO bots (user_id, name, description, flow_data, is_active)
      VALUES ($1, $2, $3, $4, false)
      RETURNING *
    `, [
      userId,
      name || template.name_he || template.name,
      template.description_he || template.description,
      template.flow_data
    ]);
    
    // Increment use count
    await db.query(
      'UPDATE bot_templates SET use_count = use_count + 1 WHERE id = $1',
      [id]
    );
    
    res.json({ 
      success: true, 
      bot: botResult.rows[0],
      message: 'הבוט נוצר בהצלחה מהתבנית'
    });
  } catch (error) {
    console.error('[Templates] Use template error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת בוט מתבנית' });
  }
}

// ============ ADMIN FUNCTIONS ============

/**
 * Get all templates (admin)
 */
async function adminGetTemplates(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        t.*,
        u.name as creator_name,
        u.email as creator_email
      FROM bot_templates t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY sort_order ASC, created_at DESC
    `);
    
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('[Templates] Admin get templates error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבניות' });
  }
}

/**
 * Create template (admin)
 */
async function createTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { 
      name, name_he, description, description_he,
      category, tags, flow_data, trigger_config,
      is_published, is_featured, is_premium, price, sort_order
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם התבנית הוא שדה חובה' });
    }
    
    const result = await db.query(`
      INSERT INTO bot_templates (
        name, name_he, description, description_he,
        category, tags, flow_data, trigger_config,
        is_published, is_featured, is_premium, price, sort_order,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      name, name_he || null, description || null, description_he || null,
      category || 'general', tags || [], flow_data || { nodes: [], edges: [] }, trigger_config || {},
      is_published || false, is_featured || false, is_premium || false, price || 0, sort_order || 0,
      userId
    ]);
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('[Templates] Create template error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת תבנית' });
  }
}

/**
 * Update template (admin)
 */
async function updateTemplate(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'name', 'name_he', 'description', 'description_he',
      'category', 'tags', 'flow_data', 'trigger_config',
      'thumbnail_url', 'preview_images', 'demo_video_url',
      'is_published', 'is_featured', 'is_premium', 'price', 'sort_order'
    ];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }
    
    values.push(id);
    
    const result = await db.query(`
      UPDATE bot_templates 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('[Templates] Update template error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון תבנית' });
  }
}

/**
 * Delete template (admin)
 */
async function deleteTemplate(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'DELETE FROM bot_templates WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Templates] Delete template error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת תבנית' });
  }
}

/**
 * Create template from existing bot (admin)
 */
async function createFromBot(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const { name, name_he, description, description_he, category } = req.body;
    
    // Get bot
    const botResult = await db.query(
      'SELECT * FROM bots WHERE id = $1',
      [botId]
    );
    
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const bot = botResult.rows[0];
    
    // Create template from bot
    const result = await db.query(`
      INSERT INTO bot_templates (
        name, name_he, description, description_he,
        category, flow_data, trigger_config,
        is_published, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
      RETURNING *
    `, [
      name || bot.name,
      name_he || null,
      description || bot.description,
      description_he || null,
      category || 'general',
      bot.flow_data,
      bot.trigger_config,
      userId
    ]);
    
    res.json({ 
      template: result.rows[0],
      message: 'התבנית נוצרה בהצלחה מהבוט'
    });
  } catch (error) {
    console.error('[Templates] Create from bot error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת תבנית מבוט' });
  }
}

module.exports = {
  getTemplates,
  getCategories,
  getTemplate,
  useTemplate,
  adminGetTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createFromBot
};
