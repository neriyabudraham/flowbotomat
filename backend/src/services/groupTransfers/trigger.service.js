const db = require('../../config/database');
const wahaService = require('../waha/session.service');
const { decrypt } = require('../crypto/encrypt.service');
const { getWahaCredentials } = require('../settings/system.service');

/**
 * Group Transfers Trigger Service
 * Handles automatic message forwarding between groups in a transfer bundle
 * 
 * When a message is received in a group that's part of a transfer:
 * - Forward to all OTHER groups in the same transfer
 * - Include sender attribution: @{phone} ({name}):
 */

/**
 * Check if a group message should trigger a transfer
 * @param {string} userId - User ID
 * @param {string} groupId - Source group ID (e.g., "123456789@g.us")
 * @param {string} senderPhone - Sender's phone number
 * @returns {Promise<Array>} - Array of active transfers that should be triggered
 */
async function checkForTransferTrigger(userId, groupId, senderPhone) {
  try {
    // Find all active transfers that include this group as a target
    const result = await db.query(`
      SELECT DISTINCT gt.* 
      FROM group_transfers gt
      JOIN group_transfer_targets gtt ON gtt.transfer_id = gt.id
      WHERE gt.user_id = $1 
        AND gt.is_active = true
        AND gtt.group_id = $2
        AND gtt.is_active = true
    `, [userId, groupId]);

    if (result.rows.length === 0) {
      return [];
    }

    // Filter by authorized senders (if any are defined)
    const transfers = [];
    for (const transfer of result.rows) {
      const isAuthorized = await checkSenderAuthorization(transfer.id, senderPhone);
      if (isAuthorized) {
        transfers.push(transfer);
      }
    }

    return transfers;
  } catch (error) {
    console.error('[GroupTransfers] Error checking trigger:', error);
    return [];
  }
}

/**
 * Check if sender is authorized for this transfer
 * If no authorized senders are defined, everyone is allowed
 */
