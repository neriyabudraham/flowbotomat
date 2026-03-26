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
  const zlib = require('zlib');
  const staticDir = path.join(__dirname, '../uploads/static');
  const filePath = path.join(staticDir, 'whatsapp-group.png');
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(staticDir, { recursive: true });
    // Generate a 64x64 WhatsApp-green PNG
    const sig = Buffer.from([137,80,78,71,13,10,26,10]);
    function pngChunk(type, data) {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const t = Buffer.from(type);
      const combined = Buffer.concat([t, data]);
      let c = 0xFFFFFFFF;
      for (let i = 0; i < combined.length; i++) { c ^= combined[i]; for (let j = 0; j < 8; j++) c = (c>>>1)^(c&1?0xEDB88320:0); }
      const crc = Buffer.alloc(4); crc.writeUInt32BE((c^0xFFFFFFFF)>>>0);
      return Buffer.concat([len, t, data, crc]);
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(64,0); ihdr.writeUInt32BE(64,4); ihdr[8]=8; ihdr[9]=2;
    const raw = []; for (let y=0;y<64;y++){raw.push(0);for(let x=0;x<64;x++)raw.push(37,211,102);}
    const png = Buffer.concat([sig, pngChunk('IHDR',ihdr), pngChunk('IDAT',zlib.deflateSync(Buffer.from(raw))), pngChunk('IEND',Buffer.alloc(0))]);
    fs.writeFileSync(filePath, png);
    console.log('[Static] Created whatsapp-group.png placeholder');
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
