/**
 * Status Bot Queue Service
 * Processes status uploads with 30-second delay between each status globally
 */

const db = require('../../config/database');
const wahaSession = require('../../services/waha/session.service');
const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
const cloudApi = require('../cloudApi/cloudApi.service');

// Socket helper - safely emit to admin room
function emitToAdmin(event, data) {
  try {
    const { getIO } = require('../socket/manager.service');
    const io = getIO();
    if (io) {
      io.to('admin').emit(event, data);
    }
  } catch (e) {
    // Socket not initialized (e.g., in worker process), ignore
  }
}

const QUEUE_INTERVAL = 5000; // Check queue every 5 seconds
const DEFAULT_STATUS_TIMEOUT = 600000; // 10 minutes timeout per status (default)
const activeItemTokens = new Map(); // queueId -> token (prevents duplicate processing after stuck reset)
const forceStopItems = new Set(); // queueIds that admin requested immediate stop on
const adminStoppedItems = new Set(); // queueIds specifically stopped by admin (don't auto-requeue)

// Generic settings cache (refreshed every 10 seconds from DB for quick admin changes)
const SETTINGS_CACHE_TTL_MS = 10000;
const _settingsCache = {};
const _settingsCacheTime = {};

// Subscribe to cross-container settings change notifications so that
// admin saves take effect instantly (not after the 10s TTL).
try {
  const settingsBus = require('./settingsBus.service');
  settingsBus.registerOnChange((key) => {
    if (!key || key === '*') {
      Object.keys(_settingsCacheTime).forEach(k => { _settingsCacheTime[k] = 0; });
    } else {
      delete _settingsCache[key];
      delete _settingsCacheTime[key];
    }
  });
} catch (_) { /* bus loads independently */ }

async function getSettingFloat(key, defaultValue) {
  const now = Date.now();
  if (_settingsCacheTime[key] && now - _settingsCacheTime[key] < SETTINGS_CACHE_TTL_MS) {
    return _settingsCache[key];
  }
  try {
    const result = await db.query(`SELECT value FROM system_settings WHERE key = $1`, [key]);
    if (result.rows.length > 0) {
      const val = parseFloat(JSON.parse(result.rows[0].value));
      if (!isNaN(val) && val >= 0) {
        _settingsCache[key] = val;
        _settingsCacheTime[key] = now;
        return val;
      }
    }
  } catch (e) { /* use default */ }
  _settingsCache[key] = defaultValue;
  _settingsCacheTime[key] = now;
  return defaultValue;
}

async function getStatusTimeout() {
  const minutes = await getSettingFloat('statusbot_upload_timeout_minutes', 10);
  return Math.max(minutes, 0.5) * 60000;
}

function invalidateSettingsCache() {
  Object.keys(_settingsCacheTime).forEach(k => { _settingsCacheTime[k] = 0; });
}

// Keep old alias for backward compat
function invalidateTimeoutCache() { invalidateSettingsCache(); }

/**
 * Extract file URL from various content formats
 * Handles: { file: "url" }, { file: { url: "url" } }, { url: "url" }
 */
function getFileUrl(content) {
  if (!content) return null;
  
  // If file is already an object with url
  if (content.file && typeof content.file === 'object' && content.file.url) {
    return content.file.url;
  }
  
  // If file is a string URL
  if (content.file && typeof content.file === 'string') {
    return content.file;
  }
  
  // If url is directly on content
  if (content.url && typeof content.url === 'string') {
    return content.url;
  }
  
  return null;
}

/**
 * Build file object for WAHA API
 * WAHA expects: { mimetype, filename, url }
 */
function buildFileObject(content, type) {
  const url = getFileUrl(content);
  if (!url) return null;
  
  // Extract filename from URL or use default
  const urlPath = url.split('/').pop()?.split('?')[0] || '';
  
  // Determine mimetype and filename based on type
  let mimetype, filename;
  
  switch (type) {
    case 'image':
      mimetype = content.file?.mimetype || 'image/jpeg';
      filename = content.file?.filename || urlPath || 'status.jpg';
      break;
    case 'video':
      mimetype = content.file?.mimetype || 'video/mp4';
      filename = content.file?.filename || urlPath || 'status.mp4';
      break;
    case 'voice':
      mimetype = content.file?.mimetype || 'audio/ogg';
      filename = content.file?.filename || urlPath || 'status.ogg';
      break;
    default:
      mimetype = 'application/octet-stream';
      filename = urlPath || 'file';
  }
  
  return { mimetype, filename, url };
}

let isRunning = false;
let intervalId = null;
const activePromises = new Set(); // tracks all in-flight processItem promises
let processingPromiseCallback = null;
let gracefulShutdownRequested = false;

// Dedup cache for BLOCKED log lines: key = "itemId:reason", value = last-logged timestamp
// Prevents the same reason from being logged more than once per 5 minutes
const _blockedLogCache = new Map();
const BLOCKED_LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Set a callback to be notified when processing starts/ends
 * Used by the worker for graceful shutdown
 */
function setProcessingPromiseCallback(callback) {
  processingPromiseCallback = callback;
}

/**
 * Set graceful shutdown flag
 * When set, the queue will finish current processing but not start new items
 */
function setGracefulShutdown(value) {
  gracefulShutdownRequested = value;
  console.log(`[StatusBot Queue] Graceful shutdown ${value ? 'requested' : 'cancelled'}`);
}

/**
 * Check if graceful shutdown is requested
 */
function isGracefulShutdownRequested() {
  return gracefulShutdownRequested;
}

/**
 * Check if currently processing any status
 */
function isProcessing() {
  return activePromises.size > 0;
}

/**
 * Get a promise that resolves when all active processing completes (for graceful shutdown)
 */
function getCurrentProcessingPromise() {
  if (activePromises.size === 0) return null;
  return Promise.all([...activePromises]);
}

/**
 * Start the queue processor
 */
