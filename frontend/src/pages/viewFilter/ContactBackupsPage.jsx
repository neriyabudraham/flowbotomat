import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, Download, Trash2, Upload, RefreshCw,
  AlertCircle, CheckCircle, Loader, FileJson, History, Plus, Clock, X, Shield
} from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';

export default function ContactBackupsPage() {
  const navigate = useNavigate();
  const { user, fetchMe, logout } = useAuthStore();
  const isAdmin = (() => {
    if (user && ['admin', 'superadmin'].includes(user.role)) return true;
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.viewingAs && payload.accessType === 'admin') return true;
      }
    } catch (e) {}
    return false;
  })();
  useEffect(() => { fetchMe(); }, []);
  const [backups, setBackups] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showRestore, setShowRestore] = useState(null); // backup obj or {fromFile: true, payload}
  const fileRef = useRef(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setError('');
    try {
      const [bks, lg] = await Promise.all([
        api.get('/contacts/cleanup/backups'),
        api.get('/contacts/cleanup/deletion-log'),
      ]);
      setBackups(bks.data.backups || []);
      setLog(lg.data.log || []);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/contacts/cleanup/backups', {
        label: `גיבוי ידני — ${new Date().toLocaleString('he-IL')}`,
        reason: 'manual',
      });
      setSuccess(`גיבוי נוצר בהצלחה (${data.backup.contact_count?.toLocaleString()} אנשי קשר)`);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה ביצירת גיבוי');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (backup) => {
    try {
      const res = await api.get(`/contacts/cleanup/backups/${backup.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date(backup.created_at).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `flowbotomat-backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('שגיאה בהורדת גיבוי');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/contacts/cleanup/backups/${id}`);
      setSuccess('גיבוי נמחק');
      setConfirmDelete(null);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה במחיקת גיבוי');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload?.contacts || !Array.isArray(payload.contacts)) {
        setError('קובץ הגיבוי אינו תקין (חסר שדה contacts)');
        return;
      }
      setShowRestore({ fromFile: true, payload, name: file.name });
    } catch (err) {
      setError('כשל בקריאת הקובץ — ודא שזהו קובץ JSON תקין');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50" dir="rtl">
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/view-filter/cleanup')}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              title="חזרה למסך הניקוי"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="h-8 w-px bg-gray-200" />
            <Logo />
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => navigate('/admin')}
                className="p-2 hover:bg-red-50 rounded-xl transition-colors group" title="ממשק ניהול">
                <Shield className="w-5 h-5 text-red-500 group-hover:text-red-600" />
              </button>
            )}
            <NotificationsDropdown />
            <div className="h-8 w-px bg-gray-200" />
            <AccountSwitcher />
            <button onClick={() => { logout(); navigate('/login'); }}
              className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors">
              התנתק
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {/* Page title */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-purple-500" />
              גיבויים ושחזור אנשי קשר
            </h1>
            <p className="text-sm text-gray-500 mt-1">צור גיבוי, שחזר מתוך גיבוי קיים או מקובץ JSON שהורד.</p>
          </div>
          <button onClick={loadAll} className="p-2 hover:bg-gray-100 rounded-xl" title="רענון">
            <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Top actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleCreate} disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 disabled:opacity-50"
          >
            {creating ? <><Loader className="w-4 h-4 animate-spin" /> יוצר...</> : <><Plus className="w-4 h-4" /> צור גיבוי חדש</>}
          </button>
          <input type="file" accept="application/json" ref={fileRef} onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" /> שחזר מקובץ
          </button>
          <span className="text-sm text-gray-400 mr-auto">
            עד 50 גיבויים נשמרים — הישנים נמחקים אוטומטית
          </span>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
            <button onClick={() => setError('')} className="mr-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> <span>{success}</span>
            <button onClick={() => setSuccess('')} className="mr-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Backups list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-500" />
            <h2 className="font-bold text-gray-900">גיבויים שמורים</h2>
            <span className="text-sm text-gray-400">({backups.length})</span>
          </div>
          {backups.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-400">
              <FileJson className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              עדיין אין גיבויים
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {backups.map(b => (
                <div key={b.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50/40">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <FileJson className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {b.label || 'גיבוי ללא תיאור'}
                      <ReasonBadge reason={b.reason} />
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(b.created_at).toLocaleString('he-IL')}</span>
                      <span>{(b.contact_count || 0).toLocaleString()} אנשי קשר</span>
                      <span>{Math.round((b.size_bytes || 0) / 1024).toLocaleString()} KB</span>
                    </p>
                  </div>
                  <button onClick={() => handleDownload(b)}
                    className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="הורד">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => setShowRestore(b)}
                    className="px-3 py-1.5 text-sm text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50">
                    שחזר
                  </button>
                  <button onClick={() => setConfirmDelete(b)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="מחק">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deletion log */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <History className="w-5 h-5 text-gray-500" />
            <h2 className="font-bold text-gray-900">היסטוריית מחיקות</h2>
            <span className="text-sm text-gray-400">({log.length})</span>
          </div>
          {log.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">לא בוצעו מחיקות</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {log.map(l => (
                <div key={l.id} className="px-5 py-3 flex items-center gap-4 text-sm">
                  <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-800">
                      נמחקו <strong>{l.deleted_count?.toLocaleString()}</strong> אנשי קשר
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(l.created_at).toLocaleString('he-IL')}
                      {l.backup_id && <> • גיבוי: {l.backup_label || 'ללא שם'}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {confirmDelete && (
        <SimpleModal title="מחיקת גיבוי" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-600 mb-4">
            למחוק את הגיבוי <strong>{confirmDelete.label || confirmDelete.id}</strong>? לא ניתן לשחזר את הגיבוי לאחר המחיקה.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-gray-200 rounded-xl">ביטול</button>
            <button onClick={() => handleDelete(confirmDelete.id)} className="px-4 py-2 bg-red-500 text-white rounded-xl">מחק</button>
          </div>
        </SimpleModal>
      )}

      {showRestore && (
        <RestoreModal
          backup={showRestore}
          onClose={() => setShowRestore(null)}
          onRestored={(result) => {
            setSuccess(`שחזור הושלם: ${result.restored} חדשים, ${result.updated} עודכנו, ${result.skipped} דולגו`);
            setShowRestore(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function ReasonBadge({ reason }) {
  const map = {
    pre_delete: { txt: 'לפני מחיקה', cls: 'bg-red-50 text-red-600 border-red-100' },
    manual:     { txt: 'ידני', cls: 'bg-purple-50 text-purple-600 border-purple-100' },
    auto:       { txt: 'אוטומטי', cls: 'bg-blue-50 text-blue-600 border-blue-100' },
  };
  const r = map[reason] || map.manual;
  return <span className={`mr-2 inline-block text-xs px-1.5 py-0.5 rounded border ${r.cls}`}>{r.txt}</span>;
}

function SimpleModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function RestoreModal({ backup, onClose, onRestored }) {
  const [mode, setMode] = useState('restore_missing');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const isFile = !!backup.fromFile;
  const meta = isFile
    ? { label: backup.name, count: backup.payload?.contacts?.length || 0 }
    : { label: backup.label || backup.id, count: backup.contact_count };

  const handleRestore = async () => {
    setBusy(true); setErr('');
    try {
      const body = isFile
        ? { mode, payload: backup.payload }
        : { mode, backupId: backup.id };
      const { data } = await api.post('/contacts/cleanup/backups/restore', body);
      onRestored(data);
    } catch (e) {
      setErr(e.response?.data?.error || 'שגיאה בשחזור');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SimpleModal title="שחזור אנשי קשר" onClose={onClose}>
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-sm">
        <p className="font-medium text-purple-900">{meta.label}</p>
        <p className="text-xs text-purple-700 mt-0.5">{(meta.count || 0).toLocaleString()} אנשי קשר בגיבוי</p>
      </div>

      <p className="text-sm text-gray-600 mb-2">בחר אופן שחזור:</p>
      <div className="space-y-2 mb-4">
        <label className={`flex gap-3 p-3 border-2 rounded-xl cursor-pointer ${mode === 'restore_missing' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
          <input type="radio" checked={mode === 'restore_missing'} onChange={() => setMode('restore_missing')} className="mt-0.5" />
          <div>
            <p className="font-medium text-sm text-gray-900">שחזר רק חסרים</p>
            <p className="text-xs text-gray-500">אנשי קשר שכבר קיימים — לא יישנו. אנשי קשר שנמחקו — ייווצרו מחדש. (מומלץ)</p>
          </div>
        </label>
        <label className={`flex gap-3 p-3 border-2 rounded-xl cursor-pointer ${mode === 'merge' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
          <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-0.5" />
          <div>
            <p className="font-medium text-sm text-gray-900">מיזוג מלא</p>
            <p className="text-xs text-gray-500">שחזר את החסרים + עדכן שמות, תגיות ומשתנים מהגיבוי גם לקיימים. לא נמחקים אנשי קשר.</p>
          </div>
        </label>
      </div>

      {err && <p className="text-sm text-red-600 mb-2 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {err}</p>}

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600">ביטול</button>
        <button onClick={handleRestore} disabled={busy}
          className="px-4 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 disabled:opacity-50 inline-flex items-center gap-2">
          {busy ? <><Loader className="w-4 h-4 animate-spin" /> משחזר...</> : <>שחזר עכשיו</>}
        </button>
      </div>
    </SimpleModal>
  );
}
