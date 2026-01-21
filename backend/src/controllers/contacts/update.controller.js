const pool = require('../../config/database');

/**
 * Toggle bot status for contact
 */
async function toggleBot(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { is_bot_active } = req.body;
    
    const result = await pool.query(
      `UPDATE contacts 
       SET is_bot_active = $1, updated_at = NOW() 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [is_bot_active, contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Toggle bot error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Block/unblock contact
 */
async function toggleBlock(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { is_blocked } = req.body;
    
    const result = await pool.query(
      `UPDATE contacts 
       SET is_blocked = $1, updated_at = NOW() 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [is_blocked, contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Toggle block error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Delete contact
 */
async function deleteContact(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
}

module.exports = { toggleBot, toggleBlock, deleteContact };
