const db = require('../../config/database');
const broadcastSender = require('../../services/broadcasts/sender.service');
const campaignWindow = require('../../services/broadcasts/campaignWindow.service');
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
    
    // Enrich each campaign with `predicted_next_start` — the next time the
    // configured active_windows opens, relative to now. Lets the UI show a
    // "would start at ..." countdown even for draft/paused campaigns.
    const enriched = result.rows.map(c => {
      let predicted = null;
      try {
        if (c.settings) {
          const next = campaignWindow.computeNextValidTime(new Date(), c.settings);
          predicted = next ? next.toISOString() : null;
        }
      } catch {}
      return { ...c, predicted_next_start: predicted };
    });

    res.json({
      campaigns: enriched,
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
    // Allow editing in any state. For running campaigns we'll recompute
    // next_batch_at from the new settings after the update so the window
    // change takes effect on the very next tick.
    const EDITABLE_STATES = ['draft', 'scheduled', 'running', 'paused', 'cancelled', 'completed', 'failed'];
    if (!EDITABLE_STATES.includes(campaign.status)) {
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

    const updated = result.rows[0];

    // If the settings (windows/timezone/delay) changed on a running campaign,
    // recompute next_batch_at so the new window takes effect immediately.
    if (updated && updated.status === 'running' && settings !== undefined) {
      try {
        const nextValid = campaignWindow.computeNextValidTime(new Date(), updated.settings || {});
        await db.query(
          `UPDATE broadcast_campaigns SET next_batch_at = $2 WHERE id = $1`,
          [id, nextValid]
        );
        updated.next_batch_at = nextValid;
        // Nudge the tick so the change surfaces in the admin view right away
        campaignWindow.tick().catch(() => {});
      } catch (recomputeErr) {
        console.warn(`[Broadcasts] next_batch_at recompute failed: ${recomputeErr.message}`);
      }
    }

    res.json({ campaign: updated });
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
      
      // Compute first next_batch_at respecting the active window. If outside
      // the window, the campaign will start at the next valid window opening.
      const freshSettings = campaign.settings || {};
      const firstValid = campaignWindow.computeNextValidTime(new Date(), freshSettings);

      await client.query(`
        UPDATE broadcast_campaigns
        SET status = 'running',
            started_at = COALESCE(started_at, NOW()),
            total_recipients = $1,
            paused_by_user = false,
            stopped_by_user = false,
            next_batch_at = $3,
            updated_at = NOW()
        WHERE id = $2
      `, [contacts.length, id, firstValid]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Trigger the window tick right away — if we're inside the window it'll
    // send the first batch immediately; if not, the DB state already points
    // to the next valid moment and the periodic tick will handle it.
    campaignWindow.tick().catch(err => {
      console.error(`[Broadcasts] Window tick error after start for ${id}:`, err);
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
      SET status = 'paused', paused_by_user = true, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'running'
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא או לא ניתן להשהייה' });
    }

    // Legacy in-memory signal (if any legacy sender is still running for this id)
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

    // Load campaign to check if resume is allowed (when user explicitly stopped it)
    const loadRes = await db.query(
      `SELECT * FROM broadcast_campaigns WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (loadRes.rows.length === 0) {
      return res.status(404).json({ error: 'קמפיין לא נמצא' });
    }
    const camp = loadRes.rows[0];

    // Cancelled campaigns can be resumed only when allow_resume is explicitly true
    // (otherwise "stop" means "done forever")
    const settings = camp.settings || {};
    const allowResume = settings.allow_resume !== false; // default true
    if (camp.status === 'cancelled' && !allowResume) {
      return res.status(400).json({ error: 'הקמפיין סומן כ-עצור לצמיתות ולא ניתן להמשיך' });
    }

    if (!['paused', 'cancelled'].includes(camp.status)) {
      return res.status(400).json({ error: 'ניתן להמשיך רק קמפיין שהושהה או נעצר' });
    }

    // Preserve any pending batch-delay: if we paused MID-WAIT between batches
    // (e.g. 1-minute delay, paused after 20s), resume should keep the remaining
    // wait rather than fire a new batch immediately. We do this by computing
    // the next valid time starting from max(now, original next_batch_at).
    const now = new Date();
    const originalNext = camp.next_batch_at ? new Date(camp.next_batch_at) : null;
    const baseline = originalNext && originalNext > now ? originalNext : now;
    const nextValid = campaignWindow.computeNextValidTime(baseline, settings);

    const result = await db.query(`
      UPDATE broadcast_campaigns
      SET status = 'running',
          paused_by_user = false,
          stopped_by_user = false,
          next_batch_at = $3,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId, nextValid]);

    // Trigger immediate tick
    campaignWindow.tick().catch(() => {});

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
      SET status = 'cancelled', stopped_by_user = true,
          next_batch_at = NULL, updated_at = NOW()
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
