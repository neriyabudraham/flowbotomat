const db = require('../../config/database');
const { getIO } = require('../../services/socket/manager.service');

/**
 * Create a new forward job (triggered by message or manual)
 */
async function createForwardJob(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    const { 
      message_type, // 'text', 'image', 'video', 'audio'
      message_text,
      media_url,
      media_mime_type,
      media_filename,
      sender_phone,
      sender_name
    } = req.body;
    
    // Verify forward ownership and get details
    const forwardResult = await db.query(`
      SELECT gf.*, 
        (SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = gf.id AND is_active = true) as target_count
      FROM group_forwards gf
      WHERE gf.id = $1 AND gf.user_id = $2 AND gf.is_active = true
    `, [forwardId, userId]);
    
    if (forwardResult.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה או לא פעילה' });
    }
    
    const forward = forwardResult.rows[0];
    
    if (forward.target_count === 0) {
      return res.status(400).json({ error: 'אין קבוצות יעד מוגדרות להעברה זו' });
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
      forwardId,
      userId,
      message_type || 'text',
      message_text,
      media_url,
      media_mime_type,
      media_filename,
      sender_phone,
      sender_name,
      forward.target_count,
      forward.require_confirmation ? 'pending' : 'confirmed'
    ]);
    
    const job = jobResult.rows[0];
    
    // Create job messages for each target
    const targets = await db.query(`
      SELECT * FROM group_forward_targets 
      WHERE forward_id = $1 AND is_active = true
      ORDER BY sort_order ASC
    `, [forwardId]);
    
    for (const target of targets.rows) {
      await db.query(`
        INSERT INTO forward_job_messages (job_id, target_id, status)
        VALUES ($1, $2, 'pending')
      `, [job.id, target.id]);
    }
    
    console.log(`[GroupForwards] Created job ${job.id} for forward ${forwardId} with ${forward.target_count} targets`);
    
    // If no confirmation needed, start sending immediately
    if (!forward.require_confirmation) {
      // Start sending in background
      startForwardJob(job.id).catch(err => {
        console.error(`[GroupForwards] Error starting job ${job.id}:`, err);
      });
    }
    
    res.json({
      success: true,
      job: {
        ...job,
        forward_name: forward.name,
        require_confirmation: forward.require_confirmation
      },
      message: forward.require_confirmation 
        ? `מוכן לשלוח ל-${forward.target_count} קבוצות. ממתין לאישור.`
        : `מתחיל לשלוח ל-${forward.target_count} קבוצות...`
    });
  } catch (error) {
    console.error('[GroupForwards] Create job error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משימת העברה' });
  }
}

/**
 * Confirm and start a pending job
 */
async function confirmForwardJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    // Get job and verify ownership
    const jobResult = await db.query(`
      SELECT fj.*, gf.name as forward_name, gf.delay_min, gf.delay_max
      FROM forward_jobs fj
      JOIN group_forwards gf ON fj.forward_id = gf.id
      WHERE fj.id = $1 AND fj.user_id = $2 AND fj.status = 'pending'
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה או כבר אושרה' });
    }
    
    const job = jobResult.rows[0];
    
    // Update status to confirmed
    await db.query(`
      UPDATE forward_jobs SET status = 'confirmed', updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
    
    // Start sending in background
    startForwardJob(jobId).catch(err => {
      console.error(`[GroupForwards] Error starting job ${jobId}:`, err);
    });
    
    res.json({
      success: true,
      message: `מתחיל לשלוח ל-${job.total_targets} קבוצות...`
    });
  } catch (error) {
    console.error('[GroupForwards] Confirm job error:', error);
    res.status(500).json({ error: 'שגיאה באישור משימה' });
  }
}

/**
 * Stop an active job
 */
