const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const { decrypt } = require('../crypto/encrypt.service');

/**
 * Broadcast Admin Approval Service (per-forward)
 *
 * Each group_forward can have one sender marked as is_admin = true.
 * When a broadcast is triggered:
 *   1. If the forward has an admin sender, that admin receives a WhatsApp
 *      approval request (list message with Yes/No + sender info + message content).
 *   2. If admin approves → the original sender gets the normal confirmation list.
 *   3. If admin rejects → job is silently cancelled (sender not notified).
 *
 * When the admin deletes a broadcast message from any group,
 * the deletion cascades to all other groups with the forward's delay settings.
 */

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}

async function getWahaConnection(userId) {
  const result = await db.query(`
    SELECT * FROM whatsapp_connections
    WHERE user_id = $1 AND status = 'connected'
    ORDER BY connected_at DESC LIMIT 1
  `, [userId]);

  if (result.rows.length === 0) return null;

  const conn = result.rows[0];
  let baseUrl, apiKey;

  if (conn.connection_type === 'external') {
    baseUrl = decrypt(conn.external_base_url);
    apiKey = decrypt(conn.external_api_key);
  } else {
    const systemCreds = getWahaCredentials();
    baseUrl = systemCreds.baseUrl;
    apiKey = systemCreds.apiKey;
  }

  return { ...conn, base_url: baseUrl, api_key: apiKey };
}

/**
 * Get the admin sender for a specific forward (is_admin = true)
 * Returns { phone_number, name } or null
 */
async function getForwardAdmin(forwardId) {
  try {
    const result = await db.query(
      `SELECT phone_number, name FROM forward_authorized_senders
       WHERE forward_id = $1 AND is_admin = true
       LIMIT 1`,
      [forwardId]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.message?.includes('column') && err.message?.includes('is_admin')) {
      // Column not yet migrated
      return null;
    }
    throw err;
  }
}

/**
 * Ensure approval tracking table exists (lazy migration)
 */
