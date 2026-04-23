const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/saveContactBot/saveContactBot.controller');

router.use(authenticate, ctrl.requireServiceAccess);

router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.saveProfile);
router.delete('/profile', ctrl.deleteProfile);

router.post('/profile/generate-link', ctrl.generateLink);

router.post('/sequence-steps', ctrl.addStep);
router.put('/sequence-steps/:stepId', ctrl.updateStep);
router.delete('/sequence-steps/:stepId', ctrl.deleteStep);
router.post('/sequence-steps/reorder', ctrl.reorderSteps);

router.get('/received-requests', ctrl.listReceivedRequests);

router.get('/google-contacts/status', ctrl.getGoogleContactsStatus);
router.get('/google-contacts/auth-url', ctrl.getGoogleContactsAuthUrl);
router.delete('/google-contacts/slot/:slot', ctrl.disconnectGoogleSlot);
router.post('/google-contacts/slot/:slot/primary', ctrl.setPrimaryGoogleSlot);
router.post('/google-contacts/sync-pending', ctrl.syncPending);

router.get('/received-requests/history', ctrl.getContactHistory);
router.get('/received-requests/export.vcf', ctrl.exportVcf);

router.get('/usage', ctrl.getUsage);

router.get('/sequence', ctrl.getSequence);
router.post('/sequence/reorder', ctrl.reorderUnified);
router.post('/sequence/welcome/delete', ctrl.deleteWelcome);
router.post('/sequence/welcome/restore', ctrl.restoreDefaultWelcome);

module.exports = router;
