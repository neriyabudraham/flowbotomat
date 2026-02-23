const db = require('../../config/database');
const { getIO } = require('../../services/socket/manager.service');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Download media from WAHA temp URL and save locally
 */
async function downloadWahaMedia(mediaUrl, mediaMimeType, mediaFilename) {
  if (!mediaUrl || !mediaUrl.includes('/api/files/session_')) {
    return mediaUrl;
  }
  
  try {
    const { getWahaCredentials } = require('../../services/settings/system.service');
    const creds = getWahaCredentials();
    
    console.log(`[MediaDownload] Downloading WAHA media: ${mediaUrl.substring(0, 80)}...`);
    
    const urlObj = new URL(mediaUrl);
    const filePath = urlObj.pathname;
    
    const wahaBaseUrl = (creds.baseUrl || process.env.WAHA_BASE_URL || '').replace(/\/$/, '');
    const wahaApiKey = creds.apiKey || process.env.WAHA_API_KEY;
    
    const urlsToTry = [];
    if (wahaBaseUrl) {
      urlsToTry.push({ url: `${wahaBaseUrl}${filePath}`, label: 'WAHA internal' });
    }
    if (mediaUrl !== `${wahaBaseUrl}${filePath}`) {
      urlsToTry.push({ url: mediaUrl, label: 'original' });
    }
    
    for (const attempt of urlsToTry) {
      try {
        const response = await axios.get(attempt.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: wahaApiKey ? { 'X-Api-Key': wahaApiKey } : {}
        });
        
        let type = 'misc';
        const mime = mediaMimeType || '';
        if (mime.startsWith('image/')) type = 'image';
        else if (mime.startsWith('video/')) type = 'video';
        else if (mime.startsWith('audio/')) type = 'audio';
        
        const uploadsDir = path.join(__dirname, '../../../uploads', type);
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const ext = path.extname(mediaFilename || urlObj.pathname) || '.jpeg';
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const filename = `${Date.now()}-${uniqueId}${ext}`;
        const savePath = path.join(uploadsDir, filename);
        
        fs.writeFileSync(savePath, response.data);
        
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
    
    return mediaUrl;
  } catch (err) {
    console.error(`[MediaDownload] Error:`, err.message);
    return mediaUrl;
  }
}

/**
 * Create a new transfer job
 */
async function createTransferJob(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    const { 
      message_type,
      message_text,
      media_url,
      media_mime_type,
      media_filename,
      sender_phone,
      sender_name
    } = req.body;
    
    const transferResult = await db.query(`
      SELECT gt.*, 
        (SELECT COUNT(*) FROM group_transfer_targets WHERE transfer_id = gt.id AND is_active = true) as target_count
      FROM group_transfers gt
      WHERE gt.id = $1 AND gt.user_id = $2 AND gt.is_active = true
    `, [transferId, userId]);
    
    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה או לא פעילה' });
    }
    
    const transfer = transferResult.rows[0];
    
    if (transfer.target_count === 0) {
      return res.status(400).json({ error: 'אין קבוצות יעד מוגדרות להעברה זו' });
    }
    
    let finalMediaUrl = media_url;
    if (media_url && media_url.includes('/api/files/session_')) {
      finalMediaUrl = await downloadWahaMedia(media_url, media_mime_type, media_filename);
    }
    
    const jobResult = await db.query(`
      INSERT INTO transfer_jobs (
        transfer_id, user_id, message_type, message_content, 
        media_url, media_caption, media_filename,
        sender_phone, target_count, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      transferId,
      userId,
      message_type || 'text',
      message_text,
      finalMediaUrl,
      message_text,
      media_filename,
      sender_phone,
      transfer.target_count,
      transfer.require_confirmation ? 'pending' : 'confirmed'
    ]);
    
    const job = jobResult.rows[0];
    
    const targets = await db.query(`
      SELECT * FROM group_transfer_targets 
      WHERE transfer_id = $1 AND is_active = true
      ORDER BY sort_order ASC
    `, [transferId]);
    
    for (const target of targets.rows) {
      await db.query(`
        INSERT INTO transfer_job_messages (job_id, target_id, status)
        VALUES ($1, $2, 'pending')
      `, [job.id, target.id]);
    }
    
    console.log(`[GroupTransfers] Created job ${job.id} for transfer ${transferId} with ${transfer.target_count} targets`);
    
    if (!transfer.require_confirmation) {
      startTransferJob(job.id).catch(err => {
        console.error(`[GroupTransfers] Error starting job ${job.id}:`, err);
      });
    }
    
    res.json({
      success: true,
      job: {
        ...job,
        transfer_name: transfer.name,
        require_confirmation: transfer.require_confirmation
      },
      message: transfer.require_confirmation 
        ? `מוכן לשלוח ל-${transfer.target_count} קבוצות. ממתין לאישור.`
        : `מתחיל לשלוח ל-${transfer.target_count} קבוצות...`
    });
  } catch (error) {
    console.error('[GroupTransfers] Create job error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משימת העברה' });
  }
}

/**
 * Confirm and start a pending job
 */
async function confirmTransferJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    const jobResult = await db.query(`
      SELECT tj.*, gt.name as transfer_name, gt.delay_min, gt.delay_max
      FROM transfer_jobs tj
      JOIN group_transfers gt ON tj.transfer_id = gt.id
      WHERE tj.id = $1 AND tj.user_id = $2 AND tj.status = 'pending'
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה או כבר אושרה' });
    }
    
    const job = jobResult.rows[0];
    
    await db.query(`
      UPDATE transfer_jobs SET status = 'confirmed', updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
    
    startTransferJob(jobId).catch(err => {
      console.error(`[GroupTransfers] Error starting job ${jobId}:`, err);
    });
    
    res.json({
      success: true,
      message: `מתחיל לשלוח ל-${job.target_count} קבוצות...`
    });
  } catch (error) {
    console.error('[GroupTransfers] Confirm job error:', error);
    res.status(500).json({ error: 'שגיאה באישור משימה' });
  }
}

/**
 * Stop an active job
 */
async function stopTransferJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const { deleteMessages } = req.body;
    
    const jobResult = await db.query(`
      SELECT * FROM transfer_jobs
      WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'confirmed', 'sending')
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה או כבר הסתיימה' });
    }
    
    await db.query(`
      UPDATE transfer_jobs SET 
        status = 'stopped',
        stop_requested = true,
        delete_sent_requested = $2,
        updated_at = NOW()
      WHERE id = $1
    `, [jobId, deleteMessages || false]);
    
    const job = jobResult.rows[0];
    
    res.json({
      success: true,
      message: deleteMessages 
        ? `המשימה נעצרה ו-${job.sent_count} הודעות נמחקות...`
        : `המשימה נעצרה. נשלחו ${job.sent_count} מתוך ${job.target_count} הודעות.`
    });
  } catch (error) {
    console.error('[GroupTransfers] Stop job error:', error);
    res.status(500).json({ error: 'שגיאה בעצירת משימה' });
  }
}

