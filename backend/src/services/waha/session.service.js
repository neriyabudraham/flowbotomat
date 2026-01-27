const { createClient } = require('./client.service');

/**
 * Create a new WAHA session
 * @param {string} baseUrl - WAHA base URL
 * @param {string} apiKey - WAHA API key
 * @param {string} sessionName - Session name (alphanumeric + underscore only)
 * @param {object} metadata - Optional metadata (e.g., { "user.email": "example@gmail.com" })
 */
async function createSession(baseUrl, apiKey, sessionName, metadata = {}) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post('/api/sessions', {
    name: sessionName,
    config: {
      webhooks: [],
      metadata: metadata,
    },
  });
  return response.data;
}

/**
 * Start an existing session
 */
async function startSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post(`/api/sessions/${sessionName}/start`);
  return response.data;
}

/**
 * Stop a session
 */
async function stopSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post(`/api/sessions/${sessionName}/stop`);
  return response.data;
}

/**
 * Delete a session
 */
async function deleteSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.delete(`/api/sessions/${sessionName}`);
  return response.data;
}

/**
 * Logout from WhatsApp (disconnect but keep session)
 */
async function logoutSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post(`/api/sessions/${sessionName}/logout`);
  return response.data;
}

/**
 * Get session status
 */
async function getSessionStatus(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.get(`/api/sessions/${sessionName}`);
  return response.data;
}

/**
 * Get QR code for session as image (base64)
 */
async function getQRCode(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  
  // Get QR as image (PNG)
  const response = await client.get(`/api/${sessionName}/auth/qr`, {
    params: { format: 'image' },
    responseType: 'arraybuffer',
  });
  
  // Convert to base64 data URL
  const base64 = Buffer.from(response.data).toString('base64');
  return {
    value: `data:image/png;base64,${base64}`,
  };
}

/**
 * Request pairing code (for phone number auth instead of QR)
 */
async function requestPairingCode(baseUrl, apiKey, sessionName, phoneNumber) {
  const client = createClient(baseUrl, apiKey);
  
  const response = await client.post(`/api/${sessionName}/auth/request-code`, {
    phoneNumber: phoneNumber,
    method: null, // Will send SMS or call
  });
  
  return response.data;
}

/**
 * Get all sessions from WAHA (including all statuses)
 */
async function getAllSessions(baseUrl, apiKey) {
  const client = createClient(baseUrl, apiKey);
  // Use all=true to get all sessions including inactive ones
  const response = await client.get('/api/sessions', { params: { all: true } });
  return response.data;
}

/**
 * Find session by user.email in metadata
 * @returns session object with status or null
 */
async function findSessionByEmail(baseUrl, apiKey, email) {
  console.log(`[WAHA] Searching for session with email: ${email}`);
  
  const sessions = await getAllSessions(baseUrl, apiKey);
  console.log(`[WAHA] Found ${sessions.length} total sessions`);
  
  for (const session of sessions) {
    const metadata = session.config?.metadata || {};
    console.log(`[WAHA] Session "${session.name}" status: ${session.status}, metadata:`, JSON.stringify(metadata));
    
    if (metadata['user.email'] === email) {
      console.log(`[WAHA] ✅ Match found: ${session.name}, status: ${session.status}`);
      return session; // Returns full session object including status
    }
  }
  
  console.log(`[WAHA] ❌ No session found with email: ${email}`);
  return null;
}

/**
 * Add webhook to session (keeps ALL existing config)
 */
async function addWebhook(baseUrl, apiKey, sessionName, webhookUrl, events) {
  const client = createClient(baseUrl, apiKey);
  
  // Get current session config
  const sessionInfo = await client.get(`/api/sessions/${sessionName}`);
  const currentConfig = sessionInfo.data?.config || {};
  const currentWebhooks = currentConfig.webhooks || [];
  
  // Check if webhook already exists
  const exists = currentWebhooks.some(wh => wh.url === webhookUrl);
  if (exists) {
    console.log(`[WAHA] Webhook already exists: ${webhookUrl}`);
    return sessionInfo.data;
  }
  
  // Add new webhook to existing list
  const updatedWebhooks = [
    ...currentWebhooks,
    {
      url: webhookUrl,
      events: events,
      retries: {
        delaySeconds: 2,
        attempts: 2,
        policy: 'constant',
      },
    },
  ];
  
  // Update session - keep ALL existing config, only update webhooks
  const response = await client.put(`/api/sessions/${sessionName}`, {
    config: {
      ...currentConfig,
      webhooks: updatedWebhooks,
    },
  });
  
  console.log(`[WAHA] Webhook added. Total: ${updatedWebhooks.length}`);
  return response.data;
}

