const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const { decrypt } = require('../crypto/encrypt.service');
const { checkContactLimit } = require('../limits.service');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Download media from URL and save locally to uploads folder
 * Returns the local URL or the original URL if download fails
 */
async function downloadAndSaveMedia(mediaUrl, mimeType, originalFilename) {
  try {
    if (!mediaUrl) return mediaUrl;
    
    // Determine type folder
    let type = 'misc';
    if (mimeType?.startsWith('image/')) type = 'image';
    else if (mimeType?.startsWith('video/')) type = 'video';
    else if (mimeType?.startsWith('audio/')) type = 'audio';
    
    // Ensure directory exists
    const uploadsDir = path.join(__dirname, '../../../uploads', type);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Generate unique filename
    const ext = originalFilename 
      ? path.extname(originalFilename) 
      : (mimeType?.includes('jpeg') || mimeType?.includes('jpg') ? '.jpeg' : 
         mimeType?.includes('png') ? '.png' :
         mimeType?.includes('mp4') ? '.mp4' :
         mimeType?.includes('webm') ? '.webm' :
         mimeType?.includes('ogg') ? '.ogg' :
         mimeType?.includes('mpeg') || mimeType?.includes('mp3') ? '.mp3' : '');
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${uniqueId}${ext}`;
    const savePath = path.join(uploadsDir, filename);
    
    // Build URLs to try (with WAHA API key for auth)
    const creds = getWahaCredentials();
    const wahaBaseUrl = (creds.baseUrl || process.env.WAHA_BASE_URL || '').replace(/\/$/, '');
    const wahaApiKey = creds.apiKey || process.env.WAHA_API_KEY;
    const headers = wahaApiKey ? { 'X-Api-Key': wahaApiKey } : {};
    
    const urlsToTry = [];
    // If it's a WAHA URL, try with internal base URL first
    if (mediaUrl.includes('/api/files/session_')) {
      try {
        const urlObj = new URL(mediaUrl);
        const pathPart = urlObj.pathname;
        if (wahaBaseUrl) {
          urlsToTry.push({ url: `${wahaBaseUrl}${pathPart}`, label: 'WAHA internal' });
        }
      } catch (e) {}
    }
    urlsToTry.push({ url: mediaUrl, label: 'original' });
    
    // Try each URL
    for (const attempt of urlsToTry) {
      try {
        console.log(`[MediaDownload] Trying ${attempt.label}: ${attempt.url.substring(0, 80)}...`);
        const response = await axios.get(attempt.url, { 
          responseType: 'arraybuffer',
          timeout: 30000,
          headers
        });
        
        fs.writeFileSync(savePath, response.data);
        
        // Build absolute URL
        let baseApiUrl = process.env.API_URL || '';
        if (baseApiUrl.startsWith('/') || !baseApiUrl.startsWith('http')) {
          const frontendUrl = (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
          baseApiUrl = `${frontendUrl}${baseApiUrl.startsWith('/') ? baseApiUrl : '/api'}`;
        }
        const localUrl = `${baseApiUrl}/uploads/${type}/${filename}`;
        
        console.log(`[MediaDownload] Saved locally: ${localUrl} (${response.data.length} bytes)`);
        return localUrl;
      } catch (dlErr) {
        console.error(`[MediaDownload] ${attempt.label} failed:`, dlErr.message);
      }
    }
    
    console.error(`[MediaDownload] All download attempts failed, using original URL`);
    return mediaUrl;
    
  } catch (error) {
    console.error(`[MediaDownload] Failed to download media:`, error.message);
    return mediaUrl; // Fallback to original URL
  }
}

/**
 * Save outgoing message to the database for Live Chat display
 */
async function saveOutgoingMessage(userId, chatId, messageType, content, mediaUrl = null, mimeType = null, filename = null, metadata = null, waMessageId = null, displayName = null) {
  try {
    // Extract phone/group ID from chatId (remove @s.whatsapp.net or @g.us)
    const phone = chatId.split('@')[0] + (chatId.includes('@g.us') ? '@g.us' : '');
    const isGroup = chatId.includes('@g.us');
    
    // Log removed for cleaner output
    
    // Get or create contact
    let contact = await db.query(
      'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
      [userId, phone]
    );
    
    if (contact.rows.length === 0) {
      // Check contact limit for non-groups
      if (!isGroup) {
        try {
          const limitCheck = await checkContactLimit(userId);
          if (!limitCheck.allowed) {
            console.log(`[GroupForwards] ⛔ User ${userId} over contact limit (${limitCheck.used}/${limitCheck.limit}) - NOT creating contact`);
            return null;
          }
        } catch (limitErr) {
          console.log('[GroupForwards] Error checking contact limit:', limitErr.message);
        }
      }
      
      // Create contact - use displayName if available, otherwise leave null to show phone
      const contactName = displayName || null;
      // Log removed
      contact = await db.query(
        `INSERT INTO contacts (user_id, phone, wa_id, display_name)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, phone, chatId, contactName]
      );
    }
    
    const contactId = contact.rows[0].id;
    // Log removed
    
    // Save message - match schema used in other places
    const result = await db.query(`
      INSERT INTO messages 
      (user_id, contact_id, wa_message_id, direction, message_type, content, media_url, media_mime_type, media_filename, metadata, status, sent_at)
      VALUES ($1, $2, $3, 'outgoing', $4, $5, $6, $7, $8, $9, 'sent', NOW())
      RETURNING *
    `, [
      userId,
      contactId,
      waMessageId,
      messageType,
      content,
      mediaUrl,
      mimeType,
      filename,
      metadata ? JSON.stringify(metadata) : null
    ]);
    
    // Update contact's last message time
    await db.query(
      `UPDATE contacts SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [contactId]
    );
    
    // Log removed
    
    return result.rows[0];
    
  } catch (error) {
    console.error('[GroupForwards] Failed to save outgoing message:', error.message, error.stack);
    return null;
  }
}

/**
 * Normalize phone number for comparison
 * Handles Israeli numbers in various formats
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digits
  let normalized = phone.replace(/\D/g, '');
  
  // Remove leading zeros
  normalized = normalized.replace(/^0+/, '');
  
  // Remove Israel country code (972)
  if (normalized.startsWith('972')) {
    normalized = normalized.substring(3);
  }
  
  return normalized;
}

/**
 * Get WAHA connection details for a user
 */
async function getWahaConnection(userId) {
  const connectionResult = await db.query(`
    SELECT * FROM whatsapp_connections 
    WHERE user_id = $1 AND status = 'connected'
    ORDER BY connected_at DESC LIMIT 1
  `, [userId]);
  
  if (connectionResult.rows.length === 0) {
    return null;
  }
  
  const connection = connectionResult.rows[0];
  let baseUrl, apiKey;
  
  if (connection.connection_type === 'external') {
    baseUrl = decrypt(connection.external_base_url);
    apiKey = decrypt(connection.external_api_key);
  } else {
    const systemCreds = getWahaCredentials();
    baseUrl = systemCreds.baseUrl;
    apiKey = systemCreds.apiKey;
  }
  
  return {
    ...connection,
    base_url: baseUrl,
    api_key: apiKey
  };
}

/**
 * Process incoming message for group forwards trigger
 * Returns true if a forward was triggered (to prevent bot engine from also responding)
 */
async function processMessageForForwards(userId, senderPhone, messageData, chatId, payload) {
  try {
    // Skip list responses - these should only be handled by handleConfirmationResponse
    if (messageData.type === 'list_response' || messageData.selectedRowId) {
      // Skipping list response
      return false;
    }
    
    const isGroupMessage = chatId?.includes('@g.us');
    
    
    // Find active forwards that might be triggered
    let forwards;
    
    if (isGroupMessage) {
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
      return false;
    }
    
    let anyForwardTriggered = false;
    
    // Check if sender is authorized for each forward
    for (const forward of forwards.rows) {
      const normalizedPhone = normalizePhoneNumber(senderPhone);
      
      const authSendersResult = await db.query(`
        SELECT phone_number FROM forward_authorized_senders WHERE forward_id = $1
      `, [forward.id]);
      
      const totalAuthSenders = authSendersResult.rows.length;
      
      // Only authorized if explicitly in the list - if no senders defined, no one can trigger
      if (totalAuthSenders === 0) {
        console.log(`[GroupForwards] Forward ${forward.id} has no authorized senders defined - skipping`);
        continue;
      }
      
      let isAuthorized = false;
      for (const auth of authSendersResult.rows) {
        const normalizedAuth = normalizePhoneNumber(auth.phone_number);
        if (normalizedPhone === normalizedAuth) {
          isAuthorized = true;
          break;
        }
      }
      
      if (!isAuthorized) {
        continue;
      }
      
      if (forward.target_count === 0) {
        console.log(`[GroupForwards] Forward ${forward.id} has no target groups`);
        continue;
      }
      
      await createTriggerJob(userId, forward, senderPhone, messageData, payload);
      anyForwardTriggered = true;
    }
    
    return anyForwardTriggered;
    
  } catch (error) {
    console.error('[GroupForwards] Trigger processing error:', error);
    return false;
  }
}

/**
 * Create a forward job from webhook trigger
 */
async function createTriggerJob(userId, forward, senderPhone, messageData, payload) {
  // Log reduced
  
  try {
    // Determine message type and extract media
    let messageType = messageData.type;
    let messageText = messageData.content || '';
    let mediaUrl = null;
    let mediaMimeType = null;
    let mediaFilename = null;
    
    // Logs removed
    
    // Handle different message types
    if (messageType === 'image' || messageType === 'video' || messageType === 'audio') {
      // Get media URL from payload or messageData
      mediaUrl = payload.mediaUrl || messageData.mediaUrl;
      mediaMimeType = payload.mimetype || messageData.mimeType;
      mediaFilename = payload.filename || messageData.filename;
      
      // Log removed
      
      if (!mediaUrl) {
        console.log(`[GroupForwards] No media URL found, skipping`);
        await sendNotificationMessage(userId, senderPhone, '❌ לא הצלחתי לקבל את המדיה. אנא נסה שוב.');
        return;
      }
      
      // Download and save media locally so it persists after WAHA restart
      mediaUrl = await downloadAndSaveMedia(mediaUrl, mediaMimeType, mediaFilename);
    } else if (messageType === 'list_response') {
      messageType = 'text';
    }
    
    // Create job - save forward_name so it persists even if forward is deleted
    const jobResult = await db.query(`
      INSERT INTO forward_jobs (
        forward_id, user_id, message_type, message_text, 
        media_url, media_mime_type, media_filename,
        sender_phone, sender_name, total_targets, status, forward_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      forward.id,
      userId,
      messageType,
      messageText,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
      senderPhone,
      payload._data?.Info?.PushName || senderPhone,
      forward.target_count,
      forward.require_confirmation ? 'pending' : 'confirmed',
      forward.name
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
    
    // Job created
    
    // Send confirmation or start sending
    if (forward.require_confirmation) {
      await sendConfirmationList(userId, senderPhone, forward, job);
    } else {
      await sendStartList(userId, senderPhone, job.id, forward.target_count);
      
      const { startForwardJob } = require('../../controllers/groupForwards/jobs.controller');
      startForwardJob(job.id).catch(err => {
        console.error(`[GroupForwards] Error starting job ${job.id}:`, err);
      });
    }
    
  } catch (error) {
    console.error('[GroupForwards] Create trigger job error:', error);
  }
}

