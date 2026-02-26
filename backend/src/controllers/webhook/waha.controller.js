const pool = require('../../config/database');
const { getSocketManager } = require('../../services/socket/manager.service');
const botEngine = require('../../services/botEngine.service');
const groupForwardsTrigger = require('../../services/groupForwards/trigger.service');
const groupTransfersTrigger = require('../../services/groupTransfers/trigger.service');
const wahaSession = require('../../services/waha/session.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { checkContactLimit } = require('../../services/limits.service');

// In-memory cache: callId -> { callerPhone, userId, isVideo, isGroup, timestamp }
// Used to resolve caller phone for call.rejected/call.accepted events
// (only call.received has the real phone number)
const callCache = new Map();

// In-memory cache for message deduplication: messageId -> timestamp
// Prevents processing the same message twice (common with media messages)
const processedMessagesCache = new Map();
const DEDUP_CACHE_TTL = 60 * 1000; // 1 minute TTL

// Clean old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [callId, data] of callCache.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      callCache.delete(callId);
    }
  }
  // Clean processed messages cache
  for (const [msgId, timestamp] of processedMessagesCache.entries()) {
    if (now - timestamp > DEDUP_CACHE_TTL) {
      processedMessagesCache.delete(msgId);
    }
  }
}, 60 * 1000);

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
      let phone = fullId.split('@')[0];
      
      // Handle device suffix like "972584254229:14" - extract just the phone number
      if (phone.includes(':')) {
        phone = phone.split(':')[0];
      }
      
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
    
    // Webhook event logging disabled to reduce noise - all events are processed silently
    
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
      case 'event.response':
        // WAHA sends list/button responses through this event
        console.log('[Webhook] 📋 event.response received:', JSON.stringify(event, null, 2));
        // Try to handle it as a message
        if (event.payload) {
          await handleIncomingMessage(userId, event);
        }
        break;
      default:
        // Log unknown events to help debug
        if (event.event && !['presence.update', 'chat.archive', 'message.waiting', 'message.revoked', 'message.edited', 'message.ack.group'].includes(event.event)) {
          console.log('[Webhook] Unhandled event type:', event.event);
        }
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
  
  // Extract message ID for deduplication
  let messageId = '';
  if (typeof payload.id === 'string') {
    messageId = payload.id;
  } else if (payload.id?._serialized) {
    messageId = payload.id._serialized;
  } else if (payload.id?.id) {
    messageId = `${payload.id.fromMe ? 'true' : 'false'}_${payload.id.remote || ''}_${payload.id.id}`;
  }
  
  // Deduplication check - prevent processing same message twice (common with media)
  if (messageId) {
    const dedupKey = `${userId}_${messageId}`;
    if (processedMessagesCache.has(dedupKey)) {
      console.log(`[Webhook] ⏭️ Skipping duplicate message: ${messageId.substring(0, 30)}...`);
      return;
    }
    processedMessagesCache.set(dedupKey, Date.now());
  }
  
  // Ensure migrations are applied
  await ensureMigrations();
  
  // Verify user exists before processing
  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) {
    console.log(`[Webhook] Skipping message - user ${userId} not found (possibly deleted)`);
    // TODO: Consider cleaning up orphaned WhatsApp connections
    return;
  }
  
  // Handle status updates - skip here, statuses are saved via message.any event only
  if (payload.from === 'status@broadcast') {
    return;
  }
  
  // Handle outgoing messages (sent from device, not from bot)
  if (payload.fromMe) {
    await handleOutgoingDeviceMessage(userId, payload);
    return;
  }
  
  // Determine if this is a group message or channel message
  const chatId = payload.from || payload.chatId;
  const isGroupMessage = chatId?.includes('@g.us') || false;
  const groupId = isGroupMessage ? chatId : null;
  
  // Detect channel (newsletter) messages
  const isChannelMessage = chatId?.includes('@newsletter') || false;
  const channelId = isChannelMessage ? chatId : null;
  
  // Channel message logging disabled to reduce noise
  
  // Extract entry point info for Facebook campaigns and other sources
  const msg = payload._data?.Message || {};
  const contextInfo = msg.extendedTextMessage?.contextInfo ||
                      msg.imageMessage?.contextInfo ||
                      msg.videoMessage?.contextInfo ||
                      msg.audioMessage?.contextInfo ||
                      msg.documentMessage?.contextInfo ||
                      msg.stickerMessage?.contextInfo ||
                      msg.conversation?.contextInfo ||
                      payload._data?.contextInfo ||
                      null;
  
  const entryPointSource = contextInfo?.entryPointConversionSource || '';
  const externalAdReply = contextInfo?.externalAdReply || null;
  
  // Entry point logging disabled to reduce noise
  
  // Extract sender's phone number and name
  let senderPhone = extractRealPhone(payload);
  const senderName = payload._data?.Info?.PushName || 
                     payload._data?.Info?.VerifiedName?.Details?.verifiedName ||
                     payload.notifyName || payload.pushName || null;
  
  // Store LID to phone mapping if we have both
  const senderLid = payload._data?.Info?.SenderAlt || payload._data?.Info?.Sender || payload.from;
  
  // Debug: log what we got for senderLid
  // Reduced logging - only log when there's something interesting
  
  if (senderLid && senderLid.includes('@lid') && senderPhone) {
    const lidOnly = senderLid.split('@')[0];
    await storeLidMapping(userId, lidOnly, senderPhone, senderName);
  }
  
  // If no phone extracted but we have a LID, try to resolve it
  if (!senderPhone && senderLid && senderLid.includes('@lid')) {
    const lidOnly = senderLid.split('@')[0];
    console.log(`[Webhook] 🔍 No phone found, attempting LID resolution for: ${lidOnly}`);
    try {
      const resolvedPhone = await resolveLidToPhone(userId, lidOnly);
      if (resolvedPhone) {
        senderPhone = resolvedPhone;
        // LID resolved successfully
      } else {
        console.log(`[Webhook] ⚠️ Could not resolve LID to phone - message may not be processed`);
      }
    } catch (lidErr) {
      console.log(`[Webhook] ❌ LID resolution error: ${lidErr.message}`);
    }
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
      
      if (existingGroup.rows.length > 0 && existingGroup.rows[0].display_name) {
        contactName = existingGroup.rows[0].display_name;
      }
    }
    
    // Check if existing name looks like just an ID (numeric only) - treat as no name
    const numericGroupId = groupId.split('@')[0];
    const existingNameIsJustId = contactName && /^\d+$/.test(contactName);
    
    // If still no name (or name is just numeric ID), fetch from WAHA groups API
    if (!contactName || contactName === numericGroupId || existingNameIsJustId) {
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
          
          const axios = require('axios');
          
          // Try specific group endpoint first (faster)
          try {
            const groupResponse = await axios.get(
              `${baseUrl}/api/${conn.session_name}/groups/${encodeURIComponent(groupId)}`,
              {
                headers: { 'accept': 'application/json', 'X-Api-Key': apiKey },
                timeout: 5000
              }
            );
            
            const groupData = groupResponse.data;
            if (groupData) {
              const resolvedName = groupData.subject || groupData.name || groupData.Name || null;
              if (resolvedName && resolvedName !== numericGroupId && !/^\d+$/.test(resolvedName)) {
                contactName = resolvedName;
                console.log(`[Webhook] Fetched group name: ${resolvedName} for ${groupId}`);
                
                // Also update existing contact if it has a bad name
                await pool.query(
                  `UPDATE contacts SET display_name = $1, updated_at = NOW() 
                   WHERE user_id = $2 AND phone = $3 
                   AND (display_name IS NULL OR display_name ~ '^[0-9]+$' OR display_name = $4)`,
                  [resolvedName, userId, groupId, numericGroupId]
                );
              }
            }
          } catch (specificError) {
            // Specific endpoint failed, try fetching all groups
            console.log(`[Webhook] Specific group fetch failed, trying all groups: ${specificError.message}`);
            
            const groupsResponse = await axios.get(
              `${baseUrl}/api/${conn.session_name}/groups`,
              {
                headers: { 'accept': 'application/json', 'X-Api-Key': apiKey },
                timeout: 10000
              }
            );
            
            const groups = groupsResponse.data || [];
            const matchingGroup = groups.find(g => g.id === groupId);
            if (matchingGroup) {
              const resolvedName = matchingGroup.subject || matchingGroup.name || matchingGroup.Name || null;
              if (resolvedName && resolvedName !== numericGroupId && !/^\d+$/.test(resolvedName)) {
                contactName = resolvedName;
                console.log(`[Webhook] Fetched group name from list: ${resolvedName} for ${groupId}`);
                
                // Also update existing contact if it has a bad name
                await pool.query(
                  `UPDATE contacts SET display_name = $1, updated_at = NOW() 
                   WHERE user_id = $2 AND phone = $3 
                   AND (display_name IS NULL OR display_name ~ '^[0-9]+$' OR display_name = $4)`,
                  [resolvedName, userId, groupId, numericGroupId]
                );
              }
            }
          }
        }
      } catch (groupError) {
        console.log(`[Webhook] Could not fetch group info: ${groupError.message}`);
      }
    }
    
    // No fallback - contactName will be null if not found (frontend will show clean ID)
    
  } else if (isChannelMessage) {
    // Channel message: contact is the CHANNEL itself
    contactPhone = channelId;  // e.g., "120363288101086546@newsletter"
    contactWaId = channelId;
    
    // Get channel name from payload - try multiple sources
    contactName = payload._data?.Info?.Subject ||
                  payload._data?.Info?.VerifiedName?.Details?.verifiedName ||
                  payload._data?.NewsletterMeta?.name ||
                  payload.notifyName || payload.pushName || null;
    
    // If we couldn't get the name from payload, try DB first (faster than API)
    if (!contactName || contactName === channelId.split('@')[0]) {
      const existingChannel = await pool.query(
        `SELECT display_name FROM contacts WHERE user_id = $1 AND phone = $2`,
        [userId, channelId]
      );
      
      if (existingChannel.rows.length > 0 && existingChannel.rows[0].display_name) {
        contactName = existingChannel.rows[0].display_name;
      }
    }
    
    // If still no name, fetch from WAHA channels API (specific channel endpoint)
    if (!contactName || contactName === channelId.split('@')[0]) {
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
          
          // Fetch specific channel by ID
          const axios = require('axios');
          const channelResponse = await axios.get(
            `${baseUrl}/api/${conn.session_name}/channels/${encodeURIComponent(channelId)}`,
            {
              headers: { 'accept': 'application/json', 'X-Api-Key': apiKey },
              timeout: 5000
            }
          );
          
          const channelData = channelResponse.data;
          if (channelData && channelData.name) {
            contactName = channelData.name;
          }
        }
      } catch (channelError) {
        console.log(`[Webhook] Could not fetch channel info: ${channelError.message}`);
      }
    }
    
    // No fallback - contactName will be null if not found (will use phone as display)
    
  } else {
    // Direct message: contact is the sender
    contactPhone = senderPhone;
    contactWaId = payload._data?.Info?.SenderAlt || payload.from || `${senderPhone}@s.whatsapp.net`;
    contactName = senderName || senderPhone;
  }
  
  if (!contactPhone) {
    console.log('[Webhook] Could not extract contact identifier - chatId:', chatId, 'senderPhone:', senderPhone);
    return;
  }
  
  // Get or create contact (group, channel, or individual)
  const contact = await getOrCreateContact(userId, contactPhone, {
    ...payload,
    _contactOverride: {
      name: contactName,
      waId: contactWaId,
      isGroup: isGroupMessage,
      isChannel: isChannelMessage
    }
  });
  
  // If contact is null, it means the user is over their contact limit
  // Skip processing this message entirely for new contacts
  if (!contact) {
    console.log(`[Webhook] ⛔ Skipping message from ${contactPhone} - user over contact limit`);
    return;
  }
  
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
     isGroupMessage ? (senderPhone || '').substring(0, 50) || null : null,
     isGroupMessage ? (senderName || '').substring(0, 50) || null : null]
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
  
  // For group forwards and bot engine:
  // - Groups: use the SENDER's phone (not the group ID)
  // - Channels: use the channel ID (channels don't have sender phone)
  // - Direct: use the sender's phone
  const phoneForProcessing = isChannelMessage ? channelId : senderPhone;
  
  try {
    // First check if this is a confirmation response for pending job
    const wasConfirmation = await groupForwardsTrigger.handleConfirmationResponse(
      userId, 
      phoneForProcessing, 
      messageData.content,
      messageData.selectedRowId // Button ID if clicked
    );
    
    if (wasConfirmation) {
      // Forward confirmation handled
      handledByForwards = true;
    } else {
      // Skip forward triggering for list_response messages
      // These should only be handled as confirmations, not as new triggers
      const isListResponse = messageData.type === 'list_response' || 
                             payload._data?.Info?.MediaType === 'list_response' ||
                             payload._data?.Message?.listResponseMessage;
      
      if (!isListResponse) {
        // Check if this triggers a group forward (from authorized sender)
        const forwardTriggered = await groupForwardsTrigger.processMessageForForwards(
          userId,
          phoneForProcessing,
          messageData,
          chatId,
          payload
        );
        
        if (forwardTriggered) {
          // Forward trigger handled
          handledByForwards = true;
        }
      } else {
        // Skipping forward trigger for list_response
      }
    }
  } catch (forwardError) {
    console.error('[Webhook] Group forwards trigger error:', forwardError);
  }
  
  // Check for Group Transfers (bidirectional group-to-group forwarding)
  // Only for group messages that weren't handled by forwards
  if (isGroupMessage && !handledByForwards) {
    try {
      const transfers = await groupTransfersTrigger.checkForTransferTrigger(userId, groupId, senderPhone);
      
      if (transfers.length > 0) {
        // Group message triggers transfers
        
        // Process each transfer in parallel
        for (const transfer of transfers) {
          // Don't await - let it run in background
          // senderName is already extracted at line ~505 from the message payload
          // It contains the actual sender's PushName, not the group name
          // senderLid is used for WhatsApp mention (@mention) if available
          // Transfer processing
          
          groupTransfersTrigger.processGroupMessage({
            userId,
            transfer,
            sourceGroupId: groupId,
            senderPhone,
            senderName,
            senderLid: senderLid?.replace('@lid', '') || null,
            messageType: messageData.type,
            messageContent: messageData.content,
            mediaUrl: messageData.mediaUrl,
            mediaBase64: messageData.mediaBase64,
            mediaFilename: messageData.filename,
            mediaMimeType: messageData.mediaMimeType,
            latitude: messageData.latitude,
            longitude: messageData.longitude,
            messageId: payload.id?._serialized || (payload.id?.id ? `false_${groupId}_${payload.id.id}` : null)
          }).catch(err => {
            console.error(`[Webhook] Transfer "${transfer.name}" failed:`, err.message);
          });
        }
        
        // Don't mark as handled - allow bot engine to still process if needed
      }
    } catch (transferError) {
      console.error('[Webhook] Group transfers trigger error:', transferError);
    }
  }
  
  // SECOND: Process with bot engine ONLY if not handled by forwards
  if (!handledByForwards) {
    try {
      // Channel name was already fetched earlier during contact creation
      // Use contactName which has the resolved channel name from API
      const channelName = isChannelMessage ? contactName : null;
      
      // Get bot's phone number from the connection
      let botPhoneNumber = null;
      try {
        const connResult = await pool.query(
          `SELECT phone_number FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' ORDER BY connected_at DESC LIMIT 1`,
          [userId]
        );
        if (connResult.rows.length > 0) {
          botPhoneNumber = connResult.rows[0].phone_number;
        }
      } catch (e) {
        // Ignore - phone_bot will be empty
      }
      
      // Determine if this message has media
      const hasMedia = ['image', 'video', 'audio', 'document', 'sticker'].includes(messageData.type);
      
      await botEngine.processMessage(
        userId, 
        phoneForProcessing, 
        messageData.content, 
        messageData.type, 
        messageData.selectedRowId,
        messageData.quotedListTitle, // Pass the original list title for verification
        isGroupMessage, // Pass whether this is a group message
        groupId, // Pass the group ID if it's a group message
        {
          isChannel: isChannelMessage,
          channelId,
          channelName,
          botPhoneNumber,
          // Facebook campaign / ad entry point info
          entryPointSource,
          externalAdReply,
          // Media info
          hasMedia,
          mediaUrl: messageData.mediaUrl || null,
          mediaType: hasMedia ? messageData.type : null
        }
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
      
      // Status reply indicator: ONLY when the message directly quotes a status broadcast
      // entryPointConversionSource === 'status' is NOT reliable - WhatsApp keeps it
      // on ALL subsequent messages in a conversation initiated from status
      const isStatusReply = quotedRemoteJid === 'status@broadcast';
      
      if (isStatusReply) {
        // stanzaID is the hex portion that matches part of the full wa_message_id
        const statusStanzaId = contextInfo?.stanzaID || contextInfo?.stanzaId || '';
        // Status reply detected
        await botEngine.processEvent(userId, senderPhone, 'status_reply', {
          message: messageData.content,
          messageType: messageData.type,
          statusMessageId: statusStanzaId
        });
        
        // Also record the reply in status_bot_replies for stats
        if (statusStanzaId) {
          try {
            // Find the status by hex ID
            const statusResult = await pool.query(`
              SELECT id FROM status_bot_statuses 
              WHERE waha_message_id LIKE $1
            `, [`%${statusStanzaId}%`]);
            
            if (statusResult.rows.length > 0) {
              const statusId = statusResult.rows[0].id;
              const replyText = messageData.type === 'text' ? messageData.content : `[${messageData.type}]`;
              
              // Insert reply (allow multiple replies from same user)
              // Use unique ID + timestamp to avoid any duplicate conflicts
              await pool.query(`
                INSERT INTO status_bot_replies (status_id, replier_phone, reply_text, replied_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT DO NOTHING
              `, [statusId, senderPhone, replyText]);
              
              // Update reply count
              await pool.query(`
                UPDATE status_bot_statuses 
                SET reply_count = (SELECT COUNT(*) FROM status_bot_replies WHERE status_id = $1)
                WHERE id = $1
              `, [statusId]);
              
              // Reply synced to status_bot
            }
          } catch (replyErr) {
            console.error('[Webhook] Error syncing status reply:', replyErr.message);
          }
        }
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
  
  // Check contact limit before creating new contact (groups don't count)
  if (!isGroup) {
    try {
      const limitCheck = await checkContactLimit(userId);
      if (!limitCheck.allowed) {
        console.log(`[Webhook] ⛔ User ${userId} over contact limit (${limitCheck.used}/${limitCheck.limit}) - NOT creating new contact`);
        return null; // Don't create contact, return null to skip processing
      }
    } catch (err) {
      console.error('[Webhook] Error checking contact limit:', err.message);
      // On error, still allow to prevent blocking legitimate users
    }
  }
  
  // Create new contact
  const result = await pool.query(
    `INSERT INTO contacts (user_id, phone, wa_id, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, phone, waId, displayName]
  );
  
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
  
  // Additional fallback: Check for listResponse in various WAHA formats
  // Some WAHA versions use different field names
  const altListResponse = payload._data?.Message?.listMessage?.listType === 2 ||
                          payload.type === 'list_response';
  if (altListResponse) {
    console.log('[Webhook] Detected alternative list response format, body:', body);
    // Try to extract rowId from body if it matches the fwd_ pattern
    if (body && body.includes('fwd_')) {
      // The body might contain the rowId directly in some WAHA formats
      const match = body.match(/(fwd_[a-z]+_\d+)/);
      if (match) {
        console.log('[Webhook] Extracted rowId from body:', match[1]);
        return {
          type: 'list_response',
          content: body,
          selectedRowId: match[1],
          quotedListTitle: null,
        };
      }
    }
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
  
  // Outgoing device message
  
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
  
  // Outgoing message saved
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
        
        // Sync view to status_bot_statuses table
        await syncStatusBotView(userId, statusMsgId, phone);
      }
    }
  }
}

/**
 * Sync status view to status_bot_views table
 */
async function syncStatusBotView(userId, waMessageId, viewerPhone) {
  try {
    if (!waMessageId || !viewerPhone || viewerPhone === 'status') return;
    
    // Try to find matching status in status_bot_statuses
    // Match by waha_message_id (try exact and partial match)
    let statusResult = await pool.query(`
      SELECT sbs.id, sbs.waha_message_id FROM status_bot_statuses sbs
      JOIN status_bot_connections sbc ON sbs.connection_id = sbc.id
      WHERE sbc.user_id = $1 AND sbs.waha_message_id = $2
    `, [userId, waMessageId]);
    
    // If not found, try partial match (extract hex ID from webhook message)
    // Format: true_status@broadcast_HEXID_972PHONE@c.us
    // Hex ID can start with 3EB or be other hex format (A51D59C0...)
    if (statusResult.rows.length === 0 && waMessageId.includes('_')) {
      const parts = waMessageId.split('_');
      // The hex ID is typically at index 2 (after "true" and "status@broadcast")
      // It's a hex string that is 20+ chars and doesn't contain @
      let hexId = null;
      for (const part of parts) {
        // Must be hex-like (alphanumeric), 20+ chars, no @, not starting with 972 (phone)
        if (part.length >= 20 && !part.includes('@') && !/^972\d/.test(part) && /^[A-F0-9]+$/i.test(part)) {
          hexId = part;
          break;
        }
      }
      if (hexId) {
        statusResult = await pool.query(`
          SELECT sbs.id, sbs.waha_message_id FROM status_bot_statuses sbs
          JOIN status_bot_connections sbc ON sbs.connection_id = sbc.id
          WHERE sbc.user_id = $1 AND sbs.waha_message_id LIKE $2
        `, [userId, `%${hexId}%`]);
      }
    }
    
    // If still not found, try reverse match - maybe our stored ID is contained in the webhook ID
    if (statusResult.rows.length === 0) {
      // Get recent statuses for this user (last 24h)
      const recentStatuses = await pool.query(`
        SELECT sbs.id, sbs.waha_message_id FROM status_bot_statuses sbs
        JOIN status_bot_connections sbc ON sbs.connection_id = sbc.id
        WHERE sbc.user_id = $1 
          AND sbs.waha_message_id IS NOT NULL 
          AND sbs.sent_at > NOW() - INTERVAL '24 hours'
        ORDER BY sbs.sent_at DESC
      `, [userId]);
      
      // Check if any stored ID is contained in the webhook message ID
      for (const row of recentStatuses.rows) {
        if (row.waha_message_id && waMessageId.includes(row.waha_message_id)) {
          statusResult = { rows: [row] };
          break;
        }
      }
    }
    
    if (statusResult.rows.length === 0) {
      return;
    }
    
    const statusId = statusResult.rows[0].id;
    
    // Insert view (ignore duplicates)
    await pool.query(`
      INSERT INTO status_bot_views (status_id, viewer_phone)
      VALUES ($1, $2)
      ON CONFLICT (status_id, viewer_phone) DO NOTHING
    `, [statusId, viewerPhone]);
    
    // Update view count
    await pool.query(`
      UPDATE status_bot_statuses 
      SET view_count = (SELECT COUNT(*) FROM status_bot_views WHERE status_id = $1)
      WHERE id = $1
    `, [statusId]);
  } catch (err) {
    // Silently fail - this is optional sync
  }
}

// Track active disconnect monitors to avoid duplicates
const activeDisconnectMonitors = new Map();

/**
 * Monitor disconnected session and apply restrictions based on reconnection time
 */
async function monitorDisconnectedSession(userId, sessionName, disconnectTime) {
  const monitorKey = `${userId}_${sessionName}`;
  
  // Already monitoring this session
  if (activeDisconnectMonitors.has(monitorKey)) {
    console.log(`[SessionMonitor] Already monitoring ${monitorKey}`);
    return;
  }
  
  activeDisconnectMonitors.set(monitorKey, { startTime: disconnectTime });
  console.log(`[SessionMonitor] 🔍 Started monitoring session ${sessionName} for user ${userId}`);
  
  const CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
  const SHORT_RESTRICTION_THRESHOLD_MS = 60000; // 1 minute
  const SHORT_RESTRICTION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  const LONG_RESTRICTION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  let checkCount = 0;
  const maxChecks = 15; // Stop after ~75 seconds
  
  const checkInterval = setInterval(async () => {
    checkCount++;
    const elapsedMs = Date.now() - disconnectTime.getTime();
    
    try {
      // Check current status from DB
      const result = await pool.query(
        `SELECT status FROM whatsapp_connections WHERE user_id = $1`,
        [userId]
      );
      
      const currentStatus = result.rows[0]?.status;
      console.log(`[SessionMonitor] Check #${checkCount} for ${userId}: status=${currentStatus}, elapsed=${Math.round(elapsedMs/1000)}s`);
      
      if (currentStatus === 'connected') {
        // Reconnected!
        clearInterval(checkInterval);
        activeDisconnectMonitors.delete(monitorKey);
        
        if (elapsedMs < SHORT_RESTRICTION_THRESHOLD_MS) {
          // Reconnected within 1 minute - apply 30 minute restriction
          console.log(`[SessionMonitor] ✅ User ${userId} reconnected within ${Math.round(elapsedMs/1000)}s - applying 30min restriction`);
          
          const restrictionEnd = new Date(Date.now() + SHORT_RESTRICTION_DURATION_MS);
          await pool.query(`
            UPDATE status_bot_connections 
            SET short_restriction_until = $1,
                updated_at = NOW()
            WHERE user_id = $2
          `, [restrictionEnd, userId]);
          
          // Emit to frontend
          const socketManager = getSocketManager();
          socketManager.emitToUser(userId, 'session_restriction', { 
            type: 'short',
            reason: 'הסשן נותק וחזר תוך דקה',
            restrictionEndsAt: restrictionEnd.toISOString(),
            durationMinutes: 30
          });
        } else {
          // Reconnected after 1 minute - no additional restriction needed
          console.log(`[SessionMonitor] ✅ User ${userId} reconnected after ${Math.round(elapsedMs/1000)}s - no restriction`);
        }
        return;
      }
      
      // Still disconnected after 1 minute - apply 24h restriction
      if (elapsedMs >= SHORT_RESTRICTION_THRESHOLD_MS) {
        clearInterval(checkInterval);
        activeDisconnectMonitors.delete(monitorKey);
        
        console.log(`[SessionMonitor] ⚠️ User ${userId} still disconnected after 1 minute - applying 24h restriction`);
        
        const restrictionEnd = new Date(Date.now() + LONG_RESTRICTION_DURATION_MS);
        await pool.query(`
          UPDATE status_bot_connections 
          SET restriction_lifted = false,
              last_connected_at = NOW(),
              short_restriction_until = NULL,
              updated_at = NOW()
          WHERE user_id = $1
        `, [userId]);
        
        // Emit to frontend
        const socketManager = getSocketManager();
        socketManager.emitToUser(userId, 'session_restriction', { 
          type: 'full',
          reason: 'הסשן נותק ולא חזר תוך דקה',
          restrictionEndsAt: restrictionEnd.toISOString(),
          durationHours: 24
        });
        return;
      }
      
      // Stop after max checks
      if (checkCount >= maxChecks) {
        clearInterval(checkInterval);
        activeDisconnectMonitors.delete(monitorKey);
        console.log(`[SessionMonitor] Stopped monitoring ${userId} after ${maxChecks} checks`);
      }
      
    } catch (error) {
      console.error(`[SessionMonitor] Error checking status for ${userId}:`, error.message);
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * Handle session status changes
 */
async function handleSessionStatus(userId, event) {
  const { payload, session } = event;
  
  const statusMap = {
    'WORKING': 'connected',
    'SCAN_QR_CODE': 'qr_pending',
    'STARTING': 'qr_pending',
    'STOPPED': 'disconnected',
    'FAILED': 'failed',
  };
  
  const ourStatus = statusMap[payload.status] || 'disconnected';
  
  // Session status changed
  
  // Update main whatsapp_connections
  await pool.query(
    `UPDATE whatsapp_connections SET status = $1, updated_at = NOW() WHERE user_id = $2`,
    [ourStatus, userId]
  );
  
  // Also update status_bot_connections if this session is used for Status Bot
  if (session) {
    const phoneNumber = payload.me?.id?.split('@')[0] || null;
    const displayName = payload.me?.pushName || null;
    
    await pool.query(`
      UPDATE status_bot_connections 
      SET connection_status = $1, 
          phone_number = COALESCE($2, phone_number),
          display_name = COALESCE($3, display_name),
          updated_at = NOW()
      WHERE session_name = $4
    `, [ourStatus, phoneNumber, displayName, session]);
  }
  
  // Emit status change to frontend
  const socketManager = getSocketManager();
  socketManager.emitToUser(userId, 'whatsapp_status', { status: ourStatus });
  socketManager.emitToUser(userId, 'statusbot_status', { status: ourStatus });
  
  // Start disconnect monitoring if session disconnected
  if (ourStatus === 'disconnected' || ourStatus === 'failed') {
    monitorDisconnectedSession(userId, session || 'main', new Date());
  } else if (ourStatus === 'connected') {
    // Clear any active monitor for this session (reconnected via webhook before monitor caught it)
    const monitorKey = `${userId}_${session || 'main'}`;
    if (activeDisconnectMonitors.has(monitorKey)) {
      console.log(`[SessionMonitor] Cleared monitor for ${monitorKey} - reconnected via webhook`);
      activeDisconnectMonitors.delete(monitorKey);
    }
    
    // Check if affiliate conversion should happen on WhatsApp connection
    try {
      const settings = await pool.query('SELECT * FROM affiliate_settings LIMIT 1');
      if (settings.rows[0]?.is_active && settings.rows[0]?.conversion_type === 'whatsapp_connected') {
        const { completeConversion } = require('../admin/promotions.controller');
        const result = await completeConversion(userId);
        if (result) {
          console.log(`[Webhook] Affiliate conversion completed for user ${userId} on WhatsApp connect: ₪${result.commission}`);
        }
      }
    } catch (affError) {
      console.error('[Webhook] Affiliate conversion error on WhatsApp connect:', affError.message);
    }
  }
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
      
      // Status reaction detected
      
      // Trigger bot engine with special event type
      await botEngine.processEvent(userId, reactorPhone, 'status_reaction', {
        reaction: reactionText,
        messageId: reactionMsgId,
        fromMe: payload.fromMe
      });
      
      // Sync reaction to status_bot_reactions table
      await syncStatusBotReaction(userId, reactionMsgId, reactorPhone, reactionText);
    }
    // Non-status reactions can be handled here in the future
  } catch (error) {
    console.error('[Webhook] Reaction handler error:', error.message);
  }
}

/**
 * Sync status reaction to status_bot_reactions table
 */
async function syncStatusBotReaction(userId, waMessageId, reactorPhone, reactionText) {
  try {
    if (!waMessageId || !reactorPhone || reactorPhone === 'status') return;
    
    // Try to find matching status in status_bot_statuses
    let statusResult = await pool.query(`
      SELECT sbs.id FROM status_bot_statuses sbs
      JOIN status_bot_connections sbc ON sbs.connection_id = sbc.id
      WHERE sbc.user_id = $1 AND sbs.waha_message_id = $2
    `, [userId, waMessageId]);
    
    // If not found, try partial match (extract hex ID)
    if (statusResult.rows.length === 0 && waMessageId.includes('_')) {
      const parts = waMessageId.split('_');
      const hexId = parts[parts.length - 1]?.split('@')[0] || parts[parts.length - 1];
      if (hexId) {
        statusResult = await pool.query(`
          SELECT sbs.id FROM status_bot_statuses sbs
          JOIN status_bot_connections sbc ON sbs.connection_id = sbc.id
          WHERE sbc.user_id = $1 AND sbs.waha_message_id LIKE $2
        `, [userId, `%${hexId}%`]);
      }
    }
    
    if (statusResult.rows.length === 0) return;
    
    const statusId = statusResult.rows[0].id;
    
    // Insert or update reaction (user can only have one reaction per status)
    await pool.query(`
      INSERT INTO status_bot_reactions (status_id, reactor_phone, reaction)
      VALUES ($1, $2, $3)
      ON CONFLICT (status_id, reactor_phone) DO UPDATE SET reaction = $3, reacted_at = NOW()
    `, [statusId, reactorPhone, reactionText || '❤️']);
    
    // Update reaction count
    await pool.query(`
      UPDATE status_bot_statuses 
      SET reaction_count = (SELECT COUNT(*) FROM status_bot_reactions WHERE status_id = $1)
      WHERE id = $1
    `, [statusId]);
    
    console.log(`[Webhook] ✅ Synced reaction to status_bot: status ${statusId}, reactor ${reactorPhone}, reaction ${reactionText}`);
  } catch (err) {
    // Silently fail - this is optional sync
    console.log(`[Webhook] Status bot reaction sync failed:`, err.message);
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
