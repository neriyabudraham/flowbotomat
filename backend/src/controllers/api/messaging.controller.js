const db = require('../../config/database');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { createClient } = require('../../services/waha/client.service');

/**
 * Get WhatsApp client for user
 */
async function getWhatsAppClient(userId) {
  const connectionResult = await db.query(
    `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'`,
    [userId]
  );
  
  if (connectionResult.rows.length === 0) {
    throw new Error('NO_WHATSAPP_CONNECTION');
  }
  
  const connection = connectionResult.rows[0];
  
  let baseUrl, apiKey;
  if (connection.connection_type === 'managed') {
    const creds = getWahaCredentials();
    baseUrl = creds.baseUrl;
    apiKey = creds.apiKey;
  } else {
    baseUrl = decrypt(connection.external_base_url);
    apiKey = decrypt(connection.external_api_key);
  }
  
  return {
    client: createClient(baseUrl, apiKey),
    session: connection.session_name,
    connection
  };
}

/**
 * Format phone number to WhatsApp ID
 */
function formatPhoneToWaId(phone) {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Add country code if missing (assume Israel +972)
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.substring(1);
  }
  
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Save message to database
 */
async function saveMessage(userId, contactId, waMessageId, type, content, metadata = {}) {
  const result = await db.query(`
    INSERT INTO messages 
    (user_id, contact_id, wa_message_id, direction, message_type, content, metadata, status, sent_at)
    VALUES ($1, $2, $3, 'outgoing', $4, $5, $6, 'sent', NOW())
    RETURNING *
  `, [userId, contactId, waMessageId, type, content, JSON.stringify(metadata)]);
  
  // Update contact last message time
  await db.query(
    'UPDATE contacts SET last_message_at = NOW() WHERE id = $1',
    [contactId]
  );
  
  return result.rows[0];
}

/**
 * Get or create contact
 */
async function getOrCreateContact(userId, phone) {
  // Try to find existing contact
  let result = await db.query(
    'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
    [userId, phone.replace(/\D/g, '')]
  );
  
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  
  // Create new contact
  const waId = formatPhoneToWaId(phone);
  result = await db.query(`
    INSERT INTO contacts (user_id, phone, wa_id, display_name, is_bot_active)
    VALUES ($1, $2, $3, $4, false)
    RETURNING *
  `, [userId, phone.replace(/\D/g, ''), waId, phone]);
  
  return result.rows[0];
}

// ===== API ENDPOINTS =====

/**
 * Send text message
 * POST /v1/messages/text
 */
async function sendTextMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, message',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    // Send message via WAHA
    let wahaResponse;
    try {
      wahaResponse = await client.post('/api/sendText', {
        session,
        chatId,
        text: message,
      });
    } catch (wahaError) {
      console.error('[API] WAHA send error:', wahaError.response?.data || wahaError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to send via WhatsApp',
        code: 'WAHA_ERROR'
      });
    }
    
    // Message sent successfully - now save to DB
    let savedMessage = null;
    let contact = null;
    
    try {
      contact = await getOrCreateContact(userId, phone);
      savedMessage = await saveMessage(
        userId, 
        contact.id, 
        wahaResponse.data?.id?.id || wahaResponse.data?.key?.id, 
        'text', 
        message
      );
    } catch (dbError) {
      // Message was sent but DB save failed - still return success
      console.error('[API] DB save error (message was sent):', dbError.message);
    }
    
    res.json({
      success: true,
      messageId: savedMessage?.id || null,
      waMessageId: wahaResponse.data?.id?.id || wahaResponse.data?.key?.id,
      timestamp: savedMessage?.sent_at || new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[API] Send text error:', error.message);
    
    if (error.message === 'NO_WHATSAPP_CONNECTION') {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp not connected',
        code: 'NO_CONNECTION'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      code: 'SEND_FAILED'
    });
  }
}

/**
 * Helper to send message and save to DB
 */
