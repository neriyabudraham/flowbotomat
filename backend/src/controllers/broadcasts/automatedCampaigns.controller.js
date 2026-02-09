const db = require('../../config/database');

/**
 * Automated Campaigns Controller
 * Handles recurring/scheduled campaigns with multi-step sequences
 */

// Ensure tables exist
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS automated_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT false,
      
      -- Schedule type: 'manual', 'interval', 'weekly', 'monthly'
      schedule_type VARCHAR(50) NOT NULL,
      
      -- Schedule config (JSON)
      -- For interval: { "value": 3, "unit": "days" } or { "value": 12, "unit": "hours" }
      -- For weekly: { "days": [0, 3] } (0=Sunday, 6=Saturday)
      -- For monthly: { "dates": [1, 15] }
      schedule_config JSONB NOT NULL DEFAULT '{}',
      
      -- Time to send (HH:MM format)
      send_time TIME NOT NULL DEFAULT '09:00',
      
      -- Advanced settings
      settings JSONB DEFAULT '{"delay_between_messages": 2, "delay_unit": "seconds", "batch_size": 50, "batch_delay": 30}',
      
      -- Stats
      total_sent INTEGER DEFAULT 0,
      last_run_at TIMESTAMP,
      next_run_at TIMESTAMP,
      current_step INTEGER DEFAULT 0,
      
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Add settings column if not exists (migration)
  await db.query(`ALTER TABLE automated_campaigns ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`);
  await db.query(`ALTER TABLE automated_campaigns ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0`);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS automated_campaign_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES automated_campaigns(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL DEFAULT 0,
      
      -- Step type: 'send', 'wait', 'trigger_campaign'
      step_type VARCHAR(50) NOT NULL DEFAULT 'send',
      
      -- For 'send' step
      template_id UUID REFERENCES broadcast_templates(id) ON DELETE SET NULL,
      audience_id UUID REFERENCES broadcast_audiences(id) ON DELETE SET NULL,
      send_time TIME,
      
      -- For 'wait' step
      -- wait_config: { "value": 3, "unit": "hours" } or { "value": 2, "unit": "days" }
      wait_config JSONB DEFAULT '{}',
      
      -- For 'trigger_campaign' step
      trigger_campaign_id UUID REFERENCES automated_campaigns(id) ON DELETE SET NULL,
      
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Add new columns if not exists (migration)
  await db.query(`ALTER TABLE automated_campaign_steps ADD COLUMN IF NOT EXISTS audience_id UUID REFERENCES broadcast_audiences(id) ON DELETE SET NULL`);
  await db.query(`ALTER TABLE automated_campaign_steps ADD COLUMN IF NOT EXISTS send_time TIME`);
  await db.query(`ALTER TABLE automated_campaign_steps ADD COLUMN IF NOT EXISTS trigger_campaign_id UUID`);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS automated_campaign_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES automated_campaigns(id) ON DELETE CASCADE,
      step_id UUID REFERENCES automated_campaign_steps(id) ON DELETE SET NULL,
      step_order INTEGER,
      
      status VARCHAR(50) DEFAULT 'running',
      recipients_total INTEGER DEFAULT 0,
      recipients_sent INTEGER DEFAULT 0,
      recipients_failed INTEGER DEFAULT 0,
      current_index INTEGER DEFAULT 0,
      
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP,
      paused_at TIMESTAMP,
      error_message TEXT
    )
  `);
  
  // Add new columns if not exists (migration)
  await db.query(`ALTER TABLE automated_campaign_runs ADD COLUMN IF NOT EXISTS step_order INTEGER`);
  await db.query(`ALTER TABLE automated_campaign_runs ADD COLUMN IF NOT EXISTS current_index INTEGER DEFAULT 0`);
  await db.query(`ALTER TABLE automated_campaign_runs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP`);
  
  // Index for faster queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_automated_campaigns_next_run 
    ON automated_campaigns(next_run_at) WHERE is_active = true
  `);
}

// Initialize tables
ensureTables().catch(err => console.error('[AutomatedCampaigns] Table init error:', err));

/**
 * Calculate next run date based on schedule
 * Supports per-day/per-date times with day_times and date_times
 */
