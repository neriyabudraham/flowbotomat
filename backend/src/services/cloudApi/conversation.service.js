/**
 * Cloud API Conversation Service
 * State machine for handling WhatsApp Cloud API bot conversations
 */

const db = require('../../config/database');
const cloudApi = require('./cloudApi.service');

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
      `INSERT INTO cloud_api_conversation_states (phone_number, state)
       VALUES ($1, 'idle')
       RETURNING *`,
      [phone]
    );
    return newState.rows[0];
  }
  
  return result.rows[0];
}

/**
 * Update conversation state
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
}

/**
 * Check if phone is authorized for any status bot connection
 * Returns array of connections with user info
 */
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
  
  return result.rows;
}

/**
 * Validate connection can send statuses
 * Returns { valid: boolean, error: string | null }
 */
function validateConnectionStatus(connection) {
  // Check if disconnected
  if (connection.connection_status !== 'connected') {
    return {
      valid: false,
      error: `החשבון "${connection.display_name || connection.connection_phone}" מנותק כרגע.\n\nיש להתחבר מחדש דרך האתר לפני שליחת סטטוסים.`
    };
  }
  
  // Check 24-hour restriction
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
          error: `לא ניתן לשלוח סטטוסים עדיין.\n\nיש להמתין ${timeStr} מרגע ההתחברות לפני שליחת הסטטוס הראשון.\n\n(הגבלה זו נועדה למנוע חסימה מצד WhatsApp)`
        };
      }
    }
  }
  
  return { valid: true, error: null };
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
 */
