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

/**
 * Get bot statistics over time (for charts)
 */
async function getBotStatsTimeline(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const { days = 30 } = req.query;
    
    // Verify bot access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Get daily triggers for the last N days
    const triggersResult = await db.query(
      `SELECT DATE(started_at) as date, COUNT(*) as count
       FROM bot_logs 
       WHERE bot_id = $1 
         AND started_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
         AND status = 'triggered'
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [botId]
    );
    
    // Get daily unique users
    const usersResult = await db.query(
      `SELECT DATE(started_at) as date, COUNT(DISTINCT contact_id) as count
       FROM bot_logs 
       WHERE bot_id = $1 
         AND started_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [botId]
    );
    
    // Get daily errors
    const errorsResult = await db.query(
      `SELECT DATE(started_at) as date, COUNT(*) as count
       FROM bot_logs 
       WHERE bot_id = $1 
         AND started_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
         AND status = 'error'
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [botId]
    );
    
    // Create a map of all dates in range
    const dateMap = {};
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateMap[dateStr] = { date: dateStr, triggers: 0, users: 0, errors: 0 };
    }
    
    // Fill in the data
    triggersResult.rows.forEach(row => {
      const dateStr = row.date.toISOString().split('T')[0];
      if (dateMap[dateStr]) dateMap[dateStr].triggers = parseInt(row.count);
    });
    
    usersResult.rows.forEach(row => {
      const dateStr = row.date.toISOString().split('T')[0];
      if (dateMap[dateStr]) dateMap[dateStr].users = parseInt(row.count);
    });
    
    errorsResult.rows.forEach(row => {
      const dateStr = row.date.toISOString().split('T')[0];
      if (dateMap[dateStr]) dateMap[dateStr].errors = parseInt(row.count);
    });
    
    res.json({
      timeline: Object.values(dateMap),
    });
  } catch (error) {
    console.error('Get bot stats timeline error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Export bot statistics as CSV
 */
async function exportBotStats(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const { days = 30 } = req.query;
    
    // Verify bot access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Get all logs for export
    const logsResult = await db.query(
      `SELECT bl.started_at, bl.status, bl.trigger_type, bl.error_message,
              c.phone, c.display_name
       FROM bot_logs bl
       LEFT JOIN contacts c ON bl.contact_id = c.id
       WHERE bl.bot_id = $1 
         AND bl.started_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
       ORDER BY bl.started_at DESC`,
      [botId]
    );
    
    // Generate CSV
    const headers = ['תאריך', 'שעה', 'טלפון', 'שם', 'סטטוס', 'סוג טריגר', 'שגיאה'];
    const rows = logsResult.rows.map(log => {
      const date = new Date(log.started_at);
      return [
        date.toLocaleDateString('he-IL'),
        date.toLocaleTimeString('he-IL'),
        log.phone || '',
        log.display_name || '',
        log.status,
        log.trigger_type || '',
        log.error_message || ''
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bot_stats_${botId}_${days}days.csv"`);
    res.send('\uFEFF' + csv); // BOM for Hebrew support in Excel
    
  } catch (error) {
    console.error('Export bot stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getBotStats, getBotUsers, getBotLogs, getBotStatsTimeline, exportBotStats };
