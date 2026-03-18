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
const STATUS_DELAY = 30000; // 30 seconds between statuses
const DEFAULT_STATUS_TIMEOUT = 600000; // 10 minutes timeout per status (default)

// Cached timeout value (refreshed every 60 seconds from DB)
let _cachedTimeout = DEFAULT_STATUS_TIMEOUT;
let _cacheTime = 0;

async function getStatusTimeout() {
  const now = Date.now();
  if (now - _cacheTime < 60000) return _cachedTimeout;
  try {
    const result = await db.query(
      `SELECT value FROM system_settings WHERE key = 'statusbot_upload_timeout_minutes'`
    );
    if (result.rows.length > 0) {
      const minutes = parseFloat(JSON.parse(result.rows[0].value));
      if (!isNaN(minutes) && minutes > 0) {
        _cachedTimeout = minutes * 60000;
      } else {
        _cachedTimeout = DEFAULT_STATUS_TIMEOUT;
      }
    } else {
      _cachedTimeout = DEFAULT_STATUS_TIMEOUT;
    }
  } catch (e) {
    _cachedTimeout = DEFAULT_STATUS_TIMEOUT;
  }
  _cacheTime = now;
  return _cachedTimeout;
}

function invalidateTimeoutCache() {
  _cacheTime = 0;
}

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
let isCurrentlyProcessing = false;
let currentProcessingPromise = null;
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
 * Check if currently processing a status
 */
function isProcessing() {
  return isCurrentlyProcessing;
}

/**
 * Get the current processing promise (for graceful shutdown)
 */
