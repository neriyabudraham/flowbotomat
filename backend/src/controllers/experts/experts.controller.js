const db = require('../../config/database');
const { createNotification } = require('../notifications/notifications.controller');
const crypto = require('crypto');

/**
 * Get my experts (people who manage my account)
 */
async function getMyExperts(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT ec.*, u.email as expert_email, u.name as expert_name
       FROM expert_clients ec
       JOIN users u ON ec.expert_id = u.id
       WHERE ec.client_id = $1
       ORDER BY ec.created_at DESC`,
      [userId]
    );
    
    res.json({ experts: result.rows });
  } catch (error) {
    console.error('[Experts] Get my experts error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מומחים' });
  }
}

/**
 * Get my clients (accounts I manage as expert)
 */
async function getMyClients(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT ec.*, u.email as client_email, u.name as client_name
       FROM expert_clients ec
       JOIN users u ON ec.client_id = u.id
       WHERE ec.expert_id = $1 AND ec.is_active = true
       ORDER BY ec.created_at DESC`,
      [userId]
    );
    
    res.json({ clients: result.rows });
  } catch (error) {
    console.error('[Experts] Get my clients error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת לקוחות' });
  }
}

/**
 * Invite expert to manage my account
 */
async function inviteExpert(req, res) {
  try {
    const userId = req.user.id;
    const { email, permissions } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'נדרש מייל' });
    }
    
    // Find expert by email
    const expertResult = await db.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (expertResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא במערכת' });
    }
    
    const expert = expertResult.rows[0];
    
    // Can't invite yourself
    if (expert.id === userId) {
      return res.status(400).json({ error: 'לא ניתן להזמין את עצמך' });
    }
    
    // Check if already exists
    const existing = await db.query(
      'SELECT id, is_active FROM expert_clients WHERE expert_id = $1 AND client_id = $2',
      [expert.id, userId]
    );
    
    if (existing.rows.length > 0) {
      if (existing.rows[0].is_active) {
        return res.status(400).json({ error: 'למומחה זה כבר יש גישה לחשבון שלך' });
      }
      // Reactivate
      await db.query(
        `UPDATE expert_clients 
         SET is_active = true, 
             can_view_bots = $3, can_edit_bots = $4, can_manage_contacts = $5, can_view_analytics = $6,
             approved_at = NOW()
         WHERE id = $1`,
        [
          existing.rows[0].id,
          permissions?.can_view_bots ?? true,
          permissions?.can_edit_bots ?? true,
          permissions?.can_manage_contacts ?? true,
          permissions?.can_view_analytics ?? true,
        ]
      );
    } else {
      // Create new relationship
      await db.query(
        `INSERT INTO expert_clients 
         (expert_id, client_id, can_view_bots, can_edit_bots, can_manage_contacts, can_view_analytics, is_active, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
        [
          expert.id,
          userId,
          permissions?.can_view_bots ?? true,
          permissions?.can_edit_bots ?? true,
          permissions?.can_manage_contacts ?? true,
          permissions?.can_view_analytics ?? true,
        ]
      );
    }
    
    // Get client info for notification
    const clientResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const client = clientResult.rows[0];
    
    // Send notification to expert
    await createNotification(
      expert.id,
      'expert_access_granted',
      'קיבלת גישת מומחה לחשבון חדש',
      `${client.name || client.email} נתן/נתנה לך גישה לנהל את החשבון שלהם`,
      { relatedUserId: userId, actionUrl: '/bots' }
    );
    
    console.log(`[Experts] ${userId} granted access to expert ${expert.id}`);
    
    res.json({ 
      success: true, 
      message: `גישה ניתנה ל-${expert.email}`,
      expert: { id: expert.id, email: expert.email, name: expert.name }
    });
  } catch (error) {
    console.error('[Experts] Invite expert error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת מומחה' });
  }
}

/**
 * Update expert permissions
 */
async function updateExpertPermissions(req, res) {
  try {
    const userId = req.user.id;
    const { expertId } = req.params;
    const { permissions } = req.body;
    
    const result = await db.query(
      `UPDATE expert_clients 
       SET can_view_bots = COALESCE($3, can_view_bots),
           can_edit_bots = COALESCE($4, can_edit_bots),
           can_manage_contacts = COALESCE($5, can_manage_contacts),
           can_view_analytics = COALESCE($6, can_view_analytics)
       WHERE expert_id = $1 AND client_id = $2
       RETURNING *`,
      [
        expertId,
        userId,
        permissions?.can_view_bots,
        permissions?.can_edit_bots,
        permissions?.can_manage_contacts,
        permissions?.can_view_analytics,
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'מומחה לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Experts] Update permissions error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הרשאות' });
  }
}

/**
 * Remove expert access (as client)
 */
async function removeExpert(req, res) {
  try {
    const userId = req.user.id;
    const { expertId } = req.params;
    
    await db.query(
      'UPDATE expert_clients SET is_active = false WHERE expert_id = $1 AND client_id = $2',
      [expertId, userId]
    );
    
    // Notify expert
    const clientResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const client = clientResult.rows[0];
    
    await createNotification(
      expertId,
      'expert_access_revoked',
      'גישת מומחה הוסרה',
      `${client.name || client.email} הסיר/ה את הגישה שלך לחשבון שלהם`,
      { relatedUserId: userId }
    );
    
    console.log(`[Experts] ${userId} revoked access from expert ${expertId}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Experts] Remove expert error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת מומחה' });
  }
}

