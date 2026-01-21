const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');

const TOKEN_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 2;

/**
 * Generate 6-digit code
 */
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create verification token and code
 */
const createVerification = async (userId, type) => {
  const token = uuidv4();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await db.query(
    `INSERT INTO verification_tokens (user_id, token, code, type, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, token, code, type, expiresAt]
  );

  return { token, code };
};

/**
 * Validate verification by token or code
 */
const validateVerification = async (token, code, email) => {
  let query, params;

  if (token) {
    query = `SELECT vt.*, u.email FROM verification_tokens vt
             JOIN users u ON vt.user_id = u.id
             WHERE vt.token = $1 AND vt.used_at IS NULL AND vt.expires_at > NOW()`;
    params = [token];
  } else if (code && email) {
    query = `SELECT vt.*, u.email FROM verification_tokens vt
             JOIN users u ON vt.user_id = u.id
             WHERE vt.code = $1 AND u.email = $2 AND vt.used_at IS NULL AND vt.expires_at > NOW()`;
    params = [code, email];
  } else {
    return null;
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
};

/**
 * Mark verification as used
 */
const markAsUsed = async (tokenId) => {
  await db.query(
    'UPDATE verification_tokens SET used_at = NOW() WHERE id = $1',
    [tokenId]
  );
};

/**
 * Check resend attempts
 */
const checkAttempts = async (userId, type) => {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM verification_tokens
     WHERE user_id = $1 AND type = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId, type]
  );
  return parseInt(result.rows[0].count) < MAX_ATTEMPTS;
};

module.exports = {
  createVerification,
  validateVerification,
  markAsUsed,
  checkAttempts,
  generateCode,
};
