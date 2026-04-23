import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ShieldCheck, Download, Loader, X, CheckCircle, Clock } from 'lucide-react';
import api from '../../services/api';

// Three-step safe-delete dialog:
//   1. Review — show full list of contacts that will be deleted
//   2. Backup — create a fresh backup OR pick a fresh existing one
//   3. Confirm — type the confirmation phrase and click red button
export default function SafeDeleteModal({ open, onClose, selectedContacts, filterSummary, onDeleted }) {
  const [step, setStep] = useState(1);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backup, setBackup] = useState(null); // {id, contact_count, created_at, ...}
  const [backupError, setBackupError] = useState('');
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const count = selectedContacts.length;
  const phrase = useMemo(() => `מחק ${count} אנשי קשר`, [count]);

  useEffect(() => {
    if (open) {
      setStep(1); setBackup(null); setTyped(''); setBackupError(''); setDeleteError('');
      // Auto-detect a fresh existing backup so the user can skip step 2
      (async () => {
        try {
          const { data } = await api.get('/contacts/cleanup/backups');
          const latest = (data.backups || [])[0];
          if (latest && Date.now() - new Date(latest.created_at).getTime() < 30 * 60 * 1000) {
            setBackup(latest);
          }
        } catch {}
      })();
    }
  }, [open]);

  if (!open) return null;

  const handleCreateBackup = async () => {
    setCreatingBackup(true); setBackupError('');
    try {
      const { data } = await api.post('/contacts/cleanup/backups', {
        label: `גיבוי לפני מחיקה (${count} אנשי קשר)`,
        reason: 'pre_delete',
      });
      setBackup(data.backup);
    } catch (err) {
      setBackupError(err.response?.data?.error || 'שגיאה ביצירת גיבוי');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = async () => {
    if (!backup) return;
    try {
      const res = await api.get(`/contacts/cleanup/backups/${backup.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flowbotomat-pre-delete-backup-${backup.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleConfirmDelete = async () => {
    if (typed !== phrase) {
      setDeleteError('ביטוי האישור אינו תואם בדיוק');
      return;
    }
    setDeleting(true); setDeleteError('');
    try {
      const { data } = await api.post('/contacts/cleanup/safe-delete', {
        contactIds: selectedContacts.map(c => c.id),
        backupId: backup.id,
        confirmation: typed,
        expectedConfirmation: phrase,
        filterSummary,
      });
      onDeleted?.(data);
      onClose();
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'שגיאה במחיקה');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-red-500 rounded-t-2xl px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-white" />
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg">מחיקה בטוחה של אנשי קשר</h2>
            <p className="text-red-100 text-sm">שלב {step} מתוך 3</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-2 flex-shrink-0">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-red-500' : 'bg-gray-200'}`} />
          ))}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <>
              <h3 className="font-bold text-gray-900 mb-2">סקירת הרשימה</h3>
              <p className="text-sm text-gray-500 mb-4">
                להלן {count.toLocaleString()} אנשי קשר שיימחקו. ודא שהרשימה מדויקת.
                אנשי קשר ברשימה השמורה (Keep List) מוחרגים אוטומטית.
              </p>
              <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2 text-right">שם</th>
                      <th className="px-3 py-2 text-right">טלפון</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedContacts.slice(0, 500).map(c => (
                      <tr key={c.id}>
                        <td className="px-3 py-1.5 text-gray-800">{c.display_name || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500" dir="ltr">{c.phone}</td>
                      </tr>
                    ))}
                    {selectedContacts.length > 500 && (
                      <tr><td colSpan={2} className="px-3 py-2 text-center text-gray-400 text-xs">
                        + עוד {(selectedContacts.length - 500).toLocaleString()} שורות (לא מוצגות לטובת ביצועים)
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex gap-3 justify-end">
                <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">ביטול</button>
                <button onClick={() => setStep(2)} className="px-4 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800">המשך לגיבוי</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="font-bold text-gray-900 mb-2">גיבוי טרי לפני המחיקה</h3>
              <p className="text-sm text-gray-500 mb-4">
                המערכת תיצור גיבוי מלא של <strong>כל</strong> אנשי הקשר שלך (כולל משתנים ותגיות).
                הגיבוי שמור במערכת ואפשר להוריד אותו כקובץ JSON. <strong>חובה</strong> גיבוי טרי לפני המחיקה.
              </p>

              {!backup ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <p className="text-sm text-yellow-800 mb-3">עדיין לא נוצר גיבוי טרי</p>
                  <button
                    onClick={handleCreateBackup}
                    disabled={creatingBackup}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl font-medium hover:bg-yellow-600 disabled:opacity-50"
                  >
                    {creatingBackup
                      ? <><Loader className="w-4 h-4 animate-spin" /> יוצר גיבוי...</>
                      : <><ShieldCheck className="w-4 h-4" /> צור גיבוי עכשיו</>
                    }
                  </button>
                  {backupError && <p className="text-sm text-red-600 mt-2">{backupError}</p>}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-medium text-green-800">גיבוי נוצר בהצלחה</p>
                  </div>
                  <p className="text-xs text-green-700">
                    {backup.contact_count?.toLocaleString()} אנשי קשר • {Math.round((backup.size_bytes || 0) / 1024).toLocaleString()} KB
                  </p>
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" /> נוצר עכשיו (תקף ל-30 דקות)
                  </p>
                  <button
                    onClick={handleDownloadBackup}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50"
                  >
                    <Download className="w-4 h-4" /> הורד גיבוי כקובץ
                  </button>
                </div>
              )}

              <div className="mt-5 flex gap-3 justify-end">
                <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">חזרה</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!backup}
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  המשך לאישור סופי
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="font-bold text-gray-900 mb-2">אישור סופי</h3>
              <p className="text-sm text-gray-500 mb-4">
                זוהי פעולה <strong>בלתי הפיכה</strong>. אנשי הקשר יימחקו לצמיתות, אך ניתן לשחזר אותם מהגיבוי שנוצר.
                כדי להמשיך, הקלד את הביטוי הבא במדויק:
              </p>
              <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-center font-mono text-lg text-gray-900 mb-3 select-all">
                {phrase}
              </div>
              <input
                type="text"
                value={typed}
                onChange={e => { setTyped(e.target.value); setDeleteError(''); }}
                placeholder="הקלד כאן את ביטוי האישור..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
                dir="rtl"
              />
              {deleteError && (
                <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {deleteError}
                </p>
              )}

              <div className="mt-5 flex gap-3 justify-end">
                <button onClick={() => setStep(2)} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">חזרה</button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting || typed !== phrase}
                  className="px-5 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {deleting
                    ? <><Loader className="w-4 h-4 animate-spin" /> מוחק...</>
                    : <>מחק לצמיתות</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
