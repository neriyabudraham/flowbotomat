const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const { decrypt } = require('../crypto/encrypt.service');

/**
 * Broadcast Admin Approval Service
 *
 * Handles admin approval flow for group forward broadcasts:
 * 1. When an authorized sender triggers a broadcast, if an admin is configured,
 *    the admin receives a WhatsApp list message with approve/reject options.
 * 2. If approved, the original sender continues the normal confirmation flow.
 * 3. If rejected, the job is cancelled with no notification to the sender.
 *
 * Also handles cascade message deletion:
 * When the admin deletes a broadcast message from one group,
 * the same message is deleted from all groups it was sent to.
 */

/**
 * Normalize a phone number to digits only, no country code prefix issues
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Get WAHA connection for a user
 */
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
 * Get broadcast admin config for a user
 * Returns null if no admin is configured
 */
async function getAdminConfig(userId) {
  try {
    const result = await db.query(
      'SELECT * FROM broadcast_admin_config WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  } catch (err) {
    // Table might not exist yet
    if (err.message?.includes('does not exist')) return null;
    throw err;
  }
}

/**
 * Ensure admin tables exist (lazy migration)
 */
let adminTablesEnsured = false;
async function ensureAdminTables() {
  if (adminTablesEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS broadcast_admin_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        admin_phone VARCHAR(30) NOT NULL,
        admin_name VARCHAR(255),
        require_approval BOOLEAN DEFAULT true,
        delete_delay_seconds INT DEFAULT 2,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_broadcast_admin_config_user
      ON broadcast_admin_config(user_id)
    `);
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
    adminTablesEnsured = true;
  } catch (err) {
    console.log('[BroadcastAdmin] Table creation note:', err.message);
    adminTablesEnsured = true;
  }
}

/**
 * Send an approval request WhatsApp list message to the admin
 * The admin receives: sender info, message preview, and Yes/No options
 */
async function sendApprovalRequestToAdmin(userId, job, forward, adminConfig) {
  try {
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) {
      console.log('[BroadcastAdmin] No WhatsApp connection for approval request');
      return false;
    }

    const wahaService = require('../waha/session.service');
    const adminChatId = `${adminConfig.admin_phone.replace(/\D/g, '')}@s.whatsapp.net`;

    // Build message preview (truncated)
    const messagePreview = job.message_text
      ? job.message_text.substring(0, 100) + (job.message_text.length > 100 ? '...' : '')
      : `[${job.message_type}]`;

    const senderDisplay = job.sender_name && job.sender_name !== job.sender_phone
      ? `${job.sender_name} (${job.sender_phone})`
      : job.sender_phone;

    const bodyText = `📤 *בקשת שליחה לקבוצות*\n\n👤 *שולח:* ${senderDisplay}\n📋 *מסלול:* ${forward.name}\n📢 *קבוצות:* ${job.total_targets}\n\n💬 *תוכן ההודעה:*\n${messagePreview}`;

    const listData = {
      title: '📤 אישור שליחת הודעה לקבוצות',
      body: bodyText,
      buttonText: 'בחר פעולה',
      buttons: [
        { title: '✅ אשר שליחה', rowId: `admin_approve_${job.id}` },
        { title: '❌ דחה שליחה', rowId: `admin_reject_${job.id}` }
      ]
    };

    await wahaService.sendList(wahaConnection, adminChatId, listData);
    console.log(`[BroadcastAdmin] Approval request sent to admin ${adminConfig.admin_phone} for job ${job.id}`);
    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Failed to send approval request:', error.message);
    return false;
  }
}

/**
 * Create an approval request record and send WhatsApp message to admin
 * Marks the job as awaiting admin approval
 */
async function requestAdminApproval(userId, job, forward) {
  await ensureAdminTables();

  const adminConfig = await getAdminConfig(userId);
  if (!adminConfig || !adminConfig.require_approval) {
    return false; // No admin configured or approval not required
  }

  try {
    // Mark job as awaiting admin approval
    await db.query(`
      UPDATE forward_jobs
      SET status = 'awaiting_admin', awaiting_admin_approval = true, updated_at = NOW()
      WHERE id = $1
    `, [job.id]);

    // Create approval record
    await db.query(`
      INSERT INTO broadcast_admin_approvals (user_id, job_id, sender_phone, sender_name, status)
      VALUES ($1, $2, $3, $4, 'pending')
      ON CONFLICT (job_id) DO UPDATE SET status = 'pending', resolved_at = NULL
    `, [userId, job.id, job.sender_phone, job.sender_name]);

    // Send WhatsApp message to admin
    await sendApprovalRequestToAdmin(userId, job, forward, adminConfig);

    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Error creating approval request:', error.message);
    return false;
  }
}

/**
 * Process admin's response (approve or reject) to a broadcast request
 * Returns true if the response was handled
 */
async function processAdminResponse(userId, adminPhone, rowId) {
  await ensureAdminTables();

  try {
    // Verify this is from the configured admin
    const adminConfig = await getAdminConfig(userId);
    if (!adminConfig) return false;

    const normalizedIncoming = normalizePhone(adminPhone);
    const normalizedAdmin = normalizePhone(adminConfig.admin_phone);

    if (normalizedIncoming !== normalizedAdmin) {
      return false; // Not from the admin
    }

    // Parse the action and job ID from rowId
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
      `SELECT * FROM broadcast_admin_approvals WHERE job_id = $1 AND user_id = $2 AND status = 'pending'`,
      [jobId, userId]
    );

    if (approvalResult.rows.length === 0) {
      console.log(`[BroadcastAdmin] No pending approval found for job ${jobId}`);
      return false;
    }

    const approval = approvalResult.rows[0];

    // Update approval status
    await db.query(`
      UPDATE broadcast_admin_approvals
      SET status = $1, resolved_at = NOW()
      WHERE id = $2
    `, [action === 'approve' ? 'approved' : 'rejected', approval.id]);

    if (action === 'approve') {
      await handleApproval(userId, jobId, approval);
    } else {
      await handleRejection(userId, jobId);
    }

    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Error processing admin response:', error.message);
    return false;
  }
}

/**
 * Handle approval: mark job as pending_confirmation and send confirmation list to original sender
 */
async function handleApproval(userId, jobId, approval) {
  try {
    // Get the job details
    const jobResult = await db.query(
      'SELECT * FROM forward_jobs WHERE id = $1',
      [jobId]
    );

    if (jobResult.rows.length === 0) return;

    const job = jobResult.rows[0];

    // Get the forward details
    const forwardResult = await db.query(
      'SELECT * FROM group_forwards WHERE id = $1',
      [job.forward_id]
    );

    if (forwardResult.rows.length === 0) return;

    const forward = forwardResult.rows[0];

    // Mark job as pending (ready for sender confirmation) and clear admin flag
    await db.query(`
      UPDATE forward_jobs
      SET status = 'pending', awaiting_admin_approval = false, updated_at = NOW()
      WHERE id = $1
    `, [jobId]);

    // Send confirmation list to the original sender
    const triggerService = require('../groupForwards/trigger.service');
    await triggerService.sendConfirmationListForJob(userId, job, forward);

    console.log(`[BroadcastAdmin] Job ${jobId} approved, confirmation sent to sender ${job.sender_phone}`);
  } catch (error) {
    console.error('[BroadcastAdmin] Error handling approval:', error.message);
  }
}

/**
 * Handle rejection: cancel the job silently (no notification to sender)
 */
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
 * Check if a given phone is the configured admin for a user
 */
async function isAdmin(userId, phone) {
  const adminConfig = await getAdminConfig(userId);
  if (!adminConfig) return false;

  const normalizedIncoming = normalizePhone(phone);
  const normalizedAdmin = normalizePhone(adminConfig.admin_phone);
  return normalizedIncoming === normalizedAdmin;
}

/**
 * Cascade-delete a broadcast message from all groups where it was sent
 * Called when the admin deletes a message from one of the groups
 *
 * @param {string} userId - User ID
 * @param {string} deletedMessageId - WAHA message ID that was deleted
 * @param {string} sourceGroupId - Group where it was deleted
 */
async function cascadeDeleteBroadcastMessage(userId, deletedMessageId, sourceGroupId) {
  await ensureAdminTables();

  try {
    const adminConfig = await getAdminConfig(userId);
    const delayMs = ((adminConfig?.delete_delay_seconds) || 2) * 1000;

    // Find the job this message belongs to (check forward_job_messages)
    const forwardMsgResult = await db.query(`
      SELECT fjm.*, fj.id as job_id, fj.forward_id
      FROM forward_job_messages fjm
      JOIN forward_jobs fj ON fj.id = fjm.job_id
      WHERE fj.user_id = $1 AND fjm.whatsapp_message_id = $2
      LIMIT 1
    `, [userId, deletedMessageId]);

    // Also check transfer_job_messages
    const transferMsgResult = await db.query(`
      SELECT tjm.*, tj.id as job_id, tj.transfer_id
      FROM transfer_job_messages tjm
      JOIN transfer_jobs tj ON tj.id = tjm.job_id
      WHERE tj.user_id = $1 AND tjm.message_id = $2
      LIMIT 1
    `, [userId, deletedMessageId]);

    let jobType = null;
    let jobId = null;
    let sourceMessageRow = null;

    if (forwardMsgResult.rows.length > 0) {
      jobType = 'forward';
      sourceMessageRow = forwardMsgResult.rows[0];
      jobId = sourceMessageRow.job_id;
    } else if (transferMsgResult.rows.length > 0) {
      jobType = 'transfer';
      sourceMessageRow = transferMsgResult.rows[0];
      jobId = sourceMessageRow.job_id;
    }

    if (!jobType) {
      // Message not found in any broadcast job - not a broadcast message
      return false;
    }

    console.log(`[BroadcastAdmin] Cascade delete triggered for job ${jobId} (${jobType}), deleted message: ${deletedMessageId} from group ${sourceGroupId}`);

    // Get WAHA connection
    const wahaConnection = await getWahaConnection(userId);
    if (!wahaConnection) {
      console.log('[BroadcastAdmin] No WhatsApp connection for cascade delete');
      return false;
    }

    const wahaService = require('../waha/session.service');

    if (jobType === 'forward') {
      // Get all OTHER messages from the same forward job (except the one already deleted)
      const allMsgsResult = await db.query(`
        SELECT fjm.whatsapp_message_id, gft.group_id, gft.group_name
        FROM forward_job_messages fjm
        JOIN group_forward_targets gft ON gft.id = fjm.target_id
        WHERE fjm.job_id = $1
          AND fjm.status = 'sent'
          AND fjm.whatsapp_message_id IS NOT NULL
          AND fjm.whatsapp_message_id != $2
      `, [jobId, deletedMessageId]);

      if (allMsgsResult.rows.length === 0) {
        console.log('[BroadcastAdmin] No other messages to delete in forward job');
        return true;
      }

      console.log(`[BroadcastAdmin] Deleting ${allMsgsResult.rows.length} messages from other groups with ${delayMs}ms delay`);

      // Delete each message with delay
      for (const msg of allMsgsResult.rows) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        try {
          await wahaService.deleteMessage(wahaConnection, msg.group_id, msg.whatsapp_message_id);
          await db.query(`
            UPDATE forward_job_messages
            SET status = 'deleted', deleted_at = NOW()
            WHERE job_id = $1 AND whatsapp_message_id = $2
          `, [jobId, msg.whatsapp_message_id]);
          console.log(`[BroadcastAdmin] Deleted message from group ${msg.group_name || msg.group_id}`);
        } catch (deleteErr) {
          console.error(`[BroadcastAdmin] Failed to delete from ${msg.group_id}:`, deleteErr.message);
        }
      }
    } else if (jobType === 'transfer') {
      // Get all OTHER messages from the same transfer job
      const allMsgsResult = await db.query(`
        SELECT message_id, group_id, group_name
        FROM transfer_job_messages
        WHERE job_id = $1
          AND status = 'sent'
          AND message_id IS NOT NULL
          AND message_id != $2
      `, [jobId, deletedMessageId]);

      if (allMsgsResult.rows.length === 0) {
        console.log('[BroadcastAdmin] No other messages to delete in transfer job');
        return true;
      }

      console.log(`[BroadcastAdmin] Deleting ${allMsgsResult.rows.length} messages from other groups (transfer) with ${delayMs}ms delay`);

      for (const msg of allMsgsResult.rows) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        try {
          await wahaService.deleteMessage(wahaConnection, msg.group_id, msg.message_id);
          console.log(`[BroadcastAdmin] Deleted transfer message from group ${msg.group_name || msg.group_id}`);
        } catch (deleteErr) {
          console.error(`[BroadcastAdmin] Failed to delete transfer msg from ${msg.group_id}:`, deleteErr.message);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('[BroadcastAdmin] Cascade delete error:', error.message);
    return false;
  }
}

module.exports = {
  getAdminConfig,
  ensureAdminTables,
  requestAdminApproval,
  processAdminResponse,
  isAdmin,
  cascadeDeleteBroadcastMessage,
  normalizePhone
};
