const pool = require('../../config/database');

/**
 * Get variables for contact
 */
async function getVariables(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    
    // Verify contact belongs to user
    const contactCheck = await pool.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    const result = await pool.query(
      'SELECT * FROM contact_variables WHERE contact_id = $1 ORDER BY key',
      [contactId]
    );
    
    res.json({ variables: result.rows });
  } catch (error) {
    console.error('Get variables error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Set variable for contact
 */
async function setVariable(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'נדרש שם משתנה' });
    }
    
    // Verify contact belongs to user
    const contactCheck = await pool.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    // Upsert variable
    const result = await pool.query(
      `INSERT INTO contact_variables (contact_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, key) 
       DO UPDATE SET value = $3, updated_at = NOW()
       RETURNING *`,
      [contactId, key, value]
    );
    
    res.json({ variable: result.rows[0] });
  } catch (error) {
    console.error('Set variable error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Delete variable
 */
async function deleteVariable(req, res) {
  try {
    const userId = req.user.id;
    const { contactId, key } = req.params;
    
    // Verify contact belongs to user
    const contactCheck = await pool.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    await pool.query(
      'DELETE FROM contact_variables WHERE contact_id = $1 AND key = $2',
      [contactId, key]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete variable error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

module.exports = { getVariables, setVariable, deleteVariable };
