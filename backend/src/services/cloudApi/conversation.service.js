/**
 * Cloud API Conversation Service
 * State machine for handling WhatsApp Cloud API bot conversations
 * Supports multiple concurrent pending statuses per phone number
 */

const db = require('../../config/database');
const cloudApi = require('./cloudApi.service');
const wahaSession = require('../waha/session.service');
const { getWahaCredentialsForConnection } = require('../settings/system.service');
const videoSplit = require('../statusBot/videoSplit.service');
const { v4: uuidv4 } = require('uuid');
const { getIO } = require('../socket/manager.service');
const path = require('path');

// Helper to generate short unique IDs for button IDs (WhatsApp has 256 char limit)
function generateShortId() {
  return uuidv4().split('-')[0]; // 8 chars
}

// Default colors (same as in dashboard)
const DEFAULT_COLORS = [
  { id: '782138', title: 'בורדו' },
  { id: '6e267d', title: 'סגול כהה' },
  { id: '8d698f', title: 'סגול לילך' },
  { id: 'c79ecc', title: 'סגול בהיר' },
  { id: '8294c9', title: 'כחול אפרפר' },
  { id: '7d8fa3', title: 'אפור' },
  { id: '243740', title: 'תורכיז כהה' },
  { id: 'ad8673', title: 'חום' },
  { id: '73666b', title: 'חום-סגול' },
  { id: '7acca7', title: 'ירוק בהיר' },
];

// Hebrew day names
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * Convert Israel time string to UTC Date
 * @param {string} israelDateTimeStr - Date time string in format "YYYY-MM-DDTHH:MM:SS"
 * @returns {Date} UTC Date object
 */
function convertIsraelTimeToUTC(israelDateTimeStr) {
  // Parse the date components
  const [datePart, timePart] = israelDateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
  
  // Create a reference point to determine Israel's UTC offset for that specific date
  // Israel observes DST (UTC+3 in summer, UTC+2 in winter)
  const refDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Get the offset by comparing UTC time to Israel time
  const israelStr = refDate.toLocaleString('en-US', { 
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false 
  });
  const israelHour = parseInt(israelStr);
  const utcHour = refDate.getUTCHours();
  const offsetHours = israelHour - utcHour;
  
  // Create the UTC time by subtracting Israel's offset from the requested time
  return new Date(Date.UTC(year, month - 1, day, hours - offsetHours, minutes, seconds));
}

/**
 * Get current date/time in Israel timezone
 * Returns a Date object with Israel local time values
 */
function getNowInIsrael() {
  const now = new Date();
  const israelStr = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse: MM/DD/YYYY, HH:MM:SS
  const [datePart, timePart] = israelStr.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Get today's date string in Israel timezone (YYYY-MM-DD format)
 */
function getTodayInIsrael() {
  const israelNow = getNowInIsrael();
  const year = israelNow.getFullYear();
  const month = String(israelNow.getMonth() + 1).padStart(2, '0');
  const day = String(israelNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get conversation state for a phone number
 */
async function getState(phone) {
  const result = await db.query(
    `SELECT * FROM cloud_api_conversation_states WHERE phone_number = $1`,
    [phone]
  );
  
  if (result.rows.length === 0) {
    // Create new state
    const newState = await db.query(
      `INSERT INTO cloud_api_conversation_states (phone_number, state, pending_statuses)
       VALUES ($1, 'idle', '{}')
       RETURNING *`,
      [phone]
    );
    return newState.rows[0];
  }
  
  // Ensure pending_statuses exists (for legacy rows)
  if (!result.rows[0].pending_statuses) {
    result.rows[0].pending_statuses = {};
  }
  
  return result.rows[0];
}

/**
 * Update conversation state (legacy - for backward compatibility)
 */
async function setState(phone, state, stateData = null, pendingStatus = null, connectionId = null) {
  const updates = ['state = $2', 'last_message_at = NOW()'];
  const params = [phone, state];
  let paramIndex = 3;
  
  if (stateData !== undefined) {
    updates.push(`state_data = $${paramIndex}`);
    params.push(stateData ? JSON.stringify(stateData) : null);
    paramIndex++;
  }
  
  if (pendingStatus !== undefined) {
    updates.push(`pending_status = $${paramIndex}`);
    params.push(pendingStatus ? JSON.stringify(pendingStatus) : null);
    paramIndex++;
  }
  
  if (connectionId !== undefined) {
    updates.push(`connection_id = $${paramIndex}`);
    params.push(connectionId);
    paramIndex++;
  }
  
  await db.query(
    `UPDATE cloud_api_conversation_states 
     SET ${updates.join(', ')}
     WHERE phone_number = $1`,
    params
  );
  
  // Emit socket event for admin monitoring
  emitAdminUpdate(phone, state, stateData, connectionId);
}

/**
 * Add a new pending status and return its unique ID
 */
async function addPendingStatus(phone, statusData, connectionId = null) {
  const statusId = generateShortId();
  
  // Get current pending statuses
  const result = await db.query(
    `SELECT pending_statuses FROM cloud_api_conversation_states WHERE phone_number = $1`,
    [phone]
  );
  
  let pendingStatuses = {};
  if (result.rows.length > 0 && result.rows[0].pending_statuses) {
    pendingStatuses = typeof result.rows[0].pending_statuses === 'string' 
      ? JSON.parse(result.rows[0].pending_statuses) 
      : result.rows[0].pending_statuses;
  }
  
  // Add new status with its own state
  pendingStatuses[statusId] = {
    ...statusData,
    subState: statusData.subState || 'pending_action',
    connectionId: connectionId,
    createdAt: new Date().toISOString()
  };
  
  // Clean up old statuses (older than 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  for (const [id, status] of Object.entries(pendingStatuses)) {
    if (status.createdAt && status.createdAt < twentyFourHoursAgo) {
      delete pendingStatuses[id];
    }
  }
  
  await db.query(
    `UPDATE cloud_api_conversation_states 
     SET pending_statuses = $1, last_message_at = NOW()
     WHERE phone_number = $2`,
    [JSON.stringify(pendingStatuses), phone]
  );
  
  emitAdminUpdate(phone, 'active', { pendingCount: Object.keys(pendingStatuses).length }, connectionId);
  
  // Emit to user if we have a connectionId
  if (connectionId) {
    emitPendingStatusToUser(connectionId, statusId, pendingStatuses[statusId]);
  }
  
  return statusId;
}

/**
 * Emit pending status update to user via socket
 */
async function emitPendingStatusToUser(connectionId, statusId, statusData) {
  try {
    // Get user ID from connection
    const result = await db.query(
      `SELECT user_id FROM status_bot_connections WHERE id = $1`,
      [connectionId]
    );
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('statusbot:pending_update', {
        action: 'add',
        statusId,
        status: statusData,
        timestamp: Date.now()
      });
    }
  } catch (e) {
    // Socket error - ignore
  }
}

/**
 * Get a specific pending status by ID
 */
async function getPendingStatus(phone, statusId) {
  const result = await db.query(
    `SELECT pending_statuses FROM cloud_api_conversation_states WHERE phone_number = $1`,
    [phone]
  );
  
  if (result.rows.length === 0) return null;
  
  const pendingStatuses = typeof result.rows[0].pending_statuses === 'string'
    ? JSON.parse(result.rows[0].pending_statuses || '{}')
    : (result.rows[0].pending_statuses || {});
  
  return pendingStatuses[statusId] || null;
}

/**
 * Update a specific pending status
 */
async function updatePendingStatus(phone, statusId, updates) {
  const result = await db.query(
    `SELECT pending_statuses FROM cloud_api_conversation_states WHERE phone_number = $1`,
    [phone]
  );
  
  if (result.rows.length === 0) return false;
  
  let pendingStatuses = typeof result.rows[0].pending_statuses === 'string'
    ? JSON.parse(result.rows[0].pending_statuses || '{}')
    : (result.rows[0].pending_statuses || {});
  
  if (!pendingStatuses[statusId]) return false;
  
  pendingStatuses[statusId] = { ...pendingStatuses[statusId], ...updates };
  
  await db.query(
    `UPDATE cloud_api_conversation_states 
     SET pending_statuses = $1, last_message_at = NOW()
     WHERE phone_number = $2`,
    [JSON.stringify(pendingStatuses), phone]
  );
  
  // Emit update if we have connectionId
  const connectionId = pendingStatuses[statusId].connectionId;
  if (connectionId) {
    emitPendingStatusToUser(connectionId, statusId, pendingStatuses[statusId]);
  }
  
  return true;
}

/**
 * Remove a pending status
 */
async function removePendingStatus(phone, statusId) {
  const result = await db.query(
    `SELECT pending_statuses FROM cloud_api_conversation_states WHERE phone_number = $1`,
    [phone]
  );
  
  if (result.rows.length === 0) return;
  
  let pendingStatuses = typeof result.rows[0].pending_statuses === 'string'
    ? JSON.parse(result.rows[0].pending_statuses || '{}')
    : (result.rows[0].pending_statuses || {});
  
  // Get connectionId before deleting
  const connectionId = pendingStatuses[statusId]?.connectionId;
  
  delete pendingStatuses[statusId];
  
  await db.query(
    `UPDATE cloud_api_conversation_states 
     SET pending_statuses = $1, last_message_at = NOW()
     WHERE phone_number = $2`,
    [JSON.stringify(pendingStatuses), phone]
  );
  
  // Emit removal event
  if (connectionId) {
    emitPendingStatusRemoval(connectionId, statusId);
  }
}

/**
 * Emit pending status removal to user via socket
 */
async function emitPendingStatusRemoval(connectionId, statusId) {
  try {
    const result = await db.query(
      `SELECT user_id FROM status_bot_connections WHERE id = $1`,
      [connectionId]
    );
    
    if (result.rows.length === 0) return;
    
    const userId = result.rows[0].user_id;
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('statusbot:pending_update', {
        action: 'remove',
        statusId,
        timestamp: Date.now()
      });
    }
  } catch (e) {
    // Socket error - ignore
  }
}

/**
 * Emit socket event for admin monitoring
 */
