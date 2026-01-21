/**
 * Admin middleware - requires admin or superadmin role
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const allowedRoles = ['admin', 'superadmin'];
  
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

/**
 * Superadmin only middleware
 */
const superadminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }

  next();
};

module.exports = { adminMiddleware, superadminMiddleware };