async function startQueueProcessor() {
  if (isRunning) {
    console.log('[StatusBot Queue] Already running');
    return;
  }

  isRunning = true;

  // On startup: immediately reset any items stuck in 'processing' state from a previous crash/restart
  // These items will be resumed from where they left off (contacts-format tracks progress per-contact)
  try {
    const stuckResult = await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'pending', processing_started_at = NULL
      WHERE queue_status = 'processing'
      RETURNING id, connection_id
    `);
    if (stuckResult.rowCount > 0) {
      console.log(`📅 [StatusBot Queue] Recovered ${stuckResult.rowCount} stuck item(s) from previous shutdown — will resume sending`);
    }
  } catch (err) {
    console.error('[StatusBot Queue] Error recovering stuck items:', err.message);
  }

  console.log('📅 Status Bot queue processor started');

  intervalId = setInterval(processQueue, QUEUE_INTERVAL);
}

/**
 * Stop the queue processor
 */
function stopQueueProcessor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  console.log('[StatusBot Queue] Stopped');
}

/**
 * Process a single queue item asynchronously
 */
async function processItem(item) {
  const createdAt = new Date(item.created_at);
  const scheduledAt = item.scheduled_for ? new Date(item.scheduled_for) : null;
  const now = new Date();
  const scheduledInfo = scheduledAt
    ? `scheduled=${scheduledAt.toISOString()}, delay=${Math.round((now - scheduledAt) / 1000)}s late`
    : `created=${createdAt.toISOString()}, queued=${Math.round((now - createdAt) / 1000)}s ago`;
  const uploaderInfo = item.source_phone ? `uploader=${item.source_phone}` : `source=${item.source || 'web'}`;
  console.log(`[StatusBot] 🚀 Uploading status id=${item.id} type=${item.status_type} ${uploaderInfo} ${scheduledInfo}`);

  emitToAdmin('statusbot:processing_start', {
    id: item.id,
    statusType: item.status_type,
    connectionId: item.connection_id,
    source: item.source,
    sourcePhone: item.source_phone,
    timestamp: new Date().toISOString()
  });

  try {
    let sendResult;
    try {
      sendResult = await sendStatus(item);
    } catch (firstError) {
      // 422/404 "Session does not exist" → user was migrated to a different WAHA server.
      // Attempt to auto-heal from the main whatsapp_connections record, then retry once.
      const isSessionMissing =
        firstError.message?.includes('422') ||
        firstError.message?.includes('404') ||
        firstError.message?.includes('does not exist') ||
        firstError.message?.includes("didn't find a session") ||
        firstError.response?.status === 422 ||
        firstError.response?.status === 404;

      if (isSessionMissing) {
        console.log(`[StatusBot] ⚠️ Session not found for item ${item.id} — attempting auto-heal...`);
        const healed = await healSessionFromMainConnection(item.connection_id);

        if (healed) {
          // Rebuild item with updated credentials and session name
          const healedItem = {
            ...item,
            session_name: healed.sessionName,
            // waha_source_id will be read from DB on next queue cycle; for sendStatus we pass creds inline
            _healedBaseUrl: healed.baseUrl,
            _healedApiKey: healed.apiKey,
          };
          console.log(`[StatusBot] 🔄 Retrying item ${item.id} with healed session ${healed.sessionName}`);
          sendResult = await sendStatus(healedItem);
        } else {
          throw firstError; // Can't heal — propagate original error
        }
      } else {
        throw firstError;
      }
    }

    // If stopped early, auto-retry with time-based escalation instead of giving up.
    //   • Retry delays: 2, 3, 4, 5, ... min (retry_count + 2)
    //   • After 20 min from first_attempted_at: set partial_abandoned=true so
    //     next queued items for the same connection can proceed (retries
    //     continue in background on this item)
    //   • After 2 hours: give up, mark 'failed', send final admin alert
    //   • Shutdown / admin-stop / user-delete still short-circuit
    if (sendResult?.stoppedEarly) {
      const deletedCheck = await db.query(
        `SELECT q.queue_status, q.first_attempted_at, q.partial_abandoned, q.admin_alerted_20min, q.retry_cancelled, s.deleted_at
         FROM status_bot_queue q
         LEFT JOIN status_bot_statuses s ON s.queue_id = q.id WHERE q.id = $1`,
        [item.id]
      );

      // Admin manually cancelled auto-retry → park the item as 'sent' (partial)
      // with no reschedule. Clearing retry_cancelled later will re-enable
      // auto-resume via the watchdog.
      if (deletedCheck.rows[0]?.retry_cancelled === true) {
        console.log(`[StatusBot] 🛑 Status id=${item.id} retry_cancelled=true — parking as 'sent' partial, no auto-retry`);
        await db.query(
          `UPDATE status_bot_queue
           SET queue_status = 'sent',
               processing_started_at = NULL,
               scheduled_for = NULL,
               sent_at = COALESCE(sent_at, NOW()),
               contacts_sent = COALESCE($2, contacts_sent),
               contacts_total = COALESCE($3, contacts_total)
           WHERE id = $1`,
          [item.id, sendResult?.contactsSent || null, sendResult?.totalContacts || null]
        );
        activeItemTokens.delete(item.id);
        emitToAdmin('statusbot:processing_end', {
          id: item.id, success: true, retryCancelled: true,
          contactsSent: sendResult.contactsSent, totalContacts: sendResult.totalContacts,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const dcRow = deletedCheck.rows[0] || {};
      const wasDeleted = dcRow.queue_status === 'cancelled' || dcRow.deleted_at;
      if (wasDeleted) {
        console.log(`[StatusBot] 🗑️ Status id=${item.id} was deleted/cancelled by user — not re-queuing`);
        await db.query(
          `UPDATE status_bot_queue SET queue_status = 'cancelled', processing_started_at = NULL WHERE id = $1`,
          [item.id]
        );
        activeItemTokens.delete(item.id);
        emitToAdmin('statusbot:processing_end', { id: item.id, success: false, cancelled: true, timestamp: new Date().toISOString() });
        return;
      }
      if (adminStoppedItems.has(item.id) || dcRow.queue_status === 'sent') {
        adminStoppedItems.delete(item.id);
        console.log(`[StatusBot] ⏹️ Status id=${item.id} stopped by admin — marking as 'sent' partial (no auto-requeue).`);
        await db.query(
          `UPDATE status_bot_queue
           SET contacts_sent = COALESCE($2, contacts_sent),
               contacts_total = COALESCE($3, contacts_total),
               sent_at = COALESCE(sent_at, NOW()),
               sent_timed_out = false,
               processing_started_at = NULL
           WHERE id = $1`,
          [item.id, sendResult?.contactsSent || null, sendResult?.totalContacts || null]
        );
        activeItemTokens.delete(item.id);
        emitToAdmin('statusbot:processing_end', {
          id: item.id, success: true, stoppedByAdmin: true,
          contactsSent: sendResult.contactsSent, totalContacts: sendResult.totalContacts,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Compute elapsed from first_attempted_at (set on first pass, else now)
      const firstAt = dcRow.first_attempted_at ? new Date(dcRow.first_attempted_at) : new Date();
      const elapsedMin = (Date.now() - firstAt.getTime()) / 60000;

      // Final give-up after 2 hours
      if (elapsedMin >= 120) {
        console.warn(`[StatusBot] 🛑 Status id=${item.id} partial retry give-up after ${elapsedMin.toFixed(1)}min — marking failed, alerting admin`);
        await db.query(
          `UPDATE status_bot_queue
           SET queue_status = 'failed',
               error_message = $2,
               contacts_sent = COALESCE($3, contacts_sent),
               contacts_total = COALESCE($4, contacts_total),
               processing_started_at = NULL
           WHERE id = $1`,
          [item.id, `נמסר ${sendResult.contactsSent}/${sendResult.totalContacts} אחרי ניסיונות חוזרים למשך שעתיים — ויתור סופי`, sendResult?.contactsSent || null, sendResult?.totalContacts || null]
        );
        try {
          const { openAlert } = require('./healthWatchdog.service');
          await openAlert({
            severity: 'high', type: 'partial_giveup',
            userId: item.user_id, connectionId: item.connection_id, queueId: item.id,
            title: 'סטטוס לא הושלם — ויתור סופי אחרי שעתיים',
            message: `${sendResult.contactsSent}/${sendResult.totalContacts} אחרי ${elapsedMin.toFixed(0)} דקות וניסיונות חוזרים`,
            dedupKey: `partial_giveup:${item.id}`,
          });
        } catch (e) { console.warn(`[StatusBot] giveup alert failed: ${e.message}`); }

        // Telegram admin notification — final give-up
        try {
          const userInfo = await db.query(
            `SELECT c.phone_number, u.name FROM status_bot_connections c
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.id = $1`,
            [item.connection_id]
          );
          const { notifyPartialFinalGiveup } = require('../notifications/telegram.service');
          await notifyPartialFinalGiveup({
            phoneNumber: userInfo.rows[0]?.phone_number,
            userName: userInfo.rows[0]?.name,
            contactsSent: sendResult.contactsSent,
            contactsTotal: sendResult.totalContacts,
          });
        } catch (e) { console.warn(`[StatusBot] Telegram giveup failed: ${e.message}`); }

        activeItemTokens.delete(item.id);
        emitToAdmin('statusbot:processing_end', { id: item.id, success: false, partialGiveup: true, contactsSent: sendResult.contactsSent, totalContacts: sendResult.totalContacts, timestamp: new Date().toISOString() });
        return;
      }

      // Shutdown → requeue immediately, let the next container pick up
      const isShutdown = gracefulShutdownRequested;
      const currentRetryCount = item.retry_count || 0;
      // Incremental delay: 2, 3, 4, ... min per attempt (capped at 10min)
      const delayMin = isShutdown ? 0 : Math.min(10, 2 + currentRetryCount);
      // After 20min of trying on this item, abandon queue-blocking (not retries)
      const shouldAbandon = !dcRow.partial_abandoned && elapsedMin >= 20;
      const shouldAlertAdmin20 = !dcRow.admin_alerted_20min && elapsedMin >= 20;

      console.log(`[StatusBot] 🔄 Status id=${item.id} partial (${sendResult.contactsSent}/${sendResult.totalContacts}) — retry in ${delayMin}min${shouldAbandon ? ' — also unblocking queue' : ''} (elapsed ${elapsedMin.toFixed(1)}min)`);

      await db.query(
        `UPDATE status_bot_queue
         SET queue_status = 'pending',
             processing_started_at = NULL,
             scheduled_for = NOW() + ($2 * interval '1 minute'),
             retry_count = CASE WHEN $3::boolean THEN COALESCE(retry_count,0) ELSE COALESCE(retry_count, 0) + 1 END,
             first_attempted_at = COALESCE(first_attempted_at, $4),
             partial_abandoned = partial_abandoned OR $5::boolean,
             admin_alerted_20min = admin_alerted_20min OR $6::boolean,
             contacts_sent = COALESCE($7, contacts_sent),
             contacts_total = COALESCE($8, contacts_total)
         WHERE id = $1`,
        [item.id, delayMin, isShutdown, firstAt, shouldAbandon, shouldAlertAdmin20, sendResult?.contactsSent || null, sendResult?.totalContacts || null]
      );

      // Admin heads-up at the 20-min mark (once per item)
      if (shouldAlertAdmin20) {
        try {
          const { openAlert } = require('./healthWatchdog.service');
          await openAlert({
            severity: 'high', type: 'partial_long_running',
            userId: item.user_id, connectionId: item.connection_id, queueId: item.id,
            title: 'סטטוס עדיין לא הושלם אחרי 20 דקות',
            message: `${sendResult.contactsSent}/${sendResult.totalContacts} — המערכת ממשיכה לנסות ברקע עד שעתיים, סטטוסים אחרים של הלקוח ממשיכים כרגיל`,
            dedupKey: `partial_20min:${item.id}`,
          });
        } catch (e) { console.warn(`[StatusBot] 20min alert failed: ${e.message}`); }

        // Telegram admin notification — 20-minute heads-up (user phone + name)
        try {
          const userInfo = await db.query(
            `SELECT c.phone_number, u.name FROM status_bot_connections c
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.id = $1`,
            [item.connection_id]
          );
          const { notifyPartialAt20Min } = require('../notifications/telegram.service');
          await notifyPartialAt20Min({
            phoneNumber: userInfo.rows[0]?.phone_number,
            userName: userInfo.rows[0]?.name,
            contactsSent: sendResult.contactsSent,
            contactsTotal: sendResult.totalContacts,
          });
        } catch (e) { console.warn(`[StatusBot] Telegram 20min failed: ${e.message}`); }
      }

      activeItemTokens.delete(item.id);
      emitToAdmin('statusbot:processing_end', {
        id: item.id, success: true, stoppedEarly: true, autoRetry: true, retryInMin: delayMin,
        contactsSent: sendResult.contactsSent, totalContacts: sendResult.totalContacts,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const uploadDuration = Math.round((Date.now() - now.getTime()) / 1000);
    const isPartialSend = sendResult?.stoppedEarly && sendResult.contactsSent < sendResult.totalContacts;
    const isTimeout = !!sendResult?.timeout;

    await db.query(
      `UPDATE status_bot_queue SET queue_status = 'sent', sent_at = NOW(), sent_timed_out = $2, contacts_sent = COALESCE($3, contacts_sent), contacts_total = COALESCE($4, contacts_total) WHERE id = $1`,
      [item.id, isTimeout, sendResult?.contactsSent || null, sendResult?.totalContacts || null]
    );

    if (isPartialSend) {
      console.log(`[StatusBot] ⚠️ Status id=${item.id} type=${item.status_type} PARTIAL send (${sendResult.contactsSent}/${sendResult.totalContacts}) in ${uploadDuration}s`);
      // User-facing partial notification INTENTIONALLY suppressed — admin gets
      // Telegram alerts instead (at 20-min mark and final 2h give-up) from the
      // auto-retry path below. Users should not be notified about partial sends.
    } else if (isTimeout) {
      console.log(`[StatusBot] ⏱️ Status id=${item.id} type=${item.status_type} TIMEOUT after ${uploadDuration}s — marked as uncertain`);
      await sendStatusNotification(item, true, null, { timeout: true });
    } else {
      console.log(`[StatusBot] ✅ Status id=${item.id} type=${item.status_type} confirmed uploaded in ${uploadDuration}s`);
      await sendStatusNotification(item, true);
    }

    activeItemTokens.delete(item.id);
    emitToAdmin('statusbot:processing_end', { id: item.id, success: true, timestamp: new Date().toISOString() });

  } catch (sendError) {
    // If this process was superseded by a new processing instance, abort silently
    if (sendError.message === 'PROCESSING_SUPERSEDED') {
      console.log(`[StatusBot] 🛑 Item ${item.id} was superseded by a new processing instance — aborting old one`);
      return;
    }

    const isTimeout = sendError.message?.includes('timeout') || sendError.message?.includes('TIMEOUT');
    console.error(`[StatusBot] ❌ Status id=${item.id} ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${sendError.message}`);
    if (!isTimeout) console.error(sendError.stack || sendError);

    // For contacts-format: re-queue to continue from where we left off (progress tracked in status_bot_contact_sends)
    const MAX_ERROR_RETRIES = 5;
    const currentRetry = item.retry_count || 0;
    if (item.status_send_format === 'contacts' && currentRetry < MAX_ERROR_RETRIES) {
      const retryPauseMinutes = await getSettingFloat('statusbot_contacts_retry_pause_minutes', 3);
      console.log(`[StatusBot] 🔄 Contacts-format error — re-queuing item ${item.id} (retry ${currentRetry + 1}/${MAX_ERROR_RETRIES}) in ${retryPauseMinutes}min to continue with remaining contacts`);
      await db.query(
        `UPDATE status_bot_queue
         SET queue_status = 'pending', processing_started_at = NULL,
             scheduled_for = NOW() + ($2 * interval '1 minute'),
             retry_count = COALESCE(retry_count, 0) + 1,
             error_message = $3
         WHERE id = $1`,
        [item.id, retryPauseMinutes, sendError.message]
      );
      activeItemTokens.delete(item.id);
      emitToAdmin('statusbot:processing_end', {
        id: item.id, success: false, requeued: true, error: sendError.message,
        timestamp: new Date().toISOString()
      });
      return;
    }

    await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'failed', error_message = $1, retry_count = retry_count + 1
      WHERE id = $2
    `, [sendError.message, item.id]);

    await sendStatusNotification(item, false, sendError.message);

    activeItemTokens.delete(item.id);
    emitToAdmin('statusbot:processing_end', { id: item.id, success: false, error: sendError.message, timestamp: new Date().toISOString() });
  }
}

/**
 * Process the queue — supports parallel uploads across multiple WAHA sources
 */