/**
 * Send text message
 */
async function sendMessage(connection, phone, text) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const response = await client.post(`/api/sendText`, {
    session: connection.session_name,
    chatId: chatId,
    text: text,
  });
  
  console.log(`[WAHA] Sent message to ${phone}`);
  return response.data;
}

/**
 * Send image
 */
async function sendImage(connection, phone, imageUrl, caption = '') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  console.log(`[WAHA] Sending image to ${chatId}, url: ${imageUrl?.substring(0, 80)}, caption: ${caption?.substring(0, 30)}`);
  
  // Extract filename from URL or use default
  const filename = imageUrl.split('/').pop() || 'image.jpg';
  
  // Determine mimetype from URL extension
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimetypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  const mimetype = mimetypes[ext] || 'image/jpeg';
  
  const payload = {
    session: connection.session_name,
    chatId: chatId,
    file: {
      mimetype: mimetype,
      filename: filename,
      url: imageUrl
    },
    caption: caption || '',
  };
  
  console.log(`[WAHA] sendImage payload:`, JSON.stringify(payload));
  
  const response = await client.post(`/api/sendImage`, payload);
  
  console.log(`[WAHA] sendImage response:`, JSON.stringify(response.data)?.substring(0, 300));
  
  // Check if response indicates success
  if (response.data?.error) {
    console.error(`[WAHA] sendImage error:`, response.data.error);
    throw new Error(response.data.error);
  }
  
  console.log(`[WAHA] Sent image to ${phone}`);
  return response.data;
}

/**
 * Send file
 */
async function sendFile(connection, phone, fileUrl, filename = 'file', mimetype = null) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  // Build file object with proper structure
  const fileObj = {
    url: fileUrl,
    filename: filename,
  };
  
  // Add mimetype if provided
  if (mimetype) {
    fileObj.mimetype = mimetype;
  }
  
  const response = await client.post(`/api/sendFile`, {
    session: connection.session_name,
    chatId: chatId,
    file: fileObj,
  });
  
  console.log(`[WAHA] Sent file to ${phone}: ${filename}`);
  return response.data;
}

/**
 * Send video
 */
async function sendVideo(connection, phone, videoUrl, caption = '') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  console.log(`[WAHA] Sending video to ${chatId}, url: ${videoUrl?.substring(0, 80)}`);
  
  // Extract filename from URL or use default
  const filename = videoUrl.split('/').pop() || 'video.mp4';
  
  // Determine mimetype from URL extension
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimetypes = {
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'webm': 'video/webm',
    '3gp': 'video/3gpp'
  };
  const mimetype = mimetypes[ext] || 'video/mp4';
  
  const payload = {
    session: connection.session_name,
    chatId: chatId,
    file: {
      mimetype: mimetype,
      filename: filename,
      url: videoUrl
    },
    caption: caption || '',
    convert: true,
  };
  
  const response = await client.post(`/api/sendVideo`, payload);
  
  console.log(`[WAHA] sendVideo response:`, JSON.stringify(response.data)?.substring(0, 200));
  
  if (response.data?.error) {
    console.error(`[WAHA] sendVideo error:`, response.data.error);
    throw new Error(response.data.error);
  }
  
  console.log(`[WAHA] Sent video to ${phone}`);
  return response.data;
}

/**
 * Send list message
 */
async function sendList(connection, phone, listData) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const rows = (listData.buttons || []).map((btn, i) => {
    const row = {
      title: (btn.title || `אפשרות ${i + 1}`).substring(0, 24), // Max 24 chars
      rowId: btn.rowId || String(i), // Use custom rowId if provided, otherwise index
    };
    if (btn.description) {
      row.description = btn.description.substring(0, 72); // Max 72 chars
    }
    return row;
  });
  
  const payload = {
    session: connection.session_name,
    chatId: chatId,
    message: {
      title: (listData.title || '').substring(0, 60),
      description: listData.body || 'בחר אפשרות',
      footer: (listData.footer || '').substring(0, 60),
      button: (listData.buttonText || 'בחר').substring(0, 20),
      sections: [
        {
          title: 'אפשרויות',
          rows: rows,
        },
      ],
    },
  };
  
  console.log('[WAHA] Sending list payload:', JSON.stringify(payload, null, 2));
  
  const response = await client.post(`/api/sendList`, payload);
  
  console.log(`[WAHA] Sent list to ${phone}`);
  return response.data;
}

/**
 * Send voice message
 */
