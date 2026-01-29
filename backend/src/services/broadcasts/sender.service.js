const db = require('../../config/database');
const wahaService = require('../waha/session.service');
const { getWahaCredentials } = require('../settings/system.service');
const { decrypt } = require('../crypto/encrypt.service');

// Track active campaign processes with detailed progress
const activeCampaigns = new Map();

/**
 * Update campaign progress
 */
function updateProgress(campaignId, data) {
  const current = activeCampaigns.get(campaignId) || {};
  activeCampaigns.set(campaignId, {
    ...current,
    ...data,
    lastUpdate: Date.now()
  });
}

/**
 * Get campaign progress
 */
function getCampaignProgress(campaignId) {
  return activeCampaigns.get(campaignId) || null;
}

/**
 * Get WAHA connection for a user (same logic as groupForwards)
 */
async function getWahaConnection(userId) {
  try {
    const connectionResult = await db.query(`
      SELECT * FROM whatsapp_connections 
      WHERE user_id = $1 AND status = 'connected'
      ORDER BY connected_at DESC LIMIT 1
    `, [userId]);
    
    if (connectionResult.rows.length === 0) {
      console.log(`[Broadcast Sender] No connected WhatsApp for user ${userId}`);
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
  } catch (error) {
    console.error('[Broadcast Sender] Error getting WAHA connection:', error);
    return null;
  }
}

/**
 * Save message to database (for live chat display)
 */
async function saveMessageToDatabase(userId, contactId, waMessageId, messageType, content, mediaUrl = null) {
  try {
    const result = await db.query(`
      INSERT INTO messages 
      (user_id, contact_id, wa_message_id, direction, message_type, content, media_url, status, sent_at)
      VALUES ($1, $2, $3, 'outgoing', $4, $5, $6, 'sent', NOW())
      RETURNING *
    `, [userId, contactId, waMessageId, messageType, content, mediaUrl]);
    
    return result.rows[0];
  } catch (error) {
    console.error('[Broadcast Sender] Error saving message to DB:', error);
    return null;
  }
}

/**
 * Add tag to contact
 */
async function addTagToContact(userId, contactId, tagName) {
  try {
    // Get or create tag
    let tagResult = await db.query(
      'SELECT id FROM contact_tags WHERE user_id = $1 AND name = $2',
      [userId, tagName]
    );
    
    let tagId;
    if (tagResult.rows.length === 0) {
      // Create tag with default color
      const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      tagResult = await db.query(
        'INSERT INTO contact_tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING id',
        [userId, tagName, randomColor]
      );
      tagId = tagResult.rows[0].id;
    } else {
      tagId = tagResult.rows[0].id;
    }
    
    // Add tag to contact
    await db.query(
      `INSERT INTO contact_tag_assignments (contact_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, tagId]
    );
    
    return true;
  } catch (error) {
    console.error('[Broadcast Sender] Error adding tag:', error);
    return false;
  }
}

/**
 * Set variable for contact
 */
async function setContactVariable(contactId, key, value) {
  try {
    await db.query(
      `INSERT INTO contact_variables (contact_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [contactId, key, String(value)]
    );
    return true;
  } catch (error) {
    console.error('[Broadcast Sender] Error setting variable:', error);
    return false;
  }
}

/**
 * Format date in Israel timezone
 */
function formatDateInIsrael() {
  const now = new Date();
  return now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

/**
 * Format time in Israel timezone
 */
function formatTimeInIsrael() {
  const now = new Date();
  return now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
}

/**
 * Start processing a campaign
 */
async function startCampaignSending(campaignId, userId) {
  console.log(`[Broadcast Sender] Starting campaign ${campaignId}`);
  
  // Check if already processing
  if (activeCampaigns.has(campaignId)) {
    console.log(`[Broadcast Sender] Campaign ${campaignId} already processing`);
    return;
  }
  
  // Get WAHA connection
  const connection = await getWahaConnection(userId);
  if (!connection) {
    console.error(`[Broadcast Sender] No WAHA connection for user ${userId}`);
    await db.query(`
      UPDATE broadcast_campaigns 
      SET status = 'failed', updated_at = NOW() 
      WHERE id = $1
    `, [campaignId]);
    return;
  }
  
  // Get campaign details
  const campaignResult = await db.query(`
    SELECT c.*, t.id as template_id, t.name as template_name
    FROM broadcast_campaigns c
    LEFT JOIN broadcast_templates t ON t.id = c.template_id
    WHERE c.id = $1
  `, [campaignId]);
  
  if (campaignResult.rows.length === 0) {
    console.error(`[Broadcast Sender] Campaign ${campaignId} not found`);
    return;
  }
  
  const campaign = campaignResult.rows[0];
  const settings = campaign.settings || {};
  const delayBetweenMessages = (settings.delay_between_messages || 2) * 1000;
  const delayBetweenBatches = (settings.delay_between_batches || 30) * 1000;
  const batchSize = settings.batch_size || 50;
  
  // Advanced settings for post-send actions
  const successTag = settings.success_tag || null;
  const variableMappings = settings.variable_mappings || {};
  
  // Mark as active with initial progress
  updateProgress(campaignId, {
    status: 'running',
    currentAction: 'מאתחל קמפיין...',
    currentRecipient: null,
    sent: 0,
    failed: 0,
    total: campaign.total_recipients || 0,
    startedAt: Date.now()
  });
  
  try {
    // Get template messages if using template
    let messages = [];
    updateProgress(campaignId, { currentAction: 'טוען תבנית הודעה...' });
    
    if (campaign.template_id) {
      const messagesResult = await db.query(`
        SELECT * FROM broadcast_template_messages 
        WHERE template_id = $1 
        ORDER BY message_order
      `, [campaign.template_id]);
      messages = messagesResult.rows;
    } else if (campaign.direct_message) {
      // Direct message
      messages = [{
        message_type: campaign.direct_media_url ? 'image' : 'text',
        content: campaign.direct_message,
        media_url: campaign.direct_media_url,
        delay_seconds: 0
      }];
    }
    
    if (messages.length === 0) {
      throw new Error('No messages to send');
    }
    
    // Process recipients in batches
    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;
    
    while (true) {
      // Check if campaign is still running
      const statusCheck = await db.query(
        'SELECT status FROM broadcast_campaigns WHERE id = $1',
        [campaignId]
      );
      
      if (statusCheck.rows[0]?.status !== 'running') {
        console.log(`[Broadcast Sender] Campaign ${campaignId} is no longer running`);
        break;
      }
      
      // Get batch of pending recipients
      const recipientsResult = await db.query(`
        SELECT * FROM broadcast_campaign_recipients 
        WHERE campaign_id = $1 AND status = 'pending'
        ORDER BY queued_at
        LIMIT $2
      `, [campaignId, batchSize]);
      
      if (recipientsResult.rows.length === 0) {
        console.log(`[Broadcast Sender] No more pending recipients for campaign ${campaignId}`);
        break;
      }
      
      console.log(`[Broadcast Sender] Processing batch of ${recipientsResult.rows.length} recipients`);
      updateProgress(campaignId, { 
        currentAction: `מעבד אצווה של ${recipientsResult.rows.length} נמענים...` 
      });
      
      // Process each recipient
      for (const recipient of recipientsResult.rows) {
        // Check again if campaign is paused/cancelled
        const currentStatus = activeCampaigns.get(campaignId)?.status;
        if (currentStatus === 'paused' || currentStatus === 'cancelled') {
          console.log(`[Broadcast Sender] Campaign ${campaignId} ${currentStatus}`);
          break;
        }
        
        // Update progress with current recipient
        updateProgress(campaignId, {
          currentAction: `שולח ל-${recipient.contact_name || recipient.phone}...`,
          currentRecipient: {
            phone: recipient.phone,
            name: recipient.contact_name
          }
        });
        
        try {
          // Update status to sending
          await db.query(`
            UPDATE broadcast_campaign_recipients 
            SET status = 'sending' 
            WHERE id = $1
          `, [recipient.id]);
          
          // Format phone number
          const chatId = recipient.phone.includes('@') 
            ? recipient.phone 
            : `${recipient.phone}@s.whatsapp.net`;
          
          // Send each message in the template
          const sentMessageIds = [];
          for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
            const msg = messages[msgIndex];
            
            // Replace variables in content
            let content = msg.content || '';
            content = content.replace(/\{\{name\}\}/g, recipient.contact_name || '');
            content = content.replace(/\{\{phone\}\}/g, recipient.phone || '');
            content = content.replace(/\{\{date\}\}/g, formatDateInIsrael());
            content = content.replace(/\{\{time\}\}/g, formatTimeInIsrael());
            content = content.replace(/\{\{campaign_name\}\}/g, campaign.name || '');
            
            // Wait for delay between messages in template (IMPORTANT: this is the delay BEFORE the message)
            if (msgIndex > 0 && msg.delay_seconds > 0) {
              updateProgress(campaignId, {
                currentAction: `ממתין ${msg.delay_seconds} שניות לפני הודעה ${msgIndex + 1}...`,
                waitingSeconds: msg.delay_seconds
              });
              await sleep(msg.delay_seconds * 1000);
            }
            
            // Update progress for message type
            const msgTypeLabels = { text: 'טקסט', image: 'תמונה', video: 'וידאו', audio: 'אודיו', document: 'קובץ' };
            updateProgress(campaignId, {
              currentAction: `שולח ${msgTypeLabels[msg.message_type] || msg.message_type} ל-${recipient.contact_name || recipient.phone}... (${msgIndex + 1}/${messages.length})`,
              currentMessageIndex: msgIndex + 1,
              totalMessages: messages.length,
              waitingSeconds: null
            });
            
            // Send based on message type
            let result;
            switch (msg.message_type) {
              case 'image':
                if (msg.media_url) {
                  result = await wahaService.sendImage(connection, chatId, msg.media_url, content);
                } else if (content) {
                  result = await wahaService.sendMessage(connection, chatId, content);
                }
                break;
              case 'video':
                if (msg.media_url) {
                  result = await wahaService.sendVideo(connection, chatId, msg.media_url, content);
                }
                break;
              case 'audio':
                if (msg.media_url) {
                  result = await wahaService.sendVoice(connection, chatId, msg.media_url);
                }
                break;
              case 'document':
                if (msg.media_url) {
                  // Extract filename and mimetype properly (like botEngine)
                  const filename = msg.media_url.split('/').pop()?.split('?')[0] || 'file';
                  const ext = filename.split('.').pop()?.toLowerCase();
                  const mimetypes = {
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'ppt': 'application/vnd.ms-powerpoint',
                    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'txt': 'text/plain',
                    'zip': 'application/zip',
                    'rar': 'application/x-rar-compressed',
                    'csv': 'text/csv',
                  };
                  const mimetype = mimetypes[ext] || 'application/octet-stream';
                  console.log(`[Broadcast Sender] Sending file: ${filename}, mimetype: ${mimetype}, caption: ${content?.substring(0, 30) || 'none'}`);
                  result = await wahaService.sendFile(connection, chatId, msg.media_url, filename, mimetype, content);
                }
                break;
              default: // text
                if (content) {
                  result = await wahaService.sendMessage(connection, chatId, content);
                }
                break;
            }
            
            if (result?.id) {
              sentMessageIds.push(result.id);
              
              // Save message to database for live chat display
              await saveMessageToDatabase(
                userId,
                recipient.contact_id,
                result.id,
                msg.message_type || 'text',
                content,
                msg.media_url
              );
            }
          }
          
          // Update recipient as sent
          await db.query(`
            UPDATE broadcast_campaign_recipients 
            SET status = 'sent', 
                sent_at = NOW(),
                waha_message_ids = $1
            WHERE id = $2
          `, [JSON.stringify(sentMessageIds), recipient.id]);
          
          totalSent++;
          
          // Update campaign stats
          await db.query(`
            UPDATE broadcast_campaigns 
            SET sent_count = sent_count + 1, updated_at = NOW()
            WHERE id = $1
          `, [campaignId]);
          
          // === POST-SEND ACTIONS FOR SUCCESSFUL SENDS ===
          
          // Add success tag if configured
          if (successTag && recipient.contact_id) {
            await addTagToContact(userId, recipient.contact_id, successTag);
          }
          
          // Set success variables if configured
          if (recipient.contact_id) {
            // Standard success variables
            if (variableMappings.send_date) {
              await setContactVariable(recipient.contact_id, variableMappings.send_date, formatDateInIsrael());
            }
            if (variableMappings.send_time) {
              await setContactVariable(recipient.contact_id, variableMappings.send_time, formatTimeInIsrael());
            }
            if (variableMappings.send_status) {
              await setContactVariable(recipient.contact_id, variableMappings.send_status, 'true');
            }
            if (variableMappings.campaign_name) {
              await setContactVariable(recipient.contact_id, variableMappings.campaign_name, campaign.name);
            }
            if (variableMappings.send_datetime) {
              await setContactVariable(recipient.contact_id, variableMappings.send_datetime, `${formatDateInIsrael()} ${formatTimeInIsrael()}`);
            }
          }
          
          // Update progress
          updateProgress(campaignId, {
            sent: totalSent,
            failed: totalFailed,
            currentAction: `נשלח בהצלחה ל-${recipient.contact_name || recipient.phone}`
          });
          
          console.log(`[Broadcast Sender] Sent to ${recipient.phone}`);
          
        } catch (error) {
          console.error(`[Broadcast Sender] Failed to send to ${recipient.phone}:`, error.message);
          
          const errorMessage = error.message?.substring(0, 500) || 'Unknown error';
          
          // Update recipient as failed
          await db.query(`
            UPDATE broadcast_campaign_recipients 
            SET status = 'failed', 
                error_message = $1
            WHERE id = $2
          `, [errorMessage, recipient.id]);
          
          totalFailed++;
          
          // Update campaign stats
          await db.query(`
            UPDATE broadcast_campaigns 
            SET failed_count = failed_count + 1, updated_at = NOW()
            WHERE id = $1
          `, [campaignId]);
          
          // === POST-SEND ACTIONS FOR FAILED SENDS ===
          if (recipient.contact_id) {
            if (variableMappings.send_status) {
              await setContactVariable(recipient.contact_id, variableMappings.send_status, 'false');
            }
            if (variableMappings.error_message) {
              await setContactVariable(recipient.contact_id, variableMappings.error_message, errorMessage);
            }
            if (variableMappings.send_date) {
              await setContactVariable(recipient.contact_id, variableMappings.send_date, formatDateInIsrael());
            }
            if (variableMappings.send_time) {
              await setContactVariable(recipient.contact_id, variableMappings.send_time, formatTimeInIsrael());
            }
          }
          
          // Update progress
          updateProgress(campaignId, {
            sent: totalSent,
            failed: totalFailed,
            currentAction: `שגיאה בשליחה ל-${recipient.contact_name || recipient.phone}: ${errorMessage?.substring(0, 50)}`
          });
        }
        
        // Delay between recipients (IMPORTANT: always apply this delay)
        const delaySeconds = delayBetweenMessages / 1000;
        updateProgress(campaignId, {
          currentAction: `ממתין ${delaySeconds} שניות לפני הנמען הבא...`,
          waitingSeconds: delaySeconds
        });
        await sleep(delayBetweenMessages);
      }
      
      // Delay between batches (IMPORTANT: always apply this delay when there are more recipients)
      if (recipientsResult.rows.length === batchSize) {
        const batchDelaySeconds = delayBetweenBatches / 1000;
        console.log(`[Broadcast Sender] Waiting ${batchDelaySeconds}s before next batch`);
        updateProgress(campaignId, {
          currentAction: `ממתין ${batchDelaySeconds} שניות לפני האצווה הבאה...`,
          waitingSeconds: batchDelaySeconds
        });
        await sleep(delayBetweenBatches);
      }
      
      offset += batchSize;
    }
    
    // Mark campaign as completed
    const finalStatusCheck = await db.query(
      'SELECT status FROM broadcast_campaigns WHERE id = $1',
      [campaignId]
    );
    
    if (finalStatusCheck.rows[0]?.status === 'running') {
      await db.query(`
        UPDATE broadcast_campaigns 
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [campaignId]);
      console.log(`[Broadcast Sender] Campaign ${campaignId} completed. Sent: ${totalSent}, Failed: ${totalFailed}`);
    }
    
  } catch (error) {
    console.error(`[Broadcast Sender] Campaign ${campaignId} error:`, error);
    await db.query(`
      UPDATE broadcast_campaigns 
      SET status = 'failed', updated_at = NOW()
      WHERE id = $1
    `, [campaignId]);
  } finally {
    activeCampaigns.delete(campaignId);
  }
}

/**
 * Pause a campaign
 */
function pauseCampaign(campaignId) {
  if (activeCampaigns.has(campaignId)) {
    const current = activeCampaigns.get(campaignId);
    activeCampaigns.set(campaignId, { ...current, status: 'paused' });
  }
}

/**
 * Cancel a campaign
 */
function cancelCampaign(campaignId) {
  if (activeCampaigns.has(campaignId)) {
    const current = activeCampaigns.get(campaignId);
    activeCampaigns.set(campaignId, { ...current, status: 'cancelled' });
  }
}

/**
 * Check if a campaign is active
 */
function isCampaignActive(campaignId) {
  return activeCampaigns.has(campaignId);
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  startCampaignSending,
  pauseCampaign,
  getCampaignProgress,
  cancelCampaign,
  isCampaignActive
};
