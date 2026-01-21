const db = require('../../config/database');
const axios = require('axios');

// Get all validations for user
async function getValidations(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      'SELECT * FROM validations WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    
    res.json({ validations: result.rows });
  } catch (error) {
    console.error('[Validations] Error listing:', error);
    res.status(500).json({ error: 'שגיאה בטעינת אימותים' });
  }
}

// Create validation
async function createValidation(req, res) {
  try {
    const userId = req.user.id;
    const { 
      name, description, 
      apiUrl, apiMethod, apiHeaders, apiBody,
      pathSource, responsePath, expectedValue, comparison 
    } = req.body;
    
    if (!name || !apiUrl) {
      return res.status(400).json({ error: 'שם ו-URL חובה' });
    }
    
    // If pathSource is 'specific', responsePath is required
    if (pathSource === 'specific' && !responsePath) {
      return res.status(400).json({ error: 'נתיב בתגובה חובה עבור נתיב ספציפי' });
    }
    
    const result = await db.query(
      `INSERT INTO validations 
       (user_id, name, description, api_url, api_method, api_headers, api_body, path_source, response_path, expected_value, comparison)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, name, description || '', apiUrl, apiMethod || 'GET', apiHeaders || {}, apiBody || '', pathSource || 'specific', responsePath || '', expectedValue || '', comparison || 'equals']
    );
    
    res.status(201).json({ validation: result.rows[0] });
  } catch (error) {
    console.error('[Validations] Error creating:', error);
    res.status(500).json({ error: 'שגיאה ביצירת אימות' });
  }
}

// Update validation
async function updateValidation(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { 
      name, description, 
      apiUrl, apiMethod, apiHeaders, apiBody,
      pathSource, responsePath, expectedValue, comparison 
    } = req.body;
    
    const result = await db.query(
      `UPDATE validations SET 
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       api_url = COALESCE($3, api_url),
       api_method = COALESCE($4, api_method),
       api_headers = COALESCE($5, api_headers),
       api_body = COALESCE($6, api_body),
       path_source = COALESCE($7, path_source),
       response_path = COALESCE($8, response_path),
       expected_value = COALESCE($9, expected_value),
       comparison = COALESCE($10, comparison),
       updated_at = NOW()
       WHERE id = $11 AND user_id = $12
       RETURNING *`,
      [name, description, apiUrl, apiMethod, apiHeaders, apiBody, pathSource, responsePath, expectedValue, comparison, id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'אימות לא נמצא' });
    }
    
    res.json({ validation: result.rows[0] });
  } catch (error) {
    console.error('[Validations] Error updating:', error);
    res.status(500).json({ error: 'שגיאה בעדכון אימות' });
  }
}

// Delete validation
async function deleteValidation(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(
      'DELETE FROM validations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'אימות לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Validations] Error deleting:', error);
    res.status(500).json({ error: 'שגיאה במחיקת אימות' });
  }
}

// Test validation (run API and check condition)
async function testValidation(req, res) {
  try {
    const { apiUrl, apiMethod, apiHeaders, apiBody, pathSource, responsePath, expectedValue, comparison } = req.body;
    
    // Execute API call
    const result = await executeValidationApi(apiUrl, apiMethod, apiHeaders, apiBody);
    
    if (!result.success) {
      return res.json({ 
        success: false, 
        error: result.error,
        passed: false 
      });
    }
    
    // Check condition
    const passed = checkCondition(result.data, pathSource, responsePath, expectedValue, comparison);
    
    // Get extracted value for display
    let extractedValue;
    if (pathSource === 'full' || !responsePath) {
      extractedValue = typeof result.data === 'object' ? JSON.stringify(result.data).substring(0, 200) : result.data;
    } else {
      extractedValue = getNestedValue(result.data, responsePath);
    }
    
    res.json({ 
      success: true, 
      response: result.data,
      extractedValue,
      passed 
    });
  } catch (error) {
    console.error('[Validations] Error testing:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת אימות' });
  }
}

// Helper: Execute validation API call
async function executeValidationApi(url, method, headers, body) {
  try {
    const config = {
      method: method || 'GET',
      url,
      headers: headers || {},
      timeout: 10000
    };
    
    if (body && ['POST', 'PUT', 'PATCH'].includes(method?.toUpperCase())) {
      try {
        config.data = JSON.parse(body);
      } catch {
        config.data = body;
      }
    }
    
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data?.message || error.message 
    };
  }
}

// Helper: Get nested value from object
function getNestedValue(obj, path) {
  if (!path) return obj;
  
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    
    // Handle array notation like "data[0]"
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      value = value[arrayMatch[1]];
      if (Array.isArray(value)) {
        value = value[parseInt(arrayMatch[2])];
      }
    } else {
      value = value[key];
    }
  }
  
  return value;
}

// Helper: Check condition
function checkCondition(data, pathSource, path, expectedValue, comparison) {
  // If pathSource is 'full', use the entire data
  let actualValue;
  if (pathSource === 'full' || !path) {
    actualValue = typeof data === 'object' ? JSON.stringify(data) : data;
  } else {
    actualValue = getNestedValue(data, path);
  }
  
  const actual = String(actualValue ?? '');
  const expected = String(expectedValue ?? '');
  
  switch (comparison) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return actual.toLowerCase().includes(expected.toLowerCase());
    case 'not_contains':
      return !actual.toLowerCase().includes(expected.toLowerCase());
    case 'starts_with':
      return actual.toLowerCase().startsWith(expected.toLowerCase());
    case 'ends_with':
      return actual.toLowerCase().endsWith(expected.toLowerCase());
    case 'greater_than':
      return parseFloat(actual) > parseFloat(expected);
    case 'greater_equal':
      return parseFloat(actual) >= parseFloat(expected);
    case 'less_than':
      return parseFloat(actual) < parseFloat(expected);
    case 'less_equal':
      return parseFloat(actual) <= parseFloat(expected);
    case 'exists':
      return actualValue !== undefined && actualValue !== null;
    case 'not_exists':
      return actualValue === undefined || actualValue === null;
    case 'is_empty':
      return actualValue === undefined || actualValue === null || actual === '' || actual === '[]' || actual === '{}';
    case 'not_empty':
      return actualValue !== undefined && actualValue !== null && actual !== '' && actual !== '[]' && actual !== '{}';
    case 'is_true':
      return actualValue === true || actual === 'true' || actual === '1';
    case 'is_false':
      return actualValue === false || actual === 'false' || actual === '0';
    case 'regex':
      try {
        const regex = new RegExp(expected);
        return regex.test(actual);
      } catch {
        return false;
      }
    default:
      return actual === expected;
  }
}

module.exports = {
  getValidations,
  createValidation,
  updateValidation,
  deleteValidation,
  testValidation,
  // Export helpers for use in botEngine
  executeValidationApi,
  checkCondition,
  getNestedValue
};
