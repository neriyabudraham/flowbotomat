const db = require('../../config/database');
const { createNotification } = require('../notifications/notifications.controller');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendMail } = require('../../services/mail/transport.service');

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
       WHERE ec.client_id = $1 AND (ec.status = 'approved' OR ec.status IS NULL)
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
       WHERE ec.expert_id = $1 AND ec.is_active = true AND (ec.status = 'approved' OR ec.status IS NULL)
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
 * Duplicate bot for client (as expert) - only bots the expert created
 */
async function duplicateClientBot(req, res) {
  try {
    const expertId = req.user.id;
    const { clientId, botId } = req.params;
    const { name } = req.body; // Custom name from modal
    
    // Verify expert relationship with edit permissions
    const relationship = await db.query(
      'SELECT * FROM expert_clients WHERE expert_id = $1 AND client_id = $2 AND is_active = true',
      [expertId, clientId]
    );
    
    if (relationship.rows.length === 0 || !relationship.rows[0].can_edit_bots) {
      return res.status(403).json({ error: 'אין לך הרשאה לשכפל בוטים ללקוח זה' });
    }
    
    // Get original bot and verify the expert created it
    const original = await db.query(
      'SELECT * FROM bots WHERE id = $1 AND user_id = $2',
      [botId, clientId]
    );
    
    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const bot = original.rows[0];
    
    // Only allow duplicating bots that this expert created
    if (bot.created_by !== expertId) {
      return res.status(403).json({ error: 'ניתן לשכפל רק בוטים שיצרת' });
    }
    
    // Use provided name or default
    const newName = name?.trim() || `${bot.name} (עותק)`;
    
    // Create duplicate
    const result = await db.query(
      `INSERT INTO bots (user_id, name, description, flow_data, is_active, created_by)
       VALUES ($1, $2, $3, $4, false, $5)
       RETURNING *`,
      [clientId, newName, bot.description, bot.flow_data, expertId]
    );
    
    console.log(`[Experts] Expert ${expertId} duplicated bot ${botId} for client ${clientId}`);
    
    res.json({
      success: true,
      bot: result.rows[0],
    });
  } catch (error) {
    console.error('[Experts] Duplicate client bot error:', error);
    res.status(500).json({ error: 'שגיאה בשכפול' });
  }
}

/**
 * Check if user has expert access to a resource
 */
async function checkExpertAccess(expertId, clientId, permission = 'can_view_bots') {
  const result = await db.query(
    `SELECT * FROM expert_clients 
     WHERE expert_id = $1 AND client_id = $2 AND is_active = true AND status = 'approved'`,
    [expertId, clientId]
  );
  
  if (result.rows.length === 0) return false;
  return result.rows[0][permission] === true;
}

/**
 * Request access to a client's account (as expert)
 */
