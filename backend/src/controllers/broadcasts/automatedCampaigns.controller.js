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
      
      -- Schedule type: 'interval', 'weekly', 'monthly', 'specific_dates'
      schedule_type VARCHAR(50) NOT NULL,
      
      -- Schedule config (JSON)
      -- For interval: { "days": 3 }
      -- For weekly: { "days": [0, 3] } (0=Sunday, 6=Saturday)
      -- For monthly: { "dates": [1, 15] }
      -- For specific_dates: { "dates": ["2024-01-15", "2024-02-20"] }
      schedule_config JSONB NOT NULL DEFAULT '{}',
      
      -- Time to send (HH:MM format)
      send_time TIME NOT NULL DEFAULT '09:00',
      
      -- Audience
      audience_id UUID REFERENCES broadcast_audiences(id) ON DELETE SET NULL,
      
      -- Stats
      total_sent INTEGER DEFAULT 0,
      last_run_at TIMESTAMP,
      next_run_at TIMESTAMP,
      
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS automated_campaign_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES automated_campaigns(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL DEFAULT 0,
      
      -- Step type: 'send', 'wait'
      step_type VARCHAR(50) NOT NULL DEFAULT 'send',
      
      -- For 'send' step
      template_id UUID REFERENCES broadcast_templates(id) ON DELETE SET NULL,
      direct_message TEXT,
      direct_media_url TEXT,
      
      -- For 'wait' step
      -- wait_config: { "type": "days", "value": 3 } or { "type": "until_date", "day": 15 }
      wait_config JSONB DEFAULT '{}',
      
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS automated_campaign_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES automated_campaigns(id) ON DELETE CASCADE,
      step_id UUID REFERENCES automated_campaign_steps(id) ON DELETE SET NULL,
      
      status VARCHAR(50) DEFAULT 'running',
      recipients_total INTEGER DEFAULT 0,
      recipients_sent INTEGER DEFAULT 0,
      recipients_failed INTEGER DEFAULT 0,
      
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP,
      error_message TEXT
    )
  `);
  
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
 */
function calculateNextRun(scheduleType, scheduleConfig, sendTime, fromDate = new Date()) {
  const [hours, minutes] = (sendTime || '09:00').split(':').map(Number);
  
  switch (scheduleType) {
    case 'interval': {
      const days = scheduleConfig.days || 1;
      const next = new Date(fromDate);
      next.setDate(next.getDate() + days);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }
    
    case 'weekly': {
      const targetDays = scheduleConfig.days || [0]; // Default Sunday
      const next = new Date(fromDate);
      next.setHours(hours, minutes, 0, 0);
      
      // Find next occurrence
      for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(next);
        checkDate.setDate(checkDate.getDate() + i);
        if (targetDays.includes(checkDate.getDay())) {
          return checkDate;
        }
      }
      return next;
    }
    
    case 'monthly': {
      const targetDates = scheduleConfig.dates || [1]; // Default 1st
      const next = new Date(fromDate);
      next.setHours(hours, minutes, 0, 0);
      
      // Find next occurrence (this month or next)
      for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
        const checkMonth = new Date(next);
        checkMonth.setMonth(checkMonth.getMonth() + monthOffset);
        
        for (const date of targetDates.sort((a, b) => a - b)) {
          const checkDate = new Date(checkMonth);
          checkDate.setDate(date);
          checkDate.setHours(hours, minutes, 0, 0);
          
          if (checkDate > fromDate) {
            return checkDate;
          }
        }
      }
      return next;
    }
    
    case 'specific_dates': {
      const dates = (scheduleConfig.dates || [])
        .map(d => new Date(d))
        .filter(d => d > fromDate)
        .sort((a, b) => a - b);
      
      if (dates.length > 0) {
        const next = dates[0];
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
      return null; // No more dates
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
      audience_id,
      steps 
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם הקמפיין נדרש' });
    }
    
    if (!schedule_type) {
      return res.status(400).json({ error: 'סוג תזמון נדרש' });
    }
    
    // Calculate next run
    const nextRun = calculateNextRun(schedule_type, schedule_config || {}, send_time);
    
    // Create campaign
    const result = await db.query(`
      INSERT INTO automated_campaigns 
      (user_id, name, description, schedule_type, schedule_config, send_time, audience_id, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [userId, name, description, schedule_type, schedule_config || {}, send_time || '09:00', audience_id, nextRun]);
    
    const campaign = result.rows[0];
    
    // Create steps if provided
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await db.query(`
          INSERT INTO automated_campaign_steps 
          (campaign_id, step_order, step_type, template_id, direct_message, direct_media_url, wait_config)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [campaign.id, i, step.step_type || 'send', step.template_id, step.direct_message, step.direct_media_url, step.wait_config || {}]);
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
      audience_id,
      steps 
    } = req.body;
    
    // Calculate new next run if schedule changed
    const nextRun = calculateNextRun(schedule_type, schedule_config || {}, send_time);
    
    const result = await db.query(`
      UPDATE automated_campaigns
      SET name = $1, description = $2, schedule_type = $3, schedule_config = $4, 
          send_time = $5, audience_id = $6, next_run_at = $7, updated_at = NOW()
      WHERE id = $8 AND user_id = $9
      RETURNING *
    `, [name, description, schedule_type, schedule_config || {}, send_time || '09:00', audience_id, nextRun, id, userId]);
    
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
          (campaign_id, step_order, step_type, template_id, direct_message, direct_media_url, wait_config)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, i, step.step_type || 'send', step.template_id, step.direct_message, step.direct_media_url, step.wait_config || {}]);
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
 * Run campaign manually (for testing)
 */
async function runCampaignNow(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Get campaign
    const campaignResult = await db.query(`
      SELECT ac.*, a.name as audience_name
      FROM automated_campaigns ac
      LEFT JOIN broadcast_audiences a ON a.id = ac.audience_id
      WHERE ac.id = $1 AND ac.user_id = $2
    `, [id, userId]);
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Execute the campaign (this would call the sender service)
    // For now, just mark it as run
    await db.query(`
      UPDATE automated_campaigns
      SET last_run_at = NOW(), 
          next_run_at = $1,
          total_sent = total_sent + 1
      WHERE id = $2
    `, [calculateNextRun(campaign.schedule_type, campaign.schedule_config, campaign.send_time), id]);
    
    console.log(`[AutomatedCampaigns] Manual run triggered for campaign ${id}`);
    
    res.json({ success: true, message: 'הקמפיין הופעל' });
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