/**
 * Send confirmation list message to sender
 */
async function sendConfirmationList(userId, senderPhone, forward, job) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) {
      console.log('[GroupForwards] No WhatsApp connection for confirmation');
      return;
    }
    
    const chatId = `${senderPhone}@s.whatsapp.net`;
    const wahaService = require('../waha/session.service');
    
    // Build list message - concise version with schedule option
    const listData = {
      title: `📤 ${forward.name}`,
      body: `לשלוח ל-*${forward.target_count}* קבוצות?`,
      buttonText: 'בחר פעולה',
      buttons: [
        { title: '✅ שלח עכשיו', rowId: `fwd_confirm_${job.id}` },
        { title: '⏰ תזמן שליחה', rowId: `fwd_schedule_${job.id}` },
        { title: '❌ בטל', rowId: `fwd_cancel_${job.id}` }
      ]
    };
    
    await wahaService.sendList(wahaConnection, chatId, listData);
    // Confirmation list sent
    
    // Save to Live Chat
    await saveOutgoingMessage(
      userId, 
      chatId, 
      'list', 
      listData.body,
      null, null, null,
      { title: listData.title, buttonText: listData.buttonText, buttons: listData.buttons }
    );
    
  } catch (error) {
    console.error('[GroupForwards] Send confirmation list error:', error.message);
    // Fallback to text
    await sendNotificationMessage(userId, senderPhone, 
      `📤 *${forward.name}*\n\nלשלוח ל-${forward.target_count} קבוצות?\n\nהשב "שלח" או "בטל"`
    );
  }
}

/**
 * Send start message with stop options as list
 */
async function sendStartList(userId, senderPhone, jobId, targetCount) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) return;
    
    const chatId = `${senderPhone}@s.whatsapp.net`;
    const wahaService = require('../waha/session.service');
    
    const listData = {
      title: `📤 שליחה ל-${targetCount} קבוצות`,
      body: `ההודעה נשלחת כעת...`,
      buttonText: 'עצירה',
      buttons: [
        { title: '⏹️ עצור', rowId: `fwd_stop_${jobId}` },
        { title: '🗑️ עצור ומחק', rowId: `fwd_stopdelete_${jobId}` }
      ]
    };
    
    await wahaService.sendList(wahaConnection, chatId, listData);
    
    // Save to Live Chat
    await saveOutgoingMessage(
      userId, 
      chatId, 
      'list', 
      listData.body,
      null, null, null,
      { title: listData.title, buttonText: listData.buttonText, buttons: listData.buttons }
    );
    
  } catch (error) {
    console.error('[GroupForwards] Send start list error:', error.message);
    // Fallback to text
    await sendNotificationMessage(userId, senderPhone, 
      `📤 מתחיל לשלוח את ההודעה ל-${targetCount} קבוצות...\n\nהשב "עצור" לעצירה או "מחק" לעצירה ומחיקה.`
    );
  }
}

