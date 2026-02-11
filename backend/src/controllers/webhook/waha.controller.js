const pool = require('../../config/database');
const { getSocketManager } = require('../../services/socket/manager.service');
const botEngine = require('../../services/botEngine.service');
const groupForwardsTrigger = require('../../services/groupForwards/trigger.service');
const wahaSession = require('../../services/waha/session.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');

// In-memory cache: callId -> { callerPhone, userId, isVideo, isGroup, timestamp }
// Used to resolve caller phone for call.rejected/call.accepted events
// (only call.received has the real phone number)
const callCache = new Map();

// Clean old entries every 5 minutes (keep calls for max 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [callId, data] of callCache.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      callCache.delete(callId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Resolve LID to real phone number
 * First checks the DB mapping table, then calls WAHA API
 * @param {string} userId - User ID
 * @param {string} lid - LID identifier (with or without @lid suffix)
 * @returns {string|null} Phone number or null
 */
async function resolveLidToPhone(userId, lid) {
  if (!lid) return null;
  
  const cleanLid = lid.replace('@lid', '');
  
  // 1. Check DB mapping table first (fast)
  try {
    const dbResult = await pool.query(
      `SELECT phone FROM whatsapp_lid_mapping WHERE user_id = $1 AND lid = $2 LIMIT 1`,
      [userId, cleanLid]
    );
    if (dbResult.rows.length > 0 && dbResult.rows[0].phone) {
      console.log(`[Webhook] LID ${cleanLid} resolved from DB -> ${dbResult.rows[0].phone}`);
      return dbResult.rows[0].phone;
    }
  } catch (dbErr) {
    // Table may not exist yet - continue to API
  }
  
  // 2. Call WAHA API to resolve
  try {
    const connResult = await pool.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' ORDER BY connected_at DESC LIMIT 1`,
      [userId]
    );
    
    if (connResult.rows.length > 0) {
      const conn = connResult.rows[0];
      let baseUrl, apiKey;
      
      if (conn.connection_type === 'external') {
        baseUrl = decrypt(conn.external_base_url);
        apiKey = decrypt(conn.external_api_key);
      } else {
        const systemCreds = getWahaCredentials();
        baseUrl = systemCreds.baseUrl;
        apiKey = systemCreds.apiKey;
      }
      
      const connection = {
        base_url: baseUrl,
        api_key: apiKey,
        session_name: conn.session_name
      };
      
      const phone = await wahaSession.resolveLid(connection, cleanLid);
      
      if (phone) {
        // Save to DB for future lookups
        try {
          await pool.query(`
            INSERT INTO whatsapp_lid_mapping (user_id, lid, phone, display_name, updated_at)
            VALUES ($1, $2, $3, '', NOW())
            ON CONFLICT (user_id, lid) DO UPDATE SET phone = $3, updated_at = NOW()
          `, [userId, cleanLid, phone]);
        } catch (saveErr) {
          // Ignore save errors
        }
        
        return phone;
      }
    }
  } catch (apiErr) {
    console.log(`[Webhook] LID API resolution failed for ${cleanLid}:`, apiErr.message);
  }
  
  return null;
}

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
  
  return uniqueCandidates[0];
}

// Track which users already had their webhook events updated (per process lifetime)
const webhookUpdatedUsers = new Set();

/**
 * Auto-update webhook events for existing connections
 * Runs once per user when session.status WORKING is received
 */
