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
  createClientBot,
  importClientBot,
  duplicateClientBot,
  // New functions
  requestAccess,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getAccessibleAccounts,
  switchAccount,
  createLinkedAccount,
} = require('../controllers/experts/experts.controller');

router.use(authMiddleware);

// Account switcher
router.get('/accessible-accounts', getAccessibleAccounts);
router.post('/switch/:targetUserId', switchAccount);
router.post('/create-linked-account', createLinkedAccount);

// As client - manage who has access to my account
router.get('/my-experts', getMyExperts);
router.get('/pending-requests', getPendingRequests);
router.post('/invite', inviteExpert);
router.post('/approve/:requestId', approveRequest);
router.post('/reject/:requestId', rejectRequest);
router.put('/expert/:expertId/permissions', updateExpertPermissions);
router.delete('/expert/:expertId', removeExpert);

// As expert - manage accounts I have access to & request access
router.get('/my-clients', getMyClients);
router.post('/request-access', requestAccess);
router.delete('/client/:clientId/leave', leaveClient);
router.get('/client/:clientId/bots', getClientBots);
router.post('/client/:clientId/bots', createClientBot);
router.post('/client/:clientId/bots/import', importClientBot);
router.post('/client/:clientId/bots/duplicate/:botId', duplicateClientBot);

module.exports = router;
