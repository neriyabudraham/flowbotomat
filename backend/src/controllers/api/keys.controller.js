const crypto = require('crypto');
const db = require('../../config/database');
const { hashApiKey } = require('../../middlewares/apiKey.middleware');

/**
 * Generate a new API key
 */
function generateApiKey() {
  const prefix = 'sk_live_';
  const randomPart = crypto.randomBytes(32).toString('hex');
  return prefix + randomPart;
}

/**
 * Get all API keys for user
 */
async function getApiKeys(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        id, name, key_prefix, permissions, is_active, 
        last_used_at, expires_at, request_count, rate_limit, 
        created_at, updated_at
      FROM api_keys 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);
    
    res.json({ apiKeys: result.rows });
  } catch (error) {
    console.error('[API Keys] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מפתחות API' });
  }
}

/**
 * Create new API key
 */
async function createApiKey(req, res) {
  try {
    const userId = req.user.id;
    const { name, permissions, expiresAt } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'נדרש שם למפתח' });
    }
    
    // Check if user has API access (paid plan)
    const accessResult = await db.query(`
      SELECT sp.allow_api_access 
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status IN ('active', 'trial')
    `, [userId]);
    
    if (accessResult.rows.length === 0 || !accessResult.rows[0].allow_api_access) {
      return res.status(403).json({ 
        error: 'גישת API זמינה רק למנויים בתשלום',
        code: 'API_ACCESS_DENIED'
      });
    }
    
    // Generate new key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 15); // Show first 15 chars
    
    // Default permissions
    const defaultPermissions = [
      'send_message', 
      'send_image', 
      'send_video', 
      'send_document', 
      'send_audio',
      'send_list', 
      'send_buttons',
      'get_contacts',
      'get_messages'
    ];
    
    const finalPermissions = permissions || defaultPermissions;
    
    // Insert key
    const result = await db.query(`
      INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, key_prefix, permissions, is_active, expires_at, created_at
    `, [userId, name.trim(), keyHash, keyPrefix, JSON.stringify(finalPermissions), expiresAt || null]);
    
    // Return the key ONLY on creation (never again)
    res.json({ 
      apiKey: {
        ...result.rows[0],
        key: apiKey, // Only returned once!
      },
      message: 'שמור את המפתח! הוא לא יוצג שוב.'
    });
    
  } catch (error) {
    console.error('[API Keys] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת מפתח API' });
  }
}

/**
 * Update API key
 */
async function updateApiKey(req, res) {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    const { name, permissions, isActive, expiresAt, rateLimit } = req.body;
    
    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (permissions !== undefined) {
      updates.push(`permissions = $${paramCount++}`);
      values.push(JSON.stringify(permissions));
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }
    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${paramCount++}`);
      values.push(expiresAt);
    }
    if (rateLimit !== undefined) {
      updates.push(`rate_limit = $${paramCount++}`);
      values.push(rateLimit);
    }
    
    updates.push(`updated_at = NOW()`);
    
    values.push(keyId, userId);
    
    const result = await db.query(`
      UPDATE api_keys 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount++} AND user_id = $${paramCount}
      RETURNING id, name, key_prefix, permissions, is_active, expires_at, rate_limit, updated_at
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'מפתח לא נמצא' });
    }
    
    res.json({ apiKey: result.rows[0] });
  } catch (error) {
    console.error('[API Keys] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מפתח' });
  }
}

/**
 * Delete API key
 */
async function deleteApiKey(req, res) {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    
    const result = await db.query(
      'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
      [keyId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'מפתח לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[API Keys] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת מפתח' });
  }
}

/**
 * Get API usage stats
 */
async function getApiStats(req, res) {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    
    // Total requests
    const totalResult = await db.query(`
      SELECT COUNT(*) as total
      FROM api_request_logs 
      WHERE api_key_id = $1 AND user_id = $2
    `, [keyId, userId]);
    
    // Requests today
    const todayResult = await db.query(`
      SELECT COUNT(*) as today
      FROM api_request_logs 
      WHERE api_key_id = $1 AND user_id = $2 AND created_at > CURRENT_DATE
    `, [keyId, userId]);
    
    // Requests by endpoint
    const endpointsResult = await db.query(`
      SELECT endpoint, COUNT(*) as count
      FROM api_request_logs 
      WHERE api_key_id = $1 AND user_id = $2
      GROUP BY endpoint
      ORDER BY count DESC
      LIMIT 10
    `, [keyId, userId]);
    
    // Recent requests
    const recentResult = await db.query(`
      SELECT endpoint, method, status_code, duration_ms, created_at
      FROM api_request_logs 
      WHERE api_key_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `, [keyId, userId]);
    
    res.json({
      total: parseInt(totalResult.rows[0]?.total || 0),
      today: parseInt(todayResult.rows[0]?.today || 0),
      byEndpoint: endpointsResult.rows,
      recent: recentResult.rows,
    });
  } catch (error) {
    console.error('[API Keys] Stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Regenerate API key
 */
async function regenerateApiKey(req, res) {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    
    // Check if key exists
    const existingResult = await db.query(
      'SELECT id, name FROM api_keys WHERE id = $1 AND user_id = $2',
      [keyId, userId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'מפתח לא נמצא' });
    }
    
    // Generate new key
    const newApiKey = generateApiKey();
    const newKeyHash = hashApiKey(newApiKey);
    const newKeyPrefix = newApiKey.substring(0, 15);
    
    // Update
    await db.query(`
      UPDATE api_keys 
      SET key_hash = $1, key_prefix = $2, updated_at = NOW()
      WHERE id = $3 AND user_id = $4
    `, [newKeyHash, newKeyPrefix, keyId, userId]);
    
    res.json({ 
      key: newApiKey,
      keyPrefix: newKeyPrefix,
      message: 'המפתח חודש! שמור את המפתח החדש.'
    });
  } catch (error) {
    console.error('[API Keys] Regenerate error:', error);
    res.status(500).json({ error: 'שגיאה בחידוש מפתח' });
  }
}

module.exports = {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  getApiStats,
  regenerateApiKey
};
