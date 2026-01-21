const express = require('express');
const router = express.Router();
const { apiKeyAuth, checkPermission } = require('../middlewares/apiKey.middleware');
const {
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
  sendAudioMessage,
  sendButtonsMessage,
  sendListMessage,
  sendLocationMessage,
  getContacts,
  getMessages,
  getStatus,
} = require('../controllers/api/messaging.controller');

// API Info (public - no auth required)
router.get('/', (req, res) => {
  res.json({
    name: 'FlowBotomat API',
    version: '1.0.0',
    documentation: 'https://flow.botomat.co.il/api',
    endpoints: {
      messages: {
        text: 'POST /v1/messages/text',
        image: 'POST /v1/messages/image',
        video: 'POST /v1/messages/video',
        document: 'POST /v1/messages/document',
        audio: 'POST /v1/messages/audio',
        list: 'POST /v1/messages/list',
        location: 'POST /v1/messages/location',
      },
      contacts: {
        list: 'GET /v1/contacts',
        messages: 'GET /v1/contacts/:phone/messages',
      },
      status: 'GET /v1/status',
    },
    authentication: 'Bearer token in Authorization header',
    baseUrl: 'https://flow.botomat.co.il/api/v1',
  });
});

// All other routes require API key authentication
router.use(apiKeyAuth);

// ===== STATUS =====
router.get('/status', getStatus);

// ===== MESSAGING =====
// Send text message
router.post('/messages/text', checkPermission('send_message'), sendTextMessage);

// Send image
router.post('/messages/image', checkPermission('send_image'), sendImageMessage);

// Send video
router.post('/messages/video', checkPermission('send_video'), sendVideoMessage);

// Send document
router.post('/messages/document', checkPermission('send_document'), sendDocumentMessage);

// Send audio
router.post('/messages/audio', checkPermission('send_audio'), sendAudioMessage);

// Buttons not supported by GOWS engine
// router.post('/messages/buttons', checkPermission('send_buttons'), sendButtonsMessage);

// Send list
router.post('/messages/list', checkPermission('send_list'), sendListMessage);

// Send location
router.post('/messages/location', checkPermission('send_message'), sendLocationMessage);

// ===== CONTACTS =====
// Get contacts
router.get('/contacts', checkPermission('get_contacts'), getContacts);

// Get messages for a contact
router.get('/contacts/:phone/messages', checkPermission('get_messages'), getMessages);

module.exports = router;