async function processQueue() {
  if (gracefulShutdownRequested) {
    console.log('[StatusBot Queue] Graceful shutdown in progress, skipping queue check');
    return;
  }

  try {
    // Check global pause
    try {
      const pauseRes = await db.query(`SELECT value FROM system_settings WHERE key = 'statusbot_global_pause_until'`);
      if (pauseRes.rows.length > 0) {
        // JSONB is auto-parsed by pg driver — no need for JSON.parse
        const pauseValue = pauseRes.rows[0].value;
        if (pauseValue === 'indefinite') {
          return; // Queue is indefinitely paused by admin
        }
        const pauseUntil = new Date(pauseValue);
        if (pauseUntil > new Date()) {
          return; // Queue is globally paused by admin
        }
      }
    } catch { /* non-fatal */ }

    const [maxTotal, maxPerSource, delaySeconds, timeout] = await Promise.all([
      getSettingFloat('statusbot_max_parallel_total', 5),
      getSettingFloat('statusbot_max_parallel_per_source', 2),
      getSettingFloat('statusbot_delay_between_statuses_seconds', 30),
      getStatusTimeout(),
    ]);

    // 1. Reset stuck items (processing started > timeout+60s ago)
    // Exclude items actively being processed by this instance (prevents resetting our own in-flight work)
    const activeIds = [...activeItemTokens.keys()];
    const stuckReset = await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'pending', processing_started_at = NULL
      WHERE queue_status = 'processing'
        AND processing_started_at < NOW() - ($1 * interval '1 millisecond')
        ${activeIds.length > 0 ? `AND id != ALL($2)` : ''}
      RETURNING id
    `, activeIds.length > 0 ? [timeout + 60000, activeIds] : [timeout + 60000]);
    if (stuckReset.rowCount > 0) {
      console.log(`[StatusBot Queue] Reset ${stuckReset.rowCount} stuck item(s) (skipped ${activeIds.length} active in this process)`);
    }

    // 2. Count currently processing per source
    const processingResult = await db.query(`
      SELECT COALESCE(c.waha_source_id::text, '__default__') as source_key, COUNT(*) as cnt
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.queue_status = 'processing'
      GROUP BY c.waha_source_id
    `);
    const totalProcessing = processingResult.rows.reduce((s, r) => s + parseInt(r.cnt), 0);
    if (totalProcessing >= maxTotal) return;

    const processingBySource = {};
    for (const r of processingResult.rows) {
      processingBySource[r.source_key] = parseInt(r.cnt);
    }

    // 3. Get candidate items (pending/scheduled, eligible, not already processing their connection)
    const candidates = await db.query(`
      SELECT q.*, c.session_name, c.connection_status, c.waha_source_id, c.waha_base_url,
             c.restriction_lifted, c.short_restriction_until, c.restriction_until,
             c.first_connected_at, c.last_connected_at, c.status_send_format, c.viewers_first_mode
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.queue_status IN ('pending', 'scheduled')
        AND c.connection_status = 'connected'
        AND (q.scheduled_for IS NULL OR q.scheduled_for <= NOW())
        AND (c.short_restriction_until IS NULL OR c.short_restriction_until <= NOW())
        AND (
          c.restriction_lifted = true
          OR c.first_connected_at IS NULL
          OR (
            CASE WHEN c.restriction_until IS NOT NULL
              THEN c.restriction_until <= NOW()
              ELSE (COALESCE(c.last_connected_at, c.first_connected_at) + INTERVAL '24 hours') <= NOW()
            END
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM status_bot_queue q2
          WHERE q2.connection_id = q.connection_id AND q2.queue_status = 'processing'
        )
        AND NOT EXISTS (
          SELECT 1 FROM status_bot_queue q4
          WHERE q4.connection_id = q.connection_id
            AND q4.queue_status IN ('pending', 'scheduled')
            AND q4.created_at < q.created_at
            AND (
              q4.retry_count > 0
              OR q4.first_attempted_at IS NOT NULL  -- already started at least once → still in flight
              OR q4.scheduled_for IS NULL
              OR q4.scheduled_for <= NOW()
            )
            -- Partial items that have been retrying >20min stop blocking the queue
            AND COALESCE(q4.partial_abandoned, false) = false
            -- Items with manually-cancelled retry don't block siblings
            AND COALESCE(q4.retry_cancelled, false) = false
        )
        AND NOT EXISTS (
          SELECT 1 FROM status_bot_queue q3
          WHERE q3.connection_id = q.connection_id
            AND q3.queue_status = 'sent'
            AND (
              -- Normal send: wait 30 seconds after sent_at
              (q3.sent_timed_out IS NOT TRUE AND q3.sent_at > NOW() - ($1 * interval '1 second'))
              OR
              -- Timeout send: wait until first view OR 5 minutes (whichever comes first)
              (
                q3.sent_timed_out = TRUE
                AND q3.sent_at > NOW() - INTERVAL '5 minutes'
                AND NOT EXISTS (
                  SELECT 1 FROM status_bot_statuses sbs
                  WHERE sbs.queue_id = q3.id AND sbs.view_count > 0
                )
              )
            )
        )
        -- Per-connection block: only 'failed' items (hard errors) block next
        -- items for 4 hours — gives admin a chance to resume/retry before new
        -- sends pile up. Partial 'sent' items are NOT blocked here because the
        -- new auto-retry system (first_attempted_at + partial_abandoned) keeps
        -- them cycling in the pending queue without blocking siblings.
        AND NOT EXISTS (
          SELECT 1 FROM status_bot_queue q5
          WHERE q5.connection_id = q.connection_id
            AND q5.created_at < q.created_at
            AND q5.queue_status = 'failed'
            AND q5.created_at > NOW() - INTERVAL '4 hours'
        )
      ORDER BY q.created_at ASC
      LIMIT $2
    `, [delaySeconds, Math.ceil(maxTotal * 3)]);

    if (candidates.rows.length === 0) {
      // Diagnose blocked items with accurate reasons.
      // Previous version fell through to "restriction_lifted=false" as a fallback
      // even when restrictions had already elapsed — misleading because the real
      // blocker was a per-connection rule (older partial, older pending, recent
      // send delay, capacity, etc.). Now we check each candidate clause in the
      // same order as the main SELECT and report the first one that hits.
      const blockedResult = await db.query(`
        SELECT q.id, q.connection_id, q.queue_status, q.created_at,
               c.connection_status, c.restriction_lifted, c.short_restriction_until,
               c.first_connected_at, c.last_connected_at, c.restriction_until
        FROM status_bot_queue q
        JOIN status_bot_connections c ON c.id = q.connection_id
        WHERE q.queue_status IN ('pending', 'scheduled')
          AND (q.scheduled_for IS NULL OR q.scheduled_for <= NOW())
        LIMIT 5
      `);
      for (const row of blockedResult.rows) {
        const now = new Date();
        const notConnected = row.connection_status !== 'connected';
        const shortUntil = row.short_restriction_until ? new Date(row.short_restriction_until) : null;
        const shortRestriction = shortUntil && shortUntil > now;

        // Reproduce the main SQL's restriction clause in JS to know whether it
        // actually blocks this item, or whether it passed and something else blocks.
        const restrictionUntilActive = row.restriction_until && new Date(row.restriction_until) > now;
        const base = row.last_connected_at || row.first_connected_at;
        const fallbackUnlocks = base ? new Date(new Date(base).getTime() + 24 * 60 * 60 * 1000) : null;
        const initial24hActive = row.first_connected_at && !row.restriction_until && fallbackUnlocks && fallbackUnlocks > now;
        const restrictionBlocks = row.restriction_lifted !== true && row.first_connected_at && (restrictionUntilActive || initial24hActive);

        let reason;
        if (notConnected) {
          reason = `connection_status=${row.connection_status}`;
        } else if (shortRestriction) {
          const minsLeft = Math.ceil((shortUntil - now) / 60000);
          reason = `short restriction active, unlocks in ${minsLeft}min`;
        } else if (restrictionBlocks && restrictionUntilActive) {
          const left = new Date(row.restriction_until) - now;
          reason = `restriction_until active, ${(left / 3600000).toFixed(1)}h left`;
        } else if (restrictionBlocks && initial24hActive) {
          reason = `24h restriction, ${((fallbackUnlocks - now) / 3600000).toFixed(1)}h left`;
        } else {
          // Restriction passed — the blocker is a per-connection rule. Run small
          // queries to find out which one.
          const diag = await db.query(`
            SELECT
              (SELECT COUNT(*) FROM status_bot_queue q2
                 WHERE q2.connection_id = $1 AND q2.queue_status = 'processing')::int AS processing_same_conn,
              (SELECT COUNT(*) FROM status_bot_queue q4
                 WHERE q4.connection_id = $1 AND q4.queue_status IN ('pending','scheduled')
                   AND q4.created_at < $2
                   AND (q4.retry_count > 0 OR q4.scheduled_for IS NULL OR q4.scheduled_for <= NOW()))::int AS older_pending,
              (SELECT COUNT(*) FROM status_bot_queue q3
                 WHERE q3.connection_id = $1 AND q3.queue_status = 'sent'
                   AND q3.sent_timed_out IS NOT TRUE
                   AND q3.sent_at > NOW() - ($3 * interval '1 second'))::int AS recent_sent,
              (SELECT COUNT(*) FROM status_bot_queue q5
                 WHERE q5.connection_id = $1 AND q5.created_at < $2
                   AND q5.queue_status = 'failed'
                   AND q5.created_at > NOW() - INTERVAL '4 hours')::int AS unresolved_older
          `, [row.connection_id, row.created_at, delaySeconds]);
          const d = diag.rows[0] || {};
          if (d.processing_same_conn > 0) {
            reason = 'connection already has an item processing (serialized per user)';
          } else if (d.older_pending > 0) {
            reason = `older pending/scheduled item on this connection — waits for it first`;
          } else if (d.unresolved_older > 0) {
            reason = 'older failed item within 4h — blocks next item until admin resolves';
          } else if (d.recent_sent > 0) {
            reason = `waiting ${delaySeconds}s delay after previous send on this connection`;
          } else {
            // Must be global capacity (total parallel or per-source limit)
            reason = 'at parallel capacity — will pick up next tick';
          }
        }
        // Only log if reason changed or hasn't been logged in the last 5 minutes
        const cacheKey = `${row.id}:${reason}`;
        const lastLogged = _blockedLogCache.get(cacheKey) || 0;
        if (Date.now() - lastLogged >= BLOCKED_LOG_INTERVAL_MS) {
          console.log(`[StatusBot] ⏸️ Queue item id=${row.id} conn=${row.connection_id} BLOCKED: ${reason}`);
          _blockedLogCache.set(cacheKey, Date.now());
          // Clean up stale entries for other reasons for this item
          for (const key of _blockedLogCache.keys()) {
            if (key.startsWith(`${row.id}:`) && key !== cacheKey) _blockedLogCache.delete(key);
          }
        }
      }
      return;
    }

    // 4. Select items respecting per-source and total limits (one per connection)
    const toProcess = [];
    const sourceCount = { ...processingBySource };
    const seenConnections = new Set();

    for (const item of candidates.rows) {
      if (toProcess.length + totalProcessing >= maxTotal) break;
      if (seenConnections.has(item.connection_id)) continue;
      const sourceKey = item.waha_source_id ? item.waha_source_id.toString() : '__default__';
      if ((sourceCount[sourceKey] || 0) >= maxPerSource) continue;
      toProcess.push(item);
      sourceCount[sourceKey] = (sourceCount[sourceKey] || 0) + 1;
      seenConnections.add(item.connection_id);
    }

    // 5. Atomically claim and process each item
    for (const item of toProcess) {
      const claimed = await db.query(`
        UPDATE status_bot_queue
        SET queue_status = 'processing',
            processing_started_at = NOW(),
            first_attempted_at = COALESCE(first_attempted_at, NOW())
        WHERE id = $1 AND queue_status IN ('pending', 'scheduled')
        RETURNING id
      `, [item.id]);
      if (claimed.rowCount === 0) continue; // race condition

      // Generate a unique token so we can detect if this item was reset and reclaimed
      const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      activeItemTokens.set(item.id, token);
      item._processingToken = token;

      const promise = processItem(item);
      activePromises.add(promise);
      // Notify callback (for worker graceful shutdown)
      if (processingPromiseCallback) processingPromiseCallback(promise);
      promise.finally(() => activePromises.delete(promise));
    }

  } catch (error) {
    console.error('[StatusBot Queue] Process error:', error.message);
  }
}

/**
 * Deep-heal a stale status_bot_connections session.
 * Delegates cross-server scan + whatsapp_connections update to the shared heal service,
 * then also updates status_bot_connections with the discovered session.
 */
async function healSessionFromMainConnection(connectionId) {
  try {
    const { healWahaConnectionByEmail } = require('../waha/heal.service');

    // Get user email + whatsapp_connections id for the shared healer
    const res = await db.query(`
      SELECT u.email, wc.id as wc_id
      FROM status_bot_connections sbc
      JOIN users u ON u.id = sbc.user_id
      LEFT JOIN whatsapp_connections wc ON wc.user_id = sbc.user_id AND wc.status = 'connected'
      WHERE sbc.id = $1
      LIMIT 1
    `, [connectionId]);

    if (!res.rows.length) {
      console.log(`[StatusBot Queue] ⚠️ No user found for status_bot connection ${connectionId}`);
      return null;
    }

    const { email, wc_id } = res.rows[0];

    // Shared healer scans all servers + updates whatsapp_connections
    const healed = await healWahaConnectionByEmail(email, wc_id);
    if (!healed) return null;

    // Also update status_bot_connections with the discovered session
    await db.query(`
      SELECT id FROM waha_sources WHERE base_url = $1 LIMIT 1
    `, [healed.baseUrl]).then(async srcRes => {
      const sourceId = srcRes.rows[0]?.id;
      if (sourceId) {
        await db.query(
          `UPDATE status_bot_connections SET session_name = $1, waha_source_id = $2, waha_base_url = $3, updated_at = NOW() WHERE id = $4`,
          [healed.sessionName, sourceId, healed.baseUrl, connectionId]
        );
        console.log(`[StatusBot Queue] 🔄 Updated status_bot_connections ${connectionId}: ${healed.sessionName}`);
      }
    });

    return healed;
  } catch (err) {
    console.error(`[StatusBot Queue] Failed to heal session: ${err.message}`);
    return null;
  }
}

/**
 * Pre-convert video/voice using WAHA's convert API.
 * Returns { mimetype, data } (base64) or null if conversion fails (caller falls back to convert:true).
 */
async function preConvertMedia(baseUrl, apiKey, sessionName, type, content) {
  const fileUrl = getFileUrl(content);
  if (!fileUrl) return null;
  const endpoint = type === 'video'
    ? `/api/${sessionName}/media/convert/video`
    : `/api/${sessionName}/media/convert/voice`;
  try {
    const result = await wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, { url: fileUrl });
    if (result?.data && result?.mimetype) {
      return { mimetype: result.mimetype, data: result.data };
    }
  } catch (err) {
    console.warn(`[StatusBot] ⚠️ Pre-conversion failed for ${type}, falling back to convert:true — ${err.message}`);
  }
  return null;
}

/**
 * Build WAHA status request body for a given type.
 */
function buildStatusBody(messageId, contacts, statusType, content, preConvertedFile) {
  // CRITICAL: Filter out LID contacts — they cannot receive statuses and cause WAHA errors.
  // This is the last line of defense before the request goes to WAHA.
  // Also filter fake phone numbers that are actually LIDs with @c.us (digits > 15 = not a real phone)
  if (Array.isArray(contacts)) {
    const before = contacts.length;
    contacts = contacts.filter(c => {
      if (c.includes('@lid')) return false;
      // Real phone numbers have max ~12 digits (with country code). Longer = LID disguised as phone
      const digits = c.split('@')[0];
      if (digits.length > 12) return false;
      return true;
    });
    if (contacts.length < before) {
      console.warn(`[StatusBot] ⛔ buildStatusBody filtered ${before - contacts.length} invalid contacts from batch (${before} → ${contacts.length})`);
    }
  }
  switch (statusType) {
    case 'text':
      return {
        id: messageId, contacts,
        text: content.text,
        backgroundColor: content.backgroundColor || '#38b42f',
        font: content.font || 0,
        linkPreview: content.linkPreview !== false,
        linkPreviewHighQuality: false,
      };
    case 'image':
      return {
        id: messageId, contacts,
        file: buildFileObject(content, 'image'),
        caption: content.caption || '',
      };
    case 'video':
      return {
        id: messageId, contacts,
        file: preConvertedFile || buildFileObject(content, 'video'),
        caption: content.caption || '',
      };
    case 'voice':
      return {
        id: messageId, contacts,
        file: preConvertedFile || buildFileObject(content, 'voice'),
        backgroundColor: content.backgroundColor || '#38b42f',
      };
    default:
      throw new Error(`Unknown status type: ${statusType}`);
  }
}

/**
 * Fetch all contacts from WAHA and persist in DB cache.
 * Called on first use and when cache is stale (>24h).
 */
async function fetchAndCacheContacts(baseUrl, apiKey, sessionName, connectionId) {
  let contacts = [];
  try {
    const res = await wahaSession.makeRequest(baseUrl, apiKey, 'GET', `/api/contacts/all?session=${sessionName}`);
    contacts = Array.isArray(res) ? res : [];
    console.log(`[StatusBot Contacts] Fetched ${contacts.length} contacts from WAHA`);
  } catch (err) {
    console.warn(`[StatusBot Contacts] Could not fetch contacts from WAHA: ${err.message}`);
  }
  // The raw cache is preserved (LIDs are still needed for resolution on send).
  // But the displayed count must only reflect VALID, UNIQUE, deliverable phones:
  //   • exclude LIDs (@lid), groups (@g.us), newsletters (@newsletter)
  //   • dedupe by phone digits
  const uniquePhones = new Set();
  for (const c of contacts) {
    const id = c?.id;
    if (typeof id !== 'string') continue;
    if (id.includes('@lid') || id.includes('@g.us') || id.includes('@newsletter')) continue;
    const phone = id.replace(/@.*/, '').replace(/\D/g, '');
    if (!phone || phone.length < 8) continue;
    uniquePhones.add(phone);
  }
  const displayCount = uniquePhones.size;
  await db.query(
    `UPDATE status_bot_connections
     SET contacts_cache = $1, contacts_cache_synced_at = NOW(), contacts_cache_count = $2
     WHERE id = $3`,
    [JSON.stringify(contacts), displayCount, connectionId]
  ).catch(e => console.error('[StatusBot Contacts] Cache save error:', e.message));
  return contacts;
}

/**
 * Fetch LID-to-phone mappings from WAHA and cache them in whatsapp_lid_mapping.
 * Returns a Map of lid (without suffix) → phone (without suffix).
 * Only calls the API if there are unmapped LIDs in the DB cache.
 */
async function resolveLidMappings(baseUrl, apiKey, sessionName, userId, lidIds) {
  if (!lidIds || lidIds.length === 0) return new Map();

  const LOG = '[StatusBot LID]';
  const lidToPhone = new Map();

  // Strip suffixes: "12345@lid@c.us" or "12345@lid" → "12345"
  const rawLids = lidIds.map(id => id.replace(/@.*/, ''));

  // 1. Check DB cache first
  try {
    const cached = await db.query(
      `SELECT lid, phone FROM whatsapp_lid_mapping WHERE user_id = $1 AND lid = ANY($2)`,
      [userId, rawLids]
    );
    for (const row of cached.rows) {
      if (row.phone) lidToPhone.set(row.lid, row.phone);
    }
  } catch (e) {
    console.warn(`${LOG} DB cache lookup error: ${e.message}`);
  }

  // 2. Find unresolved LIDs
  const unresolved = rawLids.filter(lid => !lidToPhone.has(lid));
  if (unresolved.length === 0) {
    return lidToPhone;
  }

  // 3. Fetch from WAHA /lids API — PAGINATED
  // WAHA's /lids endpoint silently caps results despite ?limit=999999.
  // Loop over pages until we get an empty page (or hit a hard ceiling).
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 50; // safety: up to 50,000 LIDs
  const newRows = [];
  try {
    let offset = 0;
    let totalFromWaha = 0;
    let consecutiveEmpty = 0;
    for (let pageIdx = 0; pageIdx < MAX_PAGES; pageIdx++) {
      const page = await wahaSession.makeRequest(
        baseUrl, apiKey, 'GET',
        `/api/${sessionName}/lids?limit=${PAGE_SIZE}&offset=${offset}`
      ).catch(e => {
        console.error(`${LOG} ❌ /lids page offset=${offset} error: ${e.message}`);
        return null;
      });

      if (!Array.isArray(page) || page.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) break; // 2 empty pages → done
        offset += PAGE_SIZE;
        continue;
      }
      consecutiveEmpty = 0;
      totalFromWaha += page.length;

      for (const entry of page) {
        const lid = entry.lid?.replace(/@.*/, '');
        const phone = entry.pn?.replace(/@.*/, '');
        if (!lid || !phone) continue;
        if (!lidToPhone.has(lid)) lidToPhone.set(lid, phone);
        newRows.push([userId, lid, phone]);
      }

      // If WAHA returned less than a full page, we're at the end
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    if (totalFromWaha > 0) {
      console.log(`${LOG} Paginated /lids fetched ${totalFromWaha} entries across ${Math.ceil(totalFromWaha / PAGE_SIZE)} pages`);
    }
  } catch (e) {
    console.error(`${LOG} ❌ WAHA /lids paginated fetch error (session=${sessionName}): ${e.message}`);
  }

  // Bulk upsert all new rows
  if (newRows.length > 0) {
    try {
      const CHUNK = 500;
      for (let i = 0; i < newRows.length; i += CHUNK) {
        const chunk = newRows.slice(i, i + CHUNK);
        const values = [];
        const params = [];
        let idx = 1;
        for (const [u, l, p] of chunk) {
          values.push(`($${idx++}, $${idx++}, $${idx++}, NOW(), NOW())`);
          params.push(u, l, p);
        }
        await db.query(
          `INSERT INTO whatsapp_lid_mapping (user_id, lid, phone, created_at, updated_at)
           VALUES ${values.join(',')}
           ON CONFLICT (user_id, lid) DO UPDATE SET phone = EXCLUDED.phone, updated_at = NOW()`,
          params
        );
      }
    } catch (e) {
      console.warn(`${LOG} DB upsert error: ${e.message}`);
    }
  }

  // 4. Per-LID fallback for any STILL unresolved — try /contacts/check-exists for each
  // (limited fan-out to avoid hammering WAHA)
  const stillUnresolved = rawLids.filter(lid => !lidToPhone.has(lid));
  if (stillUnresolved.length > 0 && stillUnresolved.length <= 200) {
    // Only do per-LID lookup for small remainders — large remainders mean WAHA can't help
    const fallbackHits = [];
    for (const lid of stillUnresolved.slice(0, 200)) {
      try {
        const r = await wahaSession.makeRequest(
          baseUrl, apiKey, 'GET',
          `/api/contacts/check-exists?phone=${encodeURIComponent(lid)}&session=${sessionName}`
        );
        const phone = r?.numberExists ? (r?.chatId?.replace(/@.*/, '') || null) : null;
        if (phone && /^\d{7,15}$/.test(phone)) {
          lidToPhone.set(lid, phone);
          fallbackHits.push([userId, lid, phone]);
        }
      } catch { /* skip */ }
    }
    if (fallbackHits.length) {
      console.log(`${LOG} Fallback per-LID lookup recovered ${fallbackHits.length}/${stillUnresolved.length}`);
      const values = [];
      const params = [];
      let idx = 1;
      for (const [u, l, p] of fallbackHits) {
        values.push(`($${idx++}, $${idx++}, $${idx++}, NOW(), NOW())`);
        params.push(u, l, p);
      }
      await db.query(
        `INSERT INTO whatsapp_lid_mapping (user_id, lid, phone, created_at, updated_at)
         VALUES ${values.join(',')}
         ON CONFLICT (user_id, lid) DO UPDATE SET phone = EXCLUDED.phone, updated_at = NOW()`,
        params
      ).catch(() => {});
    }
  }

  const finalUnresolved = rawLids.filter(lid => !lidToPhone.has(lid));
  if (finalUnresolved.length > 0) {
    console.warn(`${LOG} ⚠️ ${finalUnresolved.length} LIDs UNRESOLVABLE — will be excluded from status send (WAHA does not accept LIDs in /status)`);
  }
  if (rawLids.length > 0) console.log(`${LOG} LIDs resolved: ${lidToPhone.size}/${rawLids.length}`);

  return lidToPhone;
}

/**
 * Bulk-insert per-contact send log rows into status_bot_contact_sends.
 * success=true for all contacts in a successful/timeout batch, false for error batch.
 */
async function logContactSends(historyId, queueId, contacts, batchNum, success, errorMessage) {
  if (!historyId || !contacts || contacts.length === 0) return;
  try {
    // Build VALUES list: (historyId, queueId, phone, batchNum, success, errorMessage, NOW())
    const values = [];
    const params = [];
    let paramIdx = 1;
    for (const contactId of contacts) {
      const phone = typeof contactId === 'string' ? contactId.replace(/@.*/, '') : String(contactId);
      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`);
      params.push(historyId, queueId, phone, batchNum, success, errorMessage || null);
    }
    await db.query(
      `INSERT INTO status_bot_contact_sends (history_id, queue_id, phone, batch_number, success, error_message, sent_at)
       VALUES ${values.join(',')}`,
      params
    );
  } catch (e) {
    console.error(`[StatusBot Contacts] Failed to log contact sends: ${e.message}`);
  }
}

