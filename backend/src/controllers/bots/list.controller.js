const pool = require('../../config/database');

/**
 * List all bots for user
 */
async function listBots(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM bots WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({ bots: result.rows });
  } catch (error) {
    console.error('List bots error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בוטים' });
  }
}

/**
 * Get single bot with flow data
 */
async function getBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM bots WHERE id = $1 AND user_id = $2`,
      [botId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Get bot error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

module.exports = { listBots, getBot };
