const pool = require('../../config/database');

/**
 * Get dashboard statistics
 */
async function getDashboardStats(req, res) {
  try {
    const userId = req.user.id;
    
    // Get counts in parallel
    const [contactsRes, messagesRes, todayMsgsRes, whatsappRes, activeBotsRes] = await Promise.all([
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
      pool.query(
        'SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND is_bot_active = true',
        [userId]
      ),
    ]);

    // Get recent conversations (contacts with recent messages)
    const recentConversationsRes = await pool.query(
      `SELECT 
         c.id,
         c.phone_number,
         c.display_name,
         c.profile_picture_url,
         c.last_message_at,
         (SELECT COUNT(*) FROM messages WHERE contact_id = c.id) as message_count,
         (SELECT content FROM messages WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM contacts c
       WHERE c.user_id = $1 AND c.last_message_at IS NOT NULL
       ORDER BY c.last_message_at DESC
       LIMIT 5`,
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
      activity: recentConversationsRes.rows,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
}

module.exports = { getDashboardStats };
