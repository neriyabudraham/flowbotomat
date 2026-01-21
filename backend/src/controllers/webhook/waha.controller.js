const pool = require('../../config/database');
const { getSocketManager } = require('../../services/socket/manager.service');

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
  
  // Skip outgoing messages and status updates
  if (payload.fromMe || payload.from === 'status@broadcast') {
    return;
  }
  
  // Extract phone number - handle different WAHA formats
  let phone = null;
  if (payload.from) {
    phone = payload.from.split('@')[0];
  } else if (payload.chatId) {
    phone = payload.chatId.split('@')[0];
  } else if (payload._data?.from) {
    phone = payload._data.from.split('@')[0];
  }
  
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
}

/**
 * Get or create contact
 */
async function getOrCreateContact(userId, phone, payload) {
  // Extract name from various WAHA payload formats
  const displayName = payload.notifyName || payload.pushName || 
                      payload._data?.notifyName || payload._data?.pushName || phone;
  const waId = payload.from || payload.chatId || `${phone}@s.whatsapp.net`;
  
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