async function requestAccess(req, res) {
  try {
    const expertId = req.user.id;
    const { email, message } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'נדרש אימייל' });
    }
    
    // Find client by email
    const clientResult = await db.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא במערכת' });
    }
    
    const client = clientResult.rows[0];
    
    // Can't request access to yourself
    if (client.id === expertId) {
      return res.status(400).json({ error: 'לא ניתן לבקש גישה לחשבון שלך' });
    }
    
    // Check if already exists
    const existing = await db.query(
      'SELECT id, status, is_active FROM expert_clients WHERE expert_id = $1 AND client_id = $2',
      [expertId, client.id]
    );
    
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'pending') {
        return res.status(400).json({ error: 'כבר יש בקשה ממתינה לחשבון זה' });
      }
      if (row.status === 'approved' && row.is_active) {
        return res.status(400).json({ error: 'כבר יש לך גישה לחשבון זה' });
      }
      // Reactivate as pending
      await db.query(
        `UPDATE expert_clients 
         SET status = 'pending', is_active = false, request_message = $2, requested_at = NOW(), rejected_at = NULL, rejection_reason = NULL
         WHERE id = $1`,
        [existing.rows[0].id, message || null]
      );
    } else {
      // Create new pending request
      await db.query(
        `INSERT INTO expert_clients 
         (expert_id, client_id, status, is_active, request_message, requested_at)
         VALUES ($1, $2, 'pending', false, $3, NOW())`,
        [expertId, client.id, message || null]
      );
    }
    
    // Get expert info for notification
    const expertResult = await db.query('SELECT name, email FROM users WHERE id = $1', [expertId]);
    const expert = expertResult.rows[0];
    
    // Send notification to client
    await createNotification(
      client.id,
      'access_request',
      'בקשת גישה לחשבון שלך',
      `${expert.name || expert.email} מבקש/ת גישה לנהל את החשבון שלך`,
      { relatedUserId: expertId, actionUrl: '/settings?tab=experts' }
    );
    
    // Send email to client
    try {
      const emailHtml = getAccessRequestEmail(expert.name || expert.email, expert.email, message);
      await sendMail(client.email, 'בקשת גישה לחשבון שלך - FlowBotomat', emailHtml);
    } catch (emailErr) {
      console.error('[Experts] Failed to send access request email:', emailErr);
    }
    
    console.log(`[Experts] ${expertId} requested access to ${client.id}`);
    
    res.json({ 
      success: true, 
      message: 'בקשת הגישה נשלחה בהצלחה'
    });
  } catch (error) {
    console.error('[Experts] Request access error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת בקשה' });
  }
}

/**
 * Get pending access requests (as client)
 */