function emitAdminUpdate(phone, state, stateData, connectionId) {
  try {
    const io = getIO();
    if (io) {
      io.to('admin').emit('statusbot:conversation_update', {
        phone,
        state,
        stateData,
        connectionId,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    // Socket not initialized yet, ignore
  }
}

/**
 * Emit socket event when message received (for admin real-time monitoring)
 */
async function emitMessageReceived(phone, messageType, connectionId = null, senderName = null, ownerName = null, ownerEmail = null) {
  try {
    const io = getIO();
    if (io) {
      io.to('admin').emit('statusbot:message_received', {
        phone,
        messageType,
        connectionId,
        senderName,
        ownerName,
        ownerEmail,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    // Socket not initialized yet, ignore
  }
}

/**
 * Check if phone is authorized for any status bot connection
 * Returns array of connections with user info
 */
/**
 * Find group-forwards that use the status bot as trigger AND have this phone
 * as an authorized sender. Only returns forwards whose owner has a status bot connection,
 * so the trigger message arrived here because the owner's status bot received it.
 *
 * Returns: [{ forward_id, forward_name, user_id, connection_id, can_send_without_approval, sender_name }]
 */
async function checkStatusBotGroupForwardsAuth(phone) {
  const normalizedPhone = phone.replace(/\D/g, '');
  const alt972 = normalizedPhone.startsWith('0') ? '972' + normalizedPhone.slice(1) : normalizedPhone;
  const alt0 = normalizedPhone.startsWith('972') ? '0' + normalizedPhone.slice(3) : normalizedPhone;

  // Match against stored authorized senders, normalizing both sides by digits-only substring.
  // Stored value may be "972584254229@s.whatsapp.net", "972584254229", "0584254229", "+972-58-..." etc.
  const result = await db.query(
    `SELECT
       gf.id as forward_id,
       gf.name as forward_name,
       gf.user_id,
       gf.require_confirmation,
       fas.name as sender_name,
       fas.can_send_without_approval,
       u.name as user_name,
       u.email as user_email
     FROM forward_authorized_senders fas
     JOIN group_forwards gf ON gf.id = fas.forward_id
     JOIN users u ON u.id = gf.user_id
     WHERE gf.is_active = true
       AND gf.trigger_type = 'status_bot'
       AND (
         regexp_replace(fas.phone_number, '\\D', '', 'g') = $1
         OR regexp_replace(fas.phone_number, '\\D', '', 'g') = $2
         OR regexp_replace(fas.phone_number, '\\D', '', 'g') = $3
       )`,
    [normalizedPhone, alt972, alt0]
  );

  const seen = new Set();
  return result.rows.filter(row => {
    if (seen.has(row.forward_id)) return false;
    seen.add(row.forward_id);
    return true;
  });
}

async function checkAuthorization(phone) {
  // Normalize phone - remove all non-digits
  const normalizedPhone = phone.replace(/\D/g, '');
  
  // Try multiple formats
  const phoneVariants = [
    normalizedPhone,
    normalizedPhone.replace(/^972/, '0'),
    normalizedPhone.replace(/^0/, '972'),
  ];
  
  const result = await db.query(
    `SELECT 
       sbc.id as connection_id,
       sbc.user_id,
       sbc.display_name,
       sbc.phone_number as connection_phone,
       sbc.connection_status,
       sbc.custom_colors,
       sbc.first_connected_at,
       sbc.last_connected_at,
       sbc.restriction_lifted,
       sban.name as authorized_name,
       u.name as user_name,
       u.email as user_email
     FROM status_bot_authorized_numbers sban
     JOIN status_bot_connections sbc ON sban.connection_id = sbc.id
     JOIN users u ON sbc.user_id = u.id
     WHERE sban.is_active = true
       AND sbc.is_active = true
       AND sban.phone_number = ANY($1)`,
    [phoneVariants]
  );
  
  // Dedupe by connection_id (in case same phone matches multiple variants)
  const seen = new Set();
  return result.rows.filter(row => {
    if (seen.has(row.connection_id)) return false;
    seen.add(row.connection_id);
    return true;
  });
}

/**
 * Validate connection can send statuses
 * Returns { valid: boolean, error: string | null }
 */
function validateConnectionStatus(connection) {
  // Check if FAILED — this is the only hard error that blocks queuing
  if (connection.connection_status === 'failed') {
    // Build scan link for this user
    const appUrl = process.env.APP_URL || 'https://botomat.co.il';
    const scanLink = `${appUrl}/status-bot`;
    return {
      valid: false,
      queueable: false,
      error: `❌ שגיאה בחיבור WhatsApp לחשבון "${connection.display_name || connection.connection_phone}".\n\nיש להתחבר מחדש:\n${scanLink}`
    };
  }

  // Check if waiting for QR scan
  if (connection.connection_status === 'qr_pending' || connection.connection_status === 'scan_qr') {
    const appUrl = process.env.APP_URL || 'https://botomat.co.il';
    const scanLink = `${appUrl}/status-bot`;
    return {
      valid: false,
      queueable: true,
      error: `📱 ממתין לסריקת QR לחשבון "${connection.display_name || connection.connection_phone}".\n\nסרוק כאן:\n${scanLink}\n\n✅ הסטטוס נוסף לתור ויעלה אוטומטית לאחר החיבור.`
    };
  }

  // Check if disconnected (not failed) — queueable, will auto-process when reconnected
  if (connection.connection_status !== 'connected') {
    return {
      valid: false,
      queueable: true,
      error: `⏳ החשבון "${connection.display_name || connection.connection_phone}" אינו מחובר כרגע.\n\n✅ הסטטוס נוסף לתור ויעלה אוטומטית כשהחיבור יחזור.`
    };
  }

  // Check 24-hour restriction — queueable, will auto-process when restriction lifts
  if (!connection.restriction_lifted) {
    const connectionDate = connection.last_connected_at || connection.first_connected_at;

    if (connectionDate) {
      const connectedAt = new Date(connectionDate);
      const restrictionEnd = new Date(connectedAt.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();

      if (now < restrictionEnd) {
        const remainingMs = restrictionEnd - now;
        const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
        const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

        let timeStr;
        if (remainingHours > 0) {
          timeStr = `${remainingHours} שעות ו-${remainingMinutes} דקות`;
        } else {
          timeStr = `${remainingMinutes} דקות`;
        }

        return {
          valid: false,
          queueable: true,
          error: `⏳ יש להמתין ${timeStr} מרגע ההתחברות.\n\n✅ הסטטוס נוסף לתור ויעלה אוטומטית בתום ההמתנה.`
        };
      }
    }
  }

  return { valid: true, queueable: true, error: null };
}

/**
 * Get colors for a connection (custom or default)
 */
async function getColorsForConnection(connectionId) {
  const result = await db.query(
    `SELECT custom_colors FROM status_bot_connections WHERE id = $1`,
    [connectionId]
  );
  
  if (result.rows.length > 0 && result.rows[0].custom_colors) {
    return result.rows[0].custom_colors;
  }
  
  return DEFAULT_COLORS;
}

/**
 * Add status to queue
 * Note: queue_status is always 'pending' - scheduler will pick them up by scheduled_for time
 */
async function addToQueue(connectionId, statusType, content, scheduledFor = null, sourcePhone = null) {
  // Dedup: if the same status (same connection + type + content + source_phone) was queued
  // within the last 60 seconds and is still pending/processing/sent, return the existing entry.
  // This prevents webhook double-fires or rapid button double-taps from creating duplicates.
  const contentJson = JSON.stringify(content);
  const dedup = await db.query(
    `SELECT * FROM status_bot_queue
     WHERE connection_id = $1
       AND status_type = $2
       AND content::text = $3::text
       AND COALESCE(source_phone, '') = COALESCE($4::varchar, '')
       AND (scheduled_for IS NULL AND $5::timestamp IS NULL OR scheduled_for = $5::timestamp)
       AND queue_status IN ('pending', 'processing', 'scheduled', 'sent')
       AND created_at > NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [connectionId, statusType, contentJson, sourcePhone, scheduledFor]
  );
  if (dedup.rows.length > 0) {
    console.log(`[StatusBot] 🔁 Deduped duplicate queue insert for connection=${connectionId} — returning existing id=${dedup.rows[0].id}`);
    return dedup.rows[0];
  }

  const result = await db.query(
    `INSERT INTO status_bot_queue
     (connection_id, status_type, content, queue_status, scheduled_for, source, source_phone)
     VALUES ($1, $2, $3, 'pending', $4, 'whatsapp', $5)
     RETURNING *`,
    [
      connectionId,
      statusType,
      contentJson,
      scheduledFor,
      sourcePhone
    ]
  );

  return result.rows[0];
}

/**
 * Add status to queue with part tracking (for split videos)
 */
async function addToQueueWithParts(connectionId, statusType, content, scheduledFor = null, sourcePhone = null, partGroupId = null, partNumber = null, totalParts = null) {
  const result = await db.query(
    `INSERT INTO status_bot_queue 
     (connection_id, status_type, content, queue_status, scheduled_for, source, source_phone, part_group_id, part_number, total_parts)
     VALUES ($1, $2, $3, 'pending', $4, 'whatsapp', $5, $6, $7, $8)
     RETURNING *`,
    [
      connectionId,
      statusType,
      JSON.stringify(content),
      scheduledFor,
      sourcePhone,
      partGroupId,
      partNumber,
      totalParts
    ]
  );
  
  return result.rows[0];
}

/**
 * Get scheduled statuses for a connection
 */
async function getScheduledStatuses(connectionId) {
  const result = await db.query(
    `SELECT * FROM status_bot_queue 
     WHERE connection_id = $1 
       AND queue_status IN ('pending', 'scheduled', 'processing')
       AND (scheduled_for IS NULL OR scheduled_for > NOW())
     ORDER BY COALESCE(scheduled_for, created_at) ASC
     LIMIT 10`,
    [connectionId]
  );
  
  return result.rows;
}

/**
 * Get sent statuses for a connection (last 24h)
 */
async function getSentStatuses(connectionId) {
  const result = await db.query(
    `SELECT * FROM status_bot_statuses 
     WHERE connection_id = $1 
       AND sent_at > NOW() - INTERVAL '24 hours'
       AND deleted_at IS NULL
     ORDER BY sent_at DESC
     LIMIT 10`,
    [connectionId]
  );
  
  return result.rows;
}

/**
 * Main message handler - routes to appropriate handler based on state
 */
async function handleMessage(phone, message) {
  try {
    const state = await getState(phone);

    // Fire-and-forget admin monitoring event (don't block message handling on it)
    (async () => {
      try {
        const auths = await checkAuthorization(phone);
        const a = auths[0];
        emitMessageReceived(
          phone, message.type,
          a?.connection_id || state.connection_id,
          a?.authorized_name, a?.user_name, a?.user_email
        );
      } catch (e) { /* non-fatal */ }
    })();
    
    // Check if blocked
    if (state.blocked_until && new Date(state.blocked_until) > new Date()) {
      return;
    }
    
    // Check for commands first
    if (message.type === 'text') {
      const text = message.text.body.trim();
      const lowerText = text.toLowerCase();

      if (lowerText === 'תפריט' || lowerText === 'menu') {
        return await handleMenuCommand(phone, state);
      }

      if (lowerText === 'סטטוסים' || lowerText === 'statuses') {
        return await handleStatusesCommand(phone, state);
      }

      if (lowerText === 'בטל' || lowerText === 'cancel') {
        return await handleCancelCommand(phone, state);
      }
      
      // Check for pending status that is collecting custom captions
      const captionResult = await handleCustomCaptionInput(phone, text);
      if (captionResult === 'handled') {
        return;
      }
    }
    
    // NEW: Handle interactive messages with statusId in button/list IDs
    if (message.type === 'interactive') {
      const interactiveType = message.interactive.type;
      let selectedId = null;

      if (interactiveType === 'button_reply') {
        selectedId = message.interactive.button_reply.id;
      } else if (interactiveType === 'list_reply') {
        selectedId = message.interactive.list_reply.id;
      }

      // Group forwards confirm/schedule/cancel/day/back buttons
      if (selectedId && (
        selectedId.startsWith('fwd_confirm_') ||
        selectedId.startsWith('fwd_cancel_') ||
        selectedId.startsWith('fwd_schedule_') ||
        selectedId.startsWith('fwd_day_') ||
        selectedId.startsWith('fwd_back_')
      )) {
        await handleStatusBotForwardDecision(phone, selectedId, message);
        return;
      }

      // Post-send actions (edit/delete after completion)
      if (selectedId && (selectedId.startsWith('fwd_edit_') || selectedId.startsWith('fwd_delete_'))) {
        await handleCompletedJobAction(phone, selectedId);
        return;
      }

      // Stop actions during sending
      if (selectedId && (selectedId.startsWith('fwd_stop_') || selectedId.startsWith('fwd_stopdelete_'))) {
        await handleStopJobAction(phone, selectedId);
        return;
      }

      // Edit confirmation buttons — let state handler process them
      if (selectedId && (
        selectedId.startsWith('fwd_editconfirm_') ||
        selectedId.startsWith('fwd_editretry_') ||
        selectedId.startsWith('fwd_editcancel_')
      )) {
        if (state.state === 'waiting_fwd_edit_confirm') {
          await handleWaitingFwdEditConfirm(phone, message, state);
        }
        return;
      }

      // Scheduled forwards actions (edit/delete/reschedule/cancel) and reschedule day picker
      if (selectedId && selectedId.startsWith('sched_day_')) {
        await handleScheduledDayPick(phone, selectedId);
        return;
      }
      if (selectedId && /^sched_(edit|delete_msg|reschedule|cancel)_/.test(selectedId)) {
        await handleScheduledForwardAction(phone, selectedId);
        return;
      }

      // Check if it's our new format with statusId (e.g., send_abc12345, color_782138_abc12345)
      if (selectedId && selectedId.includes('_')) {
        const result = await handleInteractiveWithStatusId(phone, selectedId, message);
        if (result !== 'fallback') {
          return result;
        }
        // If fallback, continue to legacy handlers
      }
    }
    
    // Route based on current state (legacy flow)
    switch (state.state) {
      case 'idle':
        return await handleIdleState(phone, message, state);
      
      case 'select_account':
        return await handleSelectAccountState(phone, message, state);
      
      case 'select_color':
        return await handleSelectColorState(phone, message, state);
      
      case 'select_action':
        return await handleSelectActionState(phone, message, state);
      
      case 'select_schedule_day':
        return await handleSelectScheduleDayState(phone, message, state);
      
      case 'select_schedule_time':
        return await handleSelectScheduleTimeState(phone, message, state);
      
      case 'waiting_schedule_time':
        return await handleWaitingScheduleTimeState(phone, message, state);
      
      case 'waiting_reschedule_time':
        return await handleWaitingRescheduleTimeState(phone, message, state);
      
      case 'view_scheduled':
        return await handleViewScheduledState(phone, message, state);
      
      case 'view_status_actions':
        return await handleViewStatusActionsState(phone, message, state);
      
      case 'after_send_menu':
        return await handleAfterSendMenuState(phone, message, state);

      case 'select_destination':
        return await handleSelectDestinationState(phone, message, state);

      case 'pending_destination_forward':
        return await handlePendingForwardState(phone, message, state);

      case 'waiting_fwd_schedule_time':
        return await handleWaitingFwdScheduleTimeState(phone, message, state);

      case 'waiting_sched_reschedule_time':
        return await handleWaitingSchedRescheduleTime(phone, message, state);

      case 'waiting_sched_edit':
        return await handleWaitingSchedEdit(phone, message, state);

      case 'waiting_fwd_edit_text':
        return await handleWaitingFwdEditText(phone, message, state);

      case 'waiting_fwd_edit_confirm':
        return await handleWaitingFwdEditConfirm(phone, message, state);
      
      case 'video_split_caption_choice':
        return await handleVideoSplitCaptionChoiceState(phone, message, state);
      
      case 'video_split_custom_caption':
        return await handleVideoSplitCustomCaptionState(phone, message, state);
      
      default:
        // Reset to idle on unknown state
        await setState(phone, 'idle', null, null);
        return await handleIdleState(phone, message, state);
    }
  } catch (error) {
    console.error(`[CloudAPI Conv] Error handling message from ${phone}:`, error);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה, אנא נסה שוב');
    await setState(phone, 'idle', null, null);
  }
}

/**
 * Handle interactive messages with statusId embedded in button/list IDs
 * Format: action_statusId or action_data_statusId
 * Returns 'fallback' if this message should be handled by legacy handlers
 */
async function handleInteractiveWithStatusId(phone, selectedId, message) {
  
  // Parse the selectedId to extract action and statusId
  // Formats: send_statusId, sched_statusId, cancel_statusId, color_colorId_statusId, acc_connId_statusId
  // capall_statusId, cap1st_statusId, capcus_statusId, day_X_statusId, time_HH:MM_statusId
  
  const parts = selectedId.split('_');
  if (parts.length < 2) return 'fallback';
  
  const action = parts[0];
  let statusId, data;
  
  // Handle queued_* actions globally (these work regardless of state)
  if (action === 'queued') {
    return await handleQueuedAction(phone, selectedId, message.id);
  }
  
  // Handle scheduled_* actions (selecting a status from list)
  if (action === 'scheduled') {
    const statusId = selectedId.replace('scheduled_', '');
    // Show action buttons for this status
    await cloudApi.sendButtonMessage(
      phone,
      'מה תרצה לעשות עם הסטטוס?',
      [
        { id: `status_send_now_${statusId}`, title: 'שלח כעת' },
        { id: `status_reschedule_${statusId}`, title: 'שנה תזמון' },
        { id: `status_cancel_${statusId}`, title: 'בטל' }
      ]
    );
    return;
  }
  
  // Handle status_* actions (from scheduled status buttons)
  if (action === 'status') {
    return await handleStatusAction(phone, selectedId);
  }
  
  // Handle resched_* actions (reschedule day/time selection)
  if (action === 'resched') {
    return await handleRescheduleAction(phone, selectedId);
  }
  
  // Handle new_status action
  if (selectedId === 'new_status') {
    await cloudApi.sendTextMessage(phone, '📤 שלח תמונה, סרטון, הקלטה קולית או טקסט להעלאה לסטטוס');
    return;
  }
  
  // Handle queued_menu action
  if (selectedId === 'queued_menu') {
    await sendStatusMenu(phone, await checkAuthorization(phone));
    return;
  }
  
  // Handle queued_view_all action
  if (selectedId === 'queued_view_all') {
    const connections = await checkAuthorization(phone);
    if (connections.length > 0) {
      await showScheduledListWithConfirmation(phone, connections[0].connection_id, null, null, '');
    } else {
      await cloudApi.sendTextMessage(phone, 'אין חשבון מחובר');
    }
    return;
  }
  
  // Determine statusId based on action format
  if (['send', 'sched', 'cancel', 'capall', 'cap1st', 'capcus'].includes(action)) {
    // Format: action_statusId
    statusId = parts[1];
  } else if (['color', 'acc', 'day', 'time'].includes(action)) {
    // Format: action_data_statusId
    data = parts[1];
    statusId = parts[2];
  } else {
    // Unknown format - fallback to legacy
    return 'fallback';
  }
  
  // Get pending status
  const pendingStatus = await getPendingStatus(phone, statusId);
  if (!pendingStatus) {
    await cloudApi.sendTextMessage(phone, 'ההודעה לא מזוהה או שפג תוקפה, אנא שלח את הסטטוס מחדש');
    return;
  }
  
  // Handle each action type
  switch (action) {
    case 'acc': // Account selection
      return await handleAccountSelection(phone, statusId, pendingStatus, data);
    
    case 'color': // Color selection
      return await handleColorSelection(phone, statusId, pendingStatus, data);
    
    case 'send': // Send now
      return await handleSendNow(phone, statusId, pendingStatus);
    
    case 'sched': // Schedule
      return await handleScheduleStart(phone, statusId, pendingStatus);
    
    case 'cancel': // Cancel
      await removePendingStatus(phone, statusId);
      await cloudApi.sendTextMessage(phone, '❌ הסטטוס בוטל');
      return;
    
    case 'split': // User wants to split borderline video
      return await handleSplitBorderlineVideo(phone, statusId, pendingStatus, true);
    
    case 'nosplit': // User doesn't want to split borderline video
      return await handleSplitBorderlineVideo(phone, statusId, pendingStatus, false);
    
    case 'capall': // Caption on all parts
      return await handleCaptionChoice(phone, statusId, pendingStatus, 'all');
    
    case 'cap1st': // Caption on first only
      return await handleCaptionChoice(phone, statusId, pendingStatus, 'first');
    
    case 'capcus': // Custom captions
      return await handleCaptionChoice(phone, statusId, pendingStatus, 'custom');
    
    case 'day': // Day selection for scheduling
      return await handleDaySelection(phone, statusId, pendingStatus, data);
    
    case 'time': // Time selection for scheduling
      return await handleTimeSelection(phone, statusId, pendingStatus, data);
    
    default:
      return 'fallback';
  }
}

/**
 * Handle queued_* actions (views, hearts, reactions, delete, menu, view_all)
 * These work regardless of conversation state
 */
async function handleQueuedAction(phone, selectedId, contextMessageId = null) {
  // Handle special actions first
  if (selectedId === 'queued_view_all') {
    return await handleViewAllStatuses(phone);
  }
  
  if (selectedId === 'queued_menu') {
    return await handleMainMenu(phone);
  }
  
  // Extract status ID from action (format: queued_action_statusId or queued_action_group_groupId)
  const parts = selectedId.split('_');
  let statusId = parts[parts.length - 1];
  
  // Helper to get the actual status_bot_statuses ID from queue ID
  const getStatusIdFromQueueId = async (queueId) => {
    const result = await db.query(
      `SELECT id FROM status_bot_statuses WHERE queue_id = $1`,
      [queueId]
    );
    return result.rows[0]?.id;
  };
  
  // Delete group action (video split parts)
  if (selectedId.startsWith('queued_delete_group_')) {
    const groupId = selectedId.replace('queued_delete_group_', '');
    
    // First check if any parts were already sent - need to delete from WhatsApp too
    const sentParts = await db.query(
      `SELECT q.id, s.waha_message_id, c.session_name, c.waha_source_id
       FROM status_bot_queue q
       LEFT JOIN status_bot_statuses s ON s.queue_id = q.id
       LEFT JOIN status_bot_connections c ON c.id = q.connection_id
       WHERE q.part_group_id = $1 AND q.queue_status = 'sent' AND s.waha_message_id IS NOT NULL`,
      [groupId]
    );

    // Delete sent statuses from WhatsApp
    let deletedFromWA = 0;
    if (sentParts.rows.length > 0) {
      for (const part of sentParts.rows) {
        const { baseUrl, apiKey } = await getWahaCredentialsForConnection(part);
        try {
          await wahaSession.makeRequest(baseUrl, apiKey, 'POST', `/api/${part.session_name}/status/delete`, {
            id: part.waha_message_id,
            contacts: null
          });
          deletedFromWA++;
        } catch (err) {
          console.error(`[CloudAPI] Error deleting part from WhatsApp:`, err.message);
        }
      }
    }
    
    // Cancel pending/scheduled parts
    const cancelledCount = await db.query(
      `UPDATE status_bot_queue SET queue_status = 'cancelled' 
       WHERE part_group_id = $1 AND queue_status IN ('pending', 'scheduled')
       RETURNING id`,
      [groupId]
    );
    
    let messageText = '';
    if (deletedFromWA > 0) {
      messageText += `✅ ${deletedFromWA} חלקים נמחקו מווצאפ\n`;
    }
    if (cancelledCount.rows.length > 0) {
      messageText += `✅ ${cancelledCount.rows.length} חלקים הוסרו מהתור`;
    }
    if (!messageText) {
      messageText = 'אין חלקים למחיקה';
    }
    
    await cloudApi.sendTextMessage(phone, messageText.trim(), contextMessageId);
    return;
  }
  
  // Delete single status action
  if (selectedId.startsWith('queued_delete_')) {
    const result = await db.query(
      `SELECT q.*, s.waha_message_id, s.id as status_id, c.session_name, c.waha_source_id
       FROM status_bot_queue q
       LEFT JOIN status_bot_statuses s ON s.queue_id = q.id
       LEFT JOIN status_bot_connections c ON c.id = q.connection_id
       WHERE q.id = $1`,
      [statusId]
    );
    
    if (result.rows.length > 0) {
      const queueItem = result.rows[0];
      
      if (queueItem.queue_status === 'pending' || queueItem.queue_status === 'scheduled') {
        // Cancel queued status
        await db.query(
          `UPDATE status_bot_queue SET queue_status = 'cancelled' WHERE id = $1`,
          [statusId]
        );
        await cloudApi.sendTextMessage(phone, '✅ הסטטוס הוסר מתור השליחה', contextMessageId);
      } else if (queueItem.queue_status === 'sent') {
        // Delete sent status from WhatsApp
        if (queueItem.waha_message_id) {
          try {
            const { baseUrl, apiKey } = await getWahaCredentialsForConnection(queueItem);
            await wahaSession.makeRequest(baseUrl, apiKey, 'POST', `/api/${queueItem.session_name}/status/delete`, {
              id: queueItem.waha_message_id,
              contacts: null
            });

            // Mark as deleted + request immediate force-stop of any ongoing send
            if (queueItem.status_id) {
              await db.query(`UPDATE status_bot_statuses SET deleted_at = NOW() WHERE id = $1`, [queueItem.status_id]);
            }
            // Cancel the queue entry so retries don't re-upload
            await db.query(
              `UPDATE status_bot_queue SET queue_status = 'cancelled', updated_at = NOW() WHERE id = $1 AND queue_status NOT IN ('cancelled', 'sent')`,
              [statusId]
            ).catch(() => {});
            // If status is still being sent (processing), signal immediate stop
            try {
              const { forceStopItem } = require('../statusBot/queue.service');
              await forceStopItem(statusId);
            } catch (e) { /* non-fatal */ }

            await cloudApi.sendTextMessage(phone, '✅ הסטטוס נמחק מווצאפ', contextMessageId);
          } catch (deleteErr) {
            console.error('[CloudAPI] Error deleting status from WhatsApp:', deleteErr.message);
            await cloudApi.sendTextMessage(phone, 'לא הצלחנו למחוק את הסטטוס מווצאפ', contextMessageId);
          }
        } else {
          await cloudApi.sendTextMessage(phone, 'לא ניתן למחוק - מזהה הסטטוס לא נמצא', contextMessageId);
        }
      } else {
        await cloudApi.sendTextMessage(phone, 'לא ניתן למחוק את הסטטוס', contextMessageId);
      }
    } else {
      await cloudApi.sendTextMessage(phone, 'סטטוס לא נמצא', contextMessageId);
    }
    return;
  }

  // Views - combined count + list
  if (selectedId.startsWith('queued_views_') && !selectedId.includes('view_all')) {
    const realStatusId = await getStatusIdFromQueueId(statusId);
    if (!realStatusId) {
      await cloudApi.sendTextMessage(phone, '👁️ הסטטוס עדיין לא נשלח או שלא נמצא', contextMessageId);
      return;
    }
    const views = await db.query(
      `SELECT viewer_phone, viewed_at FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC`,
      [realStatusId]
    );
    
    if (views.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '👁️ 0 צפיות - אין צפיות עדיין', contextMessageId);
    } else {
      // Send as TXT file with count in caption
      const viewersList = views.rows.map(v => v.viewer_phone).join('\n');
      const fileContent = `רשימת צופים (${views.rows.length})\n${'='.repeat(30)}\n\n${viewersList}`;
      await cloudApi.sendDocumentMessage(phone, fileContent, `צפיות_${views.rows.length}.txt`, `👁️ ${views.rows.length} צפיות`, contextMessageId);
    }
    return;
  }
  
  // Hearts - combined count + list (all heart emojis)
  if (selectedId.startsWith('queued_hearts_')) {
    const realStatusId = await getStatusIdFromQueueId(statusId);
    if (!realStatusId) {
      await cloudApi.sendTextMessage(phone, '❤️ הסטטוס עדיין לא נשלח או שלא נמצא', contextMessageId);
      return;
    }
    const hearts = await db.query(
      `SELECT reactor_phone, reaction, reacted_at FROM status_bot_reactions WHERE status_id = $1 AND reaction IN ('❤️', '💚', '💙', '💜', '🖤', '🤍', '💛', '🧡', '🤎', '💗', '💖', '💕', '💓', '💞', '💘', '❣️') ORDER BY reacted_at DESC`,
      [realStatusId]
    );
    
    if (hearts.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❤️ 0 סימוני לב - אין סימוני לב עדיין', contextMessageId);
    } else {
      // Send as TXT file with count in caption
      const heartsList = hearts.rows.map(h => `${h.reaction} ${h.reactor_phone}`).join('\n');
      const fileContent = `רשימת סימוני לב (${hearts.rows.length})\n${'='.repeat(30)}\n\n${heartsList}`;
      await cloudApi.sendDocumentMessage(phone, fileContent, `לבבות_${hearts.rows.length}.txt`, `❤️ ${hearts.rows.length} סימוני לב`, contextMessageId);
    }
    return;
  }
  
  // Replies - text replies to status (תגובות)
  if (selectedId.startsWith('queued_reactions_')) {
    const realStatusId = await getStatusIdFromQueueId(statusId);
    if (!realStatusId) {
      await cloudApi.sendTextMessage(phone, '💬 הסטטוס עדיין לא נשלח או שלא נמצא', contextMessageId);
      return;
    }
    const replies = await db.query(
      `SELECT replier_phone, reply_text, replied_at FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC`,
      [realStatusId]
    );
    
    if (replies.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '💬 0 תגובות - אין תגובות עדיין', contextMessageId);
    } else {
      // Send as TXT file with count in caption
      const repliesList = replies.rows.map(r => `${r.replier_phone}: ${r.reply_text}`).join('\n');
      const fileContent = `רשימת תגובות (${replies.rows.length})\n${'='.repeat(30)}\n\n${repliesList}`;
      await cloudApi.sendDocumentMessage(phone, fileContent, `תגובות_${replies.rows.length}.txt`, `💬 ${replies.rows.length} תגובות`, contextMessageId);
    }
    return;
  }
  
  // Unknown queued action
  await cloudApi.sendTextMessage(phone, 'פעולה לא מזוהה', contextMessageId);
}

/**
 * Handle "כל הסטטוסים" - show all pending/scheduled statuses
 */
async function handleViewAllStatuses(phone) {
  const connections = await checkAuthorization(phone);
  
  if (connections.length === 0) {
    await cloudApi.sendTextMessage(phone, 'אין חשבון מחובר למספר שלך');
    return;
  }
  
  // Get statuses from first connection (or all if multiple)
  const connectionId = connections[0].connection_id;
  
  const result = await db.query(
    `SELECT id, status_type, content, queue_status, scheduled_for, created_at
     FROM status_bot_queue 
     WHERE connection_id = $1 
       AND queue_status IN ('pending', 'scheduled', 'processing')
     ORDER BY COALESCE(scheduled_for, created_at) ASC
     LIMIT 10`,
    [connectionId]
  );
  
  if (result.rows.length === 0) {
    await cloudApi.sendTextMessage(phone, '📋 אין סטטוסים בתור או מתוזמנים\n\nשלח תמונה, סרטון, הקלטה קולית או טקסט להעלאת סטטוס חדש');
    return;
  }
  
  // Build list of statuses
  const rows = result.rows.map((status, index) => {
    const content = typeof status.content === 'string' ? JSON.parse(status.content) : status.content;
    
    // Determine preview text
    let preview;
    if (status.status_type === 'text') {
      preview = (content.text || '').substring(0, 25);
      if (preview.length >= 25) preview += '...';
    } else {
      const typeLabels = { image: '🖼️ תמונה', video: '🎬 סרטון', voice: '🎤 הקלטה' };
      preview = typeLabels[status.status_type] || status.status_type;
      if (content.caption) {
        preview += `: ${content.caption.substring(0, 15)}`;
        if (content.caption.length > 15) preview += '...';
      }
    }
    
    // Determine time description
    let timeDesc;
    if (status.scheduled_for) {
      const scheduled = new Date(status.scheduled_for);
      const dayName = DAY_NAMES[scheduled.getDay()];
      timeDesc = `מתוזמן ל${dayName} ${scheduled.getDate()}/${scheduled.getMonth() + 1} ${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`;
    } else if (status.queue_status === 'processing') {
      timeDesc = '⏳ נשלח כעת...';
    } else {
      timeDesc = '🔄 בתור לשליחה';
    }
    
    return {
      id: `scheduled_${status.id}`,
      title: preview || `סטטוס ${index + 1}`,
      description: timeDesc
    };
  });
  
  const sections = [{
    title: `📋 ${result.rows.length} סטטוסים`,
    rows
  }];
  
  await cloudApi.sendListMessage(
    phone,
    `📋 סטטוסים בתור ומתוזמנים\n\nבחר סטטוס לצפייה בפרטים ופעולות`,
    'בחר סטטוס',
    sections
  );
}

/**
 * Handle "תפריט" - show main menu with instructions
 */
async function handleMainMenu(phone) {
  const menuText = `🤖 *בוט העלאת סטטוסים - Botomat*

📤 *איך מעלים סטטוס?*
שלח לי אחד מהבאים:
• 📝 טקסט - להעלאת סטטוס טקסט
• 🖼️ תמונה - להעלאת סטטוס תמונה
• 🎬 סרטון - להעלאת סטטוס וידאו
• 🎤 הקלטה קולית - להעלאת סטטוס קולי

⏰ *תזמון*
בחר "תזמן" במקום "שלח כעת" כדי לתזמן סטטוס לזמן עתידי

📊 *צפייה בסטטיסטיקות*
אחרי שסטטוס עולה, תוכל לראות:
• 👁️ מי צפה
• ❤️ מי סימן לב
• 💬 מי הגיב

🌐 *לפעולות נוספות*
היכנס לאתר: botomat.co.il
• צפייה בכל הסטטוסים
• ניהול חשבון
• הגדרות מתקדמות`;

  await cloudApi.sendTextMessage(phone, menuText);
}

/**
 * Handle status_* actions (from scheduled/queued status action buttons)
 * Format: status_action_statusId (e.g., status_send_now_abc123, status_cancel_abc123)
 */
async function handleStatusAction(phone, selectedId) {
  // Parse: status_action_statusId
  const parts = selectedId.split('_');
  if (parts.length < 3) {
    await cloudApi.sendTextMessage(phone, 'פעולה לא תקינה');
    return;
  }
  
  const action = parts[1]; // send, cancel, reschedule
  const statusId = parts.slice(2).join('_'); // Handle UUIDs with dashes
  
  if (action === 'cancel') {
    // Cancel the status
    await db.query(
      `UPDATE status_bot_queue SET queue_status = 'cancelled' WHERE id = $1`,
      [statusId]
    );
    await cloudApi.sendTextMessage(phone, '✅ הסטטוס בוטל');
    return;
  }
  
  if (action === 'send') {
    // Send now - set to pending and clear scheduled_for
    await db.query(
      `UPDATE status_bot_queue SET scheduled_for = NULL, queue_status = 'pending' WHERE id = $1`,
      [statusId]
    );
    await cloudApi.sendTextMessage(phone, '✅ הסטטוס נוסף לתור השליחה!');
    return;
  }
  
  if (action === 'reschedule') {
    // Get status info and start reschedule flow
    const statusResult = await db.query(
      `SELECT * FROM status_bot_queue WHERE id = $1`,
      [statusId]
    );
    
    if (statusResult.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, 'סטטוס לא נמצא');
      return;
    }
    
    // Show day selection for rescheduling (use Israel timezone)
    const days = [];
    const nowIsrael = getNowInIsrael();
    for (let i = 0; i < 8; i++) {
      const date = new Date(nowIsrael);
      date.setDate(date.getDate() + i);
      const dayName = DAY_NAMES[date.getDay()];
      const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
      
      let title = i === 0 ? 'היום' : i === 1 ? 'מחר' : `${dayName} ${dateStr}`;
      
      days.push({
        id: `resched_day_${i}_${statusId}`,
        title
      });
    }
    
    const sections = [{ title: 'בחר יום', rows: days }];
    
    await cloudApi.sendListMessage(
      phone,
      'באיזה יום לתזמן מחדש?',
      'בחר יום',
      sections
    );
    return;
  }
  
  await cloudApi.sendTextMessage(phone, 'פעולה לא מזוהה');
}

/**
 * Handle resched_* actions for rescheduling statuses
 * Format: resched_day_offset_statusId or text input for time
 */
async function handleRescheduleAction(phone, selectedId) {
  // Parse: resched_day_offset_statusId
  const parts = selectedId.split('_');
  
  if (parts.length >= 4 && parts[1] === 'day') {
    const dayOffset = parseInt(parts[2]);
    const statusId = parts.slice(3).join('_');
    
    // Use Israel timezone for date calculation
    const nowIsrael = getNowInIsrael();
    const scheduledDate = new Date(nowIsrael);
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
    
    // Format date as YYYY-MM-DD
    const year = scheduledDate.getFullYear();
    const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
    const day = String(scheduledDate.getDate()).padStart(2, '0');
    const scheduledDateStr = `${year}-${month}-${day}`;
    
    // Store in state and ask for time
    const connections = await checkAuthorization(phone);
    const connectionId = connections.length > 0 ? connections[0].connection_id : null;
    
    await setState(phone, 'waiting_reschedule_time', { 
      statusId, 
      scheduledDateStr,
      dayOffset
    }, null, connectionId);
    
    const dayName = DAY_NAMES[scheduledDate.getDay()];
    const dateDisplay = `${scheduledDate.getDate()}/${scheduledDate.getMonth() + 1}`;
    
    await cloudApi.sendTextMessage(
      phone,
      `📅 נבחר: יום ${dayName}, ${dateDisplay}\n\n⏰ באיזו שעה לתזמן?\n\nשלח את השעה בפורמט: 13:00\n(מקבל גם 1300 או 13)`
    );
    return;
  }
  
  await cloudApi.sendTextMessage(phone, 'פעולה לא מזוהה');
}

/**
 * Handle waiting for reschedule time input
 */
async function handleWaitingRescheduleTimeState(phone, message, state) {
  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, 'אנא הזן שעה, לדוגמא 13:00');
    return;
  }
  
  const timeInput = message.text.body.trim();
  const parsedTime = parseTimeInput(timeInput);
  
  if (!parsedTime) {
    await cloudApi.sendTextMessage(phone, 'פורמט שעה לא תקין, אנא נסה שוב (לדוגמא 13:00)');
    return;
  }
  
  const stateData = state.state_data || {};
  const statusId = stateData.statusId;
  const dateStr = stateData.scheduledDateStr;
  
  if (!statusId || !dateStr) {
    await cloudApi.sendTextMessage(phone, 'פג תוקף הפעולה, אנא נסה שוב');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  // Build scheduled time
  const timeStr = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`;
  const scheduledTime = convertIsraelTimeToUTC(`${dateStr}T${timeStr}:00`);
  
  // Check if time is in the past
  if (scheduledTime <= new Date()) {
    await cloudApi.sendTextMessage(phone, 'לא ניתן לתזמן לזמן שעבר, אנא בחר שעה עתידית');
    return;
  }
  
  try {
    // Update the status with new scheduled time
    await db.query(
      `UPDATE status_bot_queue SET scheduled_for = $1, queue_status = 'scheduled' WHERE id = $2`,
      [scheduledTime, statusId]
    );
    
    const hebrewDate = new Date(scheduledTime).toLocaleString('he-IL', { 
      timeZone: 'Asia/Jerusalem',
      day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    // Send action menu for rescheduled status
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
        { id: `queued_delete_${statusId}`, title: '🗑️ בטל תזמון', description: 'הסר מתור השליחה' },
        { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים בתור ומתוזמנים' },
        { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
      ]
    }];
    
    await cloudApi.sendListMessage(
      phone,
      `✅ הסטטוס תוזמן מחדש ל-${hebrewDate}\n\nמה תרצה לעשות?`,
      'בחר פעולה',
      sections
    );
    
    await setState(phone, 'idle', null, null);
    
  } catch (err) {
    console.error(`[CloudAPI Conv] Error rescheduling:`, err);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה בתזמון מחדש');
    await setState(phone, 'idle', null, null);
  }
}

/**
 * Handle account selection from list
 */
async function handleAccountSelection(phone, statusId, pendingStatus, connectionId) {
  // Validate connection
  const result = await db.query(
    `SELECT sbc.*, u.name as user_name, u.email as user_email
     FROM status_bot_connections sbc
     JOIN users u ON u.id = sbc.user_id
     WHERE sbc.id = $1`,
    [connectionId]
  );
  
  if (result.rows.length === 0) {
    await cloudApi.sendTextMessage(phone, 'חשבון לא נמצא');
    return;
  }
  
  const connection = result.rows[0];
  const validation = validateConnectionStatus(connection);
  if (!validation.valid && !validation.queueable) {
    await cloudApi.sendTextMessage(phone, validation.error);
    return;
  }

  // Update pending status with selected connection
  await updatePendingStatus(phone, statusId, { connectionId });
  
  // Get updated status
  const updatedStatus = await getPendingStatus(phone, statusId);
  
  // If video split - set caption mode and partCaptions
  if (updatedStatus.type === 'video_split') {
    // Get caption mode setting from connection
    const captionModeResult = await db.query(
      `SELECT split_video_caption_mode FROM status_bot_connections WHERE id = $1`,
      [connectionId]
    );
    const captionMode = captionModeResult.rows[0]?.split_video_caption_mode || 'first';
    const originalCaption = updatedStatus.originalCaption || '';
    const partCount = updatedStatus.totalParts || updatedStatus.parts?.length || 1;
    
    // Create partCaptions based on the mode
    let partCaptions;
    if (!originalCaption) {
      partCaptions = Array(partCount).fill('');
    } else if (captionMode === 'all') {
      partCaptions = Array(partCount).fill(originalCaption);
    } else {
      // Default: 'first' - caption only on first part
      partCaptions = [originalCaption, ...Array(partCount - 1).fill('')];
    }
    
    await updatePendingStatus(phone, statusId, { captionMode, partCaptions });
    
    const captionNote = originalCaption ? (captionMode === 'all' ? '\n\n📝 הכיתוב יופיע בכל החלקים' : '\n\n📝 הכיתוב יופיע על החלק הראשון בלבד') : '';
    await cloudApi.sendButtonMessage(
      phone,
      `🎬 הסרטון יחולק ל-${partCount} חלקים${captionNote}\n\nמה תרצה לעשות?`,
      [
        { id: `send_${statusId}`, title: 'שלח כעת' },
        { id: `sched_${statusId}`, title: 'תזמן' },
        { id: `cancel_${statusId}`, title: 'בטל' }
      ],
      updatedStatus.messageId
    );
    return;
  }
  
  // For text/voice - show color selection
  if (updatedStatus.type === 'text' || updatedStatus.type === 'voice') {
    const colors = await getAvailableColors(connectionId);
    
    if (colors.length === 1) {
      await updatePendingStatus(phone, statusId, { backgroundColor: `#${colors[0].id}` });
      await cloudApi.sendButtonMessage(
        phone,
        'מה תרצה לעשות עם הסטטוס?',
        [
          { id: `send_${statusId}`, title: 'שלח כעת' },
          { id: `sched_${statusId}`, title: 'תזמן' },
          { id: `cancel_${statusId}`, title: 'בטל' }
        ],
        updatedStatus.messageId
      );
    } else {
      const sections = [{
        title: 'צבעים',
        rows: colors.map(c => ({
          id: `color_${c.id}_${statusId}`,
          title: c.title
        }))
      }];
      
      await cloudApi.sendListMessage(
        phone,
        'בחר צבע רקע לסטטוס',
        'בחר צבע',
        sections,
        updatedStatus.messageId
      );
    }
    return;
  }
  
  // For image/video - go to action menu
  await cloudApi.sendButtonMessage(
    phone,
    'מה תרצה לעשות עם הסטטוס?',
    [
      { id: `send_${statusId}`, title: 'שלח כעת' },
      { id: `sched_${statusId}`, title: 'תזמן' },
      { id: `cancel_${statusId}`, title: 'בטל' }
    ],
    updatedStatus.messageId
  );
}

/**
 * Handle color selection
 */
async function handleColorSelection(phone, statusId, pendingStatus, colorId) {
  await updatePendingStatus(phone, statusId, { backgroundColor: `#${colorId}` });
  
  await cloudApi.sendButtonMessage(
    phone,
    'מה תרצה לעשות עם הסטטוס?',
    [
      { id: `send_${statusId}`, title: 'שלח כעת' },
      { id: `sched_${statusId}`, title: 'תזמן' },
      { id: `cancel_${statusId}`, title: 'בטל' }
    ],
    pendingStatus.messageId
  );
}

/**
 * Handle user choice for borderline video (91-93 seconds)
 */
async function handleSplitBorderlineVideo(phone, statusId, pendingStatus, shouldSplit) {
  if (shouldSplit) {
    // User wants to split - process the video
    await cloudApi.sendTextMessage(phone, '⏳ מחלק את הסרטון...', pendingStatus.messageId);
    
    const authorizedConnections = await checkAuthorization(phone);
    processVideoInBackground(phone, statusId, pendingStatus.url, pendingStatus.caption || '', authorizedConnections, pendingStatus.messageId);
  } else {
    // User doesn't want to split - remove askSplit flag and proceed normally
    await updatePendingStatus(phone, statusId, { askSplit: false });
    const updatedStatus = await getPendingStatus(phone, statusId);
    const authorizedConnections = await checkAuthorization(phone);
    await sendStatusMenu(phone, statusId, updatedStatus, authorizedConnections, pendingStatus.messageId);
  }
}

/**
 * Handle caption choice for video splits
 */
async function handleCaptionChoice(phone, statusId, pendingStatus, choice) {
  const originalCaption = pendingStatus.originalCaption || '';
  const partCount = pendingStatus.totalParts;
  
  let partCaptions = [];
  
  if (choice === 'all') {
    // Same caption on all parts
    partCaptions = Array(partCount).fill(originalCaption);
  } else if (choice === 'first') {
    // Caption only on first part
    partCaptions = [originalCaption, ...Array(partCount - 1).fill('')];
  } else if (choice === 'custom') {
    // Custom captions - need to collect them one by one
    await updatePendingStatus(phone, statusId, { 
      subState: 'collecting_captions',
      partCaptions: [originalCaption], // Start with original as first
      currentCaptionPart: 1 // Next part to collect (0-indexed, but we start from 1 since 0 already has original)
    });
    
    await cloudApi.sendTextMessage(
      phone,
      `כיתוב לחלק 1: "${originalCaption}"\n\nשלח את הכיתוב לחלק 2 מתוך ${partCount}:`,
      pendingStatus.messageId
    );
    return;
  }
  
  // Update with captions and go to action menu
  await updatePendingStatus(phone, statusId, { partCaptions });
  
  await cloudApi.sendButtonMessage(
    phone,
    `🎬 הסרטון יחולק ל-${partCount} חלקים\n\nמה תרצה לעשות?`,
    [
      { id: `send_${statusId}`, title: 'שלח כעת' },
      { id: `sched_${statusId}`, title: 'תזמן' },
      { id: `cancel_${statusId}`, title: 'בטל' }
    ],
    pendingStatus.messageId
  );
}

/**
 * Handle send now action
 */
async function handleSendNow(phone, statusId, pendingStatus) {
  const connectionId = pendingStatus.connectionId;
  if (!connectionId) {
    await cloudApi.sendTextMessage(phone, 'לא נבחר חשבון');
    return;
  }
  
  try {
    // Add to queue based on type
    if (pendingStatus.type === 'video_split') {
      // Add each part to queue
      const parts = pendingStatus.parts || [];
      const captions = pendingStatus.partCaptions || Array(parts.length).fill('');
      const partGroupId = uuidv4();
      const queuedIds = [];
      
      for (let i = 0; i < parts.length; i++) {
        // parts[i] is an object { filePath, url, partNumber, totalParts } - extract url
        const partUrl = typeof parts[i] === 'object' ? parts[i].url : parts[i];
        const insertResult = await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'pending', 'whatsapp', $3, $4, $5)
          RETURNING id
        `, [connectionId, JSON.stringify({ url: partUrl, caption: captions[i] || '' }), partGroupId, i + 1, parts.length]);
        queuedIds.push(insertResult.rows[0]?.id);
      }
      
      // Send confirmation
      await cloudApi.sendTextMessage(
        phone,
        `✅ ${parts.length} חלקי הסרטון נוספו לתור ויישלחו בקרוב!`,
        pendingStatus.messageId
      );
      
      // Send action list for each part
      for (let i = 0; i < queuedIds.length; i++) {
        const queuedId = queuedIds[i];
        const sections = [{
          title: 'סטטיסטיקות',
          rows: [
            { id: `queued_views_${queuedId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
            { id: `queued_hearts_${queuedId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
            { id: `queued_reactions_${queuedId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
          ]
        }, {
          title: 'פעולות',
          rows: [
            { id: `queued_delete_${queuedId}`, title: '🗑️ מחק חלק', description: 'הסר חלק זה מהתור' },
            { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים בתור ומתוזמנים' },
            { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
          ]
        }];
        
        await cloudApi.sendListMessage(
          phone,
          `📹 חלק ${i + 1} מתוך ${parts.length}`,
          'בחר פעולה',
          sections
        );
      }
    } else {
      // Single status - include backgroundColor in content if present
      const content = buildQueueContent(pendingStatus);
      const insertResult = await db.query(`
        INSERT INTO status_bot_queue 
        (connection_id, status_type, content, queue_status, source)
        VALUES ($1, $2, $3, 'pending', 'whatsapp')
        RETURNING id
      `, [connectionId, pendingStatus.type, JSON.stringify(content)]);
      
      const queuedStatusId = insertResult.rows[0]?.id;
      
      // Send menu with full options
      const sections = [{
        title: 'סטטיסטיקות',
        rows: [
          { id: `queued_views_${queuedStatusId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
          { id: `queued_hearts_${queuedStatusId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
          { id: `queued_reactions_${queuedStatusId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
        ]
      }, {
        title: 'פעולות',
        rows: [
          { id: `queued_delete_${queuedStatusId}`, title: '🗑️ מחק סטטוס', description: 'הסר מתור השליחה' },
          { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים בתור ומתוזמנים' },
          { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
        ]
      }];
      
      await cloudApi.sendListMessage(
        phone,
        '✅ הסטטוס נוסף לתור ויישלח בקרוב!\n\nמה תרצה לעשות עכשיו?',
        'בחר פעולה',
        sections,
        pendingStatus.messageId // Reply to original message
      );
    }
    
    // Remove from pending
    await removePendingStatus(phone, statusId);
    
  } catch (err) {
    console.error(`[CloudAPI Conv] Error adding to queue:`, err);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה בהוספה לתור');
  }
}

/**
 * Handle custom caption input when collecting captions for video splits
 * Returns 'handled' if this message was used for caption collection, otherwise null
 */
async function handleCustomCaptionInput(phone, text) {
  // Get all pending statuses
  const result = await db.query(
    `SELECT pending_statuses FROM cloud_api_conversation_states WHERE phone_number = $1`,
    [phone]
  );
  
  if (result.rows.length === 0) return null;
  
  const pendingStatuses = typeof result.rows[0].pending_statuses === 'string'
    ? JSON.parse(result.rows[0].pending_statuses || '{}')
    : (result.rows[0].pending_statuses || {});
  
  // Find a status that is collecting captions
  for (const [statusId, status] of Object.entries(pendingStatuses)) {
    if (status.subState === 'collecting_captions') {
      const currentPart = status.currentCaptionPart || 1;
      const totalParts = status.totalParts;
      const partCaptions = status.partCaptions || [];
      
      // Add this caption
      partCaptions[currentPart] = text;
      
      if (currentPart + 1 >= totalParts) {
        // All captions collected - go to action menu
        await updatePendingStatus(phone, statusId, {
          subState: 'ready',
          partCaptions,
          currentCaptionPart: null
        });
        
        await cloudApi.sendButtonMessage(
          phone,
          `✅ כל ${totalParts} הכיתובים נשמרו\n\nמה תרצה לעשות?`,
          [
            { id: `send_${statusId}`, title: 'שלח כעת' },
            { id: `sched_${statusId}`, title: 'תזמן' },
            { id: `cancel_${statusId}`, title: 'בטל' }
          ],
          status.messageId
        );
      } else {
        // Need more captions
        const nextPart = currentPart + 1;
        await updatePendingStatus(phone, statusId, {
          partCaptions,
          currentCaptionPart: nextPart
        });
        
        await cloudApi.sendTextMessage(
          phone,
          `✅ כיתוב לחלק ${currentPart + 1} נשמר\n\nשלח את הכיתוב לחלק ${nextPart + 1} מתוך ${totalParts}:`,
          status.messageId
        );
      }
      
      return 'handled';
    }
  }
  
  return null;
}

/**
 * Handle schedule start - show day selection
 */
async function handleScheduleStart(phone, statusId, pendingStatus) {
  // Generate next 8 days including today (use Israel timezone)
  const days = [];
  const nowIsrael = getNowInIsrael();
  
  for (let i = 0; i < 8; i++) {
    const date = new Date(nowIsrael);
    date.setDate(date.getDate() + i);
    
    const dayOfWeek = DAY_NAMES[date.getDay()];
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
    
    let title = `יום ${dayOfWeek} - ${dateStr}`;
    if (i === 0) title = `היום - ${dayOfWeek}`;
    if (i === 1) title = `מחר - ${dayOfWeek}`;
    
    days.push({
      id: `day_${i}_${statusId}`,
      title
    });
  }
  
  const sections = [{ title: 'בחר יום', rows: days }];
  
  await cloudApi.sendListMessage(
    phone,
    'באיזה יום לתזמן את הסטטוס?',
    'בחר יום',
    sections,
    pendingStatus.messageId
  );
}

/**
 * Handle day selection for scheduling
 */
async function handleDaySelection(phone, statusId, pendingStatus, dayOffset) {
  const offset = parseInt(dayOffset);
  
  // Use Israel timezone for date calculation
  const nowIsrael = getNowInIsrael();
  const scheduledDate = new Date(nowIsrael);
  scheduledDate.setDate(scheduledDate.getDate() + offset);
  
  // Format date as YYYY-MM-DD
  const year = scheduledDate.getFullYear();
  const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
  const day = String(scheduledDate.getDate()).padStart(2, '0');
  const scheduledDateStr = `${year}-${month}-${day}`;
  
  // Store selected day and set state to wait for time input
  const updates = { 
    scheduledDay: offset,
    scheduledDateStr
  };
  await updatePendingStatus(phone, statusId, updates);
  
  // Update local pendingStatus with the same data
  const updatedPendingStatus = { ...pendingStatus, ...updates };
  
  // Set state to wait for time input
  const connections = await checkAuthorization(phone);
  const connectionId = pendingStatus.connectionId || (connections.length > 0 ? connections[0].connection_id : null);
  await setState(phone, 'waiting_schedule_time', { statusId }, updatedPendingStatus, connectionId);
  
  // Ask for time as text input
  const dayName = DAY_NAMES[scheduledDate.getDay()];
  const dateDisplay = `${scheduledDate.getDate()}/${scheduledDate.getMonth() + 1}`;
  
  await cloudApi.sendTextMessage(
    phone,
    `📅 נבחר: יום ${dayName}, ${dateDisplay}\n\n⏰ באיזו שעה לתזמן?\n\nשלח את השעה בפורמט: 13:00\n(מקבל גם 1300 או 13)`,
    pendingStatus.messageId
  );
}

/**
 * Handle waiting for schedule time input (text message)
 */
async function handleWaitingScheduleTimeState(phone, message, state) {
  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, 'אנא הזן שעה, לדוגמא 13:00');
    return;
  }
  
  const timeInput = message.text.body.trim();
  const parsedTime = parseTimeInput(timeInput);
  
  if (!parsedTime) {
    await cloudApi.sendTextMessage(phone, 'פורמט שעה לא תקין, אנא נסה שוב (לדוגמא 13:00)');
    return;
  }
  
  const statusId = state.state_data?.statusId;
  const pendingStatus = state.pending_status;
  
  if (!pendingStatus) {
    await cloudApi.sendTextMessage(phone, 'פג תוקף הסטטוס, אנא שלח שוב');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  const connectionId = pendingStatus.connectionId || state.connection_id;
  if (!connectionId) {
    await cloudApi.sendTextMessage(phone, 'לא נבחר חשבון');
    return;
  }
  
  // Build scheduled time
  const dateStr = pendingStatus.scheduledDateStr;
  if (!dateStr) {
    await cloudApi.sendTextMessage(phone, 'לא נבחר תאריך, אנא התחל מחדש');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  const timeStr = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`;
  const scheduledTime = convertIsraelTimeToUTC(`${dateStr}T${timeStr}:00`);
  
  // Validate scheduled time
  if (isNaN(scheduledTime.getTime())) {
    console.error(`[CloudAPI Conv] Invalid scheduled time: dateStr=${dateStr}, timeStr=${timeStr}`);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה בפורמט התאריך, אנא התחל מחדש');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  // Check if time is in the past
  if (scheduledTime <= new Date()) {
    await cloudApi.sendTextMessage(phone, 'לא ניתן לתזמן לזמן שעבר, אנא בחר שעה עתידית');
    return;
  }
  
  try {
    let queuedStatusId = null;
    let isVideoSplit = pendingStatus.type === 'video_split';
    let partsCount = 0;
    const queuedIds = [];
    
    if (isVideoSplit) {
      // Schedule each part
      const parts = pendingStatus.parts || [];
      const captions = pendingStatus.partCaptions || Array(parts.length).fill('');
      const partGroupId = uuidv4();
      partsCount = parts.length;
      
      for (let i = 0; i < parts.length; i++) {
        const partUrl = typeof parts[i] === 'object' ? parts[i].url : parts[i];
        const result = await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, scheduled_for, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'scheduled', $3, 'whatsapp', $4, $5, $6)
          RETURNING id
        `, [connectionId, JSON.stringify({ url: partUrl, caption: captions[i] || '' }), scheduledTime, partGroupId, i + 1, parts.length]);
        queuedIds.push(result.rows[0]?.id);
        if (i === 0) queuedStatusId = result.rows[0]?.id;
      }
    } else {
      // Single status
      const content = buildQueueContent(pendingStatus);
      const result = await db.query(`
        INSERT INTO status_bot_queue 
        (connection_id, status_type, content, queue_status, scheduled_for, source)
        VALUES ($1, $2, $3, 'scheduled', $4, 'whatsapp')
        RETURNING id
      `, [connectionId, pendingStatus.type, JSON.stringify(content), scheduledTime]);
      queuedStatusId = result.rows[0]?.id;
    }
    
    // Remove from pending
    if (statusId) {
      await removePendingStatus(phone, statusId);
    }
    
    // Format date for display
    const hebrewDate = new Date(scheduledTime).toLocaleString('he-IL', { 
      timeZone: 'Asia/Jerusalem',
      day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    if (isVideoSplit && queuedIds.length > 1) {
      // Send confirmation
      await cloudApi.sendTextMessage(
        phone,
        `✅ ${partsCount} חלקי הסרטון תוזמנו ל-${hebrewDate}`,
        pendingStatus?.messageId
      );
      
      // Send action list for each part
      for (let i = 0; i < queuedIds.length; i++) {
        const queuedId = queuedIds[i];
        const sections = [{
          title: 'סטטיסטיקות',
          rows: [
            { id: `queued_views_${queuedId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
            { id: `queued_hearts_${queuedId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
            { id: `queued_reactions_${queuedId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
          ]
        }, {
          title: 'פעולות',
          rows: [
            { id: `queued_delete_${queuedId}`, title: '🗑️ בטל תזמון', description: 'הסר חלק זה מהתור' },
            { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים בתור ומתוזמנים' },
            { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
          ]
        }];
        
        await cloudApi.sendListMessage(
          phone,
          `📹 חלק ${i + 1} מתוך ${partsCount}`,
          'בחר פעולה',
          sections
        );
      }
    } else {
      // Single status - send action menu
      const sections = [{
        title: 'סטטיסטיקות',
        rows: [
          { id: `queued_views_${queuedStatusId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
          { id: `queued_hearts_${queuedStatusId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
          { id: `queued_reactions_${queuedStatusId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
        ]
      }, {
        title: 'פעולות',
        rows: [
          { id: `queued_delete_${queuedStatusId}`, title: '🗑️ בטל תזמון', description: 'הסר מתור השליחה' },
          { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים בתור ומתוזמנים' },
          { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
        ]
      }];
      
      await cloudApi.sendListMessage(
        phone,
        `✅ הסטטוס תוזמן ל-${hebrewDate}\n\nמה תרצה לעשות?`,
        'בחר פעולה',
        sections,
        pendingStatus?.messageId
      );
    }
    
    await setState(phone, 'idle', null, null);
    
  } catch (err) {
    console.error(`[CloudAPI Conv] Error scheduling:`, err);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה בתזמון');
    await setState(phone, 'idle', null, null);
  }
}

/**
 * Handle time selection for scheduling (legacy - from list selection)
 */
async function handleTimeSelection(phone, statusId, pendingStatus, timeStr) {
  const connectionId = pendingStatus.connectionId;
  if (!connectionId) {
    await cloudApi.sendTextMessage(phone, 'לא נבחר חשבון');
    return;
  }
  
  // Build scheduled time
  const dateStr = pendingStatus.scheduledDateStr;
  const scheduledTime = convertIsraelTimeToUTC(`${dateStr}T${timeStr}:00`);
  
  try {
    if (pendingStatus.type === 'video_split') {
      // Schedule each part
      const parts = pendingStatus.parts || [];
      const captions = pendingStatus.partCaptions || Array(parts.length).fill('');
      const partGroupId = uuidv4();
      const queuedIds = [];
      
      for (let i = 0; i < parts.length; i++) {
        // parts[i] is an object { filePath, url, partNumber, totalParts } - extract url
        const partUrl = typeof parts[i] === 'object' ? parts[i].url : parts[i];
        const insertResult = await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, scheduled_for, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'scheduled', $3, 'whatsapp', $4, $5, $6)
          RETURNING id
        `, [connectionId, JSON.stringify({ url: partUrl, caption: captions[i] || '' }), scheduledTime, partGroupId, i + 1, parts.length]);
        queuedIds.push(insertResult.rows[0]?.id);
      }
      
      const hebrewDate = new Date(scheduledTime).toLocaleString('he-IL', { 
        timeZone: 'Asia/Jerusalem',
        day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      
      // Send confirmation
      await cloudApi.sendTextMessage(phone, `✅ ${parts.length} חלקי הסרטון תוזמנו ל-${hebrewDate}`);
      
      // Send action list for each part
      for (let i = 0; i < queuedIds.length; i++) {
        const queuedId = queuedIds[i];
        const sections = [{
          title: 'סטטיסטיקות',
          rows: [
            { id: `queued_views_${queuedId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
            { id: `queued_hearts_${queuedId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
            { id: `queued_reactions_${queuedId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
          ]
        }, {
          title: 'פעולות',
          rows: [
            { id: `queued_delete_${queuedId}`, title: '🗑️ מחק חלק', description: 'הסר חלק זה מהתור' },
            { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים בתור ומתוזמנים' },
            { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
          ]
        }];
        
        await cloudApi.sendListMessage(
          phone,
          `📹 חלק ${i + 1} מתוך ${parts.length}`,
          'בחר פעולה',
          sections
        );
      }
    } else {
      // Single status
      const content = buildQueueContent(pendingStatus);
      await db.query(`
        INSERT INTO status_bot_queue 
        (connection_id, status_type, content, queue_status, scheduled_for, source)
        VALUES ($1, $2, $3, 'scheduled', $4, 'whatsapp')
      `, [connectionId, pendingStatus.type, JSON.stringify(content), scheduledTime]);
      
      const hebrewDate = new Date(scheduledTime).toLocaleString('he-IL', { 
        timeZone: 'Asia/Jerusalem',
        day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      
      await cloudApi.sendTextMessage(phone, `✅ הסטטוס תוזמן ל-${hebrewDate}`);
    }
    
    // Remove from pending
    await removePendingStatus(phone, statusId);
    
  } catch (err) {
    console.error(`[CloudAPI Conv] Error scheduling:`, err);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה בתזמון');
  }
}

/**
 * Build content object for queue from pending status
 * Note: queue.service.js expects 'file' field for media (not 'url')
 */
function buildQueueContent(pendingStatus) {
  switch (pendingStatus.type) {
    case 'text':
      return { 
        text: pendingStatus.text,
        backgroundColor: pendingStatus.backgroundColor || null
      };
    case 'image':
      return { file: pendingStatus.url, caption: pendingStatus.caption || '' };
    case 'video':
      return { file: pendingStatus.url, caption: pendingStatus.caption || '' };
    case 'voice':
      return { 
        file: pendingStatus.url,
        backgroundColor: pendingStatus.backgroundColor || null
      };
    default:
      return {};
  }
}

/**
 * Handle message in idle state - new status creation
 * Now supports multiple concurrent statuses with unique IDs
 *
 * @param {Object} options - { skipDestinationMenu: true } forces status-upload path
 *                           without re-showing the status/forwards chooser (used when
 *                           called back from handleSelectDestinationState after the
 *                           user has already chosen "סטטוס").
 */
async function handleIdleState(phone, message, state, options = {}) {
  const messageId = message.id; // Original message ID for reply context
  const { skipDestinationMenu = false } = options;

  // Check authorization for status upload + group forwards trigger via status bot (in parallel)
  const [authorizedConnections, forwardAuths] = await Promise.all([
    checkAuthorization(phone),
    checkStatusBotGroupForwardsAuth(phone),
  ]);

  const hasStatus = authorizedConnections.length > 0;
  const hasForwards = forwardAuths.length > 0;

  if (!hasStatus && !hasForwards) {
    if (!state.notified_not_authorized) {
      await cloudApi.sendTextMessage(phone,
        `שלום! על מנת להשתמש בבוט, יש להגדיר את המספר הזה כמספר מורשה.\n\nלהרשמה: https://botomat.co.il/`
      );
      await db.query(
        `UPDATE cloud_api_conversation_states SET notified_not_authorized = true WHERE phone_number = $1`,
        [phone]
      );
    }
    return;
  }

  // If user has access to group forwards (and not only status), show destination menu
  // Only show menu for messages that could go either way (text/image/video/audio)
  // skipDestinationMenu bypasses this when the user has already chosen "סטטוס"
  // in handleSelectDestinationState — otherwise we'd infinitely re-ask.
  const isContentMessage = ['text', 'image', 'video', 'audio'].includes(message.type);
  if (hasForwards && isContentMessage && !skipDestinationMenu) {
    // Pre-save the incoming message for later use
    const pendingMsg = {
      type: message.type,
      messageId: message.id,
      raw: message,
    };

    if (!hasStatus) {
      // Only group forwards → go directly to forward handling
      await setState(phone, 'pending_destination_forward', { pendingMsg, forwardAuths }, null);
      return await promptForwardSelection(phone, pendingMsg, forwardAuths);
    }

    // Both status upload AND group forwards → ask user what they want
    const buttons = [
      { id: 'dest_status', title: '📸 סטטוס' },
      { id: 'dest_forward', title: '📤 תפוצה לקבוצות' },
    ];
    await cloudApi.sendButtonMessage(
      phone,
      `שלום! מה תרצה לעשות עם ההודעה?`,
      buttons,
      message.id
    );
    await setState(phone, 'select_destination', { pendingMsg, forwardAuths }, null);
    return;
  }
  
  // Build pending status from message
  let statusData = null;
  let needsVideoProcessing = false;
  let videoUrl = null;
  let originalCaption = '';
  
  if (message.type === 'text' && message.text?.body) {
    let textContent = message.text.body;
    
    // Limit text statuses to 10 lines
    const lines = textContent.split('\n');
    if (lines.length > 10) {
      textContent = lines.slice(0, 10).join('\n');
      await cloudApi.sendTextMessage(phone, '⚠️ הטקסט קוצר ל-10 שורות', messageId);
    }
    
    statusData = {
      type: 'text',
      text: textContent,
      messageId
    };
  } else if (message.type === 'image' && message.image?.id) {
    const media = await cloudApi.downloadMedia(message.image.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    statusData = {
      type: 'image',
      url: url,
      caption: message.image.caption || '',
      messageId
    };
  } else if (message.type === 'video' && message.video?.id) {
    const media = await cloudApi.downloadMedia(message.video.id);
    videoUrl = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    originalCaption = message.video.caption || '';
    
    // Check video duration first (quick check without full processing)
    // Convert URL to local path for ffprobe (Docker can't resolve external URLs)
    let videoDuration = 0;
    try {
      const localVideoPath = videoUrl.replace(
        /^https?:\/\/[^\/]+\/api\/uploads\//,
        path.join(__dirname, '../../..', 'uploads') + '/'
      );
      videoDuration = await videoSplit.getVideoDuration(localVideoPath);
    } catch (e) {
      // Could not get video duration, default to 0
    }
    
    // Decide based on duration:
    // <= 91 seconds: normal video, no split
    // 91-93 seconds: ask user if they want to split
    // > 93 seconds: will need splitting (show processing message)
    if (videoDuration > 93) {
      // Long video - needs processing message
      statusData = {
        type: 'video',
        url: videoUrl,
        caption: originalCaption,
        messageId,
        videoDuration,
        processingVideo: true
      };
      needsVideoProcessing = true;
    } else if (videoDuration > 91 && videoDuration <= 93) {
      // Borderline video - ask user
      statusData = {
        type: 'video',
        url: videoUrl,
        caption: originalCaption,
        messageId,
        videoDuration,
        askSplit: true // Flag to ask user if they want to split
      };
    } else {
      // Short video - no split needed
      statusData = {
        type: 'video',
        url: videoUrl,
        caption: originalCaption,
        messageId
      };
    }
  } else if (message.type === 'audio' && message.audio?.id) {
    const media = await cloudApi.downloadMedia(message.audio.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    statusData = {
      type: 'voice',
      url: url,
      messageId
    };
  } else {
    await cloudApi.sendTextMessage(phone, 'סוג הודעה לא נתמך, אנא שלח טקסט, תמונה, סרטון או הקלטה קולית');
    return;
  }
  
  // Determine connection (single account or need to select)
  const connection = authorizedConnections.length === 1 ? authorizedConnections[0] : null;
  
  if (connection) {
    // Validate connection status — allow queuing even if not connected
    const validation = validateConnectionStatus(connection);
    if (!validation.valid && !validation.queueable) {
      await cloudApi.sendTextMessage(phone, validation.error);
      return;
    }
    statusData.connectionId = connection.connection_id;
    if (!validation.valid && validation.queueable) {
      statusData._queueWarning = validation.error;
    }
  } else {
    // Multiple accounts - store accounts for selection
    statusData.availableAccounts = authorizedConnections.map(c => ({
      id: c.connection_id,
      name: c.display_name || c.user_name || c.connection_phone,
      email: c.user_email
    }));
  }
  
  // Generate unique ID and store pending status
  const statusId = await addPendingStatus(phone, statusData, connection?.connection_id);
  
  // Handle video processing in background (non-blocking)
  if (needsVideoProcessing) {
    // Long video - send processing message and handle in background
    await cloudApi.sendTextMessage(phone, '⏳ מחלק את הסרטון לחלקים...', messageId);
    
    // Process video in background
    processVideoInBackground(phone, statusId, videoUrl, originalCaption, authorizedConnections, messageId);
    return;
  }
  
  // Ask user if they want to split borderline video (91-93 seconds)
  if (statusData.askSplit) {
    const durationStr = videoSplit.formatDuration(statusData.videoDuration);
    await cloudApi.sendButtonMessage(
      phone,
      `🎬 הסרטון באורך ${durationStr} - קרוב למגבלת הסטטוס\n\nהאם לחלק אותו לשני חלקים או להעלות כמו שהוא?`,
      [
        { id: `split_${statusId}`, title: 'חלק לשניים' },
        { id: `nosplit_${statusId}`, title: 'העלה ככה' },
        { id: `cancel_${statusId}`, title: 'בטל' }
      ],
      messageId
    );
    return;
  }
  
  // Proceed with normal flow
  await sendStatusMenu(phone, statusId, statusData, authorizedConnections, messageId);
}

/**
 * Process video in background and update status when done
 */
async function processVideoInBackground(phone, statusId, videoUrl, originalCaption, authorizedConnections, messageId) {
  try {
    const videoResult = await videoSplit.processVideo(videoUrl);
    
    if (videoResult.needsSplit) {
      const partCount = videoResult.parts.length;
      const partDuration = videoSplit.formatDuration(videoResult.partDuration);
      
      // Update pending status with split info
      await updatePendingStatus(phone, statusId, {
        type: 'video_split',
        parts: videoResult.parts,
        originalCaption: originalCaption,
        totalParts: partCount,
        partDuration: partDuration,
        processingVideo: false
      });
      
      // Determine connection
      const connection = authorizedConnections.length === 1 ? authorizedConnections[0] : null;
      
      if (!connection) {
        // Multiple accounts - need to select first
        const sections = [{
          title: 'חשבונות',
          rows: authorizedConnections.map(conn => ({
            id: `acc_${conn.connection_id}_${statusId}`,
            title: (conn.display_name || conn.user_name || conn.connection_phone || '').substring(0, 24),
            description: (conn.user_email || '').substring(0, 72)
          }))
        }];
        
        await cloudApi.sendListMessage(
          phone,
          `🎬 הסרטון ארוך מדקה וחצי ויחולק ל-${partCount} חלקים (~${partDuration} כל חלק)\n\nבחר את החשבון שאליו תרצה להעלות`,
          'בחר חשבון',
          sections,
          messageId
        );
        return;
      }
      
      // Single account - validate (allow queuing if queueable)
      const validation = validateConnectionStatus(connection);
      if (!validation.valid && !validation.queueable) {
        await cloudApi.sendTextMessage(phone, validation.error, messageId);
        await removePendingStatus(phone, statusId);
        return;
      }
      
      await updatePendingStatus(phone, statusId, { connectionId: connection.connection_id });
      
      // Get caption mode setting from connection
      const captionModeResult = await db.query(
        `SELECT split_video_caption_mode FROM status_bot_connections WHERE id = $1`,
        [connection.connection_id]
      );
      const captionMode = captionModeResult.rows[0]?.split_video_caption_mode || 'first';
      
      // Create partCaptions based on the mode
      let partCaptions;
      if (!originalCaption) {
        partCaptions = Array(partCount).fill('');
      } else if (captionMode === 'all') {
        partCaptions = Array(partCount).fill(originalCaption);
      } else {
        // Default: 'first' - caption only on first part
        partCaptions = [originalCaption, ...Array(partCount - 1).fill('')];
      }
      
      await updatePendingStatus(phone, statusId, { captionMode, partCaptions });
      
      // Simple message with send options
      const captionNote = originalCaption ? (captionMode === 'all' ? `\n\n📝 הכיתוב יופיע בכל החלקים` : `\n\n📝 הכיתוב יופיע על החלק הראשון בלבד`) : '';
      await cloudApi.sendButtonMessage(
        phone,
        `🎬 הסרטון יחולק ל-${partCount} חלקים (~${partDuration} כל חלק)${captionNote}\n\nמה תרצה לעשות?`,
        [
          { id: `send_${statusId}`, title: 'שלח כעת' },
          { id: `sched_${statusId}`, title: 'תזמן' },
          { id: `cancel_${statusId}`, title: 'בטל' }
        ],
        messageId
      );
    } else {
      // Video doesn't need splitting - update and send normal menu
      await updatePendingStatus(phone, statusId, {
        type: 'video',
        url: videoUrl,
        caption: originalCaption,
        processingVideo: false
      });
      
      const statusData = await getPendingStatus(phone, statusId);
      await sendStatusMenu(phone, statusId, statusData, authorizedConnections, messageId);
    }
  } catch (err) {
    console.error(`[CloudAPI Conv] Video processing error for ${statusId}:`, err);
    // On error, treat as normal video
    await updatePendingStatus(phone, statusId, {
      type: 'video',
      url: videoUrl,
      caption: originalCaption,
      processingVideo: false
    });
    
    const statusData = await getPendingStatus(phone, statusId);
    await sendStatusMenu(phone, statusId, statusData, authorizedConnections, messageId);
  }
}

/**
 * Send the appropriate menu for a status
 */
async function sendStatusMenu(phone, statusId, statusData, authorizedConnections, messageId) {
  // If multiple accounts and not yet selected
  if (statusData.availableAccounts && !statusData.connectionId) {
    const sections = [{
      title: 'חשבונות',
      rows: statusData.availableAccounts.map(acc => ({
        id: `acc_${acc.id}_${statusId}`,
        title: (acc.name || '').substring(0, 24),
        description: (acc.email || '').substring(0, 72)
      }))
    }];
    
    await cloudApi.sendListMessage(
      phone,
      'נמצאו מספר חשבונות מקושרים למספר שלך\nבחר את החשבון שאליו תרצה להעלות',
      'בחר חשבון',
      sections,
      messageId
    );
    return;
  }
  
  // For text/voice - show color selection
  if (statusData.type === 'text' || statusData.type === 'voice') {
    const colors = await getAvailableColors(statusData.connectionId);
    
    if (colors.length === 1) {
      // Single color - skip selection and go to action
      await updatePendingStatus(phone, statusId, { backgroundColor: `#${colors[0].id}` });
      await cloudApi.sendButtonMessage(
        phone,
        'מה תרצה לעשות עם הסטטוס?',
        [
          { id: `send_${statusId}`, title: 'שלח כעת' },
          { id: `sched_${statusId}`, title: 'תזמן' },
          { id: `cancel_${statusId}`, title: 'בטל' }
        ],
        messageId
      );
    } else {
      // Multiple colors - show color selection
      const sections = [{
        title: 'צבעים',
        rows: colors.map(c => ({
          id: `color_${c.id}_${statusId}`,
          title: c.title
        }))
      }];
      
      await cloudApi.sendListMessage(
        phone,
        'בחר צבע רקע לסטטוס',
        'בחר צבע',
        sections,
        messageId
      );
    }
    return;
  }
  
  // For image/video - go directly to action menu
  await cloudApi.sendButtonMessage(
    phone,
    'מה תרצה לעשות עם הסטטוס?',
    [
      { id: `send_${statusId}`, title: 'שלח כעת' },
      { id: `sched_${statusId}`, title: 'תזמן' },
      { id: `cancel_${statusId}`, title: 'בטל' }
    ],
    messageId
  );
}

/**
 * Get available colors for a connection
 */
async function getAvailableColors(connectionId) {
  if (!connectionId) return DEFAULT_COLORS;
  
  try {
    const result = await db.query(
      `SELECT custom_colors FROM status_bot_connections WHERE id = $1`,
      [connectionId]
    );
    
    if (result.rows.length > 0 && result.rows[0].custom_colors) {
      const colors = result.rows[0].custom_colors;
      return Array.isArray(colors) ? colors : DEFAULT_COLORS;
    }
  } catch (e) {
    console.error('[CloudAPI Conv] Error getting colors:', e);
  }
  
  return DEFAULT_COLORS;
}

// Keep old handleIdleState logic below for reference during migration
async function handleIdleState_LEGACY(phone, message, state) {
  // This is the old implementation - kept for reference
  const authorizedConnections = await checkAuthorization(phone);
  if (authorizedConnections.length === 0) return;
  
  let pendingStatus = null;
  
  if (message.type === 'text') {
    pendingStatus = { type: 'text', text: message.text.body };
  } else if (message.type === 'image') {
    const media = await cloudApi.downloadMedia(message.image.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    pendingStatus = { type: 'image', url, caption: message.image.caption || '' };
  } else if (message.type === 'video') {
    const media = await cloudApi.downloadMedia(message.video.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    const originalCaption = message.video.caption || '';
    
    // Check if video needs splitting (> 90 seconds)
    try {
      const videoResult = await videoSplit.processVideo(url);
      
      if (videoResult.needsSplit) {
        // Video needs splitting - inform user and handle caption choice
        const partCount = videoResult.parts.length;
        const partDuration = videoSplit.formatDuration(videoResult.partDuration);
        
        // Store video parts info
        pendingStatus = {
          type: 'video_split',
          parts: videoResult.parts,
          originalCaption: originalCaption,
          totalParts: partCount
        };
        
        // If multiple accounts - need to select first
        if (authorizedConnections.length > 1) {
          const sections = [{
            title: 'חשבונות',
            rows: authorizedConnections.map(conn => ({
              id: `account_${conn.connection_id}`,
              title: (conn.display_name || conn.user_name || conn.connection_phone || '').substring(0, 24),
              description: (conn.user_email || '').substring(0, 72)
            }))
          }];
          
          await cloudApi.sendListMessage(
            phone,
            `🎬 הסרטון ארוך מדקה וחצי ויחולק ל-${partCount} חלקים (~${partDuration} כל חלק)\n\nנמצאו מספר חשבונות מקושרים למספר שלך\nבחר את החשבון שאליו תרצה להעלות`,
            'בחר חשבון',
            sections
          );
          
          await setState(phone, 'select_account', { accounts: authorizedConnections, isVideoSplit: true }, pendingStatus);
          return;
        }
        
        // Single account - validate (allow queuing if queueable)
        const connection = authorizedConnections[0];
        const validation = validateConnectionStatus(connection);
        if (!validation.valid && !validation.queueable) {
          await cloudApi.sendTextMessage(phone, validation.error);
          return;
        }
        
        // Get caption mode setting from connection
        const captionModeResult = await db.query(
          `SELECT split_video_caption_mode FROM status_bot_connections WHERE id = $1`,
          [connection.connection_id]
        );
        const captionMode = captionModeResult.rows[0]?.split_video_caption_mode || 'first';
        
        // Apply caption based on setting
        let partCaptions;
        if (!originalCaption) {
          partCaptions = Array(partCount).fill('');
        } else if (captionMode === 'all') {
          partCaptions = Array(partCount).fill(originalCaption);
        } else {
          // Default: 'first' - caption only on first part
          partCaptions = [originalCaption, ...Array(partCount - 1).fill('')];
        }
        
        pendingStatus.partCaptions = partCaptions;
        
        await setState(phone, 'select_action', { isVideoSplit: true, videoParts: videoResult.parts }, pendingStatus, connection.connection_id);
        
        const captionNote = originalCaption ? (captionMode === 'all' ? '\n📝 הכיתוב יופיע בכל החלקים' : '\n📝 הכיתוב יופיע רק בחלק הראשון') : '';
        await cloudApi.sendButtonMessage(
          phone,
          `🎬 הסרטון יחולק ל-${partCount} חלקים (~${partDuration} כל חלק)${captionNote}\n\nמה תרצה לעשות?`,
          [
            { id: 'action_send', title: 'שלח כעת' },
            { id: 'action_schedule', title: 'תזמן' },
            { id: 'action_cancel', title: 'בטל' }
          ]
        );
        return;
      }
    } catch (videoErr) {
      console.log(`[CloudAPI Conv] Video processing skipped or failed: ${videoErr.message}`);
      // Continue with normal flow if video processing fails
    }
    
    pendingStatus = {
      type: 'video',
      url: url,
      caption: originalCaption
    };
  } else if (message.type === 'audio') {
    const media = await cloudApi.downloadMedia(message.audio.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    pendingStatus = {
      type: 'voice',
      url: url
    };
  } else {
    await cloudApi.sendTextMessage(phone, 'סוג הודעה לא נתמך, אנא שלח טקסט, תמונה, סרטון או הקלטה קולית');
    return;
  }
  
  // If multiple accounts - ask to select
  if (authorizedConnections.length > 1) {
    const sections = [{
      title: 'חשבונות',
      rows: authorizedConnections.map(conn => ({
        id: `account_${conn.connection_id}`,
        title: (conn.display_name || conn.user_name || conn.connection_phone || '').substring(0, 24),
        description: (conn.user_email || '').substring(0, 72)
      }))
    }];
    
    await cloudApi.sendListMessage(
      phone,
      'נמצאו מספר חשבונות מקושרים למספר שלך\nבחר את החשבון שאליו תרצה להעלות',
      'בחר חשבון',
      sections
    );
    
    await setState(phone, 'select_account', { accounts: authorizedConnections }, pendingStatus);
    return;
  }
  
  // Single account - validate and proceed
  const connection = authorizedConnections[0];
  
  // Validate connection status (allow queuing if queueable)
  const validation = validateConnectionStatus(connection);
  if (!validation.valid && !validation.queueable) {
    await cloudApi.sendTextMessage(phone, validation.error);
    return;
  }
  
  // For media (image/video), skip color selection and go to action
  if (pendingStatus.type === 'image' || pendingStatus.type === 'video') {
    await setState(phone, 'select_action', null, pendingStatus, connection.connection_id);
    await cloudApi.sendButtonMessage(
      phone,
      'מה תרצה לעשות עם הסטטוס?',
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
    return;
  }
  
  // For text/voice - go to color selection
  const singleColor = await sendColorSelection(phone, connection.connection_id);
  
  if (singleColor) {
    // Only one color - skip selection, set it directly and go to action
    pendingStatus.backgroundColor = `#${singleColor.id}`;
    await setState(phone, 'select_action', null, pendingStatus, connection.connection_id);
    await cloudApi.sendButtonMessage(
      phone,
      'מה תרצה לעשות עם הסטטוס?',
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
  } else {
    await setState(phone, 'select_color', null, pendingStatus, connection.connection_id);
  }
}

/**
 * Handle account selection
 */
async function handleSelectAccountState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'list_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const selectedId = message.interactive.list_reply.id;
  const connectionId = selectedId.replace('account_', '');
  
  const stateData = state.state_data || {};
  const accounts = stateData.accounts || [];
  const selectedAccount = accounts.find(a => a.connection_id === connectionId);
  
  if (!selectedAccount) {
    await cloudApi.sendTextMessage(phone, 'חשבון לא נמצא, אנא נסה שוב');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  // Validate connection status (allow queuing if queueable)
  const validation = validateConnectionStatus(selectedAccount);
  if (!validation.valid && !validation.queueable) {
    await cloudApi.sendTextMessage(phone, validation.error);
    await setState(phone, 'idle', null, null);
    return;
  }
  
  const pendingStatus = state.pending_status;
  
  // For video_split - apply caption mode setting and go to action
  if (pendingStatus.type === 'video_split') {
    // Get caption mode setting from connection
    const captionModeResult = await db.query(
      `SELECT split_video_caption_mode FROM status_bot_connections WHERE id = $1`,
      [connectionId]
    );
    const captionMode = captionModeResult.rows[0]?.split_video_caption_mode || 'first';
    const originalCaption = pendingStatus.originalCaption || '';
    const partCount = pendingStatus.totalParts || pendingStatus.parts?.length || 1;
    
    // Apply caption based on setting
    let partCaptions;
    if (!originalCaption) {
      partCaptions = Array(partCount).fill('');
    } else if (captionMode === 'all') {
      partCaptions = Array(partCount).fill(originalCaption);
    } else {
      partCaptions = [originalCaption, ...Array(partCount - 1).fill('')];
    }
    
    pendingStatus.partCaptions = partCaptions;
    
    await setState(phone, 'select_action', { isVideoSplit: true }, pendingStatus, connectionId);
    
    const captionNote = originalCaption ? (captionMode === 'all' ? '\n📝 הכיתוב יופיע בכל החלקים' : '\n📝 הכיתוב יופיע רק בחלק הראשון') : '';
    await cloudApi.sendButtonMessage(
      phone,
      `🎬 הסרטון יחולק ל-${partCount} חלקים${captionNote}\n\nמה תרצה לעשות?`,
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
    return;
  }
  
  // For media (image/video), skip color selection and go to action
  if (pendingStatus.type === 'image' || pendingStatus.type === 'video') {
    await setState(phone, 'select_action', null, pendingStatus, connectionId);
    await cloudApi.sendButtonMessage(
      phone,
      'מה תרצה לעשות עם הסטטוס?',
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
    return;
  }
  
  // For text/voice - go to color selection
  const singleColor = await sendColorSelection(phone, connectionId);
  
  if (singleColor) {
    // Only one color - skip selection, set it directly and go to action
    pendingStatus.backgroundColor = `#${singleColor.id}`;
    await setState(phone, 'select_action', null, pendingStatus, connectionId);
    await cloudApi.sendButtonMessage(
      phone,
      'מה תרצה לעשות עם הסטטוס?',
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
  } else {
    await setState(phone, 'select_color', null, pendingStatus, connectionId);
  }
}

/**
 * Send color selection list
 * Returns the single color if only one available, null otherwise
 */
async function sendColorSelection(phone, connectionId) {
  const colors = await getColorsForConnection(connectionId);
  
  // If only one color, skip selection and return it
  if (colors.length === 1) {
    return colors[0];
  }
  
  const sections = [{
    title: 'צבעים',
    rows: colors.map(color => ({
      id: `color_${color.id}`,
      title: color.title
    }))
  }];
  
  await cloudApi.sendListMessage(
    phone,
    'בחר צבע מהרשימה',
    'בחר צבע',
    sections
  );
  
  return null;
}

/**
 * Handle color selection
 */
async function handleSelectColorState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'list_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const selectedId = message.interactive.list_reply.id;
  const colorId = selectedId.replace('color_', '');
  
  // Update pending status with color
  const pendingStatus = state.pending_status || {};
  pendingStatus.backgroundColor = `#${colorId}`;
  
  await setState(phone, 'select_action', null, pendingStatus, state.connection_id);
  
  // Send action buttons
  await cloudApi.sendButtonMessage(
    phone,
    'מה תרצה לעשות עם הסטטוס?',
    [
      { id: 'action_send', title: 'שלח כעת' },
      { id: 'action_schedule', title: 'תזמן' },
      { id: 'action_cancel', title: 'בטל' }
    ]
  );
}

/**
 * Handle action selection (send/schedule/cancel)
 */
async function handleSelectActionState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'button_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const actionId = message.interactive.button_reply.id;
  const pendingStatus = state.pending_status;
  const stateData = state.state_data || {};
  const isVideoSplit = stateData.isVideoSplit || pendingStatus?.type === 'video_split';
  
  if (actionId === 'action_cancel') {
    await cloudApi.sendTextMessage(phone, 'הסטטוס בוטל');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'action_send') {
    // Check if video split
    if (isVideoSplit && pendingStatus.parts) {
      // Add all parts to queue
      const parts = pendingStatus.parts;
      const partCaptions = pendingStatus.partCaptions || [];
      const partGroupId = uuidv4();
      const queuedIds = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const content = {
          file: {
            mimetype: 'video/mp4',
            filename: `status_part${i + 1}.mp4`,
            url: part.url
          },
          caption: partCaptions[i] || part.caption || ''
        };
        
        const queueResult = await addToQueueWithParts(
          state.connection_id, 
          'video', 
          content, 
          null, 
          phone,
          partGroupId,
          i + 1,
          parts.length
        );
        queuedIds.push(queueResult?.id);
      }
      
      // Show success message
      const sections = [{
        title: 'פעולות',
        rows: [
          { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים מתוזמנים ופעילים' },
          { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
        ]
      }];
      
      await cloudApi.sendListMessage(
        phone,
        `✅ ${parts.length} חלקי סרטון נוספו לתור השליחה!\n\nהחלקים יישלחו בזה אחר זה עם הפרש של 30 שניות ביניהם.\n\nבחר פעולה`,
        'בחר פעולה',
        sections,
        pendingStatus?.messageId // Reply to original message
      );
      await setState(phone, 'after_send_menu', { queuedStatusIds: queuedIds }, null, state.connection_id);
      return;
    }
    
    // Normal single status
    const content = buildStatusContent(pendingStatus);
    
    const queueResult = await addToQueue(state.connection_id, pendingStatus.type, content, null, phone);
    const queuedStatusId = queueResult?.id;

    // Check if connection has issues — add warning to success message
    const connCheck = await db.query('SELECT connection_status, display_name, phone_number, restriction_lifted, last_connected_at, first_connected_at FROM status_bot_connections WHERE id = $1', [state.connection_id]);
    const connRow = connCheck.rows[0];
    const connValidation = connRow ? validateConnectionStatus(connRow) : null;
    const queueWarning = (connValidation && !connValidation.valid && connValidation.queueable) ? `\n\n${connValidation.error}` : '';

    // Show success message with action list (simplified - combined count+list)
    const sections = [{
      title: 'סטטיסטיקות',
      rows: [
        { id: `queued_views_${queuedStatusId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
        { id: `queued_hearts_${queuedStatusId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
        { id: `queued_reactions_${queuedStatusId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
      ]
    }, {
      title: 'פעולות',
      rows: [
        { id: `queued_delete_${queuedStatusId}`, title: '🗑️ מחק סטטוס', description: 'הסר מתור השליחה' },
        { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים מתוזמנים ופעילים' },
        { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
      ]
    }];

    await cloudApi.sendListMessage(
      phone,
      `✅ הסטטוס נוסף לתור השליחה!${queueWarning}\n\nבחר פעולה`,
      'בחר פעולה',
      sections,
      pendingStatus?.messageId // Reply to original message
    );
    await setState(phone, 'after_send_menu', { queuedStatusId }, null, state.connection_id);
    return;
  }
  
  if (actionId === 'action_schedule') {
    // Show day selection
    await sendDaySelection(phone);
    await setState(phone, 'select_schedule_day', { isVideoSplit }, state.pending_status, state.connection_id);
  }
}

/**
 * Send day selection list for scheduling - 8 days
 */
async function sendDaySelection(phone) {
  const dayLabels = ['היום', 'מחר', 'מחרתיים', 'בעוד 3 ימים', 'בעוד 4 ימים', 'בעוד 5 ימים', 'בעוד 6 ימים', 'בעוד שבוע'];
  
  const rows = [];
  const nowIsrael = getNowInIsrael();
  for (let i = 0; i < 8; i++) {
    const date = new Date(nowIsrael);
    date.setDate(date.getDate() + i);
    const dayName = DAY_NAMES[date.getDay()];
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    rows.push({
      id: `day_${i}`,
      title: dayLabels[i],
      description: `יום ${dayName}, ${dateStr}`
    });
  }
  
  const sections = [{
    title: 'בחר יום',
    rows: rows
  }];
  
  await cloudApi.sendListMessage(
    phone,
    'בחר יום לשליחה',
    'בחר יום',
    sections
  );
}

/**
 * Handle day selection for scheduling
 */
async function handleSelectScheduleDayState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'list_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const selectedId = message.interactive.list_reply.id;
  const daysOffset = parseInt(selectedId.replace('day_', ''));
  const currentStateData = state.state_data || {};
  
  // Use Israel timezone for date calculation
  const nowIsrael = getNowInIsrael();
  const selectedDate = new Date(nowIsrael);
  selectedDate.setDate(selectedDate.getDate() + daysOffset);
  
  // Format date as YYYY-MM-DD
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(selectedDate.getDate()).padStart(2, '0');
  const scheduledDateStr = `${year}-${month}-${day}`;
  
  const stateData = {
    scheduledDate: scheduledDateStr,
    daysOffset: daysOffset,
    isVideoSplit: currentStateData.isVideoSplit,
    rescheduleId: currentStateData.rescheduleId
  };
  
  await setState(phone, 'select_schedule_time', stateData, state.pending_status, state.connection_id);
  await cloudApi.sendTextMessage(phone, 'הזן שעת שליחה (לדוגמא 13:00)');
}

/**
 * Handle time input for scheduling
 */
async function handleSelectScheduleTimeState(phone, message, state) {
  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, 'אנא הזן שעה, לדוגמא 13:00');
    return;
  }
  
  const timeInput = message.text.body.trim();
  const parsedTime = parseTimeInput(timeInput);
  
  if (!parsedTime) {
    await cloudApi.sendTextMessage(phone, 'פורמט שעה לא תקין, אנא נסה שוב (לדוגמא 13:00)');
    return;
  }
  
  const stateData = state.state_data || {};
  
  // Create date in Israel timezone (Asia/Jerusalem)
  const dateStr = stateData.scheduledDate; // YYYY-MM-DD
  const timeStr = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}:00`;
  
  // Create date string and convert from Israel timezone to UTC
  const israelDateTimeStr = `${dateStr}T${timeStr}`;
  const scheduledDate = convertIsraelTimeToUTC(israelDateTimeStr);
  
  // Check if time is in the past
  if (scheduledDate <= new Date()) {
    await cloudApi.sendTextMessage(phone, 'לא ניתן לתזמן לזמן שעבר, אנא בחר שעה עתידית');
    return;
  }
  
  // Check if this is a reschedule
  const stateDataObj = state.state_data || {};
  const rescheduleId = stateDataObj.rescheduleId;
  const isVideoSplit = stateDataObj.isVideoSplit;
  
  // Calculate hours until scheduled time
  const hoursUntilScheduled = (scheduledDate - new Date()) / (1000 * 60 * 60);
  const isMoreThan24Hours = hoursUntilScheduled > 24;
  
  let queuedStatusId = null;
  let queuedStatusIds = [];
  
  if (rescheduleId) {
    // Update existing scheduled status
    await db.query(
      `UPDATE status_bot_queue SET scheduled_for = $1, queue_status = 'pending' WHERE id = $2`,
      [scheduledDate, rescheduleId]
    );
    queuedStatusId = rescheduleId;
  } else {
    // Add new to queue with schedule
    const pendingStatus = state.pending_status;
    
    // Handle video split
    if (isVideoSplit && pendingStatus.parts) {
      const parts = pendingStatus.parts;
      const partCaptions = pendingStatus.partCaptions || [];
      const partGroupId = uuidv4();
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const content = {
          file: {
            mimetype: 'video/mp4',
            filename: `status_part${i + 1}.mp4`,
            url: part.url
          },
          caption: partCaptions[i] || part.caption || ''
        };
        
        const queueResult = await addToQueueWithParts(
          state.connection_id, 
          'video', 
          content, 
          scheduledDate, 
          phone,
          partGroupId,
          i + 1,
          parts.length
        );
        queuedStatusIds.push(queueResult?.id);
      }
      queuedStatusId = queuedStatusIds[0];
    } else {
      const content = buildStatusContent(pendingStatus);
      const queueResult = await addToQueue(state.connection_id, pendingStatus.type, content, scheduledDate, phone);
      queuedStatusId = queueResult?.id;
    }
  }
  
  const formattedTime = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`;
  const formattedDate = formatDateHebrew(scheduledDate);
  
  // Video split message
  const videoSplitNote = isVideoSplit && queuedStatusIds.length > 1 
    ? `\n\n📹 ${queuedStatusIds.length} חלקי סרטון תוזמנו` 
    : '';
  
  // If scheduled >24h ahead, show action list immediately (won't get notification later)
  if (isMoreThan24Hours) {
    const sections = [{
      title: 'פעולות',
      rows: [
        { id: 'queued_view_all', title: '📋 כל הסטטוסים', description: 'סטטוסים מתוזמנים ופעילים' },
        { id: 'queued_menu', title: '🏠 תפריט ראשי', description: 'חזור לתפריט' }
      ]
    }];
    
    // Add stats rows only for single status (not video split)
    if (!isVideoSplit || queuedStatusIds.length <= 1) {
      sections.unshift({
        title: 'סטטיסטיקות',
        rows: [
          { id: `queued_views_${queuedStatusId}`, title: '👁️ צפיות', description: 'רשימת הצופים בסטטוס' },
          { id: `queued_hearts_${queuedStatusId}`, title: '❤️ סימוני לב', description: 'רשימת מי שסימן לב' },
          { id: `queued_reactions_${queuedStatusId}`, title: '💬 תגובות', description: 'רשימת המגיבים' }
        ]
      });
      sections[1].rows.unshift({ id: `queued_delete_${queuedStatusId}`, title: '🗑️ מחק סטטוס', description: 'בטל את התזמון' });
    }
    
    await cloudApi.sendListMessage(
      phone,
      `✅ הסטטוס תוזמן ל${formattedDate} בשעה ${formattedTime}${videoSplitNote}\n\n⚠️ לא תקבל הודעה כשהסטטוס יעלה (מעבר ל-24 שעות)\n\nבחר פעולה`,
      'בחר פעולה',
      sections
    );
    await setState(phone, 'after_send_menu', { queuedStatusId, queuedStatusIds }, null, state.connection_id);
  } else {
    // Scheduled <24h - show confirmation, notification will come when uploaded
    const extraNote = videoSplitNote ? `\n${videoSplitNote}` : '';
    await showScheduledListWithConfirmation(phone, state.connection_id, formattedDate, formattedTime, extraNote);
    await setState(phone, 'view_scheduled', null, null, state.connection_id);
  }
}

/**
 * Handle after send menu state
 */
/**
 * Prompt user to pick a specific forward (when they have more than one).
 * If only one forward, trigger it directly.
 */
async function promptForwardSelection(phone, pendingMsg, forwardAuths) {
  if (forwardAuths.length === 1) {
    return await triggerChosenForward(phone, pendingMsg, forwardAuths[0]);
  }

  const rows = forwardAuths.slice(0, 10).map(f => ({
    id: `fwd_${f.forward_id}`,
    title: (f.forward_name || 'תפוצה').slice(0, 24),
    description: (f.user_name || '').slice(0, 72),
  }));

  await cloudApi.sendListMessage(
    phone,
    `בחר איזו תפוצה להפעיל`,
    'בחר תפוצה',
    [{ title: 'תפוצות זמינות', rows }]
  );
  await setState(phone, 'pending_destination_forward', { pendingMsg, forwardAuths }, null);
}

/**
 * Actually trigger the forward for the chosen pending message.
 */
async function triggerChosenForward(phone, pendingMsg, forwardAuth) {
  try {
    const { triggerFromStatusBot } = require('../groupForwards/statusBotTrigger.service');
    const result = await triggerFromStatusBot(forwardAuth.user_id, forwardAuth.forward_id, phone, pendingMsg.raw);

    if (result.requireConfirmation) {
      // Send confirmation list with 3 options (matches the regular WAHA bot UX)
      const sections = [{
        title: 'בחר פעולה',
        rows: [
          { id: `fwd_confirm_${result.jobId}`, title: '✅ שלח עכשיו', description: `שלח מיד ל-${result.targetCount} קבוצות` },
          { id: `fwd_schedule_${result.jobId}`, title: '⏰ תזמן שליחה', description: 'תזמן לתאריך ושעה' },
          { id: `fwd_cancel_${result.jobId}`, title: '❌ בטל', description: 'בטל את ההפצה' },
        ]
      }];
      await cloudApi.sendListMessage(
        phone,
        `📤 *${result.forwardName}*\n\nלשלוח את ההודעה ל-${result.targetCount} קבוצות?`,
        'בחר פעולה',
        sections
      );
    } else {
      // Auto-confirmed - send list with stop options
      const sections = [{
        title: 'פעולות',
        rows: [
          { id: `fwd_stop_${result.jobId}`, title: '⏹️ עצור', description: 'עצור את השליחה' },
          { id: `fwd_stopdelete_${result.jobId}`, title: '🗑️ עצור ומחק', description: 'עצור ומחק את ההודעות שנשלחו' },
        ]
      }];
      await cloudApi.sendListMessage(
        phone,
        `📤 *${result.forwardName}*\n\n✅ שולח ל-${result.targetCount} קבוצות...\n\nבחר פעולה במידה ותרצה לעצור`,
        'פעולות',
        sections
      );
    }
  } catch (err) {
    console.error('[GroupForwards] triggerFromStatusBot error:', err);
    await cloudApi.sendTextMessage(phone, `❌ שגיאה: ${err.message}`, pendingMsg.messageId);
  }
  await setState(phone, 'idle', null, null);
}

async function handleSelectDestinationState(phone, message, state) {
  const stateData = state.state_data || {};
  const pendingMsg = stateData.pendingMsg;
  const forwardAuths = stateData.forwardAuths || [];

  if (!pendingMsg) {
    await setState(phone, 'idle', null, null);
    return;
  }

  if (message.type !== 'interactive') {
    // User sent a new message - treat as new idle (start fresh)
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }

  const selectedId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;

  if (selectedId === 'dest_status') {
    // User wants to upload as status — re-enter idle flow but bypass the
    // destination chooser so we don't loop back to the same menu.
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, pendingMsg.raw, { state: 'idle' }, { skipDestinationMenu: true });
  }
  if (selectedId === 'dest_forward') {
    return await promptForwardSelection(phone, pendingMsg, forwardAuths);
  }

  // Unknown - ask again
  await cloudApi.sendTextMessage(phone, 'אנא בחר אפשרות מהתפריט');
}

async function handlePendingForwardState(phone, message, state) {
  const stateData = state.state_data || {};
  const pendingMsg = stateData.pendingMsg;
  const forwardAuths = stateData.forwardAuths || [];

  if (!pendingMsg) {
    await setState(phone, 'idle', null, null);
    return;
  }

  if (message.type !== 'interactive') {
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }

  const selectedId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || '';
  if (selectedId.startsWith('fwd_')) {
    const forwardId = selectedId.substring(4);
    const chosen = forwardAuths.find(f => f.forward_id === forwardId);
    if (!chosen) {
      await cloudApi.sendTextMessage(phone, '❌ תפוצה לא נמצאה');
      await setState(phone, 'idle', null, null);
      return;
    }
    return await triggerChosenForward(phone, pendingMsg, chosen);
  }

  await cloudApi.sendTextMessage(phone, 'אנא בחר תפוצה מהתפריט');
}

/**
 * Handle confirm/schedule/cancel/day button clicks for status_bot group forward jobs.
 */
async function handleStatusBotForwardDecision(phone, selectedId, message) {
  try {
    // Parse action + jobId
    let action, jobId, dayOffset;
    if (selectedId.startsWith('fwd_confirm_')) {
      action = 'confirm'; jobId = selectedId.substring('fwd_confirm_'.length);
    } else if (selectedId.startsWith('fwd_cancel_')) {
      action = 'cancel'; jobId = selectedId.substring('fwd_cancel_'.length);
    } else if (selectedId.startsWith('fwd_schedule_')) {
      action = 'schedule'; jobId = selectedId.substring('fwd_schedule_'.length);
    } else if (selectedId.startsWith('fwd_day_')) {
      // Format: fwd_day_{jobId}_{dayOffset}
      const rest = selectedId.substring('fwd_day_'.length);
      const lastUnderscore = rest.lastIndexOf('_');
      jobId = rest.substring(0, lastUnderscore);
      dayOffset = parseInt(rest.substring(lastUnderscore + 1));
      action = 'pick_day';
    } else if (selectedId.startsWith('fwd_back_')) {
      action = 'back'; jobId = selectedId.substring('fwd_back_'.length);
    } else {
      return;
    }

    const jobRow = await db.query(
      `SELECT id, user_id, status, forward_name, total_targets FROM forward_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRow.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❌ המשימה לא נמצאה.');
      return;
    }
    const job = jobRow.rows[0];

    // Allow pending or pending_schedule states for these actions
    const allowedStatuses = ['pending', 'pending_schedule'];
    if (!allowedStatuses.includes(job.status)) {
      const statusText = {
        'confirmed': '⏳ המשימה כבר בתהליך שליחה.',
        'sending': '⏳ המשימה כבר בתהליך שליחה.',
        'completed': '✅ המשימה הושלמה.',
        'cancelled': '❌ המשימה בוטלה.',
        'stopped': '⏹️ המשימה נעצרה.',
      }[job.status] || `סטטוס נוכחי: ${job.status}`;
      await cloudApi.sendTextMessage(phone, statusText);
      return;
    }

    if (action === 'confirm') {
      await db.query(`UPDATE forward_jobs SET status = 'confirmed', updated_at = NOW() WHERE id = $1`, [jobId]);

      const sections = [{
        title: 'פעולות',
        rows: [
          { id: `fwd_stop_${jobId}`, title: '⏹️ עצור', description: 'עצור את השליחה' },
          { id: `fwd_stopdelete_${jobId}`, title: '🗑️ עצור ומחק', description: 'עצור ומחק את ההודעות שנשלחו' },
        ]
      }];
      await cloudApi.sendListMessage(
        phone,
        `📤 *${job.forward_name}*\n\n✅ מתחיל לשלוח ל-${job.total_targets} קבוצות...\n\nבחר פעולה במידה ותרצה לעצור`,
        'פעולות',
        sections
      );

      try {
        const { startForwardJob } = require('../../controllers/groupForwards/jobs.controller');
        startForwardJob(jobId).catch(err => console.error('[StatusBotForward] startForwardJob error:', err.message));
      } catch (e) {
        console.error('[StatusBotForward] Could not start job:', e.message);
      }
      await setState(phone, 'idle', null, null);
      return;
    }

    if (action === 'cancel') {
      await db.query(`UPDATE forward_jobs SET status = 'cancelled', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [jobId]);
      await cloudApi.sendTextMessage(phone, `❌ המשימה בוטלה.`);
      await setState(phone, 'idle', null, null);
      return;
    }

    if (action === 'schedule') {
      // Show 8-day picker
      await db.query(`UPDATE forward_jobs SET status = 'pending_schedule', updated_at = NOW() WHERE id = $1`, [jobId]);
      const days = [];
      const now = new Date();
      const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      for (let i = 0; i < 8; i++) {
        const date = new Date(now); date.setDate(date.getDate() + i);
        const dayOfWeek = DAY_NAMES_HE[date.getDay()];
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
        let title = `יום ${dayOfWeek} - ${dateStr}`;
        if (i === 0) title = `היום - ${dayOfWeek}`;
        if (i === 1) title = `מחר - ${dayOfWeek}`;
        days.push({ id: `fwd_day_${jobId}_${i}`, title: title.slice(0, 24), description: dateStr });
      }
      days.push({ id: `fwd_back_${jobId}`, title: '🔙 חזרה', description: 'חזור לבחירה' });

      await cloudApi.sendListMessage(
        phone,
        `⏰ *תזמון - ${job.forward_name}*\n\nבאיזה יום לשלוח ל-${job.total_targets} קבוצות?`,
        'בחר יום',
        [{ title: 'בחר יום', rows: days }]
      );
      // Save state so we can keep the jobId across messages
      await setState(phone, 'waiting_fwd_schedule_time', { jobId }, null);
      return;
    }

    if (action === 'pick_day') {
      // Save chosen day, then ask for time (free-text input)
      const chosenDay = new Date();
      chosenDay.setDate(chosenDay.getDate() + dayOffset);
      chosenDay.setHours(0, 0, 0, 0);
      await setState(phone, 'waiting_fwd_schedule_time', {
        jobId,
        chosenDay: chosenDay.toISOString(),
      }, null);
      await cloudApi.sendTextMessage(
        phone,
        `⏰ באיזו שעה לשלוח? (פורמט: HH:MM, לדוגמה 14:30)`
      );
      return;
    }

    if (action === 'back') {
      // Re-send the original confirmation list
      await db.query(`UPDATE forward_jobs SET status = 'pending', updated_at = NOW() WHERE id = $1`, [jobId]);
      const sections = [{
        title: 'בחר פעולה',
        rows: [
          { id: `fwd_confirm_${jobId}`, title: '✅ שלח עכשיו', description: `שלח מיד ל-${job.total_targets} קבוצות` },
          { id: `fwd_schedule_${jobId}`, title: '⏰ תזמן שליחה', description: 'תזמן לתאריך ושעה' },
          { id: `fwd_cancel_${jobId}`, title: '❌ בטל', description: 'בטל את ההפצה' },
        ]
      }];
      await cloudApi.sendListMessage(
        phone,
        `📤 *${job.forward_name}*\n\nלשלוח את ההודעה ל-${job.total_targets} קבוצות?`,
        'בחר פעולה',
        sections
      );
      return;
    }
  } catch (err) {
    console.error('[StatusBotForward] Decision handler error:', err);
    await cloudApi.sendTextMessage(phone, `❌ שגיאה: ${err.message}`);
  }
}

/**
 * Convert "YYYY-MM-DDTHH:MM:00" (Israel local time) to UTC Date
 * Accounts for Israel DST transitions.
 */
function convertIsraelTimeToUTC_cloud(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  // Use noon as reference to determine DST offset for the day
  const refDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const israelHourStr = refDate.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false });
  const israelHour = parseInt(israelHourStr);
  const utcHour = refDate.getUTCHours();
  const offsetHours = israelHour - utcHour; // 2 in winter, 3 in summer
  return new Date(Date.UTC(y, m - 1, d, hh - offsetHours, mm, 0));
}

/**
 * Handle state when waiting for schedule time input (HH:MM format).
 * Creates a scheduled_forwards entry (same mechanism as regular bot)
 * so the existing scheduler picks it up at the right Israel time.
 */
async function handleWaitingFwdScheduleTimeState(phone, message, state) {
  const stateData = state.state_data || {};
  const jobId = stateData.jobId;
  const chosenDayISO = stateData.chosenDay;

  if (!jobId || !chosenDayISO) {
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }

  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, '⚠️ אנא שלח את השעה בפורמט HH:MM (למשל 14:30)');
    return;
  }

  const text = (message.text?.body || '').trim();
  // Accept: 14:30 | 14.30 | 1430 | 14 (= 14:00)
  const cleaned = text.replace(/[^\d:.]/g, '');
  let hour, minute;
  const colonMatch = cleaned.match(/^(\d{1,2})[:.](\d{2})$/);
  const hmMatch = cleaned.match(/^(\d{3,4})$/);
  const hOnlyMatch = cleaned.match(/^(\d{1,2})$/);
  if (colonMatch) {
    hour = parseInt(colonMatch[1]); minute = parseInt(colonMatch[2]);
  } else if (hmMatch) {
    const str = hmMatch[1].padStart(4, '0');
    hour = parseInt(str.substring(0, 2)); minute = parseInt(str.substring(2));
  } else if (hOnlyMatch) {
    hour = parseInt(hOnlyMatch[1]); minute = 0;
  } else {
    await cloudApi.sendTextMessage(phone, '⚠️ פורמט שעה לא תקין. דוגמה: 14:30, 1430, או 14');
    return;
  }
  if (hour > 23 || minute > 59) {
    await cloudApi.sendTextMessage(phone, '⚠️ שעה לא תקינה. דוגמה: 14:30');
    return;
  }

  // Extract Y-M-D from the chosen day (which was stored as ISO from user's local Date)
  const chosen = new Date(chosenDayISO);
  const year = chosen.getFullYear();
  const month = String(chosen.getMonth() + 1).padStart(2, '0');
  const day = String(chosen.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  // Convert Israel time → UTC (matches the regular bot behavior)
  const scheduledAtUTC = convertIsraelTimeToUTC_cloud(dateStr, timeStr);

  if (scheduledAtUTC.getTime() <= Date.now()) {
    await cloudApi.sendTextMessage(phone, '⚠️ הזמן שנבחר כבר עבר. אנא בחר שעה עתידית.');
    return;
  }

  try {
    // Load the job to get message/media details
    const jobRes = await db.query(
      `SELECT fj.*, COALESCE(gf.name, fj.forward_name) as forward_name, fj.forward_id
       FROM forward_jobs fj
       LEFT JOIN group_forwards gf ON fj.forward_id = gf.id
       WHERE fj.id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❌ לא נמצאה המשימה');
      await setState(phone, 'idle', null, null);
      return;
    }
    const job = jobRes.rows[0];

    // Create a scheduled_forwards entry (picked up by the existing cron scheduler)
    const insertRes = await db.query(
      `INSERT INTO scheduled_forwards
         (user_id, forward_id, message_type, message_content, media_url, media_filename, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [job.user_id, job.forward_id, job.message_type, job.message_text, job.media_url, job.media_filename, scheduledAtUTC]
    );
    const scheduledId = insertRes.rows[0].id;

    // Cancel the original forward_job (superseded by scheduled_forwards)
    await db.query(`UPDATE forward_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [jobId]);

    // Format display in Israel time
    const displayStr = scheduledAtUTC.toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      weekday: 'long', day: 'numeric', month: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // Send summary + action list
    const sections = [{
      title: 'פעולות',
      rows: [
        { id: `sched_edit_${scheduledId}`, title: '✏️ ערוך הודעה', description: 'עדכן את טקסט ההודעה' },
        { id: `sched_delete_msg_${scheduledId}`, title: '🗑️ מחק הודעה', description: 'מחק את ההודעה המתוזמנת' },
        { id: `sched_reschedule_${scheduledId}`, title: '🔄 שנה תזמון', description: 'שנה תאריך/שעה' },
        { id: `sched_cancel_${scheduledId}`, title: '❌ עצור תזמון', description: 'בטל את התזמון' },
      ]
    }];

    await cloudApi.sendListMessage(
      phone,
      `⏰ *תוזמן בהצלחה!*\n\n📤 *${job.forward_name}*\nההודעה תישלח ל-${job.total_targets} קבוצות\n📅 ${displayStr}`,
      'בחר פעולה',
      sections
    );
  } catch (err) {
    console.error('[StatusBotForward] Schedule error:', err);
    await cloudApi.sendTextMessage(phone, `❌ שגיאה בתזמון: ${err.message}`);
  }
  await setState(phone, 'idle', null, null);
}

/**
 * Handle button clicks for scheduled_forwards (edit/delete/reschedule/cancel).
 */
async function handleScheduledForwardAction(phone, selectedId) {
  const m = selectedId.match(/^sched_(edit|delete_msg|reschedule|cancel)_(.+)$/);
  if (!m) return;
  const action = m[1];
  const scheduledId = m[2];

  try {
    const row = await db.query(
      `SELECT sf.*, gf.name as forward_name FROM scheduled_forwards sf
       LEFT JOIN group_forwards gf ON gf.id = sf.forward_id WHERE sf.id = $1`,
      [scheduledId]
    );
    if (row.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❌ התזמון לא נמצא.');
      return;
    }
    const sf = row.rows[0];
    if (sf.status !== 'pending') {
      await cloudApi.sendTextMessage(phone, `ℹ️ התזמון כבר ${sf.status === 'executed' ? 'נשלח' : 'בוטל'}.`);
      return;
    }

    if (action === 'cancel') {
      await db.query(`UPDATE scheduled_forwards SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [scheduledId]);
      await cloudApi.sendTextMessage(phone, `❌ התזמון בוטל.\nההודעה לא תישלח.`);
      return;
    }

    if (action === 'delete_msg') {
      await db.query(`UPDATE scheduled_forwards SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [scheduledId]);
      await cloudApi.sendTextMessage(phone, `🗑️ ההודעה נמחקה והתזמון בוטל.`);
      return;
    }

    if (action === 'edit') {
      await setState(phone, 'waiting_sched_edit', { scheduledId }, null);
      await cloudApi.sendTextMessage(
        phone,
        `✏️ שלח את ההודעה החדשה.\n\n(ההודעה הקיימת תוחלף. התזמון והקבוצות נשארים.)`
      );
      return;
    }

    if (action === 'reschedule') {
      // Show day picker again, but for reschedule flow
      const days = [];
      const now = new Date();
      const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      for (let i = 0; i < 8; i++) {
        const date = new Date(now); date.setDate(date.getDate() + i);
        const dayOfWeek = DAY_NAMES_HE[date.getDay()];
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
        let title = `יום ${dayOfWeek} - ${dateStr}`;
        if (i === 0) title = `היום - ${dayOfWeek}`;
        if (i === 1) title = `מחר - ${dayOfWeek}`;
        days.push({ id: `sched_day_${scheduledId}_${i}`, title: title.slice(0, 24), description: dateStr });
      }
      await cloudApi.sendListMessage(
        phone,
        `🔄 *שינוי תזמון - ${sf.forward_name}*\n\nבאיזה יום לשלוח?`,
        'בחר יום',
        [{ title: 'בחר יום', rows: days }]
      );
      return;
    }
  } catch (err) {
    console.error('[StatusBotForward] Scheduled action error:', err);
    await cloudApi.sendTextMessage(phone, `❌ שגיאה: ${err.message}`);
  }
}

/**
 * Handle day picker for reschedule (sched_day_ID_OFFSET)
 */
async function handleScheduledDayPick(phone, selectedId) {
  const m = selectedId.match(/^sched_day_(.+)_(\d+)$/);
  if (!m) return;
  const scheduledId = m[1];
  const dayOffset = parseInt(m[2]);

  const chosenDay = new Date();
  chosenDay.setDate(chosenDay.getDate() + dayOffset);
  chosenDay.setHours(0, 0, 0, 0);

  await setState(phone, 'waiting_sched_reschedule_time', {
    scheduledId,
    chosenDay: chosenDay.toISOString(),
  }, null);
  await cloudApi.sendTextMessage(phone, `⏰ באיזו שעה לשלוח? (פורמט: HH:MM)`);
}

async function handleWaitingSchedRescheduleTime(phone, message, state) {
  const stateData = state.state_data || {};
  const { scheduledId, chosenDay: chosenDayISO } = stateData;
  if (!scheduledId || !chosenDayISO) {
    await setState(phone, 'idle', null, null);
    return;
  }
  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, '⚠️ שלח את השעה בפורמט HH:MM');
    return;
  }
  const text = (message.text?.body || '').trim().replace(/[^\d:.]/g, '');
  const colonMatch = text.match(/^(\d{1,2})[:.](\d{2})$/);
  const hmMatch = text.match(/^(\d{3,4})$/);
  let hour, minute;
  if (colonMatch) { hour = parseInt(colonMatch[1]); minute = parseInt(colonMatch[2]); }
  else if (hmMatch) { const s = hmMatch[1].padStart(4, '0'); hour = parseInt(s.substring(0, 2)); minute = parseInt(s.substring(2)); }
  else { await cloudApi.sendTextMessage(phone, '⚠️ פורמט שעה לא תקין'); return; }
  if (hour > 23 || minute > 59) { await cloudApi.sendTextMessage(phone, '⚠️ שעה לא תקינה'); return; }

  const chosen = new Date(chosenDayISO);
  const dateStr = `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, '0')}-${String(chosen.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const scheduledAtUTC = convertIsraelTimeToUTC_cloud(dateStr, timeStr);
  if (scheduledAtUTC.getTime() <= Date.now()) {
    await cloudApi.sendTextMessage(phone, '⚠️ הזמן שנבחר כבר עבר');
    return;
  }

  await db.query(`UPDATE scheduled_forwards SET scheduled_at = $1, updated_at = NOW() WHERE id = $2`, [scheduledAtUTC, scheduledId]);
  const displayStr = scheduledAtUTC.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  await cloudApi.sendTextMessage(phone, `🔄 התזמון עודכן בהצלחה!\n📅 ${displayStr}`);
  await setState(phone, 'idle', null, null);
}

/**
 * Handle post-completion actions on a forward_job (edit messages / delete messages).
 */
async function handleCompletedJobAction(phone, selectedId) {
  const isDelete = selectedId.startsWith('fwd_delete_');
  const jobId = selectedId.substring(isDelete ? 'fwd_delete_'.length : 'fwd_edit_'.length);

  try {
    const jobRes = await db.query(
      `SELECT id, user_id, status, forward_name FROM forward_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❌ המשימה לא נמצאה.');
      return;
    }
    const job = jobRes.rows[0];

    if (isDelete) {
      try {
        const { deleteJobMessages } = require('../../controllers/groupForwards/jobs.controller');
        if (typeof deleteJobMessages === 'function') {
          await cloudApi.sendTextMessage(phone, `🗑️ מתחיל למחוק את ההודעות שנשלחו...`);
          deleteJobMessages(jobId, phone, 'cloud').catch(err => {
            console.error('[StatusBotForward] deleteJobMessages error:', err.message);
          });
        } else {
          await cloudApi.sendTextMessage(phone, `🗑️ מחיקה איננה זמינה כרגע.`);
        }
      } catch (e) {
        console.error('[StatusBotForward] delete action error:', e.message);
        await cloudApi.sendTextMessage(phone, `❌ שגיאה במחיקה: ${e.message}`);
      }
      return;
    }

    // Edit flow: ask user for new text
    await setState(phone, 'waiting_fwd_edit_text', { jobId }, null);
    const forwardTitle = job.forward_name ? `"${job.forward_name}"` : '';
    await cloudApi.sendTextMessage(
      phone,
      `✏️ שלח את הנוסח החדש של ההודעה${forwardTitle ? ` עבור ${forwardTitle}` : ''}.\n\nההודעה שתשלח תחליף את כל ההודעות שנשלחו לקבוצות.`
    );
  } catch (err) {
    console.error('[StatusBotForward] handleCompletedJobAction error:', err);
    await cloudApi.sendTextMessage(phone, `❌ שגיאה: ${err.message}`);
  }
}

/**
 * Handle stop / stop+delete during active sending.
 */
async function handleStopJobAction(phone, selectedId) {
  const isStopDelete = selectedId.startsWith('fwd_stopdelete_');
  const jobId = selectedId.substring(isStopDelete ? 'fwd_stopdelete_'.length : 'fwd_stop_'.length);

  try {
    const jobRes = await db.query(
      `SELECT id, status, forward_name FROM forward_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❌ המשימה לא נמצאה.');
      return;
    }
    const job = jobRes.rows[0];

    if (!['pending', 'confirmed', 'sending'].includes(job.status)) {
      await cloudApi.sendTextMessage(phone, `ℹ️ המשימה כבר ${job.status === 'completed' ? 'הסתיימה' : 'בוטלה'}.`);
      return;
    }

    // Mark as stopped and optionally request delete — the existing job runner
    // checks status and stops gracefully. deleteJobMessages handles the delete flow.
    await db.query(
      `UPDATE forward_jobs SET status = 'stopped', stop_requested_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [jobId]
    ).catch(async () => {
      // Fallback if stop_requested_at column doesn't exist
      await db.query(`UPDATE forward_jobs SET status = 'stopped', updated_at = NOW() WHERE id = $1`, [jobId]);
    });

    if (isStopDelete) {
      await cloudApi.sendTextMessage(phone, `⏹️ *${job.forward_name}*\n\nעוצר את השליחה ומוחק את ההודעות שנשלחו...`);
      try {
        const { deleteJobMessages } = require('../../controllers/groupForwards/jobs.controller');
        if (typeof deleteJobMessages === 'function') {
          deleteJobMessages(jobId, phone).catch(err => console.error('[StatusBotForward] deleteJobMessages error:', err.message));
        }
      } catch (e) { console.error('[StatusBotForward] delete error:', e.message); }
    } else {
      await cloudApi.sendTextMessage(phone, `⏹️ *${job.forward_name}*\n\nהשליחה נעצרה.`);
    }
  } catch (err) {
    console.error('[StatusBotForward] handleStopJobAction error:', err);
    await cloudApi.sendTextMessage(phone, `❌ שגיאה: ${err.message}`);
  }
}

async function handleWaitingFwdEditText(phone, message, state) {
  const stateData = state.state_data || {};
  const { jobId } = stateData;
  if (!jobId) { await setState(phone, 'idle', null, null); return; }

  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, '⚠️ כרגע ניתן לערוך רק טקסט.');
    return;
  }
  const newText = (message.text?.body || '').trim();
  if (!newText) { await cloudApi.sendTextMessage(phone, '⚠️ ההודעה ריקה'); return; }

  // Save the new text + move to confirmation step (scoped by jobId to this chat only)
  await setState(phone, 'waiting_fwd_edit_confirm', { jobId, newText }, null);

  const preview = newText.length > 500 ? newText.substring(0, 500) + '...' : newText;
  const sections = [{
    title: 'אישור עריכה',
    rows: [
      { id: `fwd_editconfirm_${jobId}`, title: '✅ אשר ועדכן', description: 'עדכן את ההודעות בקבוצות' },
      { id: `fwd_editretry_${jobId}`, title: '✏️ נסח מחדש', description: 'שלח נוסח אחר' },
      { id: `fwd_editcancel_${jobId}`, title: '❌ בטל עריכה', description: 'בטל את העריכה' },
    ]
  }];
  await cloudApi.sendListMessage(
    phone,
    `✏️ *תצוגה מקדימה של ההודעה החדשה:*\n\n${preview}\n\n—\nהאם לעדכן את כל ההודעות בקבוצות?`,
    'בחר פעולה',
    sections
  );
}

/**
 * Handle the edit confirmation buttons (aprove / retype / cancel).
 */
async function handleWaitingFwdEditConfirm(phone, message, state) {
  const stateData = state.state_data || {};
  const { jobId, newText } = stateData;
  if (!jobId) { await setState(phone, 'idle', null, null); return; }

  if (message.type !== 'interactive') {
    // User sent new text before picking button — treat as new retype
    if (message.type === 'text') {
      const retypedText = (message.text?.body || '').trim();
      if (retypedText) {
        await setState(phone, 'waiting_fwd_edit_confirm', { jobId, newText: retypedText }, null);
        const preview = retypedText.length > 500 ? retypedText.substring(0, 500) + '...' : retypedText;
        const sections = [{
          title: 'אישור עריכה',
          rows: [
            { id: `fwd_editconfirm_${jobId}`, title: '✅ אשר ועדכן', description: 'עדכן את ההודעות בקבוצות' },
            { id: `fwd_editretry_${jobId}`, title: '✏️ נסח מחדש', description: 'שלח נוסח אחר' },
            { id: `fwd_editcancel_${jobId}`, title: '❌ בטל עריכה', description: 'בטל את העריכה' },
          ]
        }];
        await cloudApi.sendListMessage(
          phone,
          `✏️ *תצוגה מקדימה של ההודעה החדשה:*\n\n${preview}\n\n—\nהאם לעדכן את כל ההודעות בקבוצות?`,
          'בחר פעולה',
          sections
        );
        return;
      }
    }
    await cloudApi.sendTextMessage(phone, '⚠️ אנא בחר פעולה מהרשימה');
    return;
  }

  const selectedId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || '';

  if (selectedId.startsWith('fwd_editconfirm_')) {
    try {
      const { editJobMessages } = require('../../controllers/groupForwards/jobs.controller');
      await cloudApi.sendTextMessage(phone, `✏️ מעדכן את ההודעות בקבוצות...`);
      editJobMessages(jobId, newText, phone, 'cloud').catch(err => {
        console.error('[StatusBotForward] editJobMessages error:', err.message);
      });
    } catch (err) {
      console.error('[StatusBotForward] edit error:', err);
      await cloudApi.sendTextMessage(phone, `❌ שגיאה: ${err.message}`);
    }
    await setState(phone, 'idle', null, null);
    return;
  }

  if (selectedId.startsWith('fwd_editretry_')) {
    await setState(phone, 'waiting_fwd_edit_text', { jobId }, null);
    await cloudApi.sendTextMessage(phone, '✏️ שלח את הנוסח החדש של ההודעה.');
    return;
  }

  if (selectedId.startsWith('fwd_editcancel_')) {
    await cloudApi.sendTextMessage(phone, `❌ העריכה בוטלה.`);
    await setState(phone, 'idle', null, null);
    return;
  }

  await cloudApi.sendTextMessage(phone, '⚠️ בחירה לא תקינה');
}

async function handleWaitingSchedEdit(phone, message, state) {
  const stateData = state.state_data || {};
  const { scheduledId } = stateData;
  if (!scheduledId) { await setState(phone, 'idle', null, null); return; }

  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, '⚠️ כרגע ניתן לערוך רק טקסט.');
    return;
  }
  const newText = (message.text?.body || '').trim();
  if (!newText) { await cloudApi.sendTextMessage(phone, '⚠️ ההודעה ריקה'); return; }

  await db.query(`UPDATE scheduled_forwards SET message_content = $1, message_type = 'text', updated_at = NOW() WHERE id = $2`, [newText, scheduledId]);
  await cloudApi.sendTextMessage(phone, `✏️ ההודעה עודכנה.`);
  await setState(phone, 'idle', null, null);
}

async function handleAfterSendMenuState(phone, message, state) {
  // Handle both list_reply (menu actions) and button_reply (retry button)
  if (message.type !== 'interactive' || (message.interactive.type !== 'list_reply' && message.interactive.type !== 'button_reply')) {
    // User sent new content - treat as new status, go back to idle flow
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }

  const selectedId = message.interactive.type === 'button_reply'
    ? message.interactive.button_reply.id
    : message.interactive.list_reply.id;
  const stateData = state.state_data || {};
  
  // Extract status ID from action
  let statusId = stateData.queuedStatusId;
  if (selectedId.includes('_')) {
    const parts = selectedId.split('_');
    const lastPart = parts[parts.length - 1];
    if (lastPart.includes('-')) {
      statusId = lastPart;
    }
  }

  // Retry failed status
  if (selectedId.startsWith('queued_retry_')) {
    const retryQueueId = selectedId.replace('queued_retry_', '');
    const { retryQueueItem } = require('../statusBot/queue.service');
    const retried = await retryQueueItem(retryQueueId);
    if (retried) {
      // Check how many contacts were already sent (for contacts format)
      const alreadySent = await db.query(
        `SELECT COUNT(DISTINCT phone) as cnt FROM status_bot_contact_sends
         WHERE queue_id = $1 AND success = true`,
        [retryQueueId]
      );
      const sentCount = parseInt(alreadySent.rows[0]?.cnt || 0);
      const retryMsg = sentCount > 0
        ? `🔄 הסטטוס נוסף מחדש לתור השליחה!\n\nהסטטוס יישלח רק למי שעוד לא קיבל אותו (${sentCount} אנשי קשר כבר קיבלו).`
        : '🔄 הסטטוס נוסף מחדש לתור השליחה!\n\nיישלח בקרוב.';
      await cloudApi.sendTextMessage(phone, retryMsg);
    } else {
      await cloudApi.sendTextMessage(phone, '❌ לא ניתן לשלוח מחדש — הסטטוס אינו במצב שגיאה');
    }
    await setState(phone, 'idle', null, null);
    return;
  }

  // Delete group action (video split parts)
  if (selectedId.startsWith('queued_delete_group_')) {
    const groupId = selectedId.replace('queued_delete_group_', '');
    const groupResult = await db.query(
      `SELECT id, queue_status FROM status_bot_queue WHERE part_group_id = $1`,
      [groupId]
    );
    
    if (groupResult.rows.length > 0) {
      // Cancel all parts in the group that are pending/scheduled
      const cancelledCount = await db.query(
        `UPDATE status_bot_queue SET queue_status = 'cancelled' 
         WHERE part_group_id = $1 AND queue_status IN ('pending', 'scheduled')
         RETURNING id`,
        [groupId]
      );
      
      if (cancelledCount.rows.length > 0) {
        await cloudApi.sendTextMessage(phone, `✅ ${cancelledCount.rows.length} חלקים הוסרו מתור השליחה`);
      } else {
        await cloudApi.sendTextMessage(phone, 'אין חלקים שניתן למחוק (כבר נשלחו או בוטלו)');
      }
    } else {
      await cloudApi.sendTextMessage(phone, 'קבוצת סרטון לא נמצאה');
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  // Delete action
  if (selectedId.startsWith('queued_delete_')) {
    const result = await db.query(
      `SELECT q.*, s.waha_message_id, s.id as status_id, c.session_name, c.waha_source_id
       FROM status_bot_queue q
       LEFT JOIN status_bot_statuses s ON s.queue_id = q.id
       LEFT JOIN status_bot_connections c ON c.id = q.connection_id
       WHERE q.id = $1`,
      [statusId]
    );
    
    if (result.rows.length > 0) {
      const queueItem = result.rows[0];
      
      if (queueItem.queue_status === 'pending' || queueItem.queue_status === 'scheduled') {
        // Cancel queued status
        await db.query(
          `UPDATE status_bot_queue SET queue_status = 'cancelled' WHERE id = $1`,
          [statusId]
        );
        await cloudApi.sendTextMessage(phone, '✅ הסטטוס הוסר מתור השליחה');
      } else if (queueItem.queue_status === 'sent' && queueItem.waha_message_id) {
        // Delete sent status from WhatsApp
        try {
          const { baseUrl, apiKey } = await getWahaCredentialsForConnection(queueItem);
          await wahaSession.makeRequest(baseUrl, apiKey, 'POST', `/api/${queueItem.session_name}/status/delete`, {
            id: queueItem.waha_message_id,
            contacts: null
          });
          
          // Mark as deleted in DB
          if (queueItem.status_id) {
            await db.query(`UPDATE status_bot_statuses SET deleted_at = NOW() WHERE id = $1`, [queueItem.status_id]);
          }
          
          await cloudApi.sendTextMessage(phone, '✅ הסטטוס נמחק מווצאפ');
        } catch (deleteErr) {
          console.error('[CloudAPI] Error deleting status from WhatsApp:', deleteErr.message);
          await cloudApi.sendTextMessage(phone, 'לא הצלחנו למחוק את הסטטוס מווצאפ');
        }
      } else {
        await cloudApi.sendTextMessage(phone, 'לא ניתן למחוק את הסטטוס');
      }
    } else {
      await cloudApi.sendTextMessage(phone, 'סטטוס לא נמצא');
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  // Helper to get the actual status_bot_statuses ID from queue ID
  const getStatusIdFromQueueId = async (queueId) => {
    const result = await db.query(
      `SELECT id FROM status_bot_statuses WHERE queue_id = $1`,
      [queueId]
    );
    return result.rows[0]?.id;
  };

  // Views - combined count + list
  if (selectedId.startsWith('queued_views_') && !selectedId.includes('view_all')) {
    const realStatusId = await getStatusIdFromQueueId(statusId);
    if (!realStatusId) {
      await cloudApi.sendTextMessage(phone, '👁️ הסטטוס עדיין לא נשלח או שלא נמצא');
      await setState(phone, 'after_send_menu', { queuedStatusId: statusId }, null, state.connection_id);
      return;
    }
    const views = await db.query(
      `SELECT viewer_phone, viewed_at FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC`,
      [realStatusId]
    );
    
    if (views.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '👁️ 0 צפיות - אין צפיות עדיין');
    } else {
      // Send as TXT file with count in caption
      const viewersList = views.rows.map(v => v.viewer_phone).join('\n');
      const fileContent = `רשימת צופים (${views.rows.length})\n${'='.repeat(30)}\n\n${viewersList}`;
      await cloudApi.sendDocumentMessage(phone, fileContent, `צפיות_${views.rows.length}.txt`, `👁️ ${views.rows.length} צפיות`);
    }
    await setState(phone, 'after_send_menu', { queuedStatusId: statusId }, null, state.connection_id);
    return;
  }
  
  // Hearts - combined count + list (all heart emojis)
  if (selectedId.startsWith('queued_hearts_')) {
    const realStatusId = await getStatusIdFromQueueId(statusId);
    if (!realStatusId) {
      await cloudApi.sendTextMessage(phone, '❤️ הסטטוס עדיין לא נשלח או שלא נמצא');
      await setState(phone, 'after_send_menu', { queuedStatusId: statusId }, null, state.connection_id);
      return;
    }
    const hearts = await db.query(
      `SELECT reactor_phone, reaction, reacted_at FROM status_bot_reactions WHERE status_id = $1 AND reaction IN ('❤️', '💚', '💙', '💜', '🖤', '🤍', '💛', '🧡', '🤎', '💗', '💖', '💕', '💓', '💞', '💘', '❣️') ORDER BY reacted_at DESC`,
      [realStatusId]
    );
    
    if (hearts.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '❤️ 0 סימוני לב - אין סימוני לב עדיין');
    } else {
      // Send as TXT file with count in caption
      const heartsList = hearts.rows.map(h => `${h.reaction} ${h.reactor_phone}`).join('\n');
      const fileContent = `רשימת סימוני לב (${hearts.rows.length})\n${'='.repeat(30)}\n\n${heartsList}`;
      await cloudApi.sendDocumentMessage(phone, fileContent, `לבבות_${hearts.rows.length}.txt`, `❤️ ${hearts.rows.length} סימוני לב`);
    }
    await setState(phone, 'after_send_menu', { queuedStatusId: statusId }, null, state.connection_id);
    return;
  }
  
  // Replies - text replies to status (תגובות)
  if (selectedId.startsWith('queued_reactions_')) {
    const realStatusId = await getStatusIdFromQueueId(statusId);
    if (!realStatusId) {
      await cloudApi.sendTextMessage(phone, '💬 הסטטוס עדיין לא נשלח או שלא נמצא');
      await setState(phone, 'after_send_menu', { queuedStatusId: statusId }, null, state.connection_id);
      return;
    }
    const replies = await db.query(
      `SELECT replier_phone, reply_text, replied_at FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC`,
      [realStatusId]
    );
    
    if (replies.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, '💬 0 תגובות - אין תגובות עדיין');
    } else {
      // Send as TXT file with count in caption
      const repliesList = replies.rows.map(r => `${r.replier_phone}: ${r.reply_text}`).join('\n');
      const fileContent = `רשימת תגובות (${replies.rows.length})\n${'='.repeat(30)}\n\n${repliesList}`;
      await cloudApi.sendDocumentMessage(phone, fileContent, `תגובות_${replies.rows.length}.txt`, `💬 ${replies.rows.length} תגובות`);
    }
    await setState(phone, 'after_send_menu', { queuedStatusId: statusId }, null, state.connection_id);
    return;
  }
  
  // Other actions
  if (selectedId === 'queued_view_all') {
    await handleStatusesCommand(phone, state);
    return;
  }
  
  if (selectedId === 'queued_menu') {
    await handleMenuCommand(phone, state);
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (selectedId === 'new_status') {
    await cloudApi.sendTextMessage(phone, '📤 שלח את הסטטוס החדש שלך:\n\n• טקסט - להעלאת סטטוס טקסט\n• תמונה - להעלאת סטטוס תמונה\n• סרטון - להעלאת סטטוס וידאו\n• הקלטה קולית - להעלאת סטטוס קולי');
    await setState(phone, 'idle', null, null);
    return;
  }
}

/**
 * Handle video split caption choice state
 */
async function handleVideoSplitCaptionChoiceState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'button_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const choiceId = message.interactive.button_reply.id;
  const pendingStatus = state.pending_status || {};
  const parts = pendingStatus.parts || [];
  const originalCaption = pendingStatus.originalCaption || '';
  
  if (choiceId === 'caption_all') {
    // Apply caption to all parts
    const updatedParts = parts.map(part => ({
      ...part,
      caption: originalCaption
    }));
    pendingStatus.parts = updatedParts;
    
    await setState(phone, 'select_action', { isVideoSplit: true, videoParts: updatedParts }, pendingStatus, state.connection_id);
    await cloudApi.sendButtonMessage(
      phone,
      `✅ הכיתוב יופיע על כל ${parts.length} החלקים\n\nמה תרצה לעשות?`,
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
    return;
  }
  
  if (choiceId === 'caption_first') {
    // Apply caption only to first part
    const updatedParts = parts.map((part, index) => ({
      ...part,
      caption: index === 0 ? originalCaption : ''
    }));
    pendingStatus.parts = updatedParts;
    
    await setState(phone, 'select_action', { isVideoSplit: true, videoParts: updatedParts }, pendingStatus, state.connection_id);
    await cloudApi.sendButtonMessage(
      phone,
      `✅ הכיתוב יופיע רק על החלק הראשון\n\nמה תרצה לעשות?`,
      [
        { id: 'action_send', title: 'שלח כעת' },
        { id: 'action_schedule', title: 'תזמן' },
        { id: 'action_cancel', title: 'בטל' }
      ]
    );
    return;
  }
  
  if (choiceId === 'caption_custom') {
    // Start custom caption flow for each part
    // First part already has the original caption by default
    const updatedParts = parts.map((part, index) => ({
      ...part,
      caption: index === 0 ? originalCaption : ''
    }));
    pendingStatus.parts = updatedParts;
    pendingStatus.currentPartIndex = 1; // Start asking from part 2
    
    if (parts.length === 1) {
      // Only one part - no custom needed
      await setState(phone, 'select_action', { isVideoSplit: true, videoParts: updatedParts }, pendingStatus, state.connection_id);
      await cloudApi.sendButtonMessage(
        phone,
        'מה תרצה לעשות?',
        [
          { id: 'action_send', title: 'שלח כעת' },
          { id: 'action_schedule', title: 'תזמן' },
          { id: 'action_cancel', title: 'בטל' }
        ]
      );
      return;
    }
    
    // Ask for part 2 caption
    await setState(phone, 'video_split_custom_caption', null, pendingStatus, state.connection_id);
    await cloudApi.sendTextMessage(
      phone,
      `📝 החלק הראשון יקבל את הכיתוב המקורי\n\nמה הכיתוב לחלק 2 מתוך ${parts.length}?\n\n(שלח טקסט או "-" בלי כיתוב)`
    );
    return;
  }
}

/**
 * Handle video split custom caption state
 */
async function handleVideoSplitCustomCaptionState(phone, message, state) {
  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, 'אנא שלח טקסט לכיתוב או "-" בלי כיתוב');
    return;
  }
  
  const text = message.text.body.trim();
  const caption = text === '-' ? '' : text;
  
  const pendingStatus = state.pending_status || {};
  const parts = pendingStatus.parts || [];
  const currentPartIndex = pendingStatus.currentPartIndex || 1;
  
  // Update current part caption
  parts[currentPartIndex].caption = caption;
  pendingStatus.parts = parts;
  pendingStatus.currentPartIndex = currentPartIndex + 1;
  
  // Check if more parts to configure
  if (pendingStatus.currentPartIndex < parts.length) {
    await setState(phone, 'video_split_custom_caption', null, pendingStatus, state.connection_id);
    await cloudApi.sendTextMessage(
      phone,
      `מה הכיתוב לחלק ${pendingStatus.currentPartIndex + 1} מתוך ${parts.length}?\n\n(שלח טקסט או "-" בלי כיתוב)`
    );
    return;
  }
  
  // All parts configured - go to action
  await setState(phone, 'select_action', { isVideoSplit: true, videoParts: parts }, pendingStatus, state.connection_id);
  
  // Build summary
  let summary = '✅ כיתובים הוגדרו:\n';
  parts.forEach((part, index) => {
    const captionPreview = part.caption ? part.caption.substring(0, 20) + (part.caption.length > 20 ? '...' : '') : '(ללא)';
    summary += `• חלק ${index + 1}: ${captionPreview}\n`;
  });
  summary += '\nמה תרצה לעשות?';
  
  await cloudApi.sendButtonMessage(
    phone,
    summary,
    [
      { id: 'action_send', title: 'שלח כעת' },
      { id: 'action_schedule', title: 'תזמן' },
      { id: 'action_cancel', title: 'בטל' }
    ]
  );
}

/**
 * Parse flexible time input
 */
function parseTimeInput(input) {
  // Remove any non-numeric characters except colon
  const cleaned = input.replace(/[^\d:]/g, '');
  
  let hours, minutes;
  
  if (cleaned.includes(':')) {
    // Format: HH:MM or H:MM
    const parts = cleaned.split(':');
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[1]) || 0;
  } else if (cleaned.length >= 3) {
    // Format: HHMM or HMM
    if (cleaned.length === 4) {
      hours = parseInt(cleaned.substring(0, 2));
      minutes = parseInt(cleaned.substring(2, 4));
    } else {
      hours = parseInt(cleaned.substring(0, cleaned.length - 2));
      minutes = parseInt(cleaned.substring(cleaned.length - 2));
    }
  } else {
    // Format: H or HH (assume :00 minutes)
    hours = parseInt(cleaned);
    minutes = 0;
  }
  
  // Validate
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return { hours, minutes };
}

/**
 * Format date in Hebrew
 */
function formatDateHebrew(date) {
  const dayName = DAY_NAMES[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `יום ${dayName} (${day}/${month})`;
}

/**
 * Build status content object for queue
 */
function buildStatusContent(pendingStatus) {
  switch (pendingStatus.type) {
    case 'text':
      return {
        text: pendingStatus.text,
        backgroundColor: pendingStatus.backgroundColor || '#782138',
        font: 0,
        linkPreview: true
      };
    
    case 'image':
      return {
        file: {
          mimetype: 'image/jpeg',
          filename: 'status.jpg',
          url: pendingStatus.url
        },
        caption: pendingStatus.caption || ''
      };
    
    case 'video':
      return {
        file: {
          mimetype: 'video/mp4',
          filename: 'status.mp4',
          url: pendingStatus.url
        },
        caption: pendingStatus.caption || ''
      };
    
    case 'voice':
      return {
        file: {
          mimetype: 'audio/ogg; codecs=opus',
          filename: 'voice.ogg',
          url: pendingStatus.url
        },
        convert: true,
        backgroundColor: pendingStatus.backgroundColor || '#782138'
      };
    
    default:
      return pendingStatus;
  }
}

/**
 * Show scheduled statuses list
 * Returns true if statuses were shown, false if empty
 */
async function showScheduledList(phone, connectionId) {
  const scheduled = await getScheduledStatuses(connectionId);
  
  if (scheduled.length === 0) {
    await cloudApi.sendTextMessage(phone, 'אין סטטוסים מתוזמנים\n\nשלח טקסט, תמונה, סרטון או הקלטה להעלאת סטטוס חדש');
    return false;
  }
  
  const sections = [{
    title: 'סטטוסים',
    rows: scheduled.map((status, index) => {
      const scheduledFor = status.scheduled_for ? new Date(status.scheduled_for) : null;
      const timeStr = scheduledFor ? 
        `${formatDateHebrew(scheduledFor)} ${String(scheduledFor.getHours()).padStart(2, '0')}:${String(scheduledFor.getMinutes()).padStart(2, '0')}` :
        'בתור';
      
      const content = status.content;
      const preview = status.status_type === 'text' ? 
        (content.text || '').substring(0, 30) :
        status.status_type;
      
      return {
        id: `scheduled_${status.id}`,
        title: preview + (preview.length >= 30 ? '...' : ''),
        description: timeStr
      };
    })
  }];
  
  await cloudApi.sendListMessage(
    phone,
    `📋 ${scheduled.length} סטטוסים בתור`,
    'בחר סטטוס',
    sections
  );
  return true;
}

/**
 * Show scheduled list with confirmation message
 */
async function showScheduledListWithConfirmation(phone, connectionId, formattedDate, formattedTime, extraNote = '') {
  const scheduled = await getScheduledStatuses(connectionId);
  
  const rows = scheduled.map((status) => {
    const scheduledFor = status.scheduled_for ? new Date(status.scheduled_for) : null;
    const timeStr = scheduledFor ? 
      `${formatDateHebrew(scheduledFor)} ${String(scheduledFor.getHours()).padStart(2, '0')}:${String(scheduledFor.getMinutes()).padStart(2, '0')}` :
      'בתור';
    
    const content = status.content;
    const preview = status.status_type === 'text' ? 
      (content.text || '').substring(0, 30) :
      status.status_type;
    
    return {
      id: `scheduled_${status.id}`,
      title: preview + (preview.length >= 30 ? '...' : ''),
      description: timeStr
    };
  });
  
  const sections = [{
    title: 'סטטוסים בתור',
    rows: rows
  }];
  
  await cloudApi.sendListMessage(
    phone,
    `✅ תוזמן ל-${formattedDate} ${formattedTime}${extraNote}\n\n📋 ${scheduled.length} סטטוסים בתור`,
    'בחר סטטוס',
    sections
  );
}

/**
 * Handle viewing scheduled statuses state
 */
async function handleViewScheduledState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'list_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const selectedId = message.interactive.list_reply.id;
  const statusId = selectedId.replace('scheduled_', '');
  
  await setState(phone, 'view_status_actions', { statusId, statusType: 'scheduled' }, null);
  
  await cloudApi.sendButtonMessage(
    phone,
    'מה תרצה לעשות עם הסטטוס?',
    [
      { id: 'status_send_now', title: 'שלח כעת' },
      { id: 'status_reschedule', title: 'שנה תזמון' },
      { id: 'status_cancel', title: 'בטל' }
    ]
  );
}

/**
 * Handle status actions state
 */
async function handleViewStatusActionsState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'button_reply') {
    // User sent new content - treat as new status
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const actionId = message.interactive.button_reply.id;
  const stateData = state.state_data || {};
  const statusId = stateData.statusId;
  const statusType = stateData.statusType;
  
  if (actionId === 'status_cancel') {
    if (statusType === 'scheduled') {
      await db.query(
        `UPDATE status_bot_queue SET queue_status = 'cancelled' WHERE id = $1`,
        [statusId]
      );
      await cloudApi.sendTextMessage(phone, '✅ התזמון בוטל');
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'status_send_now') {
    if (statusType === 'scheduled') {
      await db.query(
        `UPDATE status_bot_queue SET scheduled_for = NULL, queue_status = 'pending' WHERE id = $1`,
        [statusId]
      );
      await cloudApi.sendTextMessage(phone, '✅ הסטטוס נוסף לתור השליחה!');
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'status_reschedule') {
    // Get the status to reschedule
    const result = await db.query(
      `SELECT * FROM status_bot_queue WHERE id = $1`,
      [statusId]
    );
    
    if (result.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, 'סטטוס לא נמצא');
      await setState(phone, 'idle', null, null);
      return;
    }
    
    const statusConnectionId = result.rows[0].connection_id;
    await setState(phone, 'select_schedule_day', { rescheduleId: statusId }, null, statusConnectionId);
    await sendDaySelection(phone);
    return;
  }
  
  // Handle sent status actions
  if (actionId === 'status_views') {
    const views = await db.query(
      `SELECT * FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC`,
      [statusId]
    );
    
    if (views.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, 'אין צפיות בסטטוס זה');
    } else {
      const viewersList = views.rows.map(v => v.viewer_phone).join('\n');
      await cloudApi.sendTextMessage(phone, `👁 ${views.rows.length} צפיות:\n\n${viewersList}`);
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'status_reactions') {
    const replies = await db.query(
      `SELECT * FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC`,
      [statusId]
    );
    
    if (replies.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, 'אין תגובות לסטטוס זה');
    } else {
      const repliesList = replies.rows.map(r => `${r.replier_phone}: ${r.reply_text}`).join('\n');
      await cloudApi.sendTextMessage(phone, `💬 ${replies.rows.length} תגובות:\n\n${repliesList}`);
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'status_delete') {
    // Mark as deleted
    await db.query(
      `UPDATE status_bot_statuses SET deleted_at = NOW() WHERE id = $1`,
      [statusId]
    );
    await cloudApi.sendTextMessage(phone, '✅ הסטטוס נמחק');
    await setState(phone, 'idle', null, null);
    return;
  }
}

/**
 * Handle menu command
 */
async function handleMenuCommand(phone, state) {
  const menuText = `📱 *בוט העלאת סטטוסים*

פקודות זמינות:
• שלח טקסט/תמונה/סרטון/הקלטה - להעלאת סטטוס חדש
• *סטטוסים* - צפייה בסטטוסים מתוזמנים
• *תפריט* - הצגת תפריט זה
• *בטל* - ביטול פעולה נוכחית

💡 טיפ: פשוט שלח את התוכן שתרצה להעלות וזה יתחיל את התהליך!`;
  
  await cloudApi.sendTextMessage(phone, menuText);
}

/**
 * Handle statuses command - show scheduled and active statuses
 */
async function handleStatusesCommand(phone, state) {
  const authorizedConnections = await checkAuthorization(phone);
  
  if (authorizedConnections.length === 0) {
    await cloudApi.sendTextMessage(phone, 'לא נמצאו חשבונות מקושרים למספר שלך');
    return;
  }
  
  // If multiple accounts, use the first one or ask
  let connectionId = state.connection_id;
  
  if (!connectionId) {
    if (authorizedConnections.length === 1) {
      connectionId = authorizedConnections[0].connection_id;
    } else {
      // Ask to select account
      const sections = [{
        title: 'חשבונות',
        rows: authorizedConnections.map(conn => ({
          id: `statuses_account_${conn.connection_id}`,
          title: (conn.display_name || conn.user_name || conn.connection_phone || '').substring(0, 24),
          description: (conn.user_email || '').substring(0, 72)
        }))
      }];
      
      await cloudApi.sendListMessage(
        phone,
        'בחר חשבון לצפייה בסטטוסים',
        'בחר חשבון',
        sections
      );
      
      await setState(phone, 'view_scheduled', { selectingAccount: true }, null);
      return;
    }
  }
  
  const hasStatuses = await showScheduledList(phone, connectionId);
  if (hasStatuses) {
    await setState(phone, 'view_scheduled', null, null, connectionId);
  } else {
    await setState(phone, 'idle', null, null);
  }
}

/**
 * Handle cancel command
 */
async function handleCancelCommand(phone, state) {
  await cloudApi.sendTextMessage(phone, 'הפעולה בוטלה');
  await setState(phone, 'idle', null, null);
}

module.exports = {
  handleMessage,
  getState,
  setState,
  checkAuthorization,
};
