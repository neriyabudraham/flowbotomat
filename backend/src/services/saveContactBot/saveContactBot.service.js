/**
 * Save Contact Bot service.
 * - Creates/updates wa.me/message QR-links for a user profile
 * - Handles inbound messages: matches trigger text, sends welcome → contact card → sequence
 */

const db = require('../../config/database');
const api = require('./cloudApi.service');
const googleContactsService = require('../googleContacts.service');
const usage = require('./usage.service');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalize(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const DEFAULT_WELCOME_MESSAGE =
  'נשמרת בהצלחה אצל *{name}*\nעל מנת לצפות בסטטוסים *יש לשמור את איש הקשר* המצורף כאן\n👇🏻👇🏻👇🏻';

/**
 * Normalize any Israeli phone format to E.164 digits without the plus
 * (e.g. "052-742-8547" / "+972 52 742 8547" / "0527428547" → "972527428547").
 */
function normalizePhoneIL(input) {
  if (!input) return '';
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  if (digits.length === 9) return '972' + digits;
  return digits;
}

async function getProfileByUserId(userId) {
  const { rows } = await db.query(
    `SELECT * FROM save_contact_bot_profiles WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function getProfileById(id) {
  const { rows } = await db.query(
    `SELECT * FROM save_contact_bot_profiles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listSequenceSteps(profileId) {
  const { rows } = await db.query(
    `SELECT * FROM save_contact_bot_sequence_steps
       WHERE profile_id = $1
     ORDER BY step_order ASC`,
    [profileId]
  );
  return rows;
}

const MAX_CUSTOM_STEPS = 3;

/**
 * Return a unified, ordered list that includes:
 * - the welcome message (unless deleted — welcome_step_order = null)
 * - the contact card (always exactly one)
 * - any custom steps (text / image / video / audio / document) — capped to MAX_CUSTOM_STEPS
 *
 * Each item is { kind, id, step_order, ... }. The caller can sort by step_order.
 */
async function assembleSequence(profile) {
  const steps = await listSequenceSteps(profile.id);
  const items = [];

  if (profile.welcome_step_order !== null && profile.welcome_step_order !== undefined) {
    items.push({
      kind: 'welcome',
      id: 'welcome',
      step_order: profile.welcome_step_order,
      text_content: profile.welcome_message,
    });
  }
  items.push({
    kind: 'contact',
    id: 'contact',
    step_order: profile.contact_step_order != null ? profile.contact_step_order : 1,
  });
  for (const s of steps) {
    items.push({
      kind: 'custom',
      id: s.id,
      step_order: s.step_order,
      step_type: s.step_type,
      text_content: s.text_content,
      media_url: s.media_url,
      media_caption: s.media_caption,
      media_filename: s.media_filename,
      delay_ms: s.delay_ms,
    });
  }
  items.sort((a, b) => a.step_order - b.step_order);
  return items;
}

async function upsertProfile(userId, input) {
  const contactPhone = normalizePhoneIL(input.contact_phone);
  const welcomeMessage = (input.welcome_message && String(input.welcome_message).trim())
    ? input.welcome_message
    : DEFAULT_WELCOME_MESSAGE;
  const isActive = input.is_active === undefined ? true : !!input.is_active;
  const syncEnabled = input.google_contacts_sync_enabled === undefined ? undefined : !!input.google_contacts_sync_enabled;
  const labelId = input.google_contacts_label_id === undefined ? undefined : (input.google_contacts_label_id || null);
  const normalizedTrigger = normalize(input.prefilled_message);

  // Uniqueness: no two profiles may share the same normalized trigger text.
  if (normalizedTrigger) {
    const dup = await db.query(
      `SELECT id, user_id FROM save_contact_bot_profiles
        WHERE LOWER(TRIM(prefilled_message)) = $1 AND user_id <> $2`,
      [normalizedTrigger, userId]
    );
    if (dup.rows.length > 0) {
      const err = new Error('הטקסט הזה לא זמין — הוא כבר בשימוש. הוסף פרט אישי קטן (למשל שם משפחה) והטקסט יהיה זמין.');
      err.code = 'DUPLICATE_PREFILLED';
      err.field = 'prefilled_message';
      throw err;
    }
  }

  const existing = await getProfileByUserId(userId);
  if (existing) {
    const { rows } = await db.query(
      `UPDATE save_contact_bot_profiles
          SET contact_name = $2,
              contact_phone = $3,
              prefilled_message = $4,
              welcome_message = $5,
              is_active = $6,
              google_contacts_sync_enabled = COALESCE($7, google_contacts_sync_enabled),
              google_contacts_label_id = COALESCE($8, google_contacts_label_id),
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING *`,
      [userId, input.contact_name, contactPhone, input.prefilled_message, welcomeMessage, isActive, syncEnabled, labelId]
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO save_contact_bot_profiles
        (user_id, contact_name, contact_phone, prefilled_message, welcome_message, is_active, google_contacts_sync_enabled, google_contacts_label_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), $8)
     RETURNING *`,
    [userId, input.contact_name, contactPhone, input.prefilled_message, welcomeMessage, isActive, syncEnabled, labelId]
  );
  return rows[0];
}

async function deleteProfile(userId) {
  const existing = await getProfileByUserId(userId);
  if (!existing) return { deleted: false };
  if (existing.qrdl_code) {
    try { await api.deleteQrdl(existing.qrdl_code); } catch (e) { /* best-effort */ }
  }
  await db.query(`DELETE FROM save_contact_bot_profiles WHERE user_id = $1`, [userId]);
  return { deleted: true };
}

/**
 * Create or refresh the QR deep-link for this profile.
 * If there's already a qrdl_code and the prefilled_message changed, update it in place.
 */
async function generateOrRefreshLink(userId) {
  const profile = await getProfileByUserId(userId);
  if (!profile) throw new Error('Profile not found');

  let result;
  if (profile.qrdl_code) {
    result = await api.updateQrdl(profile.qrdl_code, profile.prefilled_message);
  } else {
    result = await api.createQrdl(profile.prefilled_message, 'PNG');
  }

  // Meta's update endpoint returns no qr_image_url — preserve the one we already have.
  // On fresh creation, Meta returns a short-lived QR image URL.
  const qrImage = result.qr_image_url || profile.qrdl_qr_image_url || null;

  const { rows } = await db.query(
    `UPDATE save_contact_bot_profiles
        SET qrdl_code = $2,
            qrdl_deep_link_url = $3,
            qrdl_qr_image_url = $4,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [profile.id, result.code || profile.qrdl_code, result.deep_link_url || profile.qrdl_deep_link_url, qrImage]
  );
  return rows[0];
}

// ─────────────────────────────── Sequence CRUD ───────────────────────────────

async function addSequenceStep(profileId, input) {
  const countRow = await db.query(
    `SELECT COUNT(*)::int AS n FROM save_contact_bot_sequence_steps WHERE profile_id = $1`,
    [profileId]
  );
  if (countRow.rows[0].n >= MAX_CUSTOM_STEPS) {
    const err = new Error(`ניתן להוסיף עד ${MAX_CUSTOM_STEPS} הודעות משלך (מעבר להודעת הפתיחה ואיש הקשר).`);
    err.code = 'MAX_STEPS_REACHED';
    throw err;
  }

  const maxOrder = await db.query(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(step_order) FROM save_contact_bot_sequence_steps WHERE profile_id = $1), 0),
       COALESCE((SELECT welcome_step_order FROM save_contact_bot_profiles WHERE id = $1), 0),
       COALESCE((SELECT contact_step_order FROM save_contact_bot_profiles WHERE id = $1), 0)
     ) + 1 AS next`,
    [profileId]
  );
  const nextOrder = maxOrder.rows[0].next;
  const { rows } = await db.query(
    `INSERT INTO save_contact_bot_sequence_steps
        (profile_id, step_order, position, step_type, text_content, media_url, media_caption, media_filename, delay_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      profileId,
      nextOrder,
      input.position || 'after_contact',
      input.step_type,
      input.text_content || null,
      input.media_url || null,
      input.media_caption || null,
      input.media_filename || null,
      input.delay_ms || 0,
    ]
  );
  return rows[0];
}

