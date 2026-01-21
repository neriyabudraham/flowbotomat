const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { getProfile, updateProfile, changePassword } = require('../controllers/user/profile.controller');

router.use(authMiddleware);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);

module.exports = router;
