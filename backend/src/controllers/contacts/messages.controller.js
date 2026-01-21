const pool = require('../../config/database');

/**
 * Get messages for a contact
 */
async function getMessages(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { limit = 50, before } = req.query;
    
    // Verify contact belongs to user
    const contactCheck = await pool.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    // Build query based on whether we're loading older messages
    let query, params;
    if (before) {
      // Load messages older than the specified timestamp
      query = `SELECT * FROM messages 
               WHERE contact_id = $1 AND sent_at < $2
               ORDER BY sent_at DESC 
               LIMIT $3`;
      params = [contactId, before, parseInt(limit)];
    } else {
      // Load latest messages
      query = `SELECT * FROM messages 
               WHERE contact_id = $1 
               ORDER BY sent_at DESC 
               LIMIT $2`;
      params = [contactId, parseInt(limit)];
    }
    
    const result = await pool.query(query, params);
    
    // Check if there are more messages
    const hasMoreQuery = before 
      ? 'SELECT EXISTS(SELECT 1 FROM messages WHERE contact_id = $1 AND sent_at < $2) as has_more'
      : 'SELECT COUNT(*) > $2 as has_more FROM messages WHERE contact_id = $1';
    
    const hasMoreParams = before
      ? [contactId, result.rows.length > 0 ? result.rows[result.rows.length - 1].sent_at : before]
      : [contactId, parseInt(limit)];
    
    const hasMoreResult = await pool.query(hasMoreQuery, hasMoreParams);
    
    res.json({
      messages: result.rows.reverse(), // Return in chronological order
      hasMore: hasMoreResult.rows[0].has_more,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הודעות' });
  }
}

module.exports = { getMessages };
