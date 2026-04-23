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

// Window-aware broadcast campaign tick (active_days + active_hours + batch cadence)
const { startWindowTick } = require('./services/broadcasts/campaignWindow.service');
startWindowTick(30000); // every 30 seconds — picks 'running' campaigns due for next batch
console.log('🕒 Broadcast window tick running every 30 seconds');

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

// Safety-net reconciliation for admin auto-tag rules.
// Subscription/connection triggers keep tags in sync in realtime; this catches
// any drift (e.g. from out-of-band DB writes or trigger disabling).
cron.schedule('*/10 * * * *', cronGuard('adminAutoTagSync', async () => {
  try {
    const db = require('./config/database');
    await db.query('SELECT sync_admin_auto_tags()');
  } catch (err) {
    console.error('[Cron] adminAutoTagSync failed:', err.message);
  }
}), { timezone: 'Asia/Jerusalem' });
console.log('📅 Admin auto-tag sync scheduled (every 10 min)');

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

// Status-bot health watchdog — runs on EVERY backend instance (cheap DB scans only,
// idempotent updates). Doesn't depend on the queue processor flag because its
// continuation jobs feed the queue regardless of which container processes them.
try {
  const watchdog = require('./services/statusBot/healthWatchdog.service');
  watchdog.start();
} catch (e) {
  console.error('[Startup] Failed to start status-bot health watchdog:', e.message);
}

// Settings bus — instant cross-container settings invalidation
try {
  const settingsBus = require('./services/statusBot/settingsBus.service');
  // Need to require queue.service so its registerOnChange runs first
  require('./services/statusBot/queue.service');
  settingsBus.startListener().catch(e => console.error('[Startup] settingsBus failed:', e.message));
} catch (e) {
  console.error('[Startup] Failed to start settings bus:', e.message);
}