/**
 * Send progress list with stop options
 */
async function sendProgressList(userId, senderPhone, jobId, sent, total) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) return;
    
    const chatId = `${senderPhone}@s.whatsapp.net`;
    const wahaService = require('../waha/session.service');
    
    const listData = {
      title: `📤 נשלחו ${sent}/${total}`,
      body: `השליחה בתהליך...`,
      buttonText: 'עצירה',
      buttons: [
        { title: '⏹️ עצור', rowId: `fwd_stop_${jobId}` },
        { title: '🗑️ עצור ומחק', rowId: `fwd_stopdelete_${jobId}` }
      ]
    };
    
    await wahaService.sendList(wahaConnection, chatId, listData);
    
    // Save to Live Chat
    await saveOutgoingMessage(
      userId, 
      chatId, 
      'list', 
      listData.body,
      null, null, null,
      { title: listData.title, buttonText: listData.buttonText, buttons: listData.buttons }
    );
    
  } catch (error) {
    console.error('[GroupForwards] Send progress list error:', error.message);
  }
}

/**
 * Send completion message
 */
async function sendCompletionMessage(userId, senderPhone, jobId, sent, failed, total) {
  try {
    let message;
    
    if (failed === 0 && sent === total) {
      message = `✅ *השליחה הושלמה בהצלחה!*\n\nההודעה נשלחה ל-*${sent}* קבוצות.`;
    } else if (sent === 0) {
      message = `❌ *השליחה נכשלה*\n\nלא הצלחתי לשלוח לאף קבוצה.`;
    } else {
      message = `⚠️ *השליחה הסתיימה*\n\n✅ נשלח: *${sent}* קבוצות\n❌ נכשל: *${failed}* קבוצות`;
    }
    
    await sendNotificationMessage(userId, senderPhone, message);
    
  } catch (error) {
    console.error('[GroupForwards] Send completion error:', error.message);
  }
}

/**
 * Send stopped message
 */
async function sendStoppedMessage(userId, senderPhone, sent, total, willDelete = false) {
  try {
    let message = `⏹️ *השליחה נעצרה*\n\nנשלחו *${sent}* מתוך *${total}* קבוצות.`;
    
    if (willDelete) {
      message += `\n\n🗑️ מוחק את ההודעות שנשלחו...`;
    }
    
    await sendNotificationMessage(userId, senderPhone, message);
    
  } catch (error) {
    console.error('[GroupForwards] Send stopped error:', error.message);
  }
}

/**
 * Send completion summary to the trigger group
 */
async function sendGroupCompletionSummary(userId, groupId, sent, failed, total, wasStopped = false) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) return;
    
    let message;
    
    if (wasStopped) {
      message = `⏹️ *העברת הודעות הופסקה*\nנשלחו ${sent}/${total} קבוצות`;
    } else if (failed === 0 && sent === total) {
      message = `✅ *העברת הודעות הושלמה*\nההודעה נשלחה ל-${sent} קבוצות`;
    } else if (sent === 0) {
      message = `❌ *העברת הודעות נכשלה*`;
    } else {
      message = `⚠️ *העברת הודעות הסתיימה*\n✅ ${sent} קבוצות | ❌ ${failed} נכשלו`;
    }
    
    const response = await axios.post(
      `${wahaConnection.base_url}/api/sendText`,
      {
        session: wahaConnection.session_name,
        chatId: groupId,
        text: message
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': wahaConnection.api_key
        }
      }
    );
    
    // Save to Live Chat
    await saveOutgoingMessage(userId, groupId, 'text', message, null, null, null, null, response.data?.id);
    
    // Completion summary sent
    
  } catch (error) {
    console.error('[GroupForwards] Send group completion summary error:', error.message);
  }
}

/**
 * Send a simple notification message
 */
async function sendNotificationMessage(userId, phone, text) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) return;
    
    const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    
    const response = await axios.post(
      `${wahaConnection.base_url}/api/sendText`,
      {
        session: wahaConnection.session_name,
        chatId: chatId,
        text: text
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': wahaConnection.api_key
        }
      }
    );
    
    // Save to Live Chat
    await saveOutgoingMessage(userId, chatId, 'text', text, null, null, null, null, response.data?.id);
    
  } catch (error) {
    console.error('[GroupForwards] Send notification error:', error.message);
  }
}

/**
 * Handle list response for forwards
 */