async function updateSequenceStep(stepId, input) {
  const { rows } = await db.query(
    `UPDATE save_contact_bot_sequence_steps
        SET step_type = COALESCE($2, step_type),
            text_content = $3,
            media_url = $4,
            media_caption = $5,
            media_filename = COALESCE($6, media_filename),
            delay_ms = COALESCE($7, delay_ms),
            position = COALESCE($8, position),
            step_order = COALESCE($9, step_order)
      WHERE id = $1
      RETURNING *`,
    [stepId, input.step_type, input.text_content || null, input.media_url || null, input.media_caption || null, input.media_filename || null, input.delay_ms, input.position, input.step_order]
  );
  return rows[0];
}

async function deleteSequenceStep(stepId) {
  await db.query(`DELETE FROM save_contact_bot_sequence_steps WHERE id = $1`, [stepId]);
  return { deleted: true };
}

async function reorderSequenceSteps(profileId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.query(
      `UPDATE save_contact_bot_sequence_steps SET step_order = $1 WHERE id = $2 AND profile_id = $3`,
      [i, orderedIds[i], profileId]
    );
  }
  return { ok: true };
}

/**
 * Reorder the unified sequence: accepts an array of IDs ('welcome' | 'contact' | <uuid>)
 * and assigns orders 0..N-1. Respects max 3 custom steps.
 */
