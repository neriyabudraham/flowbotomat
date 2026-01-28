const pool = require('../../config/database');
const { getSocketManager } = require('../../services/socket/manager.service');
const botEngine = require('../../services/botEngine.service');
const groupForwardsTrigger = require('../../services/groupForwards/trigger.service');

/**
 * Extract real phone number from payload
 * Real phone numbers are typically 10-15 digits
 * LIDs are longer random strings
 */
function extractRealPhone(payload) {
  const candidates = [];
  
  // Collect all possible phone sources
  if (payload._data?.Info?.SenderAlt) {
    candidates.push(payload._data.Info.SenderAlt.split('@')[0]);
  }
  if (payload._data?.Info?.Sender) {
    candidates.push(payload._data.Info.Sender.split('@')[0]);
  }
  if (payload._data?.Info?.Chat) {
    candidates.push(payload._data.Info.Chat.split('@')[0]);
  }
  if (payload.from) {
    candidates.push(payload.from.split('@')[0]);
  }
  if (payload.chatId) {
    candidates.push(payload.chatId.split('@')[0]);
  }
  
  // Filter to only numeric strings
  const numericCandidates = candidates.filter(c => /^\d+$/.test(c));
  
  if (numericCandidates.length === 0) return null;
  
  // Sort by length - real phone numbers are typically 10-15 digits
  // LIDs are usually longer (15+ digits)
  numericCandidates.sort((a, b) => {
    // Prefer numbers in valid phone range (10-15 digits)
    const aValid = a.length >= 10 && a.length <= 15;
    const bValid = b.length >= 10 && b.length <= 15;
    
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    
    // If both valid or both invalid, prefer shorter
    return a.length - b.length;
  });
  
  // Debug log only in development
  // console.log(`[Webhook] Phone candidates: ${numericCandidates.join(', ')} -> selected: ${numericCandidates[0]}`);
  
  return numericCandidates[0];
}

/**
 * Handle incoming WAHA webhooks
 */
async function handleWebhook(req, res) {
  try {
    const { userId } = req.params;
    const event = req.body;
    
    // Quick check if user exists (skip for frequent events to reduce DB load)
    const silentEvents = ['message', 'message.ack', 'message.any', 'poll.vote', 'poll.vote.failed'];
    if (!silentEvents.includes(event.event)) {
      console.log(`[Webhook] User: ${userId}, Event: ${event.event}`);
    }
    
    // Handle different event types
    switch (event.event) {
      case 'message':
        await handleIncomingMessage(userId, event);
        break;
      case 'message.ack':
        // Silent - these are very frequent
        await handleMessageAck(userId, event);
        break;
      case 'session.status':
        await handleSessionStatus(userId, event);
        break;
      default:
        // Unhandled events are already filtered at the top
        break;
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook error' });
  }
}

/**
 * Handle incoming message
 */
async function handleIncomingMessage(userId, event) {
  const { payload } = event;
  
  // Verify user exists before processing
  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) {
    console.log(`[Webhook] Skipping message - user ${userId} not found (possibly deleted)`);
    // TODO: Consider cleaning up orphaned WhatsApp connections
    return;
  }
  
  // Debug log disabled to reduce noise
  // console.log('[Webhook] Incoming message payload:', JSON.stringify(payload, null, 2));
  
  // Skip status updates
  if (payload.from === 'status@broadcast') {
    return;
  }
  
  // Handle outgoing messages (sent from device, not from bot)
  if (payload.fromMe) {
    await handleOutgoingDeviceMessage(userId, payload);
    return;
  }
  
  // Extract phone number - find the real phone number
  const phone = extractRealPhone(payload);
  
  if (!phone) {
    console.log('[Webhook] Could not extract phone number');
    return;
  }
  
  console.log(`[Webhook] Extracted phone: ${phone}`);
  
  // Get or create contact
  const contact = await getOrCreateContact(userId, phone, payload);
  
  // Parse message content
  const messageData = parseMessage(payload);
  
  // Save message
  const result = await pool.query(
    `INSERT INTO messages 
     (user_id, contact_id, wa_message_id, direction, message_type, 
      content, media_url, media_mime_type, media_filename, latitude, longitude, sent_at)
     VALUES ($1, $2, $3, 'incoming', $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [userId, contact.id, payload.id, messageData.type, messageData.content,
     messageData.mediaUrl, messageData.mimeType, messageData.filename,
     messageData.latitude, messageData.longitude, new Date(payload.timestamp * 1000)]
  );
  
  // Update contact's last message time
  await pool.query(
    `UPDATE contacts SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [contact.id]
  );
  
  // Emit to frontend via Socket.io
  const socketManager = getSocketManager();
  socketManager.emitToUser(userId, 'new_message', {
    message: result.rows[0],
    contact,
  });
  
  console.log(`[Webhook] Message saved for user ${userId} from ${phone}`);
  
  // Process with bot engine
  try {
    const chatId = payload.from || payload.chatId;
    const isGroupMessage = chatId?.includes('@g.us') || false;
    const groupId = isGroupMessage ? chatId : null;
    
    await botEngine.processMessage(
      userId, 
      phone, 
      messageData.content, 
      messageData.type, 
      messageData.selectedRowId,
      messageData.quotedListTitle, // Pass the original list title for verification
      isGroupMessage, // Pass whether this is a group message
      groupId // Pass the group ID if it's a group message
    );
  } catch (botError) {
    console.error('[Webhook] Bot engine error:', botError);
  }
  
  // Process group forwards trigger
  try {
    // First check if this is a confirmation response for pending job
    const wasConfirmation = await groupForwardsTrigger.handleConfirmationResponse(
      userId, 
      phone, 
      messageData.content,
      messageData.selectedRowId // Button ID if clicked
    );
    
    // If not a confirmation response, check for new triggers
    if (!wasConfirmation) {
      const chatId = payload.from || payload.chatId;
      await groupForwardsTrigger.processMessageForForwards(
        userId,
        phone,
        messageData,
        chatId,
        payload
      );
    }
  } catch (forwardError) {
    console.error('[Webhook] Group forwards trigger error:', forwardError);
  }
}

