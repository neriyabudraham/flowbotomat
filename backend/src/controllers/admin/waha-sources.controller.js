const sourcesService = require('../../services/waha/sources.service');

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

module.exports = { list, create, update, deactivate };