async function sendAndSave(userId, phone, wahaCall, messageType, content, metadata = {}) {
  // Send via WAHA
  let wahaResponse;
  try {
    wahaResponse = await wahaCall();
  } catch (wahaError) {
    console.error(`[API] WAHA ${messageType} error:`, wahaError.response?.data || wahaError.message);
    throw { type: 'WAHA_ERROR', message: wahaError.response?.data?.message || 'Failed to send via WhatsApp' };
  }
  
  // Save to DB (non-blocking - message was already sent)
  let savedMessage = null;
  try {
    const contact = await getOrCreateContact(userId, phone);
    savedMessage = await saveMessage(
      userId, 
      contact.id, 
      wahaResponse.data?.id?.id || wahaResponse.data?.key?.id, 
      messageType, 
      content,
      metadata
    );
  } catch (dbError) {
    console.error(`[API] DB save error (${messageType} was sent):`, dbError.message);
  }
  
  return {
    success: true,
    messageId: savedMessage?.id || null,
    waMessageId: wahaResponse.data?.id?.id || wahaResponse.data?.key?.id,
    timestamp: savedMessage?.sent_at || new Date().toISOString(),
  };
}

/**
 * Send image
 * POST /v1/messages/image
 */
async function sendImageMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, imageUrl, caption } = req.body;
    
    if (!phone || !imageUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, imageUrl',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    const result = await sendAndSave(
      userId, 
      phone,
      () => client.post('/api/sendImage', {
        session,
        chatId,
        file: { url: imageUrl },
        caption: caption || '',
      }),
      'image',
      caption || '[תמונה]',
      { imageUrl }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send image error:', error);
    handleApiError(error, res);
  }
}

/**
 * Send video
 * POST /v1/messages/video
 */
async function sendVideoMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, videoUrl, caption } = req.body;
    
    if (!phone || !videoUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, videoUrl',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    const result = await sendAndSave(
      userId,
      phone,
      () => client.post('/api/sendVideo', {
        session,
        chatId,
        file: { url: videoUrl },
        caption: caption || '',
      }),
      'video',
      caption || '[סרטון]',
      { videoUrl }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send video error:', error);
    handleApiError(error, res);
  }
}

/**
 * Send document/file
 * POST /v1/messages/document
 */
async function sendDocumentMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, documentUrl, filename, caption } = req.body;
    
    if (!phone || !documentUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, documentUrl',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    const result = await sendAndSave(
      userId,
      phone,
      () => client.post('/api/sendFile', {
        session,
        chatId,
        file: { url: documentUrl },
        filename: filename || 'document',
        caption: caption || '',
      }),
      'document',
      caption || '[מסמך]',
      { documentUrl, filename }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send document error:', error);
    handleApiError(error, res);
  }
}

/**
 * Send audio
 * POST /v1/messages/audio
 */
async function sendAudioMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, audioUrl } = req.body;
    
    if (!phone || !audioUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, audioUrl',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    const result = await sendAndSave(
      userId,
      phone,
      () => client.post('/api/sendFile', {
        session,
        chatId,
        file: { url: audioUrl },
      }),
      'audio',
      '[הודעה קולית]',
      { audioUrl }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send audio error:', error);
    handleApiError(error, res);
  }
}

/**
 * Send buttons message
 * POST /v1/messages/buttons
 */
async function sendButtonsMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, message, buttons, footer } = req.body;
    
    if (!phone || !message || !buttons || !Array.isArray(buttons)) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, message, buttons (array)',
        code: 'INVALID_REQUEST'
      });
    }
    
    if (buttons.length > 3) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 3 buttons allowed',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    // Format buttons for WAHA (new format)
    const formattedButtons = buttons.map((btn, i) => ({
      type: 'reply',
      text: btn.text || btn,
      id: btn.id || `btn_${i}`,
    }));
    
    const result = await sendAndSave(
      userId,
      phone,
      () => client.post('/api/sendButtons', {
        session,
        chatId,
        body: message,
        footer: footer || '',
        buttons: formattedButtons,
      }),
      'buttons',
      message,
      { buttons, footer }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send buttons error:', error);
    handleApiError(error, res);
  }
}

/**
 * Send list message
 * POST /v1/messages/list
 */