async function reorderUnified(profileId, orderedIds) {
  const profile = await getProfileById(profileId);
  if (!profile) throw new Error('profile not found');

  const customIds = orderedIds.filter((id) => id !== 'welcome' && id !== 'contact');
  if (customIds.length > MAX_CUSTOM_STEPS) {
    const err = new Error(`ניתן עד ${MAX_CUSTOM_STEPS} הודעות משלך`);
    err.code = 'MAX_STEPS_REACHED';
    throw err;
  }

  const welcomeOrder = orderedIds.indexOf('welcome');
  const contactOrder = orderedIds.indexOf('contact');

  await db.query(
    `UPDATE save_contact_bot_profiles
        SET welcome_step_order = $2,
            contact_step_order = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [profileId, welcomeOrder >= 0 ? welcomeOrder : null, contactOrder >= 0 ? contactOrder : 1]
  );

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === 'welcome' || id === 'contact') continue;
    await db.query(
      `UPDATE save_contact_bot_sequence_steps SET step_order = $1 WHERE id = $2 AND profile_id = $3`,
      [i, id, profileId]
    );
  }
  return { ok: true };
}

async function deleteWelcome(userId) {
  await db.query(
    `UPDATE save_contact_bot_profiles SET welcome_step_order = NULL, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
  return { ok: true };
}

async function restoreDefaultWelcome(userId) {
  const profile = await getProfileByUserId(userId);
  if (!profile) throw new Error('profile not found');
  const nm = profile.contact_name || '';
  const defaultText = DEFAULT_WELCOME_MESSAGE.split('{name}').join(nm);
  await db.query(
    `UPDATE save_contact_bot_profiles
        SET welcome_message = $2,
            welcome_step_order = 0,
            contact_step_order = GREATEST(contact_step_order, 1),
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId, defaultText]
  );
  // Push other steps so the welcome/contact sit at the top if they were moved.
  const steps = await db.query(
    `SELECT id FROM save_contact_bot_sequence_steps WHERE profile_id = $1 ORDER BY step_order ASC`,
    [profile.id]
  );
  for (let i = 0; i < steps.rows.length; i++) {
    await db.query(
      `UPDATE save_contact_bot_sequence_steps SET step_order = $1 WHERE id = $2`,
      [i + 2, steps.rows[i].id]
    );
  }
  return await getProfileByUserId(userId);
}

// ─────────────────────────── Received requests (list) ───────────────────────────

async function listReceivedRequests(userId, { limit = 100, offset = 0 } = {}) {
  const profile = await getProfileByUserId(userId);
  if (!profile) return { items: [], total: 0, matchedCount: 0, uniquePhones: 0 };

  // Grouped by phone: one row per contact with latest message + counts.
  // sync_action priority: 'created' > 'preexisted' > null  (any 'created' means we saved it at least once)
  const { rows } = await db.query(
    `SELECT
        from_phone,
        (SELECT from_wa_name FROM save_contact_bot_received_requests r2
          WHERE r2.profile_id = r.profile_id AND r2.from_phone = r.from_phone
          ORDER BY processed_at DESC LIMIT 1) AS from_wa_name,
        MAX(processed_at) AS last_at,
        MIN(processed_at) AS first_at,
        COUNT(*)::int AS send_count,
        BOOL_OR(matched) AS any_matched,
        BOOL_OR(google_contact_synced) AS synced,
        MAX(google_contact_resource_name) AS google_resource_name,
        CASE
          WHEN BOOL_OR(google_sync_action = 'created') THEN 'created'
          WHEN BOOL_OR(google_sync_action = 'preexisted') THEN 'preexisted'
          ELSE NULL
        END AS sync_action,
        (SELECT message_text FROM save_contact_bot_received_requests r3
          WHERE r3.profile_id = r.profile_id AND r3.from_phone = r.from_phone
          ORDER BY processed_at DESC LIMIT 1) AS last_message
       FROM save_contact_bot_received_requests r
      WHERE profile_id = $1
      GROUP BY profile_id, from_phone
      ORDER BY last_at DESC
      LIMIT $2 OFFSET $3`,
    [profile.id, limit, offset]
  );

  const stats = await db.query(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE matched)::int AS matched_count,
        COUNT(DISTINCT from_phone)::int AS unique_phones,
        COUNT(DISTINCT from_phone) FILTER (WHERE google_contact_synced)::int AS synced_unique
       FROM save_contact_bot_received_requests
      WHERE profile_id = $1`,
    [profile.id]
  );

  return {
    items: rows,
    total: stats.rows[0].total,
    matchedCount: stats.rows[0].matched_count,
    uniquePhones: stats.rows[0].unique_phones,
    syncedUnique: stats.rows[0].synced_unique,
  };
}

async function listRequestsByPhone(userId, phone) {
  const profile = await getProfileByUserId(userId);
  if (!profile) return { items: [] };
  const { rows } = await db.query(
    `SELECT id, from_phone, from_wa_name, message_text, matched, processed_at,
            google_contact_synced, google_contact_resource_name, google_sync_action
       FROM save_contact_bot_received_requests
      WHERE profile_id = $1 AND from_phone = $2
      ORDER BY processed_at DESC
      LIMIT 200`,
    [profile.id, phone]
  );
  return { items: rows };
}

// ─────────────────────────── Inbound matching + trigger ───────────────────────────

async function findMatchingActiveProfile(messageText) {
  const normalized = normalize(messageText);
  if (!normalized) return null;

  const { rows } = await db.query(
    `SELECT * FROM save_contact_bot_profiles WHERE is_active = true`
  );
  for (const p of rows) {
    const target = normalize(p.prefilled_message);
    if (!target) continue;
    if (normalized === target || normalized.includes(target) || target.includes(normalized)) {
      return p;
    }
  }
  return null;
}

function renderTemplate(template, vars) {
  let out = template || '';
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replaceAll(`{${k}}`, v == null ? '' : String(v));
  }
  return out;
}