/**
 * Cancel a pending job
 */
async function cancelTransferJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    const result = await db.query(`
      UPDATE transfer_jobs SET status = 'stopped', updated_at = NOW()
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
    console.error('[GroupTransfers] Cancel job error:', error);
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
      SELECT tj.*, gt.name as transfer_name
      FROM transfer_jobs tj
      JOIN group_transfers gt ON tj.transfer_id = gt.id
      WHERE tj.id = $1 AND tj.user_id = $2
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה' });
    }
    
    const job = jobResult.rows[0];
    
    const messages = await db.query(`
      SELECT tjm.*, gtt.group_name
      FROM transfer_job_messages tjm
      JOIN group_transfer_targets gtt ON tjm.target_id = gtt.id
      WHERE tjm.job_id = $1
      ORDER BY tjm.created_at ASC
    `, [jobId]);
    
    res.json({
      success: true,
      job: {
        ...job,
        messages: messages.rows
      }
    });
  } catch (error) {
    console.error('[GroupTransfers] Get job status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוס משימה' });
  }
}

/**
 * Get active jobs
 */
async function getActiveJobs(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT tj.*, gt.name as transfer_name
      FROM transfer_jobs tj
      JOIN group_transfers gt ON tj.transfer_id = gt.id
      WHERE tj.user_id = $1 AND tj.status IN ('pending', 'confirmed', 'sending')
      ORDER BY tj.created_at DESC
    `, [userId]);
    
    const jobs = result.rows.map(job => {
      if (job.target_count > 0) {
        job.progress_percent = Math.round(((job.sent_count || 0) + (job.failed_count || 0)) / job.target_count * 100);
      } else {
        job.progress_percent = 0;
      }
      return job;
    });
    
    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    console.error('[GroupTransfers] Get active jobs error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משימות פעילות' });
  }
}

