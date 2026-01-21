const pool = require('../../config/database');
const { getSocketManager } = require('../../services/socket/manager.service');
const botEngine = require('../../services/botEngine.service');

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
  
  console.log(`[Webhook] Phone candidates: ${numericCandidates.join(', ')} -> selected: ${numericCandidates[0]}`);
  
  return numericCandidates[0];
}

/**
 * Handle incoming WAHA webhooks
 */
async function handleWebhook(req, res) {
  try {
    const { userId } = req.params;
    const event = req.body;
    
    console.log(`[Webhook] User: ${userId}, Event: ${event.event}`);
    
    // Handle different event types
    switch (event.event) {
      case 'message':
        await handleIncomingMessage(userId, event);
        break;
      case 'message.ack':
        await handleMessageAck(userId, event);
        break;
      case 'session.status':
        await handleSessionStatus(userId, event);
        break;
      default:
        console.log(`[Webhook] Unhandled event: ${event.event}`);
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
  
  // Log incoming payload for debugging
  console.log('[Webhook] Incoming message payload:', JSON.stringify(payload, null, 2));
  
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
    await botEngine.processMessage(
      userId, 
      phone, 
      messageData.content, 
      messageData.type, 
      messageData.selectedRowId,
      messageData.quotedListTitle // Pass the original list title for verification
    );
  } catch (botError) {
    console.error('[Webhook] Bot engine error:', botError);
  }
}

/**
 * Get or create contact
 */
async function getOrCreateContact(userId, phone, payload) {
  // Extract name from various WAHA payload formats - prefer _data.Info.PushName
  const displayName = payload._data?.Info?.PushName || 
                      payload._data?.Info?.VerifiedName?.Details?.verifiedName ||
                      payload.notifyName || payload.pushName || phone;
  
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
  
  // Text message
  if (payload.type === 'chat' || !payload.type) {
    return { type: 'text', content: body };
  }
  
  // Image
  if (payload.type === 'image') {
    return {
      type: 'image',
      content: payload.caption || '',
      mediaUrl: payload.mediaUrl,
      mimeType: payload.mimetype,
    };
  }
  
  // Video
  if (payload.type === 'video') {
    return {
      type: 'video',
      content: payload.caption || '',
      mediaUrl: payload.mediaUrl,
      mimeType: payload.mimetype,
    };
  }
  
  // Audio/Voice
  if (payload.type === 'audio' || payload.type === 'ptt') {
    return {
      type: 'audio',
      mediaUrl: payload.mediaUrl,
      mimeType: payload.mimetype,
    };
  }
  
  // Document
  if (payload.type === 'document') {
    return {
      type: 'document',
      content: payload.caption || '',
      mediaUrl: payload.mediaUrl,
      mimeType: payload.mimetype,
      filename: payload.filename,
    };
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
