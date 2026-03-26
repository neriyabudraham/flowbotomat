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

// Ensure static placeholder images exist in the uploads volume
(function ensureStaticAssets() {
  const fs = require('fs');
  const staticDir = path.join(__dirname, '../uploads/static');
  const filePath = path.join(staticDir, 'whatsapp-group.png');
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(staticDir, { recursive: true });
    // Official WhatsApp logo 192x192 PNG (from web.whatsapp.com PWA icon)
    const logo = Buffer.from('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', 'base64');
    fs.writeFileSync(filePath, logo);
    console.log('[Static] Created whatsapp-group.png (official WhatsApp logo 192x192)');
  }
})();

// Health check
app.get('/api/health', (req, res) => {
  const dbPool = require('./config/database').pool;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
    dbPool: {
      total: dbPool.totalCount,
      idle: dbPool.idleCount,
      waiting: dbPool.waitingCount,
      max: dbPool.options.max
    }
  });
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

cron.schedule('0 * * * *', cronGuard('subscriptionExpiry', async () => {
  console.log('[Cron] Checking expired subscriptions...');
  await handleExpiredSubscriptions();
  await handleExpiredServiceSubscriptions();
}), {
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

cron.schedule('0 * * * *', cronGuard('forwardJobsCleanup', async () => {
  const cancelled = await cleanupOldPendingJobs();
  if (cancelled > 0) {
    console.log(`[Cron] Cleaned up ${cancelled} old pending forward jobs`);
  }
}), {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Forward jobs cleanup cron job scheduled (hourly)');

// Schedule scheduled forwards processor - run every minute
const { processScheduledForwards } = require('./controllers/groupForwards/scheduled.controller');

cron.schedule('* * * * *', cronGuard('scheduledForwards', async () => {
  await processScheduledForwards();
}), {
  timezone: 'Asia/Jerusalem'
});

console.log('📅 Scheduled forwards processor started (every minute)');

// Schedule session timeout checker - run every 30 seconds
const db = require('./config/database');
const sharedBotEngine = require('./services/botEngine.service');

// Cron overlap guard — prevents a slow cron from stacking on itself
const _cronRunning = {};
function cronGuard(name, fn) {
  return async () => {
    if (_cronRunning[name]) return;
    _cronRunning[name] = true;
    try { await fn(); } catch (err) {
      console.error(`[Cron:${name}] Error:`, err.message);
    } finally { _cronRunning[name] = false; }
  };
}

cron.schedule('*/30 * * * * *', cronGuard('sessionTimeout', async () => {
  // Find and delete expired sessions atomically, return data needed for timeout paths
  const result = await db.query(
    `DELETE FROM bot_sessions bs
     USING bots b
     WHERE b.id = bs.bot_id
       AND bs.expires_at IS NOT NULL AND bs.expires_at < NOW()
     RETURNING bs.*, b.flow_data, b.user_id, b.name as bot_name`
  );

  if (result.rows.length === 0) return;

  for (const session of result.rows) {
    try {
      const flowData = session.flow_data;
      if (!flowData) continue;

      const currentNode = flowData.nodes?.find(n => n.id === session.current_node_id);
      if (!currentNode) continue;

      const timeoutEdge = flowData.edges?.find(e =>
        e.source === currentNode.id && e.sourceHandle === 'timeout'
      );

      if (timeoutEdge) {
        const contactResult = await db.query('SELECT * FROM contacts WHERE id = $1', [session.contact_id]);
        const contact = contactResult.rows[0];
        if (contact) {
          console.log(`[SessionTimeout] Executing timeout path for contact ${contact.phone}, bot ${session.bot_name}`);
          await sharedBotEngine.executeNode(timeoutEdge.target, flowData, contact, '', session.user_id, session.bot_id, session.bot_name);
        }
      }
    } catch (err) {
      console.error('[SessionTimeout] Error handling expired session:', err.message);
    }
  }
}));

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
server.timeout = 300000; // 5 minutes — allows long-running ops like contacts pull
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
      // Make connection_id optional — view filter works independently of status bot
      await dbQuery(`ALTER TABLE status_viewer_campaigns ALTER COLUMN connection_id DROP NOT NULL`);
      await dbQuery(`ALTER TABLE status_viewer_campaigns DROP CONSTRAINT IF EXISTS status_viewer_campaigns_connection_id_fkey`);
      await dbQuery(`ALTER TABLE status_viewer_campaigns ADD CONSTRAINT status_viewer_campaigns_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES status_bot_connections(id) ON DELETE SET NULL`);
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
      // Poll broadcast support
      await dbQuery(`ALTER TABLE forward_jobs ADD COLUMN IF NOT EXISTS poll_options JSONB`);
      await dbQuery(`ALTER TABLE forward_jobs ADD COLUMN IF NOT EXISTS poll_multiple_answers BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE group_forwards ADD COLUMN IF NOT EXISTS poll_multiple_answers BOOLEAN DEFAULT false`);
      // Performance indexes for view-filter queries
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbv_status_id_viewed_at ON status_bot_views(status_id, viewed_at)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbv_viewed_at_phone ON status_bot_views(viewed_at, viewer_phone)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbs_conn_sent_at ON status_bot_statuses(connection_id, sent_at) WHERE deleted_at IS NULL`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbr_status_reactor ON status_bot_reactions(status_id, reactor_phone)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbrep_status_replier ON status_bot_replies(status_id, replier_phone)`);
      // Uncertain upload: 500 from WAHA treated like timeout, shown only when views arrive
      await dbQuery(`ALTER TABLE status_bot_statuses ADD COLUMN IF NOT EXISTS uncertain_upload BOOLEAN DEFAULT false`);
      // Chat archive sync
      await dbQuery(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false`);
      // Expand media_mime_type from VARCHAR(50) to VARCHAR(200) to support long MIME strings
      await dbQuery(`ALTER TABLE messages ALTER COLUMN media_mime_type TYPE VARCHAR(200)`);
      // Add is_admin_notification column to notifications table
      await dbQuery(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_admin_notification BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
      // Ensure notification_type column exists (some schemas use 'type' instead)
      await dbQuery(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50)`);
      // Backfill notification_type from type if needed
      await dbQuery(`UPDATE notifications SET notification_type = type WHERE notification_type IS NULL AND type IS NOT NULL`);
      // Add disconnect restriction settings columns to status_bot_connections
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS disconnect_restriction_enabled BOOLEAN DEFAULT true`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS short_restriction_minutes INTEGER DEFAULT 30`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS long_restriction_hours INTEGER DEFAULT 24`);
      // WAHA multi-source support
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS waha_sources (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name            VARCHAR(100) NOT NULL,
          base_url        TEXT NOT NULL,
          api_key_enc     TEXT NOT NULL,
          webhook_base_url TEXT,
          is_active       BOOLEAN NOT NULL DEFAULT true,
          priority        INTEGER NOT NULL DEFAULT 0,
          created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT waha_sources_base_url_unique UNIQUE (base_url)
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_waha_sources_active ON waha_sources(is_active)`);
      await dbQuery(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS waha_source_id UUID REFERENCES waha_sources(id) ON DELETE SET NULL`);
      await dbQuery(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS waha_base_url TEXT`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_wc_waha_source ON whatsapp_connections(waha_source_id)`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS waha_source_id UUID REFERENCES waha_sources(id) ON DELETE SET NULL`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS waha_base_url TEXT`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbc_waha_source ON status_bot_connections(waha_source_id)`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS status_send_format VARCHAR(20) DEFAULT 'default'`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS viewers_first_mode BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS contacts_send_total INT DEFAULT 0`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS contacts_cache JSONB`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS contacts_cache_synced_at TIMESTAMP`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS contacts_cache_count INT DEFAULT 0`);

      // Per-contact send log (contacts format only)
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS status_bot_contact_sends (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          history_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
          queue_id UUID NOT NULL,
          phone VARCHAR(50) NOT NULL,
          batch_number INT NOT NULL DEFAULT 1,
          success BOOLEAN NOT NULL DEFAULT true,
          error_message TEXT,
          sent_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbcs_history ON status_bot_contact_sends(history_id)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbcs_queue ON status_bot_contact_sends(queue_id)`);

      // Seed default source from env vars and backfill existing connections
      try {
        const { encrypt: encryptForSeed } = require('./services/crypto/encrypt.service');
        const wahaBaseUrl = process.env.WAHA_BASE_URL;
        const wahaApiKey = process.env.WAHA_API_KEY;
        if (wahaBaseUrl && wahaApiKey) {
          const encryptedApiKey = encryptForSeed(wahaApiKey);
          // Always re-encrypt the API key with the current ENCRYPTION_KEY on startup.
          // DO UPDATE ensures that if ENCRYPTION_KEY changed, the stored encrypted value is refreshed.
          await dbQuery(`
            INSERT INTO waha_sources (name, base_url, api_key_enc, is_active)
            VALUES ('Default', $1, $2, true)
            ON CONFLICT (base_url) DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc
          `, [wahaBaseUrl, encryptedApiKey]);
          // Also update by name "Default" in case base_url differs slightly (trailing slash etc.)
          await dbQuery(`
            UPDATE waha_sources SET api_key_enc = $1 WHERE name = 'Default'
          `, [encryptedApiKey]);
          await dbQuery(`
            UPDATE whatsapp_connections wc
            SET waha_source_id = ws.id
            FROM waha_sources ws
            WHERE wc.connection_type = 'managed'
              AND wc.waha_source_id IS NULL
              AND ws.base_url = $1
          `, [wahaBaseUrl]);
          await dbQuery(`
            UPDATE status_bot_connections sbc
            SET waha_source_id = ws.id
            FROM waha_sources ws
            WHERE sbc.waha_source_id IS NULL
              AND ws.base_url = $1
          `, [wahaBaseUrl]);
        }
      } catch (seedErr) {
        console.error('[Startup] WAHA source seed error:', seedErr.message);
      }
      // Proxy sources for Status Bot
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS proxy_sources (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name        VARCHAR(100),
          base_url    TEXT NOT NULL,
          api_key_enc TEXT NOT NULL,
          is_active   BOOLEAN NOT NULL DEFAULT true,
          created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          CONSTRAINT proxy_sources_base_url_unique UNIQUE (base_url)
        )
      `);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS proxy_ip VARCHAR(100)`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS restriction_until TIMESTAMP WITH TIME ZONE`);
      await dbQuery(`ALTER TABLE proxy_sources ADD COLUMN IF NOT EXISTS proxy_username VARCHAR(100)`);
      await dbQuery(`ALTER TABLE proxy_sources ADD COLUMN IF NOT EXISTS proxy_password_enc TEXT`);
      // Increase default max_retries to 3 (3 days grace period)
      await dbQuery(`ALTER TABLE billing_queue ALTER COLUMN max_retries SET DEFAULT 3`);
      await dbQuery(`UPDATE billing_queue SET max_retries = 3 WHERE max_retries = 2 AND status IN ('pending', 'failed')`);
      // Drop FK on billing_queue.subscription_id — it references user_subscriptions but
      // service subscriptions use user_service_subscriptions (different table), causing FK violations.
      await dbQuery(`ALTER TABLE billing_queue DROP CONSTRAINT IF EXISTS billing_queue_subscription_id_fkey`);
      await dbQuery(`ALTER TABLE status_bot_queue ADD COLUMN IF NOT EXISTS sent_timed_out BOOLEAN DEFAULT false`);
      // Track payment suspension: when payment method is removed, WhatsApp is suspended so that
      // WAHA webhooks cannot restore 'connected' status until user re-adds a payment method.
      await dbQuery(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS payment_suspended BOOLEAN DEFAULT false`);
      // Store receipt/invoice URL for service payments so the admin can view it
      await dbQuery(`ALTER TABLE service_payment_history ADD COLUMN IF NOT EXISTS receipt_url TEXT`);
      await dbQuery(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS override_other_discounts BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS coupon_discount_percent DECIMAL(5,2) DEFAULT NULL`);
      await dbQuery(`ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS coupon_duration_type VARCHAR(20) DEFAULT NULL`);
      await dbQuery(`ALTER TABLE coupon_usage ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ DEFAULT NOW()`);
      await dbQuery(`ALTER TABLE status_bot_statuses ADD COLUMN IF NOT EXISTS contacts_sent INT`);
      await dbQuery(`ALTER TABLE status_bot_queue ADD COLUMN IF NOT EXISTS contacts_sent INT DEFAULT 0`);
      await dbQuery(`ALTER TABLE status_bot_queue ADD COLUMN IF NOT EXISTS contacts_total INT DEFAULT 0`);
      await dbQuery(`ALTER TABLE status_bot_queue ADD COLUMN IF NOT EXISTS viewers_done BOOLEAN DEFAULT false`);
      // Store group_id/group_name directly on job messages so they survive target re-creation
      await dbQuery(`ALTER TABLE forward_job_messages ADD COLUMN IF NOT EXISTS group_id VARCHAR(100)`);
      await dbQuery(`ALTER TABLE forward_job_messages ADD COLUMN IF NOT EXISTS group_name VARCHAR(255)`);
      // Backfill existing messages that don't have group_id yet
      await dbQuery(`
        UPDATE forward_job_messages fjm
        SET group_id = gft.group_id, group_name = gft.group_name
        FROM group_forward_targets gft
        WHERE fjm.target_id = gft.id AND fjm.group_id IS NULL
      `);
      // Backfill billing_queue failed entries for payment_history failures that have no billing_queue entry
      // This ensures legacy failures (from billing.service.js direct charging) appear in the admin failed tab
      await dbQuery(`
        INSERT INTO billing_queue
          (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency, status, last_error, last_error_code, last_attempt_at, retry_count)
        SELECT DISTINCT ON (ph.user_id)
          ph.user_id,
          ph.subscription_id,
          ph.amount,
          ph.created_at::date,
          COALESCE(ph.billing_type, 'monthly'),
          us.plan_id,
          ph.description,
          'ILS',
          'failed',
          ph.error_message,
          'CHARGE_FAILED',
          ph.created_at,
          1
        FROM payment_history ph
        JOIN users u ON u.id = ph.user_id
        LEFT JOIN user_subscriptions us ON us.user_id = ph.user_id
        WHERE ph.status = 'failed'
          AND ph.billing_queue_id IS NULL
          AND ph.created_at > NOW() - INTERVAL '60 days'
          AND NOT EXISTS (
            SELECT 1 FROM billing_queue bq
            WHERE bq.user_id = ph.user_id AND bq.status = 'failed'
          )
        ORDER BY ph.user_id, ph.created_at DESC
        ON CONFLICT DO NOTHING
      `);
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

      // Reset status bot items stuck in 'processing' from before this restart
      const { query: dbResetQ } = require('./config/database');
      const resetResult = await dbResetQ(`
        UPDATE status_bot_queue
        SET queue_status = 'pending', processing_started_at = NULL
        WHERE queue_status = 'processing'
        RETURNING id
      `);
      if (resetResult.rowCount > 0) {
        console.log(`[Startup] Reset ${resetResult.rowCount} stuck status bot queue item(s) to pending`);
      }
    } catch (err) {
      console.error('[Startup] Error resuming stuck jobs:', err.message);
    }
  }, 5000);

  // Warm up session→server cache from all WAHA sources
  setTimeout(async () => {
    try {
      const { query: dbQ } = require('./config/database');
      const { decrypt: dec } = require('./services/crypto/encrypt.service');
      const wahaSession = require('./services/waha/session.service');

      const srcRes = await dbQ(`SELECT base_url, api_key_enc FROM waha_sources WHERE is_active = true`);
      let total = 0;
      await Promise.all(srcRes.rows.map(async (src) => {
        let apiKey;
        try { apiKey = dec(src.api_key_enc); } catch { return; }
        try {
          const sessions = await wahaSession.getAllSessions(src.base_url, apiKey);
          for (const s of sessions) {
            wahaSession.setCachedSession(s.name, src.base_url, apiKey);
            total++;
          }
        } catch { /* server unreachable */ }
      }));
      if (total > 0) console.log(`[Startup] Cached ${total} WAHA sessions from active sources`);
    } catch (err) {
      console.error('[Startup] Session cache warm-up error:', err.message);
    }
  }, 6000);
});

// Graceful shutdown: stop accepting new connections, drain in-flight requests, close DB
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n📛 [Backend] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new HTTP/WS connections
  await new Promise(resolve => {
    server.close(resolve);
    // Safety net: force-resolve after 30s if requests are still in flight
    setTimeout(resolve, 30000);
  });
  console.log('✅ [Backend] HTTP server closed');

  // Close DB pool
  try {
    await db.end();
    console.log('✅ [Backend] Database connection closed');
  } catch (err) {
    console.error('⚠️ [Backend] Error closing database:', err.message);
  }

  console.log('👋 [Backend] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
