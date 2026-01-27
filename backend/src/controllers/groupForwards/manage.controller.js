const db = require('../../config/database');
const { checkLimit } = require('../subscriptions/subscriptions.controller');

/**
 * Create a new group forward
 */
async function createGroupForward(req, res) {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ error: 'נדרש שם להעברה' });
    }
    
    // First check if user's plan allows group forwards at all
    const featureCheck = await checkLimit(userId, 'allow_group_forwards');
    if (!featureCheck.allowed) {
      return res.status(403).json({
        error: 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את התוכנית.',
        code: 'FEATURE_NOT_ALLOWED',
        upgrade: true
      });
    }
    
    // Check user's forwards limit
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.limit === 0 
          ? 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את התוכנית.'
          : `הגעת למגבלת ההעברות בתוכנית שלך (${limitCheck.limit})`,
        code: 'LIMIT_REACHED',
        limit: limitCheck.limit,
        used: limitCheck.used,
        upgrade: true
      });
    }
    
    // Create the forward
    const result = await db.query(`
      INSERT INTO group_forwards (user_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, name.trim(), description?.trim() || null]);
    
    console.log(`[GroupForwards] Created forward ${result.rows[0].id} for user ${userId}`);
    
    res.json({
      success: true,
      forward: result.rows[0],
      message: 'ההעברה נוצרה בהצלחה'
    });
  } catch (error) {
    console.error('[GroupForwards] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת העברה' });
  }
}

/**
 * Update a group forward
 */
async function updateGroupForward(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    const { 
      name, 
      description, 
      is_active,
      trigger_type,
      trigger_group_id,
      trigger_group_name,
      delay_min,
      delay_max,
      require_confirmation
    } = req.body;
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM group_forwards WHERE id = $1 AND user_id = $2',
      [forwardId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    // Validate delay values
    let validDelayMin = Math.max(3, delay_min || 3); // Minimum 3 seconds
    let validDelayMax = Math.max(validDelayMin, delay_max || 10);
    
    // Max delay is 60 minutes (3600 seconds)
    validDelayMin = Math.min(3600, validDelayMin);
    validDelayMax = Math.min(3600, validDelayMax);
    
    const result = await db.query(`
      UPDATE group_forwards SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_active = COALESCE($3, is_active),
        trigger_type = COALESCE($4, trigger_type),
        trigger_group_id = $5,
        trigger_group_name = $6,
        delay_min = $7,
        delay_max = $8,
        require_confirmation = COALESCE($9, require_confirmation),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      name?.trim(),
      description?.trim(),
      is_active,
      trigger_type,
      trigger_group_id || null,
      trigger_group_name || null,
      validDelayMin,
      validDelayMax,
      require_confirmation,
      forwardId
    ]);
    
    res.json({
      success: true,
      forward: result.rows[0],
      message: 'ההעברה עודכנה בהצלחה'
    });
  } catch (error) {
    console.error('[GroupForwards] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון העברה' });
  }
}

/**
 * Delete a group forward
 */
async function deleteGroupForward(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id, name FROM group_forwards WHERE id = $1 AND user_id = $2',
      [forwardId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    // Check for active jobs
    const activeJobs = await db.query(`
      SELECT id FROM forward_jobs 
      WHERE forward_id = $1 AND status IN ('pending', 'confirmed', 'sending')
      LIMIT 1
    `, [forwardId]);
    
    if (activeJobs.rows.length > 0) {
      return res.status(400).json({ 
        error: 'לא ניתן למחוק העברה עם משימות פעילות. עצור את המשימות קודם.',
        code: 'ACTIVE_JOBS'
      });
    }
    
    // Delete (cascade will handle related tables)
    await db.query('DELETE FROM group_forwards WHERE id = $1', [forwardId]);
    
    console.log(`[GroupForwards] Deleted forward ${forwardId} (${ownerCheck.rows[0].name}) for user ${userId}`);
    
    res.json({
      success: true,
      message: 'ההעברה נמחקה בהצלחה'
    });
  } catch (error) {
    console.error('[GroupForwards] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת העברה' });
  }
}

/**
 * Update target groups for a forward
 */
