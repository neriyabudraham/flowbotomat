const pool = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────
// Contact Cleanup — non-viewers list, advanced filtering, keep-list,
// safe backups, and audit-logged bulk delete.
//
// Safety invariants:
//   • All queries are scoped by user_id.
//   • Bulk delete REQUIRES a fresh backup (id + recency check) and an
//     explicit confirmation phrase.
//   • Keep-list rows are never deleted by cleanup, even if filters match.
//   • Backups capture contacts + variables + tag-assignments + tag definitions.
// ─────────────────────────────────────────────────────────────────────

const BACKUP_FRESH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BACKUPS_PER_USER = 50;

/**
 * Build the WHERE clause and params for non-viewer cleanup queries.
 *
 * Filters supported:
 *   - search (string, matches phone OR display_name)
 *   - includeName / excludeName (substring on display_name)
 *   - includePhone / excludePhone (substring on phone)
 *   - tagIds (array of UUIDs — contact must have at least one)
 *   - excludeTagIds (array — contact must NOT have any)
 *   - phonePrefix (e.g. "972")
 *   - hasName (true/false) — contacts with/without display_name
 *   - hasMessages (true/false) — contacts with/without any messages
 *   - createdBefore / createdAfter (ISO date)
 *   - lastMessageBefore / lastMessageAfter (ISO date or 'never')
 *   - includeBlocked (default false — block contacts hidden by default)
 *   - includeKept (default false — keep-list hidden by default)
 *   - viewerScope: 'non_viewers' (default), 'all', 'viewers_only'
 */
// A "valid" contact phone is a clean 7-15 digit number that isn't a known
// WhatsApp internal identifier (group LIDs, newsletter IDs, etc.).
// Examples of INVALID:
//   • '120363xxx@g.us'   — group JIDs with suffix
//   • '120363xxx'        — group LIDs stored without suffix
//   • '120363xxx@newsletter' — newsletter channels
//   • anything with letters, '@', '-', length > 15
const VALID_PHONE_SQL = `(c.phone ~ '^[0-9]{7,15}$' AND c.phone NOT LIKE '120363%')`;

