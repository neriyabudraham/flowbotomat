const crypto = require('crypto');
const db = require('../config/database');

/**
 * Hash API key for storage/comparison
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * API Key Authentication Middleware
 */
async function apiKeyAuth(req, res, next) {
  try {
    // Get API key from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid API key',
        code: 'INVALID_API_KEY'
      });
    }
    
    const apiKey = authHeader.substring(7); // Remove 'Bearer '
    
    if (!apiKey || apiKey.length < 20) {
      return res.status(401).json({ 
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY'
      });
    }
    
    // Hash the key to compare
    const keyHash = hashApiKey(apiKey);
    
    // Find API key in database
    const result = await db.query(`
      SELECT 
        ak.*,
        u.id as owner_id,
        u.email as owner_email,
        us.status as subscription_status,
        sp.allow_api_access
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status IN ('active', 'trial')
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE ak.key_hash = $1 AND ak.is_active = true
    `, [keyHash]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }
    
    const keyData = result.rows[0];
    
    // Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({ 
        error: 'API key has expired',
        code: 'API_KEY_EXPIRED'
      });
    }
    
    // Check if user has API access (paid plan)
    if (!keyData.allow_api_access) {
      return res.status(403).json({ 
        error: 'API access requires a paid subscription',
        code: 'API_ACCESS_DENIED'
      });
    }
    
    // Update last used
    await db.query(
      'UPDATE api_keys SET last_used_at = NOW(), request_count = request_count + 1 WHERE id = $1',
      [keyData.id]
    );
    
    // Attach user info to request
    req.apiKey = {
      id: keyData.id,
      userId: keyData.user_id,
      name: keyData.name,
      permissions: keyData.permissions,
      rateLimit: keyData.rate_limit,
    };
    
    req.user = {
      id: keyData.user_id,
      email: keyData.owner_email,
    };
    
    // Store for logging
    req.apiKeyId = keyData.id;
    
    next();
  } catch (error) {
    console.error('[API Auth] Error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Check if API key has specific permission
 */
function checkPermission(permission) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const permissions = req.apiKey.permissions || [];
    
    if (!permissions.includes(permission) && !permissions.includes('*')) {
      return res.status(403).json({ 
        error: `Permission denied: ${permission}`,
        code: 'PERMISSION_DENIED'
      });
    }
    
    next();
  };
}

/**
 * Log API request
 */
async function logApiRequest(req, res, responseBody, duration) {
  try {
    if (!req.apiKeyId) return;
    
    await db.query(`
      INSERT INTO api_request_logs 
      (api_key_id, user_id, endpoint, method, status_code, request_body, response_body, ip_address, user_agent, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      req.apiKeyId,
      req.user?.id,
      req.originalUrl,
      req.method,
      res.statusCode,
      req.body ? JSON.stringify(req.body) : null,
      responseBody ? JSON.stringify(responseBody) : null,
      req.ip || req.connection?.remoteAddress,
      req.headers['user-agent'],
      duration
    ]);
  } catch (error) {
    console.error('[API Log] Error:', error);
  }
}

module.exports = {
  apiKeyAuth,
  checkPermission,
  logApiRequest,
  hashApiKey
};
