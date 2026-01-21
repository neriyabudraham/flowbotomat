const db = require('../../config/database');
const { verifyRefreshToken, generateAccessToken } = require('../../services/auth/token.service');

/**
 * POST /api/auth/refresh
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Fetch user email and role for token
    const result = await db.query('SELECT email, role FROM users WHERE id = $1', [payload.userId]);
    const email = result.rows[0]?.email || null;
    const role = result.rows[0]?.role || 'user';

    const accessToken = generateAccessToken(payload.userId, email, role);

    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { refresh };