function calculateNextRun(scheduleType, scheduleConfig, sendTime, fromDate = new Date()) {
  // Manual campaigns don't have scheduled runs
  if (scheduleType === 'manual') {
    return null;
  }
  
  const defaultTime = sendTime || '09:00';
  const [defaultHours, defaultMinutes] = defaultTime.split(':').map(Number);
  
  switch (scheduleType) {
    case 'interval': {
      const value = scheduleConfig.value || 1;
      const unit = scheduleConfig.unit || 'days';
      const next = new Date(fromDate);
      
      if (unit === 'hours') {
        next.setHours(next.getHours() + value);
      } else {
        next.setDate(next.getDate() + value);
        next.setHours(defaultHours, defaultMinutes, 0, 0);
      }
      return next;
    }
    
    case 'weekly': {
      // Support new format with day_times: { "0": "09:00", "3": "14:00" }
      const dayTimes = scheduleConfig.day_times || {};
      const targetDays = Object.keys(dayTimes).length > 0 
        ? Object.keys(dayTimes).map(Number) 
        : (scheduleConfig.days || [0]); // Fallback to old format
      
      if (targetDays.length === 0) return null;
      
      // Find next occurrence (check today first, then next 7 days)
      for (let i = 0; i <= 7; i++) {
        const checkDate = new Date(fromDate);
        checkDate.setDate(checkDate.getDate() + i);
        const dayOfWeek = checkDate.getDay();
        
        if (targetDays.includes(dayOfWeek)) {
          // Get time for this day
          const dayTime = dayTimes[dayOfWeek] || defaultTime;
          const [h, m] = dayTime.split(':').map(Number);
          checkDate.setHours(h, m, 0, 0);
          
          // Only return if this time is in the future
          if (checkDate > fromDate) {
            return checkDate;
          }
        }
      }
      return null;
    }
    
    case 'monthly': {
      // Support new format with date_times: { "1": "09:00", "15": "14:00" }
      const dateTimes = scheduleConfig.date_times || {};
      const targetDates = Object.keys(dateTimes).length > 0
        ? Object.keys(dateTimes).map(Number)
        : (scheduleConfig.dates || [1]); // Fallback to old format
      
      if (targetDates.length === 0) return null;
      
      // Find next occurrence (this month or next 2 months)
      for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
        const checkMonth = new Date(fromDate);
        checkMonth.setMonth(checkMonth.getMonth() + monthOffset);
        
        for (const date of targetDates.sort((a, b) => a - b)) {
          const checkDate = new Date(checkMonth);
          checkDate.setDate(date);
          
          // Get time for this date
          const dateTime = dateTimes[date] || defaultTime;
          const [h, m] = dateTime.split(':').map(Number);
          checkDate.setHours(h, m, 0, 0);
          
          if (checkDate > fromDate) {
            return checkDate;
          }
        }
      }
      return null;
    }
    
    default:
      return null;
  }
}

/**
 * Get all automated campaigns
 */
async function getAutomatedCampaigns(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        ac.*,
        a.name as audience_name,
        (SELECT COUNT(*) FROM automated_campaign_steps WHERE campaign_id = ac.id) as steps_count,
        (SELECT COUNT(*) FROM automated_campaign_runs WHERE campaign_id = ac.id) as runs_count
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.user_id = $1
      ORDER BY ac.created_at DESC
    `, [userId]);
    
    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('[AutomatedCampaigns] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קמפיינים אוטומטיים' });
  }
}

/**
 * Get single campaign with steps
 */
async function getAutomatedCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT 
        ac.*,
        a.name as audience_name
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.id = $1 AND ac.user_id = $2
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = result.rows[0];
    
    // Get steps
    const stepsResult = await db.query(`
      SELECT 
        s.*,
        t.name as template_name
      FROM automated_campaign_steps s
      LEFT JOIN broadcast_templates t ON t.id = s.template_id
      WHERE s.campaign_id = $1
      ORDER BY s.step_order
    `, [id]);
    
    campaign.steps = stepsResult.rows;
    
    res.json({ campaign });
  } catch (error) {
    console.error('[AutomatedCampaigns] Get single error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קמפיין' });
  }
}

/**
 * Create automated campaign
 */
async function createAutomatedCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { 
      name, 
      description, 
      schedule_type, 
      schedule_config, 
      send_time,
      settings,
      steps 
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם הקמפיין נדרש' });
    }
    
    if (!schedule_type) {
      return res.status(400).json({ error: 'סוג תזמון נדרש' });
    }
    
    // Calculate next run (null for manual)
    const nextRun = calculateNextRun(schedule_type, schedule_config || {}, send_time);
    
    // Create campaign
    const result = await db.query(`
      INSERT INTO automated_campaigns 
      (user_id, name, description, schedule_type, schedule_config, send_time, settings, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [userId, name, description, schedule_type, schedule_config || {}, send_time || '09:00', settings || {}, nextRun]);
    
    const campaign = result.rows[0];
    
    // Create steps if provided
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await db.query(`
          INSERT INTO automated_campaign_steps 
          (campaign_id, step_order, step_type, template_id, audience_id, send_time, wait_config, trigger_campaign_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          campaign.id, 
          i, 
          step.step_type || 'send', 
          step.template_id || null, 
          step.audience_id || null,
          step.send_time || null,
          step.wait_config || {},
          step.campaign_id || null
        ]);
      }
    }
    
    console.log(`[AutomatedCampaigns] Created campaign ${campaign.id} for user ${userId}`);
    
    res.json({ campaign });
  } catch (error) {
    console.error('[AutomatedCampaigns] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת קמפיין' });
  }
}

/**
 * Update automated campaign
 */
async function updateAutomatedCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { 
      name, 
      description, 
      schedule_type, 
      schedule_config, 
      send_time,
      settings,
      steps 
    } = req.body;
    
    // Calculate new next run if schedule changed (null for manual)
    const nextRun = calculateNextRun(schedule_type, schedule_config || {}, send_time);
    
    const result = await db.query(`
      UPDATE automated_campaigns
      SET name = $1, description = $2, schedule_type = $3, schedule_config = $4, 
          send_time = $5, settings = $6, next_run_at = $7, updated_at = NOW()
      WHERE id = $8 AND user_id = $9
      RETURNING *
    `, [name, description, schedule_type, schedule_config || {}, send_time || '09:00', settings || {}, nextRun, id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    // Update steps if provided
    if (steps && Array.isArray(steps)) {
      // Delete old steps
      await db.query('DELETE FROM automated_campaign_steps WHERE campaign_id = $1', [id]);
      
      // Create new steps
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await db.query(`
          INSERT INTO automated_campaign_steps 
          (campaign_id, step_order, step_type, template_id, audience_id, send_time, wait_config, trigger_campaign_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          id, 
          i, 
          step.step_type || 'send', 
          step.template_id || null, 
          step.audience_id || null,
          step.send_time || null,
          step.wait_config || {},
          step.campaign_id || null
        ]);
      }
    }
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[AutomatedCampaigns] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון קמפיין' });
  }
}