async function autoUpdateWebhookEvents(userId) {
  if (webhookUpdatedUsers.has(userId)) return;
  webhookUpdatedUsers.add(userId);
  
  try {
    const connResult = await pool.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' ORDER BY connected_at DESC LIMIT 1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) return;
    
    const conn = connResult.rows[0];
    let baseUrl, apiKey;
    
    if (conn.connection_type === 'external') {
      baseUrl = decrypt(conn.external_base_url);
      apiKey = decrypt(conn.external_api_key);
    } else {
      const systemCreds = getWahaCredentials();
      baseUrl = systemCreds.baseUrl;
      apiKey = systemCreds.apiKey;
    }
    
    const REQUIRED_EVENTS = [
      'message', 'message.ack', 'session.status', 'call.received', 'call.accepted', 'call.rejected',
      'label.upsert', 'label.deleted', 'label.chat.added', 'label.chat.deleted',
      'poll.vote.failed', 'poll.vote', 'group.leave', 'group.join', 'group.v2.participants',
      'group.v2.update', 'group.v2.leave', 'group.v2.join', 'presence.update', 'message.reaction',
      'message.any', 'message.ack.group', 'message.waiting', 'message.revoked', 'message.edited',
      'chat.archive', 'event.response', 'event.response.failed',
    ];
    
    const appUrl = process.env.APP_URL || 'https://botomat.co.il';
    const webhookUrl = `${appUrl}/api/webhook/waha/${userId}`;
    
    await wahaSession.addWebhook(baseUrl, apiKey, conn.session_name, webhookUrl, REQUIRED_EVENTS);
    console.log(`[Webhook] Auto-updated webhook events for user ${userId}`);
  } catch (err) {
    console.log(`[Webhook] Auto-update webhook events failed for ${userId}:`, err.message);
  }
}

/**
 * Handle incoming WAHA webhooks
 */