let tablesEnsured = false;
async function ensureAdminTables() {
  if (tablesEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS broadcast_admin_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id UUID NOT NULL REFERENCES forward_jobs(id) ON DELETE CASCADE,
        sender_phone VARCHAR(30) NOT NULL,
        sender_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(job_id)
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_broadcast_admin_approvals_user
      ON broadcast_admin_approvals(user_id, status)
    `);
    await db.query(`
      ALTER TABLE forward_jobs
      ADD COLUMN IF NOT EXISTS awaiting_admin_approval BOOLEAN DEFAULT false
    `);
    // Ensure is_admin column exists on forward_authorized_senders
    await db.query(`
      ALTER TABLE forward_authorized_senders
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_forward_senders_one_admin
      ON forward_authorized_senders (forward_id)
      WHERE is_admin = true
    `);
    tablesEnsured = true;
  } catch (err) {
    console.log('[BroadcastAdmin] Table migration note:', err.message);
    tablesEnsured = true;
  }
}

/**
 * Send the approval request to the admin via WhatsApp list message
 */
async function sendApprovalRequestToAdmin(userId, job, forward, adminPhone, adminName) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) return false;

    const wahaService = require('../waha/session.service');

    // admin_phone is stored as "972501234567@s.whatsapp.net" in DB
    const chatId = adminPhone.includes('@') ? adminPhone : `${adminPhone.replace(/\D/g, '')}@s.whatsapp.net`;

    const messagePreview = job.message_text
      ? job.message_text.substring(0, 100) + (job.message_text.length > 100 ? '...' : '')
      : `[${job.message_type}]`;

    const senderDisplay = job.sender_name && job.sender_name !== job.sender_phone
      ? `${job.sender_name} (${job.sender_phone})`
      : job.sender_phone;

    const bodyText = `📤 *בקשת שליחה לקבוצות*\n\n👤 *שולח:* ${senderDisplay}\n📋 *מסלול:* ${forward.name}\n📢 *קבוצות:* ${job.total_targets}\n\n💬 *תוכן:*\n${messagePreview}`;

    const listData = {
      title: '📤 אישור שליחת הודעה לקבוצות',
      body: bodyText,
      buttonText: 'בחר פעולה',
      buttons: [
        { title: '✅ אשר שליחה', rowId: `admin_approve_${job.id}` },
        { title: '❌ דחה שליחה', rowId: `admin_reject_${job.id}` }
      ]
    };

    await wahaService.sendList(wahaConnection, chatId, listData);
    console.log(`[BroadcastAdmin] Approval request sent to admin ${adminPhone} for job ${job.id}`);
    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Failed to send approval request:', error.message);
    return false;
  }
}

/**
 * Request admin approval for a job.
 * Checks if the forward has an admin sender configured.
 * Returns true if routed to admin, false if no admin (caller should proceed normally).
 */
async function requestAdminApproval(userId, job, forward) {
  await ensureAdminTables();

  const admin = await getForwardAdmin(forward.id);
  if (!admin) return false; // No admin configured for this forward

  try {
    // Mark job as awaiting admin approval
    await db.query(`
      UPDATE forward_jobs
      SET status = 'awaiting_admin', awaiting_admin_approval = true, updated_at = NOW()
      WHERE id = $1
    `, [job.id]);

    // Record approval request
    await db.query(`
      INSERT INTO broadcast_admin_approvals (user_id, job_id, sender_phone, sender_name, status)
      VALUES ($1, $2, $3, $4, 'pending')
      ON CONFLICT (job_id) DO UPDATE SET status = 'pending', resolved_at = NULL
    `, [userId, job.id, job.sender_phone, job.sender_name]);

    await sendApprovalRequestToAdmin(userId, job, forward, admin.phone_number, admin.name);
    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Error creating approval request:', error.message);
    return false;
  }
}

/**
 * Process admin's response (approve/reject).
 * Verifies the responder is the configured admin for the forward in question.
 * Returns true if handled.
 */
async function processAdminResponse(userId, adminPhone, rowId) {
  await ensureAdminTables();

  try {
    let action, jobId;
    if (rowId?.startsWith('admin_approve_')) {
      action = 'approve';
      jobId = rowId.replace('admin_approve_', '');
    } else if (rowId?.startsWith('admin_reject_')) {
      action = 'reject';
      jobId = rowId.replace('admin_reject_', '');
    } else {
      return false;
    }

    // Find the approval record
    const approvalResult = await db.query(
      `SELECT baa.*, fj.forward_id FROM broadcast_admin_approvals baa
       JOIN forward_jobs fj ON fj.id = baa.job_id
       WHERE baa.job_id = $1 AND baa.user_id = $2 AND baa.status = 'pending'`,
      [jobId, userId]
    );

    if (approvalResult.rows.length === 0) return false;

    const approval = approvalResult.rows[0];

    // Verify the responder is actually the admin for this forward
    const forwardAdmin = await getForwardAdmin(approval.forward_id);
    if (!forwardAdmin) return false;

    const normalizedIncoming = normalizePhone(adminPhone);
    const normalizedAdmin = normalizePhone(forwardAdmin.phone_number);

    if (normalizedIncoming !== normalizedAdmin) return false;

    // Update approval status
    await db.query(
      `UPDATE broadcast_admin_approvals SET status = $1, resolved_at = NOW() WHERE id = $2`,
      [action === 'approve' ? 'approved' : 'rejected', approval.id]
    );

    if (action === 'approve') {
      await handleApproval(userId, jobId);
    } else {
      await handleRejection(userId, jobId);
    }

    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Error processing admin response:', error.message);
    return false;
  }
}

async function handleApproval(userId, jobId) {
  try {
    const jobResult = await db.query('SELECT * FROM forward_jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) return;
    const job = jobResult.rows[0];

    const forwardResult = await db.query('SELECT * FROM group_forwards WHERE id = $1', [job.forward_id]);
    if (forwardResult.rows.length === 0) return;
    const forward = forwardResult.rows[0];

    await db.query(`
      UPDATE forward_jobs
      SET status = 'pending', awaiting_admin_approval = false, updated_at = NOW()
      WHERE id = $1
    `, [jobId]);

    // Inject stored total_targets since forward SELECT * doesn't include the computed column
    const forwardWithCount = { ...forward, target_count: job.total_targets };

    const triggerService = require('../groupForwards/trigger.service');
    await triggerService.sendConfirmationListForJob(userId, job, forwardWithCount);

    console.log(`[BroadcastAdmin] Job ${jobId} approved, confirmation sent to sender`);
  } catch (error) {
    console.error('[BroadcastAdmin] Error handling approval:', error.message);
  }
}

async function handleRejection(userId, jobId) {
  try {
    await db.query(`
      UPDATE forward_jobs
      SET status = 'cancelled', awaiting_admin_approval = false, updated_at = NOW()
      WHERE id = $1
    `, [jobId]);
    console.log(`[BroadcastAdmin] Job ${jobId} rejected by admin`);
  } catch (error) {
    console.error('[BroadcastAdmin] Error handling rejection:', error.message);
  }
}

/**
 * Check if a phone number is the admin for any forward belonging to a user
 * (used by message.revoked handler to verify cascade delete authority)
 */
async function isAdminForAnyForward(userId, phone) {
  try {
    await ensureAdminTables();
    const normalized = normalizePhone(phone);
    const result = await db.query(`
      SELECT fas.forward_id FROM forward_authorized_senders fas
      JOIN group_forwards gf ON gf.id = fas.forward_id
      WHERE gf.user_id = $1 AND fas.is_admin = true
    `, [userId]);

    for (const row of result.rows) {
      const adminPhone = normalizePhone(row.forward_admin_phone || '');
    }

    // Check if any admin phone matches
    const allAdmins = await db.query(`
      SELECT fas.phone_number FROM forward_authorized_senders fas
      JOIN group_forwards gf ON gf.id = fas.forward_id
      WHERE gf.user_id = $1 AND fas.is_admin = true
    `, [userId]);

    return allAdmins.rows.some(r => normalizePhone(r.phone_number) === normalized);
  } catch (err) {
    return false;
  }
}

/**
 * Cascade-delete broadcast messages from all groups where a job sent messages.
 * Uses the forward's delay_min as the inter-delete delay.
 *
 * @param {string} userId
 * @param {string} deletedMessageId - WAHA message ID that was revoked
 * @param {string} sourceGroupId - Group where the deletion originated
 */
async function cascadeDeleteBroadcastMessage(userId, deletedMessageId, sourceGroupId, adminPhone, shortMessageId) {
  await ensureAdminTables();

  try {
    // Find forward job message — exact match first, fallback to short ID (handles LID format differences)
    const forwardMsgResult = await db.query(`
      SELECT fjm.*, fj.id as job_id, fj.forward_id
      FROM forward_job_messages fjm
      JOIN forward_jobs fj ON fj.id = fjm.job_id
      WHERE fj.user_id = $1
        AND (fjm.whatsapp_message_id = $2
             OR ($3::text IS NOT NULL AND fjm.whatsapp_message_id LIKE '%' || $3 || '%'))
      LIMIT 1
    `, [userId, deletedMessageId, shortMessageId || null]);

    // Also check transfer job messages
    const transferMsgResult = await db.query(`
      SELECT tjm.*, tj.id as job_id, tj.transfer_id
      FROM transfer_job_messages tjm
      JOIN transfer_jobs tj ON tj.id = tjm.job_id
      WHERE tj.user_id = $1
        AND (tjm.message_id = $2
             OR ($3::text IS NOT NULL AND tjm.message_id LIKE '%' || $3 || '%'))
      LIMIT 1
    `, [userId, deletedMessageId, shortMessageId || null]);

    let jobType = null;
    let jobId = null;
    let forwardId = null;

    if (forwardMsgResult.rows.length > 0) {
      jobType = 'forward';
      jobId = forwardMsgResult.rows[0].job_id;
      forwardId = forwardMsgResult.rows[0].forward_id;
    } else if (transferMsgResult.rows.length > 0) {
      jobType = 'transfer';
      jobId = transferMsgResult.rows[0].job_id;
    }

    console.log(`[BroadcastAdmin] cascadeDelete lookup: fullId=${deletedMessageId} shortId=${shortMessageId} forwardFound=${forwardMsgResult.rows.length} transferFound=${transferMsgResult.rows.length}`);

    if (!jobType) {
      // Debug: print a sample of stored message IDs for this user
      const sample = await db.query(
        `SELECT fjm.whatsapp_message_id FROM forward_job_messages fjm
         JOIN forward_jobs fj ON fj.id = fjm.job_id
         WHERE fj.user_id = $1 AND fjm.whatsapp_message_id IS NOT NULL
         ORDER BY fjm.sent_at DESC LIMIT 5`,
        [userId]
      );
      console.log('[BroadcastAdmin] Sample stored message IDs:', sample.rows.map(r => r.whatsapp_message_id));
      return false;
    }

    // Get delay from forward settings (delay_min) or default to 2s
    let delayMs = 2000;
    if (forwardId) {
      const fwdResult = await db.query(
        'SELECT delay_min FROM group_forwards WHERE id = $1',
        [forwardId]
      );
      if (fwdResult.rows.length > 0) {
        delayMs = (fwdResult.rows[0].delay_min || 2) * 1000;
      }
    }

    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) return false;

    const wahaService = require('../waha/session.service');

    console.log(`[BroadcastAdmin] Cascade delete for job ${jobId} (${jobType}), delay ${delayMs}ms`);

    const failedGroups = [];

    if (jobType === 'forward') {
      const msgs = await db.query(`
        SELECT fjm.whatsapp_message_id, gft.group_id, gft.group_name
        FROM forward_job_messages fjm
        JOIN group_forward_targets gft ON gft.id = fjm.target_id
        WHERE fjm.job_id = $1
          AND fjm.status = 'sent'
          AND fjm.whatsapp_message_id IS NOT NULL
          AND fjm.whatsapp_message_id != $2
      `, [jobId, deletedMessageId]);

      for (const msg of msgs.rows) {
        await new Promise(r => setTimeout(r, delayMs));
        try {
          await wahaService.deleteMessage(wahaConnection, msg.group_id, msg.whatsapp_message_id);
          await db.query(`
            UPDATE forward_job_messages SET status = 'deleted', deleted_at = NOW()
            WHERE job_id = $1 AND whatsapp_message_id = $2
          `, [jobId, msg.whatsapp_message_id]);
          console.log(`[BroadcastAdmin] Deleted from ${msg.group_name || msg.group_id}`);
        } catch (e) {
          console.error(`[BroadcastAdmin] Delete failed for ${msg.group_id}:`, e.message);
          failedGroups.push(msg.group_name || msg.group_id);
        }
      }
    } else if (jobType === 'transfer') {
      // For transfers, get delay from transfer settings
      const transferResult = await db.query(
        'SELECT delay_min FROM group_transfers WHERE id = (SELECT transfer_id FROM transfer_jobs WHERE id = $1)',
        [jobId]
      );
      if (transferResult.rows.length > 0) {
        delayMs = (transferResult.rows[0].delay_min || 2) * 1000;
      }

      const msgs = await db.query(`
        SELECT message_id, group_id, group_name
        FROM transfer_job_messages
        WHERE job_id = $1
          AND status = 'sent'
          AND message_id IS NOT NULL
          AND message_id != $2
      `, [jobId, deletedMessageId]);

      for (const msg of msgs.rows) {
        await new Promise(r => setTimeout(r, delayMs));
        try {
          await wahaService.deleteMessage(wahaConnection, msg.group_id, msg.message_id);
          console.log(`[BroadcastAdmin] Deleted transfer msg from ${msg.group_name || msg.group_id}`);
        } catch (e) {
          console.error(`[BroadcastAdmin] Transfer delete failed for ${msg.group_id}:`, e.message);
          failedGroups.push(msg.group_name || msg.group_id);
        }
      }
    }

    // Notify admin about groups where deletion failed (bot is probably not a group admin)
    if (failedGroups.length > 0 && adminPhone) {
      try {
        const adminChatId = adminPhone.includes('@') ? adminPhone : `${adminPhone.replace(/\D/g, '')}@s.whatsapp.net`;
        const groupList = failedGroups.map(g => `• ${g}`).join('\n');
        const notifyText = `⚠️ *מחיקה נכשלה בקבוצות הבאות:*\n${groupList}\n\n_ייתכן שהבוט אינו מנהל בקבוצות אלו._`;
        await wahaService.sendMessage(wahaConnection, adminChatId, notifyText);
        console.log(`[BroadcastAdmin] Notified admin about ${failedGroups.length} failed deletions`);
      } catch (notifyErr) {
        console.error('[BroadcastAdmin] Failed to notify admin:', notifyErr.message);
      }
    }

    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Cascade delete error:', error.message);
    return false;
  }
}

// Keep getAdminConfig stub for backward compat (returns null — no global admin)
async function getAdminConfig(userId) {
  return null;
}

module.exports = {
  getAdminConfig,
  getForwardAdmin,
  ensureAdminTables,
  requestAdminApproval,
  processAdminResponse,
  isAdminForAnyForward,
  cascadeDeleteBroadcastMessage,
  normalizePhone
};
