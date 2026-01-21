const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { getProfile, updateProfile, changePassword, getSubscription } = require('../controllers/user/profile.controller');

router.use(authMiddleware);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);
router.get('/subscription', getSubscription);

module.exports = router;