/**
 * Get job history for a transfer
 */
async function getTransferJobHistory(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    const ownerCheck = await db.query(
      'SELECT id FROM group_transfers WHERE id = $1 AND user_id = $2',
      [transferId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const result = await db.query(`
      SELECT * FROM transfer_jobs
      WHERE transfer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [transferId, parseInt(limit), parseInt(offset)]);
    
    const countResult = await db.query(
      'SELECT COUNT(*) FROM transfer_jobs WHERE transfer_id = $1',
      [transferId]
    );
    
    res.json({
      success: true,
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('[GroupTransfers] Get job history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית משימות' });
  }
}

/**
 * Get all job history
 */
async function getAllJobHistory(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT 
        tj.*,
        COALESCE(tj.transfer_name, gt.name, 'העברה שנמחקה') as transfer_name,
        (SELECT json_agg(json_build_object(
          'id', tjm.id,
          'target_id', tjm.target_id,
          'group_id', gtt.group_id,
          'group_name', COALESCE(gtt.group_name, REPLACE(gtt.group_id, '@g.us', '')),
          'status', tjm.status,
          'sent_at', tjm.sent_at,
          'deleted_at', tjm.deleted_at,
          'error_message', tjm.error_message
        ) ORDER BY gtt.sort_order)
        FROM transfer_job_messages tjm
        LEFT JOIN group_transfer_targets gtt ON tjm.target_id = gtt.id
        WHERE tjm.job_id = tj.id
        ) as messages
      FROM transfer_jobs tj
      LEFT JOIN group_transfers gt ON tj.transfer_id = gt.id
      WHERE tj.user_id = $1
      ORDER BY tj.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), parseInt(offset)]);
    
    const countResult = await db.query(
      'SELECT COUNT(*) FROM transfer_jobs WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('[GroupTransfers] Get all job history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית שליחות' });
  }
}

/**
 * Get pending jobs
 */
async function getPendingJobs(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT tj.*, gt.name as transfer_name,
        EXTRACT(EPOCH FROM (NOW() - tj.created_at)) as waiting_seconds
      FROM transfer_jobs tj
      JOIN group_transfers gt ON tj.transfer_id = gt.id
      WHERE tj.user_id = $1 AND tj.status = 'pending'
      ORDER BY tj.created_at DESC
    `, [userId]);
    
    res.json({
      success: true,
      jobs: result.rows
    });
  } catch (error) {
    console.error('[GroupTransfers] Get pending jobs error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משימות ממתינות' });
  }
}

/**
 * Delete a job
 * Allows force delete for stuck jobs
 */