async function getPendingRequests(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT ec.*, u.email as expert_email, u.name as expert_name
       FROM expert_clients ec
       JOIN users u ON ec.expert_id = u.id
       WHERE ec.client_id = $1 AND ec.status = 'pending'
       ORDER BY ec.requested_at DESC`,
      [userId]
    );
    
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('[Experts] Get pending requests error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בקשות' });
  }
}

/**
 * Approve access request (as client)
 */
async function approveRequest(req, res) {
  try {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { permissions } = req.body;
    
    // Get the request
    const requestResult = await db.query(
      'SELECT * FROM expert_clients WHERE id = $1 AND client_id = $2 AND status = \'pending\'',
      [requestId, userId]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'בקשה לא נמצאה' });
    }
    
    const request = requestResult.rows[0];
    
    // Approve
    await db.query(
      `UPDATE expert_clients 
       SET status = 'approved', is_active = true, approved_at = NOW(),
           can_view_bots = $2, can_edit_bots = $3, can_manage_contacts = $4, can_view_analytics = $5
       WHERE id = $1`,
      [
        requestId,
        permissions?.can_view_bots ?? true,
        permissions?.can_edit_bots ?? true,
        permissions?.can_manage_contacts ?? true,
        permissions?.can_view_analytics ?? true
      ]
    );
    
    // Get client info for notification
    const clientResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const client = clientResult.rows[0];
    
    // Notify expert
    await createNotification(
      request.expert_id,
      'access_approved',
      'בקשת הגישה אושרה',
      `${client.name || client.email} אישר/ה את בקשת הגישה שלך לחשבון`,
      { relatedUserId: userId, actionUrl: '/settings' }
    );
    
    console.log(`[Experts] ${userId} approved access request from ${request.expert_id}`);
    
    res.json({ success: true, message: 'הבקשה אושרה' });
  } catch (error) {
    console.error('[Experts] Approve request error:', error);
    res.status(500).json({ error: 'שגיאה באישור בקשה' });
  }
}

/**
 * Reject access request (as client)
 */
async function rejectRequest(req, res) {
  try {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { reason } = req.body;
    
    // Get the request
    const requestResult = await db.query(
      'SELECT * FROM expert_clients WHERE id = $1 AND client_id = $2 AND status = \'pending\'',
      [requestId, userId]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'בקשה לא נמצאה' });
    }
    
    const request = requestResult.rows[0];
    
    // Reject
    await db.query(
      `UPDATE expert_clients 
       SET status = 'rejected', rejected_at = NOW(), rejection_reason = $2
       WHERE id = $1`,
      [requestId, reason || null]
    );
    
    // Get client info for notification
    const clientResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const client = clientResult.rows[0];
    
    // Notify expert
    await createNotification(
      request.expert_id,
      'access_rejected',
      'בקשת הגישה נדחתה',
      `${client.name || client.email} דחה/תה את בקשת הגישה שלך`,
      { relatedUserId: userId }
    );
    
    console.log(`[Experts] ${userId} rejected access request from ${request.expert_id}`);
    
    res.json({ success: true, message: 'הבקשה נדחתה' });
  } catch (error) {
    console.error('[Experts] Reject request error:', error);
    res.status(500).json({ error: 'שגיאה בדחיית בקשה' });
  }
}

/**
 * Get all accessible accounts (for account switcher)
 */
async function getAccessibleAccounts(req, res) {
  try {
    // Use original user ID if in viewingAs mode, otherwise current user
    // viewingAs is the original user's ID (string), not an object
    const originalUserId = req.user.viewingAs || req.user.id;
    const currentUserId = req.user.id;
    
    // Get current viewed user info
    const currentUserResult = await db.query(
      'SELECT id, email, name, avatar_url FROM users WHERE id = $1',
      [currentUserId]
    );
    const currentUser = currentUserResult.rows[0];
    
    // Get original user info (the expert's account)
    const originalUserResult = await db.query(
      'SELECT id, email, name, avatar_url FROM users WHERE id = $1',
      [originalUserId]
    );
    const originalUser = originalUserResult.rows[0];
    
    // Get clients the ORIGINAL user has access to (as expert)
    const clientsResult = await db.query(
      `SELECT u.id, u.email, u.name, u.avatar_url, ec.can_view_bots, ec.can_edit_bots
       FROM expert_clients ec
       JOIN users u ON ec.client_id = u.id
       WHERE ec.expert_id = $1 AND ec.is_active = true AND ec.status = 'approved'
       ORDER BY u.name, u.email`,
      [originalUserId]
    );
    
    // Get linked accounts (accounts the ORIGINAL user created)
    const linkedResult = await db.query(
      `SELECT u.id, u.email, u.name, u.avatar_url, 'linked' as access_type
       FROM linked_accounts la
       JOIN users u ON la.child_user_id = u.id
       WHERE la.parent_user_id = $1
       ORDER BY u.name, u.email`,
      [originalUserId]
    );
    
    // Build response - always show original account in the list when viewing as another
    const isViewingAs = req.user.viewingAs !== undefined;
    
    res.json({
      current: currentUser,
      original: isViewingAs ? originalUser : null, // The expert's own account
      clients: clientsResult.rows.map(c => ({ 
        ...c, 
        access_type: 'expert',
        isCurrentlyViewing: c.id === currentUserId // Mark if this is the currently viewed account
      })),
      linked: linkedResult.rows.map(l => ({
        ...l,
        isCurrentlyViewing: l.id === currentUserId
      })),
      isViewingAs
    });
  } catch (error) {
    console.error('[Experts] Get accessible accounts error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת חשבונות' });
  }
}

/**
 * Switch to another account (generate token for the target account)
 */
async function switchAccount(req, res) {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.params;
    
    // Use original account ID when already viewing another account
    // This allows switching from Client A -> Client B without going back first
    const originalUserId = req.user.viewingAs || req.user.id;
    
    // Get the original user's role (not the viewed account's role)
    let originalRole = req.user.role;
    if (req.user.viewingAs) {
      const originalUserResult = await db.query('SELECT role FROM users WHERE id = $1', [originalUserId]);
      originalRole = originalUserResult.rows[0]?.role || req.user.role;
    }
    
    let access = null;
    
    // Admins can switch to any account
    if (originalRole === 'superadmin' || originalRole === 'admin') {
      access = {
        access_type: 'admin',
        can_view_bots: true,
        can_edit_bots: true,
        can_manage_contacts: true,
        can_view_analytics: true
      };
      console.log(`[Experts] Admin ${originalUserId} switching to account ${targetUserId}`);
    } else {
      // Check if ORIGINAL user has access to target account
      const accessResult = await db.query(
        `SELECT ec.*, 'expert' as access_type 
         FROM expert_clients ec
         WHERE ec.expert_id = $1 AND ec.client_id = $2 AND ec.is_active = true AND ec.status = 'approved'
         UNION
         SELECT NULL as id, $1 as expert_id, $2 as client_id, true as can_view_bots, true as can_edit_bots, 
                true as can_manage_contacts, true as can_view_analytics, true as is_active, 
                NULL as created_at, NULL as approved_at, NULL as status, NULL as request_message, 
                NULL as requested_at, NULL as rejected_at, NULL as rejection_reason, 'linked' as access_type
         FROM linked_accounts la
         WHERE la.parent_user_id = $1 AND la.child_user_id = $2`,
        [originalUserId, targetUserId]
      );
      
      if (accessResult.rows.length === 0) {
        return res.status(403).json({ error: 'אין לך גישה לחשבון זה' });
      }
      
      access = accessResult.rows[0];
    }
    
    // Get target user info
    const targetResult = await db.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [targetUserId]
    );
    
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'חשבון לא נמצא' });
    }
    
    const targetUser = targetResult.rows[0];
    
    // Generate a special token for viewing the target account
    // This token includes the original user and the viewing context
    const viewToken = jwt.sign(
      { 
        userId: targetUserId, 
        email: targetUser.email, 
        role: targetUser.role,
        viewingAs: originalUserId, // Always the original account, even when switching between clients
        accessType: access.access_type,
        permissions: {
          can_view_bots: access.can_view_bots,
          can_edit_bots: access.can_edit_bots,
          can_manage_contacts: access.can_manage_contacts,
          can_view_analytics: access.can_view_analytics
        }
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log(`[Experts] ${originalUserId} switched to account ${targetUserId} (was viewing: ${currentUserId})`);
    
    res.json({
      success: true,
      token: viewToken,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role
      },
      accessType: access.access_type,
      permissions: {
        can_view_bots: access.can_view_bots,
        can_edit_bots: access.can_edit_bots,
        can_manage_contacts: access.can_manage_contacts,
        can_view_analytics: access.can_view_analytics
      }
    });
  } catch (error) {
    console.error('[Experts] Switch account error:', error);
    res.status(500).json({ error: 'שגיאה במעבר חשבון' });
  }
}

/**
 * Generate a link code for creating linked accounts
 */
async function generateLinkCode(req, res) {
  try {
    const parentUserId = req.user.id;
    
    // Generate a random 16-character code
    const code = crypto.randomBytes(8).toString('hex');
    
    // Code expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Get parent's referral code if they have one (to count as referral)
    let refCode = null;
    try {
      const affiliateResult = await db.query(
        'SELECT ref_code FROM affiliates WHERE user_id = $1 AND is_active = true',
        [parentUserId]
      );
      if (affiliateResult.rows.length > 0) {
        refCode = affiliateResult.rows[0].ref_code;
      }
    } catch (e) {
      // Ignore - affiliate system might not exist
    }
    
    // Save to database
    await db.query(
      `INSERT INTO account_link_codes (code, parent_user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [code, parentUserId, expiresAt]
    );
    
    console.log(`[Experts] ${parentUserId} generated link code: ${code}, refCode: ${refCode}`);
    
    res.json({
      success: true,
      code,
      refCode, // Include referral code if exists
      expiresAt
    });
  } catch (error) {
    console.error('[Experts] Generate link code error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת קוד' });
  }
}

