const pool = require('../../config/database');
const { google } = require('googleapis');
const googleService = require('../../services/googleContacts.service');
const { compileRule } = require('../../services/statusBot/ruleCompiler.service');

// Field map exposed to the rule compiler. Keeps the public rule schema
// decoupled from actual column/expression names.
const GOOGLE_RULE_FIELDS = {
  display_name:         { expr: `gc.display_name`,          type: 'text' },
  primary_phone:        { expr: `gc.primary_phone`,         type: 'text' },
  phone_normalized:     { expr: `gc.phone_normalized`,      type: 'text' },
  email:                { expr: `COALESCE((gc.emails->>0), '')`, type: 'text' },
  labels:               { expr: `gc.label_resource_names`,  type: 'array_jsonb' },
  slot:                 { expr: `gc.slot`,                  type: 'number' },
  account_email:        { expr: `ui.account_email`,         type: 'text' },
  is_viewer:            { expr: `is_viewer_calc`,           type: 'boolean' },
  is_kept:              { expr: `is_kept_calc`,             type: 'boolean' },
  is_valid_phone:       { expr: `(gc.phone_normalized ~ '^[0-9]{7,15}$' AND gc.phone_normalized NOT LIKE '120363%')`, type: 'boolean' },
};

// ─────────────────────────────────────────────────────────────────────
// Google Contacts Cleanup
//
// Reads contacts from connected Google accounts (per slot) into a local
// cache, lets the user filter / mark important / safely delete from
// Google with mandatory backup. All destructive ops are slot-scoped.
//
// Safety invariants:
//   • Every query is scoped by (user_id, slot).
//   • Bulk delete REQUIRES a fresh backup whose payload covers the
//     resourceNames being deleted, plus a typed confirmation phrase.
//   • Keep-list (shared with local cleanup) is honored — kept phones
//     are skipped from delete.
//   • Backup payload preserves the full Google `person` object so the
//     contact can be re-created (best-effort) via createContact.
// ─────────────────────────────────────────────────────────────────────

const BACKUP_FRESH_WINDOW_MS = 30 * 60 * 1000;
const MAX_BACKUPS_PER_USER = 30;
const PEOPLE_API_PAGE_SIZE = 1000;
const PEOPLE_API_FIELDS = 'names,phoneNumbers,emailAddresses,memberships,metadata,biographies,organizations';
const VALID_PHONE_RE = /^[0-9]{7,15}$/;

function normalizePhone(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/\D/g, '');
  if (/^0\d{8,9}$/.test(s)) s = '972' + s.slice(1);
  s = s.replace(/^0+/, '');
  return s;
}

function flattenPerson(person) {
  if (!person) return null;
  const names = person.names || [];
  const phones = person.phoneNumbers || [];
  const emails = person.emailAddresses || [];
  const memberships = person.memberships || [];

  const primaryName = names[0] || {};
  const display =
    primaryName.displayName ||
    [primaryName.givenName, primaryName.familyName].filter(Boolean).join(' ').trim() ||
    '';

  const phoneValues = phones.map(p => p.value).filter(Boolean);
  const primaryPhone = phoneValues[0] || '';
  const phoneNorm = normalizePhone(primaryPhone);

  return {
    resourceName: person.resourceName,
    displayName: display,
    primaryPhone,
    phoneNormalized: phoneNorm,
    phones: phoneValues,
    emails: emails.map(e => e.value).filter(Boolean),
    labelResourceNames: memberships
      .map(m => m.contactGroupMembership?.contactGroupResourceName)
      .filter(Boolean),
    raw: person,
  };
}

// ─── ACCOUNTS / LABELS / SYNC STATUS ─────────────────────────────────

