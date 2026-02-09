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

// Schedule campaign scheduler - run every minute
const { processScheduledCampaigns } = require('./services/broadcasts/scheduler.service');

cron.schedule('* * * * *', async () => {
  try {
    await processScheduledCampaigns();
  } catch (err) {
    console.error('[Cron] Campaign scheduler failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Campaign scheduler cron job running every minute');

// Schedule cleanup of old pending forward jobs - run every hour
const { cleanupOldPendingJobs } = require('./controllers/groupForwards/jobs.controller');

cron.schedule('0 * * * *', async () => {
  try {
    const cancelled = await cleanupOldPendingJobs();
    if (cancelled > 0) {
      console.log(`[Cron] Cleaned up ${cancelled} old pending forward jobs`);
    }
  } catch (err) {
    console.error('[Cron] Forward jobs cleanup failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Forward jobs cleanup cron job scheduled (hourly)');

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 FlowBotomat Backend running on port ${PORT}`);
  
  // Resume stuck jobs after server starts (wait for DB connections to stabilize)
  setTimeout(async () => {
    try {
      const { resumeStuckForwardJobs } = require('./controllers/groupForwards/jobs.controller');
      const { resumeStuckBroadcastCampaigns } = require('./services/broadcasts/sender.service');
      
      console.log('[Startup] Checking for stuck jobs to resume...');
      await resumeStuckForwardJobs();
      await resumeStuckBroadcastCampaigns();
      console.log('[Startup] Stuck jobs check complete');
    } catch (err) {
      console.error('[Startup] Error resuming stuck jobs:', err.message);
    }
  }, 5000);
});
