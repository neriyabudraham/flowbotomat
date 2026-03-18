import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Shield, CheckCircle, XCircle, AlertCircle, Wifi, Users, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../services/api';

const STATUS_LABEL = {
  connected: { label: 'מחובר', cls: 'bg-green-100 text-green-700' },
  disconnected: { label: 'מנותק', cls: 'bg-gray-100 text-gray-600' },
  qr_pending: { label: 'ממתין QR', cls: 'bg-yellow-100 text-yellow-700' },
  failed: { label: 'כשל', cls: 'bg-red-100 text-red-700' },
};

export default function AdminProxySources() {
  const [sources, setSources] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingConns, setLoadingConns] = useState(false);
  const [showConns, setShowConns] = useState(false);
  const [connFilter, setConnFilter] = useState('all'); // all | has_proxy | no_proxy
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [form, setForm] = useState({ base_url: '', api_key: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/proxy-sources');
      setSources(data.sources || []);
      setProxies(data.proxies || []);
    } catch (err) {
      console.error('Failed to load proxy sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadConnections = async () => {
    setLoadingConns(true);
    try {
      const { data } = await api.get('/admin/proxy-sources/connections');
      setConnections(data.connections || []);
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoadingConns(false);
    }
  };

  const toggleConns = () => {
    if (!showConns && connections.length === 0) loadConnections();
    setShowConns(v => !v);
  };

  const openCreate = () => {
    setEditingSource(null);
    setForm({ base_url: '', api_key: '', name: '' });
    setError('');
    setShowForm(true);
  };

  const openEdit = (source) => {
    setEditingSource(source);
    setForm({ base_url: source.base_url || '', api_key: '', name: source.name || '' });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.base_url.trim()) { setError('נדרש Base URL'); return; }
    if (!editingSource && !form.api_key.trim()) { setError('נדרש API Key'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { base_url: form.base_url.trim(), name: form.name.trim() || undefined };
      if (form.api_key.trim()) payload.api_key = form.api_key.trim();
      if (editingSource) {
        await api.put(`/admin/proxy-sources/${editingSource.id}`, payload);
      } else {
        await api.post('/admin/proxy-sources', payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncExisting = async () => {
    if (!window.confirm('לשייך פרוקסי לכל המשתמשים המחוברים שעדיין אין להם פרוקסי?')) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post('/admin/proxy-sources/sync');
      setSyncResult(data);
      load();
      if (showConns) loadConnections();
    } catch (err) {
      setSyncResult({ error: err.response?.data?.error || 'שגיאה בסנכרון' });
    } finally {
      setSyncing(false);
    }
  };

  const handleDeactivate = async (sourceId) => {
    if (!window.confirm('האם לנטרל מקור פרוקסי זה?')) return;
    try {
      await api.delete(`/admin/proxy-sources/${sourceId}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בנטרול');
    }
  };

  const filteredConns = connections.filter(c => {
    if (connFilter === 'has_proxy') return !!c.proxy_ip;
    if (connFilter === 'no_proxy') return !c.proxy_ip;
    return true;
  });

  const withProxy = connections.filter(c => !!c.proxy_ip).length;
  const withoutProxy = connections.filter(c => !c.proxy_ip && c.connection_status === 'connected').length;

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען מקורות פרוקסי...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-purple-600" size={24} />
          <div>
            <h2 className="text-xl font-bold text-gray-900">מקורות פרוקסי</h2>
            <p className="text-sm text-gray-500">ניהול שרתי פרוקסי לבוט העלאת סטטוסים — שיוך אוטומטי לכל לקוח</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw size={18} />
          </button>
          <button
            onClick={handleSyncExisting}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
            title="שייך פרוקסי לכל המשתמשים המחוברים שעדיין אין להם"
          >
            <Users size={16} />
            {syncing ? 'מסנכרן...' : 'שייך קיימים'}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            הוסף מקור
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`rounded-xl p-4 text-sm flex items-start justify-between gap-3 ${syncResult.error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          <div>
            {syncResult.error ? (
              <span>{syncResult.error}</span>
            ) : (
              <span>
                <strong>{syncResult.message}</strong>
                {syncResult.failed > 0 && <span className="mr-2 text-yellow-700">({syncResult.failed} נכשלו)</span>}
              </span>
            )}
          </div>
          <button onClick={() => setSyncResult(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Sources list */}
      {sources.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Shield size={40} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">אין מקורות פרוקסי מוגדרים</p>
          <p className="text-sm text-gray-400 mt-1">הוסף מקור כדי לאפשר שיוך פרוקסי אוטומטי ללקוחות בוט הסטטוסים</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            הוסף מקור ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((src) => (
            <div key={src.id} className={`bg-white rounded-xl border p-5 shadow-sm ${!src.is_active ? 'opacity-60 border-gray-200' : 'border-gray-200 hover:border-purple-300 transition-colors'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {src.is_active ? (
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-gray-400 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-gray-900 truncate">{src.name || src.base_url}</span>
                    {!src.is_active && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">לא פעיל</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1 font-mono">{src.base_url}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    נוצר: {new Date(src.created_at).toLocaleDateString('he-IL')}
                  </div>
                </div>
                {src.is_active && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(src)} className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="עריכה">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDeactivate(src.id)} className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="נטרול">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connections status section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={toggleConns}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users size={18} className="text-purple-600" />
            <span className="font-semibold text-gray-800">מצב שיוך פרוקסי ללקוחות</span>
            {connections.length > 0 && (
              <div className="flex gap-2">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{withProxy} משויכים</span>
                {withoutProxy > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{withoutProxy} מחוברים ללא פרוקסי</span>
                )}
              </div>
            )}
          </div>
          {showConns ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showConns && (
          <div className="border-t border-gray-100">
            {/* Filter tabs */}
            <div className="flex gap-1 px-5 pt-3 pb-2">
              {[
                { key: 'all', label: `הכל (${connections.length})` },
                { key: 'has_proxy', label: `יש פרוקסי (${withProxy})` },
                { key: 'no_proxy', label: `אין פרוקסי (${connections.filter(c => !c.proxy_ip).length})` },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setConnFilter(f.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${connFilter === f.key ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  {f.label}
                </button>
              ))}
              <button onClick={loadConnections} className="mr-auto p-1 text-gray-400 hover:text-gray-600">
                <RefreshCw size={14} />
              </button>
            </div>

            {loadingConns ? (
              <div className="text-center py-6 text-gray-400 text-sm">טוען...</div>
            ) : filteredConns.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">אין תוצאות</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-y border-gray-100">
                    <tr>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">משתמש</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">טלפון</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">סטטוס</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">פרוקסי משויך</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">עדכון אחרון</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredConns.map((c) => {
                      const st = STATUS_LABEL[c.connection_status] || { label: c.connection_status, cls: 'bg-gray-100 text-gray-600' };
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-gray-800">{c.user_name || '—'}</div>
                            <div className="text-xs text-gray-400">{c.user_email}</div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-gray-700">
                            {c.phone_number || '—'}
                            {c.display_name && <div className="text-xs text-gray-400">{c.display_name}</div>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {c.proxy_ip ? (
                              <span className="font-mono text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs">{c.proxy_ip}</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">
                            {c.updated_at ? new Date(c.updated_at).toLocaleDateString('he-IL') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live proxy list from active source */}
      {proxies.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={18} className="text-purple-600" />
            <h3 className="font-semibold text-gray-800">פרוקסים זמינים ({proxies.length})</h3>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">IP</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">פורט</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">סטטוס</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">חיבורים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {proxies.map((proxy, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-gray-800">{proxy.proxyIp || proxy.ip || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{proxy.port || '—'}</td>
                    <td className="px-4 py-2">
                      {proxy.status === 'free' || proxy.isFree ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">פנוי</span>
                      ) : proxy.status === 'assigned' || proxy.isAssigned ? (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">משויך</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{proxy.status || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{proxy.connectionCount ?? proxy.connections ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-5">
                {editingSource ? 'עריכת מקור פרוקסי' : 'הוספת מקור פרוקסי חדש'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם (אופציונלי)</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="proxy.botomat.co.il"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL *</label>
                  <input
                    type="text"
                    value={form.base_url}
                    onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                    placeholder="https://proxy.botomat.co.il"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key {editingSource ? '(השאר ריק לאי-שינוי)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={form.api_key}
                    onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                    placeholder={editingSource ? '••••••• (ללא שינוי)' : 'מפתח API'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    dir="ltr"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-purple-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'שומר...' : 'שמור'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                  className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