/**
 * Validate a link code (called during registration)
 */
async function validateLinkCode(req, res) {
  try {
    const { code } = req.params;
    
    const result = await db.query(
      `SELECT alc.*, u.name as parent_name, u.email as parent_email
       FROM account_link_codes alc
       JOIN users u ON alc.parent_user_id = u.id
       WHERE alc.code = $1 AND alc.expires_at > NOW() AND alc.used_at IS NULL`,
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'קוד לא תקף או פג תוקף' });
    }
    
    const linkData = result.rows[0];
    
    // Get parent's referral code
    let refCode = null;
    try {
      const affiliateResult = await db.query(
        'SELECT ref_code FROM affiliates WHERE user_id = $1 AND is_active = true',
        [linkData.parent_user_id]
      );
      if (affiliateResult.rows.length > 0) {
        refCode = affiliateResult.rows[0].ref_code;
      }
    } catch (e) {
      // Ignore - affiliate system might not exist
    }
    
    res.json({
      valid: true,
      parentName: linkData.parent_name || linkData.parent_email,
      refCode // Include referral code to store in localStorage
    });
  } catch (error) {
    console.error('[Experts] Validate link code error:', error);
    res.status(500).json({ error: 'שגיאה באימות קוד' });
  }
}

/**
 * Complete account linking after registration (called from auth controller)
 */