async function listAccounts(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT slot, account_email, account_name, status
       FROM user_integrations
       WHERE user_id = $1 AND integration_type = 'google_contacts'
       ORDER BY slot ASC`,
      [userId]
    );

    const slots = await Promise.all(rows.map(async (acc) => {
      const cached = await pool.query(
        `SELECT COUNT(*)::int AS cached_count,
                MAX(synced_at) AS last_synced_at
         FROM google_contacts_cache WHERE user_id = $1 AND slot = $2`,
        [userId, acc.slot]
      );
      const lastSync = await pool.query(
        `SELECT status, contact_count, started_at, finished_at, error_message
         FROM google_contacts_sync_log
         WHERE user_id = $1 AND slot = $2
         ORDER BY started_at DESC LIMIT 1`,
        [userId, acc.slot]
      );
      return {
        ...acc,
        cached_count: cached.rows[0].cached_count,
        last_synced_at: cached.rows[0].last_synced_at,
        latest_sync: lastSync.rows[0] || null,
      };
    }));

    res.json({ accounts: slots });
  } catch (err) {
    console.error('[GoogleCleanup] listAccounts error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת חשבונות Google' });
  }
}

async function listLabelsForSlot(req, res) {
  try {
    const userId = req.user.id;
    const slot = parseInt(req.query.slot) || 0;
    const { rows } = await pool.query(
      `SELECT resource_name, name, member_count, synced_at
       FROM google_contacts_labels_cache
       WHERE user_id = $1 AND slot = $2
       ORDER BY name ASC`,
      [userId, slot]
    );
    res.json({ labels: rows });
  } catch (err) {
    console.error('[GoogleCleanup] listLabelsForSlot error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת תוויות' });
  }
}

// ─── SYNC FROM GOOGLE → CACHE ────────────────────────────────────────

async function syncSlot(req, res) {
  const userId = req.user.id;
  const slot = parseInt(req.body?.slot) || 0;

  // Reject if a sync for this slot is already running (within last 10 minutes)
  const running = await pool.query(
    `SELECT id FROM google_contacts_sync_log
     WHERE user_id = $1 AND slot = $2 AND status = 'running'
       AND started_at > NOW() - INTERVAL '10 minutes'
     LIMIT 1`,
    [userId, slot]
  );
  if (running.rows.length) {
    return res.status(409).json({ error: 'סנכרון כבר רץ עבור החשבון הזה' });
  }

  const logRow = await pool.query(
    `INSERT INTO google_contacts_sync_log (user_id, slot, status) VALUES ($1, $2, 'running') RETURNING id`,
    [userId, slot]
  );
  const logId = logRow.rows[0].id;

  // Respond immediately — sync runs in background
  res.json({ success: true, syncId: logId, slot, status: 'running' });

  // Background work
  (async () => {
    let totalContacts = 0;
    let totalLabels = 0;
    try {
      const auth = await googleService.getAuthenticatedClientBySlot(userId, slot);
      const people = google.people({ version: 'v1', auth });

      // Probe total count first so the frontend can show a % progress bar.
      try {
        const probe = await people.people.connections.list({
          resourceName: 'people/me', pageSize: 1, personFields: 'names',
        });
        const estimate = probe.data.totalPeople || null;
        if (estimate) {
          await pool.query(
            `UPDATE google_contacts_sync_log SET total_estimate = $1 WHERE id = $2`,
            [estimate, logId]
          );
        }
      } catch {}

      // 1. Sync labels
      const labelsRes = await people.contactGroups.list({ pageSize: 200 });
      const labels = (labelsRes.data.contactGroups || [])
        .filter(g => g.groupType === 'USER_CONTACT_GROUP');

      // Wipe old labels for this slot, re-insert fresh
      await pool.query(
        `DELETE FROM google_contacts_labels_cache WHERE user_id = $1 AND slot = $2`,
        [userId, slot]
      );
      for (const l of labels) {
        await pool.query(
          `INSERT INTO google_contacts_labels_cache (user_id, slot, resource_name, name, member_count)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, slot, resource_name) DO UPDATE SET name = EXCLUDED.name, member_count = EXCLUDED.member_count, synced_at = NOW()`,
          [userId, slot, l.resourceName, l.name || '', l.memberCount || 0]
        );
      }
      totalLabels = labels.length;

      // 2. Sync contacts (paginated)
      // Strategy: collect resourceNames seen, then delete cache rows NOT in that set
      const seenResourceNames = new Set();
      let pageToken = null;
      do {
        const params = {
          resourceName: 'people/me',
          pageSize: PEOPLE_API_PAGE_SIZE,
          personFields: PEOPLE_API_FIELDS,
        };
        if (pageToken) params.pageToken = pageToken;

        const resp = await people.people.connections.list(params);
        const conns = resp.data.connections || [];
        for (const person of conns) {
          const flat = flattenPerson(person);
          if (!flat) continue;
          seenResourceNames.add(flat.resourceName);
          await pool.query(
            `INSERT INTO google_contacts_cache
              (user_id, slot, resource_name, display_name, primary_phone, phone_normalized,
               phones, emails, label_resource_names, raw, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, NOW())
             ON CONFLICT (user_id, slot, resource_name) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               primary_phone = EXCLUDED.primary_phone,
               phone_normalized = EXCLUDED.phone_normalized,
               phones = EXCLUDED.phones,
               emails = EXCLUDED.emails,
               label_resource_names = EXCLUDED.label_resource_names,
               raw = EXCLUDED.raw,
               synced_at = NOW()`,
            [
              userId, slot, flat.resourceName, flat.displayName, flat.primaryPhone, flat.phoneNormalized,
              JSON.stringify(flat.phones), JSON.stringify(flat.emails),
              JSON.stringify(flat.labelResourceNames), JSON.stringify(flat.raw),
            ]
          );
          totalContacts++;
        }
        // Update progress after each page so the UI can show %
        await pool.query(
          `UPDATE google_contacts_sync_log SET contact_count = $1 WHERE id = $2`,
          [totalContacts, logId]
        ).catch(() => {});
        pageToken = resp.data.nextPageToken || null;
      } while (pageToken);

      // Remove cache rows that are no longer in Google (deleted upstream)
      if (seenResourceNames.size) {
        await pool.query(
          `DELETE FROM google_contacts_cache
           WHERE user_id = $1 AND slot = $2 AND NOT (resource_name = ANY($3::text[]))`,
          [userId, slot, Array.from(seenResourceNames)]
        );
      }

      await pool.query(
        `UPDATE google_contacts_sync_log
         SET status = 'success', contact_count = $1, label_count = $2, finished_at = NOW()
         WHERE id = $3`,
        [totalContacts, totalLabels, logId]
      );
      console.log(`[GoogleCleanup] sync ok user=${userId} slot=${slot} contacts=${totalContacts} labels=${totalLabels}`);
    } catch (err) {
      console.error(`[GoogleCleanup] sync FAILED user=${userId} slot=${slot}:`, err.message);
      await pool.query(
        `UPDATE google_contacts_sync_log
         SET status = 'error', error_message = $1, finished_at = NOW()
         WHERE id = $2`,
        [err.message?.slice(0, 500) || 'unknown', logId]
      );
    }
  })().catch(() => {});
}

async function getSyncStatus(req, res) {
  try {
    const userId = req.user.id;
    const slot = parseInt(req.query.slot) || 0;
    const { rows } = await pool.query(
      `SELECT id, status, contact_count, label_count, total_estimate,
              error_message, started_at, finished_at
       FROM google_contacts_sync_log WHERE user_id = $1 AND slot = $2
       ORDER BY started_at DESC LIMIT 1`,
      [userId, slot]
    );
    res.json({ status: rows[0] || null });
  } catch (err) {
    console.error('[GoogleCleanup] getSyncStatus error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוס סנכרון' });
  }
}

// ─── FILTERED LIST (from cache) ──────────────────────────────────────

// Build the base WHERE (non-rule scopes that apply globally):
// slot filter + validity scope + viewer scope + keep-list scope.
// Returns { sql, params, nextIndex } as SQL fragments the caller appends to.
function buildBaseWhere(userId, slots, scopes) {
  const params = [userId];
  let i = 2;
  const where = [`gc.user_id = $1`];

  // Multi-slot: slots is an array. Empty means "all connected".
  if (Array.isArray(slots) && slots.length > 0) {
    where.push(`gc.slot = ANY($${i}::int[])`);
    params.push(slots); i++;
  }

  const validity = scopes.validityScope || 'valid';
  if (validity === 'valid') {
    where.push(`gc.phone_normalized ~ '^[0-9]{7,15}$' AND gc.phone_normalized NOT LIKE '120363%'`);
  } else if (validity === 'invalid') {
    where.push(`(gc.phone_normalized IS NULL OR gc.phone_normalized = '' OR NOT (gc.phone_normalized ~ '^[0-9]{7,15}$') OR gc.phone_normalized LIKE '120363%')`);
  }

  const scope = scopes.viewerScope || 'non_viewers';
  if (scope === 'non_viewers') {
    where.push(`NOT EXISTS (
      SELECT 1 FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1 AND sbv.viewer_phone = gc.phone_normalized
    )`);
  } else if (scope === 'viewers_only') {
    where.push(`EXISTS (
      SELECT 1 FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1 AND sbv.viewer_phone = gc.phone_normalized
    )`);
  }

  if (!scopes.includeKept) {
    where.push(`NOT EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = $1 AND k.phone = gc.phone_normalized)`);
  }

  return { sql: where.join(' AND '), params, nextIndex: i };
}

function normalizeSlots(body) {
  // Accepts either `slots: number[]` or single `slot: number`.
  if (Array.isArray(body?.slots)) return body.slots.map(n => parseInt(n)).filter(n => !isNaN(n));
  if (body?.slot != null) return [parseInt(body.slot)].filter(n => !isNaN(n));
  return []; // empty = all connected slots
}

async function listGoogleContacts(req, res) {
  try {
    const userId = req.user.id;
    const slots = normalizeSlots(req.body);
    const scopes = {
      viewerScope: req.body?.viewerScope || req.body?.filters?.viewerScope,
      validityScope: req.body?.validityScope || req.body?.filters?.validityScope || 'valid',
      includeKept: !!(req.body?.includeKept ?? req.body?.filters?.includeKept),
    };
    const rule = req.body?.rule || null; // new rule-based filter
    const page = Math.max(1, parseInt(req.body?.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.body?.limit) || 100));
    const offset = (page - 1) * limit;
    const sortBy = ['display_name', 'primary_phone', 'synced_at', 'slot'].includes(req.body?.sortBy)
      ? req.body.sortBy : 'display_name';
    const sortDir = req.body?.sortDir?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const base = buildBaseWhere(userId, slots, scopes);
    let whereSQL = base.sql;
    let params = [...base.params];
    let nextIndex = base.nextIndex;

    if (rule && typeof rule === 'object') {
      const compiled = compileRule(rule, GOOGLE_RULE_FIELDS, { startParamIndex: nextIndex, initialParams: [] });
      if (compiled.sql && compiled.sql !== 'TRUE') {
        // The rule may reference `is_viewer_calc`/`is_kept_calc` — so we wrap the whole
        // query in a CTE that exposes those calculated columns.
        whereSQL += ` AND ${compiled.sql}`;
      }
      params = params.concat(compiled.params);
      nextIndex = compiled.nextIndex;
    }

    // Outer query joins user_integrations to expose account_email per contact,
    // and precomputes is_viewer/is_kept so the rule compiler can reference them.
    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT * FROM (
        SELECT
          gc.resource_name, gc.slot, gc.display_name, gc.primary_phone, gc.phone_normalized,
          gc.phones, gc.emails, gc.label_resource_names, gc.synced_at,
          gc.raw,
          ui.account_email,
          EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = $1 AND k.phone = gc.phone_normalized) AS is_kept_calc,
          EXISTS (
            SELECT 1 FROM status_bot_views sbv
            JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
            JOIN status_bot_connections conn ON sbs.connection_id = conn.id
            WHERE conn.user_id = $1 AND sbv.viewer_phone = gc.phone_normalized
          ) AS is_viewer_calc
        FROM google_contacts_cache gc
        LEFT JOIN user_integrations ui
          ON ui.user_id = gc.user_id
         AND ui.integration_type = 'google_contacts'
         AND ui.slot = gc.slot
        WHERE ${whereSQL}
      ) t
      ORDER BY t.${sortBy === 'slot' ? 'slot' : sortBy} ${sortDir} NULLS LAST, t.resource_name ASC
      LIMIT $${nextIndex} OFFSET $${nextIndex + 1}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total FROM (
        SELECT 1
        FROM google_contacts_cache gc
        LEFT JOIN user_integrations ui
          ON ui.user_id = gc.user_id
         AND ui.integration_type = 'google_contacts'
         AND ui.slot = gc.slot
        WHERE ${whereSQL}
      ) t
    `;

    const [data, count] = await Promise.all([
      pool.query(dataSql, dataParams),
      pool.query(countSql, params),
    ]);

    // Rename the *_calc columns back to is_viewer / is_kept for the UI
    const contacts = data.rows.map(r => ({
      ...r,
      is_viewer: r.is_viewer_calc,
      is_kept: r.is_kept_calc,
    }));

    res.json({ contacts, total: count.rows[0].total, page, limit });
  } catch (err) {
    console.error('[GoogleCleanup] listGoogleContacts error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת רשימה מהקאש' });
  }
}

