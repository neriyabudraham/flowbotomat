require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const cron = require('node-cron');
const path = require('path');

const routes = require('./routes');
const { initSocket } = require('./services/socket/manager.service');
const { runBillingTasks } = require('./services/payment/billing.service');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api', routes);

// Serve uploaded files under /api/uploads (so it goes through nginx api proxy)
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize Socket.io
initSocket(server);

// Schedule billing tasks - run daily at 8:00 AM Israel time
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Running daily billing tasks...');
  await runBillingTasks();
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Billing cron job scheduled for 8:00 AM daily');

// Schedule subscription expiry check - run every hour
const { handleExpiredSubscriptions, sendTrialExpiryReminders } = require('./services/subscription/expiry.service');

cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Checking expired subscriptions...');
  try {
    await handleExpiredSubscriptions();
  } catch (err) {
    console.error('[Cron] Subscription expiry check failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

// Send trial reminders - run daily at 10:00 AM
cron.schedule('0 10 * * *', async () => {
  console.log('[Cron] Sending trial expiry reminders...');
  try {
    await sendTrialExpiryReminders();
  } catch (err) {
    console.error('[Cron] Trial reminder failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Subscription expiry cron jobs scheduled');

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 FlowBotomat Backend running on port ${PORT}`);
});
