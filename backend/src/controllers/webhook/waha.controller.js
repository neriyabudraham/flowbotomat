const pool = require('../../config/database');
const { getSocketManager } = require('../../services/socket/manager.service');
const botEngine = require('../../services/botEngine.service');
const groupForwardsTrigger = require('../../services/groupForwards/trigger.service');

/**
 * Extract real phone number from payload
 * IMPORTANT: Exclude LIDs (@lid) - these are WhatsApp internal IDs, not phone numbers
 * Real phone numbers come from @c.us or @s.whatsapp.net suffixes
 */
function extractRealPhone(payload) {
  const candidates = [];
  
  // Helper to add candidate only if it's from a real phone source (not LID)
  const addIfRealPhone = (fullId) => {
    if (!fullId) return;
    
    // Skip LIDs - they are NOT phone numbers
    if (fullId.includes('@lid')) {
      console.log(`[Webhook] Skipping LID: ${fullId}`);
      return;
    }
    
    // Only accept @c.us or @s.whatsapp.net (real phone identifiers)
    if (fullId.includes('@c.us') || fullId.includes('@s.whatsapp.net')) {
      const phone = fullId.split('@')[0];
      if (/^\d+$/.test(phone)) {
        candidates.push(phone);
      }
    }
  };
  
  // Collect phone from various sources - prioritize chat ID for direct messages
  // because it contains the real sender phone number
  addIfRealPhone(payload.chatId);
  addIfRealPhone(payload.from);
  addIfRealPhone(payload._data?.Info?.Chat);
  addIfRealPhone(payload._data?.Info?.Sender);
  addIfRealPhone(payload._data?.Info?.SenderAlt);
  
  // If no candidates found from standard sources, try fallback
  if (candidates.length === 0) {
    // Last resort: check all numeric strings in standard fields
    const fallbackSources = [
      payload._data?.Info?.SenderAlt,
      payload._data?.Info?.Sender,
      payload._data?.Info?.Chat,
      payload.from,
      payload.chatId
    ].filter(Boolean);
    
    for (const source of fallbackSources) {
      const phone = source.split('@')[0];
      // Only accept if it looks like a real phone (10-15 digits starting with country code)
      if (/^\d{10,15}$/.test(phone) && (phone.startsWith('972') || phone.startsWith('1'))) {
        candidates.push(phone);
        break;
      }
    }
  }
  
  if (candidates.length === 0) {
    console.log(`[Webhook] Could not find real phone in payload`);
    return null;
  }
  
  // Deduplicate and prefer numbers starting with country code
  const uniqueCandidates = [...new Set(candidates)];
  uniqueCandidates.sort((a, b) => {
    // Prefer numbers starting with 972 (Israel)
    const aIsrael = a.startsWith('972');
    const bIsrael = b.startsWith('972');
    if (aIsrael && !bIsrael) return -1;
    if (!aIsrael && bIsrael) return 1;
    return 0;
  });
  
  console.log(`[Webhook] Phone candidates: ${uniqueCandidates.join(', ')} -> selected: ${uniqueCandidates[0]}`);
  
  return uniqueCandidates[0];
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

// Ensure columns have correct sizes (migration)
let migrationsApplied = false;
async function ensureMigrations() {
  if (migrationsApplied) return;
  try {
    // Add sender_phone and sender_name columns for group messages
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(50)`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255)`);
    // Expand phone and wa_id columns to support group IDs (e.g., 120363422185641072@g.us)
    await pool.query(`ALTER TABLE contacts ALTER COLUMN phone TYPE VARCHAR(50)`);
    await pool.query(`ALTER TABLE contacts ALTER COLUMN wa_id TYPE VARCHAR(100)`);
    // Create LID to phone mapping table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_lid_mapping (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lid VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        display_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, lid)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lid_mapping_lid ON whatsapp_lid_mapping(lid)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lid_mapping_phone ON whatsapp_lid_mapping(phone)`);
    migrationsApplied = true;
  } catch (err) {
    console.log('[Webhook] Migration note:', err.message);
    migrationsApplied = true;
  }
}

/**
 * Store LID to phone mapping for future reference
 */
async function storeLidMapping(userId, lid, phone, displayName) {
  if (!lid || !phone) return;
  try {
    await pool.query(`
      INSERT INTO whatsapp_lid_mapping (user_id, lid, phone, display_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, lid) DO UPDATE SET
        phone = EXCLUDED.phone,
        display_name = COALESCE(EXCLUDED.display_name, whatsapp_lid_mapping.display_name),
        updated_at = NOW()
    `, [userId, lid, phone, displayName]);
  } catch (err) {
    // Ignore errors
  }
}

/**
 * Get phone from LID mapping
 */
async function getPhoneFromLid(userId, lid) {
  try {
    const result = await pool.query(
      `SELECT phone, display_name FROM whatsapp_lid_mapping WHERE user_id = $1 AND lid = $2`,
      [userId, lid]
    );
    return result.rows[0] || null;
  } catch (err) {
    return null;
  }
}

/**
 * Handle incoming message
 */