/**
 * Leave client account (as expert)
 */
async function leaveClient(req, res) {
  try {
    const userId = req.user.id;
    const { clientId } = req.params;
    
    await db.query(
      'UPDATE expert_clients SET is_active = false WHERE expert_id = $1 AND client_id = $2',
      [userId, clientId]
    );
    
    console.log(`[Experts] Expert ${userId} left client ${clientId}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Experts] Leave client error:', error);
    res.status(500).json({ error: 'שגיאה ביציאה מחשבון' });
  }
}

/**
 * Get bots for a specific client (as expert)
 */
async function getClientBots(req, res) {
  try {
    const userId = req.user.id;
    const { clientId } = req.params;
    
    // Verify expert relationship
    const relationship = await db.query(
      'SELECT * FROM expert_clients WHERE expert_id = $1 AND client_id = $2 AND is_active = true',
      [userId, clientId]
    );
    
    if (relationship.rows.length === 0) {
      return res.status(403).json({ error: 'אין לך גישה לחשבון זה' });
    }
    
    const perms = relationship.rows[0];
    
    if (!perms.can_view_bots) {
      return res.status(403).json({ error: 'אין לך הרשאה לצפות בבוטים' });
    }
    
    const bots = await db.query(
      'SELECT * FROM bots WHERE user_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
    
    // Add isCreator flag to each bot
    const botsWithCreator = bots.rows.map(bot => ({
      ...bot,
      isCreator: bot.created_by === userId, // true if this expert created this bot
    }));
    
    res.json({ 
      bots: botsWithCreator,
      permissions: {
        can_view_bots: perms.can_view_bots,
        can_edit_bots: perms.can_edit_bots,
        can_manage_contacts: perms.can_manage_contacts,
        can_view_analytics: perms.can_view_analytics,
      }
    });
  } catch (error) {
    console.error('[Experts] Get client bots error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בוטים' });
  }
}

/**
 * Create bot for client (as expert)
 */
async function createClientBot(req, res) {
  try {
    const expertId = req.user.id;
    const { clientId } = req.params;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'נדרש שם לבוט' });
    }
    
    // Verify expert relationship with edit permissions
    const relationship = await db.query(
      'SELECT * FROM expert_clients WHERE expert_id = $1 AND client_id = $2 AND is_active = true',
      [expertId, clientId]
    );
    
    if (relationship.rows.length === 0 || !relationship.rows[0].can_edit_bots) {
      return res.status(403).json({ error: 'אין לך הרשאה ליצור בוטים ללקוח זה' });
    }
    
    // created_by stores the expert who created this bot for the client
    const result = await db.query(
      `INSERT INTO bots (user_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [clientId, name, description || '', expertId]
    );
    
    console.log(`[Experts] Expert ${expertId} created bot for client ${clientId}`);
    
    res.status(201).json({ bot: result.rows[0] });
  } catch (error) {
    console.error('[Experts] Create client bot error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת בוט' });
  }
}

/**
 * Import bot for client (as expert)
 */
async function importClientBot(req, res) {
  try {
    const expertId = req.user.id;
    const { clientId } = req.params;
    const { data, name } = req.body;
    
    if (!data || !data.bot) {
      return res.status(400).json({ error: 'קובץ לא תקין' });
    }
    
    // Verify expert relationship with edit permissions
    const relationship = await db.query(
      'SELECT * FROM expert_clients WHERE expert_id = $1 AND client_id = $2 AND is_active = true',
      [expertId, clientId]
    );
    
    if (relationship.rows.length === 0 || !relationship.rows[0].can_edit_bots) {
      return res.status(403).json({ error: 'אין לך הרשאה לייבא בוטים ללקוח זה' });
    }
    
    const importedBot = data.bot;
    const botName = name || `${importedBot.name} (יובא)`;
    
    // created_by stores the expert who imported this bot for the client
    const result = await db.query(
      `INSERT INTO bots (user_id, name, description, flow_data, is_active, created_by)
       VALUES ($1, $2, $3, $4, false, $5)
       RETURNING *`,
      [clientId, botName, importedBot.description, JSON.stringify(importedBot.flow_data), expertId]
    );
    
    console.log(`[Experts] Expert ${expertId} imported bot for client ${clientId}`);
    
    res.json({
      success: true,
      bot: result.rows[0],
      message: 'הבוט יובא בהצלחה',
    });
  } catch (error) {
    console.error('[Experts] Import client bot error:', error);
    res.status(500).json({ error: 'שגיאה בייבוא' });
  }
}

/**
 * Check if user has expert access to a resource
 */
async function checkExpertAccess(expertId, clientId, permission = 'can_view_bots') {
  const result = await db.query(
    `SELECT * FROM expert_clients 
     WHERE expert_id = $1 AND client_id = $2 AND is_active = true`,
    [expertId, clientId]
  );
  
  if (result.rows.length === 0) return false;
  return result.rows[0][permission] === true;
}

module.exports = {
  getMyExperts,
  getMyClients,
  inviteExpert,
  updateExpertPermissions,
  removeExpert,
  leaveClient,
  getClientBots,
  createClientBot,
  importClientBot,
  checkExpertAccess,
};
