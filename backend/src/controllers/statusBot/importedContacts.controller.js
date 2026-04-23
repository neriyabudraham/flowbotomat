const db = require('../../config/database');
const {
  normalizePhone,
  parseManualText,
  parseCsvText,
  parseVcfText,
  dedupeInMemory,
} = require('../../services/statusBot/importedContacts.service');
const googleContactsService = require('../../services/googleContacts.service');

const DEFAULT_MAX_LIMIT = 50000;

/**
 * Return a Set of phone strings (digits only) that are already reachable via
 * WAHA cache for this connection. Used to compute "true new reach" — phones
 * that the status broadcast CAN'T already reach through the normal WAHA list.
 */
async function getWahaReachablePhones(connectionId) {
  try {
    const r = await db.query(
      `SELECT contacts_cache FROM status_bot_connections WHERE id = $1`,
      [connectionId]
    );
    const cache = r.rows[0]?.contacts_cache;
    const arr = Array.isArray(cache) ? cache : [];
    const set = new Set();
    for (const c of arr) {
      if (!c || !c.id) continue;
      // Only @c.us counts as reachable — @lid / @g.us don't receive statuses
      if (c.id.includes('@c.us')) {
        set.add(c.id.replace(/@.*/, ''));
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

async function getMaxLimit() {
  try {
    const r = await db.query(
      `SELECT value FROM system_settings WHERE key = $1`,
      ['statusbot_imported_contacts_max_per_user']
    );
    if (!r.rows.length) return DEFAULT_MAX_LIMIT;
    const raw = r.rows[0].value;
    const n = parseInt(typeof raw === 'string' ? raw.replace(/"/g, '') : raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_LIMIT;
  } catch {
    return DEFAULT_MAX_LIMIT;
  }
}

async function getConnection(userId) {
  const r = await db.query(
    `SELECT id, use_imported_contacts FROM status_bot_connections WHERE user_id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * Scope context:
 *   - connection-level: connection_id = $X AND authorized_number_id IS NULL
 *   - per-sender:       authorized_number_id = $X
 *
 * Reads `authorized_number_id` from req.query / req.body / req.params (first wins),
 * validates that the sender belongs to the user's connection, and returns a scope
 * object used to scope WHERE / INSERT clauses consistently.
 *
 * Returns: { ok: true, connectionId, authorizedNumberId, useImported, canImport }
 * or:      { ok: false, status, error }
 */
async function resolveScope(req) {
  const conn = await getConnection(req.user.id);
  if (!conn) return { ok: false, status: 404, error: 'לא נמצא חיבור סטטוס' };

  const raw =
    req.query?.authorized_number_id ??
    req.body?.authorized_number_id ??
    req.params?.authorized_number_id ??
    null;

  if (!raw) {
    return {
      ok: true,
      connectionId: conn.id,
      authorizedNumberId: null,
      useImported: conn.use_imported_contacts !== false,
      canImport: true,
    };
  }

  const authRes = await db.query(
    `SELECT id, can_import_contacts, is_active
       FROM status_bot_authorized_numbers
      WHERE id = $1 AND connection_id = $2`,
    [raw, conn.id]
  );
  if (!authRes.rows.length) {
    return { ok: false, status: 404, error: 'מספר מורשה לא נמצא' };
  }

  return {
    ok: true,
    connectionId: conn.id,
    authorizedNumberId: authRes.rows[0].id,
    useImported: true, // per-sender lists are always applied when present
    canImport: authRes.rows[0].can_import_contacts === true,
  };
}

/** WHERE fragment + params builder for the current scope. Starts at $startIdx. */
function scopeWhere(scope, startIdx = 1) {
  if (scope.authorizedNumberId) {
    return {
      sql: `authorized_number_id = $${startIdx}`,
      params: [scope.authorizedNumberId],
      next: startIdx + 1,
    };
  }
  return {
    sql: `connection_id = $${startIdx} AND authorized_number_id IS NULL`,
    params: [scope.connectionId],
    next: startIdx + 1,
  };
}

/** ON CONFLICT target fragment matching the partial unique index for this scope. */
function scopeConflictTarget(scope) {
  if (scope.authorizedNumberId) {
    return `ON CONFLICT (authorized_number_id, phone) WHERE authorized_number_id IS NOT NULL DO NOTHING`;
  }
  return `ON CONFLICT (connection_id, phone) WHERE authorized_number_id IS NULL DO NOTHING`;
}

/**
 * GET /status-bot/imported-contacts
 * Optional ?authorized_number_id=<uuid> to fetch the per-sender list.
 */
async function list(req, res) {
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const w = scopeWhere(scope, 1);
    const [rowsRes, countRes, limit] = await Promise.all([
      db.query(
        `SELECT id, phone, display_name, source, created_at
           FROM status_bot_imported_contacts
          WHERE ${w.sql}
          ORDER BY created_at DESC, phone ASC
          LIMIT 10000`,
        w.params
      ),
      db.query(
        `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
        w.params
      ),
      getMaxLimit(),
    ]);

    res.json({
      contacts: rowsRes.rows,
      total: countRes.rows[0].total,
      limit,
      use_imported_contacts: scope.useImported,
      authorized_number_id: scope.authorizedNumberId,
    });
  } catch (err) {
    console.error('[ImportedContacts] list error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת אנשי קשר' });
  }
}

/**
 * POST /status-bot/imported-contacts/preview
 * Parses input and returns a preview of valid / duplicate / invalid counts
 * + sample — WITHOUT saving. Scoped via optional authorized_number_id.
 */
async function preview(req, res) {
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const source = detectSource(req);
    const parsed = await parseInput(req);
    if (!parsed) return res.status(400).json({ error: 'לא סופקה רשימה להעלאה' });

    const { entries, rawLineCount } = parsed;
    const deduped = dedupeInMemory(entries);

    // Compare against existing DB (in the same scope)
    const w = scopeWhere(scope, 1);
    const existing = new Set();
    if (deduped.length > 0) {
      const phones = deduped.map(e => e.phone);
      const r = await db.query(
        `SELECT phone FROM status_bot_imported_contacts
          WHERE ${w.sql} AND phone = ANY($${w.next}::text[])`,
        [...w.params, phones]
      );
      for (const row of r.rows) existing.add(row.phone);
    }

    const mode = (req.body?.mode || 'append').toLowerCase() === 'replace' ? 'replace' : 'append';
    const newContacts = mode === 'replace' ? deduped : deduped.filter(e => !existing.has(e.phone));
    const duplicatesInFile = entries.length - deduped.length;
    const duplicatesInDb = mode === 'replace' ? 0 : deduped.length - newContacts.length;
    const invalidCount = Math.max(0, rawLineCount - entries.length);

    // True new reach = phones that aren't in the WAHA cache already.
    const wahaPhones = await getWahaReachablePhones(scope.connectionId);
    const newReachPhones = deduped.filter(e => !wahaPhones.has(e.phone));
    const alreadyInWaha = deduped.length - newReachPhones.length;
    const newImportsNotInWaha = newContacts.filter(e => !wahaPhones.has(e.phone)).length;

    const limit = await getMaxLimit();

    const currentTotalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    const currentTotal = currentTotalRes.rows[0].total;
    const projectedTotal = mode === 'replace'
      ? newContacts.length
      : currentTotal + newContacts.length;

    const currentImportedPhonesRes = await db.query(
      `SELECT phone FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    const currentImportedPhones = new Set(currentImportedPhonesRes.rows.map(r => r.phone));

    const afterImported = mode === 'replace'
      ? new Set(deduped.map(e => e.phone))
      : new Set([...currentImportedPhones, ...deduped.map(e => e.phone)]);

    const reachBefore = new Set([...wahaPhones, ...currentImportedPhones]).size;
    const reachAfter = new Set([...wahaPhones, ...afterImported]).size;
    const reachDelta = reachAfter - reachBefore;

    res.json({
      source,
      mode,
      summary: {
        raw_lines: rawLineCount,
        parsed_valid: entries.length,
        invalid: invalidCount,
        duplicates_in_file: duplicatesInFile,
        duplicates_in_db: duplicatesInDb,
        new_contacts: newContacts.length,
        already_in_waha: alreadyInWaha,
        new_reach: newImportsNotInWaha,
        current_total: currentTotal,
        projected_total: projectedTotal,
        waha_reachable_count: wahaPhones.size,
        reach_before: reachBefore,
        reach_after: reachAfter,
        reach_delta: reachDelta,
        limit,
        exceeds_limit: projectedTotal > limit,
      },
      preview: deduped.slice(0, 200),
      preview_new: newContacts.slice(0, 200),
    });
  } catch (err) {
    console.error('[ImportedContacts] preview error:', err);
    res.status(500).json({ error: err.message || 'שגיאה בפרסור הקובץ' });
  }
}

/**
 * POST /status-bot/imported-contacts/import
 * Actually saves the parsed contacts. Scoped via optional authorized_number_id.
 */
async function importContacts(req, res) {
  const client = await db.pool.connect();
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const source = detectSource(req);
    const parsed = await parseInput(req);
    if (!parsed) return res.status(400).json({ error: 'לא סופקה רשימה להעלאה' });

    const deduped = dedupeInMemory(parsed.entries);
    const mode = (req.body?.mode || 'append').toLowerCase() === 'replace' ? 'replace' : 'append';
    const limit = await getMaxLimit();
    const w = scopeWhere(scope, 1);

    await client.query('BEGIN');

    if (mode === 'replace') {
      await client.query(
        `DELETE FROM status_bot_imported_contacts WHERE ${w.sql}`,
        w.params
      );
    }

    const curRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    const currentTotal = curRes.rows[0].total;

    const toInsert = deduped;
    let inserted = 0;
    let rejectedOverLimit = 0;

    if (toInsert.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        if (currentTotal + inserted >= limit) {
          rejectedOverLimit += chunk.length;
          continue;
        }
        const allowed = Math.min(chunk.length, limit - (currentTotal + inserted));
        const allowedChunk = chunk.slice(0, allowed);
        if (allowed < chunk.length) rejectedOverLimit += chunk.length - allowed;

        const values = [];
        const params = [];
        let p = 1;
        for (const e of allowedChunk) {
          values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
          params.push(scope.connectionId, req.user.id, e.phone, e.display_name || null, source, scope.authorizedNumberId);
        }
        const q = `
          INSERT INTO status_bot_imported_contacts (connection_id, user_id, phone, display_name, source, authorized_number_id)
          VALUES ${values.join(',')}
          ${scopeConflictTarget(scope)}
          RETURNING id
        `;
        const r = await client.query(q, params);
        inserted += r.rowCount;
      }
    }

    await client.query('COMMIT');

    const afterRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );

    res.json({
      success: true,
      mode,
      inserted,
      duplicates_skipped: deduped.length - inserted - rejectedOverLimit,
      rejected_over_limit: rejectedOverLimit,
      total_now: afterRes.rows[0].total,
      limit,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ImportedContacts] import error:', err);
    res.status(500).json({ error: err.message || 'שגיאה בשמירת אנשי קשר' });
  } finally {
    client.release();
  }
}

/**
 * DELETE /status-bot/imported-contacts/:id — remove a single contact
 * Scope comes from query/body; the row's scope must match.
 */
async function removeOne(req, res) {
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
    const { id } = req.params;
    const w = scopeWhere(scope, 2); // $1 is the id
    const r = await db.query(
      `DELETE FROM status_bot_imported_contacts
        WHERE id = $1 AND ${w.sql}
      RETURNING id`,
      [id, ...w.params]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'איש קשר לא נמצא' });
    res.json({ success: true });
  } catch (err) {
    console.error('[ImportedContacts] removeOne error:', err);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
}

/**
 * POST /status-bot/imported-contacts/add — manual add of a single phone
 */
async function addOne(req, res) {
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
    const { phone, display_name } = req.body || {};
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ error: 'מספר לא תקין' });

    const limit = await getMaxLimit();
    const w = scopeWhere(scope, 1);
    const curRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    if (curRes.rows[0].total >= limit) {
      return res.status(400).json({ error: `הגעת למגבלה של ${limit} אנשי קשר` });
    }

    const r = await db.query(
      `INSERT INTO status_bot_imported_contacts (connection_id, user_id, phone, display_name, source, authorized_number_id)
       VALUES ($1, $2, $3, $4, 'manual', $5)
       ${scopeConflictTarget(scope)}
       RETURNING id, phone, display_name, source, created_at`,
      [scope.connectionId, req.user.id, normalized, display_name ? String(display_name).slice(0, 128) : null, scope.authorizedNumberId]
    );
    if (r.rowCount === 0) {
      return res.status(409).json({ error: 'מספר זה כבר קיים ברשימה' });
    }
    res.json({ success: true, contact: r.rows[0] });
  } catch (err) {
    console.error('[ImportedContacts] addOne error:', err);
    res.status(500).json({ error: 'שגיאה בהוספה' });
  }
}

/**
 * DELETE /status-bot/imported-contacts — clear the whole list (in scope)
 */
async function clearAll(req, res) {
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
    const w = scopeWhere(scope, 1);
    const r = await db.query(
      `DELETE FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    res.json({ success: true, deleted: r.rowCount });
  } catch (err) {
    console.error('[ImportedContacts] clearAll error:', err);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
}

/**
 * PATCH /status-bot/imported-contacts/toggle — enable/disable usage
 * (connection-level only — applies to the contacts-format master flag)
 */
async function toggleUse(req, res) {
  try {
    const conn = await getConnection(req.user.id);
    if (!conn) return res.status(404).json({ error: 'לא נמצא חיבור סטטוס' });
    const enabled = !!req.body?.enabled;
    await db.query(
      `UPDATE status_bot_connections SET use_imported_contacts = $1 WHERE id = $2`,
      [enabled, conn.id]
    );
    res.json({ success: true, use_imported_contacts: enabled });
  } catch (err) {
    console.error('[ImportedContacts] toggleUse error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרה' });
  }
}

// ─────────────────────────────────────────────
// Google Contacts sync
// ─────────────────────────────────────────────

/**
 * Fetch Google contacts across ONE OR MORE connected accounts.
 *
 * - If `slots` is empty/undefined → pull from every connected account.
 * - Each entry is tagged with `source_slot` + `source_email` so the admin
 *   can see where each name/phone came from.
 * - Display names are capped at 240 chars (DB column is 255) to avoid
 *   "value too long for type character varying" errors from long emoji-rich
 *   contact names like "💎 Shira — weekly consultation ⭐⭐⭐⭐⭐ ...".
 */
async function fetchGoogleContactsFlattened(userId, { slots = null } = {}) {
  const MAX_PAGES = 50;
  const PAGE_SIZE = 1000;
  const MAX_CONTACTS_PER_ACCOUNT = 20000;
  const NAME_MAX = 240;

  // Resolve which accounts to pull from
  const allAccounts = await googleContactsService.listConnectedSlots(userId);
  if (allAccounts.length === 0) {
    throw new Error('אין חשבון גוגל מחובר');
  }
  const selectedSlots = (Array.isArray(slots) && slots.length > 0)
    ? allAccounts.filter(a => slots.map(Number).includes(Number(a.slot)))
    : allAccounts;
  if (selectedSlots.length === 0) {
    throw new Error('לא נמצא חשבון גוגל תואם מבין החשבונות שנבחרו');
  }

  const perAccount = [];
  const allEntries = [];
  let totalGoogleAll = 0;
  let totalWithPhoneAll = 0;

  for (const account of selectedSlots) {
    const accEntries = [];
    let accTotal = 0;
    let accWithPhone = 0;
    let pageToken = null;

    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await googleContactsService.listContactsBySlot(userId, account.slot, PAGE_SIZE, pageToken);
        const contacts = result.contacts || [];
        accTotal += contacts.length;

        for (const c of contacts) {
          if (!c.phones || c.phones.length === 0) continue;
          accWithPhone++;
          for (const rawPhone of c.phones) {
            const normalized = normalizePhone(rawPhone);
            if (normalized) {
              accEntries.push({
                phone: normalized,
                display_name: c.name ? String(c.name).slice(0, NAME_MAX) : null,
                source_slot: account.slot,
                source_email: account.email,
              });
            }
          }
        }

        if (!result.nextPageToken) break;
        pageToken = result.nextPageToken;
        if (accEntries.length >= MAX_CONTACTS_PER_ACCOUNT) break;
      }
    } catch (err) {
      console.error(`[ImportedContacts] Google fetch failed for slot ${account.slot} (${account.email}):`, err.message);
    }

    perAccount.push({
      slot: account.slot,
      email: account.email,
      totalGoogle: accTotal,
      totalWithPhone: accWithPhone,
      parsedValid: accEntries.length,
    });
    allEntries.push(...accEntries);
    totalGoogleAll += accTotal;
    totalWithPhoneAll += accWithPhone;
  }

  return {
    entries: allEntries,
    totalGoogle: totalGoogleAll,
    totalWithPhone: totalWithPhoneAll,
    perAccount,
    selectedAccounts: selectedSlots.map(a => ({ slot: a.slot, email: a.email, name: a.name })),
  };
}

