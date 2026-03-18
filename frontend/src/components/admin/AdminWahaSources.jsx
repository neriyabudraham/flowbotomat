import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Server, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import api from '../../services/api';

export default function AdminWahaSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [form, setForm] = useState({ base_url: '', api_key: '', webhook_base_url: '', priority: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/waha-sources');
      setSources(data.sources || []);
    } catch (err) {
      console.error('Failed to load WAHA sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingSource(null);
    setForm({ base_url: '', api_key: '', webhook_base_url: '', priority: 0 });
    setError('');
    setShowForm(true);
  };

  const openEdit = (source) => {
    setEditingSource(source);
    setForm({
      base_url: source.base_url || '',
      api_key: '',
      webhook_base_url: source.webhook_base_url || '',
      priority: source.priority || 0,
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.base_url.trim()) {
      setError('נדרש Base URL');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingSource) {
        const payload = {
          base_url: form.base_url.trim(),
          webhook_base_url: form.webhook_base_url.trim() || null,
          priority: parseInt(form.priority) || 0,
        };
        if (form.api_key.trim()) payload.api_key = form.api_key.trim();

        const { data } = await api.put(`/admin/waha-sources/${editingSource.id}`, payload);

        if (data.requiresConfirmation) {
          setConfirmDialog({
            sourceId: editingSource.id,
            sessionCount: data.sessionCount,
            payload,
          });
          setSaving(false);
          return;
        }
      } else {
        if (!form.api_key.trim()) {
          setError('נדרש API Key');
          setSaving(false);
          return;
        }
        await api.post('/admin/waha-sources', {
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim(),
          webhook_base_url: form.webhook_base_url.trim() || null,
          priority: parseInt(form.priority) || 0,
        });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmBaseUrlChange = async () => {
    if (!confirmDialog) return;
    setSaving(true);
    try {
      await api.put(`/admin/waha-sources/${confirmDialog.sourceId}`, {
        ...confirmDialog.payload,
        confirmBaseUrlChange: true,
      });
      setConfirmDialog(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (sourceId) => {
    if (!window.confirm('האם לנטרל מקור WAHA זה? לא ניתן להקצות אליו סשנים חדשים, אבל סשנים קיימים ימשיכו לעבוד.')) return;
    try {
      await api.delete(`/admin/waha-sources/${sourceId}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בנטרול');
    }
  };


  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען מקורות WAHA...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="text-blue-600" size={24} />
          <div>
            <h2 className="text-xl font-bold text-gray-900">מקורות WAHA</h2>
            <p className="text-sm text-gray-500">ניהול שרתי WAHA — תמיכה במספר שרתים עם איזון עומסים</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw size={18} />
          </button>
<button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            הוסף מקור
          </button>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Server size={40} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">אין מקורות WAHA מוגדרים</p>
          <p className="text-sm text-gray-400 mt-1">המערכת משתמשת במשתני סביבה (WAHA_BASE_URL)</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            הוסף מקור ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((src) => (
            <div key={src.id} className={`bg-white rounded-xl border p-5 shadow-sm ${!src.is_active ? 'opacity-60 border-gray-200' : 'border-gray-200 hover:border-blue-300 transition-colors'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {src.is_active ? (
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-gray-400 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-gray-900 truncate">{src.base_url}</span>
                    {!src.is_active && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">לא פעיל</span>
                    )}
                    {src.priority > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">עדיפות {src.priority}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm">
                    <div className="text-gray-500">
                      <span className="font-medium">סשנים פעילים: </span>
                      <span className="text-gray-900">{src.session_count ?? '—'}</span>
                    </div>
                    {src.webhook_base_url && (
                      <div className="text-gray-500 truncate">
                        <span className="font-medium">Webhook: </span>
                        <span className="text-gray-900">{src.webhook_base_url}</span>
                      </div>
                    )}
                    <div className="text-gray-500">
                      <span className="font-medium">נוצר: </span>
                      <span className="text-gray-900">{new Date(src.created_at).toLocaleDateString('he-IL')}</span>
                    </div>
                  </div>
                </div>
                {src.is_active && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEdit(src)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="עריכה"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeactivate(src.id)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="נטרול"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-5">
                {editingSource ? 'עריכת מקור WAHA' : 'הוספת מקור WAHA חדש'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL *</label>
                  <input
                    type="text"
                    value={form.base_url}
                    onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                    placeholder="https://waha.example.com או http://waha:3000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    placeholder={editingSource ? '••••••• (ללא שינוי)' : 'מפתח API של WAHA'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    dir="ltr"
                  />
                  {editingSource && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ אם יש שגיאת פענוח ("Unsupported state") — חובה להזין מחדש את ה-API Key ולשמור
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Base URL
                    <span className="text-gray-400 font-normal mr-1">(אופציונלי — לשרתים פנימיים)</span>
                  </label>
                  <input
                    type="text"
                    value={form.webhook_base_url}
                    onChange={e => setForm(f => ({ ...f, webhook_base_url: e.target.value }))}
                    placeholder="http://app:4000 (ריק = APP_URL)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות (0 = גבוהה)</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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

      {/* Base URL Change Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertCircle className="text-yellow-600" size={20} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">אישור שינוי Base URL</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              שינוי ה-Base URL ישפיע על{' '}
              <span className="font-bold text-gray-900">{confirmDialog.sessionCount} סשנים</span>{' '}
              המחוברים למקור זה. כל הסשנים יועברו אוטומטית לכתובת החדשה.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-6">
              ⚠️ ודא שהכתובת החדשה פעילה לפני האישור. סשנים שנסמכים על WAHA ישתמשו בכתובת החדשה מיד.
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmBaseUrlChange}
                disabled={saving}
                className="flex-1 bg-yellow-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'מעדכן...' : 'אשר שינוי'}
              </button>
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={saving}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
