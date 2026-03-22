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
      // 422 "Session does not exist" → user was migrated to a different WAHA server.
      // Attempt to auto-heal from the main whatsapp_connections record, then retry once.
      const isSessionMissing =
        firstError.message?.includes('422') ||
        firstError.message?.includes('does not exist') ||
        firstError.response?.status === 422;

      if (isSessionMissing) {
        console.log(`[StatusBot] ⚠️ Session not found (422) for item ${item.id} — attempting auto-heal...`);
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

    await db.query(
      `UPDATE status_bot_queue SET queue_status = 'sent', sent_at = NOW(), sent_timed_out = $2 WHERE id = $1`,
      [item.id, !!sendResult?.timeout]
    );

    const uploadDuration = Math.round((Date.now() - now.getTime()) / 1000);
    if (sendResult?.timeout) {
      console.log(`[StatusBot] ⏱️ Status id=${item.id} type=${item.status_type} TIMEOUT after ${uploadDuration}s (treating as success)`);
    } else {
      console.log(`[StatusBot] ✅ Status id=${item.id} type=${item.status_type} confirmed uploaded in ${uploadDuration}s`);
    }

    await sendStatusNotification(item, true);

    emitToAdmin('statusbot:processing_end', { id: item.id, success: true, timestamp: new Date().toISOString() });

  } catch (sendError) {
    const isTimeout = sendError.message?.includes('timeout') || sendError.message?.includes('TIMEOUT');
    console.error(`[StatusBot] ❌ Status id=${item.id} ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${sendError.message}`);
    if (!isTimeout) console.error(sendError.stack || sendError);

    await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'failed', error_message = $1, retry_count = retry_count + 1
      WHERE id = $2
    `, [sendError.message, item.id]);

    await sendStatusNotification(item, false, sendError.message);

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
    const [maxTotal, maxPerSource, delaySeconds, timeout] = await Promise.all([
      getSettingFloat('statusbot_max_parallel_total', 5),
      getSettingFloat('statusbot_max_parallel_per_source', 2),
      getSettingFloat('statusbot_delay_between_statuses_seconds', 30),
      getStatusTimeout(),
    ]);

    // 1. Reset stuck items (processing started > timeout+60s ago)
    const stuckReset = await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'pending', processing_started_at = NULL
      WHERE queue_status = 'processing'
        AND processing_started_at < NOW() - ($1 * interval '1 millisecond')
      RETURNING id
    `, [timeout + 60000]);
    if (stuckReset.rowCount > 0) {
      console.log(`[StatusBot Queue] Reset ${stuckReset.rowCount} stuck item(s)`);
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
      SELECT q.*, c.session_name, c.connection_status, c.waha_source_id,
             c.restriction_lifted, c.short_restriction_until, c.restriction_until,
             c.first_connected_at, c.last_connected_at
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
      ORDER BY COALESCE(q.scheduled_for, '1970-01-01'::timestamp) ASC, q.created_at ASC
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
        console.log(`[StatusBot] ⏸️ Queue item id=${row.id} conn=${row.connection_id} BLOCKED: ${reason}`);
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
          `UPDATE status_bot_connections SET session_name = $1, waha_source_id = $2, updated_at = NOW() WHERE id = $3`,
          [healed.sessionName, sourceId, connectionId]
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
      // Continue without message ID
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

  // Build request body based on status type
  // WAHA uses /api/{session}/status/... format
  let endpoint;
  let body;

  switch (queueItem.status_type) {
    case 'text':
      endpoint = `/api/${sessionName}/status/text`;
      body = {
        id: messageId,
        contacts: null,
        text: content.text,
        backgroundColor: content.backgroundColor || '#38b42f',
        font: content.font || 0,
        linkPreview: content.linkPreview !== false,
        linkPreviewHighQuality: false
      };
      break;

    case 'image':
      endpoint = `/api/${sessionName}/status/image`;
      body = {
        id: messageId,
        contacts: null,
        file: buildFileObject(content, 'image'),
        caption: content.caption || ''
      };
      break;

    case 'video':
      endpoint = `/api/${sessionName}/status/video`;
      body = {
        id: messageId,
        contacts: null,
        file: buildFileObject(content, 'video'),
        convert: true,
        caption: content.caption || ''
      };
      break;

    case 'voice':
      endpoint = `/api/${sessionName}/status/voice`;
      body = {
        id: messageId,
        contacts: null,
        file: buildFileObject(content, 'voice'),
        convert: true,
        backgroundColor: content.backgroundColor || '#38b42f'
      };
      break;

    default:
      throw new Error(`Unknown status type: ${queueItem.status_type}`);
  }

  // Send the status with timeout
  const timeoutMs = await getStatusTimeout();
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ timeout: true, id: messageId }), timeoutMs);
  });

  const sendPromise = wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, body)
    .catch(err => {
      const status = err.response?.status;
      // Treat 500/502/503/504 as uncertain: the request may have reached WhatsApp before the error
      if (status === 500 || status === 502 || status === 503 || status === 504) {
        console.log(`[StatusBot] ⚠️ Status id=${queueItem.id} WAHA ${status} - treating as uncertain upload`);
        return { uncertain: true, id: messageId };
      }
      throw err;
    });

  const response = await Promise.race([sendPromise, timeoutPromise]);

  // Handle timeout or uncertain (500) as success
  if (response?.timeout || response?.uncertain) {
    if (response.uncertain && historyId) {
      await db.query(`UPDATE status_bot_statuses SET uncertain_upload = true WHERE id = $1`, [historyId]);
      console.log(`[StatusBot] ⚠️ Status id=${queueItem.id} uncertain upload (WAHA 5xx) - awaiting first view`);
    } else {
      console.log(`[StatusBot] ⏱️ Status id=${queueItem.id} TIMEOUT - treating as successful, msgId=${messageId}`);
    }
    return { success: true, timeout: !!response.timeout, uncertain: !!response.uncertain, id: messageId };
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

    // Check if this was a scheduled status - we only notify for scheduled ones
    // "Send now" statuses already got immediate feedback
    if (!item.scheduled_for) {
      return;
    }

    // Check if scheduled was within 24 hours (we can notify within WhatsApp window)
    const scheduledTime = new Date(item.scheduled_for);
    const createdTime = new Date(item.created_at);
    const hoursUntilScheduled = (scheduledTime - createdTime) / (1000 * 60 * 60);

    // If scheduled >24h ahead, don't notify (outside WhatsApp window)
    if (hoursUntilScheduled > 24) {
      return;
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
      // Send failure notification
      await cloudApi.sendTextMessage(
        phone,
        `❌ שגיאה בהעלאת הסטטוס המתוזמן\n\n${errorMessage || 'שגיאה לא ידועה'}`
      );
    }

    console.log(`[StatusBot Queue] Sent notification to ${phone} for status ${item.id} (success: ${success})`);
  } catch (notifyError) {
    // Don't fail the whole process if notification fails
    console.error(`[StatusBot Queue] Failed to send notification:`, notifyError.message);
  }
}

module.exports = {
  startQueueProcessor,
  stopQueueProcessor,
  addToQueue,
  getQueueStats,
  isProcessing,
  getCurrentProcessingPromise,
  setProcessingPromiseCallback,
  setGracefulShutdown,
  isGracefulShutdownRequested,
  getStatusTimeout,
  invalidateTimeoutCache,
  invalidateSettingsCache,
};