/**
 * GET /status-bot/imported-contacts/google-status
 */
async function googleStatus(req, res) {
  try {
    // Multi-account: return ALL connected Google accounts so the admin can
    // pick which to pull from (or pull from all merged, which is the default).
    const accounts = await googleContactsService.listConnectedSlots(req.user.id);
    const connected = accounts.length > 0;

    let authUrl = null;
    if (!connected) {
      try { authUrl = googleContactsService.getAuthUrl(req.user.id, 'status-bot'); } catch {}
    }

    res.json({
      connected,
      accounts, // [{slot, email, name, updatedAt}, ...]
      // Back-compat fields (the primary account shown at top level)
      email: accounts[0]?.email || null,
      name:  accounts[0]?.name  || null,
      authUrl,
      userId: req.user.id,
      shareablePath: `/connect/${req.user.id}/integrations`,
    });
  } catch (err) {
    console.error('[ImportedContacts] googleStatus error:', err);
    res.status(500).json({ error: 'שגיאה בבדיקת חיבור גוגל' });
  }
}

/**
 * POST /status-bot/imported-contacts/google-preview
 */
async function googlePreview(req, res) {
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const connectedAccounts = await googleContactsService.listConnectedSlots(req.user.id);
    if (connectedAccounts.length === 0) {
      return res.status(400).json({ error: 'חשבון גוגל אינו מחובר', not_connected: true });
    }

    const slots = Array.isArray(req.body?.slots) ? req.body.slots : null;
    const {
      entries, totalGoogle, totalWithPhone, perAccount, selectedAccounts,
    } = await fetchGoogleContactsFlattened(req.user.id, { slots });
    const deduped = dedupeInMemory(entries);

    const w = scopeWhere(scope, 1);
    const phones = deduped.map(e => e.phone);
    let existing = new Set();
    if (phones.length > 0) {
      const r = await db.query(
        `SELECT phone FROM status_bot_imported_contacts
          WHERE ${w.sql} AND phone = ANY($${w.next}::text[])`,
        [...w.params, phones]
      );
      existing = new Set(r.rows.map(row => row.phone));
    }

    const mode = (req.body?.mode || 'append').toLowerCase() === 'replace' ? 'replace' : 'append';
    const newContacts = mode === 'replace' ? deduped : deduped.filter(e => !existing.has(e.phone));

    const wahaPhones = await getWahaReachablePhones(scope.connectionId);
    const alreadyInWaha = deduped.filter(e => wahaPhones.has(e.phone)).length;
    const newImportsNotInWaha = newContacts.filter(e => !wahaPhones.has(e.phone)).length;

    const limit = await getMaxLimit();
    const curRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    const currentTotal = curRes.rows[0].total;
    const projectedTotal = mode === 'replace' ? newContacts.length : currentTotal + newContacts.length;

    const currentImportedRes = await db.query(
      `SELECT phone FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    const currentImported = new Set(currentImportedRes.rows.map(r => r.phone));
    const afterImported = mode === 'replace'
      ? new Set(deduped.map(e => e.phone))
      : new Set([...currentImported, ...deduped.map(e => e.phone)]);
    const reachBefore = new Set([...wahaPhones, ...currentImported]).size;
    const reachAfter = new Set([...wahaPhones, ...afterImported]).size;

    res.json({
      source: 'google',
      mode,
      // Back-compat: the first selected account as the "main" one
      google_account: selectedAccounts[0] ? { email: selectedAccounts[0].email, name: selectedAccounts[0].name } : null,
      // Full multi-account detail
      google_accounts: selectedAccounts,
      google_per_account: perAccount,
      summary: {
        total_google: totalGoogle,
        total_with_phone: totalWithPhone,
        parsed_valid: entries.length,
        invalid: Math.max(0, totalWithPhone - entries.length),
        duplicates_in_file: entries.length - deduped.length,
        duplicates_in_db: deduped.length - newContacts.length,
        new_contacts: newContacts.length,
        already_in_waha: alreadyInWaha,
        new_reach: newImportsNotInWaha,
        current_total: currentTotal,
        projected_total: projectedTotal,
        waha_reachable_count: wahaPhones.size,
        reach_before: reachBefore,
        reach_after: reachAfter,
        reach_delta: reachAfter - reachBefore,
        limit,
        exceeds_limit: projectedTotal > limit,
      },
      preview: deduped.slice(0, 200),
      preview_new: newContacts.slice(0, 200),
    });
  } catch (err) {
    console.error('[ImportedContacts] googlePreview error:', err);
    res.status(500).json({ error: err.message || 'שגיאה בטעינת אנשי קשר מגוגל' });
  }
}

/**
 * POST /status-bot/imported-contacts/google-import
 */
async function googleImport(req, res) {
  const client = await db.pool.connect();
  try {
    const scope = await resolveScope(req);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const connectedAccounts = await googleContactsService.listConnectedSlots(req.user.id);
    if (connectedAccounts.length === 0) {
      return res.status(400).json({ error: 'חשבון גוגל אינו מחובר', not_connected: true });
    }

    const slots = Array.isArray(req.body?.slots) ? req.body.slots : null;
    const { entries } = await fetchGoogleContactsFlattened(req.user.id, { slots });
    const deduped = dedupeInMemory(entries);
    const mode = (req.body?.mode || 'append').toLowerCase() === 'replace' ? 'replace' : 'append';
    const limit = await getMaxLimit();
    const w = scopeWhere(scope, 1);

    await client.query('BEGIN');

    if (mode === 'replace') {
      await client.query(
        `DELETE FROM status_bot_imported_contacts WHERE ${w.sql}`,
        w.params
      );
    }

    const curRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );
    const currentTotal = curRes.rows[0].total;

    let inserted = 0;
    let rejectedOverLimit = 0;
    const CHUNK = 1000;
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const chunk = deduped.slice(i, i + CHUNK);
      if (currentTotal + inserted >= limit) {
        rejectedOverLimit += chunk.length;
        continue;
      }
      const allowed = Math.min(chunk.length, limit - (currentTotal + inserted));
      const allowedChunk = chunk.slice(0, allowed);
      if (allowed < chunk.length) rejectedOverLimit += chunk.length - allowed;

      const values = [];
      const params = [];
      let p = 1;
      for (const e of allowedChunk) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(scope.connectionId, req.user.id, e.phone, e.display_name || null, 'google', scope.authorizedNumberId);
      }
      const q = `
        INSERT INTO status_bot_imported_contacts (connection_id, user_id, phone, display_name, source, authorized_number_id)
        VALUES ${values.join(',')}
        ${scopeConflictTarget(scope)}
        RETURNING id
      `;
      const r = await client.query(q, params);
      inserted += r.rowCount;
    }

    await client.query('COMMIT');

    const afterRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM status_bot_imported_contacts WHERE ${w.sql}`,
      w.params
    );

    res.json({
      success: true,
      mode,
      inserted,
      duplicates_skipped: deduped.length - inserted - rejectedOverLimit,
      rejected_over_limit: rejectedOverLimit,
      total_now: afterRes.rows[0].total,
      limit,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ImportedContacts] googleImport error:', err);
    res.status(500).json({ error: err.message || 'שגיאה בייבוא מגוגל' });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// Input handling
// ─────────────────────────────────────────────

function detectSource(req) {
  if (req.file) {
    const name = (req.file.originalname || '').toLowerCase();
    if (name.endsWith('.vcf') || name.endsWith('.vcard')) return 'vcf';
    return 'csv';
  }
  return 'manual';
}

async function parseInput(req) {
  const manual = req.body?.manual;
  if (!req.file && manual && String(manual).trim()) {
    const entries = parseManualText(manual);
    const rawLineCount = String(manual).split(/[\n,;\t]+/).filter(s => s.trim()).length;
    return { entries, rawLineCount };
  }

  if (req.file) {
    let text;
    try {
      text = req.file.buffer.toString('utf8');
    } catch (e) {
      throw new Error('קובץ לא קריא');
    }
    const name = (req.file.originalname || '').toLowerCase();
    if (name.endsWith('.vcf') || name.endsWith('.vcard') || /BEGIN:VCARD/i.test(text)) {
      const entries = parseVcfText(text);
      const rawLineCount = (text.match(/BEGIN:VCARD/gi) || []).length || entries.length;
      return { entries, rawLineCount };
    }
    const entries = parseCsvText(text);
    const dataLines = text.split(/\r?\n/).filter(l => l.trim());
    return { entries, rawLineCount: Math.max(0, dataLines.length - 1) };
  }

  return null;
}

module.exports = {
  list,
  preview,
  importContacts,
  removeOne,
  addOne,
  clearAll,
  toggleUse,
  googleStatus,
  googlePreview,
  googleImport,
};