async function handleConfirmationResponse(userId, senderPhone, messageContent, selectedRowId) {
  try {
    // Button clicks with fwd_ prefix are always allowed (they contain the job ID)
    if (selectedRowId?.startsWith('fwd_')) {
      console.log(`[GroupForwards] Processing list response: ${selectedRowId}`);
    }
    
    // For text messages (not button clicks), verify this sender has a RECENT active job
    // This prevents random people in groups from triggering scheduling responses
    // Also prevents stale pending_time jobs from catching random numbers
    if (!selectedRowId || !selectedRowId.startsWith('fwd_')) {
      // First: cancel stale pending/pending_time jobs (older than 1 hour)
      await db.query(`
        UPDATE forward_jobs SET status = 'cancelled', updated_at = NOW()
        WHERE status IN ('pending', 'pending_time') AND updated_at < NOW() - INTERVAL '1 hour'
      `).catch(() => {});
      
      const normalizedPhone = normalizePhoneNumber(senderPhone);
      const withCountryCode = normalizedPhone ? '972' + normalizedPhone : '';
      const hasActiveJob = await db.query(`
        SELECT 1 FROM forward_jobs 
        WHERE user_id = $1 
          AND (sender_phone = $2 OR sender_phone = $3 OR sender_phone = $4
               OR REPLACE(sender_phone, '+', '') = $2
               OR REGEXP_REPLACE(sender_phone, '^(\\+?972|0+)', '') = $3)
          AND status IN ('pending', 'pending_time', 'sending')
          AND updated_at > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `, [userId, senderPhone, normalizedPhone, withCountryCode]);
      
      const hasPendingReschedule = await db.query(`
        SELECT 1 FROM pending_reschedules 
        WHERE user_id = $1 
          AND (sender_phone = $2 OR sender_phone = $3 OR sender_phone = $4
               OR REPLACE(sender_phone, '+', '') = $2
               OR REGEXP_REPLACE(sender_phone, '^(\\+?972|0+)', '') = $3)
          AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `, [userId, senderPhone, normalizedPhone, withCountryCode]);
      
      if (hasActiveJob.rows.length === 0 && hasPendingReschedule.rows.length === 0) {
        return false;
      }
    }
    
    // Check for list response (button click)
    if (selectedRowId) {
      // Log already printed above
      
      // If it's a forward-related response, always return true to prevent creating new jobs
      const isForwardResponse = selectedRowId.startsWith('fwd_');
      
      // Parse the row ID
      if (selectedRowId.startsWith('fwd_confirm_')) {
        const jobId = selectedRowId.replace('fwd_confirm_', '');
        await handleConfirm(userId, senderPhone, jobId);
        return true;
      }
      
      if (selectedRowId.startsWith('fwd_schedule_')) {
        const jobId = selectedRowId.replace('fwd_schedule_', '');
        await handleSchedulePrompt(userId, senderPhone, jobId);
        return true;
      }
      
      if (selectedRowId.startsWith('fwd_cancel_')) {
        const jobId = selectedRowId.replace('fwd_cancel_', '');
        await handleCancel(userId, senderPhone, jobId);
        return true;
      }
      
      if (selectedRowId.startsWith('fwd_stop_')) {
        const jobId = selectedRowId.replace('fwd_stop_', '');
        await handleStop(userId, senderPhone, jobId, false);
        return true;
      }
      
      if (selectedRowId.startsWith('fwd_stopdelete_')) {
        const jobId = selectedRowId.replace('fwd_stopdelete_', '');
        await handleStop(userId, senderPhone, jobId, true);
        return true;
      }
      
      // Handle day selection for scheduling
      if (selectedRowId.startsWith('fwd_day_')) {
        const parts = selectedRowId.replace('fwd_day_', '').split('_');
        const jobId = parts[0];
        const dayOffset = parts[1];
        await handleDaySelection(userId, senderPhone, jobId, dayOffset);
        return true;
      }
      
      // Handle back button from schedule menu
      if (selectedRowId.startsWith('fwd_back_')) {
        const jobId = selectedRowId.replace('fwd_back_', '');
        await handleScheduleBack(userId, senderPhone, jobId);
        return true;
      }
      
      // Handle scheduled forward cancel
      if (selectedRowId.startsWith('fwd_sched_cancel_')) {
        const scheduledId = selectedRowId.replace('fwd_sched_cancel_', '');
        await handleScheduledCancel(userId, senderPhone, scheduledId);
        return true;
      }
      
      // Handle scheduled forward delete (stop + delete sent messages)
      if (selectedRowId.startsWith('fwd_sched_delete_')) {
        const scheduledId = selectedRowId.replace('fwd_sched_delete_', '');
        await handleScheduledDelete(userId, senderPhone, scheduledId);
        return true;
      }
      
      // Handle scheduled forward change time
      if (selectedRowId.startsWith('fwd_sched_change_')) {
        const scheduledId = selectedRowId.replace('fwd_sched_change_', '');
        await handleScheduledChangeTime(userId, senderPhone, scheduledId);
        return true;
      }
      
      // Handle scheduled forward day selection (for reschedule)
      if (selectedRowId.startsWith('fwd_rsched_day_')) {
        const parts = selectedRowId.replace('fwd_rsched_day_', '').split('_');
        const scheduledId = parts[0];
        const dayOffset = parseInt(parts[1], 10);
        await handleScheduledDaySelection(userId, senderPhone, scheduledId, dayOffset);
        return true;
      }
      
      // If it's a forward-related response but we didn't handle it, still return true
      // to prevent creating a new job
      if (isForwardResponse) {
        console.log(`[GroupForwards] Unhandled forward response: ${selectedRowId}`);
        return true;
      }
    }
    
    // Check for time input (when waiting for schedule time)
    // Gate check above already verified this sender has an active job
    if (messageContent && /^\d{1,4}:?\d{0,2}$/.test(messageContent.trim())) {
      const handled = await handleScheduleTimeInput(userId, senderPhone, messageContent.trim());
      if (handled) return true;
    }
    
    // Check for text response
    const lowerContent = messageContent?.toLowerCase()?.trim();
    
    if (lowerContent === 'שלח' || lowerContent === 'send') {
      return await handleTextConfirm(userId, senderPhone, 'confirm');
    }
    
    if (lowerContent === 'בטל' || lowerContent === 'cancel') {
      return await handleTextConfirm(userId, senderPhone, 'cancel');
    }
    
    if (lowerContent === 'עצור' || lowerContent === 'stop') {
      return await handleTextStop(userId, senderPhone, false);
    }
    
    if (lowerContent === 'מחק' || lowerContent === 'delete') {
      return await handleTextStop(userId, senderPhone, true);
    }
    
    return false;
    
  } catch (error) {
    console.error('[GroupForwards] Handle confirmation error:', error);
    return false;
  }
}

/**
 * Handle confirm action
 */
async function handleConfirm(userId, senderPhone, jobId) {
  // First check if job exists at all
  const jobExistsResult = await db.query(`
    SELECT fj.id, fj.status, fj.user_id, gf.name as forward_name
    FROM forward_jobs fj
    LEFT JOIN group_forwards gf ON fj.forward_id = gf.id
    WHERE fj.id = $1
  `, [jobId]);
  
  if (jobExistsResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה ממתינה.');
    return true;
  }
  
  const existingJob = jobExistsResult.rows[0];
  
  // Check if job belongs to user
  if (existingJob.user_id !== userId) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה ממתינה.');
    return true;
  }
  
  // Check if job is in pending status
  if (existingJob.status !== 'pending') {
    
    if (existingJob.status === 'sending') {
      await sendNotificationMessage(userId, senderPhone, '⏳ המשימה כבר בתהליך שליחה.');
    } else if (existingJob.status === 'completed') {
      await sendNotificationMessage(userId, senderPhone, '✅ המשימה כבר הושלמה.');
    } else if (existingJob.status === 'stopped' || existingJob.status === 'cancelled') {
      await sendNotificationMessage(userId, senderPhone, '❌ המשימה בוטלה.');
    } else {
      await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה ממתינה.');
    }
    return true;
  }
  
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
  
  // Update status
  await db.query(`
    UPDATE forward_jobs SET status = 'confirmed', updated_at = NOW()
    WHERE id = $1
  `, [jobId]);
  
  await sendStartList(userId, senderPhone, jobId, job.total_targets);
  
  // Start sending
  const { startForwardJob } = require('../../controllers/groupForwards/jobs.controller');
  startForwardJob(jobId).catch(err => {
    console.error(`[GroupForwards] Error starting job ${jobId}:`, err);
  });
  
  return true;
}

/**
 * Handle cancel action
 */
async function handleCancel(userId, senderPhone, jobId) {
  await db.query(`
    UPDATE forward_jobs SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND user_id = $2
  `, [jobId, userId]);
  
  await sendNotificationMessage(userId, senderPhone, '❌ המשימה בוטלה.');
  return true;
}

/**
 * Handle stop action
 */
