const pool = require('../../config/database');

/**
 * Get all tags for user (return just names for simpler usage)
 */
async function getAllTags(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT DISTINCT name FROM contact_tags WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    
    res.json({ tags: result.rows.map(r => r.name) });
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
    
    // First, remove tag from all contacts
    await pool.query(
      `DELETE FROM contact_tag_assignments 
       WHERE tag_id = $1 
       AND contact_id IN (SELECT id FROM contacts WHERE user_id = $2)`,
      [tagId, userId]
    );
    
    // Then delete the tag itself
    const result = await pool.query(
      'DELETE FROM contact_tags WHERE id = $1 AND user_id = $2 RETURNING name',
      [tagId, userId]
    );
    
    const deletedTagName = result.rows[0]?.name;
    console.log(`[Tags] Deleted tag "${deletedTagName}" and removed from all contacts`);
    
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

/**
 * Bulk add tag to multiple contacts
 */
async function bulkAddTag(req, res) {
  try {
    const userId = req.user.id;
    const { contact_ids, tag } = req.body;
    
    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'נדרשת רשימת אנשי קשר' });
    }
    
    if (!tag || !tag.trim()) {
      return res.status(400).json({ error: 'נדרש שם תגית' });
    }
    
    // Create tag if not exists
    const tagResult = await pool.query(
      `INSERT INTO contact_tags (user_id, name, color)
       VALUES ($1, $2, '#3B82F6')
       ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [userId, tag.trim()]
    );
    
    const tagId = tagResult.rows[0].id;
    
    // Add tag to all contacts that belong to this user
    for (const contactId of contact_ids) {
      await pool.query(
        `INSERT INTO contact_tag_assignments (contact_id, tag_id)
         SELECT $1, $2 
         WHERE EXISTS (SELECT 1 FROM contacts WHERE id = $1 AND user_id = $3)
         ON CONFLICT DO NOTHING`,
        [contactId, tagId, userId]
      );
    }
    
    console.log(`[Tags] Bulk added tag "${tag}" to ${contact_ids.length} contacts for user ${userId}`);
    
    res.json({ success: true, tagId });
  } catch (error) {
    console.error('Bulk add tag error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת תגית' });
  }
}

module.exports = { 
  getAllTags, createTag, deleteTag,
  getContactTags, addTagToContact, removeTagFromContact,
  bulkAddTag
};