/**
 * Send status using the "contacts" format:
 * - Fetches own phone + all contacts from WAHA
 * - Orders: own phone first, then viewers (from status_bot_views), then non-viewers
 * - Sends in batches of 500 with a 30s per-call timeout
 * - First timeout → wait 1 minute → continue
 * - Second timeout → stop, save total contacts reached
 */
async function sendStatusWithContacts(queueItem, { baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile, processingToken, viewersOnly = false, nonViewersOnly = false }) {
  const content = queueItem.content;
  const BATCH_SIZE = await getSettingFloat('statusbot_contacts_batch_size', 500);
  const CALL_TIMEOUT_MS = await getSettingFloat('statusbot_contacts_timeout_ms', 120000);  // 2 minutes per batch
  const VIEWER_CALL_TIMEOUT_MS = await getSettingFloat('statusbot_viewer_timeout_ms', 180000);  // 3 minutes per viewer batch (longer — viewers are priority)
  const VIEWER_TIMEOUT_RETRIES = await getSettingFloat('statusbot_viewer_timeout_retries', 2);  // retry viewer batches up to N times on timeout
  const PAUSE_MS = await getSettingFloat('statusbot_contacts_pause_ms', 60000);            // 1 minute pause after timeout wave
  const MAX_CONSECUTIVE_TIMEOUTS = await getSettingFloat('statusbot_contacts_max_consecutive_timeouts', 4);
  const PARALLEL_BATCHES = await getSettingFloat('statusbot_contacts_parallel_batches', 3);
  const LOG_PREFIX = `[StatusBot Contacts | queue=${queueItem.id} | conn=${queueItem.connection_id}]`;

  console.log(`${LOG_PREFIX} ▶️ Starting contacts-format send. type=${queueItem.status_type} messageId=${messageId} historyId=${historyId} viewersOnly=${viewersOnly}`);

  // 0. On retry OR continuation: find contacts that were already successfully sent.
  //    Walk the continuation_of chain to collect ALL prior queue ids,
  //    then find ALL history ids that belong to any of them,
  //    then pull the union of their contact_sends.
  const alreadySentPhones = new Set();
  try {
    const chainRes = await db.query(`
      WITH RECURSIVE chain AS (
        SELECT id, continuation_of FROM status_bot_queue WHERE id = $1
        UNION ALL
        SELECT q.id, q.continuation_of FROM status_bot_queue q
        JOIN chain ch ON q.id = ch.continuation_of
      )
      SELECT id FROM chain
    `, [queueItem.id]);
    const chainQueueIds = chainRes.rows.map(r => r.id);

    // All history rows linked to any queue in the chain
    const histRes = await db.query(
      `SELECT id FROM status_bot_statuses WHERE queue_id = ANY($1::uuid[])`,
      [chainQueueIds]
    );
    const historyIds = histRes.rows.map(r => r.id);
    if (historyId && !historyIds.includes(historyId)) historyIds.push(historyId);

    if (historyIds.length > 0) {
      const sentResult = await db.query(
        `SELECT DISTINCT phone FROM status_bot_contact_sends
         WHERE history_id = ANY($1::uuid[]) AND success = true`,
        [historyIds]
      );
      for (const row of sentResult.rows) alreadySentPhones.add(row.phone);
    }

    if (alreadySentPhones.size > 0) {
      console.log(`${LOG_PREFIX} 🔄 Resume mode: skipping ${alreadySentPhones.size} already-sent contacts (chain depth=${chainQueueIds.length})`);
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX} continuation skip-lookup failed (will resend): ${e.message}`);
  }

  // Position-based fallback: if the queue row says more contacts were sent than
  // we found in status_bot_contact_sends (e.g. due to deploy/crash between batch
  // completion and DB log commit), skip the first N contacts from the ordered list
  // using the counter as a safety fallback. This prevents re-sending to people who
  // already got the status when the log table is lossy.
  let positionSkip = 0;
  const queuedContactsSent = parseInt(queueItem.contacts_sent || 0);
  if (queuedContactsSent > alreadySentPhones.size) {
    positionSkip = queuedContactsSent - alreadySentPhones.size;
    console.log(`${LOG_PREFIX} 📍 Position-based fallback: queue counter (${queuedContactsSent}) > logged sends (${alreadySentPhones.size}) — will skip first ${positionSkip} unlogged contacts to prevent duplicates`);
  }

  // 1. Get engaged phones ordered by MOST RECENT activity (latest viewer first, oldest last).
  //    This ensures people who viewed recently get the status first.
  const viewersResult = await db.query(`
    SELECT phone, MAX(last_ts) AS last_ts FROM (
      SELECT sbv.viewer_phone AS phone, MAX(sbv.viewed_at) AS last_ts
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbs.id = sbv.status_id
      WHERE sbs.connection_id = $1
      GROUP BY sbv.viewer_phone
      UNION ALL
      SELECT sbr.reactor_phone AS phone, MAX(sbr.reacted_at) AS last_ts
      FROM status_bot_reactions sbr
      JOIN status_bot_statuses sbs ON sbs.id = sbr.status_id
      WHERE sbs.connection_id = $1
      GROUP BY sbr.reactor_phone
      UNION ALL
      SELECT sbrep.replier_phone AS phone, MAX(sbrep.replied_at) AS last_ts
      FROM status_bot_replies sbrep
      JOIN status_bot_statuses sbs ON sbs.id = sbrep.status_id
      WHERE sbs.connection_id = $1
      GROUP BY sbrep.replier_phone
    ) engaged
    GROUP BY phone
    ORDER BY last_ts DESC NULLS LAST
  `, [queueItem.connection_id]);
  const viewerPhones = new Set(viewersResult.rows.map(r => r.phone));
  // Ordered array: most engaged first
  const viewerPhonesRanked = viewersResult.rows.map(r => r.phone);
  // viewerPhones found from DB

  let orderedContacts;

  if (viewersOnly) {
    // ── viewersOnly: use viewer phones from DB directly — no WAHA contacts fetch needed ──
    // viewersOnly: use viewer phones from DB directly

    // Get own ID for first position
    let ownId = null;
    try {
      const me = await wahaSession.makeRequest(baseUrl, apiKey, 'GET', `/api/sessions/${sessionName}/me`);
      ownId = me?.id;
    } catch (err) {
      console.warn(`${LOG_PREFIX} ⚠️ Could not get own ID: ${err.message}`);
    }

    orderedContacts = [];
    const ownPhone = ownId ? ownId.replace(/@.*/, '') : null;
    if (ownPhone && !alreadySentPhones.has(ownPhone)) {
      orderedContacts.push(`${ownPhone}@c.us`);
    }
    for (const phone of viewerPhonesRanked) {
      if (phone === ownPhone) continue;
      if (alreadySentPhones.has(phone)) continue;
      orderedContacts.push(`${phone}@c.us`);
    }
    console.log(`${LOG_PREFIX} viewersOnly: ${orderedContacts.length} contacts (skipped ${alreadySentPhones.size} already-sent)`);

  } else {
    // ── Full contacts mode: fetch WAHA contacts, order viewers first ──
    let ownId = null;
    try {
      const me = await wahaSession.makeRequest(baseUrl, apiKey, 'GET', `/api/sessions/${sessionName}/me`);
      ownId = me?.id;
    } catch (err) {
      console.warn(`${LOG_PREFIX} ⚠️ Could not get own ID — will proceed without it. Error: ${err.message}`);
    }

    // Get contacts from WAHA cache
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const connCacheRes = await db.query(
      `SELECT contacts_cache, contacts_cache_synced_at FROM status_bot_connections WHERE id = $1`,
      [queueItem.connection_id]
    );
    const connCache = connCacheRes.rows[0];
    const cacheAgeMs = connCache?.contacts_cache_synced_at
      ? Date.now() - new Date(connCache.contacts_cache_synced_at).getTime()
      : Infinity;

    let allContacts;
    if (connCache?.contacts_cache && cacheAgeMs < CACHE_TTL_MS) {
      allContacts = Array.isArray(connCache.contacts_cache) ? connCache.contacts_cache : [];
      // Using cached contacts
    } else {
      console.log(`${LOG_PREFIX} Cache stale — fetching fresh contacts from WAHA`);
      allContacts = await fetchAndCacheContacts(baseUrl, apiKey, sessionName, queueItem.connection_id);
    }

    // Resolve LID contacts to phone numbers (LIDs cannot receive statuses)
    const lidContacts = allContacts.filter(c => c.id && c.id.includes('@lid'));
    let lidToPhone = new Map();
    if (lidContacts.length > 0) {
      try {
        const connUserRes = await db.query(`SELECT user_id FROM status_bot_connections WHERE id = $1`, [queueItem.connection_id]);
        const userId = connUserRes.rows[0]?.user_id;
        if (userId) {
          lidToPhone = await resolveLidMappings(baseUrl, apiKey, sessionName, userId, lidContacts.map(c => c.id));
        }
      } catch (lidErr) {
        console.warn(`${LOG_PREFIX} LID resolution error (non-fatal): ${lidErr.message}`);
      }
      if (lidToPhone.size > 0) console.log(`${LOG_PREFIX} Resolved ${lidToPhone.size}/${lidContacts.length} LID contacts`);
    }

    // Build ordered contact list: own phone → viewers (ranked by recent activity) → non-viewers
    // IMPORTANT: Convert all LID contacts to phone@c.us format — LIDs cannot receive statuses
    const seen = new Set();
    const ownPhone = ownId ? ownId.replace(/@.*/, '') : null;
    if (ownPhone) seen.add(ownPhone);
    orderedContacts = [];
    // Own phone: only include if NOT non-viewers-only (they should always see their own status)
    if (ownPhone && !alreadySentPhones.has(ownPhone) && !nonViewersOnly) {
      orderedContacts.push(ownId);
    }

    // Load user-imported contacts (manual/CSV/VCF/Google). Two scopes are merged:
    //   • connection-level list (authorized_number_id IS NULL) — applied when
    //     use_imported_contacts is enabled on the connection
    //   • per-sender list (authorized_number_id = <id>) — applied when the current
    //     upload's source_phone matches an authorized number with can_import_contacts
    // These are appended to the contacts-format pipeline on top of the WAHA cache list.
    let importedPhones = [];
    try {
      const connFlagRes = await db.query(
        `SELECT use_imported_contacts FROM status_bot_connections WHERE id = $1`,
        [queueItem.connection_id]
      );
      const useImported = connFlagRes.rows[0]?.use_imported_contacts !== false;

      const clauses = [];
      const params = [];
      let pIdx = 1;
      if (useImported) {
        clauses.push(`(connection_id = $${pIdx} AND authorized_number_id IS NULL)`);
        params.push(queueItem.connection_id);
        pIdx++;
      }
      // Find the authorized sender (if any) for this upload
      if (queueItem.source === 'whatsapp' && queueItem.source_phone) {
        const senderRes = await db.query(
          `SELECT id FROM status_bot_authorized_numbers
            WHERE connection_id = $1 AND phone_number = $2
              AND is_active = true AND can_import_contacts = true
            LIMIT 1`,
          [queueItem.connection_id, queueItem.source_phone]
        );
        const senderId = senderRes.rows[0]?.id;
        if (senderId) {
          clauses.push(`authorized_number_id = $${pIdx}`);
          params.push(senderId);
          pIdx++;
        }
      }
      if (clauses.length > 0) {
        const impRes = await db.query(
          `SELECT DISTINCT phone FROM status_bot_imported_contacts WHERE ${clauses.join(' OR ')}`,
          params
        );
        importedPhones = impRes.rows.map(r => r.phone).filter(Boolean);
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} imported-contacts fetch failed (non-fatal): ${e.message}`);
    }

    // First pass: build phone → JID map from all WAHA contacts
    let skippedLids = 0;
    const phoneToJid = new Map();
    const nonViewers = [];
    for (const c of allContacts) {
      const id = c.id;
      if (!id) continue;

      let contactJid = id;
      let phone;
      if (id.includes('@lid')) {
        const rawLid = id.replace(/@.*/, '');
        const resolvedPhone = lidToPhone.get(rawLid);
        if (!resolvedPhone) {
          skippedLids++;
          continue;
        }
        contactJid = `${resolvedPhone}@c.us`;
        phone = resolvedPhone;
      } else {
        phone = id.replace(/@.*/, '');
      }

      if (phone === ownPhone || seen.has(phone)) continue;
      seen.add(phone);
      if (alreadySentPhones.has(phone)) continue;

      phoneToJid.set(phone, contactJid);
      if (!viewerPhones.has(phone)) {
        nonViewers.push(contactJid);
      }
    }

    // Append imported contacts into the non-viewers bucket (skip ones already seen
    // in WAHA cache / viewers / own phone / already-sent). These become reachable
    // even if WAHA never learned the phone.
    let importedAdded = 0;
    for (const phone of importedPhones) {
      if (!phone) continue;
      if (phone === ownPhone) continue;
      if (seen.has(phone)) continue;
      if (alreadySentPhones.has(phone)) continue;
      // Basic sanity: numeric, 8-15 digits (same guard as normalizer)
      if (!/^\d{8,15}$/.test(phone)) continue;
      seen.add(phone);
      const jid = `${phone}@c.us`;
      phoneToJid.set(phone, jid);
      if (viewerPhones.has(phone)) {
        // If an imported phone is also a past viewer, it'll be picked up via viewerPhonesRanked
        continue;
      }
      nonViewers.push(jid);
      importedAdded++;
    }
    if (importedAdded > 0) {
      console.log(`${LOG_PREFIX} ➕ Added ${importedAdded} imported contacts to non-viewers bucket (total imported: ${importedPhones.length})`);
    }

    if (nonViewersOnly) {
      // Phase-3 mode: only send to people who are NOT viewers
      orderedContacts.push(...nonViewers);
      console.log(`${LOG_PREFIX} nonViewersOnly: ${orderedContacts.length} contacts (skipped ${skippedLids} LIDs, ${viewerPhones.size} viewers excluded)`);
    } else {
      // Normal full mode: viewers (most recent first) then non-viewers
      for (const phone of viewerPhonesRanked) {
        const jid = phoneToJid.get(phone);
        if (jid) orderedContacts.push(jid);
      }
      if (skippedLids > 0) {
        console.log(`${LOG_PREFIX} ⚠️ Skipped ${skippedLids} unresolvable LID contacts`);
      }
      orderedContacts.push(...nonViewers);
    }
  }
  // Safety filter: remove LID contacts AND fake phone numbers (> 15 digits = LID disguised as phone)
  const preFilterCount = orderedContacts.length;
  orderedContacts = orderedContacts.filter(jid => {
    if (jid.includes('@lid')) return false;
    // E.164 caps real phones at 15 digits. Longer = LID disguised as phone.
    const digits = jid.split('@')[0];
    if (digits.length > 15) return false;
    return true;
  });
  if (orderedContacts.length < preFilterCount) {
    console.warn(`${LOG_PREFIX} ⚠️ Safety filter removed ${preFilterCount - orderedContacts.length} LID contacts from final list`);
  }

  // Apply position-based skip (post-filtering) so recovery truly advances past already-sent contacts
  if (positionSkip > 0 && positionSkip < orderedContacts.length) {
    const dropped = orderedContacts.slice(0, positionSkip);
    orderedContacts = orderedContacts.slice(positionSkip);
    console.log(`${LOG_PREFIX} 📍 Dropped first ${dropped.length} contacts (position-based resume). Remaining: ${orderedContacts.length}`);
  }

  // Persist delivery_summary so admin/UI can see exactly what we tried to send and why some dropped.
  // This is the "ground truth" that feeds the watchdog + alerts.
  try {
    const _allContactsForSummary = (typeof allContacts !== 'undefined' && Array.isArray(allContacts)) ? allContacts : [];
    const _lidsTotal = _allContactsForSummary.filter(c => c?.id?.includes?.('@lid')).length;
    const _direct = _allContactsForSummary.filter(c => c?.id && !c.id.includes('@lid') && !c.id.includes('@g.us')).length;
    const _groups = _allContactsForSummary.filter(c => c?.id?.includes?.('@g.us')).length;
    const summary = {
      mode: viewersOnly ? 'viewers_only' : 'contacts',
      contacts_in_waha: _allContactsForSummary.length || null,
      lids_in_waha: _lidsTotal || 0,
      direct_in_waha: _direct || 0,
      groups_in_waha: _groups || 0,
      lids_resolved: (typeof lidToPhone !== 'undefined' && lidToPhone?.size) || 0,
      lids_unresolvable: Math.max(0, _lidsTotal - ((typeof lidToPhone !== 'undefined' && lidToPhone?.size) || 0)),
      already_sent_skipped: alreadySentPhones.size,
      final_recipient_count: orderedContacts.length,
      computed_at: new Date().toISOString(),
    };
    await db.query(
      `UPDATE status_bot_queue
       SET delivery_summary = COALESCE(delivery_summary, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [queueItem.id, JSON.stringify(summary)]
    );
  } catch (e) {
    console.warn(`${LOG_PREFIX} delivery_summary save failed (non-fatal): ${e.message}`);
  }

  const VIEWER_MEGA_BATCH_CAP = await getSettingFloat('statusbot_contacts_viewer_batch_cap', 5000);
  const WAVE_DELAY_MS = await getSettingFloat('statusbot_contacts_wave_delay_ms', 30000); // 30s between non-viewer waves

  // 5. Build batches
  // Prior attempts total: logged already-sent + any position-skipped contacts
  const previouslySent = alreadySentPhones.size + positionSkip;
  let totalSent = 0;
  let consecutiveTimeouts = 0;
  let stoppedEarly = false;
  const startTime = Date.now();

  const allBatches = [];
  let batchNum = 0;

  if (viewersOnly) {
    // viewersOnly: all contacts are viewers — split into regular batches
    for (let i = 0; i < orderedContacts.length; i += BATCH_SIZE) {
      batchNum++;
      allBatches.push({
        contacts: orderedContacts.slice(i, i + BATCH_SIZE),
        batchNum,
        isViewerBatch: true,
      });
    }
  } else {
    // Full contacts mode: viewers in mega-batches, then non-viewers in regular batches
    // In orderedContacts: [ownId?, ...viewers, ...nonViewers]
    // We know viewerPhones set, so count how many of the first entries are viewers
    let viewerEndIdx = 0;
    for (let i = 0; i < orderedContacts.length; i++) {
      const phone = orderedContacts[i].replace(/@.*/, '');
      if (viewerPhones.has(phone) || i === 0) { // i===0 is ownId which is a viewer
        viewerEndIdx = i + 1;
      } else {
        break;
      }
    }
    const viewerContacts = orderedContacts.slice(0, viewerEndIdx);
    const nonViewerContacts = orderedContacts.slice(viewerEndIdx);

    // Viewers in mega-batches
    for (let i = 0; i < viewerContacts.length; i += VIEWER_MEGA_BATCH_CAP) {
      batchNum++;
      allBatches.push({
        contacts: viewerContacts.slice(i, i + VIEWER_MEGA_BATCH_CAP),
        batchNum,
        isViewerBatch: true,
      });
    }
    // Non-viewers in regular batches
    for (let i = 0; i < nonViewerContacts.length; i += BATCH_SIZE) {
      batchNum++;
      allBatches.push({
        contacts: nonViewerContacts.slice(i, i + BATCH_SIZE),
        batchNum,
        isViewerBatch: false,
      });
    }
  }

  const totalBatches = allBatches.length;
  const viewerBatchCount = allBatches.filter(b => b.isViewerBatch).length;
  const nonViewerBatchCount = totalBatches - viewerBatchCount;
  console.log(`${LOG_PREFIX} 📋 ${orderedContacts.length} contacts | ${viewerBatchCount} viewer + ${nonViewerBatchCount} non-viewer batches | parallelism=${PARALLEL_BATCHES}`);

  // Process batches in waves of PARALLEL_BATCHES
  // IMPORTANT: viewer batches and non-viewer batches are NEVER mixed in the same wave.
  // This guarantees all viewers are sent BEFORE any non-viewer starts.
  let isFirstNonViewerWave = true;
  let waveStart = 0;
  while (waveStart < allBatches.length) {
    if (stoppedEarly) break;

    // Ownership check: if this item was reset and reclaimed by another process, abort
    if (processingToken && activeItemTokens.get(queueItem.id) !== processingToken) {
      console.warn(`${LOG_PREFIX} 🛑 Processing token mismatch — item was reclaimed by another process. Aborting.`);
      throw new Error('PROCESSING_SUPERSEDED');
    }

    // Admin force-stop check: immediately end sending, mark as sent with partial progress
    if (forceStopItems.has(queueItem.id)) {
      forceStopItems.delete(queueItem.id);
      console.log(`${LOG_PREFIX} ⏹️ Admin force-stopped item — finishing with ${totalSent} contacts sent so far`);
      stoppedEarly = true;
      break;
    }

    // Graceful shutdown check at every wave boundary — pause cleanly between batches
    // so deploys/rebuilds don't interrupt mid-batch. The item stays in 'processing'
    // briefly until shutdown completes; on restart, the queue processor's startup
    // routine resets stuck 'processing' items back to 'pending', and our
    // continuation chain + already_sent_phones skip-logic resumes from where we left off.
    if (gracefulShutdownRequested) {
      console.log(`${LOG_PREFIX} 🛑 Graceful shutdown requested — pausing at wave boundary (sent ${totalSent} so far) — will resume after restart`);
      stoppedEarly = true;
      break;
    }

    // User-deleted / state-transition check:
    //  - 'cancelled' OR deleted_at → user deleted, never resume
    //  - 'sent' / 'failed' → admin force-stopped and flipped the DB state; exit
    //    (the forceStopItems in-memory Set is the signal but DB state is authoritative)
    //  - anything other than 'processing' → also stop (defensive)
    const cancelCheck = await db.query(
      `SELECT q.queue_status, s.deleted_at
       FROM status_bot_queue q
       LEFT JOIN status_bot_statuses s ON s.queue_id = q.id
       WHERE q.id = $1`,
      [queueItem.id]
    );
    const currentState = cancelCheck.rows[0]?.queue_status;
    if (currentState === 'cancelled' || cancelCheck.rows[0]?.deleted_at) {
      console.log(`${LOG_PREFIX} 🗑️ Status was deleted/cancelled by user — stopping send (sent ${totalSent} so far)`);
      stoppedEarly = true;
      break;
    }
    if (currentState && currentState !== 'processing') {
      console.log(`${LOG_PREFIX} ⏹️ Status queue_status changed to '${currentState}' (likely admin stop) — exiting batch loop`);
      stoppedEarly = true;
      // Persist the current progress so contacts_sent reflects what we sent.
      // Don't touch queue_status — whoever changed it owns the final state.
      await db.query(
        `UPDATE status_bot_queue SET contacts_sent = GREATEST(contacts_sent, $2) WHERE id = $1`,
        [queueItem.id, previouslySent + totalSent]
      ).catch(() => {});
      break;
    }

    // Build the wave: only include batches of the SAME type (viewer OR non-viewer)
    const firstType = allBatches[waveStart].isViewerBatch;
    const wave = [];
    for (let i = waveStart; i < allBatches.length && wave.length < PARALLEL_BATCHES; i++) {
      if (allBatches[i].isViewerBatch !== firstType) break; // stop at type boundary
      wave.push(allBatches[i]);
    }

    // Transition from viewers → non-viewers: mark viewers_done and apply delay
    if (!wave[0].isViewerBatch) {
      if (isFirstNonViewerWave) {
        isFirstNonViewerWave = false;
        // Mark viewers_done so next status in queue can start its viewers
        await db.query(
          `UPDATE status_bot_queue SET viewers_done = true WHERE id = $1`,
          [queueItem.id]
        ).catch(() => {});
        console.log(`${LOG_PREFIX} ✅ Viewers phase complete — connection unblocked for next status`);
        emitToAdmin('statusbot:viewers_done', { id: queueItem.id, connectionId: queueItem.connection_id });
        // Short pause before starting non-viewers so viewers phase is clearly separated
        if (WAVE_DELAY_MS > 0) {
          await new Promise(resolve => setTimeout(resolve, WAVE_DELAY_MS));
        }
      } else if (WAVE_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, WAVE_DELAY_MS));
      }
    }

    // Wave logging only on first wave and viewer/non-viewer transition
    const waveNum = Math.floor(waveStart / PARALLEL_BATCHES) + 1;
    if (waveNum === 1 || (wave[0].isViewerBatch !== (waveStart > 0 && allBatches[waveStart - 1]?.isViewerBatch))) {
      console.log(`${LOG_PREFIX} 🌊 Wave ${waveNum} — batches ${wave[0].batchNum}-${wave[wave.length - 1].batchNum}${wave[0].isViewerBatch ? ' (viewers)' : ' (non-viewers)'}`);
    }

    const waveResults = await Promise.allSettled(wave.map(async ({ contacts: batch, batchNum, isViewerBatch }) => {
      // Check force-stop before starting each batch (allows skipping batches within a wave)
      if (forceStopItems.has(queueItem.id)) {
        console.log(`${LOG_PREFIX} ⏹️ Batch ${batchNum}/${totalBatches} skipped — force-stop active`);
        return { batchNum, sent: 0, timedOut: false, error: false, skipped: true };
      }

      const endpoint = `/api/${sessionName}/status/${queueItem.status_type}`;
      const body = buildStatusBody(messageId, batch, queueItem.status_type, content, preConvertedFile);
      const batchTimeoutMs = isViewerBatch ? VIEWER_CALL_TIMEOUT_MS : CALL_TIMEOUT_MS;
      const maxRetries = isViewerBatch ? VIEWER_TIMEOUT_RETRIES : 0;

      // Per-batch logging removed to reduce noise — errors/timeouts still logged below

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const batchStart = Date.now();
        try {
          const sendPromise = wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, body);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('BATCH_TIMEOUT')), batchTimeoutMs)
          );
          await Promise.race([sendPromise, timeoutPromise]);
          // Log contacts as sent immediately after batch confirmation (resume-safe)
          await logContactSends(historyId, queueItem.id, batch, batchNum, true, null);
          return { batchNum, sent: batch.length, timedOut: false, error: false };
        } catch (err) {
          const batchDurationMs = Date.now() - batchStart;
          if (err.message === 'BATCH_TIMEOUT') {
            if (isViewerBatch && attempt < maxRetries) {
              console.warn(`${LOG_PREFIX} ⏱️ Batch ${batchNum}/${totalBatches} TIMEOUT after ${batchDurationMs}ms (attempt ${attempt + 1}/${maxRetries + 1}) — retrying viewer batch...`);
              continue;
            }
            console.warn(`${LOG_PREFIX} ⏱️ Batch ${batchNum}/${totalBatches} TIMEOUT after ${batchDurationMs}ms${isViewerBatch ? ` (all ${maxRetries + 1} attempts exhausted)` : ''} — assuming delivered`);
            await logContactSends(historyId, queueItem.id, batch, batchNum, true, 'TIMEOUT — assumed delivered');
            return { batchNum, sent: batch.length, timedOut: true, error: false };
          } else {
            console.error(`${LOG_PREFIX} ❌ Batch ${batchNum}/${totalBatches} ERROR after ${batchDurationMs}ms: ${err.message}`);
            await logContactSends(historyId, queueItem.id, batch, batchNum, false, err.message);
            return { batchNum, sent: 0, timedOut: false, error: true };
          }
        }
      }
    }));

    // Analyze wave results
    let waveTimeouts = 0;
    for (const result of waveResults) {
      const val = result.status === 'fulfilled' ? result.value : { sent: 0, timedOut: false, error: true };
      totalSent += val.sent;
      if (val.timedOut) waveTimeouts++;
    }

    const progressPct = orderedContacts.length > 0 ? Math.round((totalSent / orderedContacts.length) * 100) : 100;
    // Log progress every 25% or on timeouts
    if (waveTimeouts > 0 || progressPct % 25 < (PARALLEL_BATCHES * BATCH_SIZE / orderedContacts.length * 100) || totalSent === orderedContacts.length) {
      console.log(`${LOG_PREFIX} 📊 Progress: ${totalSent}/${orderedContacts.length} (${progressPct}%)${waveTimeouts > 0 ? ` | timeouts: ${waveTimeouts}/${wave.length}` : ''}`);
    }

    // Check force-stop immediately after wave completes (don't wait for next loop iteration)
    if (forceStopItems.has(queueItem.id)) {
      forceStopItems.delete(queueItem.id);
      console.log(`${LOG_PREFIX} ⏹️ Admin force-stopped item after wave — finishing with ${totalSent} contacts sent so far`);
      stoppedEarly = true;
      break;
    }

    // Heartbeat + progress: keep processing_started_at fresh and update send progress.
    //
    // IMPORTANT — historical bug fix:
    //   contacts_total MUST represent the total unique target contacts across
    //   the whole send (sent so far + still-to-go), NOT accumulate extras on
    //   every retry. Previously we used `previouslySent + orderedContacts.length`,
    //   where `previouslySent = alreadySentPhones.size + positionSkip`. Because
    //   `orderedContacts` is already `allContacts ∖ alreadySentPhones`, adding
    //   positionSkip on top caused compounding inflation across retries —
    //   Sherman's queue row showed 154K when the real count is ~21K.
    //
    // The correct math:
    //   cumulativeSent  = alreadySentPhones.size (logged successes) + totalSent (this run)
    //   cumulativeTotal = alreadySentPhones.size + orderedContacts.length
    // This gives a stable total equal to the distinct phones we plan to reach.
    const cumulativeSent  = alreadySentPhones.size + totalSent;
    const cumulativeTotal = alreadySentPhones.size + orderedContacts.length;
    await db.query(
      `UPDATE status_bot_queue SET processing_started_at = NOW(), contacts_sent = $2, contacts_total = $3 WHERE id = $1 AND queue_status = 'processing'`,
      [queueItem.id, cumulativeSent, cumulativeTotal]
    ).catch(() => {});

    // Timeout handling: if ALL batches in this wave timed out, it counts as consecutive
    if (waveTimeouts === wave.length) {
      consecutiveTimeouts++;
      if (consecutiveTimeouts < MAX_CONSECUTIVE_TIMEOUTS) {
        console.log(`${LOG_PREFIX} ⏸️ Wave timeout (${consecutiveTimeouts}/${MAX_CONSECUTIVE_TIMEOUTS}) — pausing ${PAUSE_MS / 1000}s`);
        await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
      } else {
        const remaining = orderedContacts.length - totalSent;
        console.warn(`${LOG_PREFIX} 🛑 ${MAX_CONSECUTIVE_TIMEOUTS} consecutive full-wave timeouts — stopping early. totalSent=${totalSent}/${orderedContacts.length} remaining≈${remaining} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`);
        stoppedEarly = true;
      }
    } else {
      consecutiveTimeouts = 0; // reset if at least one batch succeeded without timeout
    }

    // Advance by actual wave size (may be < PARALLEL_BATCHES due to type boundary)
    waveStart += wave.length;
  }

  // If we never hit non-viewer wave (all contacts were viewers or skipped), mark viewers_done now
  if (isFirstNonViewerWave) {
    await db.query(`UPDATE status_bot_queue SET viewers_done = true WHERE id = $1`, [queueItem.id]).catch(() => {});
    console.log(`${LOG_PREFIX} ✅ All contacts were viewers — viewers_done marked`);
    emitToAdmin('statusbot:viewers_done', { id: queueItem.id, connectionId: queueItem.connection_id });
  }

  const totalElapsedSec = Math.round((Date.now() - startTime) / 1000);
  // Use the same non-inflating math as the heartbeat (see big comment above).
  const cumulativeFinalSent  = alreadySentPhones.size + totalSent;
  const cumulativeFinalTotal = alreadySentPhones.size + orderedContacts.length;

  // Save cumulative total contacts reached to connection row and history row
  await Promise.all([
    db.query(`UPDATE status_bot_connections SET contacts_send_total = $1 WHERE id = $2`, [cumulativeFinalSent, queueItem.connection_id])
      .catch(e => console.error(`${LOG_PREFIX} Failed to save connection total: ${e.message}`)),
    historyId
      ? db.query(`UPDATE status_bot_statuses SET contacts_sent = $1 WHERE id = $2`, [cumulativeFinalSent, historyId])
          .catch(e => console.error(`${LOG_PREFIX} Failed to save history contacts_sent: ${e.message}`))
      : Promise.resolve(),
  ]);

  console.log(`${LOG_PREFIX} 🏁 Done. totalSent=${cumulativeFinalSent}/${cumulativeFinalTotal} (this attempt: ${totalSent}, prior: ${previouslySent}) stoppedEarly=${stoppedEarly} elapsed=${totalElapsedSec}s`);
  return { success: true, id: messageId, contactsSent: cumulativeFinalSent, totalContacts: cumulativeFinalTotal, stoppedEarly };
}

/**
 * Send a status via WAHA
 */
async function sendStatus(queueItem) {
  // Allow caller to inject healed credentials directly (after a 422 auto-heal)
  let baseUrl, apiKey;
  if (queueItem._healedBaseUrl && queueItem._healedApiKey) {
    baseUrl = queueItem._healedBaseUrl;
    apiKey  = queueItem._healedApiKey;
  } else {
    const creds = await getWahaCredentialsForConnection(queueItem);
    baseUrl = creds.baseUrl;
    apiKey  = creds.apiKey;
  }
  const sessionName = queueItem.session_name;
  const content = queueItem.content;

  if (!sessionName) {
    throw new Error('Missing session name');
  }

  // First, get a new message ID
  let messageId = queueItem.status_message_id;
  
  if (!messageId) {
    try {
      const idResponse = await wahaSession.makeRequest(
        baseUrl, apiKey, 'GET', 
        `/api/${sessionName}/status/new-message-id`
      );
      messageId = idResponse.id;
      // messageId obtained

      // Save message ID to queue
      await db.query(`
        UPDATE status_bot_queue SET status_message_id = $1 WHERE id = $2
      `, [messageId, queueItem.id]);

    } catch (e) {
      console.error('[StatusBot Queue] Failed to get message ID:', e.message);
      // If session doesn't exist, throw immediately so auto-heal can kick in
      const isSessionError = e.message?.includes('422') || e.message?.includes('404') ||
        e.message?.includes('does not exist') || e.message?.includes("didn't find a session");
      if (isSessionError) {
        throw e;
      }
      // Other errors (network glitch etc.) — continue without message ID
    }
  } else {
    // Reusing existing messageId
  }
  
  // Save to history BEFORE sending - this allows view tracking from the start
  // even if the send times out or takes a long time
  const historyMessageId = messageId || `pending_${queueItem.id}`;
  // Pre-save to history for view tracking
  
  // Check if history record already exists for this queue item
  let historyId = null;
  const existingHistory = await db.query(
    `SELECT id FROM status_bot_statuses WHERE queue_id = $1`,
    [queueItem.id]
  );
  
  if (existingHistory.rows.length > 0) {
    historyId = existingHistory.rows[0].id;
    // Update existing record with new message ID if we have one
    await db.query(`
      UPDATE status_bot_statuses 
      SET waha_message_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [historyMessageId, historyId]);
  } else {
    // Create new history record
    const historyResult = await db.query(`
      INSERT INTO status_bot_statuses 
      (connection_id, queue_id, status_type, content, waha_message_id, expires_at, source, source_phone)
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours', $6, $7)
      RETURNING id
    `, [
      queueItem.connection_id,
      queueItem.id,
      queueItem.status_type,
      JSON.stringify(content),
      historyMessageId,
      queueItem.source,
      queueItem.source_phone
    ]);
    historyId = historyResult.rows[0]?.id;
  }

  // Pre-convert video/voice once (reused for all batches in contacts format too)
  let preConvertedFile = null;
  if (['video', 'voice'].includes(queueItem.status_type)) {
    preConvertedFile = await preConvertMedia(baseUrl, apiKey, sessionName, queueItem.status_type, content);
  }

  // If the upload came from an authorized sender with their own imported
  // contacts list, route through the contacts-format pipeline regardless of
  // the connection's configured format. This ensures the sender's personal
  // contacts (which may not exist in the account's WhatsApp contact list,
  // so native broadcast wouldn't reach them) are delivered explicitly.
  if (queueItem.status_send_format !== 'contacts'
      && queueItem.source === 'whatsapp'
      && queueItem.source_phone) {
    try {
      const senderImp = await db.query(
        `SELECT COUNT(*)::int AS cnt
           FROM status_bot_imported_contacts sbic
           JOIN status_bot_authorized_numbers an ON an.id = sbic.authorized_number_id
          WHERE an.connection_id = $1 AND an.phone_number = $2
            AND an.is_active = true AND an.can_import_contacts = true`,
        [queueItem.connection_id, queueItem.source_phone]
      );
      if ((senderImp.rows[0]?.cnt || 0) > 0) {
        console.log(`[StatusBot] Sender ${queueItem.source_phone} has per-sender imported contacts — routing through contacts format`);
        queueItem.status_send_format = 'contacts';
      }
    } catch (e) {
      console.warn(`[StatusBot] per-sender imported-contacts check failed (non-fatal): ${e.message}`);
    }
  }

  // Contacts format: send in batches with explicit contact list
  if (queueItem.status_send_format === 'contacts') {
    const contactsViewersFirst = queueItem.viewers_first_mode === true || queueItem.viewers_first_mode === 'true';

    if (contactsViewersFirst) {
      // 3-phase flow for contacts format + viewers_first:
      // (1) viewers only (most recent first)
      // (2) default broadcast (WhatsApp native distribution)
      // (3) remaining contacts (non-viewers) via contacts-format
      console.log(`[StatusBot] 👁️ Contacts+viewers-first: phase 1 — viewers only`);
      const phase1 = await sendStatusWithContacts(queueItem, {
        baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile,
        processingToken: queueItem._processingToken,
        viewersOnly: true,
      });
      const viewersSent = phase1?.contactsSent || 0;

      console.log(`[StatusBot] 📢 Contacts+viewers-first: phase 2 — default broadcast`);
      const phase2 = await sendDefaultBroadcast(queueItem, {
        baseUrl, apiKey, sessionName, messageId, historyId, historyMessageId, content, preConvertedFile,
      });

      console.log(`[StatusBot] 📋 Contacts+viewers-first: phase 3 — remaining contacts (non-viewers)`);
      const phase3 = await sendStatusWithContacts(queueItem, {
        baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile,
        processingToken: queueItem._processingToken,
        nonViewersOnly: true,
      });
      const nonViewersSent = phase3?.contactsSent || 0;

      const actualId = phase3?.id || phase2?.id || phase1?.id;
      if (actualId && actualId !== historyMessageId && historyId) {
        await db.query(
          `UPDATE status_bot_statuses SET waha_message_id = $1, updated_at = NOW() WHERE id = $2`,
          [actualId, historyId]
        );
      }
      // Propagate stoppedEarly from ANY phase — if any piece stopped short,
      // the whole send is "not done" and should be retried.
      const anyStoppedEarly = !!(phase1?.stoppedEarly || phase3?.stoppedEarly);

      // Don't sum the phase totals naively — both `contactsSent` and
      // `totalContacts` from each phase already include alreadySentPhones,
      // so adding them double-counts and inflates. The truth for distinct
      // recipients lives in status_bot_contact_sends; query it directly.
      const truth = await db.query(
        `SELECT COUNT(DISTINCT phone) FILTER (WHERE success = true) AS sent_cnt,
                COUNT(DISTINCT phone)                               AS total_cnt
         FROM status_bot_contact_sends
         WHERE queue_id = $1`,
        [queueItem.id]
      );
      const truthRow = truth.rows[0] || {};
      const contactsSent  = parseInt(truthRow.sent_cnt, 10) || 0;
      const totalContacts = parseInt(truthRow.total_cnt, 10) || 0;

      return { ...phase3, contactsSent, totalContacts, id: actualId, stoppedEarly: anyStoppedEarly };
    }

    // Default: single-phase contacts send (as before)
    const result = await sendStatusWithContacts(queueItem, {
      baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile,
      processingToken: queueItem._processingToken,
    });
    const actualId = result?.id;
    if (actualId && actualId !== historyMessageId && historyId) {
      await db.query(
        `UPDATE status_bot_statuses SET waha_message_id = $1, updated_at = NOW() WHERE id = $2`,
        [actualId, historyId]
      );
    }
    return result;
  }

  // Default format logic depends on viewers_first_mode (per-connection setting)
  const viewersFirst = queueItem.viewers_first_mode === true || queueItem.viewers_first_mode === 'true';

  if (viewersFirst) {
    // ── Viewers-first mode: send to viewers first, then broadcast to all ──
    // Phase 1: Send to viewers only (contacts mode, ordered by engagement)
    console.log(`[StatusBot] 👁️ Viewers-first mode: sending to viewers first`);
    const viewersResult = await sendStatusWithContacts(queueItem, {
      baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile,
      processingToken: queueItem._processingToken,
      viewersOnly: true,
    });
    const viewersSent = viewersResult?.contactsSent || 0;
    console.log(`[StatusBot] 👁️ Viewers phase done: ${viewersSent} viewers sent — now broadcasting to all`);

    // Phase 2: Generic broadcast (no contacts list) — WhatsApp distributes to all followers
    // This is the classic behavior: viewers get priority, then general broadcast handles the rest
    const broadcastResult = await sendDefaultBroadcast(queueItem, {
      baseUrl, apiKey, sessionName, messageId, historyId, historyMessageId, content, preConvertedFile,
    });
    // CRITICAL: propagate stoppedEarly from Phase 1. If viewers phase got cut
    // short (timeouts, shutdown, etc.), the overall send is NOT done — even
    // if Phase 2 broadcast succeeded. Otherwise the auto-retry path in
    // processItem never fires and the item wrongly shows as 'sent' partial.
    return {
      ...broadcastResult,
      contactsSent: viewersSent,
      totalContacts: viewersResult?.totalContacts || viewersSent,
      stoppedEarly: !!viewersResult?.stoppedEarly,
    };

  } else {
    // ── Classic mode (default): broadcast to all first, on timeout → send to viewers ──
    // Classic mode: broadcast first
    const broadcastResult = await sendDefaultBroadcast(queueItem, {
      baseUrl, apiKey, sessionName, messageId, historyId, historyMessageId, content, preConvertedFile,
    });

    if (broadcastResult?.timeout) {
      console.log(`[StatusBot] ⏱️ Broadcast TIMEOUT — falling back to viewers-only batch send`);
      const fallbackResult = await sendStatusWithContacts(queueItem, {
        baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile,
        processingToken: queueItem._processingToken,
        viewersOnly: true,
      });
      const actualId = fallbackResult?.id;
      if (actualId && actualId !== historyMessageId && historyId) {
        await db.query(
          `UPDATE status_bot_statuses SET waha_message_id = $1, updated_at = NOW() WHERE id = $2`,
          [actualId, historyId]
        );
      }
      return { ...fallbackResult, timeout: true };
    }

    return broadcastResult;
  }
}

