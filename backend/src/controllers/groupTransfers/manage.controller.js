const db = require('../../config/database');
const { checkLimit } = require('../subscriptions/subscriptions.controller');

/**
 * Create a new group transfer
 */
async function createGroupTransfer(req, res) {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ error: 'נדרש שם להעברה' });
    }
    
    // Check if user's plan allows group forwards (using same permission)
    const featureCheck = await checkLimit(userId, 'allow_group_forwards');
    if (!featureCheck.allowed) {
      return res.status(403).json({
        error: 'התוכנית שלך לא כוללת העברת הודעות בין קבוצות. שדרג את התוכנית.',
        code: 'FEATURE_NOT_ALLOWED',
        upgrade: true
      });
    }
    
    // Count existing transfers
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM group_transfers WHERE user_id = $1',
      [userId]
    );
    const used = parseInt(countResult.rows[0].count) || 0;
    
    // Check limit
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    if (limitCheck.limit !== -1 && used >= limitCheck.limit) {
      return res.status(403).json({
        error: `הגעת למגבלת ההעברות בתוכנית שלך (${limitCheck.limit})`,
        code: 'LIMIT_REACHED',
        limit: limitCheck.limit,
        used,
        upgrade: true
      });
    }
    
    // Create the transfer with proper defaults for group-to-group transfers
    const result = await db.query(`
      INSERT INTO group_transfers (user_id, name, description, delay_min, delay_max, require_confirmation)
      VALUES ($1, $2, $3, 1, 3, false)
      RETURNING *
    `, [userId, name.trim(), description?.trim() || null]);
    
    console.log(`[GroupTransfers] Created transfer ${result.rows[0].id} for user ${userId}`);
    
    res.json({
      success: true,
      transfer: result.rows[0],
      message: 'ההעברה נוצרה בהצלחה'
    });
  } catch (error) {
    console.error('[GroupTransfers] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת העברה' });
  }
}

/**
 * Update a group transfer
 */
async function updateGroupTransfer(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
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
      'SELECT id FROM group_transfers WHERE id = $1 AND user_id = $2',
      [transferId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    let validDelayMin = Math.max(3, delay_min || 3);
    let validDelayMax = Math.max(validDelayMin, delay_max || 10);
    validDelayMin = Math.min(3600, validDelayMin);
    validDelayMax = Math.min(3600, validDelayMax);
    
    const result = await db.query(`
      UPDATE group_transfers SET
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
      transferId
    ]);
    
    res.json({
      success: true,
      transfer: result.rows[0],
      message: 'ההעברה עודכנה בהצלחה'
    });
  } catch (error) {
    console.error('[GroupTransfers] Update error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון העברה' });
  }
}

/**
 * Delete a group transfer
 */
async function deleteGroupTransfer(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    
    const ownerCheck = await db.query(
      'SELECT id, name FROM group_transfers WHERE id = $1 AND user_id = $2',
      [transferId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    // Check for active jobs
    const activeJobs = await db.query(`
      SELECT id FROM transfer_jobs 
      WHERE transfer_id = $1 AND status IN ('pending', 'confirmed', 'sending')
      LIMIT 1
    `, [transferId]);
    
    if (activeJobs.rows.length > 0) {
      return res.status(400).json({ 
        error: 'לא ניתן למחוק העברה עם משימות פעילות. עצור את המשימות קודם.',
        code: 'ACTIVE_JOBS'
      });
    }
    
    await db.query('DELETE FROM group_transfers WHERE id = $1', [transferId]);
    
    console.log(`[GroupTransfers] Deleted transfer ${transferId} (${ownerCheck.rows[0].name}) for user ${userId}`);
    
    res.json({
      success: true,
      message: 'ההעברה נמחקה בהצלחה'
    });
  } catch (error) {
    console.error('[GroupTransfers] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת העברה' });
  }
}

/**
 * Update target groups for a transfer
 */
async function updateTargets(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    const { targets } = req.body;
    
    if (!Array.isArray(targets)) {
      return res.status(400).json({ error: 'נדרשת רשימת קבוצות יעד' });
    }
    
    const ownerCheck = await db.query(
      'SELECT id FROM group_transfers WHERE id = $1 AND user_id = $2',
      [transferId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const limitCheck = await checkLimit(userId, 'max_forward_targets');
    if (limitCheck.limit !== -1 && targets.length > limitCheck.limit) {
      return res.status(403).json({
        error: `מספר הקבוצות חורג מהמגבלה בתוכנית שלך (${limitCheck.limit})`,
        code: 'TARGET_LIMIT_REACHED',
        limit: limitCheck.limit,
        requested: targets.length
      });
    }
    
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(
        'DELETE FROM group_transfer_targets WHERE transfer_id = $1',
        [transferId]
      );
      
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        await client.query(`
          INSERT INTO group_transfer_targets 
          (transfer_id, group_id, group_name, group_image_url, sort_order)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          transferId,
          target.group_id,
          target.group_name,
          target.group_image_url || null,
          target.sort_order ?? i
        ]);
      }
      
      await client.query('COMMIT');
      
      const result = await db.query(`
        SELECT * FROM group_transfer_targets 
        WHERE transfer_id = $1 
        ORDER BY sort_order ASC
      `, [transferId]);
      
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
    console.error('[GroupTransfers] Update targets error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון קבוצות יעד' });
  }
}

