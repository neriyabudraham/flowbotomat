const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const axios = require('axios');

/**
 * Process incoming message for group forwards trigger
 * Called from webhook after bot engine processing
 */
async function processMessageForForwards(userId, senderPhone, messageData, chatId, payload) {
  try {
    // Check if this is a group message or direct message
    const isGroupMessage = chatId?.includes('@g.us');
    
    console.log(`[GroupForwards] Processing message - isGroup: ${isGroupMessage}, sender: ${senderPhone}, chat: ${chatId}`);
    
    // Find active forwards that might be triggered
    let forwards;
    
    if (isGroupMessage) {
      // Group message - find forwards listening to this group
      forwards = await db.query(`
        SELECT gf.*, 
          (SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = gf.id AND is_active = true) as target_count
        FROM group_forwards gf
        WHERE gf.user_id = $1 
          AND gf.is_active = true 
          AND gf.trigger_type = 'group'
          AND gf.trigger_group_id = $2
      `, [userId, chatId]);
    } else {
      // Direct message - find forwards with direct trigger
      forwards = await db.query(`
        SELECT gf.*, 
          (SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = gf.id AND is_active = true) as target_count
        FROM group_forwards gf
        WHERE gf.user_id = $1 
          AND gf.is_active = true 
          AND gf.trigger_type = 'direct'
      `, [userId]);
    }
    
    if (forwards.rows.length === 0) {
      console.log(`[GroupForwards] No matching forwards found for user ${userId}`);
      return;
    }
    
    // Check if sender is authorized for each forward
    for (const forward of forwards.rows) {
      // Check authorized senders
      const authCheck = await db.query(`
        SELECT * FROM forward_authorized_senders 
        WHERE forward_id = $1 AND phone_number = $2
      `, [forward.id, senderPhone]);
      
      // Also check if there are no authorized senders (means anyone can trigger)
      const totalAuthSenders = await db.query(`
        SELECT COUNT(*) as count FROM forward_authorized_senders WHERE forward_id = $1
      `, [forward.id]);
      
      const isAuthorized = totalAuthSenders.rows[0].count === 0 || authCheck.rows.length > 0;
      
      if (!isAuthorized) {
        console.log(`[GroupForwards] Sender ${senderPhone} not authorized for forward ${forward.id}`);
        continue;
      }
      
      if (forward.target_count === 0) {
        console.log(`[GroupForwards] Forward ${forward.id} has no target groups`);
        continue;
      }
      
      console.log(`[GroupForwards] ✅ Triggering forward ${forward.id} (${forward.name}) for sender ${senderPhone}`);
      
      // Create the forward job
      await createTriggerJob(userId, forward, senderPhone, messageData, payload);
    }
    
  } catch (error) {
    console.error('[GroupForwards] Trigger processing error:', error);
  }
}

/**
 * Create a forward job from webhook trigger
 */
async function createTriggerJob(userId, forward, senderPhone, messageData, payload) {
  try {
    // Determine message type and extract media if needed
    let messageType = messageData.type;
    let messageText = messageData.content;
    let mediaUrl = messageData.mediaUrl;
    let mediaMimeType = messageData.mimeType;
    let mediaFilename = messageData.filename;
    
    // For media messages, download the media first
    if (['image', 'video', 'audio'].includes(messageType) && payload.mediaUrl) {
      mediaUrl = payload.mediaUrl;
      mediaMimeType = payload.mimetype;
      mediaFilename = payload.filename;
    }
    
    // Create job
    const jobResult = await db.query(`
      INSERT INTO forward_jobs (
        forward_id, user_id, message_type, message_text, 
        media_url, media_mime_type, media_filename,
        sender_phone, sender_name, total_targets, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      forward.id,
      userId,
      messageType === 'list_response' ? 'text' : messageType,
      messageText,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
      senderPhone,
      payload._data?.Info?.PushName || senderPhone,
      forward.target_count,
      forward.require_confirmation ? 'pending' : 'confirmed'
    ]);
    
    const job = jobResult.rows[0];
    
    // Create job messages for each target
    const targets = await db.query(`
      SELECT * FROM group_forward_targets 
      WHERE forward_id = $1 AND is_active = true
      ORDER BY sort_order ASC
    `, [forward.id]);
    
    for (const target of targets.rows) {
      await db.query(`
        INSERT INTO forward_job_messages (job_id, target_id, status)
        VALUES ($1, $2, 'pending')
      `, [job.id, target.id]);
    }
    
    console.log(`[GroupForwards] Created trigger job ${job.id} for forward ${forward.id} with ${forward.target_count} targets`);
    
    // Send confirmation message or start sending
    if (forward.require_confirmation) {
      await sendConfirmationMessage(userId, senderPhone, forward, job);
    } else {
      // Start sending immediately
      const { startForwardJob } = require('../../controllers/groupForwards/jobs.controller');
      startForwardJob(job.id).catch(err => {
        console.error(`[GroupForwards] Error starting job ${job.id}:`, err);
      });
      
      // Notify sender that sending has started
      await sendNotificationMessage(userId, senderPhone, `📤 מתחיל לשלוח את ההודעה ל-${forward.target_count} קבוצות...`);
    }
    
  } catch (error) {
    console.error('[GroupForwards] Create trigger job error:', error);
  }
}

/**
 * Send confirmation message to sender via WhatsApp
 */
async function sendConfirmationMessage(userId, senderPhone, forward, job) {
  try {
    // Get WhatsApp connection
    const connectionResult = await db.query(`
      SELECT * FROM whatsapp_connections 
      WHERE user_id = $1 AND status = 'connected'
      LIMIT 1
    `, [userId]);
    
    if (connectionResult.rows.length === 0) {
      console.log('[GroupForwards] No WhatsApp connection for confirmation message');
      return;
    }
    
    const connection = connectionResult.rows[0];
    const creds = getWahaCredentials();
    const chatId = `${senderPhone}@s.whatsapp.net`;
    
    // Create confirmation message with list buttons
    const messageText = `📋 *העברת הודעות: ${forward.name}*

ההודעה שלך מוכנה להישלח ל-*${forward.target_count}* קבוצות.

🆔 מזהה משימה: \`${job.id.slice(0, 8)}\`

לחץ על אחת מהאפשרויות:`;
    
    // Send message with buttons using WAHA
    const response = await axios.post(
      `${creds.baseUrl}/api/sendButtons`,
      {
        session: connection.session_name,
        chatId: chatId,
        text: messageText,
        buttons: [
          { id: `forward_confirm_${job.id}`, text: '✅ שלח' },
          { id: `forward_cancel_${job.id}`, text: '❌ בטל' }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': creds.apiKey
        }
      }
    );
    
    console.log(`[GroupForwards] Sent confirmation message for job ${job.id}`);
    
  } catch (error) {
    console.error('[GroupForwards] Send confirmation error:', error.message);
    
    // Fallback to regular text message
    try {
      await sendNotificationMessage(userId, senderPhone, 
        `📋 *העברת הודעות: ${forward.name}*\n\n` +
        `ההודעה שלך מוכנה להישלח ל-*${forward.target_count}* קבוצות.\n\n` +
        `🆔 מזהה משימה: ${job.id.slice(0, 8)}\n\n` +
        `השב "שלח" לאישור או "בטל" לביטול.`
      );
    } catch (err) {
      console.error('[GroupForwards] Fallback notification error:', err.message);
    }
  }
}

/**
 * Send a simple notification message
 */
async function sendNotificationMessage(userId, phone, text) {
  try {
    const connectionResult = await db.query(`
      SELECT * FROM whatsapp_connections 
      WHERE user_id = $1 AND status = 'connected'
      LIMIT 1
    `, [userId]);
    
    if (connectionResult.rows.length === 0) return;
    
    const connection = connectionResult.rows[0];
    const creds = getWahaCredentials();
    const chatId = `${phone}@s.whatsapp.net`;
    
    await axios.post(
      `${creds.baseUrl}/api/sendText`,
      {
        session: connection.session_name,
        chatId: chatId,
        text: text
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': creds.apiKey
        }
      }
    );
    
  } catch (error) {
    console.error('[GroupForwards] Send notification error:', error.message);
  }
}

