/**
 * WhatsApp Cloud API Service
 * Handles communication with Meta's WhatsApp Business API
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Get credentials from environment
function getCredentials() {
  return {
    phoneId: process.env.CLOUD_API_PHONE_ID,
    accessToken: process.env.CLOUD_API_ACCESS_TOKEN,
    verifyToken: process.env.CLOUD_API_VERIFY_TOKEN,
  };
}

/**
 * Send a text message
 */
async function sendTextMessage(to, text) {
  const { phoneId, accessToken } = getCredentials();
  
  console.log(`[CloudAPI] Sending text message to ${to}, phoneId: ${phoneId}, hasToken: ${!!accessToken}`);
  
  if (!phoneId || !accessToken) {
    console.error('[CloudAPI] Missing credentials! phoneId:', phoneId, 'hasToken:', !!accessToken);
    throw new Error('Missing Cloud API credentials');
  }
  
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`[CloudAPI] ✅ Sent text message to ${to}, response:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`[CloudAPI] ❌ Failed to send text message to ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send interactive buttons message
 */
async function sendButtonMessage(to, bodyText, buttons) {
  const { phoneId, accessToken } = getCredentials();
  
  console.log(`[CloudAPI] Sending button message to ${to}`);
  
  // Buttons format: [{ id: 'btn_id', title: 'Button Text' }]
  const formattedButtons = buttons.map(btn => ({
    type: 'reply',
    reply: {
      id: btn.id,
      title: btn.title.substring(0, 20) // Max 20 chars
    }
  }));
  
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: formattedButtons
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`[CloudAPI] ✅ Sent button message to ${to}`);
    return response.data;
  } catch (error) {
    console.error(`[CloudAPI] ❌ Failed to send button message to ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send interactive list message
 */
async function sendListMessage(to, bodyText, buttonText, sections) {
  const { phoneId, accessToken } = getCredentials();
  
  console.log(`[CloudAPI] Sending list message to ${to}`);
  
  // Sections format: [{ title: 'Section', rows: [{ id: 'row_id', title: 'Row', description: 'desc' }] }]
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: buttonText.substring(0, 20), // Max 20 chars
            sections: sections
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`[CloudAPI] ✅ Sent list message to ${to}`);
    return response.data;
  } catch (error) {
    console.error(`[CloudAPI] ❌ Failed to send list message to ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Download media from Cloud API
 */
async function downloadMedia(mediaId) {
  const { accessToken } = getCredentials();
  
  // First get the media URL
  const mediaResponse = await axios.get(
    `${GRAPH_API_BASE}/${mediaId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  const mediaUrl = mediaResponse.data.url;
  const mimeType = mediaResponse.data.mime_type;
  
  // Then download the actual file
  const fileResponse = await axios.get(mediaUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    responseType: 'arraybuffer'
  });
  
  console.log(`[CloudAPI] Downloaded media ${mediaId}, type: ${mimeType}`);
  return {
    buffer: Buffer.from(fileResponse.data),
    mimeType: mimeType
  };
}

/**
 * Upload media to Botomat storage and return URL
 */
async function uploadMediaToStorage(buffer, mimeType, originalFilename) {
  const crypto = require('crypto');
  
  // Determine extension and type from mime type
  const extMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
  };
  
  // Get type folder
  let type = 'misc';
  if (mimeType.startsWith('image/')) type = 'image';
  else if (mimeType.startsWith('video/')) type = 'video';
  else if (mimeType.startsWith('audio/')) type = 'audio';
  
  const ext = extMap[mimeType] || 'bin';
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const filename = `${Date.now()}-${uniqueId}.${ext}`;
  
  // Save to uploads/type folder (same as upload.controller.js)
  const uploadsDir = path.join(__dirname, '../../..', 'uploads', type);
  
  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const filePath = path.join(uploadsDir, filename);
  
  try {
    fs.writeFileSync(filePath, buffer);
    
    // Use API_URL same as upload.controller.js
    const baseUrl = process.env.API_URL || 'https://botomat.co.il/api';
    const fileUrl = `${baseUrl}/uploads/${type}/${filename}`;
    
    console.log(`[CloudAPI] Saved media to storage: ${fileUrl}`);
    return fileUrl;
  } catch (error) {
    console.error('[CloudAPI] Save error:', error.message);
    throw error;
  }
}

/**
 * Mark message as read
 */
async function markAsRead(messageId) {
  const { phoneId, accessToken } = getCredentials();
  
  try {
    await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    // Silently fail - not critical
    console.log(`[CloudAPI] Could not mark message as read: ${error.message}`);
  }
}

/**
 * Verify webhook signature from Meta
 */
function verifyWebhookSignature(payload, signature) {
  const { accessToken } = getCredentials();
  const appSecret = process.env.CLOUD_API_APP_SECRET;
  
  if (!appSecret) {
    console.warn('[CloudAPI] No app secret configured, skipping signature verification');
    return true;
  }
  
  const expectedSignature = 'sha256=' + 
    require('crypto')
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');
  
  return signature === expectedSignature;
}

/**
 * Send a document (file) to a phone number
 * For TXT files, we create a temporary file and upload it
 */
async function sendDocumentMessage(to, content, filename, caption = '') {
  const { phoneId, accessToken } = getCredentials();
  
  console.log(`[CloudAPI] Sending document to ${to}: ${filename}`);
  
  try {
    // Create a temporary file
    const tempDir = path.join(__dirname, '../../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `${Date.now()}_${filename}`);
    fs.writeFileSync(tempFilePath, content, 'utf8');
    
    // Upload the file to Meta's servers using multipart form
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(tempFilePath));
    form.append('type', 'text/plain');
    form.append('messaging_product', 'whatsapp');
    
    const uploadResponse = await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/media`,
      form,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...form.getHeaders()
        }
      }
    );
    
    const mediaId = uploadResponse.data.id;
    console.log(`[CloudAPI] Uploaded document, mediaId: ${mediaId}`);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    // Send the document message
    const response = await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'document',
        document: {
          id: mediaId,
          caption: caption || undefined,
          filename: filename
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`[CloudAPI] ✅ Sent document to ${to}`);
    return response.data;
  } catch (error) {
    console.error(`[CloudAPI] ❌ Failed to send document to ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  getCredentials,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  downloadMedia,
  uploadMediaToStorage,
  markAsRead,
  verifyWebhookSignature,
  sendDocumentMessage,
};
