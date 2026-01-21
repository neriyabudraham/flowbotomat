const pool = require('../../config/database');

/**
 * Get all tags for user
 */
async function getAllTags(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM contact_tags WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    
    res.json({ tags: result.rows });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Create new tag
 */
async function createTag(req, res) {
  try {
    const userId = req.user.id;
    const { name, color = '#3B82F6' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'נדרש שם תגית' });
    }
    
    const result = await pool.query(
      `INSERT INTO contact_tags (user_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, name) DO NOTHING
       RETURNING *`,
      [userId, name, color]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'תגית כבר קיימת' });
    }
    
    res.json({ tag: result.rows[0] });
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Delete tag
 */
async function deleteTag(req, res) {
  try {
    const userId = req.user.id;
    const { tagId } = req.params;
    
    await pool.query(
      'DELETE FROM contact_tags WHERE id = $1 AND user_id = $2',
      [tagId, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Get tags for contact
 */
async function getContactTags(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    
    const result = await pool.query(
      `SELECT t.* FROM contact_tags t
       JOIN contact_tag_assignments cta ON t.id = cta.tag_id
       WHERE cta.contact_id = $1 AND t.user_id = $2`,
      [contactId, userId]
    );
    
    res.json({ tags: result.rows });
  } catch (error) {
    console.error('Get contact tags error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Add tag to contact
 */
async function addTagToContact(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { tagId } = req.body;
    
    // Verify contact and tag belong to user
    const checks = await Promise.all([
      pool.query('SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [contactId, userId]),
      pool.query('SELECT id FROM contact_tags WHERE id = $1 AND user_id = $2', [tagId, userId]),
    ]);
    
    if (checks[0].rows.length === 0 || checks[1].rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא' });
    }
    
    await pool.query(
      `INSERT INTO contact_tag_assignments (contact_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, tagId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Add tag error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Remove tag from contact
 */
async function removeTagFromContact(req, res) {
  try {
    const { contactId, tagId } = req.params;
    
    await pool.query(
      'DELETE FROM contact_tag_assignments WHERE contact_id = $1 AND tag_id = $2',
      [contactId, tagId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Remove tag error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

module.exports = { 
  getAllTags, createTag, deleteTag,
  getContactTags, addTagToContact, removeTagFromContact 
};
