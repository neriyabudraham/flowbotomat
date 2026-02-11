const db = require('../../config/database');
const broadcastSender = require('./sender.service');
const { calculateNextRun, getNowInIsraelFromDB, storeNextRunAt } = require('../../controllers/broadcasts/automatedCampaigns.controller');

/**
 * Automated Campaign Scheduler
 * Supports parallel executions per campaign using campaign_executions table
 */

let schedulerInterval = null;

/**
 * Check and run due campaigns + resume waiting executions
 */
async function checkAndRunCampaigns() {
  try {
    // 1. Find campaigns that are due to run (check next_run_at)
    // Only start new execution if there's no running/waiting execution for same campaign
    const dueResult = await db.query(`
      SELECT 
        ac.*,
        a.name as audience_name,
        a.id as resolved_audience_id
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.is_active = true 
        AND ac.next_run_at IS NOT NULL 
        AND ac.next_run_at <= NOW()
        AND NOT EXISTS (
          SELECT 1 FROM campaign_executions ce 
          WHERE ce.campaign_id = ac.id 
            AND ce.status IN ('running', 'waiting')
            AND ce.trigger_type = 'scheduled'
        )
    `);
    
    // 2. Find waiting executions that need to resume
    const resumeResult = await db.query(`
      SELECT 
        ce.*,
        ac.name as campaign_name,
        ac.user_id,
        ac.schedule_type,
        ac.schedule_config,
        ac.send_time,
        ac.audience_id as campaign_audience_id
      FROM campaign_executions ce
      JOIN automated_campaigns ac ON ac.id = ce.campaign_id
      WHERE ce.status = 'waiting'
        AND ce.resume_at IS NOT NULL 
        AND ce.resume_at <= NOW()
    `);
    
    const newCampaigns = dueResult.rows.length;
    const resumeExecutions = resumeResult.rows.length;
    
    if (newCampaigns === 0 && resumeExecutions === 0) {
      return;
    }
    
    // Start new campaign executions
    if (newCampaigns > 0) {
      console.log(`[Scheduler] Found ${newCampaigns} campaigns to run`);
      for (const campaign of dueResult.rows) {
        await startNewExecution(campaign, 'scheduled');
      }
    }
    
    // Resume waiting executions
    if (resumeExecutions > 0) {
      console.log(`[Scheduler] Found ${resumeExecutions} executions to resume`);
      for (const execution of resumeResult.rows) {
        await resumeExecution(execution);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Check error:', error);
  }
}

/**
 * Start a new campaign execution
 */
async function startNewExecution(campaign, triggerType = 'scheduled') {
  console.log(`[Scheduler] Starting new execution for campaign: ${campaign.name} (${campaign.id}) [${triggerType}]`);
  
  try {
    // Get total steps count
    const stepsResult = await db.query(`
      SELECT COUNT(*) as total FROM automated_campaign_steps WHERE campaign_id = $1
    `, [campaign.id]);
    const totalSteps = parseInt(stepsResult.rows[0].total) || 0;
    
    // Create execution record
    const execResult = await db.query(`
      INSERT INTO campaign_executions (campaign_id, status, current_step, total_steps, trigger_type)
      VALUES ($1, 'running', 0, $2, $3)
      RETURNING id
    `, [campaign.id, totalSteps, triggerType]);
    
    const executionId = execResult.rows[0].id;
    
    // Execute the campaign with this execution ID
    await executeWithExecution(campaign, executionId, 0);
    
  } catch (error) {
    console.error(`[Scheduler] Error starting execution:`, error);
  }
}

/**
 * Resume a waiting execution
 */
async function resumeExecution(execution) {
  const startStep = execution.paused_at_step || 0;
  console.log(`[Scheduler] Resuming execution ${execution.id} from step ${startStep}`);
  
  try {
    // Get campaign data
    const campaignResult = await db.query(`
      SELECT ac.*, a.id as resolved_audience_id
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.id = $1
    `, [execution.campaign_id]);
    
    if (campaignResult.rows.length === 0) {
      console.error(`[Scheduler] Campaign ${execution.campaign_id} not found`);
      await db.query(`UPDATE campaign_executions SET status = 'failed', error_message = 'Campaign not found' WHERE id = $1`, [execution.id]);
      return;
    }
    
    const campaign = campaignResult.rows[0];
    
    // Mark as running
    await db.query(`
      UPDATE campaign_executions 
      SET status = 'running', resume_at = NULL, paused_at_step = NULL
      WHERE id = $1
    `, [execution.id]);
    
    // Continue execution
    await executeWithExecution(campaign, execution.id, startStep);
    
  } catch (error) {
    console.error(`[Scheduler] Error resuming execution:`, error);
    await db.query(`UPDATE campaign_executions SET status = 'failed', error_message = $1 WHERE id = $2`, [error.message, execution.id]);
  }
}

/**
 * Execute campaign with a specific execution ID
 * This is the main execution logic that works with the execution record
 */
async function executeWithExecution(campaign, executionId, startFromStep = 0) {
  console.log(`[Scheduler] Running campaign: ${campaign.name} (exec: ${executionId}) from step ${startFromStep}`);
  
  try {
    // Get campaign steps
    const stepsResult = await db.query(`
      SELECT * FROM automated_campaign_steps 
      WHERE campaign_id = $1 
      ORDER BY step_order
    `, [campaign.id]);
    
    const steps = stepsResult.rows;
    
    if (steps.length === 0) {
      console.log(`[Scheduler] Campaign ${campaign.id} has no steps, completing`);
      await finishExecution(executionId, campaign, 'completed');
      return;
    }
    
    // Process steps starting from startFromStep
    for (let i = startFromStep; i < steps.length; i++) {
      const step = steps[i];
      
      // Update current step in execution
      await db.query(`
        UPDATE campaign_executions SET current_step = $2 WHERE id = $1
      `, [executionId, i]);
      
      if (step.step_type === 'trigger_campaign') {
        await executeTriggerStep(step, campaign);
        continue;
      }
      
      if (step.step_type === 'wait') {
        const waitConfig = step.wait_config || {};
        const waitValue = waitConfig.value || 0;
        const waitUnit = waitConfig.unit || 'seconds';
        
        let waitMs = waitValue * 1000;
        if (waitUnit === 'minutes') waitMs = waitValue * 60 * 1000;
        if (waitUnit === 'hours') waitMs = waitValue * 60 * 60 * 1000;
        if (waitUnit === 'days') waitMs = waitValue * 24 * 60 * 60 * 1000;
        
        if (waitMs > 0) {
          const resumeAt = new Date(Date.now() + waitMs);
          console.log(`[Scheduler] Execution ${executionId} pausing for ${waitValue} ${waitUnit}, resume at ${resumeAt.toISOString()}`);
          
          // Save to execution record - scheduler will pick up when resume_at is due
          await db.query(`
            UPDATE campaign_executions 
            SET status = 'waiting',
                resume_at = $1, 
                paused_at_step = $2,
                current_step = $3
            WHERE id = $4
          `, [resumeAt, i + 1, i, executionId]);
          
          return; // Exit - scheduler will resume later
        }
        continue;
      }
      
      if (step.step_type !== 'send') continue;
      
      // Process send step
      console.log(`[Scheduler] Execution ${executionId} sending step ${i + 1}/${steps.length}`);
      await executeSendStep(step, campaign);
    }
    
    // All steps completed
    console.log(`[Scheduler] Execution ${executionId} completed all ${steps.length} steps`);
    await finishExecution(executionId, campaign, 'completed');
    
  } catch (error) {
    console.error(`[Scheduler] Execution ${executionId} error:`, error);
    await db.query(`
      UPDATE campaign_executions 
      SET status = 'failed', completed_at = NOW(), error_message = $1
      WHERE id = $2
    `, [error.message, executionId]);
  }
}

/**
 * Finish an execution
 */
async function finishExecution(executionId, campaign, status = 'completed') {
  // Mark execution as complete
  await db.query(`
    UPDATE campaign_executions 
    SET status = $1, completed_at = NOW()
    WHERE id = $2
  `, [status, executionId]);
  
  // Get execution details
  const execResult = await db.query(`SELECT trigger_type FROM campaign_executions WHERE id = $1`, [executionId]);
  const triggerType = execResult.rows[0]?.trigger_type || 'scheduled';
  
  // Update campaign stats
  await db.query(`
    UPDATE automated_campaigns
    SET last_run_at = NOW(), total_sent = total_sent + 1
    WHERE id = $1
  `, [campaign.id]);
  
  // For scheduled executions, handle next run
  if (triggerType === 'scheduled') {
    const scheduleType = campaign.schedule_type;
    
    if (scheduleType === 'manual') {
      // Manual campaign completed - deactivate
      console.log(`[Scheduler] Manual campaign ${campaign.id} completed - deactivating`);
      await db.query(`
        UPDATE automated_campaigns 
        SET is_active = false, next_run_at = NULL
        WHERE id = $1
      `, [campaign.id]);
    } else {
      // Recurring - calculate next run
      await updateCampaignNextRun(campaign);
    }
  }
}

/**
 * Legacy function for backward compatibility
 * Creates a new execution and runs it
 */
async function executeCampaign(campaign, options = {}) {
  const { isTriggered = false, startFromStep = 0 } = options;
  const triggerType = isTriggered ? 'triggered' : 'manual';
  
  // Get total steps
  const stepsResult = await db.query(`
    SELECT COUNT(*) as total FROM automated_campaign_steps WHERE campaign_id = $1
  `, [campaign.id]);
  const totalSteps = parseInt(stepsResult.rows[0].total) || 0;
  
  // Create execution record
  const execResult = await db.query(`
    INSERT INTO campaign_executions (campaign_id, status, current_step, total_steps, trigger_type)
    VALUES ($1, 'running', $2, $3, $4)
    RETURNING id
  `, [campaign.id, startFromStep, totalSteps, triggerType]);
  
  const executionId = execResult.rows[0].id;
  
  await executeWithExecution(campaign, executionId, startFromStep);
}

/**
 * Execute a trigger_campaign step
 * Gets the target campaign with audience from its STEPS (not campaign level)
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
    // Use COALESCE to prefer step-level audience, then fall back to campaign-level
    const targetResult = await db.query(`
      SELECT ac.*,
        COALESCE(
          (SELECT audience_id FROM automated_campaign_steps 
           WHERE campaign_id = ac.id AND step_type = 'send' AND audience_id IS NOT NULL
           ORDER BY step_order LIMIT 1),
          ac.audience_id
        ) as resolved_audience_id
      FROM automated_campaigns ac
      WHERE ac.id = $1 AND ac.user_id = $2
    `, [targetCampaignId, parentCampaign.user_id]);
    
    if (targetResult.rows.length === 0) {
      console.error(`[Scheduler] Target campaign ${targetCampaignId} not found`);
      return;
    }
    
    const targetCampaign = targetResult.rows[0];
    
    // Debug: log audience resolution details
    console.log(`[Scheduler] Target campaign "${targetCampaign.name}" audience debug:`);
    console.log(`[Scheduler]   - campaign.audience_id (column): ${targetCampaign.audience_id || 'NULL'}`);
    console.log(`[Scheduler]   - resolved_audience_id (COALESCE): ${targetCampaign.resolved_audience_id || 'NULL'}`);
    
    // Also check steps directly for debugging
    const stepsDebug = await db.query(`
      SELECT step_order, step_type, audience_id, template_id 
      FROM automated_campaign_steps 
      WHERE campaign_id = $1 ORDER BY step_order
    `, [targetCampaignId]);
    console.log(`[Scheduler]   - Steps:`, stepsDebug.rows.map(s => 
      `${s.step_type}(order:${s.step_order}, audience:${s.audience_id || 'NULL'}, template:${s.template_id || 'NULL'})`
    ).join(', '));
    
    // Set the resolved audience on the campaign object for use by executeSendStep
    if (targetCampaign.resolved_audience_id) {
      targetCampaign.audience_id = targetCampaign.resolved_audience_id;
    }
    
    // If target campaign has no audience, inherit from parent campaign
    if (!targetCampaign.audience_id && parentCampaign.audience_id) {
      console.log(`[Scheduler] Target campaign "${targetCampaign.name}" has no audience, inheriting from parent: ${parentCampaign.audience_id}`);
      targetCampaign.audience_id = parentCampaign.audience_id;
    }
    
    console.log(`[Scheduler] Executing triggered campaign: ${targetCampaign.name} (final audience: ${targetCampaign.audience_id || 'NONE'})`);
    
    // Execute the target campaign as TRIGGERED (won't update its next_run_at or deactivate it)
    await executeCampaign(targetCampaign, { isTriggered: true });
  } catch (error) {
    console.error(`[Scheduler] Error executing triggered campaign ${targetCampaignId}:`, error.message);
  }
}

/**
 * Execute a send step
 */
async function executeSendStep(sendStep, campaign) {
  console.log(`[Scheduler] Executing send step for campaign ${campaign.id} (step ${sendStep.id})`);
  
  try {
    // Create a run record
    const runResult = await db.query(`
      INSERT INTO automated_campaign_runs (campaign_id, step_id, status)
      VALUES ($1, $2, 'running')
      RETURNING id
    `, [campaign.id, sendStep.id]);
    
    const runId = runResult.rows[0].id;
    
    // Get audience ID - check step level first, then campaign level, then query DB
    let audienceId = sendStep.audience_id || campaign.audience_id;
    let audienceSource = sendStep.audience_id ? 'step' : (campaign.audience_id ? 'campaign-object' : 'none');
    
    if (!audienceId) {
      // Fallback: query campaign's audience_id directly from DB
      const campAudience = await db.query(
        'SELECT audience_id FROM automated_campaigns WHERE id = $1',
        [campaign.id]
      );
      audienceId = campAudience.rows[0]?.audience_id;
      if (audienceId) {
        audienceSource = 'campaign-db';
        console.log(`[Scheduler] Found audience ${audienceId} from campaign DB record`);
      }
    }
    
    // If still no audience, try to get from any send step of this campaign
    if (!audienceId) {
      const stepAudience = await db.query(`
        SELECT audience_id FROM automated_campaign_steps 
        WHERE campaign_id = $1 AND step_type = 'send' AND audience_id IS NOT NULL
        ORDER BY step_order LIMIT 1
      `, [campaign.id]);
      audienceId = stepAudience.rows[0]?.audience_id;
      if (audienceId) {
        audienceSource = 'other-step-db';
        console.log(`[Scheduler] Found audience ${audienceId} from another step in campaign`);
      }
    }
    
    console.log(`[Scheduler] Audience resolution: id=${audienceId || 'NULL'}, source=${audienceSource}`);
    console.log(`[Scheduler]   step.audience_id=${sendStep.audience_id || 'NULL'}, campaign.audience_id=${campaign.audience_id || 'NULL'}`);
    
    // Get recipients from audience
    let recipients = [];
    
    if (audienceId) {
      // Try broadcast_audience_contacts first (static audiences)
      const recipientsResult = await db.query(`
        SELECT DISTINCT c.id, c.phone, c.display_name as contact_name
        FROM contacts c
        JOIN broadcast_audience_contacts bac ON bac.contact_id = c.id
        WHERE bac.audience_id = $1 AND c.phone IS NOT NULL
      `, [audienceId]);
      
      recipients = recipientsResult.rows;
      
      // If no contacts found in static table, try dynamic audience resolution
      if (recipients.length === 0) {
        console.log(`[Scheduler] No contacts in broadcast_audience_contacts for audience ${audienceId}, trying dynamic resolution...`);
        
        // Get audience details to check if it's dynamic
        const audienceDetails = await db.query(
          'SELECT * FROM broadcast_audiences WHERE id = $1',
          [audienceId]
        );
        
        if (audienceDetails.rows.length > 0) {
          const audience = audienceDetails.rows[0];
          console.log(`[Scheduler] Audience "${audience.name}" is_static=${audience.is_static}, filters=${JSON.stringify(audience.filters)}`);
          
          // For dynamic audiences, use the filter service
          if (!audience.is_static && audience.filters) {
            try {
              const { getAudienceContacts } = require('../../services/broadcasts/audienceFilter.service');
              const dynamicContacts = await getAudienceContacts(campaign.user_id, audience);
              recipients = dynamicContacts.map(c => ({
                id: c.id,
                phone: c.phone,
                contact_name: c.display_name
              }));
              console.log(`[Scheduler] Dynamic audience resolved to ${recipients.length} contacts`);
            } catch (filterErr) {
              console.error(`[Scheduler] Dynamic audience filter error:`, filterErr.message);
            }
          }
        } else {
          console.log(`[Scheduler] Audience ${audienceId} not found in broadcast_audiences table!`);
        }
      }
    }
    
    console.log(`[Scheduler] Campaign ${campaign.id} has ${recipients.length} recipients from audience ${audienceId} (source: ${audienceSource})`);
    
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
      // Also reset current_step for next iteration
      await storeNextRunAt(campaign.id, nextRunIsrael);
      await db.query(`
        UPDATE automated_campaigns 
        SET current_step = 0, execution_status = 'idle'
        WHERE id = $1
      `, [campaign.id]);
      console.log(`[Scheduler] Campaign ${campaign.id} next run (Israel): ${nextRunIsrael}`);
    } else {
      // No more scheduled runs - mark as completed
      await db.query(`
        UPDATE automated_campaigns
        SET is_active = false, next_run_at = NULL, execution_status = 'completed'
        WHERE id = $1
      `, [campaign.id]);
      
      console.log(`[Scheduler] Campaign ${campaign.id} completed - no more scheduled runs`);
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
