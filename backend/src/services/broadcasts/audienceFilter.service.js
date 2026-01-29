const db = require('../../config/database');

/**
 * Shared audience filtering logic for broadcast campaigns
 * This module provides consistent filtering across all places that need to get audience contacts
 */

/**
 * Get contacts for an audience (both static and dynamic)
 * @param {string} userId - User ID
 * @param {object} audience - Audience object with is_static, filter_criteria, id
 * @returns {Promise<Array>} Array of contacts with id, phone, display_name
 */
async function getAudienceContacts(userId, audience) {
  if (audience.is_static) {
    // Static audience - get from junction table
    const contactsResult = await db.query(`
      SELECT c.id, c.phone, c.display_name 
      FROM contacts c
      JOIN broadcast_audience_contacts bac ON bac.contact_id = c.id
      WHERE bac.audience_id = $1 AND c.is_blocked = false
    `, [audience.id]);
    return contactsResult.rows;
  } else {
    // Dynamic audience - apply filter criteria
    const { whereClause, params } = buildFilterQuery(userId, audience.filter_criteria);
    
    // Always exclude blocked contacts for campaigns
    const finalWhereClause = whereClause + ' AND c.is_blocked = false';
    
    const contactsResult = await db.query(`
      SELECT DISTINCT c.id, c.phone, c.display_name 
      FROM contacts c 
      ${finalWhereClause}
    `, params);
    
    return contactsResult.rows;
  }
}

/**
 * Calculate count of contacts in a dynamic audience
 * @param {string} userId - User ID
 * @param {object} filterCriteria - Filter criteria object
 * @returns {Promise<number>} Contact count
 */
async function calculateDynamicAudienceCount(userId, filterCriteria) {
  const { whereClause, params } = buildFilterQuery(userId, filterCriteria);
  
  const result = await db.query(
    `SELECT COUNT(DISTINCT c.id) FROM contacts c ${whereClause}`,
    params
  );
  
  return parseInt(result.rows[0].count);
}

/**
 * Build SQL WHERE clause from filter criteria
 * @param {string} userId - User ID
 * @param {object} filterCriteria - Filter criteria object
 * @returns {object} { whereClause, params }
 */
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
  getAudienceContacts,
  calculateDynamicAudienceCount,
  buildFilterQuery,
  buildOperatorClause
};
