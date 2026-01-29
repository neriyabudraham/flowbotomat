const pool = require('../../config/database');

/**
 * Get all audiences for user
 */
async function getAudiences(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT * FROM broadcast_audiences a
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC
    `, [userId]);
    
    // Calculate counts for each audience
    const audiences = await Promise.all(result.rows.map(async (audience) => {
      if (audience.is_static) {
        // Static: count from junction table
        const countResult = await pool.query(
          'SELECT COUNT(*) FROM broadcast_audience_contacts WHERE audience_id = $1',
          [audience.id]
        );
        audience.contacts_count = parseInt(countResult.rows[0].count);
      } else {
        // Dynamic: calculate based on filter criteria
        audience.contacts_count = await calculateDynamicAudienceCount(userId, audience.filter_criteria);
      }
      return audience;
    }));
    
    res.json({ audiences });
  } catch (error) {
    console.error('[Broadcasts] Get audiences error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קהלים' });
  }
}

/**
 * Get single audience with details
 */
async function getAudience(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM broadcast_audiences 
      WHERE id = $1 AND user_id = $2
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא' });
    }
    
    const audience = result.rows[0];
    
    // Get contact count
    if (audience.is_static) {
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM broadcast_audience_contacts WHERE audience_id = $1',
        [id]
      );
      audience.contacts_count = parseInt(countResult.rows[0].count);
    } else {
      // Calculate dynamic count based on filter
      audience.contacts_count = await calculateDynamicAudienceCount(userId, audience.filter_criteria);
    }
    
    res.json({ audience });
  } catch (error) {
    console.error('[Broadcasts] Get audience error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קהל' });
  }
}

/**
 * Create new audience
 */
async function createAudience(req, res) {
  try {
    const userId = req.user.id;
    const { name, description, filter_criteria, is_static } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם הקהל נדרש' });
    }
    
    const result = await pool.query(`
      INSERT INTO broadcast_audiences (user_id, name, description, filter_criteria, is_static)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, name, description, filter_criteria || {}, is_static || false]);
    
    res.status(201).json({ audience: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Create audience error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת קהל' });
  }
}

/**
 * Update audience
 */
async function updateAudience(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, filter_criteria } = req.body;
    
    const result = await pool.query(`
      UPDATE broadcast_audiences 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          filter_criteria = COALESCE($3, filter_criteria),
          updated_at = NOW()
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `, [name, description, filter_criteria, id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא' });
    }
    
    res.json({ audience: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Update audience error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון קהל' });
  }
}

/**
 * Delete audience
 */
async function deleteAudience(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM broadcast_audiences WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Delete audience error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת קהל' });
  }
}

/**
 * Get contacts in audience
 */
async function getAudienceContacts(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verify audience belongs to user
    const audienceResult = await pool.query(
      'SELECT * FROM broadcast_audiences WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (audienceResult.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא' });
    }
    
    const audience = audienceResult.rows[0];
    let contacts;
    let total;
    
    if (audience.is_static) {
      // Static audience - get from junction table
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM broadcast_audience_contacts WHERE audience_id = $1',
        [id]
      );
      total = parseInt(countResult.rows[0].count);
      
      const contactsResult = await pool.query(`
        SELECT c.* FROM contacts c
        JOIN broadcast_audience_contacts bac ON bac.contact_id = c.id
        WHERE bac.audience_id = $1
        ORDER BY c.display_name, c.phone
        LIMIT $2 OFFSET $3
      `, [id, limit, offset]);
      contacts = contactsResult.rows;
    } else {
      // Dynamic audience - filter contacts
      const { contacts: filtered, total: count } = await getFilteredContacts(
        userId, audience.filter_criteria, limit, offset
      );
      contacts = filtered;
      total = count;
    }
    
    res.json({
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Broadcasts] Get audience contacts error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת אנשי קשר' });
  }
}

/**
 * Add contacts to static audience
 */
async function addContactsToAudience(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { contact_ids } = req.body;
    
    if (!contact_ids || !Array.isArray(contact_ids)) {
      return res.status(400).json({ error: 'נדרשת רשימת אנשי קשר' });
    }
    
    // Verify audience is static and belongs to user
    const audienceResult = await pool.query(
      'SELECT * FROM broadcast_audiences WHERE id = $1 AND user_id = $2 AND is_static = true',
      [id, userId]
    );
    
    if (audienceResult.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא או אינו קהל סטטי' });
    }
    
    // Insert contacts (ignore duplicates)
    const values = contact_ids.map((contactId, i) => `($1, $${i + 2})`).join(', ');
    await pool.query(`
      INSERT INTO broadcast_audience_contacts (audience_id, contact_id)
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `, [id, ...contact_ids]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Add contacts to audience error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת אנשי קשר' });
  }
}

/**
 * Remove contacts from static audience
 */
