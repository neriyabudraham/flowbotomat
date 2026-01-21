const db = require('../../config/database');
const { verifyPassword } = require('../../services/auth/hash.service');
const { generateAccessToken, generateRefreshToken } = require('../../services/auth/token.service');

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await db.query(
      'SELECT id, email, password_hash, name, is_verified, is_active, role, language, theme FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if verified
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Email not verified', code: 'NOT_VERIFIED' });
    }

    // Check if active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    // Update last login
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