async function handleStop(userId, senderPhone, jobId, shouldDelete) {
  // First check if job exists and belongs to user (any status)
  const jobResult = await db.query(`
    SELECT * FROM forward_jobs 
    WHERE id = $1 AND user_id = $2
  `, [jobId, userId]);
  
  if (jobResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה.');
    return true;
  }
  
  const job = jobResult.rows[0];
  
  // If job is still running, stop it
  if (job.status === 'sending') {
    // Set stop flag
    await db.query(`
      UPDATE forward_jobs 
      SET stop_requested = true, delete_sent_requested = $2, updated_at = NOW()
      WHERE id = $1
    `, [jobId, shouldDelete]);
    
    await sendStoppedMessage(userId, senderPhone, job.sent_count, job.total_targets, shouldDelete);
    return true;
  }
  
  // If job is completed/stopped and delete requested, delete the sent messages
  if (shouldDelete && ['completed', 'stopped', 'partial'].includes(job.status)) {
    // Check how many messages are left to delete
    const remainingMessages = await db.query(`
      SELECT COUNT(*) as count FROM forward_job_messages 
      WHERE job_id = $1 AND status = 'sent' AND whatsapp_message_id IS NOT NULL
    `, [jobId]);
    
    const remainingCount = parseInt(remainingMessages.rows[0]?.count || 0);
    
    if (remainingCount === 0) {
      await sendNotificationMessage(userId, senderPhone, '✅ כל ההודעות משליחה זו כבר נמחקו.');
      return true;
    }
    
    await sendNotificationMessage(userId, senderPhone, `🗑️ מוחק ${remainingCount} הודעות שנשארו...`);
    
    // Import and call delete function with senderPhone for completion notification
    const { deleteJobMessages } = require('../../controllers/groupForwards/jobs.controller');
    deleteJobMessages(jobId, senderPhone).catch(err => {
      console.error(`[GroupForwards] Error deleting messages for completed job ${jobId}:`, err);
    });
    
    return true;
  }
  
  // Job exists but not in a deletable state
  if (!shouldDelete) {
    await sendNotificationMessage(userId, senderPhone, '❌ המשימה כבר הסתיימה.');
  } else {
    await sendNotificationMessage(userId, senderPhone, '❌ לא ניתן למחוק - המשימה בסטטוס לא מתאים.');
  }
  
  return true;
}

/**
 * Handle text-based confirm/cancel
 */
async function handleTextConfirm(userId, senderPhone, action) {
  const normalizedPhone = normalizePhoneNumber(senderPhone);
  const withCountryCode = normalizedPhone ? '972' + normalizedPhone : '';
  const pendingJob = await db.query(`
    SELECT fj.*, gf.name as forward_name
    FROM forward_jobs fj
    JOIN group_forwards gf ON fj.forward_id = gf.id
    WHERE fj.user_id = $1 
      AND (fj.sender_phone = $2 OR fj.sender_phone = $3 OR fj.sender_phone = $4
           OR REGEXP_REPLACE(fj.sender_phone, '^(\\+?972|0+)', '') = $3)
      AND fj.status = 'pending'
    ORDER BY fj.created_at DESC
    LIMIT 1
  `, [userId, senderPhone, normalizedPhone, withCountryCode]);
  
  if (pendingJob.rows.length === 0) {
    return false;
  }
  
  const job = pendingJob.rows[0];
  
  if (action === 'confirm') {
    return await handleConfirm(userId, senderPhone, job.id);
  } else {
    return await handleCancel(userId, senderPhone, job.id);
  }
}

/**
 * Handle text-based stop
 */
