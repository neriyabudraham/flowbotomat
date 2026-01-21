const db = require('../../config/database');
const { checkBotAccess } = require('./list.controller');

/**
 * Get bot statistics
 */
async function getBotStats(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    
    // Verify bot access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Get total triggers
    const triggersResult = await db.query(
      "SELECT COUNT(*) as count FROM bot_logs WHERE bot_id = $1 AND status = 'triggered'",
      [botId]
    );
    
    // Get unique users
    const usersResult = await db.query(
      "SELECT COUNT(DISTINCT contact_id) as count FROM bot_logs WHERE bot_id = $1",
      [botId]
    );
    
    // Get triggers today
    const todayResult = await db.query(
      "SELECT COUNT(*) as count FROM bot_logs WHERE bot_id = $1 AND started_at >= CURRENT_DATE",
      [botId]
    );
    
    // Get errors count
    const errorsResult = await db.query(
      "SELECT COUNT(*) as count FROM bot_logs WHERE bot_id = $1 AND status = 'error'",
      [botId]
    );
    
    res.json({
      totalTriggers: parseInt(triggersResult.rows[0].count),
      uniqueUsers: parseInt(usersResult.rows[0].count),
      triggersToday: parseInt(todayResult.rows[0].count),
      errors: parseInt(errorsResult.rows[0].count),
    });
  } catch (error) {
    console.error('Get bot stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Get bot users list
 */
async function getBotUsers(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Verify bot access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Get users with trigger count
    const result = await db.query(
      `SELECT c.id, c.phone, c.display_name, c.bot_enabled,
              COUNT(bl.id) as trigger_count,
              MAX(bl.started_at) as last_triggered
       FROM contacts c
       JOIN bot_logs bl ON c.id = bl.contact_id
       WHERE bl.bot_id = $1
       GROUP BY c.id
       ORDER BY last_triggered DESC
       LIMIT $2 OFFSET $3`,
      [botId, limit, offset]
    );
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(DISTINCT contact_id) as count FROM bot_logs WHERE bot_id = $1',
      [botId]
    );
    
    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit),
    });
  } catch (error) {
    console.error('Get bot users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Get bot logs
 */
async function getBotLogs(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    // Verify bot access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    const result = await db.query(
      `SELECT bl.*, c.phone, c.display_name
       FROM bot_logs bl
       LEFT JOIN contacts c ON bl.contact_id = c.id
       WHERE bl.bot_id = $1
       ORDER BY bl.started_at DESC
       LIMIT $2 OFFSET $3`,
      [botId, limit, offset]
    );
    
    res.json({
      logs: result.rows,
      page,
    });
  } catch (error) {
    console.error('Get bot logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getBotStats, getBotUsers, getBotLogs };