/**
 * Update authorized senders for a transfer
 */
async function updateAuthorizedSenders(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    const { senders } = req.body;
    
    if (!Array.isArray(senders)) {
      return res.status(400).json({ error: 'נדרשת רשימת שולחים מורשים' });
    }
    
    const ownerCheck = await db.query(
      'SELECT id FROM group_transfers WHERE id = $1 AND user_id = $2',
      [transferId, userId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(
        'DELETE FROM transfer_authorized_senders WHERE transfer_id = $1',
        [transferId]
      );
      
      for (const sender of senders) {
        if (sender.phone_number?.trim()) {
          let phone = sender.phone_number.replace(/\D/g, '');
          if (phone.startsWith('0')) {
            phone = '972' + phone.substring(1);
          }
          if (!phone.includes('@')) {
            phone = phone + '@s.whatsapp.net';
          }
          
          await client.query(`
            INSERT INTO transfer_authorized_senders (transfer_id, phone_number, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (transfer_id, phone_number) DO UPDATE SET name = $3
          `, [transferId, phone, sender.name || null]);
        }
      }
      
      await client.query('COMMIT');
      
      const result = await db.query(`
        SELECT * FROM transfer_authorized_senders 
        WHERE transfer_id = $1 
        ORDER BY created_at ASC
      `, [transferId]);
      
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
    console.error('[GroupTransfers] Update senders error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון שולחים מורשים' });
  }
}

/**
 * Toggle transfer active status
 */
async function toggleTransferActive(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    
    const result = await db.query(`
      UPDATE group_transfers 
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [transferId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    res.json({
      success: true,
      transfer: result.rows[0],
      message: result.rows[0].is_active ? 'ההעברה הופעלה' : 'ההעברה הושבתה'
    });
  } catch (error) {
    console.error('[GroupTransfers] Toggle active error:', error);
    res.status(500).json({ error: 'שגיאה בשינוי סטטוס' });
  }
}

/**
 * Duplicate a group transfer
 */
async function duplicateGroupTransfer(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    
    const featureCheck = await checkLimit(userId, 'allow_group_forwards');
    if (!featureCheck.allowed) {
      return res.status(403).json({
        error: 'התוכנית שלך לא כוללת העברת הודעות בין קבוצות. שדרג את התוכנית.',
        code: 'FEATURE_NOT_ALLOWED',
        upgrade: true
      });
    }
    
    // Count existing transfers
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM group_transfers WHERE user_id = $1',
      [userId]
    );
    const used = parseInt(countResult.rows[0].count) || 0;
    
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    if (limitCheck.limit !== -1 && used >= limitCheck.limit) {
      return res.status(403).json({
        error: `הגעת למגבלת ההעברות בתוכנית שלך (${limitCheck.limit})`,
        code: 'LIMIT_REACHED',
        limit: limitCheck.limit,
        used,
        upgrade: true
      });
    }
    
    const original = await db.query(`
      SELECT * FROM group_transfers WHERE id = $1 AND user_id = $2
    `, [transferId, userId]);
    
    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      const newTransfer = await client.query(`
        INSERT INTO group_transfers (
          user_id, name, description, trigger_type, trigger_group_id, 
          trigger_group_name, delay_min, delay_max, require_confirmation, is_active
        )
        SELECT 
          user_id, name || ' (העתק)', description, trigger_type, trigger_group_id,
          trigger_group_name, delay_min, delay_max, require_confirmation, false
        FROM group_transfers WHERE id = $1
        RETURNING *
      `, [transferId]);
      
      const newId = newTransfer.rows[0].id;
      
      await client.query(`
        INSERT INTO group_transfer_targets (
          transfer_id, group_id, group_name, group_image_url, sort_order
        )
        SELECT $1, group_id, group_name, group_image_url, sort_order
        FROM group_transfer_targets WHERE transfer_id = $2
      `, [newId, transferId]);
      
      await client.query(`
        INSERT INTO transfer_authorized_senders (transfer_id, phone_number, name)
        SELECT $1, phone_number, name
        FROM transfer_authorized_senders WHERE transfer_id = $2
      `, [newId, transferId]);
      
      await client.query('COMMIT');
      
      const result = await db.query(`
        SELECT 
          gt.*,
          (SELECT COUNT(*) FROM group_transfer_targets WHERE transfer_id = gt.id) as target_count,
          (SELECT COUNT(*) FROM transfer_authorized_senders WHERE transfer_id = gt.id) as sender_count
        FROM group_transfers gt
        WHERE gt.id = $1
      `, [newId]);
      
      res.json({
        success: true,
        transfer: result.rows[0],
        message: 'ההעברה שוכפלה בהצלחה'
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[GroupTransfers] Duplicate error:', error);
    res.status(500).json({ error: 'שגיאה בשכפול העברה' });
  }
}

module.exports = {
  createGroupTransfer,
  updateGroupTransfer,
  deleteGroupTransfer,
  updateTargets,
  updateAuthorizedSenders,
  toggleTransferActive,
  duplicateGroupTransfer
};