function getCurrentProcessingPromise() {
  return currentProcessingPromise;
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
 * Process the queue
 */
async function processQueue() {
  // Don't start new items if graceful shutdown is requested
  if (gracefulShutdownRequested) {
    console.log('[StatusBot Queue] Graceful shutdown in progress, skipping queue check');
    return;
  }

  try {
    // Ensure lock row exists
    await db.query(`INSERT INTO status_bot_queue_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

    // 1. Atomically reset stuck lock (processing started > timeout+60s ago)
    const stuckReset = await db.query(`
      UPDATE status_bot_queue_lock
      SET is_processing = false, processing_started_at = NULL
      WHERE id = 1
        AND is_processing = true
        AND processing_started_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - processing_started_at)) * 1000 > $1
    `, [await getStatusTimeout() + 60000]);
    if (stuckReset.rowCount > 0) {
      console.log('[StatusBot Queue] Stuck processing detected, resetting...');
    }

    // 2. Atomically acquire lock — only if not processing AND delay since last send has passed
    //    Two concurrent workers hitting this will serialize in Postgres; only one gets rowCount=1
    const lockAcquired = await db.query(`
      UPDATE status_bot_queue_lock
      SET is_processing = true, processing_started_at = NOW()
      WHERE id = 1
        AND is_processing = false
        AND (last_sent_at IS NULL OR last_sent_at + ($1 * interval '1 millisecond') <= NOW())
      RETURNING *
    `, [STATUS_DELAY]);
    if (lockAcquired.rowCount === 0) return; // busy or delay not yet passed

    // 3. Get next pending item
    const queueResult = await db.query(`
      SELECT q.*, c.session_name, c.connection_status, c.first_connected_at, c.last_connected_at, c.restriction_lifted, c.short_restriction_until, c.waha_source_id
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.queue_status IN ('pending', 'scheduled') 
        AND c.connection_status = 'connected'
        AND (q.scheduled_for IS NULL OR q.scheduled_for <= NOW())
        AND (c.short_restriction_until IS NULL OR c.short_restriction_until <= NOW())
        AND (
          c.restriction_lifted = true 
          OR c.first_connected_at IS NULL
          OR (COALESCE(c.last_connected_at, c.first_connected_at) + INTERVAL '24 hours') <= NOW()
        )
      ORDER BY COALESCE(q.scheduled_for, '1970-01-01'::timestamp) ASC, q.created_at ASC
      LIMIT 1
    `);

    if (queueResult.rows.length === 0) {
      // Release lock — nothing to process
      await db.query(`UPDATE status_bot_queue_lock SET is_processing = false, processing_started_at = NULL WHERE id = 1`);
      // Diagnose why: are there pending items being blocked?
      const blockedResult = await db.query(`
        SELECT q.id, q.connection_id, q.queue_status, q.created_at,
               c.connection_status, c.restriction_lifted, c.short_restriction_until,
               c.first_connected_at, c.last_connected_at
        FROM status_bot_queue q
        JOIN status_bot_connections c ON c.id = q.connection_id
        WHERE q.queue_status IN ('pending', 'scheduled')
          AND (q.scheduled_for IS NULL OR q.scheduled_for <= NOW())
        LIMIT 5
      `);
      if (blockedResult.rows.length > 0) {
        for (const row of blockedResult.rows) {
          const now = new Date();
          const notConnected = row.connection_status !== 'connected';
          const shortUntil = row.short_restriction_until ? new Date(row.short_restriction_until) : null;
          const shortRestriction = shortUntil && shortUntil > now;
          const restrictionActive = row.restriction_lifted !== true; // false or null
          const baseTime = row.last_connected_at || row.first_connected_at;
          const unlocksAt = baseTime ? new Date(new Date(baseTime).getTime() + 24 * 60 * 60 * 1000) : null;
          const longRestriction = restrictionActive && unlocksAt && unlocksAt > now;

          let reason;
          if (notConnected) {
            reason = `connection_status=${row.connection_status}`;
          } else if (shortRestriction) {
            const minsLeft = Math.ceil((shortUntil - now) / 60000);
            reason = `short restriction active, unlocks in ${minsLeft}min (${shortUntil.toISOString()})`;
          } else if (longRestriction) {
            const hoursLeft = ((unlocksAt - now) / 3600000).toFixed(1);
            reason = `24h restriction active, unlocks in ${hoursLeft}h (${unlocksAt.toISOString()})`;
          } else {
            reason = `unknown — connection_status=${row.connection_status}, restriction_lifted=${row.restriction_lifted}, last_connected_at=${row.last_connected_at}`;
          }
          console.log(`[StatusBot] ⏸️ Queue item id=${row.id} conn=${row.connection_id} BLOCKED: ${reason}`);
        }
      }
      return;
    }

    const item = queueResult.rows[0];

    // 4. Atomically claim the queue item — defense-in-depth against any edge case
    const claimed = await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'processing', processing_started_at = NOW()
      WHERE id = $1 AND queue_status IN ('pending', 'scheduled')
      RETURNING id
    `, [item.id]);
    if (claimed.rowCount === 0) {
      // Item was already claimed (shouldn't happen, but safe to handle)
      await db.query(`UPDATE status_bot_queue_lock SET is_processing = false, processing_started_at = NULL WHERE id = 1`);
      return;
    }

    const scheduledAt = item.scheduled_for ? new Date(item.scheduled_for) : null;
    const createdAt = new Date(item.created_at);
    const now = new Date();
    const scheduledInfo = scheduledAt
      ? `scheduled=${scheduledAt.toISOString()}, delay=${Math.round((now - scheduledAt) / 1000)}s late`
      : `created=${createdAt.toISOString()}, queued=${Math.round((now - createdAt) / 1000)}s ago`;
    const uploaderInfo = item.source_phone ? `uploader=${item.source_phone}` : `source=${item.source || 'web'}`;
    console.log(`[StatusBot] 🚀 Uploading status id=${item.id} type=${item.status_type} ${uploaderInfo} ${scheduledInfo}`);

    // Track processing state for graceful shutdown
    isCurrentlyProcessing = true;
    
    // Emit socket event for admin monitoring
    emitToAdmin('statusbot:processing_start', {
      id: item.id,
      statusType: item.status_type,
      connectionId: item.connection_id,
      source: item.source,
      sourcePhone: item.source_phone,
      timestamp: new Date().toISOString()
    });
    
    try {
      // Process the status and track the promise
      const sendPromise = sendStatus(item);
      currentProcessingPromise = sendPromise;
      
      // Notify callback if set (for worker graceful shutdown)
      if (processingPromiseCallback) {
        processingPromiseCallback(sendPromise);
      }
      
      const sendResult = await sendPromise;

      // Mark as sent
      await db.query(`
        UPDATE status_bot_queue 
        SET queue_status = 'sent', sent_at = NOW()
        WHERE id = $1
      `, [item.id]);

      // Update lock
      await db.query(`
        UPDATE status_bot_queue_lock 
        SET is_processing = false, processing_started_at = NULL, 
            last_sent_at = NOW(), last_sent_connection_id = $1
        WHERE id = 1
      `, [item.connection_id]);

      const uploadDuration = Math.round((Date.now() - now.getTime()) / 1000);
      if (sendResult?.timeout) {
        console.log(`[StatusBot] ⏱️ Status id=${item.id} type=${item.status_type} TIMEOUT after ${uploadDuration}s (treating as success)`);
      } else {
        console.log(`[StatusBot] ✅ Status id=${item.id} type=${item.status_type} confirmed uploaded in ${uploadDuration}s`);
      }

      // Send WhatsApp notification if this was from WhatsApp and was scheduled
      await sendStatusNotification(item, true);
      
      // Emit socket event for admin monitoring
      emitToAdmin('statusbot:processing_end', {
        id: item.id,
        success: true,
        timestamp: new Date().toISOString()
      });
      
      // Clear processing state
      isCurrentlyProcessing = false;
      currentProcessingPromise = null;

    } catch (sendError) {
      const isTimeout = sendError.message?.includes('timeout') || sendError.message?.includes('TIMEOUT');
      console.error(`[StatusBot] ❌ Status id=${item.id} ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${sendError.message}`);
      
      // Emit socket event for admin monitoring
      emitToAdmin('statusbot:processing_end', {
        id: item.id,
        success: false,
        error: sendError.message,
        timestamp: new Date().toISOString()
      });

      // Update as failed
      await db.query(`
        UPDATE status_bot_queue 
        SET queue_status = 'failed', error_message = $1, retry_count = retry_count + 1
        WHERE id = $2
      `, [sendError.message, item.id]);

      // Release lock
      await db.query(`
        UPDATE status_bot_queue_lock 
        SET is_processing = false, processing_started_at = NULL
        WHERE id = 1
      `);

      // Send failure notification if from WhatsApp
      await sendStatusNotification(item, false, sendError.message);
      
      // Clear processing state
      isCurrentlyProcessing = false;
      currentProcessingPromise = null;
    }

  } catch (error) {
    console.error('[StatusBot Queue] Process error:', error.message);
    
    // Try to release lock on error
    try {
      await db.query(`
        UPDATE status_bot_queue_lock 
        SET is_processing = false, processing_started_at = NULL
        WHERE id = 1
      `);
    } catch (e) {}
  }
}