async function sendListMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, message, buttonText, sections, footer } = req.body;
    
    if (!phone || !message || !buttonText || !sections || !Array.isArray(sections)) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, message, buttonText, sections (array)',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    // Format for WAHA list
    const formattedSections = sections.map(section => ({
      title: section.title || 'אפשרויות',
      rows: section.rows.map((row, i) => ({
        rowId: row.id || `row_${i}`,
        title: (row.title || '').substring(0, 24),
        description: (row.description || '').substring(0, 72),
      })),
    }));
    
    const result = await sendAndSave(
      userId,
      phone,
      () => client.post('/api/sendList', {
        session,
        chatId,
        message: {
          title: '',
          description: message,
          footer: footer || '',
          button: buttonText,
          sections: formattedSections,
        },
      }),
      'list',
      message,
      { buttonText, sections, footer }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send list error:', error);
    handleApiError(error, res);
  }
}

/**
 * Send location
 * POST /v1/messages/location
 */
async function sendLocationMessage(req, res) {
  try {
    const userId = req.user.id;
    const { phone, latitude, longitude, name, address } = req.body;
    
    if (!phone || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: phone, latitude, longitude',
        code: 'INVALID_REQUEST'
      });
    }
    
    const { client, session } = await getWhatsAppClient(userId);
    const chatId = formatPhoneToWaId(phone);
    
    const result = await sendAndSave(
      userId,
      phone,
      () => client.post('/api/sendLocation', {
        session,
        chatId,
        latitude,
        longitude,
        name: name || '',
        address: address || '',
      }),
      'location',
      '[מיקום]',
      { latitude, longitude, name, address }
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[API] Send location error:', error);
    handleApiError(error, res);
  }
}

/**
 * Get contacts
 * GET /v1/contacts
 */
async function getContacts(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 100, offset = 0, search } = req.query;
    
    let query = `
      SELECT 
        id, phone, wa_id, display_name, is_bot_active, 
        is_blocked, last_message_at, created_at
      FROM contacts 
      WHERE user_id = $1
    `;
    const params = [userId];
    
    if (search) {
      query += ` AND (phone ILIKE $2 OR display_name ILIKE $2)`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      contacts: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    
  } catch (error) {
    console.error('[API] Get contacts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contacts',
      code: 'FETCH_FAILED'
    });
  }
}

/**
 * Get messages for a contact
 * GET /v1/contacts/:phone/messages
 */
async function getMessages(req, res) {
  try {
    const userId = req.user.id;
    const { phone } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // Find contact
    const contactResult = await db.query(
      'SELECT id FROM contacts WHERE user_id = $1 AND phone = $2',
      [userId, phone.replace(/\D/g, '')]
    );
    
    if (contactResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
        code: 'NOT_FOUND'
      });
    }
    
    const contactId = contactResult.rows[0].id;
    
    const result = await db.query(`
      SELECT 
        id, direction, message_type, content, metadata, status, sent_at, created_at
      FROM messages 
      WHERE contact_id = $1
      ORDER BY sent_at DESC
      LIMIT $2 OFFSET $3
    `, [contactId, limit, offset]);
    
    res.json({
      success: true,
      messages: result.rows,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    
  } catch (error) {
    console.error('[API] Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get messages',
      code: 'FETCH_FAILED'
    });
  }
}

/**
 * Check connection status
 * GET /v1/status
 */
async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    
    const connectionResult = await db.query(
      `SELECT status, phone_number, session_name FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (connectionResult.rows.length === 0) {
      return res.json({
        success: true,
        connected: false,
        status: 'not_configured'
      });
    }
    
    const conn = connectionResult.rows[0];
    
    res.json({
      success: true,
      connected: conn.status === 'connected',
      status: conn.status,
      phone: conn.phone_number,
    });
    
  } catch (error) {
    console.error('[API] Get status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      code: 'FETCH_FAILED'
    });
  }
}

/**
 * Handle API errors
 */
function handleApiError(error, res) {
  // Custom WAHA error from sendAndSave
  if (error.type === 'WAHA_ERROR') {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send via WhatsApp',
      code: 'WAHA_ERROR'
    });
  }
  
  if (error.message === 'NO_WHATSAPP_CONNECTION') {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp not connected',
      code: 'NO_CONNECTION'
    });
  }
  
  if (error.response?.status === 404) {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp session not found',
      code: 'SESSION_NOT_FOUND'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Operation failed',
    code: 'OPERATION_FAILED'
  });
}

module.exports = {
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
  sendAudioMessage,
  sendButtonsMessage,
  sendListMessage,
  sendLocationMessage,
  getContacts,
  getMessages,
  getStatus,
};
