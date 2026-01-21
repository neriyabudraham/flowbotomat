const pool = require('../../config/database');

/**
 * Get all contacts for user
 */
async function listContacts(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count,
             (SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_message
      FROM contacts c
      WHERE c.user_id = $1
    `;
    const params = [userId];
    
    if (search) {
      query += ` AND (c.phone LIKE $2 OR c.display_name ILIKE $2)`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      contacts: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת אנשי קשר' });
  }
}

/**
 * Get single contact with details
 */
async function getContact(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    
    // Get contact
    const contactResult = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    const contact = contactResult.rows[0];
    
    // Get tags
    const tagsResult = await pool.query(
      `SELECT t.* FROM contact_tags t
       JOIN contact_tag_assignments cta ON t.id = cta.tag_id
       WHERE cta.contact_id = $1`,
      [contactId]
    );
    
    // Get variables
    const varsResult = await pool.query(
      'SELECT key, value FROM contact_variables WHERE contact_id = $1',
      [contactId]
    );
    
    res.json({
      contact: {
        ...contact,
        tags: tagsResult.rows,
        variables: varsResult.rows.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {}),
      },
    });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת איש קשר' });
  }
}

module.exports = { listContacts, getContact };
