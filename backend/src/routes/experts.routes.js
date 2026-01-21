const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const {
  getMyExperts,
  getMyClients,
  inviteExpert,
  updateExpertPermissions,
  removeExpert,
  leaveClient,
  getClientBots,
} = require('../controllers/experts/experts.controller');

router.use(authMiddleware);

// As client - manage who has access to my account
router.get('/my-experts', getMyExperts);
router.post('/invite', inviteExpert);
router.put('/expert/:expertId/permissions', updateExpertPermissions);
router.delete('/expert/:expertId', removeExpert);

// As expert - manage accounts I have access to
router.get('/my-clients', getMyClients);
router.delete('/client/:clientId/leave', leaveClient);
router.get('/client/:clientId/bots', getClientBots);

module.exports = router;
