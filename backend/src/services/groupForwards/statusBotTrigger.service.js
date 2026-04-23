/**
 * Status Bot Trigger Service for Group Forwards
 * Handles triggering group_forwards when messages arrive via the central status bot
 * (Cloud API) rather than the user's own WhatsApp.
 *
 * Only authorized senders (in forward_authorized_senders) can trigger forwards.
 */

const db = require('../../config/database');
const cloudApi = require('../cloudApi/cloudApi.service');
const path = require('path');
const fs = require('fs');

/**
 * Download media from Cloud API and save locally for the forward_job.
 */
async function downloadCloudApiMedia(message) {
  try {
    let mediaId = null;
    let mimeType = null;
    let filename = null;
    let caption = '';

    if (message.type === 'image' && message.image?.id) {
      mediaId = message.image.id;
      caption = message.image.caption || '';
    } else if (message.type === 'video' && message.video?.id) {
      mediaId = message.video.id;
      caption = message.video.caption || '';
    } else if (message.type === 'audio' && message.audio?.id) {
      mediaId = message.audio.id;
    } else if (message.type === 'document' && message.document?.id) {
      mediaId = message.document.id;
      filename = message.document.filename;
    }

    if (!mediaId) return { mediaUrl: null, mediaMimeType: null, mediaFilename: null, caption };

    const media = await cloudApi.downloadMedia(mediaId);
    mimeType = media.mimeType;

    // Save locally to uploads/group-forwards/
    const uploadsDir = path.join(__dirname, '../../../uploads/group-forwards');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = (mimeType?.split('/')[1]?.split(';')[0] || 'bin').replace(/[^a-z0-9]/gi, '');
    const outName = filename || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const outPath = path.join(uploadsDir, outName);
    fs.writeFileSync(outPath, media.buffer);
    const baseUrl = process.env.API_URL || 'http://localhost:3000/api';
    const mediaUrl = `${baseUrl}/uploads/group-forwards/${outName}`;

    return { mediaUrl, mediaMimeType: mimeType, mediaFilename: outName, caption };
  } catch (err) {
    console.error('[StatusBotTrigger] Download media error:', err.message);
    return { mediaUrl: null, mediaMimeType: null, mediaFilename: null, caption: '' };
  }
}

/**
 * Trigger a specific group forward from a Cloud API message (status bot trigger).
 *
 * @param {string} userId - Owner of the forward
 * @param {string} forwardId - The specific forward to trigger
 * @param {string} senderPhone - Phone of the authorized sender
 * @param {object} message - Cloud API message object
 * @returns {{ jobId, targetCount, requireConfirmation }}
 */
async function triggerFromStatusBot(userId, forwardId, senderPhone, message) {
  // Load forward + verify it's active and trigger_type is status_bot
  const forwardResult = await db.query(
    `SELECT gf.*,
       (SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = gf.id AND is_active = true) as target_count
     FROM group_forwards gf
     WHERE gf.id = $1 AND gf.user_id = $2 AND gf.is_active = true AND gf.trigger_type = 'status_bot'`,
    [forwardId, userId]
  );
  if (forwardResult.rows.length === 0) {
    throw new Error('Forward not found or not active');
  }
  const forward = forwardResult.rows[0];

  // Verify sender is authorized — normalize stored phone (may include @s.whatsapp.net)
  const normalizedPhone = senderPhone.replace(/\D/g, '');
  const alt972 = normalizedPhone.startsWith('0') ? '972' + normalizedPhone.slice(1) : normalizedPhone;
  const alt0 = normalizedPhone.startsWith('972') ? '0' + normalizedPhone.slice(3) : normalizedPhone;
  const senderResult = await db.query(
    `SELECT * FROM forward_authorized_senders
     WHERE forward_id = $1
       AND (
         regexp_replace(phone_number, '\\D', '', 'g') = $2
         OR regexp_replace(phone_number, '\\D', '', 'g') = $3
         OR regexp_replace(phone_number, '\\D', '', 'g') = $4
       )`,
    [forwardId, normalizedPhone, alt972, alt0]
  );
  if (senderResult.rows.length === 0) {
    throw new Error('Sender not authorized for this forward');
  }
  const sender = senderResult.rows[0];

  // Extract message content
  let messageType = message.type;
  let messageText = '';
  let mediaUrl = null;
  let mediaMimeType = null;
  let mediaFilename = null;

  if (messageType === 'text') {
    messageText = message.text?.body || '';
  } else if (['image', 'video', 'audio', 'document'].includes(messageType)) {
    const mediaInfo = await downloadCloudApiMedia(message);
    mediaUrl = mediaInfo.mediaUrl;
    mediaMimeType = mediaInfo.mediaMimeType;
    mediaFilename = mediaInfo.mediaFilename;
    messageText = mediaInfo.caption;
    if (!mediaUrl) throw new Error('Failed to download media');
  } else {
    throw new Error(`Unsupported message type: ${messageType}`);
  }

  // Auto-confirm if any of these: no confirmation required, sender is admin, or sender can send without approval
  const autoConfirm = !forward.require_confirmation || sender.is_admin || sender.can_send_without_approval;
  const status = autoConfirm ? 'confirmed' : 'pending';

  // Create forward_job
  const jobResult = await db.query(
    `INSERT INTO forward_jobs (
       forward_id, user_id, message_type, message_text,
       media_url, media_mime_type, media_filename,
       sender_phone, sender_name, total_targets, status, forward_name
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      forward.id, userId, messageType, messageText,
      mediaUrl, mediaMimeType, mediaFilename,
      senderPhone, sender.name || senderPhone,
      forward.target_count, status, forward.name
    ]
  );
  const job = jobResult.rows[0];

  // Create job_messages for each target (respect sender's denied groups)
  const senderDbPhone = sender.phone_number;
  const targets = await db.query(
    `SELECT gft.* FROM group_forward_targets gft
     WHERE gft.forward_id = $1 AND gft.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM forward_sender_group_denied fsgd
         WHERE fsgd.forward_id = gft.forward_id
           AND fsgd.sender_phone = $2
           AND fsgd.group_id = gft.group_id
       )
     ORDER BY gft.sort_order ASC`,
    [forward.id, senderDbPhone]
  );

  for (const target of targets.rows) {
    await db.query(
      `INSERT INTO forward_job_messages (job_id, target_id, group_id, group_name, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [job.id, target.id, target.group_id, target.group_name]
    );
  }

  // Update total_targets to actual filtered count
  await db.query(`UPDATE forward_jobs SET total_targets = $1 WHERE id = $2`, [targets.rows.length, job.id]);

  // If auto-confirmed, kick off sender immediately via existing job runner
  if (status === 'confirmed') {
    try {
      const { startForwardJob } = require('../../controllers/groupForwards/jobs.controller');
      startForwardJob(job.id).catch(err => console.error('[StatusBotTrigger] startForwardJob error:', err.message));
    } catch (e) {
      console.error('[StatusBotTrigger] Could not start forward job:', e.message);
    }
  }

  return {
    jobId: job.id,
    targetCount: targets.rows.length,
    requireConfirmation: status === 'pending',
    forwardName: forward.name,
  };
}

module.exports = {
  triggerFromStatusBot,
};
