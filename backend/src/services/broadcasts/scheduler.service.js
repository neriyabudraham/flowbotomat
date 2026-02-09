const db = require('../../config/database');
const broadcastSender = require('./sender.service');
const { calculateNextRun } = require('../../controllers/broadcasts/automatedCampaigns.controller');

/**
 * Automated Campaign Scheduler
 * Checks for campaigns that need to run and executes them
 */

let schedulerInterval = null;

/**
 * Check and run due campaigns
 */
async function checkAndRunCampaigns() {
  try {
    // Find campaigns that are due to run
    const result = await db.query(`
      SELECT 
        ac.*,
        a.name as audience_name,
        a.id as audience_id
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.is_active = true 
        AND ac.next_run_at IS NOT NULL 
        AND ac.next_run_at <= NOW()
    `);
    
    if (result.rows.length === 0) {
      return;
    }
    
    console.log(`[Scheduler] Found ${result.rows.length} campaigns to run`);
    
    for (const campaign of result.rows) {
      await executeCampaign(campaign);
    }
  } catch (error) {
    console.error('[Scheduler] Check error:', error);
  }
}

/**
 * Execute a single automated campaign
 */
async function executeCampaign(campaign) {
  console.log(`[Scheduler] Running campaign: ${campaign.name} (${campaign.id})`);
  
  try {
    // Get campaign steps
    const stepsResult = await db.query(`
      SELECT * FROM automated_campaign_steps 
      WHERE campaign_id = $1 
      ORDER BY step_order
    `, [campaign.id]);
    
    const steps = stepsResult.rows;
    
    if (steps.length === 0) {
      console.log(`[Scheduler] Campaign ${campaign.id} has no steps, skipping`);
      await updateCampaignNextRun(campaign);
      return;
    }
    
    // Get first 'send' step for now (later we can implement sequences with wait)
    const sendStep = steps.find(s => s.step_type === 'send');
    
    if (!sendStep) {
      console.log(`[Scheduler] Campaign ${campaign.id} has no send step, skipping`);
      await updateCampaignNextRun(campaign);
      return;
    }
    
    // Create a run record
    const runResult = await db.query(`
      INSERT INTO automated_campaign_runs (campaign_id, step_id, status)
      VALUES ($1, $2, 'running')
      RETURNING id
    `, [campaign.id, sendStep.id]);
    
    const runId = runResult.rows[0].id;
    
    // Get audience ID - either from step or from campaign
    const audienceId = sendStep.audience_id || campaign.audience_id;
    
    // Get recipients from audience
    let recipients = [];
    
    if (audienceId) {
      const recipientsResult = await db.query(`
        SELECT DISTINCT c.id, c.phone, c.display_name as contact_name
        FROM contacts c
        JOIN broadcast_audience_contacts bac ON bac.contact_id = c.id
        WHERE bac.audience_id = $1 AND c.phone IS NOT NULL
      `, [audienceId]);
      
      recipients = recipientsResult.rows;
    }
    
    console.log(`[Scheduler] Campaign ${campaign.id} has ${recipients.length} recipients from audience ${audienceId}`);
    
    // Update run with recipient count
    await db.query(`
      UPDATE automated_campaign_runs
      SET recipients_total = $1
      WHERE id = $2
    `, [recipients.length, runId]);
    
    if (recipients.length === 0) {
      await db.query(`
        UPDATE automated_campaign_runs
        SET status = 'completed', completed_at = NOW()
        WHERE id = $1
      `, [runId]);
      await updateCampaignNextRun(campaign);
      return;
    }
    
    // Get WhatsApp connection
    const connectionResult = await db.query(`
      SELECT * FROM whatsapp_connections 
      WHERE user_id = $1 AND status = 'connected'
      ORDER BY connected_at DESC LIMIT 1
    `, [campaign.user_id]);
    
    if (connectionResult.rows.length === 0) {
      console.error(`[Scheduler] No active WhatsApp connection for user ${campaign.user_id}`);
      await db.query(`
        UPDATE automated_campaign_runs
        SET status = 'failed', completed_at = NOW(), error_message = 'אין חיבור וואטסאפ פעיל'
        WHERE id = $1
      `, [runId]);
      await updateCampaignNextRun(campaign);
      return;
    }
    
    const connection = connectionResult.rows[0];
    
    // Get template messages if using template
    let messages = [];
    
    if (sendStep.template_id) {
      const messagesResult = await db.query(`
        SELECT * FROM broadcast_template_messages 
        WHERE template_id = $1 
        ORDER BY order_index
      `, [sendStep.template_id]);
      
      messages = messagesResult.rows;
    } else if (sendStep.direct_message) {
      messages = [{
        type: 'text',
        content: sendStep.direct_message,
        media_url: sendStep.direct_media_url
      }];
    }
    
    if (messages.length === 0) {
      console.error(`[Scheduler] Campaign ${campaign.id} step has no messages`);
      await db.query(`
        UPDATE automated_campaign_runs
        SET status = 'failed', completed_at = NOW(), error_message = 'אין הודעות בתבנית'
        WHERE id = $1
      `, [runId]);
      await updateCampaignNextRun(campaign);
      return;
    }
    
    // Send to each recipient
    let sentCount = 0;
    let failedCount = 0;
    
    for (const recipient of recipients) {
      try {
        // Use the broadcast sender service
        const success = await broadcastSender.sendToRecipient(
          campaign.user_id,
          connection,
          recipient,
          messages,
          campaign.name
        );
        
        if (success) {
          sentCount++;
        } else {
          failedCount++;
        }
        
        // Small delay between recipients
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (err) {
        console.error(`[Scheduler] Error sending to ${recipient.phone}:`, err.message);
        failedCount++;
      }
    }
    
    // Update run status
    await db.query(`
      UPDATE automated_campaign_runs
      SET status = 'completed', completed_at = NOW(), 
          recipients_sent = $1, recipients_failed = $2
      WHERE id = $3
    `, [sentCount, failedCount, runId]);
    
    // Update campaign stats
    await db.query(`
      UPDATE automated_campaigns
      SET last_run_at = NOW(), total_sent = total_sent + 1
      WHERE id = $1
    `, [campaign.id]);
    
    console.log(`[Scheduler] Campaign ${campaign.id} completed: ${sentCount} sent, ${failedCount} failed`);
    
    // Calculate and set next run
    await updateCampaignNextRun(campaign);
    
  } catch (error) {
    console.error(`[Scheduler] Execute campaign error:`, error);
    
    // Try to mark run as failed
    try {
      await db.query(`
        UPDATE automated_campaign_runs
        SET status = 'failed', completed_at = NOW(), error_message = $1
        WHERE campaign_id = $2 AND status = 'running'
      `, [error.message, campaign.id]);
    } catch (e) {}
    
    await updateCampaignNextRun(campaign);
  }
}

/**
 * Update campaign's next run time
 */
async function updateCampaignNextRun(campaign) {
  const nextRun = calculateNextRun(
    campaign.schedule_type, 
    campaign.schedule_config, 
    campaign.send_time
  );
  
  if (nextRun) {
    await db.query(`
      UPDATE automated_campaigns
      SET next_run_at = $1
      WHERE id = $2
    `, [nextRun, campaign.id]);
    
    console.log(`[Scheduler] Campaign ${campaign.id} next run: ${nextRun}`);
  } else {
    // No more scheduled runs (e.g., specific_dates exhausted)
    await db.query(`
      UPDATE automated_campaigns
      SET is_active = false, next_run_at = NULL
      WHERE id = $1
    `, [campaign.id]);
    
    console.log(`[Scheduler] Campaign ${campaign.id} deactivated - no more scheduled runs`);
  }
}

/**
 * Start the scheduler
 */
function startScheduler(intervalMs = 60000) {
  if (schedulerInterval) {
    console.log('[Scheduler] Already running');
    return;
  }
  
  console.log(`[Scheduler] Starting with ${intervalMs}ms interval`);
  
  // Check immediately
  checkAndRunCampaigns();
  
  // Then check periodically
  schedulerInterval = setInterval(checkAndRunCampaigns, intervalMs);
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

// Alias for compatibility with existing cron setup
const processScheduledCampaigns = checkAndRunCampaigns;

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndRunCampaigns,
  processScheduledCampaigns,
  executeCampaign
};