async function getGoogleStats(req, res) {
  try {
    const userId = req.user.id;
    // Multi-slot: accept slots[] from query string as comma-separated
    const slotsParam = req.query.slots || req.query.slot || '';
    const slots = String(slotsParam).split(',').map(s => parseInt(s)).filter(n => !isNaN(n));

    const params = [userId];
    let slotFilter = '';
    if (slots.length > 0) {
      slotFilter = `AND slot = ANY($2::int[])`;
      params.push(slots);
    }
    const baseSlotFilter = `AND gc.slot = ANY($2::int[])`;

    const sql = `
      WITH viewer_phones AS (
        SELECT DISTINCT sbv.viewer_phone AS phone
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
      ),
      base AS (
        SELECT * FROM google_contacts_cache WHERE user_id = $1 ${slotFilter}
      ),
      valid AS (
        SELECT * FROM base
        WHERE phone_normalized ~ '^[0-9]{7,15}$' AND phone_normalized NOT LIKE '120363%'
      )
      SELECT
        (SELECT COUNT(*)::int FROM base) AS total_in_cache,
        (SELECT COUNT(*)::int FROM valid) AS total_valid,
        (SELECT COUNT(*)::int FROM valid WHERE phone_normalized IN (SELECT phone FROM viewer_phones)) AS viewers,
        (SELECT COUNT(*)::int FROM valid WHERE phone_normalized NOT IN (SELECT phone FROM viewer_phones)) AS non_viewers,
        (SELECT COUNT(*)::int FROM base WHERE NOT (phone_normalized ~ '^[0-9]{7,15}$') OR phone_normalized LIKE '120363%' OR phone_normalized = '' OR phone_normalized IS NULL) AS invalid_contacts,
        (SELECT COUNT(*)::int FROM contact_keep_list WHERE user_id = $1) AS kept,
        (SELECT COUNT(*)::int FROM google_contacts_backup WHERE user_id = $1 ${slotFilter}) AS backups,
        (SELECT MAX(created_at) FROM google_contacts_backup WHERE user_id = $1 ${slotFilter}) AS latest_backup_at,
        (SELECT MAX(synced_at) FROM base) AS last_synced_at
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ stats: rows[0] });
  } catch (err) {
    console.error('[GoogleCleanup] getGoogleStats error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

async function previewGoogleSelection(req, res) {
  try {
    const userId = req.user.id;
    const slots = normalizeSlots(req.body);
    const scopes = {
      viewerScope: req.body?.viewerScope || req.body?.filters?.viewerScope,
      validityScope: req.body?.validityScope || req.body?.filters?.validityScope || 'valid',
      includeKept: !!(req.body?.includeKept ?? req.body?.filters?.includeKept),
    };
    const rule = req.body?.rule || null;
    const excludeResourceNames = Array.isArray(req.body?.excludeResourceNames) ? req.body.excludeResourceNames : [];

    const base = buildBaseWhere(userId, slots, scopes);
    let whereSQL = base.sql;
    let params = [...base.params];
    let nextIndex = base.nextIndex;

    if (rule && typeof rule === 'object') {
      const compiled = compileRule(rule, GOOGLE_RULE_FIELDS, { startParamIndex: nextIndex });
      if (compiled.sql && compiled.sql !== 'TRUE') whereSQL += ` AND ${compiled.sql}`;
      params = params.concat(compiled.params);
      nextIndex = compiled.nextIndex;
    }

    let sql = `
      SELECT t.resource_name, t.display_name, t.primary_phone, t.phone_normalized, t.slot, t.account_email
      FROM (
        SELECT
          gc.resource_name, gc.slot, gc.display_name, gc.primary_phone, gc.phone_normalized,
          gc.label_resource_names, gc.emails,
          ui.account_email,
          EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = $1 AND k.phone = gc.phone_normalized) AS is_kept_calc,
          EXISTS (
            SELECT 1 FROM status_bot_views sbv
            JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
            JOIN status_bot_connections conn ON sbs.connection_id = conn.id
            WHERE conn.user_id = $1 AND sbv.viewer_phone = gc.phone_normalized
          ) AS is_viewer_calc
        FROM google_contacts_cache gc
        LEFT JOIN user_integrations ui
          ON ui.user_id = gc.user_id AND ui.integration_type = 'google_contacts' AND ui.slot = gc.slot
        WHERE ${whereSQL}
      ) t
    `;
    if (excludeResourceNames.length) {
      sql += ` WHERE t.resource_name <> ALL($${nextIndex}::text[])`;
      params.push(excludeResourceNames);
    }
    sql += ` ORDER BY t.display_name NULLS LAST, t.primary_phone LIMIT 100000`;

    const { rows } = await pool.query(sql, params);
    res.json({ contacts: rows, total: rows.length });
  } catch (err) {
    console.error('[GoogleCleanup] previewGoogleSelection error:', err);
    res.status(500).json({ error: 'שגיאה בתצוגה מקדימה' });
  }
}

// ─── BACKUPS ─────────────────────────────────────────────────────────

async function createGoogleBackup(req, res) {
  try {
    const userId = req.user.id;
    const slot = parseInt(req.body?.slot) || 0;
    const label = req.body?.label?.trim() || null;
    const reason = ['manual', 'pre_delete'].includes(req.body?.reason) ? req.body.reason : 'manual';
    const resourceNames = Array.isArray(req.body?.resourceNames) ? req.body.resourceNames : null;

    let dataSql = `SELECT raw, resource_name, display_name, primary_phone, phone_normalized, label_resource_names
                   FROM google_contacts_cache WHERE user_id = $1 AND slot = $2`;
    const params = [userId, slot];
    if (resourceNames && resourceNames.length) {
      dataSql += ` AND resource_name = ANY($3::text[])`;
      params.push(resourceNames);
    }
    const data = await pool.query(dataSql, params);

    // Snapshot labels too so restore can re-create label memberships
    const labelsRes = await pool.query(
      `SELECT resource_name, name FROM google_contacts_labels_cache WHERE user_id = $1 AND slot = $2`,
      [userId, slot]
    );

    const payload = {
      schema_version: 1,
      source: 'google_contacts',
      slot,
      exported_at: new Date().toISOString(),
      contact_count: data.rows.length,
      contacts: data.rows.map(r => ({
        resource_name: r.resource_name,
        display_name: r.display_name,
        primary_phone: r.primary_phone,
        phone_normalized: r.phone_normalized,
        label_resource_names: r.label_resource_names,
        person: r.raw,
      })),
      labels: labelsRes.rows,
    };

    const sizeBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const ins = await pool.query(
      `INSERT INTO google_contacts_backup (user_id, slot, label, reason, contact_count, payload, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, label, reason, contact_count, size_bytes, created_at`,
      [userId, slot, label, reason, payload.contact_count, JSON.stringify(payload), sizeBytes]
    );

    // Cap retention
    await pool.query(
      `DELETE FROM google_contacts_backup
       WHERE id IN (SELECT id FROM google_contacts_backup
                    WHERE user_id = $1 AND slot = $2
                    ORDER BY created_at DESC OFFSET $3)`,
      [userId, slot, MAX_BACKUPS_PER_USER]
    );

    res.json({ success: true, backup: ins.rows[0] });
  } catch (err) {
    console.error('[GoogleCleanup] createGoogleBackup error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת גיבוי' });
  }
}

async function listGoogleBackups(req, res) {
  try {
    const userId = req.user.id;
    const slot = parseInt(req.query.slot) || 0;
    const { rows } = await pool.query(
      `SELECT id, slot, label, reason, contact_count, size_bytes, created_at
       FROM google_contacts_backup WHERE user_id = $1 AND slot = $2
       ORDER BY created_at DESC LIMIT 100`,
      [userId, slot]
    );
    res.json({ backups: rows });
  } catch (err) {
    console.error('[GoogleCleanup] listGoogleBackups error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת גיבויים' });
  }
}

async function downloadGoogleBackup(req, res) {
  try {
    const userId = req.user.id;
    const { backupId } = req.params;
    const { rows } = await pool.query(
      `SELECT label, payload, slot, created_at FROM google_contacts_backup WHERE id = $1 AND user_id = $2`,
      [backupId, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'גיבוי לא נמצא' });

    const ts = new Date(rows[0].created_at).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=google-contacts-backup-slot${rows[0].slot}-${ts}.json`);
    res.send(JSON.stringify(rows[0].payload, null, 2));
  } catch (err) {
    console.error('[GoogleCleanup] downloadGoogleBackup error:', err);
    res.status(500).json({ error: 'שגיאה בהורדת גיבוי' });
  }
}

