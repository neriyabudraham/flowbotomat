const db = require('../config/database');
const axios = require('axios');

class ValidationService {
  
  // Run validation by ID or inline config
  async runValidation(validationConfig, contact, variables = {}) {
    try {
      let config;
      
      // If it's a validation ID, fetch from DB
      if (typeof validationConfig === 'string') {
        const result = await db.query(
          'SELECT * FROM validations WHERE id = $1',
          [validationConfig]
        );
        if (result.rows.length === 0) {
          console.log('[Validation] Validation not found:', validationConfig);
          return true; // Default to true if validation not found
        }
        config = result.rows[0];
      } else {
        // Inline validation config
        config = validationConfig;
      }
      
      // Replace variables in URL and body
      let url = this.replaceVariables(config.api_url || config.apiUrl, contact, variables);
      let body = config.api_body || config.apiBody || '';
      if (body) {
        body = this.replaceVariables(body, contact, variables);
      }
      
      // Replace variables in headers
      let headers = config.api_headers || config.apiHeaders || {};
      if (typeof headers === 'string') {
        try { headers = JSON.parse(headers); } catch { headers = {}; }
      }
      headers = this.replaceVariablesInObject(headers, contact, variables);
      
      console.log('[Validation] Running:', config.name || 'inline');
      console.log('[Validation] URL:', url);
      
      // Execute API call
      const response = await this.executeApi(url, config.api_method || config.apiMethod || 'GET', headers, body);
      
      if (!response.success) {
        console.log('[Validation] API call failed:', response.error);
        return false; // API failed = validation failed
      }
      
      // Check condition
      const pathSource = config.path_source || config.pathSource || 'specific';
      const path = config.response_path || config.responsePath || '';
      const expected = config.expected_value || config.expectedValue;
      const comparison = config.comparison || 'equals';
      
      const passed = this.checkCondition(response.data, path, expected, comparison, pathSource);
      console.log('[Validation] Result:', passed ? '✅ PASSED' : '❌ FAILED');
      
      return passed;
    } catch (error) {
      console.error('[Validation] Error:', error.message);
      return false;
    }
  }
  
  // Execute API call
  async executeApi(url, method, headers, body) {
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
  
  // Get nested value from object (e.g., "data.user.isActive")
  getNestedValue(obj, path) {
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
  
  // Check condition
  checkCondition(data, path, expectedValue, comparison, pathSource = 'specific') {
    // If pathSource is 'full', use the entire data
    let actualValue;
    if (pathSource === 'full' || !path) {
      actualValue = typeof data === 'object' ? JSON.stringify(data) : data;
    } else {
      actualValue = this.getNestedValue(data, path);
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
  
  // Replace variables in string
  replaceVariables(text, contact, variables = {}) {
    if (!text) return text;
    
    let result = text;
    
    // Contact variables
    result = result.replace(/\{\{name\}\}/gi, contact?.display_name || '');
    result = result.replace(/\{\{contact_phone\}\}/gi, contact?.phone || '');
    result = result.replace(/\{\{phone\}\}/gi, contact?.phone || '');
    
    // Custom variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      result = result.replace(regex, value || '');
    }
    
    return result;
  }
  
  // Replace variables in object (recursively)
  replaceVariablesInObject(obj, contact, variables) {
    if (!obj) return obj;
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.replaceVariables(value, contact, variables);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.replaceVariablesInObject(value, contact, variables);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  // Filter list buttons based on validations
  async filterListButtons(buttons, contact, variables = {}) {
    const filteredButtons = [];
    
    for (const button of buttons) {
      // If no validation, include the button
      if (!button.validation && !button.validationId) {
        filteredButtons.push(button);
        continue;
      }
      
      // Run validation
      const validationConfig = button.validationId || button.validation;
      const passed = await this.runValidation(validationConfig, contact, variables);
      
      if (passed) {
        filteredButtons.push(button);
      } else {
        console.log('[Validation] Button filtered out:', button.title || button.label);
      }
    }
    
    return filteredButtons;
  }
  
  // Filter registration questions based on validations
  async filterQuestions(questions, contact, variables = {}) {
    const filteredQuestions = [];
    
    for (const question of questions) {
      // If no validation, include the question
      if (!question.validation && !question.validationId) {
        filteredQuestions.push(question);
        continue;
      }
      
      // Run validation
      const validationConfig = question.validationId || question.validation;
      const passed = await this.runValidation(validationConfig, contact, variables);
      
      if (passed) {
        filteredQuestions.push(question);
      } else {
        console.log('[Validation] Question skipped:', question.question?.substring(0, 30));
      }
    }
    
    return filteredQuestions;
  }
}

module.exports = new ValidationService();
