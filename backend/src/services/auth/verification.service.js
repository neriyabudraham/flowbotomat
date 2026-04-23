const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');

// Brute-force mitigations:
//  - Short expiry so a stolen code has a narrow window
//  - Per-code attempt cap (attempts column) so guessing the 6-digit code is bounded
//  - Per-user resend cap so attackers can't just rotate new codes
const TOKEN_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS_PER_CODE = 5;   // how many wrong guesses we accept on the same code
const MAX_RESENDS_PER_HOUR = 5;    // how many new codes we'll issue per user per hour

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
 * Validate verification by token or code.
 * Returns the row on success. On a wrong code/email miss, returns null — caller
 * should call recordFailedAttempt if the caller knows which row to blame.
 */
const validateVerification = async (token, code, email) => {
  let query, params;

  if (token) {
    query = `SELECT vt.*, u.email FROM verification_tokens vt
             JOIN users u ON vt.user_id = u.id
             WHERE vt.token = $1 AND vt.used_at IS NULL AND vt.expires_at > NOW()
               AND vt.attempts < $2`;
    params = [token, MAX_ATTEMPTS_PER_CODE];
  } else if (code && email) {
    query = `SELECT vt.*, u.email FROM verification_tokens vt
             JOIN users u ON vt.user_id = u.id
             WHERE vt.code = $1 AND u.email = $2 AND vt.used_at IS NULL AND vt.expires_at > NOW()
               AND vt.attempts < $3`;
    params = [code, email, MAX_ATTEMPTS_PER_CODE];
  } else {
    return null;
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
};

/**
 * Increment attempt counter on the latest non-used token for this user+type,
 * so brute-forcing a 6-digit code by trying different (code,email) pairs
 * can't go past MAX_ATTEMPTS_PER_CODE per active code.
 */
const recordFailedAttemptByEmail = async (email, type) => {
  await db.query(
    `UPDATE verification_tokens vt
        SET attempts = vt.attempts + 1
      FROM users u
      WHERE vt.user_id = u.id
        AND u.email = $1
        AND vt.type = $2
        AND vt.used_at IS NULL
        AND vt.expires_at > NOW()`,
    [email, type]
  );
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
 * Check resend attempts — limits how many new codes we issue per user per hour.
 */
const checkAttempts = async (userId, type) => {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM verification_tokens
     WHERE user_id = $1 AND type = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId, type]
  );
  return parseInt(result.rows[0].count) < MAX_RESENDS_PER_HOUR;
};

module.exports = {
  createVerification,
  validateVerification,
  recordFailedAttemptByEmail,
  markAsUsed,
  checkAttempts,
  generateCode,
  MAX_ATTEMPTS_PER_CODE,
};
