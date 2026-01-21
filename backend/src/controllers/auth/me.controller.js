const db = require('../../config/database');

/**
 * GET /api/auth/me
 */
const me = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.language, u.theme, u.created_at,
              p.name as plan_name, p.max_messages, p.max_flows, p.max_instances
       FROM users u
       LEFT JOIN plans p ON u.plan_id = p.id
       WHERE u.id = $1`,
      [userId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { me };