function buildFilterSQL(userId, q) {
  const params = [userId];
  let i = 2;
  const where = ['c.user_id = $1'];

  // Validity scope — default 'valid' (only real-looking phone numbers).
  // 'invalid' = only the bad ones (groups, internal IDs, garbage).
  // 'all'     = no validity filter.
  const validity = q.validityScope || 'valid';
  if (validity === 'valid') {
    where.push(VALID_PHONE_SQL);
  } else if (validity === 'invalid') {
    where.push(`NOT ${VALID_PHONE_SQL}`);
  }

  // Viewer scope — default is non-viewers (the whole point of this page)
  const scope = q.viewerScope || 'non_viewers';
  if (scope === 'non_viewers') {
    where.push(`NOT EXISTS (
      SELECT 1
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1 AND sbv.viewer_phone = c.phone
    )`);
  } else if (scope === 'viewers_only') {
    where.push(`EXISTS (
      SELECT 1
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1 AND sbv.viewer_phone = c.phone
    )`);
  }

  if (!q.includeKept) {
    where.push(`NOT EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = $1 AND k.phone = c.phone)`);
  }

  if (!q.includeBlocked) {
    where.push(`COALESCE(c.is_blocked, false) = false`);
  }

  if (q.search) {
    where.push(`(c.display_name ILIKE $${i} OR c.phone ILIKE $${i})`);
    params.push(`%${q.search}%`); i++;
  }
  if (q.includeName) {
    where.push(`c.display_name ILIKE $${i}`); params.push(`%${q.includeName}%`); i++;
  }
  if (q.excludeName) {
    where.push(`(c.display_name IS NULL OR c.display_name NOT ILIKE $${i})`); params.push(`%${q.excludeName}%`); i++;
  }
  if (q.includePhone) {
    where.push(`c.phone ILIKE $${i}`); params.push(`%${q.includePhone}%`); i++;
  }
  if (q.excludePhone) {
    where.push(`c.phone NOT ILIKE $${i}`); params.push(`%${q.excludePhone}%`); i++;
  }
  if (q.phonePrefix) {
    where.push(`c.phone LIKE $${i}`); params.push(`${String(q.phonePrefix).replace(/[^0-9]/g, '')}%`); i++;
  }
  if (q.hasName === true || q.hasName === 'true') {
    where.push(`c.display_name IS NOT NULL AND c.display_name <> ''`);
  } else if (q.hasName === false || q.hasName === 'false') {
    where.push(`(c.display_name IS NULL OR c.display_name = '')`);
  }
  if (q.hasMessages === true || q.hasMessages === 'true') {
    where.push(`EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id)`);
  } else if (q.hasMessages === false || q.hasMessages === 'false') {
    where.push(`NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id)`);
  }
  if (q.createdBefore) {
    where.push(`c.created_at < $${i}`); params.push(q.createdBefore); i++;
  }
  if (q.createdAfter) {
    where.push(`c.created_at >= $${i}`); params.push(q.createdAfter); i++;
  }
  if (q.lastMessageBefore === 'never') {
    where.push(`c.last_message_at IS NULL`);
  } else if (q.lastMessageBefore) {
    where.push(`(c.last_message_at IS NULL OR c.last_message_at < $${i})`); params.push(q.lastMessageBefore); i++;
  }
  if (q.lastMessageAfter) {
    where.push(`c.last_message_at >= $${i}`); params.push(q.lastMessageAfter); i++;
  }
  if (Array.isArray(q.tagIds) && q.tagIds.length) {
    where.push(`EXISTS (
      SELECT 1 FROM contact_tag_assignments cta
      WHERE cta.contact_id = c.id AND cta.tag_id = ANY($${i}::uuid[])
    )`);
    params.push(q.tagIds); i++;
  }
  if (Array.isArray(q.excludeTagIds) && q.excludeTagIds.length) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM contact_tag_assignments cta
      WHERE cta.contact_id = c.id AND cta.tag_id = ANY($${i}::uuid[])
    )`);
    params.push(q.excludeTagIds); i++;
  }

  return { where: where.join(' AND '), params, nextIndex: i };
}

function normalizeFilters(body) {
  const f = body?.filters || body || {};
  const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  return {
    viewerScope: f.viewerScope,
    validityScope: f.validityScope || 'valid',
    search: f.search?.trim() || '',
    includeName: f.includeName?.trim() || '',
    excludeName: f.excludeName?.trim() || '',
    includePhone: f.includePhone?.trim() || '',
    excludePhone: f.excludePhone?.trim() || '',
    phonePrefix: f.phonePrefix?.trim() || '',
    hasName: f.hasName,
    hasMessages: f.hasMessages,
    createdBefore: f.createdBefore || null,
    createdAfter: f.createdAfter || null,
    lastMessageBefore: f.lastMessageBefore || null,
    lastMessageAfter: f.lastMessageAfter || null,
    tagIds: arr(f.tagIds),
    excludeTagIds: arr(f.excludeTagIds),
    includeKept: !!f.includeKept,
    includeBlocked: !!f.includeBlocked,
  };
}

// ─── LIST ────────────────────────────────────────────────────────────

async function listCleanupContacts(req, res) {
  try {
    const userId = req.user.id;
    const filters = normalizeFilters(req.body);
    const page = Math.max(1, parseInt(req.body?.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.body?.limit) || 100));
    const offset = (page - 1) * limit;
    const sortBy = ['display_name', 'phone', 'created_at', 'last_message_at'].includes(req.body?.sortBy)
      ? req.body.sortBy : 'created_at';
    const sortDir = req.body?.sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const { where, params, nextIndex } = buildFilterSQL(userId, filters);

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT
        c.id, c.phone, c.display_name, c.is_blocked, c.is_bot_active,
        c.created_at, c.last_message_at,
        EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = $1 AND k.phone = c.phone) AS is_kept,
        (SELECT COUNT(*)::int FROM messages m WHERE m.contact_id = c.id) AS message_count,
        COALESCE(
          (SELECT array_agg(t.name ORDER BY t.name)
           FROM contact_tags t
           JOIN contact_tag_assignments cta ON t.id = cta.tag_id
           WHERE cta.contact_id = c.id),
          ARRAY[]::text[]
        ) AS tags
      FROM contacts c
      WHERE ${where}
      ORDER BY c.${sortBy} ${sortDir} NULLS LAST, c.id ASC
      LIMIT $${nextIndex} OFFSET $${nextIndex + 1}
    `;

    const countSql = `SELECT COUNT(*)::int AS total FROM contacts c WHERE ${where}`;

    const [data, count] = await Promise.all([
      pool.query(dataSql, dataParams),
      pool.query(countSql, params),
    ]);

    res.json({
      contacts: data.rows,
      total: count.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error('[Cleanup] listCleanupContacts error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת רשימת הניקוי' });
  }
}

