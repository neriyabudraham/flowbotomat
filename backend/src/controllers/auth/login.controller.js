const db = require('../../config/database');
const { verifyPassword } = require('../../services/auth/hash.service');
const { generateAccessToken, generateRefreshToken } = require('../../services/auth/token.service');

// Rate limiting config
const MAX_ATTEMPTS = 5;           // Max failed attempts before lockout
const LOCKOUT_MINUTES = 5;        // Lockout duration in minutes
const ATTEMPT_WINDOW_MINUTES = 15; // Window to count attempts

// In-memory store for login attempts (resets on server restart)
// For production, consider using Redis
const loginAttempts = new Map();

/**
 * Check if IP/email is locked out
 */
function checkLockout(key) {
  const attempts = loginAttempts.get(key);
  if (!attempts) return { locked: false };
  
  const now = Date.now();
  
  // Check if lockout period has passed
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const remainingSeconds = Math.ceil((attempts.lockedUntil - now) / 1000);
    return { locked: true, remainingSeconds };
  }
  
  // Clean old attempts outside the window
  const windowStart = now - (ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  attempts.timestamps = attempts.timestamps.filter(t => t > windowStart);
  
  // Reset if lockout period passed
  if (attempts.lockedUntil && now >= attempts.lockedUntil) {
    attempts.lockedUntil = null;
    attempts.timestamps = [];
  }
  
  return { locked: false };
}

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(key) {
  const now = Date.now();
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, { timestamps: [], lockedUntil: null });
  }
  
  const attempts = loginAttempts.get(key);
  attempts.timestamps.push(now);
  
  // Clean old attempts
  const windowStart = now - (ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  attempts.timestamps = attempts.timestamps.filter(t => t > windowStart);
  
  // Check if should lock
  if (attempts.timestamps.length >= MAX_ATTEMPTS) {
    attempts.lockedUntil = now + (LOCKOUT_MINUTES * 60 * 1000);
    console.log(`[Auth] Locked out: ${key} for ${LOCKOUT_MINUTES} minutes`);
  }
  
  return attempts.timestamps.length;
}

/**
 * Clear attempts on successful login
 */
function clearAttempts(key) {
  loginAttempts.delete(key);
}

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const emailLower = email.toLowerCase();
    const rateLimitKey = `${emailLower}:${clientIP}`;

    // Check if locked out
    const lockStatus = checkLockout(rateLimitKey);
    if (lockStatus.locked) {
      const minutes = Math.ceil(lockStatus.remainingSeconds / 60);
      return res.status(429).json({ 
        error: `יותר מדי ניסיונות כושלים. נסה שוב בעוד ${minutes} דקות`,
        remainingSeconds: lockStatus.remainingSeconds,
        code: 'RATE_LIMITED'
      });
    }

    // Find user
    const result = await db.query(
      'SELECT id, email, password_hash, name, is_verified, is_active, role, language, theme FROM users WHERE email = $1',
      [emailLower]
    );

    const user = result.rows[0];

    if (!user) {
      recordFailedAttempt(rateLimitKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      const attemptCount = recordFailedAttempt(rateLimitKey);
      const remaining = MAX_ATTEMPTS - attemptCount;
      
      if (remaining > 0 && remaining <= 2) {
        return res.status(401).json({ 
          error: `סיסמה שגויה. נותרו ${remaining} ניסיונות לפני נעילה זמנית`
        });
      }
      
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if verified
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Email not verified', code: 'NOT_VERIFIED' });
    }

    // Check if active
    if (!user.is_active) {
      return res.status(403).json({ error: 'החשבון מושבת. פנה לתמיכה.', code: 'ACCOUNT_DISABLED' });
    }

    // Success - clear attempts and update last login
    clearAttempts(rateLimitKey);
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Generate tokens (include email and role in access token)
    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);

    // Return user data (without password)
    const { password_hash, ...userData } = user;

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: userData,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login };