async function completeLinking(userId, linkCode) {
  try {
    // Get the link code
    const codeResult = await db.query(
      `SELECT * FROM account_link_codes 
       WHERE code = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [linkCode]
    );
    
    if (codeResult.rows.length === 0) {
      console.log(`[Experts] Link code not found or expired: ${linkCode}`);
      return false;
    }
    
    const linkData = codeResult.rows[0];
    
    // Mark code as used
    await db.query(
      `UPDATE account_link_codes SET used_at = NOW(), used_by_user_id = $1 WHERE code = $2`,
      [userId, linkCode]
    );
    
    // Create linked account relationship
    await db.query(
      `INSERT INTO linked_accounts (parent_user_id, child_user_id)
       VALUES ($1, $2)
       ON CONFLICT (parent_user_id, child_user_id) DO NOTHING`,
      [linkData.parent_user_id, userId]
    );
    
    // Also create expert access automatically (full permissions)
    await db.query(
      `INSERT INTO expert_clients 
       (expert_id, client_id, can_view_bots, can_edit_bots, can_manage_contacts, can_view_analytics, is_active, status, approved_at)
       VALUES ($1, $2, true, true, true, true, true, 'approved', NOW())
       ON CONFLICT (expert_id, client_id) DO UPDATE SET is_active = true, status = 'approved', approved_at = NOW()`,
      [linkData.parent_user_id, userId]
    );
    
    console.log(`[Experts] Linked new account ${userId} to parent ${linkData.parent_user_id}`);
    
    return true;
  } catch (error) {
    console.error('[Experts] Complete linking error:', error);
    return false;
  }
}

/**
 * Email template for access request
 */
function getAccessRequestEmail(expertName, expertEmail, message) {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">בקשת גישה לחשבון</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #111827;">
          <strong>${expertName}</strong> (${expertEmail}) מבקש/ת גישה לנהל את החשבון שלך ב-FlowBotomat.
        </p>
        ${message ? `
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #6366f1;">
          <p style="color: #374151; margin: 0;"><strong>הודעה:</strong></p>
          <p style="color: #6b7280; margin: 10px 0 0 0;">${message}</p>
        </div>
        ` : ''}
        <p style="color: #6b7280;">
          היכנס להגדרות החשבון שלך כדי לאשר או לדחות את הבקשה.
        </p>
        <a href="${process.env.APP_URL || 'https://flow.botomat.co.il'}/settings?tab=experts" 
           style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
          צפה בבקשה
        </a>
      </div>
    </div>
  `;
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
  duplicateClientBot,
  checkExpertAccess,
  // New functions
  requestAccess,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getAccessibleAccounts,
  switchAccount,
  generateLinkCode,
  validateLinkCode,
  completeLinking,
};