// Minimum gap between any two outgoing WhatsApp messages — makes delivery order stable
// on the recipient's phone. Media messages (image/video) can take longer for Meta to
// fetch from our storage and deliver, so we add extra time for them.
const MIN_GAP_MS = 1200;
const MEDIA_GAP_MS = 2500;

async function executeSequence(profile, toPhone, senderWaName, inboundMessageId) {
  const items = await assembleSequence(profile);

  // Mark inbound message as read (best-effort)
  if (inboundMessageId) await api.markAsRead(inboundMessageId);

  const tplVars = {
    name: profile.contact_name,
    contact_name: profile.contact_name,
    sender_name: senderWaName || '',
  };

  for (const item of items) {
    if (item.kind === 'welcome') {
      const welcome = renderTemplate(item.text_content || profile.welcome_message, tplVars);
      if (welcome && welcome.trim()) {
        await api.sendTextMessage(toPhone, welcome);
        await sleep(MIN_GAP_MS);
      }
    } else if (item.kind === 'contact') {
      await api.sendContactCard(toPhone, { fullName: profile.contact_name, phone: profile.contact_phone });
      await sleep(MEDIA_GAP_MS);
    } else if (item.kind === 'custom') {
      if (item.delay_ms) await sleep(item.delay_ms);
      await sendStep(item, toPhone, tplVars);
      await sleep(isMediaStep(item) ? MEDIA_GAP_MS : MIN_GAP_MS);
    }
  }
}