/**
 * Toggle campaign active status
 */
async function toggleAutomatedCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { is_active } = req.body;
    
    // If activating, recalculate next run
    let nextRunUpdate = '';
    const params = [is_active, id, userId];
    
    if (is_active) {
      // Get campaign schedule to calculate next run
      const campaignResult = await db.query(
        'SELECT schedule_type, schedule_config, send_time FROM automated_campaigns WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      
      if (campaignResult.rows.length > 0) {
        const { schedule_type, schedule_config, send_time } = campaignResult.rows[0];
        const nextRun = calculateNextRun(schedule_type, schedule_config, send_time);
        if (nextRun) {
          nextRunUpdate = ', next_run_at = $4';
          params.push(nextRun);
        }
      }
    }
    
    const result = await db.query(`
      UPDATE automated_campaigns
      SET is_active = $1, updated_at = NOW()${nextRunUpdate}
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    console.log(`[AutomatedCampaigns] ${is_active ? 'Activated' : 'Deactivated'} campaign ${id}`);
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[AutomatedCampaigns] Toggle error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון סטטוס' });
  }
}

/**
 * Delete automated campaign
 */
async function deleteAutomatedCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(
      'DELETE FROM automated_campaigns WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[AutomatedCampaigns] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת קמפיין' });
  }
}

/**
 * Get campaign run history
 */
async function getCampaignRuns(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM automated_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const result = await db.query(`
      SELECT 
        r.*,
        s.step_order,
        t.name as template_name
      FROM automated_campaign_runs r
      LEFT JOIN automated_campaign_steps s ON s.id = r.step_id
      LEFT JOIN broadcast_templates t ON t.id = s.template_id
      WHERE r.campaign_id = $1
      ORDER BY r.started_at DESC
      LIMIT 50
    `, [id]);
    
    res.json({ runs: result.rows });
  } catch (error) {
    console.error('[AutomatedCampaigns] Get runs error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריה' });
  }
}

/**
 * Run campaign manually
 */
async function runCampaignNow(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Get campaign with user_id for execution
    const campaignResult = await db.query(`
      SELECT ac.*, a.name as audience_name, a.id as audience_id
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = (
        SELECT audience_id FROM automated_campaign_steps 
        WHERE campaign_id = ac.id AND step_type = 'send' 
        ORDER BY step_order LIMIT 1
      )
      WHERE ac.id = $1 AND ac.user_id = $2
    `, [id, userId]);
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Execute the campaign asynchronously
    const scheduler = require('../../services/broadcasts/scheduler.service');
    
    // Start execution in background
    scheduler.executeCampaign(campaign).then(() => {
      console.log(`[AutomatedCampaigns] Manual run completed for campaign ${id}`);
    }).catch(err => {
      console.error(`[AutomatedCampaigns] Manual run failed for campaign ${id}:`, err);
    });
    
    console.log(`[AutomatedCampaigns] Manual run triggered for campaign ${id}`);
    
    res.json({ success: true, message: 'הקמפיין הופעל! ההודעות נשלחות ברקע.' });
  } catch (error) {
    console.error('[AutomatedCampaigns] Run error:', error);
    res.status(500).json({ error: 'שגיאה בהפעלת קמפיין' });
  }
}

module.exports = {
  getAutomatedCampaigns,
  getAutomatedCampaign,
  createAutomatedCampaign,
  updateAutomatedCampaign,
  toggleAutomatedCampaign,
  deleteAutomatedCampaign,
  getCampaignRuns,
  runCampaignNow,
  calculateNextRun
};
