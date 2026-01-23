const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { getProfile, updateProfile, changePassword, getSubscription, getLiveChatSettings, updateLiveChatSettings } = require('../controllers/user/profile.controller');

router.use(authMiddleware);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);
router.get('/subscription', getSubscription);

// Live chat settings
router.get('/settings/livechat', getLiveChatSettings);
router.put('/settings/livechat', updateLiveChatSettings);

module.exports = router;
