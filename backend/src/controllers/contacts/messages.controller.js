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
    
    // Get total message count
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM messages WHERE contact_id = $1',
      [contactId]
    );
    const total = parseInt(totalResult.rows[0]?.total || 0);
    
    // Build query based on whether we're loading older messages
    // Use COALESCE to handle both sent_at and created_at
    let query, params;
    if (before) {
      // Load messages older than the specified timestamp
      query = `SELECT * FROM messages 
               WHERE contact_id = $1 AND COALESCE(sent_at, created_at) < $2
               ORDER BY COALESCE(sent_at, created_at) DESC 
               LIMIT $3`;
      params = [contactId, before, parseInt(limit)];
    } else {
      // Load latest messages
      query = `SELECT * FROM messages 
               WHERE contact_id = $1 
               ORDER BY COALESCE(sent_at, created_at) DESC 
               LIMIT $2`;
      params = [contactId, parseInt(limit)];
    }
    
    const result = await pool.query(query, params);
    
    // Check if there are more messages
    const hasMore = result.rows.length >= parseInt(limit);
    
    res.json({
      messages: result.rows.reverse(), // Return in chronological order
      hasMore: hasMore,
      total: total,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הודעות' });
  }
}

module.exports = { getMessages };