function isMediaStep(step) {
  return ['image', 'video', 'audio', 'document'].includes(step.step_type);
}

async function sendStep(step, toPhone, tplVars = {}) {
  try {
    if (step.step_type === 'text') {
      const rendered = renderTemplate(step.text_content, tplVars);
      if (rendered) await api.sendTextMessage(toPhone, rendered);
      return;
    }
    if (['image', 'video', 'audio', 'document'].includes(step.step_type)) {
      if (step.media_url) {
        const renderedCaption = renderTemplate(step.media_caption, tplVars);
        await api.sendMediaMessage(toPhone, step.step_type, step.media_url, renderedCaption || '', step.media_filename || null);
      }
      return;
    }
    console.warn(`[SaveContactBot] Unknown step type: ${step.step_type}`);
  } catch (e) {
    console.error(`[SaveContactBot] sendStep failed (${step.step_type}):`, e.response?.data || e.message);
  }
}

const SAVED_CONTACTS_LABEL = 'שמירת אנשי קשר';

/**
 * Check whether a phone already exists in ANY connected Google slot.
 * Returns { existsInSlot, resourceName } when found, or null when not found anywhere.
 */
async function findPhoneAcrossSlots(userId, phone) {
  const slots = await googleContactsService.listConnectedSlots(userId);
  for (const s of slots) {
    const hit = await googleContactsService.findContactInSlot(userId, s.slot, phone);
    if (hit) {
      return {
        existsInSlot: s.slot,
        email: s.email,
        resourceName: hit.resourceName,
        displayName: hit.displayName,
      };
    }
  }
  return null;
}

/**
 * Best-effort: add the sender to the profile-owner's Google Contacts.
 * - If any of the connected Google accounts already has this phone → skip.
 * - Otherwise, create in the primary (lowest-slot) account with the "שמירת אנשי קשר" label.
 */
