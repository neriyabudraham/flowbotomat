const db = require('../../config/database');

/**
 * Automated Campaigns Controller
 * Handles recurring/scheduled campaigns with multi-step sequences
 * 
 * TIMEZONE STRATEGY:
 * - All user-facing times are in Israel timezone (Asia/Jerusalem)
 * - calculateNextRun returns Israel time as a STRING (e.g., "2025-02-09 20:12:00")
 * - PostgreSQL converts to UTC on INSERT/UPDATE using AT TIME ZONE 'Asia/Jerusalem'
 * - PostgreSQL converts back to UTC ISO string on SELECT using to_char + AT TIME ZONE
 * - This avoids ALL JavaScript Date serialization issues
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
  await db.query(`ALTER TABLE automated_campaigns ADD COLUMN IF NOT EXISTS audience_id UUID REFERENCES broadcast_audiences(id) ON DELETE SET NULL`);
  
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
  
  // Add scheduled_start_at for manual campaigns with scheduled start
  await db.query(`ALTER TABLE automated_campaigns ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP`);
  
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
 * Get current date/time in Israel timezone using PostgreSQL
 * Returns { year, month (1-12), day, hour, minute, dayOfWeek (0=Sunday) }
 */
async function getNowInIsraelFromDB() {
  const result = await db.query(`
    SELECT 
      EXTRACT(year FROM NOW() AT TIME ZONE 'Asia/Jerusalem')::int as year,
      EXTRACT(month FROM NOW() AT TIME ZONE 'Asia/Jerusalem')::int as month,
      EXTRACT(day FROM NOW() AT TIME ZONE 'Asia/Jerusalem')::int as day,
      EXTRACT(hour FROM NOW() AT TIME ZONE 'Asia/Jerusalem')::int as hour,
      EXTRACT(minute FROM NOW() AT TIME ZONE 'Asia/Jerusalem')::int as minute,
      EXTRACT(dow FROM NOW() AT TIME ZONE 'Asia/Jerusalem')::int as day_of_week,
      to_char(NOW() AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI:SS') as israel_now_str,
      to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') as utc_now_str
  `);
  return result.rows[0];
}

/**
 * Calculate next run date based on schedule
 * Returns an Israel time STRING like "2025-02-09 20:12:00" (NOT a Date object!)
 * PostgreSQL will convert this to UTC when storing
 */