async function handleTextStop(userId, senderPhone, shouldDelete) {
  const normalizedPhone = normalizePhoneNumber(senderPhone);
  const withCountryCode = normalizedPhone ? '972' + normalizedPhone : '';
  const activeJob = await db.query(`
    SELECT * FROM forward_jobs 
    WHERE user_id = $1 
      AND (sender_phone = $2 OR sender_phone = $3 OR sender_phone = $4
           OR REGEXP_REPLACE(sender_phone, '^(\\+?972|0+)', '') = $3)
      AND status = 'sending'
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId, senderPhone, normalizedPhone, withCountryCode]);
  
  if (activeJob.rows.length === 0) {
    return false;
  }
  
  return await handleStop(userId, senderPhone, activeJob.rows[0].id, shouldDelete);
}

// Hebrew day names
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * Get current date/time in Israel timezone
 * Returns a Date object with Israel local time values
 */
function getNowInIsrael() {
  const now = new Date();
  const israelStr = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse: MM/DD/YYYY, HH:MM:SS
  const [datePart, timePart] = israelStr.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Convert Israel time string to UTC Date
 */
function convertIsraelTimeToUTC(israelDateTimeStr) {
  const [datePart, timePart] = israelDateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
  
  const refDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const israelStr = refDate.toLocaleString('en-US', { 
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false 
  });
  const israelHour = parseInt(israelStr);
  const utcHour = refDate.getUTCHours();
  const offsetHours = israelHour - utcHour;
  
  return new Date(Date.UTC(year, month - 1, day, hours - offsetHours, minutes, seconds));
}

/**
 * Parse flexible time input (like Status Bot)
 */
function parseTimeInput(input) {
  const cleaned = input.replace(/[^\d:]/g, '');
  
  let hours, minutes;
  
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[1]) || 0;
  } else if (cleaned.length >= 3) {
    if (cleaned.length === 4) {
      hours = parseInt(cleaned.substring(0, 2));
      minutes = parseInt(cleaned.substring(2, 4));
    } else {
      hours = parseInt(cleaned.substring(0, cleaned.length - 2));
      minutes = parseInt(cleaned.substring(cleaned.length - 2));
    }
  } else {
    hours = parseInt(cleaned);
    minutes = 0;
  }
  
  if (isNaN(hours) || hours < 0 || hours > 23) return null;
  if (isNaN(minutes) || minutes < 0 || minutes > 59) return null;
  
  return { hours, minutes };
}

/**
 * Handle schedule prompt - show day selection list (like Status Bot)
 */
async function handleSchedulePrompt(userId, senderPhone, jobId) {
  // Verify job exists and belongs to user
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
  
  // Mark job as waiting for schedule input
  await db.query(`
    UPDATE forward_jobs SET 
      status = 'pending_schedule',
      updated_at = NOW()
    WHERE id = $1
  `, [jobId]);
  
  // Send day selection list (like Status Bot)
  const wahaConnection = await getWahaConnection(userId);
  if (!wahaConnection) {
    return true;
  }
  
  const chatId = `${senderPhone}@s.whatsapp.net`;
  const wahaService = require('../waha/session.service');
  
  try {
    // Generate next 8 days including today (use Israel timezone)
    const days = [];
    const nowIsrael = getNowInIsrael();
    
    for (let i = 0; i < 8; i++) {
      const date = new Date(nowIsrael);
      date.setDate(date.getDate() + i);
      
      const dayOfWeek = DAY_NAMES[date.getDay()];
      const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
      
      let title = `יום ${dayOfWeek} - ${dateStr}`;
      if (i === 0) title = `היום - ${dayOfWeek}`;
      if (i === 1) title = `מחר - ${dayOfWeek}`;
      
      days.push({
        title,
        rowId: `fwd_day_${jobId}_${i}`
      });
    }
    
    // Add back button
    days.push({ title: '🔙 חזרה', rowId: `fwd_back_${jobId}` });
    
    const listData = {
      title: `⏰ תזמון - ${job.forward_name}`,
      body: `באיזה יום לשלוח ל-*${job.total_targets}* קבוצות?`,
      buttonText: 'בחר יום',
      buttons: days
    };
    
    await wahaService.sendList(wahaConnection, chatId, listData);
    
    // Save to Live Chat
    await saveOutgoingMessage(
      userId, 
      chatId, 
      'list', 
      listData.body,
      null, null, null,
      { title: listData.title, buttonText: listData.buttonText, buttons: listData.buttons }
    );
    
  } catch (error) {
    console.error('[GroupForwards] Send schedule list error:', error.message);
    await sendNotificationMessage(userId, senderPhone, 
      `⏰ *תזמון - ${job.forward_name}*\n\nבאיזה יום לשלוח?\n• "היום"\n• "מחר"\n• או מספר ימים (0-7)\n\nאו השב "בטל" לביטול.`
    );
  }
  
  return true;
}

/**
 * Handle day selection - ask for time (like Status Bot)
 */
async function handleDaySelection(userId, senderPhone, jobId, dayOffset) {
  const offset = parseInt(dayOffset);
  
  // Use Israel timezone for date calculation
  const nowIsrael = getNowInIsrael();
  const scheduledDate = new Date(nowIsrael);
  scheduledDate.setDate(scheduledDate.getDate() + offset);
  
  // Format date as YYYY-MM-DD
  const year = scheduledDate.getFullYear();
  const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
  const day = String(scheduledDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // Update job status to pending_time and store scheduled date
  const updateResult = await db.query(`
    UPDATE forward_jobs SET 
      status = 'pending_time',
      scheduled_date = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING id, status, sender_phone
  `, [dateStr, jobId]);
  
  // Get job details
  const jobResult = await db.query(`
    SELECT fj.*, gf.name as forward_name
    FROM forward_jobs fj
    JOIN group_forwards gf ON fj.forward_id = gf.id
    WHERE fj.id = $1
  `, [jobId]);
  
  if (jobResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה.');
    return true;
  }
  
  const job = jobResult.rows[0];
  const dayName = DAY_NAMES[scheduledDate.getDay()];
  const dateDisplay = `${scheduledDate.getDate()}/${scheduledDate.getMonth() + 1}`;
  
  await sendNotificationMessage(userId, senderPhone, 
    `📅 נבחר: יום ${dayName}, ${dateDisplay}\n\n⏰ באיזו שעה לתזמן?\n\nשלח את השעה בפורמט: 13:00\n(מקבל גם 1300 או 13)`
  );
  
  return true;
}

/**
 * Handle time input for scheduling (text message)
 */
async function handleScheduleTimeInput(userId, senderPhone, timeInput) {
  // Normalize phone number for matching
  const normalizedPhone = normalizePhoneNumber(senderPhone);
  const withCountryCode = normalizedPhone ? '972' + normalizedPhone : '';
  
  // Clean up stale pending_reschedules (older than 1 hour)
  await db.query(`DELETE FROM pending_reschedules WHERE created_at < NOW() - INTERVAL '1 hour'`).catch(() => {});
  
  // FIRST: Check for RECENT pending_time forward jobs (new schedule takes priority over reschedule)
  const jobResult = await db.query(`
    SELECT fj.*, gf.name as forward_name, gf.id as forward_id
    FROM forward_jobs fj
    JOIN group_forwards gf ON fj.forward_id = gf.id
    WHERE fj.user_id = $1 AND fj.status = 'pending_time'
      AND (fj.sender_phone = $2 OR fj.sender_phone = $3 OR fj.sender_phone = $4
           OR REGEXP_REPLACE(fj.sender_phone, '^(\\+?972|0+)', '') = $3)
      AND fj.updated_at > NOW() - INTERVAL '1 hour'
    ORDER BY fj.updated_at DESC
    LIMIT 1
  `, [userId, senderPhone, normalizedPhone, withCountryCode]);
  
  if (jobResult.rows.length > 0) {
    console.log(`[GroupForwards] Found pending_time job ${jobResult.rows[0].id} for time input "${timeInput}"`);
    return await processNewScheduleTime(userId, senderPhone, timeInput, jobResult.rows[0]);
  }
  
  // SECOND: Check for pending reschedule
  const reschedResult = await db.query(`
    SELECT pr.*, sf.forward_id, gf.name as forward_name
    FROM pending_reschedules pr
    JOIN scheduled_forwards sf ON sf.id = pr.scheduled_id
    JOIN group_forwards gf ON gf.id = sf.forward_id
    WHERE pr.user_id = $1 
      AND (pr.sender_phone = $2 OR pr.sender_phone = $3 OR pr.sender_phone = $4
           OR REGEXP_REPLACE(pr.sender_phone, '^(\\+?972|0+)', '') = $3)
      AND sf.status = 'pending'
    ORDER BY pr.created_at DESC LIMIT 1
  `, [userId, senderPhone, normalizedPhone, withCountryCode]);
  
  if (reschedResult.rows.length > 0) {
    console.log(`[GroupForwards] Found pending reschedule ${reschedResult.rows[0].id} for time input "${timeInput}"`);
    return await handleRescheduleTimeInput(userId, senderPhone, timeInput, reschedResult.rows[0]);
  }
  
  console.log(`[GroupForwards] No pending_time job or reschedule found for phone=${senderPhone} normalized=${normalizedPhone}`);
  return false;
}

/**
 * Process time input for a NEW schedule (from forward_jobs with pending_time status)
 */
async function processNewScheduleTime(userId, senderPhone, timeInput, job) {
  const parsedTime = parseTimeInput(timeInput);
  
  if (!parsedTime) {
    await sendNotificationMessage(userId, senderPhone, 'פורמט שעה לא תקין, אנא נסה שוב (לדוגמא 13:00)');
    return true;
  }
  
  // Get the stored date
  const rawDate = job.scheduled_date;
  if (!rawDate) {
    await sendNotificationMessage(userId, senderPhone, 'לא נבחר תאריך, אנא התחל מחדש');
    await db.query(`UPDATE forward_jobs SET status = 'cancelled' WHERE id = $1`, [job.id]);
    return true;
  }
  
  // Format date properly - PostgreSQL DATE may come as Date object or string
  let dateStr;
  if (rawDate instanceof Date) {
    const year = rawDate.getFullYear();
    const month = String(rawDate.getMonth() + 1).padStart(2, '0');
    const day = String(rawDate.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else if (typeof rawDate === 'string') {
    dateStr = rawDate.split('T')[0];
  } else {
    await sendNotificationMessage(userId, senderPhone, 'שגיאה בעיבוד התאריך, אנא התחל מחדש');
    return true;
  }
  
  // Build scheduled time (convert from Israel time to UTC)
  const timeStr = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`;
  const scheduledAt = convertIsraelTimeToUTC(`${dateStr}T${timeStr}:00`);
  
  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    console.error(`[GroupForwards] Invalid scheduledAt generated from dateStr=${dateStr}, timeStr=${timeStr}`);
    await sendNotificationMessage(userId, senderPhone, 'שגיאה ביצירת התזמון, אנא נסה שוב');
    return true;
  }
  
  if (scheduledAt <= new Date()) {
    await sendNotificationMessage(userId, senderPhone, 'לא ניתן לתזמן לזמן שעבר, אנא בחר שעה עתידית');
    return true;
  }
  
  // Create scheduled forward entry
  const insertResult = await db.query(`
    INSERT INTO scheduled_forwards 
    (user_id, forward_id, message_type, message_content, media_url, media_filename, scheduled_at, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING id
  `, [
    userId,
    job.forward_id,
    job.message_type,
    job.message_text,
    job.media_url,
    job.media_filename,
    scheduledAt
  ]);
  
  const scheduledId = insertResult.rows[0].id;
  
  // Cancel the original job
  await db.query(`
    UPDATE forward_jobs SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1
  `, [job.id]);
  
  const hebrewDate = scheduledAt.toLocaleString('he-IL', { 
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric', 
    month: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit'
  });
  
  // Send list with action buttons
  const targetCount = await db.query(`
    SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = $1 AND is_active = true
  `, [job.forward_id]);
  
  const wahaConnection = await getWahaConnection(userId);
  if (wahaConnection) {
    const wahaService = require('../waha/session.service');
    const chatId = `${senderPhone}@s.whatsapp.net`;
    const listData = {
      title: `✅ תוזמן בהצלחה`,
      body: `📤 ${job.forward_name}\n📅 יום ${hebrewDate}\n📊 יישלח ל-${targetCount.rows[0].count} קבוצות`,
      buttonText: 'אפשרויות',
      buttons: [
        { title: '⏹️ עצור וביטול', rowId: `fwd_sched_cancel_${scheduledId}` },
        { title: '🗑️ עצור ומחק', rowId: `fwd_sched_delete_${scheduledId}` },
        { title: '🕐 שנה תזמון', rowId: `fwd_sched_change_${scheduledId}` }
      ]
    };
    await wahaService.sendList(wahaConnection, chatId, listData);
    await saveOutgoingMessage(userId, senderPhone, 'list', `תזמון: ${job.forward_name}`);
  }
  
  return true;
}