async function syncToGoogleContacts(profile, senderPhone, senderWaName) {
  if (!profile.google_contacts_sync_enabled) return { synced: false, reason: 'disabled' };
  try {
    const slots = await googleContactsService.listConnectedSlots(profile.user_id);
    if (slots.length === 0) return { synced: false, reason: 'not_connected' };

    const existing = await findPhoneAcrossSlots(profile.user_id, senderPhone);
    if (existing) {
      console.log(`[SaveContactBot] contact already exists in slot ${existing.existsInSlot} (${existing.email}) — skipping create`);
      return {
        synced: false,
        reason: 'already_exists',
        existsInSlot: existing.existsInSlot,
        email: existing.email,
        resourceName: existing.resourceName,
      };
    }

    // Pick the first slot that isn't at the 25k Google limit.
    const GOOGLE_CONTACT_LIMIT = 25000;
    let chosen = null;
    for (const s of slots) {
      try {
        const count = await googleContactsService.getContactCountBySlot(profile.user_id, s.slot);
        if (count != null && count >= GOOGLE_CONTACT_LIMIT) {
          console.log(`[SaveContactBot] slot ${s.slot} (${s.email}) at limit ${count}, trying next`);
          continue;
        }
        chosen = s;
        break;
      } catch {
        // Fall back to using this slot if we can't read the count.
        chosen = s;
        break;
      }
    }
    if (!chosen) {
      return { synced: false, reason: 'all_at_limit' };
    }

    const displayName = (senderWaName && senderWaName.trim()) || senderPhone;

    let labelResourceName = null;
    try {
      labelResourceName = await googleContactsService.ensureLabelInSlot(
        profile.user_id,
        chosen.slot,
        SAVED_CONTACTS_LABEL
      );
    } catch (e) {
      console.warn(`[SaveContactBot] could not ensure label in slot ${chosen.slot}: ${e.message}`);
    }

    const created = await googleContactsService.createContactInSlot(profile.user_id, chosen.slot, {
      name: displayName,
      phone: senderPhone,
      labelResourceName,
    });
    console.log(`[SaveContactBot] Google contact created for ${senderPhone} in slot ${chosen.slot} → ${created?.resourceName}`);
    return {
      synced: true,
      createdInSlot: chosen.slot,
      email: chosen.email,
      resourceName: created?.resourceName || null,
    };
  } catch (e) {
    console.error('[SaveContactBot] Google contact sync failed:', e.response?.data || e.message);
    return { synced: false, reason: 'error', error: e.message };
  }
}

/**
 * Main entry from the webhook.
 */
