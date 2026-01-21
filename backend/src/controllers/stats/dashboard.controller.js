const pool = require('../../config/database');

/**
 * Get dashboard statistics
 */
async function getDashboardStats(req, res) {
  try {
    const userId = req.user.id;
    
    // Get counts in parallel
    const [contactsRes, messagesRes, todayMsgsRes, whatsappRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM contacts WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) FROM messages WHERE user_id = $1', [userId]),
      pool.query(
        `SELECT COUNT(*) FROM messages 
         WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
        [userId]
      ),
      pool.query(
        'SELECT status FROM whatsapp_connections WHERE user_id = $1 LIMIT 1',
        [userId]
      ),
    ]);

    // Get recent activity (last 7 days)
    const activityRes = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM messages
       WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [userId]
    );

    // Get active bots count (contacts with bot active)
    const activeBotsRes = await pool.query(
      'SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND is_bot_active = true',
      [userId]
    );

    res.json({
      stats: {
        totalContacts: parseInt(contactsRes.rows[0].count),
        totalMessages: parseInt(messagesRes.rows[0].count),
        todayMessages: parseInt(todayMsgsRes.rows[0].count),
        activeBots: parseInt(activeBotsRes.rows[0].count),
        whatsappStatus: whatsappRes.rows[0]?.status || 'disconnected',
      },
      activity: activityRes.rows,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
}

module.exports = { getDashboardStats };
