const db = require('../../config/database');
const broadcastSender = require('../../services/broadcasts/sender.service');
const { getAudienceContacts } = require('../../services/broadcasts/audienceFilter.service');

/**
 * Get all campaigns for user
 */
async function getCampaigns(req, res) {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE c.user_id = $1';
    const params = [userId];
    let paramIndex = 2;
    
    if (status) {
      whereClause += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM broadcast_campaigns c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    // Get campaigns
    const result = await db.query(`
      SELECT 
        c.*,
        t.name as template_name,
        a.name as audience_name
      FROM broadcast_campaigns c
      LEFT JOIN broadcast_templates t ON t.id = c.template_id
      LEFT JOIN broadcast_audiences a ON a.id = c.audience_id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN c.status = 'running' THEN 1
          WHEN c.status = 'scheduled' THEN 2
          WHEN c.status = 'draft' THEN 3
          ELSE 4
        END,
        c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);
    
    res.json({
      campaigns: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Broadcasts] Get campaigns error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קמפיינים' });
  }
}

/**
 * Get single campaign with details
 */
async function getCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT 
        c.*,
        t.name as template_name,
        a.name as audience_name
      FROM broadcast_campaigns c
      LEFT JOIN broadcast_templates t ON t.id = c.template_id
      LEFT JOIN broadcast_audiences a ON a.id = c.audience_id
      WHERE c.id = $1 AND c.user_id = $2
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Get campaign error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קמפיין' });
  }
}

/**
 * Create new campaign
 */
async function createCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { 
      name, 
      description, 
      template_id, 
      audience_id, 
      direct_message,
      direct_media_url,
      scheduled_at,
      settings 
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם הקמפיין נדרש' });
    }
    
    if (!audience_id) {
      return res.status(400).json({ error: 'יש לבחור קהל יעד' });
    }
    
    // Convert empty strings to null for UUIDs
    const templateIdValue = template_id && template_id.trim() !== '' ? template_id : null;
    const audienceIdValue = audience_id && audience_id.trim() !== '' ? audience_id : null;
    
    if (!templateIdValue && !direct_message) {
      return res.status(400).json({ error: 'יש לבחור תבנית או לכתוב הודעה ישירה' });
    }
    
    // Verify audience belongs to user
    const audienceResult = await db.query(
      'SELECT * FROM broadcast_audiences WHERE id = $1 AND user_id = $2',
      [audienceIdValue, userId]
    );
    
    if (audienceResult.rows.length === 0) {
      return res.status(404).json({ error: 'קהל לא נמצא' });
    }
    
    // Verify template belongs to user (if provided)
    if (templateIdValue) {
      const templateResult = await db.query(
        'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
        [templateIdValue, userId]
      );
      
      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: 'תבנית לא נמצאה' });
      }
    }
    
    const defaultSettings = {
      delay_between_messages: 2,
      delay_between_batches: 30,
      batch_size: 50,
      skip_invalid_numbers: true,
      skip_blocked_contacts: true
    };
    
    const campaignSettings = { ...defaultSettings, ...settings };
    const status = scheduled_at ? 'scheduled' : 'draft';
    
    const result = await db.query(`
      INSERT INTO broadcast_campaigns 
      (user_id, name, description, template_id, audience_id, direct_message, direct_media_url, scheduled_at, settings, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [userId, name, description || null, templateIdValue, audienceIdValue, direct_message || null, direct_media_url || null, scheduled_at || null, campaignSettings, status]);
    
    res.status(201).json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Create campaign error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת קמפיין' });
  }
}

/**
 * Update campaign
 */
async function updateCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, template_id, audience_id, direct_message, direct_media_url, scheduled_at, settings } = req.body;
    
    // Verify campaign exists and is in editable state
    const campaignResult = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = campaignResult.rows[0];
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({ error: 'לא ניתן לערוך קמפיין בסטטוס זה' });
    }
    
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (template_id !== undefined) {
      updates.push(`template_id = $${paramIndex++}`);
      params.push(template_id);
    }
    if (audience_id !== undefined) {
      updates.push(`audience_id = $${paramIndex++}`);
      params.push(audience_id);
    }
    if (direct_message !== undefined) {
      updates.push(`direct_message = $${paramIndex++}`);
      params.push(direct_message);
    }
    if (direct_media_url !== undefined) {
      updates.push(`direct_media_url = $${paramIndex++}`);
      params.push(direct_media_url);
    }
    if (scheduled_at !== undefined) {
      updates.push(`scheduled_at = $${paramIndex++}`);
      params.push(scheduled_at);
      updates.push(`status = $${paramIndex++}`);
      params.push(scheduled_at ? 'scheduled' : 'draft');
    }
    if (settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      params.push(settings);
    }
    
    updates.push('updated_at = NOW()');
    
    params.push(id, userId);
    
    const result = await db.query(`
      UPDATE broadcast_campaigns 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
      RETURNING *
    `, params);
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Update campaign error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון קמפיין' });
  }
}