/**
 * Handle back button - return to confirm/cancel menu
 */
async function handleScheduleBack(userId, senderPhone, jobId) {
  // Restore job to pending status
  const jobResult = await db.query(`
    UPDATE forward_jobs SET status = 'pending', updated_at = NOW()
    WHERE id = $1 AND user_id = $2 AND status IN ('pending_schedule', 'pending_time')
    RETURNING *
  `, [jobId, userId]);
  
  if (jobResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצאה משימה.');
    return true;
  }
  
  // Get forward details
  const forwardResult = await db.query(`
    SELECT gf.* FROM group_forwards gf
    JOIN forward_jobs fj ON fj.forward_id = gf.id
    WHERE fj.id = $1
  `, [jobId]);
  
  if (forwardResult.rows.length > 0) {
    await sendConfirmationList(userId, senderPhone, forwardResult.rows[0], jobResult.rows[0]);
  }
  
  return true;
}

/**
 * Cancel a scheduled forward (stop if in progress, cancel if pending)
 */
async function handleScheduledCancel(userId, senderPhone, scheduledId) {
  // Get scheduled forward
  const schedResult = await db.query(`
    SELECT sf.*, gf.name as forward_name
    FROM scheduled_forwards sf
    JOIN group_forwards gf ON gf.id = sf.forward_id
    WHERE sf.id = $1 AND sf.user_id = $2
  `, [scheduledId, userId]);
  
  if (schedResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצא תזמון.');
    return;
  }
  
  const scheduled = schedResult.rows[0];
  
  // If job is running, stop it
  if (scheduled.job_id) {
    await db.query(`
      UPDATE forward_jobs SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'running')
    `, [scheduled.job_id]);
  }
  
  // Cancel the scheduled forward
  await db.query(`
    UPDATE scheduled_forwards SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1
  `, [scheduledId]);
  
  await sendNotificationMessage(userId, senderPhone, 
    `✅ התזמון בוטל בהצלחה!\n\n📤 ${scheduled.forward_name}`
  );
}

/**
 * Stop and delete messages from a scheduled forward
 */
async function handleScheduledDelete(userId, senderPhone, scheduledId) {
  // Get scheduled forward
  const schedResult = await db.query(`
    SELECT sf.*, gf.name as forward_name
    FROM scheduled_forwards sf
    JOIN group_forwards gf ON gf.id = sf.forward_id
    WHERE sf.id = $1 AND sf.user_id = $2
  `, [scheduledId, userId]);
  
  if (schedResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצא תזמון.');
    return;
  }
  
  const scheduled = schedResult.rows[0];
  let deletedCount = 0;
  
  // If job exists, stop it and delete sent messages
  if (scheduled.job_id) {
    // Stop the job
    await db.query(`
      UPDATE forward_jobs SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
    `, [scheduled.job_id]);
    
    // Get sent message IDs
    const messagesResult = await db.query(`
      SELECT sent_message_id, group_id FROM forward_job_messages
      WHERE job_id = $1 AND sent_message_id IS NOT NULL
    `, [scheduled.job_id]);
    
    // Delete messages
    const wahaConnection = await getWahaConnection(userId);
    if (wahaConnection) {
      for (const msg of messagesResult.rows) {
        try {
          await axios.post(
            `${wahaConnection.base_url}/api/deleteMessage`,
            {
              session: wahaConnection.session_name,
              chatId: msg.group_id,
              messageId: msg.sent_message_id
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': wahaConnection.api_key
              }
            }
          );
          deletedCount++;
        } catch (err) {
          console.error(`[GroupForwards] Failed to delete message:`, err.message);
        }
      }
    }
  }
  
  // Cancel the scheduled forward
  await db.query(`
    UPDATE scheduled_forwards SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1
  `, [scheduledId]);
  
  await sendNotificationMessage(userId, senderPhone, 
    `✅ התזמון בוטל${deletedCount > 0 ? ` ו-${deletedCount} הודעות נמחקו` : ''}\n\n📤 ${scheduled.forward_name}`
  );
}

/**
 * Change scheduled time for a forward
 */
