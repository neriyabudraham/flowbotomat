const sourcesService = require('../../services/waha/sources.service');
const wahaSession = require('../../services/waha/session.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const db = require('../../config/database');

async function list(req, res) {
  try {
    const sources = await sourcesService.listSources();
    res.json({ sources });
  } catch (e) {
    console.error('[WahaSources] list error:', e);
    res.status(500).json({ error: 'שגיאה בטעינת מקורות WAHA' });
  }
}

async function create(req, res) {
  try {
    // Accept both camelCase and snake_case field names
    const baseUrl = (req.body.baseUrl || req.body.base_url || '').trim();
    const apiKey = (req.body.apiKey || req.body.api_key || '').trim();
    const webhookBaseUrl = (req.body.webhookBaseUrl || req.body.webhook_base_url || '').trim() || null;
    const priority = parseInt(req.body.priority) || 0;
    const name = (req.body.name || baseUrl).trim();

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ error: 'כתובת ו-API key הם שדות חובה' });
    }
    const source = await sourcesService.createSource({
      name, baseUrl, apiKey, webhookBaseUrl, priority, createdBy: req.user?.id
    });
    res.json({ success: true, source });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת זו כבר קיימת במערכת' });
    console.error('[WahaSources] create error:', e);
    res.status(500).json({ error: 'שגיאה ביצירת מקור' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    // Accept both camelCase and snake_case field names
    const baseUrl = (req.body.baseUrl || req.body.base_url || '').trim() || undefined;
    const apiKey = (req.body.apiKey || req.body.api_key || '').trim() || undefined;
    const webhookBaseUrl = (req.body.webhookBaseUrl !== undefined ? req.body.webhookBaseUrl : req.body.webhook_base_url);
    const priority = req.body.priority !== undefined ? parseInt(req.body.priority) : undefined;
    const name = req.body.name;
    const confirmBaseUrlChange = req.body.confirmBaseUrlChange;

    const existing = await sourcesService.getSourceById(id);
    if (!existing) return res.status(404).json({ error: 'מקור לא נמצא' });

    const baseUrlChanged = baseUrl && baseUrl !== existing.base_url;

    // If base URL is changing and not yet confirmed, return session count for confirmation UI
    if (baseUrlChanged && !confirmBaseUrlChange) {
      const sessionCount = await sourcesService.getSessionCountForSource(id);
      if (sessionCount > 0) {
        return res.status(200).json({
          requiresConfirmation: true,
          sessionCount,
          message: `יש ${sessionCount} חיבורים על המקור הזה. שינוי הכתובת ישפיע על כלל הסשנים האלה. האם להמשיך?`,
        });
      }
    }

    // Since sessions reference waha_source_id (the row ID), updating base_url on the row
    // automatically affects all sessions linked to this source — no data migration needed.
    const source = await sourcesService.updateSource(id, { name, baseUrl, apiKey, webhookBaseUrl, priority });
    res.json({ success: true, source });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת זו כבר קיימת במערכת' });
    console.error('[WahaSources] update error:', e);
    res.status(500).json({ error: 'שגיאה בעדכון מקור' });
  }
}

async function deactivate(req, res) {
  try {
    const { id } = req.params;
    const source = await sourcesService.deactivateSource(id);
    if (!source) return res.status(404).json({ error: 'מקור לא נמצא' });
    res.json({ success: true, source });
  } catch (e) {
    console.error('[WahaSources] deactivate error:', e);
    res.status(500).json({ error: 'שגיאה בביטול מקור' });
  }
}

/**
 * Re-encrypt WAHA source API keys from env vars — fixes "Unsupported state" decryption errors.
 * Updates the Default source (matched by name) with current WAHA_API_KEY re-encrypted with current ENCRYPTION_KEY.
 */
