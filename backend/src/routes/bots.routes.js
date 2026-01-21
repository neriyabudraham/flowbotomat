const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listBots, getBot } = require('../controllers/bots/list.controller');
const { createBot, updateBot, saveFlow, deleteBot } = require('../controllers/bots/manage.controller');
const { getBotStats, getBotUsers, getBotLogs } = require('../controllers/bots/stats.controller');

router.use(authMiddleware);

router.get('/', listBots);
router.post('/', createBot);
router.get('/:botId', getBot);
router.patch('/:botId', updateBot);
router.put('/:botId/flow', saveFlow);
router.delete('/:botId', deleteBot);

// Stats
router.get('/:botId/stats', getBotStats);
router.get('/:botId/users', getBotUsers);
router.get('/:botId/logs', getBotLogs);

module.exports = router;