async function deleteJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const force = req.query.force === 'true';
    
    const jobResult = await db.query(`
      SELECT tj.* FROM transfer_jobs tj
      WHERE tj.id = $1 AND tj.user_id = $2
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'אירוע לא נמצא' });
    }
    
    const job = jobResult.rows[0];
    
    // Check if job can be deleted
    const isActiveStatus = ['sending', 'pending', 'confirmed'].includes(job.status);
    
    if (isActiveStatus && !force) {
      // Allow deletion of stuck "sending" jobs (no progress or stuck for 2+ minutes)
      const isStuckSending = job.status === 'sending' && 
        (job.sent_count === 0 || (Date.now() - new Date(job.updated_at).getTime() > 2 * 60 * 1000));
      
      if (!isStuckSending) {
        return res.status(400).json({ error: 'לא ניתן למחוק אירוע פעיל' });
      }
    }
    
    await db.query('DELETE FROM transfer_job_messages WHERE job_id = $1', [jobId]);
    await db.query('DELETE FROM transfer_jobs WHERE id = $1', [jobId]);
    
    res.json({ success: true, message: 'האירוע נמחק בהצלחה' });
  } catch (error) {
    console.error('[GroupTransfers] Delete job error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת האירוע' });
  }
}

/**
 * Retry failed messages
 */
async function retryFailedMessages(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    const jobResult = await db.query(`
      SELECT tj.* FROM transfer_jobs tj
      WHERE tj.id = $1 AND tj.user_id = $2
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה' });
    }
    
    const failedResult = await db.query(`
      SELECT COUNT(*) as count FROM transfer_job_messages
      WHERE job_id = $1 AND status = 'failed'
    `, [jobId]);
    
    const failedCount = parseInt(failedResult.rows[0]?.count) || 0;
    
    if (failedCount === 0) {
      return res.status(400).json({ error: 'אין הודעות שנכשלו במשימה זו' });
    }
    
    await db.query(`
      UPDATE transfer_job_messages 
      SET status = 'pending', error_message = NULL
      WHERE job_id = $1 AND status = 'failed'
    `, [jobId]);
    
    await db.query(`
      UPDATE transfer_jobs 
      SET status = 'confirmed', stop_requested = false, 
          failed_count = 0, updated_at = NOW(), completed_at = NULL
      WHERE id = $1
    `, [jobId]);
    
    startTransferJob(jobId).catch(err => {
      console.error(`[GroupTransfers] Error restarting job ${jobId}:`, err);
    });
    
    res.json({
      success: true,
      jobId,
      failedCount,
      message: `שולח מחדש ל-${failedCount} קבוצות שנכשלו...`
    });
  } catch (error) {
    console.error('[GroupTransfers] Retry failed messages error:', error);
    res.status(500).json({ error: 'שגיאה בשליחה מחדש' });
  }
}

/**
 * Resume a transfer job
 */