async function handleIncomingMessage(userId, event) {
  const { payload } = event;
  
  // Ensure migrations are applied
  await ensureMigrations();
  
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
  
  // Determine if this is a group message
  const chatId = payload.from || payload.chatId;
  const isGroupMessage = chatId?.includes('@g.us') || false;
  const groupId = isGroupMessage ? chatId : null;
  
  // Extract sender's phone number and name
  const senderPhone = extractRealPhone(payload);
  const senderName = payload._data?.Info?.PushName || 
                     payload._data?.Info?.VerifiedName?.Details?.verifiedName ||
                     payload.notifyName || payload.pushName || null;
  
  // Store LID to phone mapping if we have both
  const senderLid = payload._data?.Info?.SenderAlt || payload._data?.Info?.Sender;
  if (senderLid && senderLid.includes('@lid') && senderPhone) {
    const lidOnly = senderLid.split('@')[0];
    await storeLidMapping(userId, lidOnly, senderPhone, senderName);
    console.log(`[Webhook] Stored LID mapping: ${lidOnly} -> ${senderPhone} (${senderName})`);
  }
  
  // For groups, use the group ID as the contact identifier
  // For direct messages, use the sender's phone
  let contactPhone;
  let contactName;
  let contactWaId;
  
  if (isGroupMessage) {
    // Group message: contact is the GROUP itself
    contactPhone = groupId;  // e.g., "120363422185641072@g.us"
    contactWaId = groupId;
    // Get group name from payload - try multiple sources
    // WAHA typically puts group subject in _data.Info.Subject or chat.name
    contactName = payload._data?.Info?.Subject ||  // Group subject
                  payload._data?.chatInfo?.subject || // Alternative location
                  payload._data?.chat?.name || // Another alternative
                  payload.notifyName || // Fallback
                  'קבוצה'; // Default
    console.log(`[Webhook] Group message - group: ${groupId}, name: ${contactName}, sender: ${senderPhone} (${senderName})`);
  } else {
    // Direct message: contact is the sender
    contactPhone = senderPhone;
    contactWaId = payload._data?.Info?.SenderAlt || payload.from || `${senderPhone}@s.whatsapp.net`;
    contactName = senderName || senderPhone;
  }
  
  if (!contactPhone) {
    console.log('[Webhook] Could not extract contact identifier');
    return;
  }
  
  console.log(`[Webhook] Extracted contact: ${contactPhone} (isGroup: ${isGroupMessage})`);
  
  // Get or create contact (group or individual)
  const contact = await getOrCreateContact(userId, contactPhone, {
    ...payload,
    _contactOverride: {
      name: contactName,
      waId: contactWaId,
      isGroup: isGroupMessage
    }
  });
  
  // Parse message content
  const messageData = parseMessage(payload);
  
  // Save message with sender_phone and sender_name for group messages
  const result = await pool.query(
    `INSERT INTO messages 
     (user_id, contact_id, wa_message_id, direction, message_type, 
      content, media_url, media_mime_type, media_filename, latitude, longitude, sent_at, sender_phone, sender_name)
     VALUES ($1, $2, $3, 'incoming', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [userId, contact.id, payload.id, messageData.type, messageData.content,
     messageData.mediaUrl, messageData.mimeType, messageData.filename,
     messageData.latitude, messageData.longitude, new Date(payload.timestamp * 1000),
     isGroupMessage ? senderPhone : null,
     isGroupMessage ? senderName : null]
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
  
  console.log(`[Webhook] Message saved for user ${userId} from ${contactPhone}`);
  
  // FIRST: Process group forwards - if message is handled by forwards, skip bot engine
  let handledByForwards = false;
  
  // For group forwards and bot engine, use the SENDER's phone (not the group ID)
  const phoneForProcessing = senderPhone;
  
  try {
    // First check if this is a confirmation response for pending job
    const wasConfirmation = await groupForwardsTrigger.handleConfirmationResponse(
      userId, 
      phoneForProcessing, 
      messageData.content,
      messageData.selectedRowId // Button ID if clicked
    );
    
    if (wasConfirmation) {
      console.log(`[Webhook] Message handled as forward confirmation - skipping bot engine`);
      handledByForwards = true;
    } else {
      // Check if this triggers a group forward (from authorized sender)
      const forwardTriggered = await groupForwardsTrigger.processMessageForForwards(
        userId,
        phoneForProcessing,
        messageData,
        chatId,
        payload
      );
      
      if (forwardTriggered) {
        console.log(`[Webhook] Message handled as forward trigger - skipping bot engine`);
        handledByForwards = true;
      }
    }
  } catch (forwardError) {
    console.error('[Webhook] Group forwards trigger error:', forwardError);
  }
  
  // SECOND: Process with bot engine ONLY if not handled by forwards
  if (!handledByForwards) {
    try {
      await botEngine.processMessage(
        userId, 
        phoneForProcessing, 
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
  }
}

/**
 * Get or create contact
 */
async function getOrCreateContact(userId, phone, payload) {
  // Check for override (used for groups)
  const override = payload._contactOverride;
  const isGroup = override?.isGroup || phone.includes('@g.us');
  
  let displayName;
  let waId;
  
  if (override) {
    displayName = override.name;
    waId = override.waId;
  } else {
    // Extract name from various WAHA payload formats - prefer _data.Info.PushName
    displayName = payload._data?.Info?.PushName || 
                  payload._data?.Info?.VerifiedName?.Details?.verifiedName ||
                  payload.notifyName || payload.pushName || phone;
    
    // Check if we have a synced WhatsApp contact name (from user's phone contacts)
    if (!isGroup) {
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
    }
    
    // Get the real WhatsApp ID
    waId = payload._data?.Info?.SenderAlt || payload.from || `${phone}@s.whatsapp.net`;
  }
  
  console.log(`[Webhook] Contact info - phone: ${phone}, name: ${displayName}, waId: ${waId}, isGroup: ${isGroup}`);
  
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
  
  console.log(`[Webhook] New contact created: ${phone} (isGroup: ${isGroup})`);
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