async function deleteGoogleBackup(req, res) {
  try {
    const userId = req.user.id;
    const { backupId } = req.params;
    const r = await pool.query(
      `DELETE FROM google_contacts_backup WHERE id = $1 AND user_id = $2 RETURNING id`,
      [backupId, userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'גיבוי לא נמצא' });
    res.json({ success: true });
  } catch (err) {
    console.error('[GoogleCleanup] deleteGoogleBackup error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת גיבוי' });
  }
}

// ─── SAFE BULK DELETE FROM GOOGLE ────────────────────────────────────

// Starts a background delete job, returns jobId immediately.
// Flow:
//   1. Validate inputs (resourceNames, backup, confirmation)
//   2. INSERT into google_contacts_deletion_log with status='running', total_count=N, deleted_count=0
//   3. Respond with { jobId }
//   4. Kick off async loop that calls People API in small chunks and updates the row
async function safeDeleteFromGoogle(req, res) {
  const userId = req.user.id;
  const slot = parseInt(req.body?.slot) || 0;
  const {
    resourceNames,
    backupId,
    confirmation,
    expectedConfirmation,
    skipBackupCheck = false, // when client has confirmed an existing backup covers everything
  } = req.body || {};

  try {
    if (!Array.isArray(resourceNames) || resourceNames.length === 0) {
      return res.status(400).json({ error: 'לא נבחרו אנשי קשר למחיקה' });
    }
    if (resourceNames.length > 100000) {
      return res.status(400).json({ error: 'יותר מדי אנשי קשר במחיקה אחת (מקסימום 100,000)' });
    }
    if (!confirmation || !expectedConfirmation || confirmation !== expectedConfirmation) {
      return res.status(400).json({ error: 'אישור המחיקה אינו תואם — הקלד את ביטוי האישור במדויק' });
    }

    // Verify backup covers all selected resourceNames. Accept any backup (even old)
    // if skipBackupCheck=true and coverage is complete.
    if (!backupId) {
      return res.status(400).json({ error: 'נדרש גיבוי שמכסה את הרשימה לפני המחיקה' });
    }
    const bk = await pool.query(
      `SELECT payload, created_at FROM google_contacts_backup WHERE id = $1 AND user_id = $2 AND slot = $3`,
      [backupId, userId, slot]
    );
    if (!bk.rows.length) return res.status(400).json({ error: 'גיבוי לא נמצא לחשבון הזה' });
    const ageMs = Date.now() - new Date(bk.rows[0].created_at).getTime();
    const backupResourceNames = new Set(
      (bk.rows[0].payload?.contacts || []).map(c => c.resource_name)
    );
    const coversAll = resourceNames.every(rn => backupResourceNames.has(rn));

    if (!skipBackupCheck && ageMs > BACKUP_FRESH_WINDOW_MS) {
      // Backup is old AND client didn't explicitly opt to skip. Only allow if it covers everything.
      if (!coversAll) {
        return res.status(400).json({
          error: `הגיבוי ישן (יותר מ-${Math.floor(BACKUP_FRESH_WINDOW_MS / 60000)} דקות) ולא מכסה את כל הנמענים. צור גיבוי חדש.`,
        });
      }
      // Falls through — old-but-complete backup is OK
    }
    if (!coversAll) {
      const missing = resourceNames.filter(rn => !backupResourceNames.has(rn));
      return res.status(400).json({
        error: `${missing.length} אנשי קשר אינם בגיבוי הנוכחי. צור גיבוי חדש.`,
        missingCount: missing.length,
      });
    }

    // Filter out keep-listed contacts, look up phone/display for audit
    const cacheRes = await pool.query(
      `SELECT gc.resource_name, gc.phone_normalized, gc.display_name,
              EXISTS (SELECT 1 FROM contact_keep_list k WHERE k.user_id = $1 AND k.phone = gc.phone_normalized) AS is_kept
       FROM google_contacts_cache gc
       WHERE gc.user_id = $1 AND gc.slot = $2 AND gc.resource_name = ANY($3::text[])`,
      [userId, slot, resourceNames]
    );

    const targets = [];
    let skippedKept = 0;
    for (const row of cacheRes.rows) {
      if (row.is_kept) { skippedKept++; continue; }
      targets.push(row);
    }
    if (targets.length === 0) {
      return res.json({ jobId: null, deletedCount: 0, skippedKept });
    }

    // Create job row
    const job = await pool.query(
      `INSERT INTO google_contacts_deletion_log
         (user_id, slot, backup_id, status, total_count, deleted_count, failed_count, filter_summary)
       VALUES ($1, $2, $3, 'running', $4, 0, 0, $5::jsonb)
       RETURNING id`,
      [userId, slot, backupId, targets.length, JSON.stringify(req.body?.filterSummary || null)]
    );
    const jobId = job.rows[0].id;

    // Respond with jobId immediately; client will poll for progress.
    res.json({ jobId, total: targets.length, skippedKept });

    // Background processing
    (async () => {
      const CHUNK_SIZE = 20;
      const CHUNK_PAUSE_MS = 800;  // per chunk pause
      const BACKOFF_MS = 5000;
      const MAX_CONSECUTIVE_ERRORS = 25;

      let deleted = 0;
      let failed = 0;
      const deletedResourceNames = [];
      const failedSamples = [];
      let consecutiveErrors = 0;
      let bailed = false;

      let people;
      try {
        const auth = await googleService.getAuthenticatedClientBySlot(userId, slot);
        people = google.people({ version: 'v1', auth });
      } catch (authErr) {
        await pool.query(
          `UPDATE google_contacts_deletion_log
           SET status = 'error', error_message = $1, finished_at = NOW()
           WHERE id = $2`,
          [`auth: ${authErr.message?.slice(0, 300)}`, jobId]
        );
        return;
      }

      for (let i = 0; i < targets.length; i++) {
        if (bailed) break;
        const t = targets[i];
        try {
          await people.people.deleteContact({ resourceName: t.resource_name });
          deleted++;
          deletedResourceNames.push(t.resource_name);
          consecutiveErrors = 0;
        } catch (err) {
          const code = err?.response?.status || err?.code;
          failed++;
          consecutiveErrors++;
          if (failedSamples.length < 20) {
            failedSamples.push({
              resource_name: t.resource_name,
              phone: t.phone_normalized,
              error: err.message?.slice(0, 200),
            });
          }
          if (code === 429 || code === 503) {
            await new Promise(r => setTimeout(r, BACKOFF_MS));
          }
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            bailed = true;
            console.error(`[GoogleCleanup] job ${jobId} bailed after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
          }
        }

        // After each chunk: flush cache + update progress
        if ((i + 1) % CHUNK_SIZE === 0 || i === targets.length - 1 || bailed) {
          if (deletedResourceNames.length > 0) {
            try {
              await pool.query(
                `DELETE FROM google_contacts_cache
                 WHERE user_id = $1 AND slot = $2 AND resource_name = ANY($3::text[])`,
                [userId, slot, deletedResourceNames]
              );
              deletedResourceNames.length = 0; // clear so we don't re-delete next chunk
            } catch (cacheErr) {
              console.warn(`[GoogleCleanup] cache flush failed: ${cacheErr.message}`);
            }
          }
          try {
            await pool.query(
              `UPDATE google_contacts_deletion_log
               SET deleted_count = $1, failed_count = $2,
                   deleted_resource_names = COALESCE(deleted_resource_names, '[]'::jsonb) || $3::jsonb
               WHERE id = $4`,
              [deleted, failed, JSON.stringify(deletedResourceNames), jobId]
            );
          } catch {}
          // pause so we don't hammer WAHA/Google
          await new Promise(r => setTimeout(r, CHUNK_PAUSE_MS));
        }
      }

      // Final state update
      const finalStatus = bailed ? 'error' : (failed > 0 ? 'partial' : 'success');
      await pool.query(
        `UPDATE google_contacts_deletion_log
         SET status = $1, deleted_count = $2, failed_count = $3, finished_at = NOW(),
             error_message = $4
         WHERE id = $5`,
        [
          finalStatus, deleted, failed,
          bailed ? 'bailed after too many consecutive errors' : null,
          jobId,
        ]
      );
      console.log(`[GoogleCleanup] job ${jobId} done status=${finalStatus} deleted=${deleted} failed=${failed}`);
    })().catch(async (err) => {
      console.error(`[GoogleCleanup] job ${jobId} crashed:`, err);
      await pool.query(
        `UPDATE google_contacts_deletion_log
         SET status = 'error', error_message = $1, finished_at = NOW()
         WHERE id = $2`,
        [err.message?.slice(0, 300) || 'unknown', jobId]
      ).catch(() => {});
    });
  } catch (err) {
    console.error('[GoogleCleanup] safeDeleteFromGoogle error:', err);
    res.status(500).json({ error: err.message?.includes('not connected') ? 'חשבון Google לא מחובר' : 'שגיאה במחיקה מ-Google' });
  }
}

// Poll endpoint: returns job progress { status, total, deleted, failed, finished_at, error_message }
async function getDeleteJobStatus(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, status, total_count, deleted_count, failed_count, finished_at, error_message, created_at
       FROM google_contacts_deletion_log
       WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'משימת מחיקה לא נמצאה' });
    res.json({ job: rows[0] });
  } catch (err) {
    console.error('[GoogleCleanup] getDeleteJobStatus error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
}

// Helper: does the user have ANY backup whose contacts cover the given resourceNames?
// Returns the newest covering backup id, or null.
async function findCoveringBackup(userId, slot, resourceNames) {
  if (!Array.isArray(resourceNames) || resourceNames.length === 0) return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, payload, created_at FROM google_contacts_backup
       WHERE user_id = $1 AND slot = $2
       ORDER BY created_at DESC LIMIT 20`,
      [userId, slot]
    );
    const needed = new Set(resourceNames);
    for (const b of rows) {
      const covered = new Set((b.payload?.contacts || []).map(c => c.resource_name));
      let allHere = true;
      for (const rn of needed) {
        if (!covered.has(rn)) { allHere = false; break; }
      }
      if (allHere) return { id: b.id, created_at: b.created_at, contact_count: (b.payload?.contacts || []).length };
    }
    return null;
  } catch {
    return null;
  }
}

async function checkBackupCoverage(req, res) {
  try {
    const userId = req.user.id;
    const slot = parseInt(req.body?.slot) || 0;
    const resourceNames = Array.isArray(req.body?.resourceNames) ? req.body.resourceNames : [];
    if (resourceNames.length === 0) return res.json({ covered: false });
    const found = await findCoveringBackup(userId, slot, resourceNames);
    res.json({ covered: !!found, backup: found });
  } catch (err) {
    console.error('[GoogleCleanup] checkBackupCoverage error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
}

async function getDeletionLog(req, res) {
  try {
    const userId = req.user.id;
    const slot = parseInt(req.query.slot) || 0;
    const { rows } = await pool.query(
      `SELECT l.id, l.deleted_count, l.failed_count, l.created_at, l.filter_summary,
              b.id AS backup_id, b.label AS backup_label
       FROM google_contacts_deletion_log l
       LEFT JOIN google_contacts_backup b ON b.id = l.backup_id
       WHERE l.user_id = $1 AND l.slot = $2
       ORDER BY l.created_at DESC LIMIT 50`,
      [userId, slot]
    );
    res.json({ log: rows });
  } catch (err) {
    console.error('[GoogleCleanup] getDeletionLog error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית מחיקות' });
  }
}

module.exports = {
  listAccounts,
  listLabelsForSlot,
  syncSlot,
  getSyncStatus,
  listGoogleContacts,
  getGoogleStats,
  previewGoogleSelection,
  createGoogleBackup,
  listGoogleBackups,
  downloadGoogleBackup,
  deleteGoogleBackup,
  safeDeleteFromGoogle,
  getDeleteJobStatus,
  checkBackupCoverage,
  getDeletionLog,
  BACKUP_FRESH_WINDOW_MS,
};