/**
 * Get or create contact
 */
async function getOrCreateContact(userId, phone, payload) {
  // Extract name from various WAHA payload formats - prefer _data.Info.PushName
  let displayName = payload._data?.Info?.PushName || 
                    payload._data?.Info?.VerifiedName?.Details?.verifiedName ||
                    payload.notifyName || payload.pushName || phone;
  
  // Check if we have a synced WhatsApp contact name (from user's phone contacts)
  try {
    const syncedContact = await pool.query(
      `SELECT display_name FROM whatsapp_contacts 
       WHERE user_id = $1 AND phone = $2 AND display_name IS NOT NULL AND display_name != ''`,
      [userId, phone]
    );
    if (syncedContact.rows.length > 0 && syncedContact.rows[0].display_name) {
      // Prefer the synced contact name over pushname
      displayName = syncedContact.rows[0].display_name;
    }
  } catch (err) {
    // Table might not exist yet, ignore
  }
  
  // Get the real WhatsApp ID
  const waId = payload._data?.Info?.SenderAlt || payload.from || `${phone}@s.whatsapp.net`;
  
  console.log(`[Webhook] Contact info - phone: ${phone}, name: ${displayName}, waId: ${waId}`);
  
  // Try to find existing contact
  const existing = await pool.query(
    'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
    [userId, phone]
  );
  
  if (existing.rows.length > 0) {
    // Update name if we have a better one now
    const contact = existing.rows[0];
    if (displayName && displayName !== phone && contact.display_name !== displayName) {
      await pool.query(
        'UPDATE contacts SET display_name = $1, updated_at = NOW() WHERE id = $2',
        [displayName, contact.id]
      );
      contact.display_name = displayName;
    }
    return contact;
  }
  
  // Create new contact
  const result = await pool.query(
    `INSERT INTO contacts (user_id, phone, wa_id, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, phone, waId, displayName]
  );
  
  console.log(`[Webhook] New contact created: ${phone}`);
  return result.rows[0];
}

/**
 * Parse message content based on type
 */
function parseMessage(payload) {
  const body = payload.body || '';
  
  // Debug log for media messages
  if (payload.hasMedia || payload.type !== 'chat') {
    console.log(`[Webhook] parseMessage - type: ${payload.type}, hasMedia: ${payload.hasMedia}, mediaUrl: ${payload.mediaUrl}`);
  }
  
  // Check for list response (button click)
  const listResponse = payload._data?.Message?.listResponseMessage;
  if (listResponse) {
    const selectedRowId = listResponse.singleSelectReply?.selectedRowID;
    // Extract the original list title from quotedMessage to verify which list was clicked
    const quotedListTitle = listResponse.contextInfo?.quotedMessage?.listMessage?.title;
    console.log('[Webhook] Detected LIST_RESPONSE, selectedRowID:', selectedRowId, ', quotedListTitle:', quotedListTitle);
    return {
      type: 'list_response',
      content: listResponse.title || body,
      selectedRowId: selectedRowId,
      quotedListTitle: quotedListTitle, // Title of the list that was clicked
    };
  }
  
  // Check MediaType for list_response as fallback
  if (payload._data?.Info?.MediaType === 'list_response') {
    const listMsg = payload._data?.Message?.listResponseMessage;
    const selectedRowId = listMsg?.singleSelectReply?.selectedRowID;
    const quotedListTitle = listMsg?.contextInfo?.quotedMessage?.listMessage?.title;
    console.log('[Webhook] Detected list_response via MediaType, selectedRowID:', selectedRowId, ', quotedListTitle:', quotedListTitle);
    return {
      type: 'list_response',
      content: listMsg?.title || body,
      selectedRowId: selectedRowId,
      quotedListTitle: quotedListTitle,
    };
  }
  
  // Check for media via hasMedia flag or media property (WAHA formats)
  const hasMedia = payload.hasMedia || payload.media || payload._data?.Message?.imageMessage || 
                   payload._data?.Message?.videoMessage || payload._data?.Message?.audioMessage;
  
  // Get media URL from various WAHA formats
  const getMediaUrl = () => {
    return payload.mediaUrl || payload.media?.url || payload.media?.link;
  };
  
  // Image - check multiple indicators
  if (payload.type === 'image' || payload._data?.Message?.imageMessage || 
      (hasMedia && payload.mimetype?.startsWith('image/'))) {
    const imageMsg = payload._data?.Message?.imageMessage;
    return {
      type: 'image',
      content: payload.caption || imageMsg?.caption || body || '',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || imageMsg?.mimetype,
    };
  }
  
  // Video - check multiple indicators
  if (payload.type === 'video' || payload._data?.Message?.videoMessage ||
      (hasMedia && payload.mimetype?.startsWith('video/'))) {
    const videoMsg = payload._data?.Message?.videoMessage;
    return {
      type: 'video',
      content: payload.caption || videoMsg?.caption || body || '',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || videoMsg?.mimetype,
    };
  }
  
  // Audio/Voice - check multiple indicators
  if (payload.type === 'audio' || payload.type === 'ptt' || 
      payload._data?.Message?.audioMessage ||
      (hasMedia && payload.mimetype?.startsWith('audio/'))) {
    const audioMsg = payload._data?.Message?.audioMessage;
    return {
      type: 'audio',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || audioMsg?.mimetype,
    };
  }
  
  // Document
  if (payload.type === 'document' || payload._data?.Message?.documentMessage) {
    const docMsg = payload._data?.Message?.documentMessage;
    return {
      type: 'document',
      content: payload.caption || docMsg?.caption || body || '',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || docMsg?.mimetype,
      filename: payload.filename || docMsg?.fileName,
    };
  }
  
  // Text message (default)
  if (payload.type === 'chat' || !payload.type) {
    return { type: 'text', content: body };
  }
  
  // Sticker
  if (payload.type === 'sticker') {
    return {
      type: 'sticker',
      mediaUrl: payload.mediaUrl,
    };
  }
  
  // Location
  if (payload.type === 'location') {
    return {
      type: 'location',
      content: payload.loc || '',
      latitude: payload.lat,
      longitude: payload.lng,
    };
  }
  
  // Contact card
  if (payload.type === 'vcard') {
    return {
      type: 'contact',
      content: payload.body || payload.vcard,
    };
  }
  
  // Default: treat as text
  return { type: 'text', content: body };
}

/**
 * Handle outgoing messages sent from the actual device (not from bot)
 */
async function handleOutgoingDeviceMessage(userId, payload) {
  // Extract the recipient's phone number
  const toPhone = payload.to?.split('@')[0] || payload.chatId?.split('@')[0];
  
  if (!toPhone || !toPhone.match(/^\d+$/)) {
    console.log('[Webhook] Could not extract recipient phone from outgoing message');
    return;
  }
  
  console.log(`[Webhook] Outgoing device message to: ${toPhone}`);
  
  // Find the contact
  const contactResult = await pool.query(
    'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
    [userId, toPhone]
  );
  
  let contact;
  if (contactResult.rows.length === 0) {
    // Create contact if doesn't exist
    const newContact = await pool.query(
      `INSERT INTO contacts (user_id, phone, display_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, toPhone, toPhone]
    );
    contact = newContact.rows[0];
    console.log(`[Webhook] Created new contact for outgoing message: ${toPhone}`);
  } else {
    contact = contactResult.rows[0];
  }
  
  // Check if message already exists (to avoid duplicates)
  const existingMsg = await pool.query(
    'SELECT id FROM messages WHERE wa_message_id = $1',
    [payload.id]
  );
  
  if (existingMsg.rows.length > 0) {
    console.log('[Webhook] Outgoing message already exists, skipping');
    return;
  }
  
  // Parse message content
  const messageData = parseMessage(payload);
  
  // Save outgoing message
  const result = await pool.query(
    `INSERT INTO messages 
     (user_id, contact_id, wa_message_id, direction, message_type, 
      content, media_url, media_mime_type, media_filename, latitude, longitude, sent_at, status)
     VALUES ($1, $2, $3, 'outgoing', $4, $5, $6, $7, $8, $9, $10, $11, 'sent')
     RETURNING *`,
    [userId, contact.id, payload.id, messageData.type, messageData.content,
     messageData.mediaUrl, messageData.mimeType, messageData.filename,
     messageData.latitude, messageData.longitude, 
     payload.timestamp ? new Date(payload.timestamp * 1000) : new Date()]
  );
  
  // Update contact's last message time
  await pool.query(
    `UPDATE contacts SET last_message_at = NOW(), last_message = $1, updated_at = NOW() WHERE id = $2`,
    [messageData.content?.substring(0, 100) || '', contact.id]
  );
  
  // Emit to frontend via Socket.io - use 'outgoing_message' event for device-sent messages
  const socketManager = getSocketManager();
  socketManager.emitToUser(userId, 'outgoing_message', {
    message: result.rows[0],
    contact,
  });
  
  console.log(`[Webhook] Outgoing device message saved for user ${userId} to ${toPhone}`);
}

