const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listBots, getBot } = require('../controllers/bots/list.controller');
const { createBot, updateBot, saveFlow, deleteBot } = require('../controllers/bots/manage.controller');

router.use(authMiddleware);

router.get('/', listBots);
router.post('/', createBot);
router.get('/:botId', getBot);
router.patch('/:botId', updateBot);
router.put('/:botId/flow', saveFlow);
router.delete('/:botId', deleteBot);

module.exports = router;