async function removeContactsFromAudience(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { contact_ids } = req.body;
    
    if (!contact_ids || !Array.isArray(contact_ids)) {
      return res.status(400).json({ error: 'נדרשת רשימת אנשי קשר' });
    }
    
    // Verify audience belongs to user
    const audienceResult = await pool.query(
      'SELECT * FROM broadcast_audiences WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (audienceResult.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא' });
    }
    
    await pool.query(
      'DELETE FROM broadcast_audience_contacts WHERE audience_id = $1 AND contact_id = ANY($2)',
      [id, contact_ids]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Remove contacts from audience error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת אנשי קשר' });
  }
}

// ============================================
// Helper Functions
// ============================================

async function calculateDynamicAudienceCount(userId, filterCriteria) {
  const { whereClause, params } = buildFilterQuery(userId, filterCriteria);
  
  const result = await pool.query(
    `SELECT COUNT(DISTINCT c.id) FROM contacts c ${whereClause}`,
    params
  );
  
  return parseInt(result.rows[0].count);
}

async function getFilteredContacts(userId, filterCriteria, limit, offset) {
  const { whereClause, params } = buildFilterQuery(userId, filterCriteria);
  
  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT c.id) FROM contacts c ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);
  
  // Get contacts with pagination
  const contactsResult = await pool.query(`
    SELECT DISTINCT c.* FROM contacts c 
    ${whereClause}
    ORDER BY c.display_name, c.phone
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);
  
  return { contacts: contactsResult.rows, total };
}

function buildFilterQuery(userId, filterCriteria) {
  let whereClause = 'WHERE c.user_id = $1';
  const params = [userId];
  let paramIndex = 2;
  
  if (!filterCriteria || Object.keys(filterCriteria).length === 0) {
    return { whereClause, params };
  }
  
  // Filter by tags (with tag logic: any/all)
  if (filterCriteria.tags && filterCriteria.tags.length > 0) {
    const tagLogic = filterCriteria.tagLogic || 'any'; // 'any' or 'all'
    
    if (tagLogic === 'all') {
      // Must have ALL tags
      for (const tagName of filterCriteria.tags) {
        whereClause += ` AND EXISTS (
          SELECT 1 FROM contact_tag_assignments cta
          JOIN contact_tags ct ON ct.id = cta.tag_id
          WHERE cta.contact_id = c.id AND ct.name = $${paramIndex} AND ct.user_id = $1
        )`;
        params.push(tagName);
        paramIndex++;
      }
    } else {
      // Has ANY of the tags
      whereClause += ` AND EXISTS (
        SELECT 1 FROM contact_tag_assignments cta
        JOIN contact_tags ct ON ct.id = cta.tag_id
        WHERE cta.contact_id = c.id AND ct.name = ANY($${paramIndex}) AND ct.user_id = $1
      )`;
      params.push(filterCriteria.tags);
      paramIndex++;
    }
  }
  
  // Filter by excluded tags
  if (filterCriteria.excludeTags && filterCriteria.excludeTags.length > 0) {
    whereClause += ` AND NOT EXISTS (
      SELECT 1 FROM contact_tag_assignments cta
      JOIN contact_tags ct ON ct.id = cta.tag_id
      WHERE cta.contact_id = c.id AND ct.name = ANY($${paramIndex}) AND ct.user_id = $1
    )`;
    params.push(filterCriteria.excludeTags);
    paramIndex++;
  }
  
  // Advanced variable conditions
  if (filterCriteria.conditions && Array.isArray(filterCriteria.conditions)) {
    for (const condition of filterCriteria.conditions) {
      const { variable, operator, value } = condition;
      if (!variable || !operator) continue;
      
      // Handle system fields vs custom variables
      const isSystemField = ['phone', 'display_name'].includes(variable);
      
      if (isSystemField) {
        // System fields are columns on the contacts table
        const column = variable === 'display_name' ? 'c.display_name' : 'c.phone';
        const clause = buildOperatorClause(column, operator, value, paramIndex);
        if (clause.sql) {
          whereClause += ` AND ${clause.sql}`;
          params.push(...clause.params);
          paramIndex += clause.params.length;
        }
      } else {
        // Custom variables in contact_variables table
        switch (operator) {
          case 'exists':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex}
            )`;
            params.push(variable);
            paramIndex++;
            break;
          case 'not_exists':
            whereClause += ` AND NOT EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex}
            )`;
            params.push(variable);
            paramIndex++;
            break;
          case 'equals':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value = $${paramIndex + 1}
            )`;
            params.push(variable, value || '');
            paramIndex += 2;
            break;
          case 'not_equals':
            whereClause += ` AND (NOT EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex}
            ) OR EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value != $${paramIndex + 1}
            ))`;
            params.push(variable, value || '');
            paramIndex += 2;
            break;
          case 'contains':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value ILIKE $${paramIndex + 1}
            )`;
            params.push(variable, `%${value || ''}%`);
            paramIndex += 2;
            break;
          case 'not_contains':
            whereClause += ` AND NOT EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value ILIKE $${paramIndex + 1}
            )`;
            params.push(variable, `%${value || ''}%`);
            paramIndex += 2;
            break;
          case 'starts_with':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value ILIKE $${paramIndex + 1}
            )`;
            params.push(variable, `${value || ''}%`);
            paramIndex += 2;
            break;
          case 'ends_with':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value ILIKE $${paramIndex + 1}
            )`;
            params.push(variable, `%${value || ''}`);
            paramIndex += 2;
            break;
          case 'is_empty':
            whereClause += ` AND (NOT EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex}
            ) OR EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND (cv.value IS NULL OR cv.value = '')
            ))`;
            params.push(variable);
            paramIndex++;
            break;
          case 'is_not_empty':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value IS NOT NULL AND cv.value != ''
            )`;
            params.push(variable);
            paramIndex++;
            break;
          case 'greater_than':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} 
              AND (cv.value ~ '^[0-9]+(\\.[0-9]+)?$') AND cv.value::numeric > $${paramIndex + 1}::numeric
            )`;
            params.push(variable, value || '0');
            paramIndex += 2;
            break;
          case 'less_than':
            whereClause += ` AND EXISTS (
              SELECT 1 FROM contact_variables cv 
              WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} 
              AND (cv.value ~ '^[0-9]+(\\.[0-9]+)?$') AND cv.value::numeric < $${paramIndex + 1}::numeric
            )`;
            params.push(variable, value || '0');
            paramIndex += 2;
            break;
        }
      }
    }
  }
  
  // Legacy: Filter by custom fields (old format for backward compatibility)
  if (filterCriteria.custom_fields) {
    for (const [key, value] of Object.entries(filterCriteria.custom_fields)) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM contact_variables cv 
        WHERE cv.contact_id = c.id AND cv.variable_name = $${paramIndex} AND cv.value = $${paramIndex + 1}
      )`;
      params.push(key, value);
      paramIndex += 2;
    }
  }
  
  // Filter by blocked status
  if (filterCriteria.is_blocked !== undefined) {
    whereClause += ` AND c.is_blocked = $${paramIndex}`;
    params.push(filterCriteria.is_blocked);
    paramIndex++;
  }
  
  // Filter by bot active status
  if (filterCriteria.is_bot_active !== undefined) {
    whereClause += ` AND c.is_bot_active = $${paramIndex}`;
    params.push(filterCriteria.is_bot_active);
    paramIndex++;
  }
  
  // Filter by has WhatsApp
  if (filterCriteria.has_whatsapp !== undefined) {
    whereClause += ` AND c.has_whatsapp = $${paramIndex}`;
    params.push(filterCriteria.has_whatsapp);
    paramIndex++;
  }
  
  // Filter by name search
  if (filterCriteria.name_search) {
    whereClause += ` AND (c.display_name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex})`;
    params.push(`%${filterCriteria.name_search}%`);
    paramIndex++;
  }
  
  // Filter by date range (created_at)
  if (filterCriteria.created_after) {
    whereClause += ` AND c.created_at >= $${paramIndex}`;
    params.push(filterCriteria.created_after);
    paramIndex++;
  }
  if (filterCriteria.created_before) {
    whereClause += ` AND c.created_at <= $${paramIndex}`;
    params.push(filterCriteria.created_before);
    paramIndex++;
  }
  
  // Filter by last message date
  if (filterCriteria.last_message_after) {
    whereClause += ` AND c.last_message_at >= $${paramIndex}`;
    params.push(filterCriteria.last_message_after);
    paramIndex++;
  }
  if (filterCriteria.last_message_before) {
    whereClause += ` AND c.last_message_at <= $${paramIndex}`;
    params.push(filterCriteria.last_message_before);
    paramIndex++;
  }
  
  return { whereClause, params };
}

// Helper function to build operator clause for system fields
function buildOperatorClause(column, operator, value, paramIndex) {
  switch (operator) {
    case 'equals':
      return { sql: `${column} = $${paramIndex}`, params: [value || ''] };
    case 'not_equals':
      return { sql: `(${column} IS NULL OR ${column} != $${paramIndex})`, params: [value || ''] };
    case 'contains':
      return { sql: `${column} ILIKE $${paramIndex}`, params: [`%${value || ''}%`] };
    case 'not_contains':
      return { sql: `(${column} IS NULL OR ${column} NOT ILIKE $${paramIndex})`, params: [`%${value || ''}%`] };
    case 'starts_with':
      return { sql: `${column} ILIKE $${paramIndex}`, params: [`${value || ''}%`] };
    case 'ends_with':
      return { sql: `${column} ILIKE $${paramIndex}`, params: [`%${value || ''}`] };
    case 'is_empty':
      return { sql: `(${column} IS NULL OR ${column} = '')`, params: [] };
    case 'is_not_empty':
      return { sql: `(${column} IS NOT NULL AND ${column} != '')`, params: [] };
    default:
      return { sql: '', params: [] };
  }
}

module.exports = {
  getAudiences,
  getAudience,
  createAudience,
  updateAudience,
  deleteAudience,
  getAudienceContacts,
  addContactsToAudience,
  removeContactsFromAudience
};