async function sendVoice(connection, phone, audioUrl, convert = true) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  console.log(`[WAHA] Sending voice to ${chatId}, url: ${audioUrl?.substring(0, 80)}`);
  
  // Determine mimetype - prefer opus for voice messages
  const ext = audioUrl.split('.').pop()?.toLowerCase();
  let mimetype = 'audio/ogg; codecs=opus';
  if (ext === 'mp3') mimetype = 'audio/mpeg';
  if (ext === 'wav') mimetype = 'audio/wav';
  if (ext === 'm4a') mimetype = 'audio/mp4';
  
  const payload = {
    session: connection.session_name,
    chatId: chatId,
    file: {
      mimetype: mimetype,
      url: audioUrl,
    },
    convert: true, // Always convert to voice format
  };
  
  console.log(`[WAHA] sendVoice payload:`, JSON.stringify(payload));
  
  const response = await client.post(`/api/sendVoice`, payload);
  
  console.log(`[WAHA] Sent voice to ${phone}`);
  return response.data;
}

/**
 * Send file with custom mimetype
 */
async function sendFileAdvanced(connection, phone, fileData, caption = '') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const payload = {
    session: connection.session_name,
    chatId: chatId,
    file: {
      url: fileData.url,
      filename: fileData.filename,
    },
  };
  
  // Add mimetype if provided
  if (fileData.mimetype) {
    payload.file.mimetype = fileData.mimetype;
  }
  
  // Add caption if provided
  if (caption) {
    payload.caption = caption;
  }
  
  const response = await client.post(`/api/sendFile`, payload);
  
  console.log(`[WAHA] Sent advanced file to ${phone}: ${fileData.filename}`);
  return response.data;
}

/**
 * Mark messages as seen
 */
async function sendSeen(connection, phone, messageIds = []) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const response = await client.post(`/api/sendSeen`, {
    session: connection.session_name,
    chatId: chatId,
    messageIds: messageIds,
  });
  
  console.log(`[WAHA] Marked as seen: ${phone}`);
  return response.data;
}

/**
 * Start typing indicator
 */
async function startTyping(connection, phone) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const response = await client.post(`/api/startTyping`, {
    session: connection.session_name,
    chatId: chatId,
  });
  
  return response.data;
}

/**
 * Stop typing indicator
 */
async function stopTyping(connection, phone) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const response = await client.post(`/api/stopTyping`, {
    session: connection.session_name,
    chatId: chatId,
  });
  
  return response.data;
}

/**
 * Send reaction to message
 */
async function sendReaction(connection, messageId, reaction) {
  const client = createClient(connection.base_url, connection.api_key);
  
  // WAHA expects PUT to /api/reaction with session in body
  const response = await client.put(`/api/reaction`, {
    session: connection.session_name,
    messageId: messageId,
    reaction: reaction,
  });
  
  console.log(`[WAHA] Sent reaction: ${reaction} to ${messageId}`);
  return response.data;
}

/**
 * Send location
 */
async function sendLocation(connection, phone, latitude, longitude, title = '') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const response = await client.post(`/api/sendLocation`, {
    session: connection.session_name,
    chatId: chatId,
    latitude: latitude,
    longitude: longitude,
    title: title,
  });
  
  console.log(`[WAHA] Sent location to ${phone}`);
  return response.data;
}

/**
 * Format phone number to international format
 */
function formatPhoneNumber(phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  // If starts with 0, assume Israeli number and replace with 972
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.substring(1);
  }
  
  // Ensure it starts with country code (if not, assume 972)
  if (cleaned.length === 9) {
    cleaned = '972' + cleaned;
  }
  
  return cleaned;
}

/**
 * Build vCard string for WAHA API
 * Using raw vCard 3.0 format with proper encoding
 */
