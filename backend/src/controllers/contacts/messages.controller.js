const pool = require('../../config/database');

/**
 * Get messages for a contact
 */
async function getMessages(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verify contact belongs to user
    const contactCheck = await pool.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    // Get messages (newest first for pagination, will reverse on frontend)
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE contact_id = $1 
       ORDER BY sent_at DESC 
       LIMIT $2 OFFSET $3`,
      [contactId, limit, offset]
    );
    
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM messages WHERE contact_id = $1',
      [contactId]
    );
    
    res.json({
      messages: result.rows.reverse(), // Return in chronological order
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הודעות' });
  }
}

module.exports = { getMessages };
