const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listBots, getBot } = require('../controllers/bots/list.controller');
const { createBot, updateBot, saveFlow, deleteBot, selectBotToKeep, getPendingDeletionStatus } = require('../controllers/bots/manage.controller');
const { getBotStats, getBotUsers, getBotLogs, getBotStatsTimeline, exportBotStats } = require('../controllers/bots/stats.controller');
const { exportBot, importBot, duplicateBot } = require('../controllers/bots/export.controller');

router.use(authMiddleware);

// Downgrade/selection routes (must be before :botId routes)
router.get('/pending-deletion', getPendingDeletionStatus);
router.post('/keep/:botId', selectBotToKeep);

router.get('/', listBots);
router.post('/', createBot);
router.get('/:botId', getBot);
router.patch('/:botId', updateBot);
router.put('/:botId/flow', saveFlow);
router.delete('/:botId', deleteBot);

// Stats
router.get('/:botId/stats', getBotStats);
router.get('/:botId/stats/timeline', getBotStatsTimeline);
router.get('/:botId/stats/export', exportBotStats);
router.get('/:botId/users', getBotUsers);
router.get('/:botId/logs', getBotLogs);

// Export/Import
router.get('/:id/export', exportBot);
router.post('/import', importBot);
router.post('/:id/duplicate', duplicateBot);

module.exports = router;
