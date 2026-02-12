/**
 * Status Bot Queue Service
 * Processes status uploads with 30-second delay between each status globally
 */

const db = require('../../config/database');
const wahaSession = require('../../services/waha/session.service');
const { getWahaCredentials } = require('../../services/settings/system.service');

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
    const queueResult = await db.query(`
      SELECT q.*, c.session_name, c.connection_status
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.queue_status = 'pending' AND c.connection_status = 'connected'
      ORDER BY q.created_at ASC
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

  // First, get a new message ID
  let messageId = queueItem.status_message_id;
  
  if (!messageId) {
    try {
      const idResponse = await wahaSession.makeRequest(
        baseUrl, apiKey, 'GET', 
        `/${sessionName}/status/new-message-id`
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
  let endpoint;
  let body;

  switch (queueItem.status_type) {
    case 'text':
      endpoint = `/${sessionName}/status/text`;
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
      endpoint = `/${sessionName}/status/image`;
      body = {
        id: messageId,
        contacts: null,
        file: content.file,
        caption: content.caption || ''
      };
      break;

    case 'video':
      endpoint = `/${sessionName}/status/video`;
      body = {
        id: messageId,
        contacts: null,
        file: content.file,
        convert: true,
        caption: content.caption || ''
      };
      break;

    case 'voice':
      endpoint = `/${sessionName}/status/voice`;
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

  // Send the status with timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), STATUS_TIMEOUT);
  });

  const sendPromise = wahaSession.makeRequest(baseUrl, apiKey, 'POST', endpoint, body);

  const response = await Promise.race([sendPromise, timeoutPromise]);

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

module.exports = {
  startQueueProcessor,
  stopQueueProcessor,
  addToQueue,
  getQueueStats,
};
