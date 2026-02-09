const db = require('../../config/database');
const broadcastSender = require('./sender.service');
const { calculateNextRun, getNowInIsraelFromDB, storeNextRunAt } = require('../../controllers/broadcasts/automatedCampaigns.controller');

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
    // Log current time for debugging
    const nowResult = await db.query(`
      SELECT 
        to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') as utc_now,
        to_char(NOW() AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI:SS') as israel_now
    `);
    const { utc_now, israel_now } = nowResult.rows[0];
    
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
    
    // Log pending campaigns for debugging
    const pendingResult = await db.query(`
      SELECT 
        name, 
        to_char(next_run_at, 'YYYY-MM-DD HH24:MI:SS') as next_run_utc,
        to_char(next_run_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI:SS') as next_run_israel,
        is_active 
      FROM automated_campaigns 
      WHERE is_active = true AND next_run_at IS NOT NULL
      LIMIT 5
    `);
    if (pendingResult.rows.length > 0) {
      console.log(`[Scheduler] UTC: ${utc_now} | Israel: ${israel_now}`);
      pendingResult.rows.forEach(c => {
        console.log(`[Scheduler] Campaign "${c.name}": next_run UTC=${c.next_run_utc}, Israel=${c.next_run_israel}`);
      });
    }
    
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
    
    // Process ALL steps in order (send, wait, trigger_campaign)
    for (const step of steps) {
      if (step.step_type === 'trigger_campaign') {
        // Trigger another campaign
        await executeTriggerStep(step, campaign);
        continue;
      }
      
      if (step.step_type === 'wait') {
        // Wait step - delay execution
        const waitConfig = step.wait_config || {};
        const waitValue = waitConfig.value || 0;
        const waitUnit = waitConfig.unit || 'seconds';
        let waitMs = waitValue * 1000; // default seconds
        if (waitUnit === 'minutes') waitMs = waitValue * 60 * 1000;
        if (waitUnit === 'hours') waitMs = waitValue * 60 * 60 * 1000;
        
        if (waitMs > 0) {
          console.log(`[Scheduler] Campaign ${campaign.id} waiting ${waitValue} ${waitUnit}...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        continue;
      }
      
      if (step.step_type !== 'send') continue;
      
      // Process send step
      await executeSendStep(step, campaign);
    }
    
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
 * Execute a trigger_campaign step
 */
async function executeTriggerStep(step, parentCampaign) {
  const targetCampaignId = step.trigger_campaign_id;
  if (!targetCampaignId) {
    console.log(`[Scheduler] Trigger step has no target campaign, skipping`);
    return;
  }
  
  console.log(`[Scheduler] Campaign ${parentCampaign.id} triggering campaign ${targetCampaignId}`);
  
  try {
    // Get the target campaign
    const targetResult = await db.query(`
      SELECT ac.*, a.name as audience_name, a.id as audience_id
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.id = $1 AND ac.user_id = $2
    `, [targetCampaignId, parentCampaign.user_id]);
    
    if (targetResult.rows.length === 0) {
      console.error(`[Scheduler] Target campaign ${targetCampaignId} not found`);
      return;
    }
    
    const targetCampaign = targetResult.rows[0];
    console.log(`[Scheduler] Executing triggered campaign: ${targetCampaign.name}`);
    
    // Execute the target campaign (recursive call)
    await executeCampaign(targetCampaign);
  } catch (error) {
    console.error(`[Scheduler] Error executing triggered campaign ${targetCampaignId}:`, error.message);
  }
}

/**
 * Execute a send step
 */
async function executeSendStep(sendStep, campaign) {
  console.log(`[Scheduler] Executing send step for campaign ${campaign.id}`);
  
  try {
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
      return;
    }
    
    // Get WhatsApp connection using sender service (handles credentials properly)
    const connection = await broadcastSender.getWahaConnection(campaign.user_id);
    
    if (!connection) {
      console.error(`[Scheduler] No active WhatsApp connection for user ${campaign.user_id}`);
      await db.query(`
        UPDATE automated_campaign_runs
        SET status = 'failed', completed_at = NOW(), error_message = 'אין חיבור וואטסאפ פעיל'
        WHERE id = $1
      `, [runId]);
      return;
    }
    
    // Get template messages if using template
    let messages = [];
    
    if (sendStep.template_id) {
      const messagesResult = await db.query(`
        SELECT * FROM broadcast_template_messages 
        WHERE template_id = $1 
        ORDER BY message_order
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
    
    console.log(`[Scheduler] Send step completed for campaign ${campaign.id}: ${sentCount} sent, ${failedCount} failed`);
    
  } catch (error) {
    console.error(`[Scheduler] Send step error:`, error);
    
    // Try to mark run as failed
    try {
      await db.query(`
        UPDATE automated_campaign_runs
        SET status = 'failed', completed_at = NOW(), error_message = $1
        WHERE campaign_id = $2 AND status = 'running'
      `, [error.message, campaign.id]);
    } catch (e) {}
  }
}

/**
 * Update campaign's next run time
 * Now uses PostgreSQL for timezone conversion
 */
async function updateCampaignNextRun(campaign) {
  try {
    // Get current Israel time from PostgreSQL
    const israelNow = await getNowInIsraelFromDB();
    
    const nextRunIsrael = calculateNextRun(
      campaign.schedule_type, 
      campaign.schedule_config, 
      campaign.send_time,
      israelNow
    );
    
    if (nextRunIsrael) {
      // Store using PostgreSQL timezone conversion
      await storeNextRunAt(campaign.id, nextRunIsrael);
      console.log(`[Scheduler] Campaign ${campaign.id} next run (Israel): ${nextRunIsrael}`);
    } else {
      // No more scheduled runs
      await db.query(`
        UPDATE automated_campaigns
        SET is_active = false, next_run_at = NULL
        WHERE id = $1
      `, [campaign.id]);
      
      console.log(`[Scheduler] Campaign ${campaign.id} deactivated - no more scheduled runs`);
    }
  } catch (error) {
    console.error(`[Scheduler] Error updating next run for campaign ${campaign.id}:`, error);
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