async function checkSenderAuthorization(transferId, senderPhone) {
  try {
    // Check if there are any authorized senders defined
    const countResult = await db.query(
      'SELECT COUNT(*) FROM transfer_authorized_senders WHERE transfer_id = $1',
      [transferId]
    );
    
    const hasAuthorizedSenders = parseInt(countResult.rows[0].count) > 0;
    
    // If no authorized senders defined, everyone is allowed
    if (!hasAuthorizedSenders) {
      return true;
    }

    // Normalize phone number for comparison
    const normalizedPhone = normalizePhone(senderPhone);
    
    // Check if sender is in the authorized list
    const result = await db.query(`
      SELECT 1 FROM transfer_authorized_senders 
      WHERE transfer_id = $1 AND (
        phone_number = $2 OR 
        phone_number = $3 OR
        $2 LIKE '%' || phone_number || '%' OR
        phone_number LIKE '%' || $3 || '%'
      )
    `, [transferId, senderPhone, normalizedPhone]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('[GroupTransfers] Error checking authorization:', error);
    return false;
  }
}

/**
 * Normalize phone number (remove @s.whatsapp.net, etc.)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.split('@')[0].replace(/\D/g, '');
}

/**
 * Format sender attribution with WhatsApp mention
 * Uses custom format with placeholders: (phone) and (name)
 * Returns { text, mentions } for proper WhatsApp mention
 */
function formatSenderAttribution(senderPhone, senderName, attributionFormat = '@(phone) ((name)): ') {
  const cleanPhone = normalizePhone(senderPhone);
  const displayName = (senderName && senderName !== cleanPhone && !/^\d+$/.test(senderName)) 
    ? senderName 
    : '';
  
  // WhatsApp mention format: @phone in text, phone@c.us in mentions array
  const mentionId = `${cleanPhone}@c.us`;
  
  // Apply custom format - replace placeholders
  let text = attributionFormat
    .replace('(phone)', cleanPhone)
    .replace('(name)', displayName)
    .replace('\\n', '\n'); // Support escaped newline
  
  // Clean up empty parentheses if name is empty
  if (!displayName) {
    text = text.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    // If format ends with just colon and space, keep it
    if (!text.endsWith(':') && !text.endsWith(': ')) {
      text = text.replace(/\s+$/, '') + ': ';
    }
  }
  
  return { text, mentions: [mentionId], cleanPhone };
}

/**
 * Process a group message and forward to other groups in the transfer
 */
async function processGroupMessage(params) {
  const {
    userId,
    transfer,
    sourceGroupId,
    senderPhone,
    senderName,
    senderLid,
    messageType,
    messageContent,
    mediaUrl,
    mediaBase64,
    mediaMimeType,
    mediaFilename,
    messageId,
    quotedMessageId
  } = params;

  console.log(`[GroupTransfers] Processing message for transfer "${transfer.name}" from group ${sourceGroupId}`);

  // Supported types: send with attribution in caption/text
  // Other types: try to forward with forwardMessage API (if messageId exists)
  const supportedTypes = ['text', 'image', 'video', 'audio', 'ptt', 'document'];
  const skipTypes = ['sticker']; // Types to skip entirely
  
  if (skipTypes.includes(messageType)) {
    console.log(`[GroupTransfers] Skipping message type: ${messageType}`);
    return { success: true, skipped: true, reason: `skipped type: ${messageType}` };
  }

  try {
    // Get all target groups except the source
    const targetsResult = await db.query(`
      SELECT * FROM group_transfer_targets 
      WHERE transfer_id = $1 AND is_active = true AND group_id != $2
      ORDER BY sort_order ASC
    `, [transfer.id, sourceGroupId]);

    const targetGroups = targetsResult.rows;
    
    if (targetGroups.length === 0) {
      console.log('[GroupTransfers] No target groups to forward to');
      return { success: true, sent: 0 };
    }

    // Get WhatsApp connection
    const connResult = await db.query(`
      SELECT * FROM whatsapp_connections 
      WHERE user_id = $1 AND status = 'connected' 
      ORDER BY connected_at DESC LIMIT 1
    `, [userId]);

    if (connResult.rows.length === 0) {
      console.error('[GroupTransfers] No active WhatsApp connection');
      return { success: false, error: 'No WhatsApp connection' };
    }

    const conn = connResult.rows[0];
    const attributionFormat = transfer.attribution_format || '@(phone) ((name)): ';
    const attribution = formatSenderAttribution(senderPhone, senderName, attributionFormat);
    console.log(`[GroupTransfers] Attribution: text="${attribution.text}", mentions=${JSON.stringify(attribution.mentions)}, format="${attributionFormat}"`);

    // Build connection object for waha service
    let wahaConnection;
    if (conn.connection_type === 'external') {
      wahaConnection = {
        base_url: decrypt(conn.external_base_url),
        api_key: decrypt(conn.external_api_key),
        session_name: conn.session_name
      };
    } else {
      const systemCreds = getWahaCredentials();
      wahaConnection = {
        base_url: systemCreds.baseUrl,
        api_key: systemCreds.apiKey,
        session_name: conn.session_name
      };
    }

    // Create a job record for tracking
    const jobResult = await db.query(`
      INSERT INTO transfer_jobs (
        user_id, transfer_id, transfer_name, status, message_type, 
        message_content, media_url, target_count, sender_phone, sender_name
      ) VALUES ($1, $2, $3, 'sending', $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId, transfer.id, transfer.name, messageType,
      messageContent, mediaUrl, targetGroups.length, senderPhone, senderName
    ]);

    const job = jobResult.rows[0];
    let sentCount = 0;
    let failedCount = 0;

    // Forward to each target group
    for (let i = 0; i < targetGroups.length; i++) {
      const target = targetGroups[i];
      
      try {
        // Random delay between min and max (default 1-3 seconds)
        if (i > 0) {
          const delayMin = transfer.delay_min || 1;
          const delayMax = transfer.delay_max || 3;
          const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Send based on message type
        let result;
        
        if (messageType === 'text') {
          // Text message: prepend attribution with mention
          const fullMessage = `${attribution.text}${messageContent}`;
          result = await wahaService.sendMessage(
            wahaConnection,
            target.group_id,
            fullMessage,
            attribution.mentions
          );
        } else if (messageType === 'image') {
          // Image: add attribution as caption with mentions
          const caption = messageContent 
            ? `${attribution.text}${messageContent}`
            : attribution.text.replace(/:\s*$/, ''); // Remove trailing colon if no content
          result = await wahaService.sendImage(
            wahaConnection,
            target.group_id,
            mediaUrl,
            caption,
            attribution.mentions
          );
        } else if (messageType === 'video') {
          // Video: add attribution as caption with mentions
          const caption = messageContent 
            ? `${attribution.text}${messageContent}`
            : attribution.text.replace(/:\s*$/, '');
          result = await wahaService.sendVideo(
            wahaConnection,
            target.group_id,
            mediaUrl,
            caption,
            attribution.mentions
          );
        } else if (messageType === 'audio' || messageType === 'ptt') {
          // Audio/PTT: send audio first, then attribution with mention
          result = await wahaService.sendVoice(
            wahaConnection,
            target.group_id,
            mediaUrl
          );
          
          // Send attribution as follow-up message with mention
          if (result) {
            await new Promise(resolve => setTimeout(resolve, 300));
            await wahaService.sendMessage(
              wahaConnection,
              target.group_id,
              attribution.text.replace(/:\s*$/, ''),
              attribution.mentions
            );
          }
        } else if (messageType === 'document') {
          // Document: send file with attribution caption and mentions
          // Use original filename if available
          const caption = messageContent 
            ? `${attribution.text}${messageContent}`
            : attribution.text.replace(/:\s*$/, '');
          const filename = mediaFilename || mediaUrl?.split('/').pop() || 'file';
          result = await wahaService.sendFile(
            wahaConnection,
            target.group_id,
            mediaUrl,
            filename,
            mediaMimeType,
            caption,
            attribution.mentions
          );
        } else {
          // Other types (product, catalog, etc.): try to forward if messageId exists
          if (!messageId) {
            console.log(`[GroupTransfers] Cannot forward ${messageType} - no messageId available`);
            continue;
          }
          
          console.log(`[GroupTransfers] Forwarding ${messageType} via forwardMessage`);
          
          // Forward the message
          result = await wahaService.forwardMessage(
            wahaConnection,
            target.group_id,
            messageId
          );
          
          // Send attribution as a separate message with mention
          await wahaService.sendMessage(
            wahaConnection,
            target.group_id,
            attribution.text.replace(/:\s*$/, ''),
            attribution.mentions
          );
        }

        // Record success
        await db.query(`
          INSERT INTO transfer_job_messages (job_id, group_id, group_name, status, message_id, sent_at)
          VALUES ($1, $2, $3, 'sent', $4, NOW())
        `, [job.id, target.group_id, target.group_name, result?.id || null]);
        
        sentCount++;
        console.log(`[GroupTransfers] Sent to ${target.group_name || target.group_id}`);

      } catch (error) {
        console.error(`[GroupTransfers] Failed to send to ${target.group_id}:`, error.message);
        
        await db.query(`
          INSERT INTO transfer_job_messages (job_id, group_id, group_name, status, error_message)
          VALUES ($1, $2, $3, 'failed', $4)
        `, [job.id, target.group_id, target.group_name, error.message]);
        
        failedCount++;
      }
    }

    // Update job status
    const finalStatus = failedCount === targetGroups.length ? 'failed' 
      : failedCount > 0 ? 'partial' 
      : 'completed';
    
    await db.query(`
      UPDATE transfer_jobs 
      SET status = $1, sent_count = $2, failed_count = $3, completed_at = NOW()
      WHERE id = $4
    `, [finalStatus, sentCount, failedCount, job.id]);

    console.log(`[GroupTransfers] Completed: ${sentCount} sent, ${failedCount} failed`);
    
    return { success: true, sent: sentCount, failed: failedCount };

  } catch (error) {
    console.error('[GroupTransfers] Error processing message:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  checkForTransferTrigger,
  checkSenderAuthorization,
  processGroupMessage,
  formatSenderAttribution,
  normalizePhone
};