/**
 * Handle confirmation/cancellation response
 * Called when user replies to confirmation message
 */
async function handleConfirmationResponse(userId, senderPhone, messageContent, selectedButtonId) {
  try {
    // Check for button response or text response
    let jobId = null;
    let action = null;
    
    if (selectedButtonId) {
      // Button click
      if (selectedButtonId.startsWith('forward_confirm_')) {
        jobId = selectedButtonId.replace('forward_confirm_', '');
        action = 'confirm';
      } else if (selectedButtonId.startsWith('forward_cancel_')) {
        jobId = selectedButtonId.replace('forward_cancel_', '');
        action = 'cancel';
      }
    } else {
      // Text response - check for pending job and text
      const lowerContent = messageContent?.toLowerCase()?.trim();
      
      if (lowerContent === 'שלח' || lowerContent === 'send') {
        action = 'confirm';
      } else if (lowerContent === 'בטל' || lowerContent === 'cancel') {
        action = 'cancel';
      }
      
      if (action) {
        // Find pending job for this user
        const pendingJob = await db.query(`
          SELECT fj.* FROM forward_jobs fj
          WHERE fj.user_id = $1 
            AND fj.sender_phone = $2
            AND fj.status = 'pending'
          ORDER BY fj.created_at DESC
          LIMIT 1
        `, [userId, senderPhone]);
        
        if (pendingJob.rows.length > 0) {
          jobId = pendingJob.rows[0].id;
        }
      }
    }
    
    if (!jobId || !action) {
      return false; // Not a confirmation response
    }
    
    console.log(`[GroupForwards] Handling ${action} for job ${jobId}`);
    
    // Get job
    const jobResult = await db.query(`
      SELECT fj.*, gf.name as forward_name
      FROM forward_jobs fj
      JOIN group_forwards gf ON fj.forward_id = gf.id
      WHERE fj.id = $1 AND fj.user_id = $2 AND fj.status = 'pending'
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה ממתינה.');
      return true;
    }
    
    const job = jobResult.rows[0];
    
    if (action === 'confirm') {
      // Update status and start sending
      await db.query(`
        UPDATE forward_jobs SET status = 'confirmed', updated_at = NOW()
        WHERE id = $1
      `, [jobId]);
      
      await sendNotificationMessage(userId, senderPhone, 
        `✅ מתחיל לשלוח את ההודעה ל-${job.total_targets} קבוצות...`
      );
      
      // Start sending
      const { startForwardJob } = require('../../controllers/groupForwards/jobs.controller');
      startForwardJob(jobId).catch(err => {
        console.error(`[GroupForwards] Error starting job ${jobId}:`, err);
      });
      
    } else {
      // Cancel job
      await db.query(`
        UPDATE forward_jobs SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [jobId]);
      
      await sendNotificationMessage(userId, senderPhone, '❌ המשימה בוטלה.');
    }
    
    return true;
    
  } catch (error) {
    console.error('[GroupForwards] Handle confirmation error:', error);
    return false;
  }
}

module.exports = {
  processMessageForForwards,
  handleConfirmationResponse
};
