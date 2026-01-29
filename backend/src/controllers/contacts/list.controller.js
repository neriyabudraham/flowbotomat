const pool = require('../../config/database');

/**
 * Get all contacts for user
 */
async function listContacts(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, search, tag } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count,
             (SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_message,
             COALESCE(
               (SELECT array_agg(t.name) FROM contact_tags t 
                JOIN contact_tag_assignments cta ON t.id = cta.tag_id 
                WHERE cta.contact_id = c.id), 
               ARRAY[]::text[]
             ) as tags
      FROM contacts c
      WHERE c.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (search) {
      query += ` AND (c.phone LIKE $${paramIndex} OR c.display_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (tag) {
      query += ` AND EXISTS (
        SELECT 1 FROM contact_tag_assignments cta 
        JOIN contact_tags t ON t.id = cta.tag_id 
        WHERE cta.contact_id = c.id AND t.name = $${paramIndex}
      )`;
      params.push(tag);
      paramIndex++;
    }
    
    // Count query with same filters
    let countQuery = `SELECT COUNT(*) FROM contacts c WHERE c.user_id = $1`;
    const countParams = [userId];
    let countParamIndex = 2;
    
    if (search) {
      countQuery += ` AND (c.phone LIKE $${countParamIndex} OR c.display_name ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }
    
    if (tag) {
      countQuery += ` AND EXISTS (
        SELECT 1 FROM contact_tag_assignments cta 
        JOIN contact_tags t ON t.id = cta.tag_id 
        WHERE cta.contact_id = c.id AND t.name = $${countParamIndex}
      )`;
      countParams.push(tag);
    }
    
    query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);
    
    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);
    
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
