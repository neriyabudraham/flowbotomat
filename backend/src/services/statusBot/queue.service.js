/**
 * Status Bot Queue Service
 * Processes status uploads with 30-second delay between each status globally
 */

const db = require('../../config/database');
const wahaSession = require('../../services/waha/session.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const cloudApi = require('../cloudApi/cloudApi.service');

const QUEUE_INTERVAL = 5000; // Check queue every 5 seconds
const STATUS_DELAY = 30000; // 30 seconds between statuses
const STATUS_TIMEOUT = 180000; // 3 minutes timeout per status

let isRunning = false;
let intervalId = null;

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
  try {
    // Check if we can process (30 seconds passed since last send)
    const lockResult = await db.query(`
      SELECT * FROM status_bot_queue_lock WHERE id = 1
    `);

    if (lockResult.rows.length === 0) {
      await db.query(`INSERT INTO status_bot_queue_lock (id) VALUES (1)`);
      return;
    }

    const lock = lockResult.rows[0];

    // Check if already processing
    if (lock.is_processing) {
      // Check for stuck processing (timeout)
      if (lock.processing_started_at) {
        const processingTime = Date.now() - new Date(lock.processing_started_at).getTime();
        if (processingTime > STATUS_TIMEOUT) {
          console.log('[StatusBot Queue] Stuck processing detected, resetting...');
          await db.query(`
            UPDATE status_bot_queue_lock 
            SET is_processing = false, processing_started_at = NULL
            WHERE id = 1
          `);
        } else {
          return; // Still processing
        }
      }
    }

    // Check if 30 seconds passed since last send
    if (lock.last_sent_at) {
      const timeSinceLastSend = Date.now() - new Date(lock.last_sent_at).getTime();
      if (timeSinceLastSend < STATUS_DELAY) {
        return; // Need to wait more
      }
    }

    // Get next pending item
    // Include 'scheduled' status for backwards compatibility
    // Only process if scheduled_for is null (send now) or scheduled_for <= NOW()
    // Skip connections that are in restriction period (24h after first connection unless lifted, or short 30min restriction)
    // Order by scheduled_for first (nulls first = send now items), then by created_at
    const queueResult = await db.query(`
      SELECT q.*, c.session_name, c.connection_status, c.first_connected_at, c.last_connected_at, c.restriction_lifted, c.short_restriction_until
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
      return; // No items to process
    }

    const item = queueResult.rows[0];

    // Acquire lock
    await db.query(`
      UPDATE status_bot_queue_lock 
      SET is_processing = true, processing_started_at = NOW()
      WHERE id = 1
    `);

    // Update queue item status
    await db.query(`
      UPDATE status_bot_queue 
      SET queue_status = 'processing', processing_started_at = NOW()
      WHERE id = $1
    `, [item.id]);

    console.log(`[StatusBot Queue] Processing status ${item.id} (${item.status_type})`);

    try {
      // Process the status
      await sendStatus(item);

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

      console.log(`[StatusBot Queue] Status ${item.id} sent successfully`);

      // Send WhatsApp notification if this was from WhatsApp and was scheduled
      await sendStatusNotification(item, true);

    } catch (sendError) {
      console.error(`[StatusBot Queue] Failed to send status ${item.id}:`, sendError.message);

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
  const { baseUrl, apiKey } = await getWahaCredentials();
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

      // Save message ID to queue
      await db.query(`
        UPDATE status_bot_queue SET status_message_id = $1 WHERE id = $2
      `, [messageId, queueItem.id]);

    } catch (e) {
      console.error('[StatusBot Queue] Failed to get message ID:', e.message);
      // Continue without message ID
    }
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
        file: content.file,
        caption: content.caption || ''
      };
      break;

    case 'video':
      endpoint = `/api/${sessionName}/status/video`;
      body = {
        id: messageId,
        contacts: null,
        file: content.file,
        convert: true,
        caption: content.caption || ''
      };
      break;

    case 'voice':
      endpoint = `/api/${sessionName}/status/voice`;
      body = {
        id: messageId,
        contacts: null,
        file: content.file,
        convert: true,
        backgroundColor: content.backgroundColor || '#38b42f'
      };
      break;

    default:
      throw new Error(`Unknown status type: ${queueItem.status_type}`);
  }

  console.log(`[StatusBot Queue] Sending to ${endpoint}`, JSON.stringify(body, null, 2));

  // Send the status with timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), STATUS_TIMEOUT);
  });

  const sendPromise = wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, body);

  const response = await Promise.race([sendPromise, timeoutPromise]);
  
  console.log(`[StatusBot Queue] WAHA Response:`, JSON.stringify(response, null, 2));

  // Save to history
  await db.query(`
    INSERT INTO status_bot_statuses 
    (connection_id, queue_id, status_type, content, waha_message_id, expires_at, source, source_phone)
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours', $6, $7)
  `, [
    queueItem.connection_id,
    queueItem.id,
    queueItem.status_type,
    JSON.stringify(content),
    messageId || response?.id || null,
    queueItem.source,
    queueItem.source_phone
  ]);

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
      console.log(`[StatusBot Queue] Skipping notification for status ${item.id} - scheduled >24h ahead`);
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
};
