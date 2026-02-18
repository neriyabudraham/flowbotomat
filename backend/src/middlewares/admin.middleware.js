const db = require('../config/database');

/**
 * Admin middleware - requires admin or superadmin role
 * Also allows access if user is viewing as another account (original user must be admin)
 */
const adminMiddleware = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const allowedRoles = ['admin', 'superadmin'];
  
  // Direct admin check
  if (allowedRoles.includes(req.user.role)) {
    return next();
  }
  
  // If viewing as another user, check if original user is admin
  if (req.user.viewingAs) {
    try {
      const result = await db.query(
        'SELECT role FROM users WHERE id = $1',
        [req.user.viewingAs]
      );
      
      if (result.rows[0] && allowedRoles.includes(result.rows[0].role)) {
        // Store original role for reference
        req.originalAdminRole = result.rows[0].role;
        return next();
      }
    } catch (err) {
      console.error('Error checking original user role:', err);
    }
  }
  
  return res.status(403).json({ error: 'Admin access required' });
};

/**
 * Superadmin only middleware
 * Also allows access if user is viewing as another account (original user must be superadmin)
 */
const superadminMiddleware = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Direct superadmin check
  if (req.user.role === 'superadmin') {
    return next();
  }
  
  // Check from previous middleware or query DB
  if (req.originalAdminRole === 'superadmin') {
    return next();
  }
  
  // If viewing as another user, check if original user is superadmin
  if (req.user.viewingAs) {
    try {
      const result = await db.query(
        'SELECT role FROM users WHERE id = $1',
        [req.user.viewingAs]
      );
      
      if (result.rows[0]?.role === 'superadmin') {
        return next();
      }
    } catch (err) {
      console.error('Error checking original user role:', err);
    }
  }

  return res.status(403).json({ error: 'Superadmin access required' });
};

module.exports = { adminMiddleware, superadminMiddleware };