async function stopForwardJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const { deleteMessages } = req.body; // Whether to also delete sent messages
    
    // Get job and verify ownership
    const jobResult = await db.query(`
      SELECT * FROM forward_jobs
      WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'confirmed', 'sending')
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה או כבר הסתיימה' });
    }
    
    // Update job to stopped
    await db.query(`
      UPDATE forward_jobs SET 
        status = 'stopped',
        stop_requested = true,
        delete_sent_requested = $2,
        updated_at = NOW()
      WHERE id = $1
    `, [jobId, deleteMessages || false]);
    
    // If delete requested, trigger deletion of already sent messages
    if (deleteMessages) {
      deleteJobMessages(jobId).catch(err => {
        console.error(`[GroupForwards] Error deleting messages for job ${jobId}:`, err);
      });
    }
    
    const job = jobResult.rows[0];
    
    res.json({
      success: true,
      message: deleteMessages 
        ? `המשימה נעצרה ו-${job.sent_count} הודעות נמחקות...`
        : `המשימה נעצרה. נשלחו ${job.sent_count} מתוך ${job.total_targets} הודעות.`
    });
  } catch (error) {
    console.error('[GroupForwards] Stop job error:', error);
    res.status(500).json({ error: 'שגיאה בעצירת משימה' });
  }
}

/**
 * Cancel a pending job (before confirmation)
 */
async function cancelForwardJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    const result = await db.query(`
      UPDATE forward_jobs SET status = 'stopped', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      RETURNING *
    `, [jobId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה או לא ממתינה לאישור' });
    }
    
    res.json({
      success: true,
      message: 'המשימה בוטלה'
    });
  } catch (error) {
    console.error('[GroupForwards] Cancel job error:', error);
    res.status(500).json({ error: 'שגיאה בביטול משימה' });
  }
}

/**
 * Get job status
 */
async function getJobStatus(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    const jobResult = await db.query(`
      SELECT fj.*, gf.name as forward_name
      FROM forward_jobs fj
      JOIN group_forwards gf ON fj.forward_id = gf.id
      WHERE fj.id = $1 AND fj.user_id = $2
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה' });
    }
    
    const job = jobResult.rows[0];
    
    // Get message details if needed
    const messages = await db.query(`
      SELECT fjm.*, gft.group_name
      FROM forward_job_messages fjm
      JOIN group_forward_targets gft ON fjm.target_id = gft.id
      WHERE fjm.job_id = $1
      ORDER BY fjm.created_at ASC
    `, [jobId]);
    
    res.json({
      success: true,
      job: {
        ...job,
        messages: messages.rows
      }
    });
  } catch (error) {
    console.error('[GroupForwards] Get job status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוס משימה' });
  }
}

/**
 * Get active jobs for user
 */
async function getActiveJobs(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT fj.*, gf.name as forward_name
      FROM forward_jobs fj
      JOIN group_forwards gf ON fj.forward_id = gf.id
      WHERE fj.user_id = $1 AND fj.status IN ('pending', 'confirmed', 'sending')
      ORDER BY fj.created_at DESC
    `, [userId]);
    
    res.json({
      success: true,
      jobs: result.rows
    });
  } catch (error) {
    console.error('[GroupForwards] Get active jobs error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משימות פעילות' });
  }
}

/**
 * Get job history for a forward
 */
async function getForwardJobHistory(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM group_forwards WHERE id = $1 AND user_id = $2',
      [forwardId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const result = await db.query(`
      SELECT * FROM forward_jobs
      WHERE forward_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [forwardId, parseInt(limit), parseInt(offset)]);
    
    const countResult = await db.query(
      'SELECT COUNT(*) FROM forward_jobs WHERE forward_id = $1',
      [forwardId]
    );
    
    res.json({
      success: true,
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('[GroupForwards] Get job history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית משימות' });
  }
}

// =============================================
// Internal functions (not exposed as routes)
// =============================================

/**
 * Start processing a forward job
 */