async function handleScheduledChangeTime(userId, senderPhone, scheduledId) {
  // Get and LOCK the scheduled forward to prevent cron from executing it during reschedule
  const schedResult = await db.query(`
    UPDATE scheduled_forwards SET status = 'rescheduling', updated_at = NOW()
    WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'rescheduling')
    RETURNING *, (SELECT name FROM group_forwards WHERE id = forward_id) as forward_name
  `, [scheduledId, userId]);
  
  if (schedResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצא תזמון פעיל.');
    return;
  }
  
  const scheduled = schedResult.rows[0];
  
  // Get target count
  const targetCount = await db.query(`
    SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = $1 AND is_active = true
  `, [scheduled.forward_id]);
  
  // Generate day list (8 days from today)
  const now = getNowInIsrael();
  const days = [];
  
  for (let i = 0; i < 8; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    
    let title;
    if (i === 0) {
      title = `היום - ${DAY_NAMES[date.getDay()]}`;
    } else if (i === 1) {
      title = `מחר - ${DAY_NAMES[date.getDay()]}`;
    } else {
      title = `${DAY_NAMES[date.getDay()]} - ${date.getDate()}/${date.getMonth() + 1}`;
    }
    
    days.push({
      title,
      rowId: `fwd_rsched_day_${scheduledId}_${i}`
    });
  }
  
  const wahaConnection = await getWahaConnection(userId);
  if (wahaConnection) {
    const wahaService = require('../waha/session.service');
    const chatId = `${senderPhone}@s.whatsapp.net`;
    const listData = {
      title: `🕐 שינוי תזמון`,
      body: `📤 ${scheduled.forward_name}\nבחר יום חדש לשליחה:`,
      buttonText: 'בחר יום',
      buttons: days
    };
    await wahaService.sendList(wahaConnection, chatId, listData);
    await saveOutgoingMessage(userId, senderPhone, 'list', `שינוי תזמון: ${scheduled.forward_name}`);
  }
}

/**
 * Handle day selection for rescheduling
 */
async function handleScheduledDaySelection(userId, senderPhone, scheduledId, dayOffset) {
  // Get scheduled forward (accept both pending and rescheduling status)
  const schedResult = await db.query(`
    SELECT sf.*, gf.name as forward_name
    FROM scheduled_forwards sf
    JOIN group_forwards gf ON gf.id = sf.forward_id
    WHERE sf.id = $1 AND sf.user_id = $2 AND sf.status IN ('pending', 'rescheduling')
  `, [scheduledId, userId]);
  
  if (schedResult.rows.length === 0) {
    await sendNotificationMessage(userId, senderPhone, '❌ לא נמצא תזמון פעיל.');
    return;
  }
  
  const scheduled = schedResult.rows[0];
  
  // Calculate scheduled date
  const now = getNowInIsrael();
  const selectedDate = new Date(now);
  selectedDate.setDate(selectedDate.getDate() + dayOffset);
  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  
  // Update scheduled forward with pending_time status (using a temp column or just storing in memory)
  await db.query(`
    UPDATE scheduled_forwards 
    SET updated_at = NOW()
    WHERE id = $1
  `, [scheduledId]);
  
  // Store the date temporarily by saving to a pending_reschedule entry
  await db.query(`
    INSERT INTO pending_reschedules (user_id, scheduled_id, selected_date, sender_phone, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id, scheduled_id) DO UPDATE SET selected_date = $3, sender_phone = $4, created_at = NOW()
  `, [userId, scheduledId, dateStr, senderPhone]);
  
  const hebrewDate = selectedDate.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric'
  });
  
  await sendNotificationMessage(userId, senderPhone,
    `📅 נבחר: יום ${hebrewDate}\n\n⏰ באיזו שעה לתזמן?\n\nשלח את השעה בפורמט: 13:00\n(מקבל גם 1300 או 13)`
  );
  
  await saveOutgoingMessage(userId, senderPhone, 'text', 'בקשת שעה לשינוי תזמון');
}

/**
 * Handle time input for rescheduling
 */
async function handleRescheduleTimeInput(userId, senderPhone, timeInput, pendingReschedule) {
  const parsedTime = parseTimeInput(timeInput);
  
  if (!parsedTime) {
    await sendNotificationMessage(userId, senderPhone, 'פורמט שעה לא תקין, אנא נסה שוב (לדוגמא 13:00)');
    return true;
  }
  
  const rawDate = pendingReschedule.selected_date;
  let dateStr;
  if (rawDate instanceof Date) {
    const year = rawDate.getFullYear();
    const month = String(rawDate.getMonth() + 1).padStart(2, '0');
    const day = String(rawDate.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else if (typeof rawDate === 'string') {
    dateStr = rawDate.split('T')[0];
  } else {
    await sendNotificationMessage(userId, senderPhone, 'שגיאה בעיבוד התאריך, אנא התחל מחדש');
    return true;
  }
  const timeStr = `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`;
  const scheduledAt = convertIsraelTimeToUTC(`${dateStr}T${timeStr}:00`);
  
  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    await sendNotificationMessage(userId, senderPhone, 'שגיאה ביצירת התזמון, אנא נסה שוב');
    return true;
  }
  
  if (scheduledAt <= new Date()) {
    await sendNotificationMessage(userId, senderPhone, 'לא ניתן לתזמן לזמן שעבר, אנא בחר שעה עתידית');
    return true;
  }
  
  // Update the scheduled forward with new time and restore to pending status
  await db.query(`
    UPDATE scheduled_forwards SET scheduled_at = $1, status = 'pending', updated_at = NOW()
    WHERE id = $2
  `, [scheduledAt, pendingReschedule.scheduled_id]);
  
  // Delete the pending reschedule
  await db.query(`
    DELETE FROM pending_reschedules WHERE id = $1
  `, [pendingReschedule.id]);
  
  const hebrewDate = scheduledAt.toLocaleString('he-IL', { 
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric', 
    month: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit'
  });
  
  // Get target count
  const targetCount = await db.query(`
    SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = $1 AND is_active = true
  `, [pendingReschedule.forward_id]);
  
  // Send list with action buttons
  const wahaConnection = await getWahaConnection(userId);
  if (wahaConnection) {
    const wahaService = require('../waha/session.service');
    const chatId = `${senderPhone}@s.whatsapp.net`;
    const listData = {
      title: `✅ התזמון עודכן`,
      body: `📤 ${pendingReschedule.forward_name}\n📅 יום ${hebrewDate}\n📊 יישלח ל-${targetCount.rows[0].count} קבוצות`,
      buttonText: 'אפשרויות',
      buttons: [
        { title: '⏹️ עצור וביטול', rowId: `fwd_sched_cancel_${pendingReschedule.scheduled_id}` },
        { title: '🗑️ עצור ומחק', rowId: `fwd_sched_delete_${pendingReschedule.scheduled_id}` },
        { title: '🕐 שנה תזמון', rowId: `fwd_sched_change_${pendingReschedule.scheduled_id}` }
      ]
    };
    await wahaService.sendList(wahaConnection, chatId, listData);
    await saveOutgoingMessage(userId, senderPhone, 'list', `עדכון תזמון: ${pendingReschedule.forward_name}`);
  }
  
  return true;
}

/**
 * Get message type label in Hebrew
 */
function getMessageTypeLabel(type) {
  const labels = {
    'text': '📝 טקסט',
    'image': '🖼️ תמונה',
    'video': '🎬 סרטון',
    'audio': '🎤 הקלטה'
  };
  return labels[type] || type;
}

module.exports = {
  processMessageForForwards,
  handleConfirmationResponse,
  sendCompletionMessage,
  sendStartList,
  sendProgressList,
  sendStoppedMessage,
  sendGroupCompletionSummary,
  sendNotificationMessage,
  normalizePhoneNumber,
  downloadAndSaveMedia
};