function buildVcardString(contactName, contactPhone, contactOrg = '') {
  // Format phone number - remove all non-digits, ensure starts with country code
  let cleanPhone = contactPhone.replace(/[^0-9]/g, '');
  
  // Handle Israeli numbers
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '972' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('972') && cleanPhone.length === 9) {
    cleanPhone = '972' + cleanPhone;
  }
  
  const phoneWithPlus = '+' + cleanPhone;
  
  // Split name for N field
  const nameParts = contactName.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  // Build vCard 3.0 - the key is the waid parameter in TEL
  const vcardLines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${lastName};${firstName};;;`,
    `FN:${contactName}`,
  ];
  
  // Add organization if provided
  if (contactOrg) {
    vcardLines.push(`ORG:${contactOrg};`);
  }
  
  // Phone with waid for WhatsApp clickability
  vcardLines.push(`TEL;type=CELL;type=VOICE;waid=${cleanPhone}:${phoneWithPlus}`);
  vcardLines.push('END:VCARD');
  
  return vcardLines.join('\n');
}

/**
 * Send contact vCard - supports single contact or array of contacts
 */
async function sendContactVcard(connection, phone, contactName, contactPhone, contactOrg = '', additionalContacts = []) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  // Build contacts array using raw vCard strings
  const contacts = [];
  
  // Add main contact
  const mainVcard = buildVcardString(contactName, contactPhone, contactOrg);
  contacts.push({ vcard: mainVcard });
  
  // Add additional contacts if provided
  if (additionalContacts && additionalContacts.length > 0) {
    for (const c of additionalContacts) {
      if (c.contactName && c.contactPhone) {
        const vcard = buildVcardString(c.contactName, c.contactPhone, c.contactOrg || '');
        contacts.push({ vcard: vcard });
      }
    }
  }
  
  console.log(`[WAHA] Sending ${contacts.length} vCard(s):`);
  contacts.forEach((c, i) => console.log(`Contact ${i + 1}:\n${c.vcard}`));
  
  const response = await client.post(`/api/sendContactVcard`, {
    session: connection.session_name,
    chatId: chatId,
    contacts: contacts,
  });
  
  console.log(`[WAHA] Sent ${contacts.length} contact(s) to ${phone}`);
  return response.data;
}

/**
 * Send link with custom preview
 */
async function sendLinkPreview(connection, phone, text, preview) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  
  const response = await client.post(`/api/send/link-custom-preview`, {
    session: connection.session_name,
    chatId: chatId,
    text: text,
    linkPreviewHighQuality: true,
    preview: preview,
  });
  
  console.log(`[WAHA] Sent link preview to ${phone}`);
  return response.data;
}

// ====================== GROUP FUNCTIONS ======================

/**
 * Add participants to group
 */
async function addGroupParticipants(connection, groupId, participantIds) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const participants = participantIds.map(id => ({ id: id.includes('@') ? id : `${id}@c.us` }));
  
  const response = await client.post(`/api/${connection.session_name}/groups/${groupId}/participants/add`, {
    participants: participants,
  });
  
  console.log(`[WAHA] Added participants to group: ${groupId}`);
  return response.data;
}

/**
 * Remove participants from group
 */
async function removeGroupParticipants(connection, groupId, participantIds) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const participants = participantIds.map(id => ({ id: id.includes('@') ? id : `${id}@c.us` }));
  
  const response = await client.post(`/api/${connection.session_name}/groups/${groupId}/participants/remove`, {
    participants: participants,
  });
  
  console.log(`[WAHA] Removed participants from group: ${groupId}`);
  return response.data;
}

/**
 * Get group participants
 */
async function getGroupParticipants(connection, groupId) {
  const client = createClient(connection.base_url, connection.api_key);
  
  try {
    const response = await client.get(`/api/${connection.session_name}/groups/${groupId}/participants`);
    return response.data;
  } catch (error) {
    // Try v2 endpoint
    const response = await client.get(`/api/${connection.session_name}/groups/${groupId}/participants/v2`);
    return response.data;
  }
}

/**
 * Set group admin-only messages
 */
async function setGroupAdminOnly(connection, groupId, adminsOnly = true) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const response = await client.put(`/api/${connection.session_name}/groups/${groupId}/settings/security/messages-admin-only`, {
    adminsOnly: adminsOnly,
  });
  
  console.log(`[WAHA] Set group admin-only: ${groupId} -> ${adminsOnly}`);
  return response.data;
}

/**
 * Update group subject (name)
 */
async function updateGroupSubject(connection, groupId, subject) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const response = await client.put(`/api/${connection.session_name}/groups/${groupId}/subject`, {
    subject: subject,
  });
  
  console.log(`[WAHA] Updated group subject: ${groupId}`);
  return response.data;
}

/**
 * Update group description
 */
async function updateGroupDescription(connection, groupId, description) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const response = await client.put(`/api/${connection.session_name}/groups/${groupId}/description`, {
    description: description,
  });
  
  console.log(`[WAHA] Updated group description: ${groupId}`);
  return response.data;
}

/**
 * Get all groups for a session
 */
async function getGroups(sessionName) {
  // sessionName can be a connection object or just the session name string
  let connection = sessionName;
  if (typeof sessionName === 'string') {
    // Need to get connection details from DB
    const db = require('../../config/database');
    const result = await db.query(`
      SELECT ws.*, wh.base_url, wh.api_key
      FROM waha_sessions ws
      JOIN waha_hosts wh ON ws.waha_host_id = wh.id
      WHERE ws.session_id = $1 OR ws.waha_instance_name = $1
      LIMIT 1
    `, [sessionName]);
    
    if (result.rows.length === 0) {
      throw new Error(`Session ${sessionName} not found`);
    }
    
    connection = {
      base_url: result.rows[0].base_url,
      api_key: result.rows[0].api_key,
      session_name: result.rows[0].waha_instance_name || result.rows[0].session_id
    };
  }
  
  const client = createClient(connection.base_url, connection.api_key);
  
  try {
    // Try the groups endpoint
    const response = await client.get(`/api/${connection.session_name}/groups`);
    return response.data || [];
  } catch (error) {
    console.error(`[WAHA] Error getting groups:`, error.message);
    
    // Fallback: Try getting chats and filter for groups
    try {
      const chatsResponse = await client.get(`/api/${connection.session_name}/chats`);
      const chats = chatsResponse.data || [];
      return chats.filter(chat => chat.id?.endsWith('@g.us'));
    } catch (chatError) {
      console.error(`[WAHA] Error getting chats:`, chatError.message);
      return [];
    }
  }
}

/**
 * Delete a message
 */
async function deleteMessage(sessionName, chatId, messageId) {
  let connection = sessionName;
  if (typeof sessionName === 'string') {
    const db = require('../../config/database');
    const result = await db.query(`
      SELECT ws.*, wh.base_url, wh.api_key
      FROM waha_sessions ws
      JOIN waha_hosts wh ON ws.waha_host_id = wh.id
      WHERE ws.session_id = $1 OR ws.waha_instance_name = $1
      LIMIT 1
    `, [sessionName]);
    
    if (result.rows.length === 0) {
      throw new Error(`Session ${sessionName} not found`);
    }
    
    connection = {
      base_url: result.rows[0].base_url,
      api_key: result.rows[0].api_key,
      session_name: result.rows[0].waha_instance_name || result.rows[0].session_id
    };
  }
  
  const client = createClient(connection.base_url, connection.api_key);
  
  const response = await client.delete(`/api/${connection.session_name}/messages`, {
    data: {
      chatId: chatId,
      messageId: messageId,
      forEveryone: true
    }
  });
  
  console.log(`[WAHA] Deleted message ${messageId} from ${chatId}`);
  return response.data;
}

// ====================== LABELS (WhatsApp Business) ======================

/**
 * Get all labels
 */
async function getLabels(connection) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const response = await client.get(`/api/${connection.session_name}/labels`);
  return response.data;
}

/**
 * Set labels for chat
 */
async function setChatLabels(connection, chatId, labelIds) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const labels = labelIds.map(id => ({ id: String(id) }));
  
  const response = await client.put(`/api/${connection.session_name}/labels/chats/${chatId}`, {
    labels: labels,
  });
  
  console.log(`[WAHA] Set labels for chat: ${chatId}`);
  return response.data;
}

/**
 * Get chats by label
 */
async function getChatsByLabel(connection, labelId) {
  const client = createClient(connection.base_url, connection.api_key);
  
  const response = await client.get(`/api/${connection.session_name}/labels/${labelId}/chats`);
  return response.data;
}

module.exports = {
  createSession,
  startSession,
  stopSession,
  deleteSession,
  logoutSession,
  getSessionStatus,
  getQRCode,
  requestPairingCode,
  getAllSessions,
  findSessionByEmail,
  addWebhook,
  sendMessage,
  sendImage,
  sendFile,
  sendVideo,
  sendList,
  // New APIs
  sendVoice,
  sendFileAdvanced,
  sendSeen,
  startTyping,
  stopTyping,
  sendReaction,
  sendLocation,
  sendContactVcard,
  sendLinkPreview,
  // Group functions
  addGroupParticipants,
  removeGroupParticipants,
  getGroupParticipants,
  setGroupAdminOnly,
  updateGroupSubject,
  updateGroupDescription,
  getGroups,
  deleteMessage,
  // Labels (WhatsApp Business)
  getLabels,
  setChatLabels,
  getChatsByLabel,
  // Contacts
  getWhatsAppContacts,
};

/**
 * Get all WhatsApp contacts from device
 */
async function getWhatsAppContacts(connection) {
  const client = createClient(connection.base_url, connection.api_key);
  const sessionName = connection.session_name || 'default';
  
  try {
    const response = await client.get(`/api/contacts/all`, {
      params: { session: sessionName }
    });
    return response.data || [];
  } catch (error) {
    console.error('[WAHA] Failed to get contacts:', error.message);
    return [];
  }
}
