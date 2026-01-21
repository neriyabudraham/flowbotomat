const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const whatsappRoutes = require('./whatsapp.routes');
const webhookRoutes = require('./webhook.routes');
const contactsRoutes = require('./contacts.routes');
const statsRoutes = require('./stats.routes');
const userRoutes = require('./user.routes');
const botsRoutes = require('./bots.routes');
const utilsRoutes = require('./utils.routes');
const variablesRoutes = require('./variables.routes');
const templatesRoutes = require('./templates.routes');
const validationsRoutes = require('./validations.routes');
const adminRoutes = require('./admin.routes');
const sharingRoutes = require('./sharing.routes');
const notificationsRoutes = require('./notifications.routes');
const expertsRoutes = require('./experts.routes');
const subscriptionsRoutes = require('./subscriptions.routes');
const paymentRoutes = require('./payment.routes');
const uploadRoutes = require('./upload.routes');
const apiKeysRoutes = require('./apiKeys.routes');
const publicApiRoutes = require('./publicApi.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/webhook', webhookRoutes);
router.use('/contacts', contactsRoutes);
router.use('/stats', statsRoutes);
router.use('/user', userRoutes);
router.use('/bots', botsRoutes);
router.use('/utils', utilsRoutes);
router.use('/variables', variablesRoutes);
router.use('/templates', templatesRoutes);
router.use('/validations', validationsRoutes);
router.use('/admin', adminRoutes);
router.use('/sharing', sharingRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/experts', expertsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/payment', paymentRoutes);
router.use('/upload', uploadRoutes);
router.use('/api-keys', apiKeysRoutes);

// Public API (v1)
router.use('/v1', publicApiRoutes);

// API Documentation page at root /api
router.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlowBotomat API Documentation</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      color: white;
    }
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
    }
    .header p {
      opacity: 0.9;
      font-size: 1.1rem;
    }
    .version {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      margin-top: 10px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .card h2 {
      color: #1a1a2e;
      font-size: 1.3rem;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card h2::before {
      content: '';
      width: 4px;
      height: 24px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      border-radius: 2px;
    }
    .base-url {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 10px;
      font-family: monospace;
      font-size: 1rem;
      color: #6c5ce7;
      border: 1px solid #e9ecef;
      word-break: break-all;
    }
    .auth-box {
      background: linear-gradient(135deg, #fff3cd, #ffeaa7);
      padding: 16px;
      border-radius: 10px;
      border-right: 4px solid #f39c12;
    }
    .auth-box code {
      background: rgba(0,0,0,0.1);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .endpoints {
      display: grid;
      gap: 12px;
    }
    .endpoint {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: #f8f9fa;
      border-radius: 10px;
      transition: all 0.2s;
    }
    .endpoint:hover {
      background: #e9ecef;
      transform: translateX(-4px);
    }
    .method {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      min-width: 50px;
      text-align: center;
    }
    .method.get { background: #d4edda; color: #155724; }
    .method.post { background: #cce5ff; color: #004085; }
    .path {
      font-family: monospace;
      color: #495057;
      flex: 1;
    }
    .desc {
      color: #6c757d;
      font-size: 0.85rem;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      color: rgba(255,255,255,0.8);
    }
    .footer a {
      color: white;
      text-decoration: none;
      font-weight: 600;
    }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 FlowBotomat API</h1>
      <p>שלח הודעות WhatsApp ישירות מהמערכות שלך</p>
      <span class="version">v1.0.0</span>
    </div>

    <div class="card">
      <h2>Base URL</h2>
      <div class="base-url">https://flow.botomat.co.il/api/v1</div>
    </div>

    <div class="card">
      <h2>אימות</h2>
      <div class="auth-box">
        הוסף את ה-API Key שלך בכותרת Authorization:<br><br>
        <code>Authorization: Bearer YOUR_API_KEY</code>
      </div>
    </div>

    <div class="card">
      <h2>Endpoints - הודעות</h2>
      <div class="endpoints">
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/text</span>
          <span class="desc">שליחת הודעת טקסט</span>
        </div>
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/image</span>
          <span class="desc">שליחת תמונה</span>
        </div>
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/video</span>
          <span class="desc">שליחת סרטון</span>
        </div>
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/document</span>
          <span class="desc">שליחת מסמך</span>
        </div>
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/audio</span>
          <span class="desc">שליחת אודיו</span>
        </div>
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/list</span>
          <span class="desc">שליחת רשימת בחירה</span>
        </div>
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/messages/location</span>
          <span class="desc">שליחת מיקום</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Endpoints - אנשי קשר</h2>
      <div class="endpoints">
        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/contacts</span>
          <span class="desc">קבלת רשימת אנשי קשר</span>
        </div>
        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/contacts/:phone/messages</span>
          <span class="desc">קבלת הודעות של איש קשר</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Endpoints - סטטוס</h2>
      <div class="endpoints">
        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/status</span>
          <span class="desc">בדיקת סטטוס חיבור WhatsApp</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>לניהול מפתחות API, היכנס ל<a href="https://flow.botomat.co.il/api">לוח הבקרה</a></p>
    </div>
  </div>
</body>
</html>
  `);
});

module.exports = router;