/**
 * Send a single broadcast call (no contacts list) with timeout handling
 */
async function sendDefaultBroadcast(queueItem, { baseUrl, apiKey, sessionName, messageId, historyId, historyMessageId, content, preConvertedFile }) {
  // NOTE: broadcast is INTENTIONALLY re-run on every retry with the same
  // client-generated messageId. WAHA deduplicates by id (no duplicate status
  // on owner's WhatsApp), while a repeat call can re-push distribution to
  // followers who didn't get it the first time. The broadcast_sent_at
  // column is populated below for diagnostics only — we do NOT short-circuit
  // based on it. If we ever need admin-visible "was broadcast attempted?"
  // the column carries the answer.
  const endpoint = `/api/${sessionName}/status/${queueItem.status_type}`;
  const body = buildStatusBody(messageId, null, queueItem.status_type, content, preConvertedFile);

  const timeoutMs = await getStatusTimeout();
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ timeout: true, id: messageId }), timeoutMs);
  });

  const sendPromise = wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, body)
    .catch(err => {
      const status = err.response?.status;
      if (status === 500 || status === 502 || status === 503 || status === 504) {
        console.log(`[StatusBot] ⚠️ Status id=${queueItem.id} WAHA ${status} on broadcast - treating as uncertain`);
        return { uncertain: true, id: messageId };
      }
      throw err;
    });

  const response = await Promise.race([sendPromise, timeoutPromise]);

  if (response?.uncertain) {
    if (historyId) {
      await db.query(`UPDATE status_bot_statuses SET uncertain_upload = true WHERE id = $1`, [historyId]);
    }
    console.log(`[StatusBot] ⚠️ Status id=${queueItem.id} broadcast uncertain (WAHA 5xx)`);
    return { success: true, uncertain: true, id: messageId };
  }

  if (response?.timeout) {
    console.log(`[StatusBot] ⏱️ Status id=${queueItem.id} broadcast TIMEOUT`);
    return { success: true, timeout: true, id: messageId };
  }

  // Update history with actual message ID if different
  const actualMessageId = response?.id;
  if (actualMessageId && actualMessageId !== historyMessageId && historyId) {
    await db.query(`
      UPDATE status_bot_statuses
      SET waha_message_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [actualMessageId, historyId]);
  }

  // Record the LATEST successful broadcast time (diagnostics only — no
  // short-circuit on this field; by design we re-call the broadcast on retry).
  await db.query(
    `UPDATE status_bot_queue SET broadcast_sent_at = NOW() WHERE id = $1`,
    [queueItem.id]
  ).catch(err => console.warn(`[StatusBot] broadcast_sent_at update failed (non-fatal): ${err.message}`));

  return response;
}

/**
 * Add item to queue (helper function)
 */
async function addToQueue(connectionId, statusType, content, source = 'web', sourcePhone = null) {
  const result = await db.query(`
    INSERT INTO status_bot_queue (connection_id, status_type, content, source, source_phone)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [connectionId, statusType, JSON.stringify(content), source, sourcePhone]);

  return result.rows[0];
}

