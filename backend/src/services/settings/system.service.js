const pool = require('../../config/database');
const { encrypt, decrypt } = require('../crypto/encrypt.service');

/**
 * Get a system setting
 */
async function getSetting(key) {
  const result = await pool.query(
    'SELECT value, is_encrypted FROM system_settings WHERE key = $1',
    [key]
  );
  
  if (result.rows.length === 0) return null;
  
  const { value, is_encrypted } = result.rows[0];
  return is_encrypted ? decrypt(value) : value;
}

/**
 * Set a system setting
 */
async function setSetting(key, value, isEncrypted = false) {
  const storedValue = isEncrypted ? encrypt(value) : value;
  
  await pool.query(
    `INSERT INTO system_settings (key, value, is_encrypted, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, is_encrypted = $3, updated_at = NOW()`,
    [key, storedValue, isEncrypted]
  );
}

/**
 * Get WAHA system credentials
 */
async function getWahaCredentials() {
  const baseUrl = await getSetting('waha_base_url');
  const apiKey = await getSetting('waha_api_key');
  return { baseUrl, apiKey };
}

module.exports = {
  getSetting,
  setSetting,
  getWahaCredentials,
};
