/**
 * WhatsApp Cloud API Webhook Controller
 * Handles incoming webhooks from Meta's WhatsApp Business API
 */

const cloudApiService = require('../../services/cloudApi/cloudApi.service');
const conversationService = require('../../services/cloudApi/conversation.service');

/**
 * Verify webhook (GET request from Meta)
 * Meta sends this to verify the webhook URL
 */
async function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  const { verifyToken } = cloudApiService.getCredentials();
  
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[CloudAPI Webhook] Verification successful');
    return res.status(200).send(challenge);
  }
  
  console.log('[CloudAPI Webhook] Verification failed');
  return res.status(403).send('Forbidden');
}

/**
 * Handle incoming webhook (POST request from Meta)
 */
async function handleWebhook(req, res) {
  // Always respond 200 quickly to prevent retries
  res.status(200).send('OK');
  
  try {
    const body = req.body;
    
    console.log('[CloudAPI Webhook] Received webhook:', JSON.stringify(body, null, 2));
    
    // Verify signature if configured
    const signature = req.headers['x-hub-signature-256'];
    if (signature && process.env.CLOUD_API_APP_SECRET) {
      const payload = JSON.stringify(req.body);
      if (!cloudApiService.verifyWebhookSignature(payload, signature)) {
        console.log('[CloudAPI Webhook] Invalid signature');
        return;
      }
    }
    
    // Process messages
    if (body.object !== 'whatsapp_business_account') {
      console.log('[CloudAPI Webhook] Not a whatsapp_business_account, object:', body.object);
      return;
    }
    
    const entries = body.entry || [];
    console.log(`[CloudAPI Webhook] Processing ${entries.length} entries`);
    
    for (const entry of entries) {
      const changes = entry.changes || [];
      console.log(`[CloudAPI Webhook] Entry has ${changes.length} changes`);
      
      for (const change of changes) {
        console.log(`[CloudAPI Webhook] Change field: ${change.field}`);
        
        if (change.field !== 'messages') {
          continue;
        }
        
        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        
        console.log(`[CloudAPI Webhook] Found ${messages.length} messages`);
        
        for (const message of messages) {
          await processMessage(message, contacts, value);
        }
      }
    }
  } catch (error) {
    console.error('[CloudAPI Webhook] Error processing webhook:', error);
  }
}

/**
 * Process individual message
 */
async function processMessage(message, contacts, value) {
  try {
    const phone = message.from;
    const messageId = message.id;
    
    console.log(`[CloudAPI Webhook] Message from ${phone}, type: ${message.type}`);
    if (message.type === 'interactive') {
      console.log(`[CloudAPI Webhook] Interactive type: ${message.interactive?.type}, id: ${message.interactive?.button_reply?.id || message.interactive?.list_reply?.id}`);
    }
    
    // Mark as read
    await cloudApiService.markAsRead(messageId);
    
    // Get contact name if available
    const contact = contacts.find(c => c.wa_id === phone);
    const contactName = contact?.profile?.name || null;
    
    // Route to conversation handler
    await conversationService.handleMessage(phone, message);
    
  } catch (error) {
    console.error(`[CloudAPI Webhook] Error processing message:`, error);
  }
}

/**
 * Handle status updates (delivery receipts, etc.)
 * Not used for our bot but required for completeness
 */
async function handleStatusUpdate(status, value) {
  // Status updates: sent, delivered, read, failed
  // We don't need to process these for the status bot
  console.log(`[CloudAPI Webhook] Status update: ${status.status} for ${status.id}`);
}

module.exports = {
  verifyWebhook,
  handleWebhook,
};