/**
 * Get queue stats
 */
async function getQueueStats() {
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE queue_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE queue_status = 'processing') as processing,
      COUNT(*) FILTER (WHERE queue_status = 'sent' AND sent_at > NOW() - INTERVAL '24 hours') as sent_today,
      COUNT(*) FILTER (WHERE queue_status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as failed_today,
      MAX(sent_at) FILTER (WHERE queue_status = 'sent') as last_sent_at
    FROM status_bot_queue
  `);
  return result.rows[0];
}

/**
 * Send WhatsApp notification about status upload result
 * @param {Object} item - Queue item
 * @param {boolean} success - Whether the upload succeeded
 * @param {string} errorMessage - Error message if failed
 */
async function sendStatusNotification(item, success, errorMessage = null, details = null) {
  try {
    // Determine the notification target phone
    // For WhatsApp source: use source_phone
    // For web source: try to find user's WhatsApp phone from connection
    let phone = null;
    if (item.source === 'whatsapp' && item.source_phone) {
      phone = item.source_phone;
    } else {
      // Web/other source - get phone from connection for failure/partial notifications
      if (!success || details?.partial) {
        const connResult = await db.query(
          `SELECT phone_number FROM status_bot_connections WHERE id = $1`,
          [item.connection_id]
        );
        phone = connResult.rows[0]?.phone_number;
      }
    }

    if (!phone) return;

    // For full success notifications: only notify for scheduled statuses (non-scheduled got immediate feedback)
    // Timeout is treated like a normal success (the status was sent) — no separate notification.
    if (success && !details?.partial) {
      if (!item.scheduled_for) return;
      const scheduledTime = new Date(item.scheduled_for);
      const createdTime = new Date(item.created_at);
      const hoursUntilScheduled = (scheduledTime - createdTime) / (1000 * 60 * 60);
      if (hoursUntilScheduled > 24) return;
    }

    const statusId = item.status_message_id || item.id;

    if (success && details?.partial) {
      // Partial send notification
      await cloudApi.sendButtonMessage(
        phone,
        `⚠️ הסטטוס עלה חלקית\n\nנשלח ל-${details.sent} מתוך ${details.total} אנשי קשר.\nהמערכת ניסתה מספר פעמים אך לא הצליחה להשלים לכולם.`,
        [{ id: `queued_retry_${item.id}`, title: '🔄 נסה שוב' }]
      );
      await db.query(`
        UPDATE cloud_api_conversation_states
        SET state = 'after_send_menu', state_data = $1, last_message_at = NOW(), connection_id = $2
        WHERE phone_number = $3
      `, [JSON.stringify({ queuedStatusId: statusId }), item.connection_id, phone]);

    } else if (success) {
      // Full success notification with action list
      const sections = [{
        title: 'סטטיסטיקות',
        rows: [
          { id: `queued_views_${statusId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
          { id: `queued_hearts_${statusId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
          { id: `queued_reactions_${statusId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
        ]
      }, {
        title: 'פעולות',
        rows: [
          { id: `queued_delete_${statusId}`, title: '🗑️ מחק סטטוס', description: 'מחק את הסטטוס' },
          { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים מתוזמנים ופעילים' },
          { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
        ],
      }];

      await cloudApi.sendListMessage(
        phone,
        `✅ הסטטוס המתוזמן עלה בהצלחה!\n\nבחר פעולה`,
        'בחר פעולה',
        sections
      );

      await db.query(`
        UPDATE cloud_api_conversation_states
        SET state = 'after_send_menu', state_data = $1, last_message_at = NOW(), connection_id = $2
        WHERE phone_number = $3
      `, [JSON.stringify({ queuedStatusId: statusId }), item.connection_id, phone]);

    } else {
      // Failure notification with retry button
      await cloudApi.sendButtonMessage(
        phone,
        `❌ שגיאה בהעלאת הסטטוס${item.scheduled_for ? ' המתוזמן' : ''}\n\n${errorMessage || 'שגיאה לא ידועה'}\n\nלחץ למטה כדי לנסות שוב:`,
        [{ id: `queued_retry_${item.id}`, title: '🔄 העלה מחדש' }]
      );

      await db.query(`
        UPDATE cloud_api_conversation_states
        SET state = 'after_send_menu', state_data = $1, last_message_at = NOW(), connection_id = $2
        WHERE phone_number = $3
      `, [JSON.stringify({ queuedStatusId: statusId }), item.connection_id, phone]);
    }

    console.log(`[StatusBot Queue] Sent notification to ${phone} for status ${item.id} (success: ${success}, details: ${JSON.stringify(details)})`);
  } catch (notifyError) {
    // Don't fail the whole process if notification fails
    console.error(`[StatusBot Queue] Failed to send notification:`, notifyError.message);
  }
}