async function handleWebhook(req, res) {
  try {
    const { userId } = req.params;
    const event = req.body;
    
    // Quick check if user exists (skip for frequent events to reduce DB load)
    const silentEvents = [
      'message', 'message.ack', 'message.any', 'message.reaction', 'message.ack.group',
      'message.waiting', 'message.revoked', 'message.edited', 'poll.vote', 'poll.vote.failed', 
      'call.received', 'call.rejected', 'call.accepted', 'presence.update'
    ];
    if (!silentEvents.includes(event.event)) {
      console.log(`[Webhook] User: ${userId}, Event: ${event.event}`);
    }
    
    // Auto-update webhook events for existing connections (runs once per user)
    if (event.event === 'session.status' && event.payload?.status === 'WORKING') {
      autoUpdateWebhookEvents(userId).catch(err => 
        console.log('[Webhook] Auto-update events skipped:', err.message)
      );
    }
    
    // Handle different event types
    switch (event.event) {
      case 'message':
        await handleIncomingMessage(userId, event);
        break;
      case 'message.any':
        // message.any fires for BOTH incoming and outgoing messages
        // We only use it to capture outgoing status posts (fromMe on status@broadcast)
        // Incoming messages are already handled by 'message' event - don't double-process
        if (event.payload?.fromMe && event.payload?.from === 'status@broadcast') {
          await ensureMigrations();
          await saveUserStatus(userId, event.payload);
        }
        break;
      case 'message.ack':
        await handleMessageAck(userId, event);
        break;
      case 'message.reaction':
        await handleMessageReaction(userId, event);
        break;
      case 'session.status':
        await handleSessionStatus(userId, event);
        break;
      case 'group.v2.participants':
        await handleGroupParticipants(userId, event);
        break;
      case 'call.received':
      case 'call.rejected':
      case 'call.accepted':
        await handleCallEvent(userId, event);
        break;
      case 'poll.vote':
        await handlePollVote(userId, event);
        break;
      default:
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
    // Create user_statuses table for tracking posted statuses (used for specific status triggers)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_statuses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wa_message_id VARCHAR(255) NOT NULL,
        message_type VARCHAR(20) NOT NULL DEFAULT 'text',
        content TEXT,
        media_url TEXT,
        media_mime_type VARCHAR(50),
        posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, wa_message_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_statuses_user ON user_statuses(user_id, posted_at DESC)`);
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
 * Save user's posted status for later matching with specific status triggers
 */
async function saveUserStatus(userId, payload) {
  try {
    await ensureMigrations();
    
    // Normalize message ID - ensure consistent format regardless of event source
    let waMessageId = '';
    if (typeof payload.id === 'string') {
      waMessageId = payload.id;
    } else if (payload.id?._serialized) {
      waMessageId = payload.id._serialized;
    } else if (payload.id?.id) {
      // Build consistent serialized format: fromMe_remote_id
      waMessageId = `${payload.id.fromMe ? 'true' : 'false'}_${payload.id.remote || 'status@broadcast'}_${payload.id.id}`;
    }
    if (!waMessageId) return;
    
    // Parse the status content
    const messageData = parseMessage(payload);
    const postedAt = payload.timestamp ? new Date(payload.timestamp * 1000) : new Date();
    
    console.log(`[Status] Saving: id=${waMessageId}, detected_type=${messageData.type}, payload.type=${payload.type}, MediaType=${payload._data?.Info?.MediaType || 'N/A'}, hasMedia=${payload.hasMedia || false}`);
    
    await pool.query(`
      INSERT INTO user_statuses (user_id, wa_message_id, message_type, content, media_url, media_mime_type, posted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, wa_message_id) DO UPDATE SET
        message_type = COALESCE(NULLIF(EXCLUDED.message_type, 'text'), user_statuses.message_type),
        content = COALESCE(NULLIF(EXCLUDED.content, ''), user_statuses.content),
        media_url = COALESCE(EXCLUDED.media_url, user_statuses.media_url),
        media_mime_type = COALESCE(EXCLUDED.media_mime_type, user_statuses.media_mime_type)
    `, [userId, waMessageId, messageData.type, messageData.content || '', messageData.mediaUrl || null, messageData.mimeType || null, postedAt]);
    
    // Clean up old statuses (older than 48 hours) - keep a bit more than 24h for safety
    await pool.query(
      `DELETE FROM user_statuses WHERE user_id = $1 AND posted_at < NOW() - INTERVAL '48 hours'`,
      [userId]
    );
  } catch (err) {
    console.log('[Status] Save error:', err.message);
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
  
  // Handle status updates - skip here, statuses are saved via message.any event only
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
    contactName = payload._data?.Info?.Subject ||  // Group subject
                  payload._data?.subject ||  // Direct subject field
                  payload._data?.chatInfo?.subject || // Alternative location
                  payload._data?.chat?.name || // Chat name
                  payload._data?.chat?.subject || // Chat subject
                  payload._data?.groupMetadata?.subject || // Group metadata
                  payload.chatName || // WAHA chat name field
                  null;
    
    // Don't use notifyName for groups - that's the sender's name, not the group name
    
    // If we couldn't get the name from payload, try DB first (faster than API)
    if (!contactName || contactName === groupId.split('@')[0]) {
      const existingGroup = await pool.query(
        `SELECT display_name FROM contacts WHERE user_id = $1 AND phone = $2`,
        [userId, groupId]
      );
      
      if (existingGroup.rows.length > 0 && existingGroup.rows[0].display_name && existingGroup.rows[0].display_name !== 'קבוצה') {
        contactName = existingGroup.rows[0].display_name;
      }
    }
    
    // If still no name, fetch from WAHA API
    if (!contactName || contactName === groupId.split('@')[0]) {
      try {
        const connResult = await pool.query(
          `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' ORDER BY connected_at DESC LIMIT 1`,
          [userId]
        );
        
        if (connResult.rows.length > 0) {
          const conn = connResult.rows[0];
          let baseUrl, apiKey;
          
          if (conn.connection_type === 'external') {
            baseUrl = decrypt(conn.external_base_url);
            apiKey = decrypt(conn.external_api_key);
          } else {
            const systemCreds = getWahaCredentials();
            baseUrl = systemCreds.baseUrl;
            apiKey = systemCreds.apiKey;
          }
          
          const groupInfo = await wahaSession.getGroupInfo({
            base_url: baseUrl,
            api_key: apiKey,
            session_name: conn.session_name
          }, groupId);
          
          if (groupInfo) {
            const resolvedName = groupInfo.subject || groupInfo.name || groupInfo.Name || groupInfo.title || null;
            if (resolvedName) {
              contactName = resolvedName;
              // Got name from API
            } else {
              // No name found in API response
            }
          }
        }
      } catch (groupError) {
        console.log(`[Webhook] Could not fetch group info: ${groupError.message}`);
      }
    }
    
    // Final fallback - set "קבוצה" and trigger background sync
    if (!contactName) {
      contactName = 'קבוצה';
      
      // Trigger background sync to get the real group names
      const recentSync = await pool.query(`
        SELECT 1 FROM contacts 
        WHERE user_id = $1 AND updated_at > NOW() - INTERVAL '5 minutes'
        LIMIT 1
      `, [userId]);
      
      if (recentSync.rows.length === 0) {
        try {
          const connResult = await pool.query(
            `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' ORDER BY connected_at DESC LIMIT 1`,
            [userId]
          );
          
          if (connResult.rows.length > 0) {
            const conn = connResult.rows[0];
            let baseUrl, apiKey;
            
            if (conn.connection_type === 'external') {
              baseUrl = decrypt(conn.external_base_url);
              apiKey = decrypt(conn.external_api_key);
            } else {
              const systemCreds = getWahaCredentials();
              baseUrl = systemCreds.baseUrl;
              apiKey = systemCreds.apiKey;
            }
            
            console.log(`[Webhook] Triggering background contacts/groups sync for user ${userId}`);
            wahaSession.syncContactsAndGroups({
              base_url: baseUrl,
              api_key: apiKey,
              session_name: conn.session_name
            }, userId, pool).then(results => {
              console.log(`[Webhook] Background sync complete: ${results.groupsUpdated} groups, ${results.contactsUpdated} contacts`);
            }).catch(err => {
              console.error(`[Webhook] Background sync error:`, err.message);
            });
          }
        } catch (syncError) {
          console.error(`[Webhook] Could not trigger background sync:`, syncError.message);
        }
      } else {
        // Recently synced, skip
      }
    }
    
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
  
  // THIRD: Check if this is a DIRECT reply to a status (status_reply event)
  // Only for direct messages (not groups), only when sender phone is known
  // Important: Only the first reply to a status counts. If the bot responds and the user
  // replies to the bot's message, that's a regular message - NOT a status reply.
  try {
    if (!payload.fromMe && !isGroupMessage && senderPhone) {
      // Get contextInfo from ALL possible message types
      const msg = payload._data?.Message || {};
      const contextInfo = msg.extendedTextMessage?.contextInfo ||
                          msg.imageMessage?.contextInfo ||
                          msg.videoMessage?.contextInfo ||
                          msg.audioMessage?.contextInfo ||
                          msg.documentMessage?.contextInfo ||
                          msg.stickerMessage?.contextInfo ||
                          msg.conversation?.contextInfo ||
                          null;
      
      // Check multiple possible indicators that this is a status reply
      // Note: WAHA uses camelCase with uppercase: remoteJID, stanzaID
      const quotedRemoteJid = contextInfo?.remoteJID || contextInfo?.remoteJid || '';
      const entryPoint = contextInfo?.entryPointConversionSource || '';
      
      // Status reply indicators:
      // 1. contextInfo.remoteJID === 'status@broadcast'
      // 2. entryPointConversionSource === 'status'
      const isStatusReply = quotedRemoteJid === 'status@broadcast' || entryPoint === 'status';
      
      if (isStatusReply) {
        // stanzaID is the hex portion that matches part of the full wa_message_id
        const statusStanzaId = contextInfo?.stanzaID || contextInfo?.stanzaId || '';
        console.log(`[Webhook] Status reply detected from ${senderPhone} (remoteJID: ${quotedRemoteJid}, entryPoint: ${entryPoint}, stanzaID: ${statusStanzaId})`);
        await botEngine.processEvent(userId, senderPhone, 'status_reply', {
          message: messageData.content,
          messageType: messageData.type,
          statusMessageId: statusStanzaId
        });
      }
    }
  } catch (statusReplyErr) {
    console.log('[Webhook] Status reply detection error:', statusReplyErr.message);
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
  // Also check _data.Info.MediaType which WAHA go uses for media type indication
  const mediaType = payload._data?.Info?.MediaType;
  const hasMedia = payload.hasMedia || payload.media || payload._data?.Message?.imageMessage || 
                   payload._data?.Message?.videoMessage || payload._data?.Message?.audioMessage ||
                   (mediaType && mediaType !== 'list_response');
  
  // Get media URL from various WAHA formats
  const getMediaUrl = () => {
    return payload.mediaUrl || payload.media?.url || payload.media?.link;
  };
  
  // Image - check multiple indicators including WAHA go MediaType
  if (payload.type === 'image' || mediaType === 'image' || payload._data?.Message?.imageMessage || 
      (hasMedia && payload.mimetype?.startsWith('image/'))) {
    const imageMsg = payload._data?.Message?.imageMessage;
    return {
      type: 'image',
      content: payload.caption || imageMsg?.caption || body || '',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || imageMsg?.mimetype,
    };
  }
  
  // Video - check multiple indicators including WAHA go MediaType
  if (payload.type === 'video' || mediaType === 'video' || payload._data?.Message?.videoMessage ||
      (hasMedia && payload.mimetype?.startsWith('video/'))) {
    const videoMsg = payload._data?.Message?.videoMessage;
    return {
      type: 'video',
      content: payload.caption || videoMsg?.caption || body || '',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || videoMsg?.mimetype,
    };
  }
  
  // Audio/Voice - check multiple indicators including WAHA go MediaType
  if (payload.type === 'audio' || payload.type === 'ptt' || 
      mediaType === 'audio' || mediaType === 'ptt' ||
      payload._data?.Message?.audioMessage ||
      (hasMedia && payload.mimetype?.startsWith('audio/'))) {
    const audioMsg = payload._data?.Message?.audioMessage;
    return {
      type: 'audio',
      mediaUrl: getMediaUrl(),
      mimeType: payload.mimetype || audioMsg?.mimetype,
    };
  }
  
  // Document - check including WAHA go MediaType
  if (payload.type === 'document' || mediaType === 'document' || payload._data?.Message?.documentMessage) {
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
  
  // Detect status events (ack on status@broadcast with fromMe: true)
  if (payload.from === 'status@broadcast' && payload.fromMe === true) {
    const statusMsgId = payload.id?._serialized || payload.id;
    
    // Status saving is handled by message.any event only (no fallback here to avoid duplicates)
    
    // Detect status view (ack=3 READ means someone viewed our status)
    if (ackLevel >= 3) {
      const viewerRaw = payload.participant || payload.to;
      if (viewerRaw) {
        let phone = null;
        
        if (viewerRaw.endsWith('@lid')) {
          phone = await resolveLidToPhone(userId, viewerRaw);
        }
        if (!phone) {
          phone = viewerRaw.replace('@s.whatsapp.net', '').replace('@c.us', '');
        }
        
        try {
          await botEngine.processEvent(userId, phone, 'status_viewed', {
            messageId: statusMsgId,
            ackName: payload.ackName
          });
        } catch (err) {
          console.error('[Webhook] Status view trigger error:', err.message);
        }
      }
    }
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

/**
 * Handle message reactions (including status reactions/likes)
 */
async function handleMessageReaction(userId, event) {
  try {
    const { payload } = event;
    const isStatusReaction = payload.from === 'status@broadcast';
    
    if (isStatusReaction) {
      // Only trigger when SOMEONE ELSE reacts to YOUR status (fromMe: false)
      // Skip when YOU react to someone else's status (fromMe: true)
      if (payload.fromMe) {
        return;
      }
      
      // Status reaction (like/heart on status)
      const rawPhone = payload.participant || payload.to || '';
      let reactorPhone = null;
      
      if (rawPhone.endsWith('@lid')) {
        reactorPhone = await resolveLidToPhone(userId, rawPhone);
      }
      if (!reactorPhone) {
        reactorPhone = rawPhone.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
      }
      
      const reactionText = payload.reaction?.text || '';
      
      const reactionMsgId = payload.reaction?.messageId || payload.reaction?.id?._serialized || payload.reaction?.id || '';
      
      console.log(`[Webhook] Status reaction from ${reactorPhone}: ${reactionText}`);
      console.log(`[Webhook] Status reaction messageId: ${reactionMsgId}`);
      console.log(`[Webhook] Status reaction payload.reaction keys: ${JSON.stringify(Object.keys(payload.reaction || {}))}`);
      
      // Trigger bot engine with special event type
      await botEngine.processEvent(userId, reactorPhone, 'status_reaction', {
        reaction: reactionText,
        messageId: reactionMsgId,
        fromMe: payload.fromMe
      });
    }
    // Non-status reactions can be handled here in the future
  } catch (error) {
    console.error('[Webhook] Reaction handler error:', error.message);
  }
}

/**
 * Handle group participant events (join/leave)
 */
async function handleGroupParticipants(userId, event) {
  try {
    const { payload } = event;
    const groupId = payload.group?.id;
    const eventType = payload.type; // 'join' or 'leave'
    const participants = payload.participants || [];
    
    console.log(`[Webhook] Group ${eventType} in ${groupId}: ${participants.length} participants`);
    
    for (const participant of participants) {
      // Resolve phone - try multiple sources
      let phone = null;
      
      // Best source: SenderPN has real phone for the action performer
      if (payload._data?.SenderPN) {
        phone = payload._data.SenderPN.replace('@s.whatsapp.net', '').replace('@c.us', '');
      }
      
      // If participant ID has real phone format
      if (!phone && participant.id && !participant.id.endsWith('@lid')) {
        phone = participant.id.replace('@s.whatsapp.net', '').replace('@c.us', '');
      }
      
      // Resolve LID via DB/API
      if (!phone && participant.id && participant.id.endsWith('@lid')) {
        phone = await resolveLidToPhone(userId, participant.id);
      }
      
      // Last resort: skip if still no phone
      if (!phone) {
        console.log(`[Webhook] Group ${eventType}: could not resolve phone for participant ${participant.id}, skipping`);
        continue;
      }
      
      const triggerType = eventType === 'join' ? 'group_join' : 'group_leave';
      
      await botEngine.processEvent(userId, phone, triggerType, {
        groupId,
        participantId: participant.id,
        participantRole: participant.role,
        senderPhone: payload._data?.SenderPN?.replace('@s.whatsapp.net', '') || null,
        notify: payload._data?.Notify || null
      });
    }
  } catch (error) {
    console.error('[Webhook] Group participants handler error:', error.message);
  }
}

/**
 * Handle call events (received, rejected, accepted)
 */
async function handleCallEvent(userId, event) {
  try {
    const { payload } = event;
    const eventType = event.event; // call.received, call.rejected, call.accepted
    const isVideo = payload.isVideo || false;
    const isGroup = payload.isGroup || false;
    const callId = payload.id || payload._data?.CallID;
    
    let callerPhone = null;
    
    if (eventType === 'call.received') {
      // call.received has the real phone of the caller
      // Try CallCreatorAlt first (real phone)
      if (payload._data?.CallCreatorAlt) {
        const alt = payload._data.CallCreatorAlt;
        if (alt && alt.length > 0 && !alt.endsWith('@lid')) {
          callerPhone = alt.replace('@s.whatsapp.net', '').replace('@c.us', '');
        }
      }
      
      // Try caller_pn from offer data
      if (!callerPhone && payload._data?.Data?.Attrs?.caller_pn) {
        callerPhone = payload._data.Data.Attrs.caller_pn.replace('@s.whatsapp.net', '').replace('@c.us', '');
      }
      
      // Try from field (for call.received this is the caller)
      if (!callerPhone && payload.from && !payload.from.endsWith('@lid')) {
        callerPhone = payload.from.replace('@s.whatsapp.net', '').replace('@c.us', '');
      }
      
      // If still LID, resolve via API
      if (!callerPhone && payload.from && payload.from.endsWith('@lid')) {
        callerPhone = await resolveLidToPhone(userId, payload.from);
      }
      if (!callerPhone && payload._data?.CallCreator && payload._data.CallCreator.endsWith('@lid')) {
        callerPhone = await resolveLidToPhone(userId, payload._data.CallCreator);
      }
      
      // Cache the caller phone for later call.rejected/call.accepted events
      if (callerPhone && callId) {
        callCache.set(callId, { callerPhone, userId, isVideo, isGroup, timestamp: Date.now() });
        console.log(`[Webhook] Cached call ${callId} -> ${callerPhone}`);
      }
    } else {
      // call.rejected / call.accepted - look up from cache first
      if (callId && callCache.has(callId)) {
        const cached = callCache.get(callId);
        callerPhone = cached.callerPhone;
        console.log(`[Webhook] Resolved call ${callId} from cache -> ${callerPhone}`);
        callCache.delete(callId); // Clean up
      }
      
      // If not in cache, try CallCreatorAlt
      if (!callerPhone && payload._data?.CallCreatorAlt) {
        const alt = payload._data.CallCreatorAlt;
        if (alt && alt.length > 0 && !alt.endsWith('@lid')) {
          callerPhone = alt.replace('@s.whatsapp.net', '').replace('@c.us', '');
        }
      }
      
      // If still no phone, try resolving CallCreator LID via API
      if (!callerPhone && payload._data?.CallCreator && payload._data.CallCreator.endsWith('@lid')) {
        callerPhone = await resolveLidToPhone(userId, payload._data.CallCreator);
      }
    }
    
    // If still no phone, skip - we can't identify the caller
    if (!callerPhone) {
      console.log(`[Webhook] Call event ${eventType}: could not resolve caller phone, skipping`);
      return;
    }
    
    let triggerType;
    if (eventType === 'call.received') {
      triggerType = 'call_received';
    } else if (eventType === 'call.rejected') {
      triggerType = 'call_rejected';
    } else if (eventType === 'call.accepted') {
      triggerType = 'call_accepted';
    }
    
    console.log(`[Webhook] Call event: ${triggerType} from ${callerPhone}, video: ${isVideo}`);
    
    await botEngine.processEvent(userId, callerPhone, triggerType, {
      callId: payload.id || payload._data?.CallID,
      isVideo,
      isGroup,
      fromMe: payload.fromMe || false
    });
  } catch (error) {
    console.error('[Webhook] Call event handler error:', error.message);
  }
}

/**
 * Handle poll votes
 */
async function handlePollVote(userId, event) {
  try {
    const { payload } = event;
    
    // Get voter info - try multiple sources
    let voterPhone = null;
    const voterLid = payload.vote?.participant || payload.vote?.to;
    
    // Best source: SenderAlt has real phone
    if (payload._data?.Info?.SenderAlt) {
      const alt = payload._data.Info.SenderAlt;
      if (alt && !alt.endsWith('@lid')) {
        voterPhone = alt.replace('@s.whatsapp.net', '').replace('@c.us', '');
      }
    }
    
    // Resolve LID via DB/API
    if (!voterPhone && voterLid && voterLid.endsWith('@lid')) {
      voterPhone = await resolveLidToPhone(userId, voterLid);
    }
    
    // Non-LID fallback
    if (!voterPhone && voterLid) {
      voterPhone = voterLid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }
    
    if (!voterPhone) {
      console.log(`[Webhook] Poll vote: could not resolve voter phone, skipping`);
      return;
    }
    
    const selectedOptions = payload._data?.Votes || payload.vote?.selectedOptions || [];
    const groupId = payload._data?.Info?.Chat || payload.poll?.to;
    
    console.log(`[Webhook] Poll vote from ${voterPhone} in ${groupId}: ${selectedOptions.join(', ')}`);
    
    await botEngine.processEvent(userId, voterPhone, 'poll_vote', {
      groupId,
      selectedOptions,
      pollId: payload.poll?.id,
      pushName: payload._data?.Info?.PushName
    });
  } catch (error) {
    console.error('[Webhook] Poll vote handler error:', error.message);
  }
}

/**
 * Handle status view (detected via message.ack with status@broadcast)
 */
// Note: Status views come through message.ack when ack=3 (read) and from=status@broadcast
// This is already handled in handleMessageAck but we add special processing for bot triggers

module.exports = { handleWebhook };
