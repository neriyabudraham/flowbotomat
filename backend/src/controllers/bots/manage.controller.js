const db = require('../../config/database');
const { checkBotAccess } = require('./list.controller');
const { checkLimit } = require('../subscriptions/subscriptions.controller');
const crypto = require('crypto');
const { startListening, getListenStatus } = require('../webhook/botWebhook.controller');

/**
 * Check if bot is locked and return error response if so
 * Locked bots cannot be edited, activated, or have their flow saved
 */
async function checkBotLocked(botId, operation = 'edit') {
  const result = await db.query(
    'SELECT id, name, locked_reason, locked_at, is_active FROM bots WHERE id = $1',
    [botId]
  );
  
  if (result.rows.length === 0) {
    return { notFound: true };
  }
  
  const bot = result.rows[0];
  
  if (bot.locked_reason) {
    const reasonMessages = {
      'subscription_limit': 'הבוט חסום כי חרגת ממגבלת הבוטים בתוכנית שלך. שדרג את התוכנית כדי לפתוח אותו.',
      'admin': 'הבוט חסום על ידי מנהל המערכת.',
      'payment_failed': 'הבוט חסום עקב בעיה בתשלום. עדכן את פרטי התשלום כדי לפתוח אותו.'
    };
    
    return {
      isLocked: true,
      reason: bot.locked_reason,
      message: reasonMessages[bot.locked_reason] || 'הבוט חסום.',
      lockedAt: bot.locked_at
    };
  }
  
  return { isLocked: false, bot };
}

/**
 * Create new bot
 * 
 * Blocked if:
 * - User has locked bots AND is at or over their bot limit
 * - User is over bot limit
 */