/**
 * Delete campaign
 */
async function deleteCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Only allow deleting draft/scheduled/cancelled campaigns
    const result = await db.query(`
      DELETE FROM broadcast_campaigns 
      WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'scheduled', 'cancelled', 'completed', 'failed')
      RETURNING id
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא או לא ניתן למחיקה' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Delete campaign error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת קמפיין' });
  }
}

/**
 * Start campaign
 */
async function startCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const campaignResult = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = campaignResult.rows[0];
    
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      return res.status(400).json({ error: 'לא ניתן להפעיל קמפיין בסטטוס זה' });
    }
    
    // Get audience contacts
    const audienceResult = await db.query(
      'SELECT * FROM broadcast_audiences WHERE id = $1',
      [campaign.audience_id]
    );
    
    if (audienceResult.rows.length === 0) {
      return res.status(400).json({ error: 'קהל היעד לא נמצא' });
    }
    
    const audience = audienceResult.rows[0];
    
    // Get contacts using shared filter service (properly handles both static and dynamic audiences)
    const contacts = await getAudienceContacts(userId, audience);
    
    console.log(`[Broadcasts] Campaign "${campaign.name}" - Audience "${audience.name}" (${audience.is_static ? 'static' : 'dynamic'}): ${contacts.length} contacts`);
    
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'אין אנשי קשר בקהל היעד' });
    }
    
    // Insert recipients (only if not already exists)
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing pending recipients
      await client.query(
        "DELETE FROM broadcast_campaign_recipients WHERE campaign_id = $1 AND status = 'pending'",
        [id]
      );
      
      // Insert new recipients
      for (const contact of contacts) {
        await client.query(`
          INSERT INTO broadcast_campaign_recipients 
          (campaign_id, contact_id, phone, contact_name, status)
          VALUES ($1, $2, $3, $4, 'pending')
          ON CONFLICT DO NOTHING
        `, [id, contact.id, contact.phone, contact.display_name]);
      }
      
      // Update campaign status
      await client.query(`
        UPDATE broadcast_campaigns 
        SET status = 'running', 
            started_at = COALESCE(started_at, NOW()),
            total_recipients = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [contacts.length, id]);
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    
    // Start sending in background (don't await)
    broadcastSender.startCampaignSending(id, userId).catch(err => {
      console.error(`[Broadcasts] Background sending error for campaign ${id}:`, err);
    });
    
    const updatedCampaign = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1',
      [id]
    );
    
    res.json({ campaign: updatedCampaign.rows[0], message: 'הקמפיין הופעל והודעות נשלחות' });
  } catch (error) {
    console.error('[Broadcasts] Start campaign error:', error);
    res.status(500).json({ error: 'שגיאה בהפעלת קמפיין' });
  }
}

/**
 * Pause campaign
 */
async function pauseCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE broadcast_campaigns 
      SET status = 'paused', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'running'
      RETURNING *
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא או לא ניתן להשהייה' });
    }
    
    // Signal the sender to pause
    broadcastSender.pauseCampaign(id);
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Pause campaign error:', error);
    res.status(500).json({ error: 'שגיאה בהשהיית קמפיין' });
  }
}