async function reEncryptFromEnv(req, res) {
  try {
    const wahaBaseUrl = process.env.WAHA_BASE_URL;
    const wahaApiKey = process.env.WAHA_API_KEY;
    if (!wahaBaseUrl || !wahaApiKey) {
      return res.status(400).json({ error: 'WAHA_BASE_URL or WAHA_API_KEY not set in environment' });
    }
    const { encrypt } = require('../../services/crypto/encrypt.service');
    const encryptedApiKey = encrypt(wahaApiKey);
    // Update by base_url AND by name 'Default' to cover both matching strategies
    const result = await db.query(`
      UPDATE waha_sources
      SET api_key_enc = $1, updated_at = NOW()
      WHERE base_url = $2 OR name = 'Default'
      RETURNING id, name, base_url
    `, [encryptedApiKey, wahaBaseUrl]);
    console.log(`[WahaSources] Re-encrypted ${result.rowCount} source(s) from env vars`);
    res.json({ success: true, updated: result.rows });
  } catch (e) {
    console.error('[WahaSources] re-encrypt error:', e);
    res.status(500).json({ error: e.message });
  }
}

/**
 * Sync session counts by querying each WAHA server directly.
 * Also reconciles whatsapp_connections.waha_source_id in the DB so that
 * subsequent page loads show the correct counts without needing another sync.
 * Returns sources with live session counts from the actual servers.
 */
async function syncLiveCounts(req, res) {
  try {
    const sourcesRes = await db.query(
      `SELECT id, name, base_url, api_key_enc, webhook_base_url, is_active, priority, created_at, updated_at
       FROM waha_sources ORDER BY priority ASC, created_at ASC`
    );

    // Step 1: Collect all sessions from all servers
    const liveSessionsBySource = {}; // sourceId → [session, ...]
    const sessionNameToSource = {};  // session_name → { sourceId, baseUrl, apiKey }

    await Promise.all(sourcesRes.rows.map(async (src) => {
      let apiKey;
      try { apiKey = decrypt(src.api_key_enc); } catch { return; }
      try {
        const sessions = await wahaSession.getAllSessions(src.base_url, apiKey);
        liveSessionsBySource[src.id] = sessions;
        for (const s of sessions) {
          sessionNameToSource[s.name] = { sourceId: src.id, baseUrl: src.base_url, apiKey };
        }
      } catch { /* server unreachable */ }
    }));

    // Step 2: Reconcile DB — update whatsapp_connections where waha_source_id is stale
    let reconciledCount = 0;
    try {
      const wcRes = await db.query(
        `SELECT id, session_name, waha_source_id FROM whatsapp_connections WHERE session_name IS NOT NULL`
      );
      for (const wc of wcRes.rows) {
        const live = sessionNameToSource[wc.session_name];
        if (live && live.sourceId !== wc.waha_source_id) {
          await db.query(
            `UPDATE whatsapp_connections SET waha_source_id = $1, updated_at = NOW() WHERE id = $2`,
            [live.sourceId, wc.id]
          );
          reconciledCount++;
        }
      }
      if (reconciledCount > 0) {
        console.log(`[WahaSources] Reconciled ${reconciledCount} whatsapp_connections to correct source`);
      }
    } catch (reconcileErr) {
      console.error('[WahaSources] Reconcile error (non-fatal):', reconcileErr.message);
    }

    // Step 3: Build response with live counts
    const activeStatuses = new Set(['WORKING', 'SCAN_QR_CODE', 'STARTING']);
    const results = sourcesRes.rows.map(src => {
      const sessions = liveSessionsBySource[src.id];
      const reachable = sessions !== undefined;
      const liveCount = reachable ? sessions.filter(s => activeStatuses.has(s.status)).length : null;
      return { ...src, session_count: liveCount, reachable };
    });

    res.json({ sources: results, reconciledCount });
  } catch (e) {
    console.error('[WahaSources] syncLiveCounts error:', e);
    res.status(500).json({ error: 'שגיאה בסנכרון' });
  }
}

module.exports = { list, create, update, deactivate, reEncryptFromEnv, syncLiveCounts };