async function createBot(req, res) {
  const userId = req.user.id;
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'נדרש שם לבוט' });
  }
  
  const client = await db.pool.connect();
  
  try {
    // Use transaction with row-level lock to prevent race conditions
    await client.query('BEGIN');
    
    // Lock user row to prevent concurrent bot creation
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    
    // New bots are created as inactive — no limit check needed here.
    // Limit is enforced at activation time (updateBot).
    
    // Default flow with a trigger node set to "any_message"
    const defaultFlow = {
      nodes: [{
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 250, y: 100 },
        data: {
          triggerGroups: [{
            id: 'group_1',
            conditions: [{ type: 'any_message' }]
          }]
        }
      }],
      edges: []
    };
    
    const result = await client.query(
      `INSERT INTO bots (user_id, name, description, flow_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, name, description || '', JSON.stringify(defaultFlow)]
    );
    
    await client.query('COMMIT');
    res.status(201).json({ bot: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת בוט' });
  } finally {
    client.release();
  }
}

/**
 * Update bot details
 * 
 * LOCKED BOTS: Cannot be edited or activated!
 * - name/description changes are blocked
 * - is_active cannot be set to true
 */
async function updateBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    const { name, description, is_active } = req.body;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const canEdit = access.isOwner || access.permission === 'edit' || access.permission === 'admin';
    if (!canEdit) {
      return res.status(403).json({ error: 'אין לך הרשאה לערוך בוט זה' });
    }
    
    // Check if bot is locked
    const lockStatus = await checkBotLocked(botId, 'edit');
    if (lockStatus.notFound) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    if (lockStatus.isLocked) {
      // Locked bot - block ALL changes
      return res.status(403).json({ 
        error: lockStatus.message,
        code: 'BOT_LOCKED',
        reason: lockStatus.reason,
        lockedAt: lockStatus.lockedAt
      });
    }
    
    // Enforce active bot limit on activation
    if (is_active === true) {
      const currentBot = await db.query('SELECT is_active, user_id FROM bots WHERE id = $1', [botId]);
      if (currentBot.rows[0] && !currentBot.rows[0].is_active) {
        const botOwnerId = currentBot.rows[0].user_id;
        const botsLimit = await checkLimit(botOwnerId, 'bots');

        if (botsLimit.limit !== -1 && !botsLimit.allowed) {
          return res.status(403).json({
            error: `הגעת למגבלת ${botsLimit.limit} בוטים פעילים בתוכנית שלך`,
            code: 'BOTS_LIMIT_REACHED',
            limit: botsLimit.limit,
            used: botsLimit.used
          });
        }
      }
    }
    
    const result = await db.query(
      `UPDATE bots SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4 AND locked_reason IS NULL
       RETURNING *`,
      [name, description, is_active, botId]
    );
    
    if (result.rows.length === 0) {
      // Double-check if it's because bot is locked
      const recheck = await checkBotLocked(botId);
      if (recheck.isLocked) {
        return res.status(403).json({ 
          error: recheck.message,
          code: 'BOT_LOCKED',
          reason: recheck.reason
        });
      }
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון בוט' });
  }
}

/**
 * Save bot flow data
 * 
 * LOCKED BOTS: Cannot save flow data!
 */
async function saveFlow(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    const { flow_data } = req.body;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const canEdit = access.isOwner || access.permission === 'edit' || access.permission === 'admin';
    if (!canEdit) {
      return res.status(403).json({ error: 'אין לך הרשאה לערוך בוט זה' });
    }
    
    // Check if bot is locked - BLOCK saving flow to locked bots!
    const lockStatus = await checkBotLocked(botId, 'saveFlow');
    if (lockStatus.notFound) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    if (lockStatus.isLocked) {
      return res.status(403).json({ 
        error: lockStatus.message,
        code: 'BOT_LOCKED',
        reason: lockStatus.reason,
        lockedAt: lockStatus.lockedAt
      });
    }
    
    const result = await db.query(
      `UPDATE bots SET flow_data = $1, updated_at = NOW()
       WHERE id = $2 AND locked_reason IS NULL
       RETURNING *`,
      [JSON.stringify(flow_data), botId]
    );
    
    if (result.rows.length === 0) {
      // Double-check if it's because bot is locked
      const recheck = await checkBotLocked(botId);
      if (recheck.isLocked) {
        return res.status(403).json({ 
          error: recheck.message,
          code: 'BOT_LOCKED',
          reason: recheck.reason
        });
      }
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Save flow error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת פלואו' });
  }
}

/**
 * Delete bot
 * 
 * When deleting an UNLOCKED bot, if user has locked bots:
 * - Unlock the next most recently updated bot
 * This ensures user always has their allowed number of bots accessible
 */
async function deleteBot(req, res) {
  const client = await db.pool.connect();
  
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    // Who can delete:
    // 1. Owner (the client who owns the bot)
    // 2. Admin permission via share
    // 3. Expert who created this bot (isCreator)
    const canDelete = access.isOwner || 
                      access.permission === 'admin' || 
                      (access.isExpert && access.isCreator);
    
    if (!canDelete) {
      return res.status(403).json({ error: 'אין לך הרשאה למחוק בוט זה' });
    }
    
    await client.query('BEGIN');
    
    // Get the bot being deleted and its owner
    const botToDelete = await client.query(
      'SELECT id, user_id, is_active, locked_reason FROM bots WHERE id = $1',
      [botId]
    );
    
    if (botToDelete.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const botOwnerId = botToDelete.rows[0].user_id;
    const wasUnlocked = botToDelete.rows[0].locked_reason === null;
    const wasActive = botToDelete.rows[0].is_active;
    
    // Delete the bot
    await client.query('DELETE FROM bots WHERE id = $1', [botId]);
    
    // If we deleted an unlocked bot, check if we should unlock another one
    if (wasUnlocked) {
      // Check user's bot limit
      const botsLimit = await checkLimit(botOwnerId, 'bots');
      
      if (botsLimit.limit !== -1) {
        // Count current unlocked bots (excluding the one we just deleted)
        const unlockedBotsResult = await client.query(
          `SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND locked_reason IS NULL`,
          [botOwnerId]
        );
        const unlockedBots = parseInt(unlockedBotsResult.rows[0]?.count || 0);
        
        // If we're now below the limit, unlock the next most recently updated locked bot
        if (unlockedBots < botsLimit.limit) {
          const nextBotToUnlock = await client.query(`
            SELECT id, name FROM bots 
            WHERE user_id = $1 
              AND locked_reason = 'subscription_limit'
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT 1
          `, [botOwnerId]);
          
          if (nextBotToUnlock.rows.length > 0) {
            const unlockBotId = nextBotToUnlock.rows[0].id;
            const unlockBotName = nextBotToUnlock.rows[0].name;
            
            // Unlock it and optionally activate it if the deleted bot was active
            await client.query(`
              UPDATE bots 
              SET locked_reason = NULL, 
                  locked_at = NULL, 
                  is_active = CASE WHEN $2 THEN true ELSE is_active END,
                  updated_at = NOW()
              WHERE id = $1
            `, [unlockBotId, wasActive]);
            
            console.log(`[Bots] Unlocked bot "${unlockBotName}" (${unlockBotId}) after deleting bot ${botId}`);
          }
        }
      }
    }
    
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת בוט' });
  } finally {
    client.release();
  }
}

/**
 * Select which bot to keep after downgrade
 * User must select ONE bot to keep, others will be deleted
 */
async function selectBotToKeep(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    // Verify this bot belongs to the user
    const botResult = await db.query(
      'SELECT id, name, user_id, pending_deletion FROM bots WHERE id = $1 AND user_id = $2',
      [botId, userId]
    );
    
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    // Check if user is in downgrade state (has bots pending deletion)
    const pendingResult = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND pending_deletion = true',
      [userId]
    );
    
    const hasPendingBots = parseInt(pendingResult.rows[0]?.count || 0) > 0;
    
    if (!hasPendingBots) {
      return res.status(400).json({ 
        error: 'אין בוטים הממתינים לבחירה',
        code: 'NO_PENDING_BOTS'
      });
    }
    
    // Delete all OTHER bots for this user
    await db.query(
      'DELETE FROM bots WHERE user_id = $1 AND id != $2',
      [userId, botId]
    );
    
    // Activate the selected bot and clear pending_deletion flag
    await db.query(
      `UPDATE bots 
       SET is_active = true, pending_deletion = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [botId, userId]
    );
    
    // Mark notification as read
    await db.query(
      `UPDATE notifications 
       SET is_read = true, updated_at = NOW()
       WHERE user_id = $1 AND notification_type = 'subscription_expired' AND is_read = false`,
      [userId]
    );
    
    console.log(`[Bots] User ${userId} selected bot ${botId} to keep after downgrade`);
    
    res.json({ 
      success: true, 
      message: 'הבוט נשמר בהצלחה. שאר הבוטים נמחקו.',
      keptBotId: botId
    });
  } catch (error) {
    console.error('Select bot to keep error:', error);
    res.status(500).json({ error: 'שגיאה בבחירת הבוט' });
  }
}

