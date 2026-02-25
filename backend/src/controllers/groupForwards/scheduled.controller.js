const db = require('../../config/database');
const { sendNotificationMessage, sendCompletionMessage } = require('../../services/groupForwards/trigger.service');

/**
 * Get all scheduled forwards for user
 */
async function getScheduledForwards(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.query;
    
    let query = `
      SELECT sf.*, gf.name as forward_name
      FROM scheduled_forwards sf
      JOIN group_forwards gf ON sf.forward_id = gf.id
      WHERE sf.user_id = $1
    `;
    const params = [userId];
    
    if (forwardId) {
      query += ` AND sf.forward_id = $2`;
      params.push(forwardId);
    }
    
    query += ` ORDER BY 
      CASE WHEN sf.status = 'pending' THEN 0 ELSE 1 END,
      sf.scheduled_at ASC`;
    
    const result = await db.query(query, params);
    
    res.json({
      scheduled: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('[ScheduledForwards] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הודעות מתוזמנות' });
  }
}

/**
 * Create a scheduled forward
 */
async function createScheduledForward(req, res) {
  try {
    const userId = req.user.id;
    const { 
      forward_id, 
      message_type, 
      message_content, 
      media_url, 
      media_filename,
      media_caption,
      scheduled_at 
    } = req.body;
    
    if (!forward_id || !scheduled_at) {
      return res.status(400).json({ error: 'נדרש מזהה העברה ותאריך תזמון' });
    }
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM group_forwards WHERE id = $1 AND user_id = $2',
      [forward_id, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduled_at);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'תאריך התזמון חייב להיות בעתיד' });
    }
    
    const result = await db.query(`
      INSERT INTO scheduled_forwards 
      (user_id, forward_id, message_type, message_content, media_url, media_filename, media_caption, scheduled_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userId, 
      forward_id, 
      message_type || 'text', 
      message_content, 
      media_url, 
      media_filename,
      media_caption,
      scheduledDate
    ]);
    
    res.json({
      success: true,
      scheduled: result.rows[0]
    });
  } catch (error) {
    console.error('[ScheduledForwards] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת תזמון' });
  }
}

/**
 * Update a scheduled forward
 */
async function updateScheduledForward(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { 
      message_type, 
      message_content, 
      media_url, 
      media_filename,
      media_caption,
      scheduled_at 
    } = req.body;
    
    // Verify ownership and status
    const existing = await db.query(
      'SELECT * FROM scheduled_forwards WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'תזמון לא נמצא' });
    }
    
    if (existing.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'לא ניתן לערוך תזמון שכבר בוצע או בוטל' });
    }
    
    // Validate scheduled time is in the future
    if (scheduled_at) {
      const scheduledDate = new Date(scheduled_at);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'תאריך התזמון חייב להיות בעתיד' });
      }
    }
    
    const result = await db.query(`
      UPDATE scheduled_forwards SET
        message_type = COALESCE($1, message_type),
        message_content = COALESCE($2, message_content),
        media_url = COALESCE($3, media_url),
        media_filename = COALESCE($4, media_filename),
        media_caption = COALESCE($5, media_caption),
        scheduled_at = COALESCE($6, scheduled_at),
        updated_at = NOW()
      WHERE id = $7 AND user_id = $8
      RETURNING *
    `, [
      message_type,
      message_content,
      media_url,
      media_filename,
      media_caption,
      scheduled_at ? new Date(scheduled_at) : null,
      id,
      userId
    ]);
    
    res.json({
      success: true,
      scheduled: result.rows[0]
    });
  } catch (error) {
    console.error('[ScheduledForwards] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון תזמון' });
  }
}

/**
 * Cancel/delete a scheduled forward
 */
async function deleteScheduledForward(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Verify ownership
    const existing = await db.query(
      'SELECT * FROM scheduled_forwards WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'תזמון לא נמצא' });
    }
    
    // If pending, cancel. Otherwise delete
    if (existing.rows[0].status === 'pending') {
      await db.query(`
        UPDATE scheduled_forwards SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
      `, [id]);
    } else {
      await db.query('DELETE FROM scheduled_forwards WHERE id = $1', [id]);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[ScheduledForwards] Delete error:', error);
    res.status(500).json({ error: 'שגיאה בביטול תזמון' });
  }
}

/**
 * Process pending scheduled forwards (called by cron)
 */
async function processScheduledForwards() {
  console.log('[ScheduledForwards] Processing scheduled forwards...');
  
  try {
    // Get pending scheduled forwards that are due
    const pending = await db.query(`
      SELECT sf.*, gf.name as forward_name
      FROM scheduled_forwards sf
      JOIN group_forwards gf ON sf.forward_id = gf.id
      WHERE sf.status = 'pending' AND sf.scheduled_at <= NOW()
      ORDER BY sf.scheduled_at ASC
      LIMIT 10
    `);
    
    console.log(`[ScheduledForwards] Found ${pending.rows.length} due schedules`);
    
    for (const schedule of pending.rows) {
      try {
        // Get user's phone for notifications
        const userResult = await db.query('SELECT phone FROM users WHERE id = $1', [schedule.user_id]);
        const userPhone = userResult.rows[0]?.phone;
        
        // Mark as processing
        await db.query(`
          UPDATE scheduled_forwards SET status = 'processing', updated_at = NOW()
          WHERE id = $1
        `, [schedule.id]);
        
        // Create a job for this scheduled forward
        const { createForwardJob, startForwardJob } = require('./jobs.controller');
        
        // Get targets for this forward
        const targetsResult = await db.query(`
          SELECT id FROM group_forward_targets WHERE forward_id = $1 AND is_active = true
        `, [schedule.forward_id]);
        
        if (targetsResult.rows.length === 0) {
          throw new Error('אין קבוצות יעד להעברה');
        }
        
        // Get message content (suffix will be applied by jobs.controller.js per target)
        // Delay settings are fetched from group_forwards when job runs
        let messageContent = schedule.message_content || schedule.media_caption || '';
        
        // Create job with sender_phone so completion notifications work
        const jobResult = await db.query(`
          INSERT INTO forward_jobs 
          (forward_id, user_id, message_type, message_text, media_url, media_filename, total_targets, status, sender_phone)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8)
          RETURNING *
        `, [
          schedule.forward_id,
          schedule.user_id,
          schedule.message_type,
          messageContent,
          schedule.media_url,
          schedule.media_filename,
          targetsResult.rows.length,
          userPhone
        ]);
        
        const job = jobResult.rows[0];
        
        // Create job messages for each target
        for (const target of targetsResult.rows) {
          await db.query(`
            INSERT INTO forward_job_messages (job_id, target_id, status)
            VALUES ($1, $2, 'pending')
          `, [job.id, target.id]);
        }
        
        // Send start notification to user
        if (userPhone) {
          try {
            await sendNotificationMessage(
              schedule.user_id, 
              userPhone, 
              `🚀 *התחלתי לשלוח!*\n\n📤 ${schedule.forward_name}\n📊 שליחה ל-${targetsResult.rows.length} קבוצות\n⏰ תזמון אוטומטי`
            );
          } catch (notifyErr) {
            console.error(`[ScheduledForwards] Failed to send start notification:`, notifyErr.message);
          }
        }
        
        // Start the job (completion notification is handled by startForwardJob since sender_phone is set)
        startForwardJob(job.id).catch(err => {
          console.error(`[ScheduledForwards] Error starting job ${job.id}:`, err);
        });
        
        // Update schedule with job reference
        await db.query(`
          UPDATE scheduled_forwards SET 
            status = 'sent', 
            job_id = $1, 
            executed_at = NOW(),
            updated_at = NOW()
          WHERE id = $2
        `, [job.id, schedule.id]);
        
        console.log(`[ScheduledForwards] Started scheduled forward ${schedule.id} as job ${job.id}`);
        
      } catch (scheduleError) {
        console.error(`[ScheduledForwards] Error processing schedule ${schedule.id}:`, scheduleError);
        
        await db.query(`
          UPDATE scheduled_forwards SET 
            status = 'failed', 
            error_message = $1,
            updated_at = NOW()
          WHERE id = $2
        `, [scheduleError.message, schedule.id]);
      }
    }
    
    console.log('[ScheduledForwards] Processing completed');
  } catch (error) {
    console.error('[ScheduledForwards] Process error:', error);
  }
}

module.exports = {
  getScheduledForwards,
  createScheduledForward,
  updateScheduledForward,
  deleteScheduledForward,
  processScheduledForwards
};