/**
 * Retry a failed queue item — resets it to 'pending' with the same message ID
 * For contacts format, already-sent contacts will be skipped on next processing
 */
async function retryQueueItem(queueId) {
  const result = await db.query(`
    UPDATE status_bot_queue
    SET queue_status = 'pending', error_message = NULL, processing_started_at = NULL
    WHERE id = $1 AND queue_status = 'failed'
    RETURNING *
  `, [queueId]);
  return result.rows[0] || null;
}

/**
 * Resume a stuck/partial/failed queue item with top priority.
 * Works on: failed, sent (partial), processing (stuck).
 * Keeps the same status message ID so it continues from where it left off.
 * For contacts-format: already-sent contacts are tracked in status_bot_contact_sends and will be skipped.
 */
async function resumeQueueItem(queueId) {
  const result = await db.query(`
    UPDATE status_bot_queue
    SET queue_status = 'pending',
        error_message = NULL,
        processing_started_at = NULL,
        scheduled_for = NOW() - INTERVAL '1 second'
    WHERE id = $1 AND queue_status IN ('failed', 'sent', 'processing')
    RETURNING *
  `, [queueId]);
  if (result.rows.length === 0) return null;

  // Remove from active tokens if stuck in processing
  activeItemTokens.delete(queueId);

  console.log(`[StatusBot Queue] ▶️ Admin resumed item ${queueId} (was: ${result.rows[0].queue_status}) — will process with top priority`);
  return result.rows[0];
}