/**
 * Get user's pending deletion status
 */
async function getPendingDeletionStatus(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      'SELECT id, name, description, is_active FROM bots WHERE user_id = $1 AND pending_deletion = true',
      [userId]
    );
    
    res.json({
      hasPendingBots: result.rows.length > 0,
      pendingBots: result.rows,
      message: result.rows.length > 0 
        ? 'יש לבחור בוט אחד לשמור. שאר הבוטים יימחקו.'
        : null
    });
  } catch (error) {
    console.error('Get pending deletion status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוס' });
  }
}

/**
 * Generate (or regenerate) a webhook secret for a bot.
 * The resulting URL is: POST /api/webhook/bot/:secret
 */
async function generateWebhookSecret(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;

    // Ensure column exists (lazy migration)
    await db.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64)`).catch(() => {});

    const secret = crypto.randomBytes(24).toString('hex'); // 48-char hex string

    const result = await db.query(
      `UPDATE bots SET webhook_secret = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, webhook_secret`,
      [secret, botId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }

    res.json({ webhook_secret: result.rows[0].webhook_secret });
  } catch (error) {
    console.error('Generate webhook secret error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת webhook' });
  }
}

/**
 * Delete the webhook secret for a bot (disable webhook trigger).
 */
async function deleteWebhookSecret(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;

    await db.query(
      `UPDATE bots SET webhook_secret = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [botId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete webhook secret error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת webhook' });
  }
}

async function startWebhookListen(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const result = await db.query('SELECT id FROM bots WHERE id = $1 AND user_id = $2', [botId, userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'bot not found' });
    startListening(botId);
    res.json({ ok: true, expiresIn: 60 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function checkWebhookListen(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const result = await db.query('SELECT id FROM bots WHERE id = $1 AND user_id = $2', [botId, userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'bot not found' });
    res.json(getListenStatus(botId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { createBot, updateBot, saveFlow, deleteBot, selectBotToKeep, getPendingDeletionStatus, checkBotLocked, generateWebhookSecret, deleteWebhookSecret, startWebhookListen, checkWebhookListen };