/**
 * Resume campaign
 */
async function resumeCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE broadcast_campaigns 
      SET status = 'running', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'paused'
      RETURNING *
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא או לא ניתן להמשך' });
    }
    
    // Restart sending in background
    broadcastSender.startCampaignSending(id, userId).catch(err => {
      console.error(`[Broadcasts] Background resume error for campaign ${id}:`, err);
    });
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Resume campaign error:', error);
    res.status(500).json({ error: 'שגיאה בהמשכת קמפיין' });
  }
}

/**
 * Cancel campaign
 */
async function cancelCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE broadcast_campaigns 
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status IN ('running', 'paused', 'scheduled')
      RETURNING *
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא או לא ניתן לביטול' });
    }
    
    // Signal the sender to cancel
    broadcastSender.cancelCampaign(id);
    
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Cancel campaign error:', error);
    res.status(500).json({ error: 'שגיאה בביטול קמפיין' });
  }
}

/**
 * Get campaign recipients
 */
async function getCampaignRecipients(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verify campaign belongs to user
    const campaignResult = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    let whereClause = 'WHERE r.campaign_id = $1';
    const params = [id];
    let paramIndex = 2;
    
    if (status) {
      whereClause += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    const countResult = await db.query(
      `SELECT COUNT(*) FROM broadcast_campaign_recipients r ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    const result = await db.query(`
      SELECT r.* FROM broadcast_campaign_recipients r
      ${whereClause}
      ORDER BY r.queued_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);
    
    res.json({
      recipients: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Broadcasts] Get campaign recipients error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נמענים' });
  }
}

/**
 * Get campaign stats
 */
async function getCampaignStats(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Verify campaign belongs to user
    const campaignResult = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'sending') as sending,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'read') as read,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM broadcast_campaign_recipients
      WHERE campaign_id = $1
    `, [id]);
    
    res.json({ stats: statsResult.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Get campaign stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Get campaign progress (real-time)
 */
async function getCampaignProgress(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Verify campaign belongs to user
    const campaignResult = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Get real-time progress from sender service
    const liveProgress = broadcastSender.getCampaignProgress(id);
    
    // Get stats from database
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'sending') as sending,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM broadcast_campaign_recipients
      WHERE campaign_id = $1
    `, [id]);
    
    // Get last 5 sent recipients
    const recentResult = await db.query(`
      SELECT phone, contact_name, status, sent_at, error_message
      FROM broadcast_campaign_recipients
      WHERE campaign_id = $1 AND status IN ('sent', 'failed')
      ORDER BY sent_at DESC NULLS LAST
      LIMIT 5
    `, [id]);
    
    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        total_recipients: campaign.total_recipients,
        sent_count: campaign.sent_count,
        failed_count: campaign.failed_count,
        started_at: campaign.started_at,
        completed_at: campaign.completed_at
      },
      stats: statsResult.rows[0],
      liveProgress: liveProgress || null,
      recentRecipients: recentResult.rows
    });
  } catch (error) {
    console.error('[Broadcasts] Get campaign progress error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת התקדמות' });
  }
}

/**
 * Get campaign report (all recipients with their status for CSV export)
 */
async function getCampaignReport(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Verify campaign belongs to user
    const campaignResult = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    
    // Get all recipients with contact info
    const result = await db.query(`
      SELECT 
        r.phone,
        r.contact_name as display_name,
        r.status,
        r.sent_at,
        r.error_message as error,
        r.queued_at
      FROM broadcast_campaign_recipients r
      WHERE r.campaign_id = $1
      ORDER BY 
        CASE r.status 
          WHEN 'sent' THEN 1 
          WHEN 'failed' THEN 2 
          ELSE 3 
        END,
        r.sent_at DESC NULLS LAST
    `, [id]);
    
    res.json({ 
      campaign: campaignResult.rows[0],
      recipients: result.rows 
    });
  } catch (error) {
    console.error('[Broadcasts] Get campaign report error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת דוח' });
  }
}

module.exports = {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignRecipients,
  getCampaignStats,
  getCampaignProgress,
  getCampaignReport
};
