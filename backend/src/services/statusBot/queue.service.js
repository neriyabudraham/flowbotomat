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

// Generic settings cache (refreshed every 60 seconds from DB)
const _settingsCache = {};
const _settingsCacheTime = {};

async function getSettingFloat(key, defaultValue) {
  const now = Date.now();
  if (_settingsCacheTime[key] && now - _settingsCacheTime[key] < 60000) {
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
function startQueueProcessor() {
  if (isRunning) {
    console.log('[StatusBot Queue] Already running');
    return;
  }

  isRunning = true;
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

    // If stopped early due to timeouts, re-queue to continue with remaining contacts
    const MAX_SEND_RETRIES = 3;
    if (sendResult?.stoppedEarly && (item.retry_count || 0) < MAX_SEND_RETRIES) {
      const retryPauseMinutes = await getSettingFloat('statusbot_contacts_retry_pause_minutes', 3);
      console.log(`[StatusBot] ⏸️ Status id=${item.id} stopped early (${sendResult.contactsSent}/${sendResult.totalContacts} sent, retry ${(item.retry_count || 0) + 1}/${MAX_SEND_RETRIES}) — re-queuing in ${retryPauseMinutes}min`);
      await db.query(
        `UPDATE status_bot_queue
         SET queue_status = 'pending', processing_started_at = NULL,
             scheduled_for = NOW() + ($2 * interval '1 minute'),
             retry_count = COALESCE(retry_count, 0) + 1
         WHERE id = $1`,
        [item.id, retryPauseMinutes]
      );
      activeItemTokens.delete(item.id);
      emitToAdmin('statusbot:processing_end', {
        id: item.id, success: true, stoppedEarly: true,
        contactsSent: sendResult.contactsSent, totalContacts: sendResult.totalContacts,
        timestamp: new Date().toISOString()
      });
      return;
    }

    await db.query(
      `UPDATE status_bot_queue SET queue_status = 'sent', sent_at = NOW(), sent_timed_out = $2 WHERE id = $1`,
      [item.id, !!sendResult?.timeout]
    );

    const uploadDuration = Math.round((Date.now() - now.getTime()) / 1000);
    if (sendResult?.stoppedEarly) {
      console.log(`[StatusBot] ⚠️ Status id=${item.id} type=${item.status_type} completed with partial send (${sendResult.contactsSent}/${sendResult.totalContacts}) in ${uploadDuration}s`);
    } else if (sendResult?.timeout) {
      console.log(`[StatusBot] ⏱️ Status id=${item.id} type=${item.status_type} TIMEOUT after ${uploadDuration}s (treating as success)`);
    } else {
      console.log(`[StatusBot] ✅ Status id=${item.id} type=${item.status_type} confirmed uploaded in ${uploadDuration}s`);
    }

    await sendStatusNotification(item, true);

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
            AND (q4.retry_count > 0 OR q4.scheduled_for IS NULL OR q4.scheduled_for <= NOW())
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
      ORDER BY q.created_at ASC
      LIMIT $2
    `, [delaySeconds, Math.ceil(maxTotal * 3)]);

    if (candidates.rows.length === 0) {
      // Diagnose blocked items
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
        const restrictionActive = row.restriction_lifted !== true;

        let reason;
        if (notConnected) {
          reason = `connection_status=${row.connection_status}`;
        } else if (shortRestriction) {
          const minsLeft = Math.ceil((shortUntil - now) / 60000);
          reason = `short restriction active, unlocks in ${minsLeft}min`;
        } else if (restrictionActive) {
          if (row.restriction_until) {
            const left = new Date(row.restriction_until) - now;
            if (left > 0) reason = `restriction_until active, ${(left / 3600000).toFixed(1)}h left (${row.restriction_until})`;
          }
          if (!reason) {
            const base = row.last_connected_at || row.first_connected_at;
            const unlocks = base ? new Date(new Date(base).getTime() + 24 * 60 * 60 * 1000) : null;
            if (unlocks && unlocks > now) reason = `24h restriction, ${((unlocks - now) / 3600000).toFixed(1)}h left`;
          }
          if (!reason) reason = `restriction_lifted=${row.restriction_lifted}`;
        } else {
          reason = `per-connection delay or source limit`;
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
        SET queue_status = 'processing', processing_started_at = NOW()
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
    console.log(`[StatusBot] 🔄 Pre-converting ${type} via WAHA...`);
    const result = await wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, { url: fileUrl });
    if (result?.data && result?.mimetype) {
      console.log(`[StatusBot] ✅ Pre-converted ${type}: ${result.mimetype}`);
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
  await db.query(
    `UPDATE status_bot_connections
     SET contacts_cache = $1, contacts_cache_synced_at = NOW(), contacts_cache_count = $2
     WHERE id = $3`,
    [JSON.stringify(contacts), contacts.length, connectionId]
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
    console.log(`${LOG} All ${rawLids.length} LIDs resolved from DB cache`);
    return lidToPhone;
  }

  // 3. Fetch from WAHA /lids API
  console.log(`${LOG} ${lidToPhone.size}/${rawLids.length} resolved from cache, fetching ${unresolved.length} from WAHA...`);
  try {
    const lidsData = await wahaSession.makeRequest(
      baseUrl, apiKey, 'GET',
      `/api/${sessionName}/lids?limit=999999&offset=0`
    );

    if (Array.isArray(lidsData) && lidsData.length > 0) {
      console.log(`${LOG} WAHA returned ${lidsData.length} LID mappings`);

      // Build bulk upsert to cache all mappings
      const values = [];
      const params = [];
      let idx = 1;
      for (const entry of lidsData) {
        const lid = entry.lid?.replace(/@.*/, '');
        const phone = entry.pn?.replace(/@.*/, '');
        if (!lid || !phone) continue;

        // Populate return map
        lidToPhone.set(lid, phone);

        // Prepare DB upsert
        values.push(`($${idx++}, $${idx++}, $${idx++}, NOW(), NOW())`);
        params.push(userId, lid, phone);
      }

      // Bulk upsert into whatsapp_lid_mapping
      if (values.length > 0) {
        await db.query(
          `INSERT INTO whatsapp_lid_mapping (user_id, lid, phone, created_at, updated_at)
           VALUES ${values.join(',')}
           ON CONFLICT (user_id, lid) DO UPDATE SET phone = EXCLUDED.phone, updated_at = NOW()`,
          params
        ).catch(e => console.warn(`${LOG} DB cache save error: ${e.message}`));
      }
    }
  } catch (e) {
    console.error(`${LOG} ❌ WAHA /lids API error (session=${sessionName}): ${e.message}`);
    if (e.response?.data) console.error(`${LOG} Response:`, JSON.stringify(e.response.data).slice(0, 500));
  }

  const stillUnresolved = rawLids.filter(lid => !lidToPhone.has(lid));
  if (stillUnresolved.length > 0) {
    console.warn(`${LOG} ⚠️ ${stillUnresolved.length} LIDs could not be resolved — will be excluded from status send`);
  }
  console.log(`${LOG} Final: ${lidToPhone.size}/${rawLids.length} LIDs resolved`);

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
async function sendStatusWithContacts(queueItem, { baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile, processingToken, viewersOnly = false }) {
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

  // 0. On retry: find contacts that were already successfully sent
  const alreadySentPhones = new Set();
  if (historyId) {
    const sentResult = await db.query(
      `SELECT DISTINCT phone FROM status_bot_contact_sends WHERE history_id = $1 AND success = true`,
      [historyId]
    );
    for (const row of sentResult.rows) {
      alreadySentPhones.add(row.phone);
    }
    if (alreadySentPhones.size > 0) {
      console.log(`${LOG_PREFIX} 🔄 Retry mode: skipping ${alreadySentPhones.size} already-sent contacts`);
    }
  }

  // 1. Get engaged phone numbers ranked by total engagement (views + reactions + replies)
  //    Most active viewers first, least active last.
  console.log(`${LOG_PREFIX} 👁️ Querying engaged contacts ranked by engagement...`);
  const viewersResult = await db.query(`
    SELECT phone, SUM(cnt) AS total_engagement FROM (
      SELECT sbv.viewer_phone AS phone, COUNT(*) AS cnt
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbs.id = sbv.status_id
      WHERE sbs.connection_id = $1
      GROUP BY sbv.viewer_phone
      UNION ALL
      SELECT sbr.reactor_phone AS phone, COUNT(*) AS cnt
      FROM status_bot_reactions sbr
      JOIN status_bot_statuses sbs ON sbs.id = sbr.status_id
      WHERE sbs.connection_id = $1
      GROUP BY sbr.reactor_phone
      UNION ALL
      SELECT sbrep.replier_phone AS phone, COUNT(*) AS cnt
      FROM status_bot_replies sbrep
      JOIN status_bot_statuses sbs ON sbs.id = sbrep.status_id
      WHERE sbs.connection_id = $1
      GROUP BY sbrep.replier_phone
    ) engaged
    GROUP BY phone
    ORDER BY total_engagement DESC
  `, [queueItem.connection_id]);
  const viewerPhones = new Set(viewersResult.rows.map(r => r.phone));
  // Ordered array: most engaged first
  const viewerPhonesRanked = viewersResult.rows.map(r => r.phone);
  console.log(`${LOG_PREFIX} 👁️ Found ${viewerPhones.size} unique engaged contacts (ranked by engagement)`);

  let orderedContacts;

  if (viewersOnly) {
    // ── viewersOnly: use viewer phones from DB directly — no WAHA contacts fetch needed ──
    console.log(`${LOG_PREFIX} 👁️ viewersOnly mode — using ${viewerPhones.size} viewer phones directly from DB`);

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
    console.log(`${LOG_PREFIX} 👁️ viewersOnly: ${orderedContacts.length} contacts to send (skipped ${alreadySentPhones.size} already-sent)`);

  } else {
    // ── Full contacts mode: fetch WAHA contacts, order viewers first ──
    let ownId = null;
    try {
      console.log(`${LOG_PREFIX} 🔍 Fetching own session ID from WAHA...`);
      const me = await wahaSession.makeRequest(baseUrl, apiKey, 'GET', `/api/sessions/${sessionName}/me`);
      ownId = me?.id;
      console.log(`${LOG_PREFIX} ✅ Own ID: ${ownId}`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} ⚠️ Could not get own ID — will proceed without it. Error: ${err.message}`);
    }

    // Get contacts from WAHA cache
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    console.log(`${LOG_PREFIX} 📦 Checking contacts cache...`);
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
      const cacheAgeHours = (cacheAgeMs / 3600000).toFixed(1);
      console.log(`${LOG_PREFIX} ✅ Using DB cache: ${allContacts.length} contacts (${cacheAgeHours}h old)`);
    } else {
      const reason = cacheAgeMs === Infinity ? 'never synced' : `cache ${(cacheAgeMs / 3600000).toFixed(1)}h old (>24h)`;
      console.log(`${LOG_PREFIX} 🔄 Cache stale — fetching fresh contacts from WAHA. Reason: ${reason}`);
      allContacts = await fetchAndCacheContacts(baseUrl, apiKey, sessionName, queueItem.connection_id);
      console.log(`${LOG_PREFIX} ✅ Fetched ${allContacts.length} contacts from WAHA and saved to cache`);
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
      console.log(`${LOG_PREFIX} 🔗 Resolved ${lidToPhone.size}/${lidContacts.length} LID contacts to phone numbers`);
    }

    // Build ordered contact list: own phone → viewers (ranked by engagement) → non-viewers
    // IMPORTANT: Convert all LID contacts to phone@c.us format — LIDs cannot receive statuses
    const seen = new Set();
    const ownPhone = ownId ? ownId.replace(/@.*/, '') : null;
    if (ownPhone) seen.add(ownPhone);
    orderedContacts = [];
    if (ownPhone && !alreadySentPhones.has(ownPhone)) {
      orderedContacts.push(ownId);
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

    // Add viewers in engagement-ranked order (most active first)
    for (const phone of viewerPhonesRanked) {
      const jid = phoneToJid.get(phone);
      if (jid) orderedContacts.push(jid);
    }

    if (skippedLids > 0) {
      console.log(`${LOG_PREFIX} ⚠️ Skipped ${skippedLids} unresolvable LID contacts`);
    }
    orderedContacts.push(...nonViewers);
  }
  // Safety filter: remove LID contacts AND fake phone numbers (digits > 15 = LID disguised as phone)
  const preFilterCount = orderedContacts.length;
  orderedContacts = orderedContacts.filter(jid => {
    if (jid.includes('@lid')) return false;
    // Real phone numbers have max ~12 digits (with country code). Longer = LID disguised as phone
    const digits = jid.split('@')[0];
    if (digits.length > 12) return false;
    return true;
  });
  if (orderedContacts.length < preFilterCount) {
    console.warn(`${LOG_PREFIX} ⚠️ Safety filter removed ${preFilterCount - orderedContacts.length} LID contacts from final list`);
  }

  const VIEWER_MEGA_BATCH_CAP = await getSettingFloat('statusbot_contacts_viewer_batch_cap', 5000);
  const WAVE_DELAY_MS = await getSettingFloat('statusbot_contacts_wave_delay_ms', 30000); // 30s between non-viewer waves

  // 5. Build batches
  const previouslySent = alreadySentPhones.size; // contacts sent in prior attempts
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
  console.log(`${LOG_PREFIX} 📋 Contact order built: ${orderedContacts.length} total (skipped ${alreadySentPhones.size} already-sent) | viewerBatches:${viewerBatchCount} nonViewerBatches:${nonViewerBatchCount} | BATCH_SIZE=${BATCH_SIZE}`);
  console.log(`${LOG_PREFIX} 🚀 Sending ${totalBatches} batches with parallelism=${PARALLEL_BATCHES}`);

  // Process batches in waves of PARALLEL_BATCHES
  let isFirstNonViewerWave = true;
  for (let waveStart = 0; waveStart < allBatches.length; waveStart += PARALLEL_BATCHES) {
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

    const wave = allBatches.slice(waveStart, waveStart + PARALLEL_BATCHES);

    // Add 30s delay between non-viewer waves (not the first one right after viewers)
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
      } else if (WAVE_DELAY_MS > 0) {
        console.log(`${LOG_PREFIX} ⏳ Waiting ${WAVE_DELAY_MS / 1000}s before next wave...`);
        await new Promise(resolve => setTimeout(resolve, WAVE_DELAY_MS));
      }
    }

    console.log(`${LOG_PREFIX} 🌊 Wave ${Math.floor(waveStart / PARALLEL_BATCHES) + 1} — sending batches ${wave[0].batchNum}-${wave[wave.length - 1].batchNum} in parallel${wave[0].isViewerBatch ? ' (viewers)' : ''}`);

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

      console.log(`${LOG_PREFIX} 📤 Batch ${batchNum}/${totalBatches} — sending to ${batch.length} contacts (contacts: ${batch.slice(0,3).join(', ')}${batch.length > 3 ? ` ...+${batch.length - 3}` : ''}) timeout=${batchTimeoutMs}ms${isViewerBatch ? ` retries=${maxRetries}` : ''}`);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const batchStart = Date.now();
        try {
          const sendPromise = wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, body);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('BATCH_TIMEOUT')), batchTimeoutMs)
          );
          const wahaResponse = await Promise.race([sendPromise, timeoutPromise]);
          const batchDurationMs = Date.now() - batchStart;
          console.log(`${LOG_PREFIX} ✅ Batch ${batchNum}/${totalBatches} OK in ${batchDurationMs}ms${attempt > 0 ? ` (attempt ${attempt + 1})` : ''} | WAHA resp id: ${wahaResponse?.id || 'n/a'}`);
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
    console.log(`${LOG_PREFIX} 🌊 Wave done — cumulative sent: ${totalSent}/${orderedContacts.length} (${progressPct}%) | timeouts in wave: ${waveTimeouts}/${wave.length}`);

    // Check force-stop immediately after wave completes (don't wait for next loop iteration)
    if (forceStopItems.has(queueItem.id)) {
      forceStopItems.delete(queueItem.id);
      console.log(`${LOG_PREFIX} ⏹️ Admin force-stopped item after wave — finishing with ${totalSent} contacts sent so far`);
      stoppedEarly = true;
      break;
    }

    // Heartbeat + progress: keep processing_started_at fresh and update send progress
    // Report cumulative totals (including contacts sent in prior retry attempts)
    // Only update if still in 'processing' state (prevents fighting with stuck reset)
    const cumulativeSent = previouslySent + totalSent;
    const cumulativeTotal = previouslySent + orderedContacts.length;
    await db.query(
      `UPDATE status_bot_queue SET processing_started_at = NOW(), contacts_sent = $2, contacts_total = $3 WHERE id = $1 AND queue_status = 'processing'`,
      [queueItem.id, cumulativeSent, cumulativeTotal]
    ).catch(() => {});

    // Timeout handling: if ALL batches in this wave timed out, it counts as consecutive
    if (waveTimeouts === wave.length) {
      consecutiveTimeouts++;
      if (consecutiveTimeouts < MAX_CONSECUTIVE_TIMEOUTS) {
        console.log(`${LOG_PREFIX} ⏸️ Entire wave timed out (${consecutiveTimeouts}/${MAX_CONSECUTIVE_TIMEOUTS}) — pausing ${PAUSE_MS / 1000}s before continuing...`);
        await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
        console.log(`${LOG_PREFIX} ▶️ Resuming after pause`);
      } else {
        const remaining = orderedContacts.length - totalSent;
        console.warn(`${LOG_PREFIX} 🛑 ${MAX_CONSECUTIVE_TIMEOUTS} consecutive full-wave timeouts — stopping early. totalSent=${totalSent}/${orderedContacts.length} remaining≈${remaining} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`);
        stoppedEarly = true;
      }
    } else {
      consecutiveTimeouts = 0; // reset if at least one batch succeeded without timeout
    }
  }

  // If we never hit non-viewer wave (all contacts were viewers or skipped), mark viewers_done now
  if (isFirstNonViewerWave) {
    await db.query(`UPDATE status_bot_queue SET viewers_done = true WHERE id = $1`, [queueItem.id]).catch(() => {});
    console.log(`${LOG_PREFIX} ✅ All contacts were viewers — viewers_done marked`);
    emitToAdmin('statusbot:viewers_done', { id: queueItem.id, connectionId: queueItem.connection_id });
  }

  const totalElapsedSec = Math.round((Date.now() - startTime) / 1000);
  const cumulativeFinalSent = previouslySent + totalSent;
  const cumulativeFinalTotal = previouslySent + orderedContacts.length;

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
      console.log(`[StatusBot Queue] 🆔 Got new message ID: ${messageId} for queue item ${queueItem.id}`);

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
    console.log(`[StatusBot Queue] 🆔 Using existing message ID: ${messageId} for queue item ${queueItem.id}`);
  }
  
  // Save to history BEFORE sending - this allows view tracking from the start
  // even if the send times out or takes a long time
  const historyMessageId = messageId || `pending_${queueItem.id}`;
  console.log(`[StatusBot Queue] 💾 Pre-saving to history for view tracking with waha_message_id: ${historyMessageId}`);
  
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

  // Contacts format: send in batches with explicit contact list
  if (queueItem.status_send_format === 'contacts') {
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
    // ── Viewers-first mode: send to viewers in batches, then broadcast to all ──
    console.log(`[StatusBot] 📋 Viewers-first mode: sending to viewers, then broadcasting`);
    const viewersResult = await sendStatusWithContacts(queueItem, {
      baseUrl, apiKey, sessionName, messageId, historyId, preConvertedFile,
      processingToken: queueItem._processingToken,
      viewersOnly: true,
    });
    const viewersSent = viewersResult?.contactsSent || 0;
    console.log(`[StatusBot] ✅ Viewers done: ${viewersSent} sent — now broadcasting to all`);

    const broadcastResult = await sendDefaultBroadcast(queueItem, {
      baseUrl, apiKey, sessionName, messageId, historyId, historyMessageId, content, preConvertedFile,
    });
    return { ...broadcastResult, contactsSent: viewersSent };

  } else {
    // ── Classic mode (default): broadcast to all first, on timeout → send to viewers ──
    console.log(`[StatusBot] 📡 Classic mode: broadcasting to all first`);
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
async function sendStatusNotification(item, success, errorMessage = null) {
  try {
    // Only send notification if source is WhatsApp
    if (item.source !== 'whatsapp' || !item.source_phone) {
      return;
    }

    // For success notifications: only notify for scheduled statuses
    // "Send now" statuses already got immediate feedback
    // For failure notifications: always notify (user needs the retry button)
    if (success) {
      if (!item.scheduled_for) {
        return;
      }
      // Check if scheduled was within 24 hours (we can notify within WhatsApp window)
      const scheduledTime = new Date(item.scheduled_for);
      const createdTime = new Date(item.created_at);
      const hoursUntilScheduled = (scheduledTime - createdTime) / (1000 * 60 * 60);
      if (hoursUntilScheduled > 24) {
        return;
      }
    }

    const phone = item.source_phone;
    const statusId = item.status_message_id || item.id;

    if (success) {
      // Send success notification with action list
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
        ]
      }];

      await cloudApi.sendListMessage(
        phone,
        `✅ הסטטוס המתוזמן עלה בהצלחה!\n\nבחר פעולה`,
        'בחר פעולה',
        sections
      );

      // Update conversation state to after_send_menu
      await db.query(`
        UPDATE cloud_api_conversation_states 
        SET state = 'after_send_menu', state_data = $1, last_message_at = NOW(), connection_id = $2
        WHERE phone_number = $3
      `, [JSON.stringify({ queuedStatusId: statusId }), item.connection_id, phone]);

    } else {
      // Send failure notification with retry button
      const statusId = item.status_message_id || item.id;
      await cloudApi.sendButtonMessage(
        phone,
        `❌ שגיאה בהעלאת הסטטוס${item.scheduled_for ? ' המתוזמן' : ''}\n\n${errorMessage || 'שגיאה לא ידועה'}\n\nלחץ למטה כדי לנסות שוב:`,
        [{ id: `queued_retry_${item.id}`, title: '🔄 העלה מחדש' }]
      );

      // Update conversation state so the button click is handled
      await db.query(`
        UPDATE cloud_api_conversation_states
        SET state = 'after_send_menu', state_data = $1, last_message_at = NOW(), connection_id = $2
        WHERE phone_number = $3
      `, [JSON.stringify({ queuedStatusId: statusId }), item.connection_id, phone]);
    }

    console.log(`[StatusBot Queue] Sent notification to ${phone} for status ${item.id} (success: ${success})`);
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
 * Admin force-stop: signal a processing item to stop immediately.
 * The item will finish its current batch then mark as sent (partial).
 */
function forceStopItem(queueId) {
  const id = typeof queueId === 'number' ? queueId : parseInt(queueId, 10);
  forceStopItems.add(id);
  console.log(`[StatusBot Queue] ⏹️ Force-stop requested for item ${id}`);
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
  forceStopItem,
};