async function resumeTransferJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    
    const jobResult = await db.query(`
      SELECT tj.*, 
        (SELECT COUNT(*) FROM transfer_job_messages WHERE job_id = tj.id AND status = 'pending') as pending_count
      FROM transfer_jobs tj
      WHERE tj.id = $1 AND tj.user_id = $2
    `, [jobId, userId]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'משימה לא נמצאה' });
    }
    
    const job = jobResult.rows[0];
    const pendingCount = parseInt(job.pending_count) || 0;
    
    if (pendingCount === 0) {
      return res.status(400).json({ error: 'אין קבוצות שממתינות לשליחה' });
    }
    
    await db.query(`
      UPDATE transfer_jobs 
      SET status = 'confirmed', stop_requested = false, updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
    
    startTransferJob(jobId).catch(err => {
      console.error(`[GroupTransfers] Error resuming job ${jobId}:`, err);
    });
    
    res.json({
      success: true,
      message: `ממשיך לשלוח ל-${pendingCount} קבוצות שנשארו...`,
      pendingCount
    });
  } catch (error) {
    console.error('[GroupTransfers] Resume job error:', error);
    res.status(500).json({ error: 'שגיאה בהמשכת המשימה' });
  }
}

/**
 * Start processing a transfer job
 */
async function startTransferJob(jobId) {
  const wahaService = require('../../services/waha/session.service');
  const { getWahaCredentials } = require('../../services/settings/system.service');
  
  try {
    const jobResult = await db.query(`
      SELECT tj.*, gt.delay_min, gt.delay_max, gt.user_id, gt.name as transfer_name,
        wc.session_name, wc.connection_type, wc.external_base_url, wc.external_api_key
      FROM transfer_jobs tj
      JOIN group_transfers gt ON tj.transfer_id = gt.id
      JOIN whatsapp_connections wc ON wc.user_id = gt.user_id AND wc.status = 'connected'
      WHERE tj.id = $1
    `, [jobId]);
    
    if (jobResult.rows.length === 0) {
      throw new Error('Job not found');
    }
    
    const job = jobResult.rows[0];
    const sessionName = job.session_name;
    
    if (!sessionName) {
      throw new Error('No WhatsApp session available');
    }
    
    const creds = getWahaCredentials();
    const wahaConnection = {
      base_url: creds.baseUrl,
      api_key: creds.apiKey,
      session_name: sessionName
    };
    
    await db.query(`
      UPDATE transfer_jobs SET status = 'sending', started_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
    
    const messagesResult = await db.query(`
      SELECT tjm.*, gtt.group_id, gtt.group_name
      FROM transfer_job_messages tjm
      JOIN group_transfer_targets gtt ON tjm.target_id = gtt.id
      WHERE tjm.job_id = $1 AND tjm.status = 'pending'
      ORDER BY gtt.sort_order ASC
    `, [jobId]);
    
    const messages = messagesResult.rows;
    let sentCount = 0;
    let failedCount = 0;
    
    const io = getIO();
    
    const calculateDelay = (min, max) => {
      const variation = 0.1;
      const baseDelay = Math.random() * (max - min) + min;
      const minVariation = baseDelay * (1 - variation);
      const maxVariation = baseDelay * (1 + variation);
      return Math.max(3, Math.floor(Math.random() * (maxVariation - minVariation) + minVariation));
    };
    
    for (let i = 0; i < messages.length; i++) {
      const statusCheck = await db.query(
        'SELECT stop_requested FROM transfer_jobs WHERE id = $1',
        [jobId]
      );
      
      if (statusCheck.rows[0]?.stop_requested) {
        console.log(`[GroupTransfers] Job ${jobId} stop requested`);
        break;
      }
      
      const message = messages[i];
      
      try {
        let messageId;
        
        if (job.message_type === 'text') {
          const result = await wahaService.sendMessage(wahaConnection, message.group_id, job.message_content);
          messageId = result?.id;
        } else if (job.message_type === 'image') {
          const result = await wahaService.sendImage(wahaConnection, message.group_id, job.media_url, job.media_caption);
          messageId = result?.id;
        } else if (job.message_type === 'video') {
          const result = await wahaService.sendVideo(wahaConnection, message.group_id, job.media_url, job.media_caption);
          messageId = result?.id;
        } else if (job.message_type === 'audio') {
          const result = await wahaService.sendVoice(wahaConnection, message.group_id, job.media_url);
          messageId = result?.id;
        }
        
        await db.query(`
          UPDATE transfer_job_messages 
          SET status = 'sent', message_id = $2, sent_at = NOW()
          WHERE id = $1
        `, [message.id, messageId]);
        
        sentCount++;
        
      } catch (sendError) {
        console.error(`[GroupTransfers] Error sending to ${message.group_id}:`, sendError.message);
        
        await db.query(`
          UPDATE transfer_job_messages 
          SET status = 'failed', error_message = $2
          WHERE id = $1
        `, [message.id, sendError.message]);
        
        failedCount++;
      }
      
      await db.query(`
        UPDATE transfer_jobs 
        SET sent_count = $2, failed_count = $3, updated_at = NOW()
        WHERE id = $1
      `, [jobId, sentCount, failedCount]);
      
      io.to(`user:${job.user_id}`).emit('transfer_job_progress', {
        jobId,
        sent: sentCount,
        failed: failedCount,
        total: job.target_count
      });
      
      if (i < messages.length - 1) {
        const delay = calculateDelay(job.delay_min || 3, job.delay_max || 10);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }
    
    const finalStatus = sentCount > 0 ? 'completed' : 'failed';
    
    await db.query(`
      UPDATE transfer_jobs 
      SET status = $2, completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [jobId, finalStatus]);
    
    io.to(`user:${job.user_id}`).emit('transfer_job_complete', {
      jobId,
      status: finalStatus,
      sent: sentCount,
      failed: failedCount,
      total: job.target_count
    });
    
    console.log(`[GroupTransfers] Job ${jobId} ${finalStatus}: ${sentCount}/${job.target_count} sent`);
    
  } catch (error) {
    console.error(`[GroupTransfers] Job ${jobId} error:`, error);
    
    await db.query(`
      UPDATE transfer_jobs 
      SET status = 'failed', updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
  }
}

module.exports = {
  createTransferJob,
  confirmTransferJob,
  stopTransferJob,
  cancelTransferJob,
  getJobStatus,
  getActiveJobs,
  getTransferJobHistory,
  getAllJobHistory,
  deleteJob,
  getPendingJobs,
  retryFailedMessages,
  resumeTransferJob,
  startTransferJob
};