async function handleInboundMessage({ from, waName, text, messageId }) {
  const matched = await findMatchingActiveProfile(text);

  // Log first so we always have a record of every inbound message.
  const logResult = await db.query(
    `INSERT INTO save_contact_bot_received_requests
        (profile_id, from_phone, from_wa_name, message_text, whatsapp_message_id, matched)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [matched?.id || null, from, waName || null, text || null, messageId || null, !!matched]
  );
  const requestId = logResult.rows[0].id;

  if (!matched) {
    console.log(`[SaveContactBot] no matching profile for text: ${JSON.stringify(text)}`);
    return { matched: false };
  }

  // Monthly usage gate: count unique contacts, enforce 500 limit without a card,
  // accumulate overage NIS, and send threshold warning emails.
  const gate = await usage.checkAndRecordInbound(matched.user_id, from);
  if (!gate.allow) {
    console.warn(`[SaveContactBot] BLOCKED — user ${matched.user_id}, phone ${from}, reason ${gate.reason}, count ${gate.uniqueCount}/${gate.limit}`);
    await db.query(
      `UPDATE save_contact_bot_received_requests SET matched = false WHERE id = $1`,
      [requestId]
    );
    return { matched: true, blocked: true, reason: gate.reason };
  }

  console.log(`[SaveContactBot] matched profile ${matched.id} (${matched.contact_name}) · month ${gate.uniqueCount}/${gate.limit} · hasCard=${gate.hasCard} · overage=${gate.overage.nis}₪ · sending → ${from}`);
  try {
    await executeSequence(matched, from, waName, messageId);

    // Sync to Google Contacts (best-effort, runs AFTER the sequence so a failure
    // here doesn't break the customer-facing experience).
    const sync = await syncToGoogleContacts(matched, from, waName);
    const action = sync.synced ? 'created' : (sync.reason === 'already_exists' ? 'preexisted' : null);
    if (action) {
      await db.query(
        `UPDATE save_contact_bot_received_requests
            SET google_contact_synced = true,
                google_contact_resource_name = $2,
                google_sync_action = $3
          WHERE id = $1`,
        [requestId, sync.resourceName || null, action]
      );
    }
    return { matched: true, profileId: matched.id, sync };
  } catch (e) {
    console.error(`[SaveContactBot] executeSequence failed:`, e.response?.data || e.message);
    return { matched: true, error: e.message };
  }
}

/**
 * Manually run Google sync for all unsynced matched requests of this user.
 * Returns { processed, created, skippedExisting, failed }.
 */
async function syncPendingToGoogle(userId) {
  const profile = await getProfileByUserId(userId);
  if (!profile) return { processed: 0, created: 0, skippedExisting: 0, failed: 0, reason: 'no_profile' };
  if (!profile.google_contacts_sync_enabled) return { processed: 0, created: 0, skippedExisting: 0, failed: 0, reason: 'disabled' };

  const { rows } = await db.query(
    `SELECT DISTINCT ON (from_phone) id, from_phone, from_wa_name
       FROM save_contact_bot_received_requests
      WHERE profile_id = $1 AND matched = true AND google_contact_synced = false
      ORDER BY from_phone, processed_at DESC`,
    [profile.id]
  );

  let created = 0, skippedExisting = 0, failed = 0;
  for (const r of rows) {
    const result = await syncToGoogleContacts(profile, r.from_phone, r.from_wa_name);
    if (result.synced) {
      created += 1;
      await db.query(
        `UPDATE save_contact_bot_received_requests
            SET google_contact_synced = true, google_contact_resource_name = $2, google_sync_action = 'created'
          WHERE profile_id = $1 AND from_phone = $3`,
        [profile.id, result.resourceName, r.from_phone]
      );
    } else if (result.reason === 'already_exists') {
      skippedExisting += 1;
      await db.query(
        `UPDATE save_contact_bot_received_requests
            SET google_contact_synced = true, google_contact_resource_name = $2, google_sync_action = 'preexisted'
          WHERE profile_id = $1 AND from_phone = $3`,
        [profile.id, result.resourceName || null, r.from_phone]
      );
    } else if (result.reason === 'error') {
      failed += 1;
    }
  }
  return { processed: rows.length, created, skippedExisting, failed };
}

/**
 * Produce a VCF (vCard 3.0) dump of all unique inbound contacts.
 */
async function buildVcfExport(userId) {
  const profile = await getProfileByUserId(userId);
  if (!profile) return '';
  const { rows } = await db.query(
    `SELECT DISTINCT ON (from_phone) from_phone,
            (SELECT from_wa_name FROM save_contact_bot_received_requests r2
              WHERE r2.profile_id = r.profile_id AND r2.from_phone = r.from_phone
              ORDER BY processed_at DESC LIMIT 1) AS name
       FROM save_contact_bot_received_requests r
      WHERE profile_id = $1
      ORDER BY from_phone, processed_at DESC`,
    [profile.id]
  );

  const esc = (v) => String(v || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const cards = rows.map((r) => {
    const name = r.name || r.from_phone;
    const phone = '+' + String(r.from_phone).replace(/\D/g, '');
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${esc(name)}`,
      `N:${esc(name)};;;;`,
      `TEL;TYPE=CELL:${phone}`,
      'END:VCARD',
    ].join('\r\n');
  });
  return cards.join('\r\n');
}

module.exports = {
  getProfileByUserId,
  getProfileById,
  listSequenceSteps,
  assembleSequence,
  upsertProfile,
  deleteProfile,
  generateOrRefreshLink,
  addSequenceStep,
  updateSequenceStep,
  deleteSequenceStep,
  reorderSequenceSteps,
  reorderUnified,
  deleteWelcome,
  restoreDefaultWelcome,
  listReceivedRequests,
  listRequestsByPhone,
  handleInboundMessage,
  syncPendingToGoogle,
  buildVcfExport,
  normalizePhoneIL,
  DEFAULT_WELCOME_MESSAGE,
  SAVED_CONTACTS_LABEL,
  MAX_CUSTOM_STEPS,
};