// Start server
const PORT = process.env.PORT || 4000;
server.timeout = 300000; // 5 minutes — allows long-running ops like contacts pull
server.listen(PORT, () => {
  console.log(`🚀 Botomat Backend running on port ${PORT}`);

  // Orphan-run cleanup: mark any bot_execution_runs left in 'running' by a
  // crashed/restarted previous container as 'failed'. Without this, a
  // mid-run rebuild/deploy leaves rows stuck in 'running' forever.
  // 5-minute threshold so we never touch runs from the fresh process.
  (async () => {
    try {
      const executionTracker = require('./services/executionTracker.service');
      const cleaned = await executionTracker.cleanupStaleRuns({ thresholdMinutes: 5 });
      if (cleaned > 0) console.log(`[Startup] Closed ${cleaned} bot_execution_runs left mid-run by previous container`);
    } catch (err) {
      console.error('[Startup] Orphan-run cleanup failed:', err.message);
    }
  })();

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
      // Enforce minimum 5 second delay (auto-fix any existing forwards with < 5s)
      await dbQuery(`UPDATE group_forwards SET delay_min = 5 WHERE delay_min < 5`);
      await dbQuery(`UPDATE group_forwards SET delay_max = GREATEST(delay_max, delay_min) WHERE delay_max < delay_min`);
      await dbQuery(`UPDATE group_transfers SET delay_min = 5 WHERE delay_min < 5`).catch(() => {});
      await dbQuery(`UPDATE group_transfers SET delay_max = GREATEST(delay_max, delay_min) WHERE delay_max < delay_min`).catch(() => {});
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
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS group_broadcast_mode VARCHAR(20) DEFAULT 'disabled'`);
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS status_bot_group_broadcast_targets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
          group_id VARCHAR(100) NOT NULL,
          group_name VARCHAR(255),
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(connection_id, group_id)
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbgbt_conn ON status_bot_group_broadcast_targets(connection_id) WHERE is_active = true`);
      // Performance indexes for Cloud API bot authorization lookups
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_fas_forward_id ON forward_authorized_senders(forward_id)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_fas_phone_normalized ON forward_authorized_senders((regexp_replace(phone_number, '\\D', '', 'g')))`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gf_trigger_active ON group_forwards(trigger_type, is_active) WHERE is_active = true`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sban_phone_active ON status_bot_authorized_numbers(phone_number) WHERE is_active = true`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS group_broadcast_delay_min INTEGER DEFAULT 5`);
      await dbQuery(`ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS group_broadcast_delay_max INTEGER DEFAULT 10`);
      await dbQuery(`UPDATE status_bot_connections SET group_broadcast_delay_min = 5 WHERE group_broadcast_delay_min IS NULL OR group_broadcast_delay_min < 5`);
      await dbQuery(`UPDATE status_bot_connections SET group_broadcast_delay_max = GREATEST(COALESCE(group_broadcast_delay_max, 10), COALESCE(group_broadcast_delay_min, 5))`);
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

      // Per-authorized-sender imported contacts: permission toggle + scope column.
      // Dedup is now per-scope: connection-level (authorized_number_id NULL) or per-sender.
      await dbQuery(`ALTER TABLE status_bot_authorized_numbers ADD COLUMN IF NOT EXISTS can_import_contacts BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE status_bot_imported_contacts ADD COLUMN IF NOT EXISTS authorized_number_id UUID REFERENCES status_bot_authorized_numbers(id) ON DELETE CASCADE`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbic_auth_num ON status_bot_imported_contacts(authorized_number_id) WHERE authorized_number_id IS NOT NULL`);
      // Replace old UNIQUE(connection_id, phone) with two partial unique indexes so
      // the same phone can appear once at connection level and once per authorized number.
      await dbQuery(`ALTER TABLE status_bot_imported_contacts DROP CONSTRAINT IF EXISTS status_bot_imported_contacts_connection_id_phone_key`);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sbic_conn_phone ON status_bot_imported_contacts (connection_id, phone) WHERE authorized_number_id IS NULL`);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sbic_auth_phone ON status_bot_imported_contacts (authorized_number_id, phone) WHERE authorized_number_id IS NOT NULL`);

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
      // Legacy backfill (disabled 2026-04-23): This block used to re-create
      // billing_queue 'failed' rows from payment_history every time the backend
      // booted. That meant cancelling a bad row wouldn't stick — the next
      // restart resurrected it (and copied ph.created_at into last_attempt_at,
      // making the ghost row look legitimate). Symptom case: worksplus55 kept
      // getting a 470.40 'failed' charge re-inserted 5+ times from a single
      // March-2026 failed payment_history record. New failures from
      // billing.service.js already set billing_queue_id directly, so this
      // backfill is obsolete. Keeping the code here as a marker; do NOT re-enable
      // without adding a permanent link (UPDATE ph SET billing_queue_id = ...)
      // to break the re-resurrection loop.
      // Execution history tables for bot run tracking
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS bot_execution_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
          contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
          trigger_node_id VARCHAR(255),
          trigger_message TEXT,
          status VARCHAR(20) DEFAULT 'running',
          error_message TEXT,
          flow_snapshot JSONB,
          variables_snapshot JSONB DEFAULT '{}',
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          duration_ms INTEGER
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_execution_runs_bot_id ON bot_execution_runs(bot_id)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_execution_runs_started_at ON bot_execution_runs(started_at DESC)`);
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS bot_execution_steps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id UUID NOT NULL REFERENCES bot_execution_runs(id) ON DELETE CASCADE,
          node_id VARCHAR(255) NOT NULL,
          node_type VARCHAR(50) NOT NULL,
          node_label TEXT,
          step_order INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT 'running',
          input_data JSONB DEFAULT '{}',
          output_data JSONB DEFAULT '{}',
          error_message TEXT,
          next_handle VARCHAR(255),
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          duration_ms INTEGER
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_execution_steps_run_id ON bot_execution_steps(run_id)`);

      // ─── Contact cleanup feature (keep-list, backups, deletion log) ───
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS contact_keep_list (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          phone VARCHAR(20) NOT NULL,
          note TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, phone)
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_contact_keep_list_user ON contact_keep_list(user_id)`);
      // Relax phone column to VARCHAR(50) so user-entered "invalid" phones can be saved
      // (the original VARCHAR(20) rejected anything longer even when allowInvalid=true)
      await dbQuery(`ALTER TABLE contact_keep_list ALTER COLUMN phone TYPE VARCHAR(50)`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS contact_backups (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label TEXT,
          reason VARCHAR(50) DEFAULT 'manual',
          contact_count INTEGER NOT NULL DEFAULT 0,
          payload JSONB NOT NULL,
          size_bytes INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_contact_backups_user_created ON contact_backups(user_id, created_at DESC)`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS contact_deletion_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          backup_id UUID REFERENCES contact_backups(id) ON DELETE SET NULL,
          deleted_count INTEGER NOT NULL DEFAULT 0,
          filter_summary JSONB,
          deleted_phones JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_contact_deletion_log_user ON contact_deletion_log(user_id, created_at DESC)`);

      // ─── Google contact cleanup (cache + backup + audit) ───
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS google_contacts_cache (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          slot INTEGER NOT NULL DEFAULT 0,
          resource_name TEXT NOT NULL,
          display_name TEXT,
          primary_phone VARCHAR(50),
          phone_normalized VARCHAR(50),
          phones JSONB DEFAULT '[]'::jsonb,
          emails JSONB DEFAULT '[]'::jsonb,
          label_resource_names JSONB DEFAULT '[]'::jsonb,
          raw JSONB,
          synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, slot, resource_name)
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gcc_user_slot ON google_contacts_cache(user_id, slot)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gcc_phone_norm ON google_contacts_cache(user_id, slot, phone_normalized)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gcc_display_name ON google_contacts_cache(user_id, slot, display_name)`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS google_contacts_sync_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          slot INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(20) DEFAULT 'running',
          contact_count INTEGER,
          label_count INTEGER,
          error_message TEXT,
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          finished_at TIMESTAMP WITH TIME ZONE
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gcsl_user_slot ON google_contacts_sync_log(user_id, slot, started_at DESC)`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS google_contacts_labels_cache (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          slot INTEGER NOT NULL DEFAULT 0,
          resource_name TEXT NOT NULL,
          name TEXT,
          member_count INTEGER DEFAULT 0,
          synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, slot, resource_name)
        )
      `);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS google_contacts_backup (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          slot INTEGER NOT NULL DEFAULT 0,
          label TEXT,
          reason VARCHAR(50) DEFAULT 'manual',
          contact_count INTEGER NOT NULL DEFAULT 0,
          payload JSONB NOT NULL,
          size_bytes INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gcb_user_created ON google_contacts_backup(user_id, slot, created_at DESC)`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS google_contacts_deletion_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          slot INTEGER NOT NULL DEFAULT 0,
          backup_id UUID REFERENCES google_contacts_backup(id) ON DELETE SET NULL,
          deleted_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          filter_summary JSONB,
          deleted_resource_names JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_gcdl_user ON google_contacts_deletion_log(user_id, slot, created_at DESC)`);
      // Extra columns for tracking in-flight background deletion jobs
      await dbQuery(`ALTER TABLE google_contacts_deletion_log ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'success'`);
      await dbQuery(`ALTER TABLE google_contacts_deletion_log ADD COLUMN IF NOT EXISTS total_count INTEGER`);
      await dbQuery(`ALTER TABLE google_contacts_deletion_log ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE`);
      await dbQuery(`ALTER TABLE google_contacts_deletion_log ADD COLUMN IF NOT EXISTS error_message TEXT`);
      // Sync log: track progress (current/total) for percentage display
      await dbQuery(`ALTER TABLE google_contacts_sync_log ADD COLUMN IF NOT EXISTS total_estimate INTEGER`);

      // ─── Status bot delivery health & alerts ───
      await dbQuery(`ALTER TABLE status_bot_queue ADD COLUMN IF NOT EXISTS delivery_summary JSONB`);
      await dbQuery(`ALTER TABLE status_bot_queue ADD COLUMN IF NOT EXISTS continuation_of UUID REFERENCES status_bot_queue(id) ON DELETE SET NULL`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbq_continuation_of ON status_bot_queue(continuation_of) WHERE continuation_of IS NOT NULL`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS system_alerts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          severity VARCHAR(10) NOT NULL DEFAULT 'warning',
          alert_type VARCHAR(60) NOT NULL,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          connection_id UUID,
          queue_id UUID,
          title TEXT NOT NULL,
          message TEXT,
          payload JSONB,
          status VARCHAR(20) DEFAULT 'open',
          auto_resolved BOOLEAN DEFAULT false,
          dedup_key VARCHAR(120),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          resolved_at TIMESTAMP WITH TIME ZONE
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON system_alerts(status, created_at DESC)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_system_alerts_user ON system_alerts(user_id, created_at DESC)`);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_system_alerts_dedup ON system_alerts(dedup_key) WHERE status = 'open'`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS status_bot_send_health (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          connection_id UUID NOT NULL,
          queue_id UUID,
          contacts_in_source INTEGER,
          contacts_attempted INTEGER,
          contacts_succeeded INTEGER,
          lids_unresolvable INTEGER DEFAULT 0,
          duration_ms INTEGER,
          had_errors BOOLEAN DEFAULT false,
          recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbsh_user_recorded ON status_bot_send_health(user_id, recorded_at DESC)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_sbsh_conn_recorded ON status_bot_send_health(connection_id, recorded_at DESC)`);

      // ─── Save Contact Bot (wa.me/message link → auto-send vCard sequence) ───
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS save_contact_bot_profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contact_name VARCHAR(200) NOT NULL,
          contact_phone VARCHAR(30) NOT NULL,
          prefilled_message TEXT NOT NULL,
          welcome_message TEXT NOT NULL DEFAULT 'נשמרת בהצלחה אצל *{name}*\nעל מנת לצפות בסטטוסים *יש לשמור את איש הקשר* המצורף כאן\n👇🏻👇🏻👇🏻',
          qrdl_code VARCHAR(100),
          qrdl_deep_link_url TEXT,
          qrdl_qr_image_url TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_save_contact_bot_profiles_user ON save_contact_bot_profiles(user_id)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_save_contact_bot_profiles_active ON save_contact_bot_profiles(is_active) WHERE is_active = true`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS save_contact_bot_sequence_steps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          profile_id UUID NOT NULL REFERENCES save_contact_bot_profiles(id) ON DELETE CASCADE,
          step_order INT NOT NULL,
          position VARCHAR(20) NOT NULL DEFAULT 'after_contact',
          step_type VARCHAR(20) NOT NULL,
          text_content TEXT,
          media_url TEXT,
          media_caption TEXT,
          delay_ms INT DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_save_contact_bot_seq_profile_order ON save_contact_bot_sequence_steps(profile_id, position, step_order)`);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS save_contact_bot_received_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          profile_id UUID REFERENCES save_contact_bot_profiles(id) ON DELETE SET NULL,
          from_phone VARCHAR(30) NOT NULL,
          from_wa_name VARCHAR(200),
          message_text TEXT,
          whatsapp_message_id VARCHAR(200),
          matched BOOLEAN DEFAULT false,
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_save_contact_bot_req_profile ON save_contact_bot_received_requests(profile_id, processed_at DESC)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_save_contact_bot_req_phone ON save_contact_bot_received_requests(from_phone, processed_at DESC)`);

      // Register the Save-Contact-Bot service (idempotent).
      // features.bundled_with = services whose active subscription grants free access to this one.
      // features.monthly_contact_limit = hard cap of unique senders/month; overage is billed extra.
      // features.overage_unit_contacts = block size for overage pricing.
      // features.overage_unit_nis = NIS per overage block.
      await dbQuery(`
        INSERT INTO additional_services (
          slug, name, name_he, description, description_he,
          price, yearly_price, billing_period,
          trial_days, allow_custom_trial,
          icon, color, external_url, features,
          is_active, is_coming_soon, sort_order
        ) VALUES (
          'save-contact-bot',
          'Save Contact Bot',
          'בוט שמירת איש קשר',
          'Auto-save status subscribers via a dedicated WhatsApp QR link',
          'הוספה אוטומטית של אנשים לרשימת הסטטוס: קישור WhatsApp ייחודי + שליחת איש קשר + סנכרון ל-Google Contacts',
          49,
          490,
          'monthly',
          0, true,
          'user-plus',
          'from-teal-500 to-emerald-600',
          '/save-contact-bot/dashboard',
          '{"bundled_with": ["status-bot"], "monthly_contact_limit": 500, "overage_unit_contacts": 100, "overage_unit_nis": 8}',
          true, false, 2
        ) ON CONFLICT (slug) DO UPDATE SET
          name_he = EXCLUDED.name_he,
          description_he = EXCLUDED.description_he,
          price = EXCLUDED.price,
          yearly_price = EXCLUDED.yearly_price,
          icon = EXCLUDED.icon,
          color = EXCLUDED.color,
          external_url = EXCLUDED.external_url,
          features = EXCLUDED.features,
          updated_at = NOW()
      `);
      await dbQuery(`ALTER TABLE save_contact_bot_profiles ADD COLUMN IF NOT EXISTS google_contacts_sync_enabled BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE save_contact_bot_profiles ADD COLUMN IF NOT EXISTS google_contacts_label_id VARCHAR(200)`);
      await dbQuery(`ALTER TABLE save_contact_bot_profiles ADD COLUMN IF NOT EXISTS welcome_step_order INT DEFAULT 0`);
      await dbQuery(`ALTER TABLE save_contact_bot_profiles ADD COLUMN IF NOT EXISTS contact_step_order INT NOT NULL DEFAULT 1`);
      await dbQuery(`ALTER TABLE save_contact_bot_sequence_steps ADD COLUMN IF NOT EXISTS media_filename VARCHAR(300)`);
      await dbQuery(`ALTER TABLE save_contact_bot_received_requests ADD COLUMN IF NOT EXISTS google_contact_synced BOOLEAN DEFAULT false`);
      await dbQuery(`ALTER TABLE save_contact_bot_received_requests ADD COLUMN IF NOT EXISTS google_contact_resource_name VARCHAR(200)`);
      await dbQuery(`ALTER TABLE save_contact_bot_received_requests ADD COLUMN IF NOT EXISTS google_sync_action VARCHAR(20)`);
      // 'created' = newly added to Google by us. 'preexisted' = already existed in one of the user's connected Google accounts when we processed this sender.

      // One-off cleanup: delete duplicate Google Contacts integrations (same user+email across different slots)
      // Keep the lowest slot. Safe to run repeatedly.
      await dbQuery(`
        DELETE FROM user_integrations ui
         USING user_integrations dup
        WHERE ui.user_id = dup.user_id
          AND ui.integration_type = 'google_contacts'
          AND dup.integration_type = 'google_contacts'
          AND LOWER(ui.account_email) = LOWER(dup.account_email)
          AND ui.account_email IS NOT NULL
          AND ui.slot > dup.slot
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

  // Warm up session + email caches from all WAHA sources
  setTimeout(async () => {
    try {
      const { query: dbQ } = require('./config/database');
      const { decrypt: dec } = require('./services/crypto/encrypt.service');
      const wahaSession = require('./services/waha/session.service');

      const srcRes = await dbQ(`SELECT id, base_url, api_key_enc FROM waha_sources WHERE is_active = true`);
      let total = 0;
      await Promise.all(srcRes.rows.map(async (src) => {
        let apiKey;
        try { apiKey = dec(src.api_key_enc); } catch { return; }
        try {
          // getAllSessions with sourceId populates both session and email caches via bulkCacheSessions
          const sessions = await wahaSession.getAllSessions(src.base_url, apiKey, src.id);
          total += sessions.length;
        } catch { /* server unreachable */ }
      }));
      if (total > 0) console.log(`[Startup] Cached ${total} WAHA sessions from active sources`);
    } catch (err) {
      console.error('[Startup] Session cache warm-up error:', err.message);
    }
  }, 6000);
});

// Graceful shutdown: wait for status uploads, stop accepting connections, close DB
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n📛 [Backend] Received ${signal}, shutting down gracefully...`);

  // 1. Tell status bot queue to stop picking up new items
  try {
    const queueService = require('./services/statusBot/queue.service');
    queueService.setGracefulShutdown(true);

    // Wait for active status uploads to complete (max 3 minutes)
    if (queueService.isProcessing()) {
      console.log('⏳ [Backend] Waiting for active status uploads to finish...');
      const processingPromise = queueService.getCurrentProcessingPromise();
      if (processingPromise) {
        const MAX_WAIT_MS = 180000; // 3 minutes max wait
        await Promise.race([
          processingPromise,
          new Promise(resolve => setTimeout(resolve, MAX_WAIT_MS)),
        ]);
      }
      if (queueService.isProcessing()) {
        console.log('⚠️ [Backend] Status uploads still running after 3min — will resume on restart');
      } else {
        console.log('✅ [Backend] All status uploads completed');
      }
    }
  } catch (err) {
    console.error('⚠️ [Backend] Error during queue shutdown:', err.message);
  }

  // 2. Stop accepting new HTTP/WS connections
  await new Promise(resolve => {
    server.close(resolve);
    setTimeout(resolve, 10000);
  });
  console.log('✅ [Backend] HTTP server closed');

  // 2b. Mark any still-running bot_execution_runs as failed, with a shutdown
  // reason so the admin UI doesn't show a forever-spinning row. Startup
  // cleanup would catch these too, but flagging them here attributes the
  // cause correctly ("shutdown") instead of the generic "restart".
  try {
    const executionTracker = require('./services/executionTracker.service');
    const n = await executionTracker.cleanupStaleRuns({
      thresholdMinutes: 0,
      reason: `הבוט נעצר באמצע ריצה — המערכת כובתה בצורה מסודרת (${signal}).`,
    });
    if (n > 0) console.log(`✅ [Backend] Marked ${n} active bot run(s) as failed on shutdown`);
  } catch (err) {
    console.error('⚠️ [Backend] Failed to cleanup runs on shutdown:', err.message);
  }

  // 3. Close DB pool
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