async function startForwardJob(jobId) {
  const wahaService = require('../../services/waha/session.service');
  const { getWahaCredentials } = require('../../services/settings/system.service');
  const triggerService = require('../../services/groupForwards/trigger.service');
  
  try {
    // Get job with forward details and WhatsApp connection info
    const jobResult = await db.query(`
      SELECT fj.*, gf.delay_min, gf.delay_max, gf.user_id, gf.name as forward_name,
        wc.session_name, wc.connection_type, wc.external_base_url, wc.external_api_key
      FROM forward_jobs fj
      JOIN group_forwards gf ON fj.forward_id = gf.id
      JOIN whatsapp_connections wc ON wc.user_id = gf.user_id AND wc.status = 'connected'
      WHERE fj.id = $1
    `, [jobId]);
    
    console.log(`[GroupForwards] Starting job ${jobId} - type: ${jobResult.rows[0]?.message_type}, media_url: ${jobResult.rows[0]?.media_url?.substring(0, 50)}`);
    
    if (jobResult.rows.length === 0) {
      throw new Error('Job not found');
    }
    
    const job = jobResult.rows[0];
    const sessionName = job.session_name;
    
    if (!sessionName) {
      throw new Error('No WhatsApp session available');
    }
    
    // Get WAHA credentials
    const creds = getWahaCredentials();
    
    // Create connection object for WAHA service
    const wahaConnection = {
      base_url: creds.baseUrl,
      api_key: creds.apiKey,
      session_name: sessionName
    };
    
    // Update status to sending
    await db.query(`
      UPDATE forward_jobs SET status = 'sending', updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
    
    // Get all pending messages
    const messagesResult = await db.query(`
      SELECT fjm.*, gft.group_id, gft.group_name
      FROM forward_job_messages fjm
      JOIN group_forward_targets gft ON fjm.target_id = gft.id
      WHERE fjm.job_id = $1 AND fjm.status = 'pending'
      ORDER BY gft.sort_order ASC
    `, [jobId]);
    
    const messages = messagesResult.rows;
    const totalTargets = messages.length;
    let sentCount = 0;
    let failedCount = 0;
    const io = getIO();
    
    // Function to calculate variable delay
    const calculateDelay = (min, max) => {
      // Add ±10% variation to the delay
      const variation = 0.1;
      const baseDelay = Math.random() * (max - min) + min;
      const minVariation = baseDelay * (1 - variation);
      const maxVariation = baseDelay * (1 + variation);
      // Ensure minimum 3 seconds
      return Math.max(3, Math.floor(Math.random() * (maxVariation - minVariation) + minVariation));
    };
    
    // Process messages in batches of 50 for status updates
    const batchSize = 50;
    let currentBatch = 0;
    
    for (let i = 0; i < messages.length; i++) {
      // Check if stop requested
      const statusCheck = await db.query(
        'SELECT stop_requested FROM forward_jobs WHERE id = $1',
        [jobId]
      );
      
      if (statusCheck.rows[0]?.stop_requested) {
        console.log(`[GroupForwards] Job ${jobId} stop requested at message ${i + 1}/${totalTargets}`);
        break;
      }
      
      const message = messages[i];
      
      try {
        // Send message based on type
        let messageId;
        
        if (job.message_type === 'text') {
          const result = await wahaService.sendMessage(wahaConnection, message.group_id, job.message_text);
          messageId = result?.id;
        } else if (job.message_type === 'image') {
          const result = await wahaService.sendImage(wahaConnection, message.group_id, job.media_url, job.message_text);
          messageId = result?.id;
        } else if (job.message_type === 'video') {
          const result = await wahaService.sendVideo(wahaConnection, message.group_id, job.media_url, job.message_text);
          messageId = result?.id;
        } else if (job.message_type === 'audio') {
          const result = await wahaService.sendVoice(wahaConnection, message.group_id, job.media_url);
          messageId = result?.id;
        }
        
        // Update message status
        await db.query(`
          UPDATE forward_job_messages 
          SET status = 'sent', whatsapp_message_id = $2, sent_at = NOW()
          WHERE id = $1
        `, [message.id, messageId]);
        
        sentCount++;
        
        // Update target statistics
        await db.query(`
          UPDATE group_forward_targets 
          SET messages_sent = messages_sent + 1, last_sent_at = NOW()
          WHERE id = $1
        `, [message.target_id]);
        
      } catch (sendError) {
        console.error(`[GroupForwards] Error sending to ${message.group_id}:`, sendError.message);
        
        await db.query(`
          UPDATE forward_job_messages 
          SET status = 'failed', error_message = $2
          WHERE id = $1
        `, [message.id, sendError.message]);
        
        failedCount++;
        
        // Update target with error
        await db.query(`
          UPDATE group_forward_targets 
          SET last_error = $2
          WHERE id = $1
        `, [message.target_id, sendError.message]);
        
        // If too many failures, stop
        if (failedCount >= 5 && failedCount > sentCount) {
          console.log(`[GroupForwards] Job ${jobId} stopping due to too many failures`);
          break;
        }
      }
      
      // Update job progress
      await db.query(`
        UPDATE forward_jobs 
        SET sent_count = $2, failed_count = $3, current_target_index = $4, updated_at = NOW()
        WHERE id = $1
      `, [jobId, sentCount, failedCount, i + 1]);
      
      // Send batch update every 50 messages
      const newBatch = Math.floor((i + 1) / batchSize);
      if (newBatch > currentBatch && i < messages.length - 1) { // Don't send on last message
        currentBatch = newBatch;
        
        // Emit progress update via socket
        io.to(`user:${job.user_id}`).emit('forward_job_progress', {
          jobId,
          sent: sentCount,
          failed: failedCount,
          total: totalTargets,
          current: i + 1
        });
        
        // Send WhatsApp progress message with stop buttons
        if (job.sender_phone) {
          await triggerService.sendProgressList(job.user_id, job.sender_phone, jobId, sentCount, totalTargets);
        }
      }
      
      // Delay before next message (unless it's the last one)
      if (i < messages.length - 1) {
        const delay = calculateDelay(job.delay_min, job.delay_max);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }
    
    // Check if delete was requested
    const finalCheck = await db.query(
      'SELECT stop_requested, delete_sent_requested, sender_phone FROM forward_jobs WHERE id = $1',
      [jobId]
    );
    
    const wasStopped = finalCheck.rows[0]?.stop_requested;
    const shouldDelete = finalCheck.rows[0]?.delete_sent_requested;
    const senderPhone = finalCheck.rows[0]?.sender_phone;
    
    // Finalize job
    const finalStatus = wasStopped ? 'stopped' : (sentCount === totalTargets ? 'completed' : (failedCount > 0 ? 'partial' : 'stopped'));
    
    await db.query(`
      UPDATE forward_jobs 
      SET status = $2, completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [jobId, finalStatus]);
    
    // Update forward statistics
    await db.query(`
      UPDATE group_forwards 
      SET total_forwards = total_forwards + 1, last_forward_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [job.forward_id]);
    
    // Emit completion via socket
    io.to(`user:${job.user_id}`).emit('forward_job_complete', {
      jobId,
      status: finalStatus,
      sent: sentCount,
      failed: failedCount,
      total: totalTargets
    });
    
    // Send completion message via WhatsApp
    if (senderPhone) {
      if (wasStopped) {
        await triggerService.sendStoppedMessage(job.user_id, senderPhone, sentCount, totalTargets, shouldDelete);
        
        // Delete sent messages if requested
        if (shouldDelete && sentCount > 0) {
          deleteJobMessages(jobId).catch(err => {
            console.error(`[GroupForwards] Error deleting messages for job ${jobId}:`, err);
          });
        }
      } else {
        await triggerService.sendCompletionMessage(job.user_id, senderPhone, jobId, sentCount, failedCount, totalTargets);
      }
    }
    
    console.log(`[GroupForwards] Job ${jobId} ${finalStatus}: ${sentCount}/${totalTargets} sent, ${failedCount} failed`);
    
  } catch (error) {
    console.error(`[GroupForwards] Job ${jobId} error:`, error);
    
    await db.query(`
      UPDATE forward_jobs 
      SET status = 'error', error_message = $2, updated_at = NOW()
      WHERE id = $1
    `, [jobId, error.message]);
    
    // Get user_id for socket emission
    const jobData = await db.query('SELECT user_id FROM forward_jobs WHERE id = $1', [jobId]);
    if (jobData.rows.length > 0) {
      const io = getIO();
      io.to(`user:${jobData.rows[0].user_id}`).emit('forward_job_error', {
        jobId,
        error: error.message
      });
    }
  }
}

/**
 * Delete already sent messages from a stopped job
 */
async function deleteJobMessages(jobId) {
  const wahaService = require('../../services/waha/session.service');
  
  try {
    // Get job details with WhatsApp connection info
    const jobResult = await db.query(`
      SELECT fj.*, wc.session_name
      FROM forward_jobs fj
      JOIN group_forwards gf ON fj.forward_id = gf.id
      JOIN whatsapp_connections wc ON wc.user_id = gf.user_id AND wc.status = 'connected'
      WHERE fj.id = $1
    `, [jobId]);
    
    if (jobResult.rows.length === 0) {
      return;
    }
    
    const job = jobResult.rows[0];
    const sessionName = job.session_name;
    
    // Get sent messages with WhatsApp IDs
    const messagesResult = await db.query(`
      SELECT fjm.*, gft.group_id
      FROM forward_job_messages fjm
      JOIN group_forward_targets gft ON fjm.target_id = gft.id
      WHERE fjm.job_id = $1 AND fjm.status = 'sent' AND fjm.whatsapp_message_id IS NOT NULL
    `, [jobId]);
    
    let deletedCount = 0;
    
    for (const message of messagesResult.rows) {
      try {
        await wahaService.deleteMessage(sessionName, message.group_id, message.whatsapp_message_id);
        
        await db.query(`
          UPDATE forward_job_messages 
          SET status = 'deleted', deleted_at = NOW()
          WHERE id = $1
        `, [message.id]);
        
        deletedCount++;
        
        // Small delay between deletions
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (deleteError) {
        console.error(`[GroupForwards] Error deleting message ${message.whatsapp_message_id}:`, deleteError.message);
      }
    }
    
    console.log(`[GroupForwards] Deleted ${deletedCount}/${messagesResult.rows.length} messages for job ${jobId}`);
    
    // Emit update
    const io = getIO();
    io.to(`user:${job.user_id}`).emit('forward_job_messages_deleted', {
      jobId,
      deleted: deletedCount,
      total: messagesResult.rows.length
    });
    
  } catch (error) {
    console.error(`[GroupForwards] Error deleting messages for job ${jobId}:`, error);
  }
}

module.exports = {
  createForwardJob,
  confirmForwardJob,
  stopForwardJob,
  cancelForwardJob,
  getJobStatus,
  getActiveJobs,
  getForwardJobHistory,
  // Export for internal use
  startForwardJob,
  deleteJobMessages
};