function calculateNextRun(scheduleType, scheduleConfig, sendTime, israelNow) {
  // Manual campaigns don't have scheduled runs
  if (scheduleType === 'manual') {
    return null;
  }
  
  const defaultTime = sendTime || '09:00';
  // Handle TIME format from DB (e.g., "20:12:00" → "20:12")
  const cleanDefaultTime = defaultTime.substring(0, 5);
  const [defaultHours, defaultMinutes] = cleanDefaultTime.split(':').map(Number);
  
  console.log(`[calculateNextRun] Type: ${scheduleType}, SendTime: ${sendTime}, Default: ${cleanDefaultTime}`);
  console.log(`[calculateNextRun] Israel Now: ${israelNow.israel_now_str} (day ${israelNow.day_of_week}), UTC Now: ${israelNow.utc_now_str}`);
  
  // israelNow has: year, month (1-12), day, hour, minute, day_of_week
  const nowMinutes = israelNow.hour * 60 + israelNow.minute;
  
  switch (scheduleType) {
    case 'interval': {
      const value = scheduleConfig.value || 1;
      const unit = scheduleConfig.unit || 'days';
      
      if (unit === 'hours') {
        // Add hours to current Israel time
        let h = israelNow.hour + value;
        let d = israelNow.day;
        let m = israelNow.month;
        let y = israelNow.year;
        while (h >= 24) {
          h -= 24;
          d++;
        }
        const hStr = String(h).padStart(2, '0');
        const minStr = String(israelNow.minute).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        const mStr = String(m).padStart(2, '0');
        return `${y}-${mStr}-${dStr} ${hStr}:${minStr}:00`;
      } else {
        // X days from now at the specified time
        // We'll let PostgreSQL calculate the actual date
        const hStr = String(defaultHours).padStart(2, '0');
        const minStr = String(defaultMinutes).padStart(2, '0');
        // Return a special format that we'll handle in SQL
        return `INTERVAL_DAYS:${value}:${hStr}:${minStr}`;
      }
    }
    
    case 'weekly': {
      // Support new format with day_times: { "0": "09:00", "3": "14:00" }
      const dayTimes = scheduleConfig.day_times || {};
      const targetDays = Object.keys(dayTimes).length > 0 
        ? Object.keys(dayTimes).map(Number) 
        : (scheduleConfig.days || [0]); // Fallback to old format
      
      console.log(`[calculateNextRun] Weekly - targetDays: ${targetDays}, dayTimes:`, dayTimes);
      
      if (targetDays.length === 0) return null;
      
      // Find next occurrence (check today first, then next 7 days)
      for (let i = 0; i <= 7; i++) {
        // Calculate what day of week it will be in i days
        const futureDow = (israelNow.day_of_week + i) % 7;
        
        if (targetDays.includes(futureDow)) {
          // Get time for this day
          const dayTime = dayTimes[futureDow] || cleanDefaultTime;
          const cleanDayTime = dayTime.substring(0, 5);
          const [h, m] = cleanDayTime.split(':').map(Number);
          const targetMinutes = h * 60 + m;
          
          // If it's today (i=0), only count if the time is in the future
          if (i === 0 && targetMinutes <= nowMinutes) {
            console.log(`[calculateNextRun] Weekly - today day ${futureDow}: time ${h}:${m} already passed (now ${israelNow.hour}:${israelNow.minute})`);
            continue;
          }
          
          // Return a special format: WEEKLY_OFFSET:days:HH:MM
          console.log(`[calculateNextRun] Weekly - found: day ${futureDow} in ${i} days at ${h}:${String(m).padStart(2, '0')} Israel`);
          return `WEEKLY_OFFSET:${i}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
      
      // Check this month first, then next months
      for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
        let checkMonth = israelNow.month + monthOffset;
        let checkYear = israelNow.year;
        if (checkMonth > 12) {
          checkMonth -= 12;
          checkYear++;
        }
        
        for (const targetDay of targetDates.sort((a, b) => a - b)) {
          const dateTime = dateTimes[targetDay] || cleanDefaultTime;
          const cleanDateTime = dateTime.substring(0, 5);
          const [h, m] = cleanDateTime.split(':').map(Number);
          const targetMinutes = h * 60 + m;
          
          // If same month, check if the date/time is in the future
          if (monthOffset === 0) {
            if (targetDay < israelNow.day) continue;
            if (targetDay === israelNow.day && targetMinutes <= nowMinutes) continue;
          }
          
          const mStr = String(checkMonth).padStart(2, '0');
          const dStr = String(targetDay).padStart(2, '0');
          const hStr = String(h).padStart(2, '0');
          const minStr = String(m).padStart(2, '0');
          return `${checkYear}-${mStr}-${dStr} ${hStr}:${minStr}:00`;
        }
      }
      return null;
    }
    
    default:
      return null;
  }
}

/**
 * Store next_run_at using PostgreSQL timezone conversion
 * israelTimeStr can be:
 * - null → SET next_run_at = NULL
 * - "2025-02-09 20:12:00" → direct Israel time
 * - "WEEKLY_OFFSET:3:14:30" → 3 days from now at 14:30 Israel
 * - "INTERVAL_DAYS:2:09:00" → 2 days from now at 09:00 Israel
 */
async function storeNextRunAt(campaignId, israelTimeStr) {
  if (!israelTimeStr) {
    await db.query(`UPDATE automated_campaigns SET next_run_at = NULL WHERE id = $1`, [campaignId]);
    return;
  }
  
  let sql;
  let params;
  
  if (israelTimeStr.startsWith('WEEKLY_OFFSET:')) {
    // Format: WEEKLY_OFFSET:days_offset:HH:MM
    const parts = israelTimeStr.split(':');
    const daysOffset = parseInt(parts[1]);
    const time = `${parts[2]}:${parts[3]}:00`;
    
    // Use PostgreSQL to calculate: current Israel date + offset days, at the specified Israel time
    sql = `
      UPDATE automated_campaigns 
      SET next_run_at = (
        (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + interval '${daysOffset} days' + $2::time)
        AT TIME ZONE 'Asia/Jerusalem'
      )
      WHERE id = $1
    `;
    params = [campaignId, time];
  } else if (israelTimeStr.startsWith('INTERVAL_DAYS:')) {
    // Format: INTERVAL_DAYS:days:HH:MM
    const parts = israelTimeStr.split(':');
    const daysOffset = parseInt(parts[1]);
    const time = `${parts[2]}:${parts[3]}:00`;
    
    sql = `
      UPDATE automated_campaigns 
      SET next_run_at = (
        (date_trunc('day', NOW() AT TIME ZONE 'Asia/Jerusalem') + interval '${daysOffset} days' + $2::time)
        AT TIME ZONE 'Asia/Jerusalem'
      )
      WHERE id = $1
    `;
    params = [campaignId, time];
  } else {
    // Direct Israel time string: "2025-02-09 20:12:00"
    sql = `
      UPDATE automated_campaigns 
      SET next_run_at = ($2::timestamp AT TIME ZONE 'Asia/Jerusalem')
      WHERE id = $1
    `;
    params = [campaignId, israelTimeStr];
  }
  
  console.log(`[storeNextRunAt] Campaign ${campaignId}: Israel time = ${israelTimeStr}`);
  await db.query(sql, params);
  
  // Log what was actually stored
  // For TIMESTAMP WITHOUT TIME ZONE: first AT TIME ZONE 'UTC' declares it as UTC (→ TIMESTAMPTZ), 
  // then AT TIME ZONE 'Asia/Jerusalem' converts to Israel local time
  const check = await db.query(`
    SELECT 
      to_char(next_run_at, 'YYYY-MM-DD HH24:MI:SS') as utc_str,
      to_char(next_run_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI:SS') as israel_str
    FROM automated_campaigns WHERE id = $1
  `, [campaignId]);
  if (check.rows[0]) {
    console.log(`[storeNextRunAt] Stored: UTC=${check.rows[0].utc_str}, Israel=${check.rows[0].israel_str}`);
  }
}

// Common SELECT fields for campaigns with proper timezone formatting
const CAMPAIGN_SELECT_FIELDS = `
  ac.id, ac.user_id, ac.name, ac.description, ac.is_active,
  ac.schedule_type, ac.schedule_config, ac.send_time, ac.settings,
  ac.audience_id, ac.current_step, ac.total_sent,
  to_char(ac.next_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as next_run_at,
  to_char(ac.last_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_run_at,
  to_char(ac.scheduled_start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as scheduled_start_at,
  to_char(ac.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
  to_char(ac.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
`;

/**
 * Get all automated campaigns
 */
async function getAutomatedCampaigns(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        ${CAMPAIGN_SELECT_FIELDS},
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
        ${CAMPAIGN_SELECT_FIELDS},
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
      steps,
      scheduled_start_at  // For manual campaigns with scheduled start
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם הקמפיין נדרש' });
    }
    
    if (!schedule_type) {
      return res.status(400).json({ error: 'סוג תזמון נדרש' });
    }
    
    // Get current Israel time from PostgreSQL
    const israelNow = await getNowInIsraelFromDB();
    
    // Calculate next run (returns Israel time string or null)
    let nextRunIsrael = calculateNextRun(schedule_type, schedule_config || {}, send_time, israelNow);
    
    // For manual campaigns with scheduled start, use the scheduled_start_at
    let isActiveByDefault = false;
    if (schedule_type === 'manual' && scheduled_start_at) {
      // scheduled_start_at is in ISO format from frontend, convert to Israel time string
      const startDate = new Date(scheduled_start_at);
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');
      nextRunIsrael = `${year}-${month}-${day} ${hours}:${minutes}:00`;
      isActiveByDefault = true;  // Auto-activate scheduled campaigns
      console.log(`[AutomatedCampaigns] Manual campaign with scheduled start: ${nextRunIsrael}`);
    }
    
    // Create campaign (without next_run_at - we'll set it separately)
    const result = await db.query(`
      INSERT INTO automated_campaigns 
      (user_id, name, description, schedule_type, schedule_config, send_time, settings, scheduled_start_at, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [userId, name, description, schedule_type, schedule_config || {}, send_time || '09:00', settings || {}, scheduled_start_at || null, isActiveByDefault]);
    
    const campaignId = result.rows[0].id;
    
    // Store next_run_at using PostgreSQL timezone conversion
    await storeNextRunAt(campaignId, nextRunIsrael);
    
    // Create steps if provided
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await db.query(`
          INSERT INTO automated_campaign_steps 
          (campaign_id, step_order, step_type, template_id, audience_id, send_time, wait_config, trigger_campaign_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          campaignId, 
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
    
    // Fetch the campaign with proper timestamp formatting
    const campaignResult = await db.query(`
      SELECT ${CAMPAIGN_SELECT_FIELDS}
      FROM automated_campaigns ac
      WHERE ac.id = $1
    `, [campaignId]);
    
    console.log(`[AutomatedCampaigns] Created campaign ${campaignId} for user ${userId}, next_run_at: ${campaignResult.rows[0].next_run_at}`);
    
    res.json({ campaign: campaignResult.rows[0] });
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
      steps,
      scheduled_start_at  // For manual campaigns with scheduled start
    } = req.body;
    
    // Get current Israel time from PostgreSQL
    const israelNow = await getNowInIsraelFromDB();
    
    // Calculate new next run (returns Israel time string or null)
    let nextRunIsrael = calculateNextRun(schedule_type, schedule_config || {}, send_time, israelNow);
    
    // For manual campaigns with scheduled start, use the scheduled_start_at
    let shouldActivate = false;
    if (schedule_type === 'manual' && scheduled_start_at) {
      const startDate = new Date(scheduled_start_at);
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');
      nextRunIsrael = `${year}-${month}-${day} ${hours}:${minutes}:00`;
      shouldActivate = true;
      console.log(`[AutomatedCampaigns] Manual campaign with scheduled start: ${nextRunIsrael}`);
    }
    
    // Update campaign (without next_run_at - we'll set it separately)
    const updateResult = await db.query(`
      UPDATE automated_campaigns
      SET name = $1, description = $2, schedule_type = $3, schedule_config = $4, 
          send_time = $5, settings = $6, scheduled_start_at = $7, 
          is_active = CASE WHEN $8 THEN true ELSE is_active END,
          updated_at = NOW()
      WHERE id = $9 AND user_id = $10
      RETURNING id
    `, [name, description, schedule_type, schedule_config || {}, send_time || '09:00', settings || {}, scheduled_start_at || null, shouldActivate, id, userId]);
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    // Store next_run_at using PostgreSQL timezone conversion
    await storeNextRunAt(id, nextRunIsrael);
    
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
    
    // Fetch the updated campaign with proper timestamp formatting
    const campaignResult = await db.query(`
      SELECT ${CAMPAIGN_SELECT_FIELDS}
      FROM automated_campaigns ac
      WHERE ac.id = $1
    `, [id]);
    
    console.log(`[AutomatedCampaigns] Updated campaign ${id}, next_run_at: ${campaignResult.rows[0].next_run_at}`);
    
    res.json({ campaign: campaignResult.rows[0] });
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
    
    if (is_active) {
      // Get campaign schedule to calculate next run
      const campaignResult = await db.query(
        'SELECT schedule_type, schedule_config, send_time FROM automated_campaigns WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      
      if (campaignResult.rows.length === 0) {
        return res.status(404).json({ error: 'קמפיין לא נמצא' });
      }
      
      const { schedule_type, schedule_config, send_time: st } = campaignResult.rows[0];
      
      // Get current Israel time from PostgreSQL
      const israelNow = await getNowInIsraelFromDB();
      const nextRunIsrael = calculateNextRun(schedule_type, schedule_config, st, israelNow);
      
      // Update is_active first
      await db.query(`
        UPDATE automated_campaigns SET is_active = true, updated_at = NOW() WHERE id = $1 AND user_id = $2
      `, [id, userId]);
      
      // Store next_run_at using PostgreSQL timezone conversion
      await storeNextRunAt(id, nextRunIsrael);
    } else {
      await db.query(`
        UPDATE automated_campaigns SET is_active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2
      `, [id, userId]);
    }
    
    console.log(`[AutomatedCampaigns] ${is_active ? 'Activated' : 'Deactivated'} campaign ${id}`);
    
    // Fetch the updated campaign with proper timestamp formatting
    const result = await db.query(`
      SELECT ${CAMPAIGN_SELECT_FIELDS}
      FROM automated_campaigns ac
      WHERE ac.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
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
        r.id, r.campaign_id, r.step_id, r.status, 
        r.recipients_total, r.recipients_sent, r.recipients_failed,
        r.error_message,
        to_char(r.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as started_at,
        to_char(r.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as completed_at,
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
    // Use COALESCE to prefer step-level audience, then fall back to campaign-level
    const campaignResult = await db.query(`
      SELECT ac.*,
        COALESCE(
          (SELECT audience_id FROM automated_campaign_steps 
           WHERE campaign_id = ac.id AND step_type = 'send' AND audience_id IS NOT NULL
           ORDER BY step_order LIMIT 1),
          ac.audience_id
        ) as resolved_audience_id
      FROM automated_campaigns ac
      WHERE ac.id = $1 AND ac.user_id = $2
    `, [id, userId]);
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = campaignResult.rows[0];
    // Set the resolved audience on the campaign object
    if (campaign.resolved_audience_id) {
      campaign.audience_id = campaign.resolved_audience_id;
    }
    
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
  calculateNextRun,
  getNowInIsraelFromDB,
  storeNextRunAt
};
