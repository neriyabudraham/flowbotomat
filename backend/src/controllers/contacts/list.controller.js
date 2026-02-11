const pool = require('../../config/database');

/**
 * Get all contacts for user
 */
async function listContacts(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 200, search, tag, contact_type, ids } = req.query; // Paginated loading
    const offset = (page - 1) * limit;
    
    // If specific IDs are requested, filter by them
    if (ids) {
      const idArray = ids.split(',').filter(id => id.trim());
      if (idArray.length > 0) {
        const placeholders = idArray.map((_, i) => `$${i + 2}`).join(',');
        const query = `
          SELECT c.*, 
                 (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count,
                 (SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_message,
                 c.last_message_at as actual_last_message_at,
                 COALESCE(
                   (SELECT array_agg(t.name) FROM contact_tags t 
                    JOIN contact_tag_assignments cta ON t.id = cta.tag_id 
                    WHERE cta.contact_id = c.id), 
                   ARRAY[]::text[]
                 ) as tags
          FROM contacts c
          WHERE c.user_id = $1 AND c.id IN (${placeholders})
          ORDER BY c.display_name ASC
        `;
        const result = await pool.query(query, [userId, ...idArray]);
        return res.json({
          contacts: result.rows,
          total: result.rows.length,
          page: 1,
          limit: idArray.length,
        });
      }
    }
    
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count,
             (SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_message,
             COALESCE(
               (SELECT MAX(sent_at) FROM messages m WHERE m.contact_id = c.id),
               c.last_message_at
             ) as actual_last_message_at,
             COALESCE(
               (SELECT array_agg(t.name) FROM contact_tags t 
                JOIN contact_tag_assignments cta ON t.id = cta.tag_id 
                WHERE cta.contact_id = c.id), 
               ARRAY[]::text[]
             ) as tags,
             (SELECT value FROM contact_variables cv WHERE cv.contact_id = c.id AND cv.key = 'full_name' LIMIT 1) as full_name
      FROM contacts c
      WHERE c.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    // Filter by contact type (chats = no groups, groups = only groups)
    if (contact_type === 'chats') {
      query += ` AND c.phone NOT LIKE '%@g.us'`;
    } else if (contact_type === 'groups') {
      query += ` AND c.phone LIKE '%@g.us'`;
    }
    
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
    
    // Apply same contact_type filter to count
    if (contact_type === 'chats') {
      countQuery += ` AND c.phone NOT LIKE '%@g.us'`;
    } else if (contact_type === 'groups') {
      countQuery += ` AND c.phone LIKE '%@g.us'`;
    }
    
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
    
    query += ` ORDER BY COALESCE((SELECT MAX(sent_at) FROM messages m WHERE m.contact_id = c.id), c.last_message_at) DESC NULLS LAST LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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

/**
 * Get LID to phone/name mappings for the user
 * Used to resolve @mentions in chat messages
 */
async function getLidMappings(req, res) {
  try {
    const userId = req.user.id;
    
    // Get mappings from whatsapp_lid_mapping table
    const result = await pool.query(`
      SELECT lid, phone, display_name
      FROM whatsapp_lid_mapping
      WHERE user_id = $1
    `, [userId]);
    
    // Also try to enrich with contact names if display_name is empty
    const mappings = {};
    
    for (const row of result.rows) {
      let displayName = row.display_name;
      
      // If no display_name, try to find from contacts table
      if (!displayName && row.phone) {
        const contactResult = await pool.query(
          `SELECT display_name FROM contacts WHERE user_id = $1 AND (phone = $2 OR phone LIKE $3)`,
          [userId, row.phone, `%${row.phone}%`]
        );
        if (contactResult.rows.length > 0 && contactResult.rows[0].display_name) {
          displayName = contactResult.rows[0].display_name;
        }
      }
      
      mappings[row.lid] = {
        phone: row.phone,
        name: displayName || row.phone || row.lid
      };
    }
    
    res.json({ mappings });
    
  } catch (error) {
    console.error('Get LID mappings error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מיפויים' });
  }
}

module.exports = { listContacts, getContact, getLidMappings };