/**
 * Admin force-stop: signal a processing item to stop immediately.
 *
 * Two effects:
 *  1. In-memory signal (forceStopItems + adminStoppedItems Sets) — so the batch
 *     loop exits at the next wave boundary and marks the item as partial.
 *  2. Immediate DB update — flip queue_status from 'processing' to 'sent' with
 *     sent_timed_out=false and the current contacts_sent preserved. This way
 *     the UI reflects "stopped" instantly instead of waiting for the in-flight
 *     WAHA call to return.
 *
 * IDs are UUIDs — we store them as-is (previous code used parseInt which
 * silently coerced UUIDs to NaN and broke the stop mechanism entirely).
 */
async function forceStopItem(queueId) {
  const id = String(queueId);
  forceStopItems.add(id);
  adminStoppedItems.add(id);
  console.log(`[StatusBot Queue] ⏹️ Force-stop requested for item ${id}`);

  try {
    // Immediate DB transition: 'processing' → 'sent' (partial) so UI + queue
    // picker both react right away. The batch loop's cancelCheck and queue-status
    // guard also exit on this state change.
    const r = await db.query(
      `UPDATE status_bot_queue
       SET queue_status = 'sent', sent_at = NOW(), sent_timed_out = false, processing_started_at = NULL
       WHERE id = $1 AND queue_status = 'processing'
       RETURNING contacts_sent, contacts_total`,
      [id]
    );
    if (r.rowCount > 0) {
      console.log(`[StatusBot Queue] ⏹️ Item ${id} marked stopped in DB (sent ${r.rows[0].contacts_sent}/${r.rows[0].contacts_total})`);
    }
  } catch (err) {
    console.warn(`[StatusBot Queue] forceStopItem DB update failed (non-fatal): ${err.message}`);
  }
}

module.exports = {
  startQueueProcessor,
  stopQueueProcessor,
  addToQueue,
  getQueueStats,
  fetchAndCacheContacts,
  isProcessing,
  getCurrentProcessingPromise,
  setProcessingPromiseCallback,
  setGracefulShutdown,
  isGracefulShutdownRequested,
  getStatusTimeout,
  invalidateTimeoutCache,
  invalidateSettingsCache,
  retryQueueItem,
  resumeQueueItem,
  forceStopItem,
};
