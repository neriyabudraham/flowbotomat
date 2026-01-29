const db = require('../../config/database');
const wahaService = require('../waha/session.service');
const { getWahaCredentials } = require('../settings/system.service');
const { decrypt } = require('../crypto/encrypt.service');

// Track active campaign processes
const activeCampaigns = new Map();

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
    SELECT c.*, t.id as template_id
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
  
  // Mark as active
  activeCampaigns.set(campaignId, { status: 'running' });
  
  try {
    // Get template messages if using template
    let messages = [];
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
      
      // Process each recipient
      for (const recipient of recipientsResult.rows) {
        // Check again if campaign is paused/cancelled
        const currentStatus = activeCampaigns.get(campaignId)?.status;
        if (currentStatus === 'paused' || currentStatus === 'cancelled') {
          console.log(`[Broadcast Sender] Campaign ${campaignId} ${currentStatus}`);
          break;
        }
        
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
          for (const msg of messages) {
            // Replace variables in content
            let content = msg.content || '';
            content = content.replace(/\{\{name\}\}/g, recipient.contact_name || '');
            content = content.replace(/\{\{phone\}\}/g, recipient.phone || '');
            
            // Wait for delay between messages
            if (msg.delay_seconds > 0) {
              await sleep(msg.delay_seconds * 1000);
            }
            
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
                  result = await wahaService.sendFile(connection, chatId, msg.media_url, 'document');
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
          
          console.log(`[Broadcast Sender] Sent to ${recipient.phone}`);
          
        } catch (error) {
          console.error(`[Broadcast Sender] Failed to send to ${recipient.phone}:`, error.message);
          
          // Update recipient as failed
          await db.query(`
            UPDATE broadcast_campaign_recipients 
            SET status = 'failed', 
                error_message = $1
            WHERE id = $2
          `, [error.message?.substring(0, 500), recipient.id]);
          
          totalFailed++;
          
          // Update campaign stats
          await db.query(`
            UPDATE broadcast_campaigns 
            SET failed_count = failed_count + 1, updated_at = NOW()
            WHERE id = $1
          `, [campaignId]);
        }
        
        // Delay between messages
        await sleep(delayBetweenMessages);
      }
      
      // Delay between batches
      if (recipientsResult.rows.length === batchSize) {
        console.log(`[Broadcast Sender] Waiting ${delayBetweenBatches / 1000}s before next batch`);
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
    activeCampaigns.set(campaignId, { status: 'paused' });
  }
}

/**
 * Cancel a campaign
 */
function cancelCampaign(campaignId) {
  if (activeCampaigns.has(campaignId)) {
    activeCampaigns.set(campaignId, { status: 'cancelled' });
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
  cancelCampaign,
  isCampaignActive
};
