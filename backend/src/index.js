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
const billingQueueService = require('./services/payment/billingQueue.service');

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

// Schedule billing queue processing - run daily at 9:00 AM Israel time (self-managed billing)
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] Processing billing queue...');
  try {
    const queueResult = await billingQueueService.processQueue();
    console.log(`[Cron] Billing queue processed: ${queueResult.processed} charges, ${queueResult.successful} successful, ${queueResult.failed} failed`);
    
    // Also process failed charge retries
    const retryResult = await billingQueueService.retryFailedCharges();
    console.log(`[Cron] Failed charge retries: ${retryResult.retried} retried, ${retryResult.successful} successful`);
  } catch (err) {
    console.error('[Cron] Billing queue processing failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Billing queue processing scheduled for 9:00 AM daily');

// Schedule subscription expiry check - run every hour
const { handleExpiredSubscriptions, sendTrialExpiryReminders, handleExpiringManualSubscriptions, handleExpiredServiceSubscriptions, handleExpiringServiceSubscriptions } = require('./services/subscription/expiry.service');

cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Checking expired subscriptions...');
  try {
    await handleExpiredSubscriptions();
    // Also check service subscriptions (Status Bot, etc.)
    await handleExpiredServiceSubscriptions();
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

// Check manual subscriptions expiring soon - run daily at 10:30 AM
cron.schedule('30 10 * * *', async () => {
  console.log('[Cron] Checking expiring manual subscriptions...');
  try {
    await handleExpiringManualSubscriptions();
    // Also check service subscriptions (Status Bot, etc.)
    await handleExpiringServiceSubscriptions();
  } catch (err) {
    console.error('[Cron] Manual expiry check failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Subscription expiry cron jobs scheduled (including Status Bot)');

// Schedule campaign scheduler - run every 10 seconds for fast response
const { startScheduler } = require('./services/broadcasts/scheduler.service');

// Start the scheduler with 10-second interval for faster campaign pickup
startScheduler(10000);

console.log('📅 Campaign scheduler running every 10 seconds');

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

// Schedule scheduled forwards processor - run every minute
const { processScheduledForwards } = require('./controllers/groupForwards/scheduled.controller');

cron.schedule('* * * * *', async () => {
  try {
    await processScheduledForwards();
  } catch (err) {
    console.error('[Cron] Scheduled forwards processing failed:', err.message);
  }
}, {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Scheduled forwards processor started (every minute)');

// Schedule session timeout checker - run every 30 seconds
const db = require('./config/database');
const BotEngine = require('./services/botEngine.service');

cron.schedule('*/30 * * * * *', async () => {
  try {
    // Find expired sessions
    const result = await db.query(
      `SELECT bs.*, b.flow_data, b.user_id, b.name as bot_name
       FROM bot_sessions bs
       JOIN bots b ON b.id = bs.bot_id
       WHERE bs.expires_at IS NOT NULL AND bs.expires_at < NOW()`
    );
    
    if (result.rows.length === 0) return;
    
    const botEngine = new BotEngine();
    
    for (const session of result.rows) {
      try {
        const flowData = session.flow_data;
        if (!flowData) continue;
        
        const currentNode = flowData.nodes?.find(n => n.id === session.current_node_id);
        if (!currentNode) continue;
        
        // Clear the expired session
        await db.query('DELETE FROM bot_sessions WHERE bot_id = $1 AND contact_id = $2', [session.bot_id, session.contact_id]);
        
        // Find timeout edge
        const timeoutEdge = flowData.edges?.find(e => 
          e.source === currentNode.id && e.sourceHandle === 'timeout'
        );
        
        if (timeoutEdge) {
          // Get contact info
          const contactResult = await db.query('SELECT * FROM contacts WHERE id = $1', [session.contact_id]);
          const contact = contactResult.rows[0];
          if (contact) {
            console.log(`[SessionTimeout] ⏰ Executing timeout path for contact ${contact.phone}, bot ${session.bot_name}`);
            await botEngine.executeNode(timeoutEdge.target, flowData, contact, '', session.user_id, session.bot_id, session.bot_name);
          }
        } else {
          console.log(`[SessionTimeout] No timeout edge found for node ${currentNode.id}, session cleared`);
        }
      } catch (err) {
        console.error('[SessionTimeout] Error handling expired session:', err.message);
      }
    }
  } catch (err) {
    // Silently ignore - table might not exist yet
  }
});

console.log('📅 Session timeout checker running every 30 seconds');

// Start Status Bot queue processor (only if enabled - separate container handles this by default)
const enableQueueProcessor = process.env.ENABLE_QUEUE_PROCESSOR !== 'false';
if (enableQueueProcessor) {
  const { startQueueProcessor } = require('./services/statusBot/queue.service');
  startQueueProcessor();
  console.log('📅 Status Bot queue processor started');
} else {
  console.log('📅 Status Bot queue processor disabled (running in separate container)');
}

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Botomat Backend running on port ${PORT}`);

  // Run pending migrations on startup
  setTimeout(async () => {
    const { query: dbQuery } = require('./config/database');
    try {
      // Contacts optimization: last_message column + indexes
      await dbQuery(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message TEXT`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_messages_contact_sent ON messages(contact_id, sent_at DESC)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_contacts_user_last_msg ON contacts(user_id, last_message_at DESC NULLS LAST)`);
      // Backfill last_message for contacts that don't have it yet
      await dbQuery(`
        UPDATE contacts c SET last_message = (
          SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY sent_at DESC LIMIT 1
        ) WHERE c.last_message IS NULL AND EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id)
      `);

      // View Filter Bot migration
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS status_viewer_campaigns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
          started_at TIMESTAMP NOT NULL DEFAULT NOW(),
          ends_at TIMESTAMP NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id)
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_svc_user ON status_viewer_campaigns(user_id)`);
      await dbQuery(`ALTER TABLE additional_services ADD COLUMN IF NOT EXISTS renewal_price DECIMAL(10,2) DEFAULT NULL`);
      await dbQuery(`ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS slot INTEGER DEFAULT 0`);
      await dbQuery(`UPDATE user_integrations SET slot = 0 WHERE slot IS NULL`);
      await dbQuery(`ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_user_id_integration_type_key`);
      await dbQuery(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'user_integrations_user_integration_slot_unique'
          ) THEN
            ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_user_integration_slot_unique UNIQUE (user_id, integration_type, slot);
          END IF;
        END $$
      `);
      // Multi-campaign support migration
      await dbQuery(`
        ALTER TABLE status_viewer_campaigns
          DROP CONSTRAINT IF EXISTS status_viewer_campaigns_user_id_key
      `);
      await dbQuery(`
        ALTER TABLE status_viewer_campaigns
          ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT true
      `);
      await dbQuery(`
        ALTER TABLE status_viewer_campaigns
          ADD COLUMN IF NOT EXISTS track_since TIMESTAMP NULL
      `);
      // Set is_primary=true for the latest campaign per user
      await dbQuery(`
        UPDATE status_viewer_campaigns svc
        SET is_primary = true
        WHERE svc.created_at = (
          SELECT MAX(s2.created_at) FROM status_viewer_campaigns s2 WHERE s2.user_id = svc.user_id
        )
      `);
      // Seed view-filter-bot service
      await dbQuery(`
        INSERT INTO additional_services (
          slug, name, name_he, description, description_he,
          price, yearly_price, renewal_price, trial_days, allow_custom_trial,
          icon, color, external_url, features, is_active, is_coming_soon, sort_order,
          billing_period
        ) VALUES (
          'view-filter-bot', 'Status Viewers Filter', 'בוט סינון צפיות',
          'Track who views your WhatsApp statuses over 90 days',
          'גלה מי באמת צופה בסטטוסים שלך לאורך 90 יום',
          199, 1990, 99, 0, true,
          'eye', 'from-purple-500 to-violet-600', '/view-filter/dashboard',
          '{"viewer_tracking":true,"gray_checkmark":true,"90_day_period":true,"google_sync":true}',
          true, false, 2,
          'one_time'
        ) ON CONFLICT (slug) DO UPDATE SET billing_period = 'one_time'
      `);
      // Broadcast admin: notify sender setting (per-forward)
      await dbQuery(`ALTER TABLE broadcast_admin_config ADD COLUMN IF NOT EXISTS notify_sender_on_pending BOOLEAN DEFAULT true`);
      await dbQuery(`ALTER TABLE group_forwards ADD COLUMN IF NOT EXISTS notify_sender_on_pending BOOLEAN DEFAULT true`);
      // Performance indexes for view-filter queries
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbv_status_id_viewed_at ON status_bot_views(status_id, viewed_at)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbv_viewed_at_phone ON status_bot_views(viewed_at, viewer_phone)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbs_conn_sent_at ON status_bot_statuses(connection_id, sent_at) WHERE deleted_at IS NULL`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbr_status_reactor ON status_bot_reactions(status_id, reactor_phone)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbrep_status_replier ON status_bot_replies(status_id, replier_phone)`);
      console.log('[Startup] ✅ Migrations applied successfully');
    } catch (err) {
      console.error('[Startup] Migration error:', err.message);
    }
  }, 3000);

  // Resume stuck jobs after server starts (wait for DB connections to stabilize)
  setTimeout(async () => {
    try {
      const { resumeStuckForwardJobs } = require('./controllers/groupForwards/jobs.controller');
      const { resumeStuckBroadcastCampaigns } = require('./services/broadcasts/sender.service');

      await resumeStuckForwardJobs();
      await resumeStuckBroadcastCampaigns();
    } catch (err) {
      console.error('[Startup] Error resuming stuck jobs:', err.message);
    }
  }, 5000);
});