async function addToQueue(connectionId, statusType, content, scheduledFor = null, sourcePhone = null) {
  const result = await db.query(
    `INSERT INTO status_bot_queue 
     (connection_id, status_type, content, queue_status, scheduled_for, source, source_phone)
     VALUES ($1, $2, $3, $4, $5, 'whatsapp', $6)
     RETURNING *`,
    [
      connectionId,
      statusType,
      JSON.stringify(content),
      scheduledFor ? 'scheduled' : 'pending',
      scheduledFor,
      sourcePhone
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
       AND queue_status IN ('pending', 'scheduled')
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
  console.log(`[CloudAPI Conv] handleMessage called for phone: ${phone}, message type: ${message.type}`);
  
  try {
    const state = await getState(phone);
    console.log(`[CloudAPI Conv] Current state for ${phone}: ${state.state}`);
    
    // Check if blocked
    if (state.blocked_until && new Date(state.blocked_until) > new Date()) {
      console.log(`[CloudAPI Conv] Phone ${phone} is blocked until ${state.blocked_until}`);
      return;
    }
    
    // Check for commands first
    if (message.type === 'text') {
      const text = message.text.body.trim();
      const lowerText = text.toLowerCase();
      console.log(`[CloudAPI Conv] Text message: "${text}"`);
      
      if (lowerText === 'תפריט' || lowerText === 'menu') {
        console.log(`[CloudAPI Conv] Menu command detected`);
        return await handleMenuCommand(phone, state);
      }
      
      if (lowerText === 'סטטוסים' || lowerText === 'statuses') {
        console.log(`[CloudAPI Conv] Statuses command detected`);
        return await handleStatusesCommand(phone, state);
      }
      
      if (lowerText === 'בטל' || lowerText === 'cancel') {
        console.log(`[CloudAPI Conv] Cancel command detected`);
        return await handleCancelCommand(phone, state);
      }
    }
    
    console.log(`[CloudAPI Conv] Routing to state handler: ${state.state}`);
    
    // Route based on current state
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
      
      case 'view_scheduled':
        return await handleViewScheduledState(phone, message, state);
      
      case 'view_status_actions':
        return await handleViewStatusActionsState(phone, message, state);
      
      case 'after_send_menu':
        return await handleAfterSendMenuState(phone, message, state);
      
      default:
        // Reset to idle on unknown state
        await setState(phone, 'idle', null, null);
        return await handleIdleState(phone, message, state);
    }
  } catch (error) {
    console.error(`[CloudAPI Conv] Error handling message from ${phone}:`, error);
    await cloudApi.sendTextMessage(phone, 'אירעה שגיאה. אנא נסה שוב.');
    await setState(phone, 'idle', null, null);
  }
}

/**
 * Handle message in idle state - new status creation
 */
async function handleIdleState(phone, message, state) {
  console.log(`[CloudAPI Conv] handleIdleState for ${phone}`);
  
  // Check authorization
  const authorizedConnections = await checkAuthorization(phone);
  console.log(`[CloudAPI Conv] Found ${authorizedConnections.length} authorized connections for ${phone}`);
  
  if (authorizedConnections.length === 0) {
    console.log(`[CloudAPI Conv] Phone ${phone} is not authorized, notified_not_authorized: ${state.notified_not_authorized}`);
    // Not authorized - send one-time message if not already notified
    if (!state.notified_not_authorized) {
      console.log(`[CloudAPI Conv] Sending not authorized message to ${phone}`);
      await cloudApi.sendTextMessage(phone, 
        `שלום! על מנת להעלות סטטוסים דרך המספר הזה, יש להגדיר אותו כמספר מורשה בבוט העלאת הסטטוסים.\n\nלהרשמה: https://botomat.co.il/`
      );
      await db.query(
        `UPDATE cloud_api_conversation_states SET notified_not_authorized = true WHERE phone_number = $1`,
        [phone]
      );
    }
    return;
  }
  
  // Build pending status from message
  let pendingStatus = null;
  
  if (message.type === 'text') {
    pendingStatus = {
      type: 'text',
      text: message.text.body
    };
  } else if (message.type === 'image') {
    const media = await cloudApi.downloadMedia(message.image.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    pendingStatus = {
      type: 'image',
      url: url,
      caption: message.image.caption || ''
    };
  } else if (message.type === 'video') {
    const media = await cloudApi.downloadMedia(message.video.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    pendingStatus = {
      type: 'video',
      url: url,
      caption: message.video.caption || ''
    };
  } else if (message.type === 'audio') {
    const media = await cloudApi.downloadMedia(message.audio.id);
    const url = await cloudApi.uploadMediaToStorage(media.buffer, media.mimeType);
    pendingStatus = {
      type: 'voice',
      url: url
    };
  } else {
    await cloudApi.sendTextMessage(phone, 'סוג הודעה לא נתמך. אנא שלח טקסט, תמונה, סרטון או הקלטה קולית.');
    return;
  }
  
  // If multiple accounts - ask to select
  if (authorizedConnections.length > 1) {
    const sections = [{
      title: 'חשבונות',
      rows: authorizedConnections.map(conn => ({
        id: `account_${conn.connection_id}`,
        title: conn.display_name || conn.user_name || conn.connection_phone,
        description: conn.user_email
      }))
    }];
    
    await cloudApi.sendListMessage(
      phone,
      'נמצאו מספר חשבונות מקושרים למספר שלך.\nבחר את החשבון שאליו תרצה להעלות:',
      'בחר חשבון',
      sections
    );
    
    await setState(phone, 'select_account', { accounts: authorizedConnections }, pendingStatus);
    return;
  }
  
  // Single account - validate and proceed
  const connection = authorizedConnections[0];
  
  // Validate connection status
  const validation = validateConnectionStatus(connection);
  if (!validation.valid) {
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
  await setState(phone, 'select_color', null, pendingStatus, connection.connection_id);
  await sendColorSelection(phone, connection.connection_id);
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
    await cloudApi.sendTextMessage(phone, 'חשבון לא נמצא. אנא נסה שוב.');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  // Validate connection status
  const validation = validateConnectionStatus(selectedAccount);
  if (!validation.valid) {
    await cloudApi.sendTextMessage(phone, validation.error);
    await setState(phone, 'idle', null, null);
    return;
  }
  
  const pendingStatus = state.pending_status;
  
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
  await setState(phone, 'select_color', null, pendingStatus, connectionId);
  await sendColorSelection(phone, connectionId);
}

/**
 * Send color selection list
 */
async function sendColorSelection(phone, connectionId) {
  const colors = await getColorsForConnection(connectionId);
  
  const sections = [{
    title: 'צבעים',
    rows: colors.map(color => ({
      id: `color_${color.id}`,
      title: color.title
    }))
  }];
  
  await cloudApi.sendListMessage(
    phone,
    'בחר צבע רקע לסטטוס:',
    'בחר צבע',
    sections
  );
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
  
  if (actionId === 'action_cancel') {
    await cloudApi.sendTextMessage(phone, 'הסטטוס בוטל.');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'action_send') {
    // Add to queue immediately
    const pendingStatus = state.pending_status;
    const content = buildStatusContent(pendingStatus);
    
    const queueResult = await addToQueue(state.connection_id, pendingStatus.type, content, null, phone);
    const queuedStatusId = queueResult?.id;
    
    // Show success message with action list
    const sections = [{
      title: 'פעולות',
      rows: [
        { id: `queued_delete_${queuedStatusId}`, title: 'מחק סטטוס', description: 'הסר מתור השליחה' },
        { id: 'queued_view_all', title: 'צפה בכל הסטטוסים', description: 'סטטוסים מתוזמנים ופעילים' },
        { id: 'queued_new_status', title: 'שלח סטטוס נוסף', description: 'העלה תוכן חדש' },
        { id: 'queued_menu', title: 'תפריט ראשי', description: 'חזור לתפריט' }
      ]
    }];
    
    await cloudApi.sendListMessage(
      phone,
      '✅ הסטטוס נוסף לתור השליחה!\n\nמה תרצה לעשות?',
      'בחר פעולה',
      sections
    );
    await setState(phone, 'after_send_menu', { queuedStatusId }, null, state.connection_id);
    return;
  }
  
  if (actionId === 'action_schedule') {
    // Show day selection
    await sendDaySelection(phone);
    await setState(phone, 'select_schedule_day', null, state.pending_status, state.connection_id);
  }
}

/**
 * Send day selection list for scheduling
 */
async function sendDaySelection(phone) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  
  const sections = [{
    title: 'בחר יום',
    rows: [
      { id: 'day_0', title: 'היום', description: `יום ${DAY_NAMES[today.getDay()]}` },
      { id: 'day_1', title: 'מחר', description: `יום ${DAY_NAMES[tomorrow.getDay()]}` },
      { id: 'day_2', title: 'בעוד יומיים', description: `יום ${DAY_NAMES[dayAfter.getDay()]}` }
    ]
  }];
  
  await cloudApi.sendListMessage(
    phone,
    'בחר יום לשליחה:',
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
  
  const selectedDate = new Date();
  selectedDate.setDate(selectedDate.getDate() + daysOffset);
  
  const stateData = {
    scheduledDate: selectedDate.toISOString().split('T')[0],
    daysOffset: daysOffset
  };
  
  await setState(phone, 'select_schedule_time', stateData, state.pending_status, state.connection_id);
  await cloudApi.sendTextMessage(phone, 'הזן שעת שליחה (לדוגמא: 13:00, 1300, 13):');
}

/**
 * Handle time input for scheduling
 */
async function handleSelectScheduleTimeState(phone, message, state) {
  if (message.type !== 'text') {
    await cloudApi.sendTextMessage(phone, 'אנא הזן שעה בפורמט מספרי (לדוגמא: 13:00, 1300, 13)');
    return;
  }
  
  const timeInput = message.text.body.trim();
  const parsedTime = parseTimeInput(timeInput);
  
  if (!parsedTime) {
    await cloudApi.sendTextMessage(phone, 'פורמט שעה לא תקין. אנא נסה שוב (לדוגמא: 13:00, 1300, 13):');
    return;
  }
  
  const stateData = state.state_data || {};
  const scheduledDate = new Date(stateData.scheduledDate);
  scheduledDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  
  // Check if time is in the past
  if (scheduledDate <= new Date()) {
    await cloudApi.sendTextMessage(phone, 'לא ניתן לתזמן לזמן שעבר. אנא בחר שעה עתידית:');
    return;
  }
  
  // Add to queue with schedule
  const pendingStatus = state.pending_status;
  const content = buildStatusContent(pendingStatus);
  
  await addToQueue(state.connection_id, pendingStatus.type, content, scheduledDate, phone);
  
  const formattedTime = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`;
  const formattedDate = formatDateHebrew(scheduledDate);
  
  await cloudApi.sendTextMessage(phone, `✅ הסטטוס תוזמן ל-${formattedDate} בשעה ${formattedTime}`);
  
  // Show scheduled list
  await showScheduledList(phone, state.connection_id);
  await setState(phone, 'idle', null, null);
}

/**
 * Handle after send menu state
 */
async function handleAfterSendMenuState(phone, message, state) {
  if (message.type !== 'interactive' || message.interactive.type !== 'list_reply') {
    // User sent new content - treat as new status, go back to idle flow
    await setState(phone, 'idle', null, null);
    return await handleIdleState(phone, message, { state: 'idle' });
  }
  
  const selectedId = message.interactive.list_reply.id;
  
  if (selectedId.startsWith('queued_delete_')) {
    const statusId = selectedId.replace('queued_delete_', '');
    
    // Check if status is still in queue
    const result = await db.query(
      `SELECT * FROM status_bot_queue WHERE id = $1`,
      [statusId]
    );
    
    if (result.rows.length > 0) {
      const status = result.rows[0];
      
      if (status.queue_status === 'pending' || status.queue_status === 'scheduled') {
        // Remove from queue
        await db.query(
          `UPDATE status_bot_queue SET queue_status = 'cancelled' WHERE id = $1`,
          [statusId]
        );
        await cloudApi.sendTextMessage(phone, '✅ הסטטוס הוסר מתור השליחה.');
      } else if (status.queue_status === 'sent' && status.wa_message_id) {
        // Status was sent - try to delete it
        // Note: This would require calling WAHA to delete the status
        await cloudApi.sendTextMessage(phone, 'הסטטוס כבר נשלח. מחיקת סטטוסים שנשלחו דורשת גישה לחשבון.');
      } else {
        await cloudApi.sendTextMessage(phone, 'לא ניתן למחוק את הסטטוס.');
      }
    } else {
      await cloudApi.sendTextMessage(phone, 'סטטוס לא נמצא.');
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (selectedId === 'queued_view_all') {
    await handleStatusesCommand(phone, state);
    return;
  }
  
  if (selectedId === 'queued_new_status') {
    await cloudApi.sendTextMessage(phone, 'שלח טקסט, תמונה, סרטון או הקלטה להעלאת סטטוס:');
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (selectedId === 'queued_menu') {
    await handleMenuCommand(phone, state);
    await setState(phone, 'idle', null, null);
    return;
  }
  
  await setState(phone, 'idle', null, null);
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
        url: pendingStatus.url,
        mimetype: 'image/jpeg',
        caption: pendingStatus.caption || ''
      };
    
    case 'video':
      return {
        url: pendingStatus.url,
        mimetype: 'video/mp4',
        caption: pendingStatus.caption || ''
      };
    
    case 'voice':
      return {
        url: pendingStatus.url,
        mimetype: 'audio/ogg',
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
    await cloudApi.sendTextMessage(phone, 'אין סטטוסים מתוזמנים.\n\nשלח טקסט, תמונה, סרטון או הקלטה להעלאת סטטוס חדש.');
    return false;
  }
  
  const sections = [{
    title: 'סטטוסים מתוזמנים',
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
    'סטטוסים מתוזמנים:',
    'בחר סטטוס',
    sections
  );
  return true;
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
      await cloudApi.sendTextMessage(phone, '✅ התזמון בוטל.');
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
      await cloudApi.sendTextMessage(phone, 'סטטוס לא נמצא.');
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
      await cloudApi.sendTextMessage(phone, 'אין צפיות בסטטוס זה.');
    } else {
      const viewersList = views.rows.map(v => v.viewer_phone).join('\n');
      await cloudApi.sendTextMessage(phone, `👁 ${views.rows.length} צפיות:\n\n${viewersList}`);
    }
    await setState(phone, 'idle', null, null);
    return;
  }
  
  if (actionId === 'status_reactions') {
    const reactions = await db.query(
      `SELECT * FROM status_bot_reactions WHERE status_id = $1 ORDER BY reacted_at DESC`,
      [statusId]
    );
    
    if (reactions.rows.length === 0) {
      await cloudApi.sendTextMessage(phone, 'אין תגובות לסטטוס זה.');
    } else {
      const reactionsList = reactions.rows.map(r => `${r.reaction} - ${r.reactor_phone}`).join('\n');
      await cloudApi.sendTextMessage(phone, `💬 ${reactions.rows.length} תגובות:\n\n${reactionsList}`);
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
    await cloudApi.sendTextMessage(phone, '✅ הסטטוס נמחק.');
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
    await cloudApi.sendTextMessage(phone, 'לא נמצאו חשבונות מקושרים למספר שלך.');
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
          title: conn.display_name || conn.user_name || conn.connection_phone,
          description: conn.user_email
        }))
      }];
      
      await cloudApi.sendListMessage(
        phone,
        'בחר חשבון לצפייה בסטטוסים:',
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
  await cloudApi.sendTextMessage(phone, 'הפעולה בוטלה.');
  await setState(phone, 'idle', null, null);
}

module.exports = {
  handleMessage,
  getState,
  setState,
  checkAuthorization,
};
