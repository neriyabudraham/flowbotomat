const proxyService = require('../../services/proxy/proxy.service');

async function list(req, res) {
  try {
    const sources = await proxyService.listSources();
    // Also fetch live proxy list from active source
    const proxies = await proxyService.listAllProxies();
    res.json({ sources, proxies });
  } catch (e) {
    console.error('[ProxySources] list error:', e);
    res.status(500).json({ error: 'שגיאה בטעינת מקורות פרוקסי' });
  }
}

async function create(req, res) {
  try {
    const baseUrl = (req.body.baseUrl || req.body.base_url || '').trim();
    const apiKey = (req.body.apiKey || req.body.api_key || '').trim();
    const name = (req.body.name || baseUrl).trim();

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ error: 'כתובת ו-API key הם שדות חובה' });
    }
    const source = await proxyService.createSource({ name, baseUrl, apiKey, createdBy: req.user?.id });
    res.json({ success: true, source });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת זו כבר קיימת במערכת' });
    console.error('[ProxySources] create error:', e);
    res.status(500).json({ error: 'שגיאה ביצירת מקור פרוקסי' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const baseUrl = (req.body.baseUrl || req.body.base_url || '').trim() || undefined;
    const apiKey = (req.body.apiKey || req.body.api_key || '').trim() || undefined;
    const name = req.body.name;
    const isActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;

    const source = await proxyService.updateSource(id, { name, baseUrl, apiKey, isActive });
    if (!source) return res.status(404).json({ error: 'מקור לא נמצא' });
    res.json({ success: true, source });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת זו כבר קיימת במערכת' });
    console.error('[ProxySources] update error:', e);
    res.status(500).json({ error: 'שגיאה בעדכון מקור פרוקסי' });
  }
}

async function deactivate(req, res) {
  try {
    const { id } = req.params;
    const source = await proxyService.deactivateSource(id);
    if (!source) return res.status(404).json({ error: 'מקור לא נמצא' });
    res.json({ success: true, source });
  } catch (e) {
    console.error('[ProxySources] deactivate error:', e);
    res.status(500).json({ error: 'שגיאה בנטרול מקור פרוקסי' });
  }
}

module.exports = { list, create, update, deactivate };