/**
 * Handle message acknowledgment (delivered/read)
 */
async function handleMessageAck(userId, event) {
  const { payload } = event;
  const ackLevel = payload.ack;
  
  // 1 = sent, 2 = delivered, 3 = read
  let updateField = null;
  if (ackLevel === 2) updateField = 'delivered_at';
  if (ackLevel >= 3) updateField = 'read_at';
  
  if (updateField && payload.id) {
    await pool.query(
      `UPDATE messages SET ${updateField} = NOW(), status = $1 WHERE wa_message_id = $2`,
      [ackLevel === 2 ? 'delivered' : 'read', payload.id._serialized || payload.id]
    );
  }
}

/**
 * Handle session status changes
 */
async function handleSessionStatus(userId, event) {
  const { payload } = event;
  
  const statusMap = {
    'WORKING': 'connected',
    'SCAN_QR_CODE': 'qr_pending',
    'STARTING': 'qr_pending',
    'STOPPED': 'disconnected',
    'FAILED': 'failed',
  };
  
  const ourStatus = statusMap[payload.status] || 'disconnected';
  
  await pool.query(
    `UPDATE whatsapp_connections SET status = $1, updated_at = NOW() WHERE user_id = $2`,
    [ourStatus, userId]
  );
  
  // Emit status change to frontend
  const socketManager = getSocketManager();
  socketManager.emitToUser(userId, 'whatsapp_status', { status: ourStatus });
}

module.exports = { handleWebhook };
