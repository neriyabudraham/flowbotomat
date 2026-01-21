const pool = require('../../config/database');

/**
 * Create new bot
 */
async function createBot(req, res) {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'נדרש שם לבוט' });
    }
    
    const result = await pool.query(
      `INSERT INTO bots (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, description || '']
    );
    
    res.status(201).json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת בוט' });
  }
}

/**
 * Update bot details
 */
async function updateBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    const { name, description, is_active } = req.body;
    
    const result = await pool.query(
      `UPDATE bots SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, description, is_active, botId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון בוט' });
  }
}

/**
 * Save bot flow data
 */
async function saveFlow(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    const { flow_data } = req.body;
    
    const result = await pool.query(
      `UPDATE bots SET flow_data = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [JSON.stringify(flow_data), botId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Save flow error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת פלואו' });
  }
}

/**
 * Delete bot
 */
async function deleteBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM bots WHERE id = $1 AND user_id = $2 RETURNING id',
      [botId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת בוט' });
  }
}

module.exports = { createBot, updateBot, saveFlow, deleteBot };
