const db = require('../../config/database');

/**
 * Get contact statistics including message count, last message, and completed flows
 */
async function getContactStats(req, res) {
  try {
    const { contactId } = req.params;
    const userId = req.user.id;
    
    // Verify contact belongs to user
    const contactCheck = await db.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    // Get message count and last message
    const messagesResult = await db.query(`
      SELECT 
        COUNT(*) as message_count,
        MAX(created_at) as last_message_at
      FROM messages 
      WHERE contact_id = $1
    `, [contactId]);
    
    // Get last message content
    const lastMessageResult = await db.query(`
      SELECT content, message_type, created_at
      FROM messages 
      WHERE contact_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [contactId]);
    
    // Get completed flows from bot_sessions
    const flowsResult = await db.query(`
      SELECT 
        b.name as bot_name,
        COUNT(*) as completion_count
      FROM bot_sessions bs
      JOIN bots b ON bs.bot_id = b.id
      WHERE bs.contact_id = $1 AND bs.status = 'completed'
      GROUP BY b.id, b.name
      ORDER BY completion_count DESC
      LIMIT 5
    `, [contactId]);
    
    const lastMessage = lastMessageResult.rows[0];
    
    res.json({
      messageCount: parseInt(messagesResult.rows[0]?.message_count || 0),
      lastMessageAt: lastMessage?.created_at || null,
      lastMessageContent: lastMessage?.content || null,
      lastMessageType: lastMessage?.message_type || null,
      flowsCompleted: flowsResult.rows.map(f => ({
        name: f.bot_name,
        count: parseInt(f.completion_count)
      }))
    });
    
  } catch (error) {
    console.error('[Contacts] Get stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Get global contacts statistics for the user
 */
async function getGlobalStats(req, res) {
  try {
    const userId = req.user.id;
    
    // Total contacts count
    const contactsResult = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    // Active contacts (messaged in last hour)
    const activeResult = await db.query(`
      SELECT COUNT(*) as active 
      FROM contacts 
      WHERE user_id = $1 AND last_message_at > NOW() - INTERVAL '1 hour'
    `, [userId]);
    
    // Total messages count
    const messagesResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM messages 
      WHERE user_id = $1
    `, [userId]);
    
    // Messages today
    const todayMessagesResult = await db.query(`
      SELECT COUNT(*) as today 
      FROM messages 
      WHERE user_id = $1 AND created_at > CURRENT_DATE
    `, [userId]);
    
    res.json({
      totalContacts: parseInt(contactsResult.rows[0]?.total || 0),
      activeChats: parseInt(activeResult.rows[0]?.active || 0),
      messagesCount: parseInt(messagesResult.rows[0]?.total || 0),
      messagesToday: parseInt(todayMessagesResult.rows[0]?.today || 0),
    });
    
  } catch (error) {
    console.error('[Contacts] Get global stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

module.exports = { getContactStats, getGlobalStats };
