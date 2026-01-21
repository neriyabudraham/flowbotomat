const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');

// Controllers
const usersController = require('../controllers/admin/users.controller');
const settingsController = require('../controllers/admin/settings.controller');
const backupsController = require('../controllers/admin/backups.controller');

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard stats
router.get('/stats', usersController.getStats);

// Users management
router.get('/users', usersController.getUsers);
router.get('/users/:id', usersController.getUser);
router.put('/users/:id', usersController.updateUser);
router.delete('/users/:id', superadminMiddleware, usersController.deleteUser);

// System settings (superadmin only for updates)
router.get('/settings', settingsController.getSettings);
router.put('/settings/:key', superadminMiddleware, settingsController.updateSetting);

// Logs
router.get('/logs', settingsController.getLogs);

// Backups (superadmin only)
router.get('/backups', superadminMiddleware, backupsController.listBackups);
router.post('/backups', superadminMiddleware, backupsController.createBackup);
router.get('/backups/:filename', superadminMiddleware, backupsController.downloadBackup);
router.delete('/backups/:filename', superadminMiddleware, backupsController.deleteBackup);

module.exports = router;