// Quick stats summary (totals for the cleanup dashboard)
async function getCleanupStats(req, res) {
  try {
    const userId = req.user.id;

    // Inline the valid-phone predicate without the table alias for the stats CTEs
    const VALID = `(phone ~ '^[0-9]{7,15}$' AND phone NOT LIKE '120363%')`;
    const sql = `
      WITH viewer_phones AS (
        SELECT DISTINCT sbv.viewer_phone AS phone
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
      )
      SELECT
        (SELECT COUNT(*)::int FROM contacts WHERE user_id = $1
           AND ${VALID}) AS total_contacts,
        (SELECT COUNT(*)::int FROM contacts WHERE user_id = $1
           AND ${VALID}
           AND phone IN (SELECT phone FROM viewer_phones)) AS viewers,
        (SELECT COUNT(*)::int FROM contacts WHERE user_id = $1
           AND ${VALID}
           AND phone NOT IN (SELECT phone FROM viewer_phones)) AS non_viewers,
        (SELECT COUNT(*)::int FROM contacts WHERE user_id = $1
           AND NOT ${VALID}) AS invalid_contacts,
        (SELECT COUNT(*)::int FROM contact_keep_list WHERE user_id = $1) AS kept,
        (SELECT COUNT(*)::int FROM contact_backups WHERE user_id = $1) AS backups,
        (SELECT MAX(created_at) FROM contact_backups WHERE user_id = $1) AS latest_backup_at
    `;
    const { rows } = await pool.query(sql, [userId]);
    res.json({ stats: rows[0] });
  } catch (err) {
    console.error('[Cleanup] getCleanupStats error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

// Resolve a filter into an array of contact IDs (for preview / delete planning).
async function previewSelection(req, res) {
  try {
    const userId = req.user.id;
    const filters = normalizeFilters(req.body);
    const excludeIds = Array.isArray(req.body?.excludeIds) ? req.body.excludeIds : [];

    const { where, params, nextIndex } = buildFilterSQL(userId, filters);

    let sql = `
      SELECT c.id, c.phone, c.display_name
      FROM contacts c
      WHERE ${where}
    `;
    const finalParams = [...params];
    if (excludeIds.length) {
      sql += ` AND c.id <> ALL($${nextIndex}::uuid[])`;
      finalParams.push(excludeIds);
    }
    sql += ` ORDER BY c.display_name NULLS LAST, c.phone LIMIT 5000`;

    const { rows } = await pool.query(sql, finalParams);
    res.json({ contacts: rows, total: rows.length });
  } catch (err) {
    console.error('[Cleanup] previewSelection error:', err);
    res.status(500).json({ error: 'שגיאה בתצוגה מקדימה' });
  }
}

// ─── KEEP LIST ───────────────────────────────────────────────────────

async function listKeepList(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT k.id, k.phone, k.note, k.created_at,
              c.id AS contact_id, c.display_name
       FROM contact_keep_list k
       LEFT JOIN contacts c ON c.user_id = k.user_id AND c.phone = k.phone
       WHERE k.user_id = $1
       ORDER BY k.created_at DESC`,
      [userId]
    );
    res.json({ kept: rows, total: rows.length });
  } catch (err) {
    console.error('[Cleanup] listKeepList error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הרשימה השמורה' });
  }
}

async function addToKeepList(req, res) {
  try {
    const userId = req.user.id;
    const phones = Array.isArray(req.body?.phones) ? req.body.phones : (req.body?.phone ? [req.body.phone] : []);
    const note = req.body?.note || null;
    if (phones.length === 0) return res.status(400).json({ error: 'נדרש מספר טלפון' });

    // Be permissive by default — accept any non-empty value the user sent,
    // stripping only clearly-decorative chars. The user already went through
    // a preview step; if they confirmed, we trust their choice.
    const cleaned = phones
      .map(p => String(p ?? '').trim().replace(/[\s()]+/g, ''))
      .filter(p => p.length > 0 && /\d/.test(p)); // must contain at least one digit

    if (cleaned.length === 0) {
      return res.status(400).json({
        error: 'לא נמצאו מספרי טלפון תקפים לשמירה',
      });
    }

    let added = 0;
    let skipped = 0;
    const skippedSamples = [];
    for (const phone of cleaned) {
      try {
        const r = await pool.query(
          `INSERT INTO contact_keep_list (user_id, phone, note)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, phone) DO UPDATE SET note = COALESCE(EXCLUDED.note, contact_keep_list.note)
           RETURNING id`,
          [userId, phone, note]
        );
        if (r.rows.length) added++;
      } catch (rowErr) {
        skipped++;
        if (skippedSamples.length < 5) skippedSamples.push(phone);
        console.warn(`[Cleanup] keep-list insert skipped "${phone}": ${rowErr.message}`);
      }
    }
    res.json({ success: true, added, skipped, skippedSamples });
  } catch (err) {
    console.error('[Cleanup] addToKeepList error:', err);
    res.status(500).json({ error: 'שגיאה בהוספה לרשימה השמורה' });
  }
}

async function removeFromKeepList(req, res) {
  try {
    const userId = req.user.id;
    const phones = Array.isArray(req.body?.phones) ? req.body.phones : (req.body?.phone ? [req.body.phone] : []);
    if (phones.length === 0) return res.status(400).json({ error: 'נדרש מספר טלפון' });
    const cleaned = phones.map(p => String(p).replace(/[^\d]/g, ''));
    const r = await pool.query(
      `DELETE FROM contact_keep_list WHERE user_id = $1 AND phone = ANY($2) RETURNING id`,
      [userId, cleaned]
    );
    res.json({ success: true, removed: r.rows.length });
  } catch (err) {
    console.error('[Cleanup] removeFromKeepList error:', err);
    res.status(500).json({ error: 'שגיאה בהסרה מהרשימה השמורה' });
  }
}

// ─── BACKUPS ─────────────────────────────────────────────────────────

async function buildBackupPayload(userId, contactIds = null) {
  // contactIds === null means: backup ALL of user's contacts
  const params = [userId];
  let where = `c.user_id = $1`;
  if (Array.isArray(contactIds) && contactIds.length) {
    where += ` AND c.id = ANY($2::uuid[])`;
    params.push(contactIds);
  }

  const contactsRes = await pool.query(`
    SELECT c.id, c.phone, c.wa_id, c.display_name, c.profile_picture_url,
           c.is_bot_active, c.is_blocked, c.is_archived,
           c.first_contact_at, c.last_message_at, c.created_at, c.updated_at
    FROM contacts c WHERE ${where} ORDER BY c.created_at ASC
  `, params);
  const contacts = contactsRes.rows;
  const ids = contacts.map(c => c.id);

  let variables = [], assignments = [];
  if (ids.length) {
    const v = await pool.query(
      `SELECT contact_id, key, value FROM contact_variables WHERE contact_id = ANY($1::uuid[])`,
      [ids]
    );
    variables = v.rows;
    const a = await pool.query(
      `SELECT contact_id, tag_id FROM contact_tag_assignments WHERE contact_id = ANY($1::uuid[])`,
      [ids]
    );
    assignments = a.rows;
  }

  const tagsRes = await pool.query(
    `SELECT id, name, color FROM contact_tags WHERE user_id = $1`,
    [userId]
  );

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    contacts,
    variables,
    tag_assignments: assignments,
    tags: tagsRes.rows,
  };
}

async function createBackup(req, res) {
  try {
    const userId = req.user.id;
    const label = req.body?.label?.trim() || null;
    const reason = ['manual', 'pre_delete', 'auto'].includes(req.body?.reason) ? req.body.reason : 'manual';
    const contactIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds : null;

    const payload = await buildBackupPayload(userId, contactIds);
    const sizeBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');

    const ins = await pool.query(
      `INSERT INTO contact_backups (user_id, label, reason, contact_count, payload, size_bytes)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, label, reason, contact_count, size_bytes, created_at`,
      [userId, label, reason, payload.contacts.length, JSON.stringify(payload), sizeBytes]
    );

    // Cap retention — drop oldest beyond MAX_BACKUPS_PER_USER
    await pool.query(
      `DELETE FROM contact_backups
       WHERE id IN (
         SELECT id FROM contact_backups WHERE user_id = $1
         ORDER BY created_at DESC OFFSET $2
       )`,
      [userId, MAX_BACKUPS_PER_USER]
    );

    res.json({ success: true, backup: ins.rows[0] });
  } catch (err) {
    console.error('[Cleanup] createBackup error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת גיבוי' });
  }
}

async function listBackups(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, label, reason, contact_count, size_bytes, created_at
       FROM contact_backups WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );
    res.json({ backups: rows });
  } catch (err) {
    console.error('[Cleanup] listBackups error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת גיבויים' });
  }
}

async function downloadBackup(req, res) {
  try {
    const userId = req.user.id;
    const { backupId } = req.params;
    const { rows } = await pool.query(
      `SELECT label, payload, created_at FROM contact_backups WHERE id = $1 AND user_id = $2`,
      [backupId, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'גיבוי לא נמצא' });

    const ts = new Date(rows[0].created_at).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=flowbotomat-contacts-backup-${ts}.json`);
    res.send(JSON.stringify(rows[0].payload, null, 2));
  } catch (err) {
    console.error('[Cleanup] downloadBackup error:', err);
    res.status(500).json({ error: 'שגיאה בהורדת גיבוי' });
  }
}