/**
 * Send a status via WAHA
 */
async function sendStatus(queueItem) {
  const { baseUrl, apiKey } = await getWahaCredentialsForConnection(queueItem);
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
      // Treat 500 errors like timeout: WhatsApp may have processed the status despite the error
      if (err.response?.status === 500) {
        console.log(`[StatusBot] ⚠️ Status id=${queueItem.id} WAHA 500 - treating as uncertain upload`);
        return { uncertain: true, id: messageId };
      }
      throw err;
    });

  const response = await Promise.race([sendPromise, timeoutPromise]);

  // Handle timeout or uncertain (500) as success
  if (response?.timeout || response?.uncertain) {
    if (response.uncertain && historyId) {
      await db.query(`UPDATE status_bot_statuses SET uncertain_upload = true WHERE id = $1`, [historyId]);
      console.log(`[StatusBot] ⚠️ Status id=${queueItem.id} uncertain upload (WAHA 500) - awaiting first view`);
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
      COUNT(*) FILTER (WHERE queue_status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as failed_today
    FROM status_bot_queue
  `);

  const lockResult = await db.query(`
    SELECT last_sent_at FROM status_bot_queue_lock WHERE id = 1
  `);

  return {
    ...result.rows[0],
    lastSentAt: lockResult.rows[0]?.last_sent_at
  };
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
};
