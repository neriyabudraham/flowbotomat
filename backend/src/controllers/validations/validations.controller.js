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
      responsePath, expectedValue, comparison 
    } = req.body;
    
    if (!name || !apiUrl || !responsePath || expectedValue === undefined) {
      return res.status(400).json({ error: 'שדות חובה חסרים' });
    }
    
    const result = await db.query(
      `INSERT INTO validations 
       (user_id, name, description, api_url, api_method, api_headers, api_body, response_path, expected_value, comparison)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, name, description || '', apiUrl, apiMethod || 'GET', apiHeaders || {}, apiBody || '', responsePath, expectedValue, comparison || 'equals']
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
      responsePath, expectedValue, comparison 
    } = req.body;
    
    const result = await db.query(
      `UPDATE validations SET 
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       api_url = COALESCE($3, api_url),
       api_method = COALESCE($4, api_method),
       api_headers = COALESCE($5, api_headers),
       api_body = COALESCE($6, api_body),
       response_path = COALESCE($7, response_path),
       expected_value = COALESCE($8, expected_value),
       comparison = COALESCE($9, comparison),
       updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [name, description, apiUrl, apiMethod, apiHeaders, apiBody, responsePath, expectedValue, comparison, id, userId]
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
    const { apiUrl, apiMethod, apiHeaders, apiBody, responsePath, expectedValue, comparison } = req.body;
    
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
    const passed = checkCondition(result.data, responsePath, expectedValue, comparison);
    
    res.json({ 
      success: true, 
      response: result.data,
      extractedValue: getNestedValue(result.data, responsePath),
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
function checkCondition(data, path, expectedValue, comparison) {
  const actualValue = getNestedValue(data, path);
  const actual = String(actualValue ?? '');
  const expected = String(expectedValue ?? '');
  
  switch (comparison) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return actual.includes(expected);
    case 'greater_than':
      return parseFloat(actual) > parseFloat(expected);
    case 'less_than':
      return parseFloat(actual) < parseFloat(expected);
    case 'exists':
      return actualValue !== undefined && actualValue !== null;
    case 'not_exists':
      return actualValue === undefined || actualValue === null;
    case 'is_true':
      return actualValue === true || actual === 'true' || actual === '1';
    case 'is_false':
      return actualValue === false || actual === 'false' || actual === '0';
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