async function deleteBackup(req, res) {
  try {
    const userId = req.user.id;
    const { backupId } = req.params;
    const r = await pool.query(
      `DELETE FROM contact_backups WHERE id = $1 AND user_id = $2 RETURNING id`,
      [backupId, userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'גיבוי לא נמצא' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Cleanup] deleteBackup error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת גיבוי' });
  }
}

// Restore from a stored backup OR an uploaded payload.
// Modes: 'merge' (default) — upsert by phone, won't delete anything.
//        'restore_missing' — only re-create contacts that no longer exist.
async function restoreBackup(req, res) {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const mode = ['merge', 'restore_missing'].includes(req.body?.mode) ? req.body.mode : 'merge';
    let payload = req.body?.payload || null;

    if (!payload && req.body?.backupId) {
      const { rows } = await client.query(
        `SELECT payload FROM contact_backups WHERE id = $1 AND user_id = $2`,
        [req.body.backupId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'גיבוי לא נמצא' });
      payload = rows[0].payload;
    }
    if (!payload?.contacts || !Array.isArray(payload.contacts)) {
      return res.status(400).json({ error: 'מבנה גיבוי לא תקין' });
    }

    await client.query('BEGIN');

    // Map: backup_contact_id -> new_or_existing_contact_id (within target user)
    const idMap = new Map();
    let restored = 0, skipped = 0, updated = 0;

    for (const c of payload.contacts) {
      const phone = String(c.phone || '').replace(/[^\d]/g, '');
      if (!phone) { skipped++; continue; }

      const existing = await client.query(
        `SELECT id FROM contacts WHERE user_id = $1 AND phone = $2`,
        [userId, phone]
      );

      if (existing.rows.length) {
        if (mode === 'restore_missing') {
          idMap.set(c.id, existing.rows[0].id);
          skipped++;
          continue;
        }
        const upd = await client.query(
          `UPDATE contacts SET
             display_name = COALESCE(NULLIF($3, ''), display_name),
             wa_id = COALESCE($4, wa_id),
             profile_picture_url = COALESCE($5, profile_picture_url),
             updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING id`,
          [existing.rows[0].id, userId, c.display_name || '', c.wa_id || null, c.profile_picture_url || null]
        );
        idMap.set(c.id, upd.rows[0].id);
        updated++;
      } else {
        const ins = await client.query(
          `INSERT INTO contacts
             (user_id, phone, wa_id, display_name, profile_picture_url,
              is_bot_active, is_blocked, first_contact_at, last_message_at, created_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), COALESCE($7, false),
                   COALESCE($8::timestamptz, NOW()), $9::timestamptz, NOW())
           ON CONFLICT (user_id, phone) DO UPDATE SET
             display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), contacts.display_name)
           RETURNING id`,
          [userId, phone, c.wa_id || null, c.display_name || null, c.profile_picture_url || null,
           c.is_bot_active, c.is_blocked, c.first_contact_at || null, c.last_message_at || null]
        );
        idMap.set(c.id, ins.rows[0].id);
        restored++;
      }
    }

    // Restore variables
    if (Array.isArray(payload.variables)) {
      for (const v of payload.variables) {
        const newId = idMap.get(v.contact_id);
        if (!newId || !v.key) continue;
        await client.query(
          `INSERT INTO contact_variables (contact_id, key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (contact_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [newId, v.key, v.value]
        );
      }
    }

    // Restore tag assignments — re-create tag definitions if missing
    if (Array.isArray(payload.tags) && Array.isArray(payload.tag_assignments)) {
      const tagIdMap = new Map();
      for (const t of payload.tags) {
        if (!t.name) continue;
        const r = await client.query(
          `INSERT INTO contact_tags (user_id, name, color)
           VALUES ($1, $2, COALESCE($3, '#3B82F6'))
           ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
           RETURNING id`,
          [userId, t.name, t.color]
        );
        tagIdMap.set(t.id, r.rows[0].id);
      }
      for (const a of payload.tag_assignments) {
        const newContactId = idMap.get(a.contact_id);
        const newTagId = tagIdMap.get(a.tag_id);
        if (!newContactId || !newTagId) continue;
        await client.query(
          `INSERT INTO contact_tag_assignments (contact_id, tag_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newContactId, newTagId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, restored, updated, skipped, mode });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Cleanup] restoreBackup error:', err);
    res.status(500).json({ error: 'שגיאה בשחזור גיבוי' });
  } finally {
    client.release();
  }
}

// ─── SAFE BULK DELETE ────────────────────────────────────────────────

async function safeBulkDelete(req, res) {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const {
      contactIds,         // explicit list selected by the user
      backupId,           // required: id of fresh backup
      confirmation,       // required: must equal expectedConfirmation
      expectedConfirmation, // sent by client so server can echo-check
    } = req.body || {};

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: 'לא נבחרו אנשי קשר למחיקה' });
    }
    if (contactIds.length > 50000) {
      return res.status(400).json({ error: 'יותר מדי אנשי קשר במחיקה אחת (מקסימום 50,000)' });
    }
    if (!backupId) {
      return res.status(400).json({ error: 'נדרש מזהה גיבוי טרי לפני המחיקה' });
    }
    if (!confirmation || !expectedConfirmation || confirmation !== expectedConfirmation) {
      return res.status(400).json({ error: 'אישור המחיקה אינו תואם — הקלד את ביטוי האישור במדויק' });
    }

    // Verify backup belongs to user, is fresh, and covers the contacts being deleted
    const bk = await client.query(
      `SELECT id, payload, created_at, contact_count FROM contact_backups
       WHERE id = $1 AND user_id = $2`,
      [backupId, userId]
    );
    if (!bk.rows.length) {
      return res.status(400).json({ error: 'גיבוי לא נמצא' });
    }
    const ageMs = Date.now() - new Date(bk.rows[0].created_at).getTime();
    if (ageMs > BACKUP_FRESH_WINDOW_MS) {
      return res.status(400).json({
        error: `הגיבוי ישן מדי (יותר מ-${Math.floor(BACKUP_FRESH_WINDOW_MS / 60000)} דקות). צור גיבוי חדש לפני המחיקה.`,
      });
    }
    const backupPhones = new Set(
      (bk.rows[0].payload?.contacts || []).map(c => String(c.phone))
    );

    await client.query('BEGIN');

    // Lock and load the contacts that will be deleted — verify ownership + keep-list
    const targets = await client.query(
      `SELECT c.id, c.phone, c.display_name,
              EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = c.user_id AND k.phone = c.phone) AS is_kept
       FROM contacts c
       WHERE c.id = ANY($1::uuid[]) AND c.user_id = $2
       FOR UPDATE`,
      [contactIds, userId]
    );

    const ownedIds = [];
    const skippedKept = [];
    const missingFromBackup = [];
    for (const row of targets.rows) {
      if (row.is_kept) { skippedKept.push(row); continue; }
      if (!backupPhones.has(String(row.phone))) {
        missingFromBackup.push(row);
        continue;
      }
      ownedIds.push(row.id);
    }

    if (missingFromBackup.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `${missingFromBackup.length} אנשי קשר אינם מכוסים בגיבוי הנוכחי. צור גיבוי חדש לפני שתמשיך.`,
        missingFromBackup: missingFromBackup.slice(0, 10),
      });
    }

    if (ownedIds.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, deletedCount: 0, skippedKept: skippedKept.length });
    }

    const del = await client.query(
      `DELETE FROM contacts WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id, phone`,
      [ownedIds, userId]
    );

    await client.query(
      `INSERT INTO contact_deletion_log
         (user_id, backup_id, deleted_count, filter_summary, deleted_phones)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        userId,
        backupId,
        del.rows.length,
        JSON.stringify(req.body?.filterSummary || null),
        JSON.stringify(del.rows.map(r => r.phone)),
      ]
    );

    await client.query('COMMIT');

    console.log(`[Cleanup] Safe-deleted ${del.rows.length} contacts for user ${userId} (backup=${backupId})`);
    res.json({
      success: true,
      deletedCount: del.rows.length,
      skippedKept: skippedKept.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Cleanup] safeBulkDelete error:', err);
    res.status(500).json({ error: 'שגיאה במחיקה מאובטחת' });
  } finally {
    client.release();
  }
}

// ─── KEEP-LIST FILE IMPORT (CSV / VCF / vCard / TXT / JSON) ──────────

// Normalize a raw phone to digits-only, with Israeli leading-0 handling.
// Returns '' if the cleaned value has no digits at all (i.e. clearly not a phone).
// If allowInvalid=true, returns whatever cleaned digits we have even if length is out of range.
function normalizePhone(raw, allowInvalid = false) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/\D/g, '');
  if (/^0\d{8,9}$/.test(s)) s = '972' + s.slice(1);
  s = s.replace(/^0+/, '');
  if (!s) return '';
  if (allowInvalid) return s;
  if (s.length < 7 || s.length > 15) return '';
  return s;
}

// Tag a parsed value as valid (clean phone shape) or invalid (kept as-is so user
// can decide whether to save it anyway).
function tagPhone(raw) {
  const clean = normalizePhone(raw, true); // always returns whatever digits we find
  if (!clean) return null; // truly empty — skip
  const valid = clean.length >= 7 && clean.length <= 15;
  return { phone: clean, valid, raw: String(raw || '').trim() };
}

// Extract contacts from a vCard 2.1/3.0/4.0 buffer.
// Returns { phone, name, valid, raw } — invalid phones are preserved.
function parseVCard(text) {
  const out = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split(/BEGIN:VCARD/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/END:VCARD/i)[0] || '';
    const lines = body.split(/\r?\n/);
    let name = '';
    const phones = [];
    for (const line of lines) {
      const m = line.match(/^([A-Z][^:;]*)((?:;[^:]+)*):(.*)$/i);
      if (!m) continue;
      const prop = m[1].toUpperCase();
      const value = (m[3] || '').trim();
      if (!value) continue;
      if (prop === 'FN') name = name || value;
      else if (prop === 'N' && !name) name = value.split(';').filter(Boolean).reverse().join(' ').trim();
      else if (prop === 'TEL') phones.push(value);
    }
    for (const p of phones) {
      const tagged = tagPhone(p);
      if (tagged) out.push({ ...tagged, name });
    }
  }
  return out;
}

// Parse a CSV — best-effort. Handles quoted fields and commas/semicolons/tabs.
function parseCSV(text) {
  const out = [];
  // Strip BOM
  let s = text.replace(/^\uFEFF/, '');
  // Detect delimiter: prefer comma, fall back to semicolon or tab
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const rows = [];
  let cur = ''; let row = []; let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  if (rows.length === 0) return out;

  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const phoneCols = [];
  let nameCol = -1;
  header.forEach((h, idx) => {
    if (/(phone|tel|mobile|cell|טלפון|נייד|מספר)/i.test(h)) phoneCols.push(idx);
    if (nameCol < 0 && /(name|fullname|contact|שם)/i.test(h)) nameCol = idx;
  });

  // If we couldn't detect a phone column, scan ALL cells for phone-shaped values
  const startRow = phoneCols.length ? 1 : 0;
  if (!phoneCols.length) {
    for (let r = startRow; r < rows.length; r++) {
      for (const cell of rows[r]) {
        const tagged = tagPhone(cell);
        // When scanning all cells (no header), only include VALID phones — otherwise
        // every numeric-ish cell (dates, ids, etc.) would pollute the list.
        if (tagged && tagged.valid) out.push({ ...tagged, name: '' });
      }
    }
    return out;
  }

  for (let r = startRow; r < rows.length; r++) {
    const row2 = rows[r];
    const name = nameCol >= 0 ? String(row2[nameCol] || '').trim() : '';
    for (const c of phoneCols) {
      const tagged = tagPhone(row2[c]);
      if (tagged) out.push({ ...tagged, name });
    }
  }
  return out;
}

// Last-resort parser — extract every phone-shaped token from raw text.
// Includes "invalid-looking" tokens (e.g. 5 digits, 17 digits) tagged accordingly.
function parseRawText(text) {
  const out = [];
  const seen = new Set();
  const re = /\+?[0-9][0-9 ()\-]{4,20}[0-9]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tagged = tagPhone(m[0]);
    if (tagged && !seen.has(tagged.phone)) {
      seen.add(tagged.phone);
      out.push({ ...tagged, name: '' });
    }
  }
  return out;
}

function parseContactsFile(filename, buffer) {
  const text = buffer.toString('utf8');
  const lower = (filename || '').toLowerCase();

  let parsed = [];
  if (lower.endsWith('.vcf') || lower.endsWith('.vcard') || /BEGIN:VCARD/i.test(text)) {
    parsed = parseVCard(text);
  } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    parsed = parseCSV(text);
  } else if (lower.endsWith('.json')) {
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : (Array.isArray(j.contacts) ? j.contacts : []);
      for (const item of arr) {
        const raw = item.phone || item.tel || item.mobile || item.number;
        const tagged = tagPhone(raw);
        if (tagged) parsed.push({ ...tagged, name: item.name || item.display_name || item.fullname || '' });
      }
    } catch { parsed = parseRawText(text); }
  } else {
    parsed = parseCSV(text);
    if (parsed.length === 0) parsed = parseRawText(text);
  }

  // Deduplicate by phone, prefer entries with names + entries marked valid
  const map = new Map();
  for (const p of parsed) {
    if (!p.phone) continue;
    const existing = map.get(p.phone);
    if (!existing) { map.set(p.phone, p); continue; }
    // Prefer valid over invalid, then entry with a name
    if (!existing.valid && p.valid) { map.set(p.phone, p); continue; }
    if (!existing.name && p.name) { map.set(p.phone, p); }
  }
  return Array.from(map.values());
}

async function importKeepListFile(req, res) {
  try {
    const userId = req.user.id;
    if (!req.file) return res.status(400).json({ error: 'לא הועלה קובץ' });

    const parsed = parseContactsFile(req.file.originalname, req.file.buffer);
    if (parsed.length === 0) {
      return res.status(400).json({
        error: 'לא נמצאו מספרי טלפון בקובץ. ודא שהפורמט הוא CSV / VCF / vCard / JSON עם עמודת טלפון.',
      });
    }

    const phones = parsed.map(p => p.phone);

    // Cross-reference with user's existing contacts and keep-list
    const existingContactsRes = await pool.query(
      `SELECT phone, display_name FROM contacts WHERE user_id = $1 AND phone = ANY($2)`,
      [userId, phones]
    );
    const existingMap = new Map(existingContactsRes.rows.map(r => [r.phone, r.display_name]));

    const existingKeepRes = await pool.query(
      `SELECT phone FROM contact_keep_list WHERE user_id = $1 AND phone = ANY($2)`,
      [userId, phones]
    );
    const keptSet = new Set(existingKeepRes.rows.map(r => r.phone));

    const items = parsed.map(p => ({
      phone: p.phone,
      raw_phone: p.raw || p.phone,
      name: p.name || existingMap.get(p.phone) || '',
      valid: p.valid !== false,
      matches_contact: existingMap.has(p.phone),
      already_kept: keptSet.has(p.phone),
    }));

    // Default behavior: dryRun=true returns preview only.
    // Pass dryRun=false to actually insert.
    const dryRun = req.body?.dryRun !== 'false';
    if (dryRun) {
      return res.json({
        preview: true,
        parsedCount: items.length,
        validCount: items.filter(i => i.valid).length,
        invalidCount: items.filter(i => !i.valid).length,
        matchedCount: items.filter(i => i.matches_contact).length,
        unmatchedCount: items.filter(i => !i.matches_contact).length,
        alreadyKeptCount: items.filter(i => i.already_kept).length,
        items: items.slice(0, 5000),
      });
    }

    // Actual insert (also called by the confirm flow via JSON path below)
    let added = 0;
    for (const it of items) {
      const r = await pool.query(
        `INSERT INTO contact_keep_list (user_id, phone, note)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, phone) DO NOTHING
         RETURNING id`,
        [userId, it.phone, it.name ? `מקובץ: ${it.name}` : null]
      );
      if (r.rows.length) added++;
    }
    res.json({ success: true, added, parsedCount: items.length });
  } catch (err) {
    console.error('[Cleanup] importKeepListFile error:', err);
    res.status(500).json({ error: 'שגיאה בייבוא הקובץ' });
  }
}

async function getDeletionLog(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT l.id, l.deleted_count, l.created_at, l.filter_summary,
              b.id AS backup_id, b.label AS backup_label, b.created_at AS backup_created_at
       FROM contact_deletion_log l
       LEFT JOIN contact_backups b ON b.id = l.backup_id
       WHERE l.user_id = $1
       ORDER BY l.created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ log: rows });
  } catch (err) {
    console.error('[Cleanup] getDeletionLog error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית מחיקות' });
  }
}

module.exports = {
  listCleanupContacts,
  getCleanupStats,
  previewSelection,
  listKeepList,
  addToKeepList,
  removeFromKeepList,
  createBackup,
  listBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  safeBulkDelete,
  getDeletionLog,
  importKeepListFile,
  BACKUP_FRESH_WINDOW_MS,
};
