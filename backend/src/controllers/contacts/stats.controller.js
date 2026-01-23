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
    
    // Get message counts - incoming and outgoing separately
    const messagesResult = await db.query(`
      SELECT 
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE direction = 'incoming') as incoming_count,
        COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing_count,
        MAX(sent_at) as last_message_at
      FROM messages 
      WHERE contact_id = $1
    `, [contactId]);
    
    // Get last message content
    const lastMessageResult = await db.query(`
      SELECT content, message_type, direction, sent_at as created_at
      FROM messages 
      WHERE contact_id = $1 
      ORDER BY sent_at DESC 
      LIMIT 1
    `, [contactId]);
    
    console.log(`[Stats] Contact ${contactId} - Total: ${messagesResult.rows[0]?.total_count}, In: ${messagesResult.rows[0]?.incoming_count}, Out: ${messagesResult.rows[0]?.outgoing_count}`);
    
    // Get bots that this contact triggered - from bot_runs table
    const botsResult = await db.query(`
      SELECT 
        b.name as bot_name,
        b.id as bot_id,
        COUNT(br.id) as run_count
      FROM bot_runs br
      JOIN bots b ON br.bot_id = b.id
      WHERE br.contact_id = $1
      GROUP BY b.id, b.name
      ORDER BY run_count DESC
      LIMIT 10
    `, [contactId]);
    
    const lastMessage = lastMessageResult.rows[0];
    const stats = messagesResult.rows[0] || {};
    
    const response = {
      messageCount: parseInt(stats.total_count || 0),
      incomingCount: parseInt(stats.incoming_count || 0),
      outgoingCount: parseInt(stats.outgoing_count || 0),
      lastMessageAt: lastMessage?.created_at || null,
      lastMessageContent: lastMessage?.content || null,
      lastMessageType: lastMessage?.message_type || null,
      lastMessageDirection: lastMessage?.direction || null,
      botsInteracted: botsResult.rows.map(b => ({
        name: b.bot_name,
        id: b.bot_id,
        count: parseInt(b.run_count)
      }))
    };
    
    console.log(`[Stats] Contact ${contactId} response:`, JSON.stringify(response));
    
    res.json(response);
    
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
      WHERE user_id = $1 AND sent_at > CURRENT_DATE
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