async function updateTargets(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    const { targets } = req.body; // Array of { group_id, group_name, group_image_url, sort_order }
    
    if (!Array.isArray(targets)) {
      return res.status(400).json({ error: 'נדרשת רשימת קבוצות יעד' });
    }
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM group_forwards WHERE id = $1 AND user_id = $2',
      [forwardId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    // Check target limit
    const limitCheck = await checkLimit(userId, 'max_forward_targets');
    if (limitCheck.limit !== -1 && targets.length > limitCheck.limit) {
      return res.status(403).json({
        error: `מספר הקבוצות חורג מהמגבלה בתוכנית שלך (${limitCheck.limit})`,
        code: 'TARGET_LIMIT_REACHED',
        limit: limitCheck.limit,
        requested: targets.length
      });
    }
    
    // Start transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete existing targets
      await client.query(
        'DELETE FROM group_forward_targets WHERE forward_id = $1',
        [forwardId]
      );
      
      // Insert new targets
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        await client.query(`
          INSERT INTO group_forward_targets 
          (forward_id, group_id, group_name, group_image_url, sort_order)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          forwardId,
          target.group_id,
          target.group_name,
          target.group_image_url || null,
          target.sort_order ?? i
        ]);
      }
      
      await client.query('COMMIT');
      
      // Get updated targets
      const result = await db.query(`
        SELECT * FROM group_forward_targets 
        WHERE forward_id = $1 
        ORDER BY sort_order ASC
      `, [forwardId]);
      
      res.json({
        success: true,
        targets: result.rows,
        message: `${targets.length} קבוצות יעד נשמרו`
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[GroupForwards] Update targets error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון קבוצות יעד' });
  }
}

/**
 * Update authorized senders for a forward
 */
async function updateAuthorizedSenders(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    const { senders } = req.body; // Array of { phone_number, name }
    
    if (!Array.isArray(senders)) {
      return res.status(400).json({ error: 'נדרשת רשימת שולחים מורשים' });
    }
    
    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM group_forwards WHERE id = $1 AND user_id = $2',
      [forwardId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    // Start transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete existing senders
      await client.query(
        'DELETE FROM forward_authorized_senders WHERE forward_id = $1',
        [forwardId]
      );
      
      // Insert new senders
      for (const sender of senders) {
        if (sender.phone_number?.trim()) {
          // Normalize phone number
          let phone = sender.phone_number.replace(/\D/g, '');
          if (phone.startsWith('0')) {
            phone = '972' + phone.substring(1);
          }
          if (!phone.includes('@')) {
            phone = phone + '@s.whatsapp.net';
          }
          
          await client.query(`
            INSERT INTO forward_authorized_senders (forward_id, phone_number, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (forward_id, phone_number) DO UPDATE SET name = $3
          `, [forwardId, phone, sender.name || null]);
        }
      }
      
      await client.query('COMMIT');
      
      // Get updated senders
      const result = await db.query(`
        SELECT * FROM forward_authorized_senders 
        WHERE forward_id = $1 
        ORDER BY created_at ASC
      `, [forwardId]);
      
      res.json({
        success: true,
        senders: result.rows,
        message: `${result.rows.length} שולחים מורשים נשמרו`
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[GroupForwards] Update senders error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון שולחים מורשים' });
  }
}

/**
 * Toggle forward active status
 */
async function toggleForwardActive(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    
    const result = await db.query(`
      UPDATE group_forwards 
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [forwardId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    res.json({
      success: true,
      forward: result.rows[0],
      message: result.rows[0].is_active ? 'ההעברה הופעלה' : 'ההעברה הושבתה'
    });
  } catch (error) {
    console.error('[GroupForwards] Toggle active error:', error);
    res.status(500).json({ error: 'שגיאה בשינוי סטטוס' });
  }
}

/**
 * Duplicate a group forward
 */
async function duplicateGroupForward(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    
    // First check if feature is allowed
    const featureCheck = await checkLimit(userId, 'allow_group_forwards');
    if (!featureCheck.allowed) {
      return res.status(403).json({
        error: 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את התוכנית.',
        code: 'FEATURE_NOT_ALLOWED',
        upgrade: true
      });
    }
    
    // Check limit
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.limit === 0 
          ? 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את התוכנית.'
          : `הגעת למגבלת ההעברות בתוכנית שלך (${limitCheck.limit})`,
        code: 'LIMIT_REACHED',
        limit: limitCheck.limit,
        used: limitCheck.used,
        upgrade: true
      });
    }
    
    // Get original forward
    const original = await db.query(`
      SELECT * FROM group_forwards WHERE id = $1 AND user_id = $2
    `, [forwardId, userId]);
    
    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create copy
      const newForward = await client.query(`
        INSERT INTO group_forwards (
          user_id, name, description, trigger_type, trigger_group_id, 
          trigger_group_name, delay_min, delay_max, require_confirmation, is_active
        )
        SELECT 
          user_id, name || ' (העתק)', description, trigger_type, trigger_group_id,
          trigger_group_name, delay_min, delay_max, require_confirmation, false
        FROM group_forwards WHERE id = $1
        RETURNING *
      `, [forwardId]);
      
      const newId = newForward.rows[0].id;
      
      // Copy targets
      await client.query(`
        INSERT INTO group_forward_targets (
          forward_id, group_id, group_name, group_image_url, sort_order
        )
        SELECT $1, group_id, group_name, group_image_url, sort_order
        FROM group_forward_targets WHERE forward_id = $2
      `, [newId, forwardId]);
      
      // Copy authorized senders
      await client.query(`
        INSERT INTO forward_authorized_senders (forward_id, phone_number, name)
        SELECT $1, phone_number, name
        FROM forward_authorized_senders WHERE forward_id = $2
      `, [newId, forwardId]);
      
      await client.query('COMMIT');
      
      // Get full new forward with details
      const result = await db.query(`
        SELECT 
          gf.*,
          (SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = gf.id) as target_count,
          (SELECT COUNT(*) FROM forward_authorized_senders WHERE forward_id = gf.id) as sender_count
        FROM group_forwards gf
        WHERE gf.id = $1
      `, [newId]);
      
      res.json({
        success: true,
        forward: result.rows[0],
        message: 'ההעברה שוכפלה בהצלחה'
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[GroupForwards] Duplicate error:', error);
    res.status(500).json({ error: 'שגיאה בשכפול העברה' });
  }
}

module.exports = {
  createGroupForward,
  updateGroupForward,
  deleteGroupForward,
  updateTargets,
  updateAuthorizedSenders,
  toggleForwardActive,
  duplicateGroupForward
};
