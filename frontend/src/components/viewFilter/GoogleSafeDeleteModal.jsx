import { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, ShieldCheck, Download, Loader, X, CheckCircle, Clock, Smartphone } from 'lucide-react';
import api from '../../services/api';

// Three-step modal for permanent Google Contacts deletion (background job with progress).
// Now supports:
//   - Skipping fresh-backup requirement when an existing backup covers the selection
//   - Background job with incremental cache removal and live progress bar
//   - Works with up to 100k contacts in one job
export default function GoogleSafeDeleteModal({ open, onClose, slot, accountEmail, selectedContacts, filterSummary, onDeleted }) {
  const [step, setStep] = useState(1);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backup, setBackup] = useState(null);
  const [coveringBackup, setCoveringBackup] = useState(null); // an existing backup that covers the selection
  const [backupError, setBackupError] = useState('');
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Background job state
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null); // { status, total_count, deleted_count, failed_count, finished_at }
  const pollRef = useRef(null);

  const count = selectedContacts.length;
  const phrase = useMemo(() => `מחק מגוגל ${count} אנשי קשר`, [count]);

  useEffect(() => {
    if (!open) return;
    setStep(1); setBackup(null); setCoveringBackup(null);
    setTyped(''); setAcknowledged(false);
    setBackupError(''); setDeleteError('');
    setJobId(null); setJob(null);

    // Check if an existing backup already covers the selection
    (async () => {
      try {
        const { data } = await api.post('/contacts/cleanup/google/check-backup-coverage', {
          slot,
          resourceNames: selectedContacts.map(c => c.resource_name),
        });
        if (data.covered) setCoveringBackup(data.backup);
      } catch {}
      // Also check latest backup (fresh one) so step 2 can show it pre-checked
      try {
        const { data } = await api.get(`/contacts/cleanup/google/backups?slot=${slot}`);
        const latest = (data.backups || [])[0];
        if (latest && Date.now() - new Date(latest.created_at).getTime() < 30 * 60 * 1000) {
          setBackup(latest);
        }
      } catch {}
    })();
  }, [open, slot, JSON.stringify(selectedContacts.map(c => c.resource_name).sort()).slice(0, 500)]);

  // Poll job progress
  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const { data } = await api.get(`/contacts/cleanup/google/delete-job/${jobId}`);
        setJob(data.job);
        if (['success', 'partial', 'error'].includes(data.job?.status)) {
          clearInterval(pollRef.current);
          onDeleted?.({
            deletedCount: data.job.deleted_count,
            failedCount: data.job.failed_count,
            status: data.job.status,
          });
        }
      } catch (err) {
        // Keep polling even on transient errors
      }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  if (!open) return null;

  const hasAnyBackup = !!backup || !!coveringBackup;
  const effectiveBackupId = backup?.id || coveringBackup?.id || null;

  const handleCreateBackup = async () => {
    setCreatingBackup(true); setBackupError('');
    try {
      const { data } = await api.post('/contacts/cleanup/google/backups', {
        slot,
        label: `גיבוי לפני מחיקה מגוגל (${count} אנשי קשר)`,
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
    const id = effectiveBackupId;
    if (!id) return;
    try {
      const res = await api.get(`/contacts/cleanup/google/backups/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `google-contacts-backup-${id}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  const handleConfirmDelete = async () => {
    if (typed !== phrase) { setDeleteError('ביטוי האישור אינו תואם בדיוק'); return; }
    if (!acknowledged) { setDeleteError('יש לאשר שאתה מבין שהמחיקה תתפשט לכל המכשירים'); return; }
    setDeleteError('');
    try {
      const { data } = await api.post('/contacts/cleanup/google/safe-delete', {
        slot,
        resourceNames: selectedContacts.map(c => c.resource_name),
        backupId: effectiveBackupId,
        confirmation: typed,
        expectedConfirmation: phrase,
        filterSummary,
        // Allow old-but-complete backups (covering-backup path)
        skipBackupCheck: !backup && !!coveringBackup,
      });
      setJobId(data.jobId);
      setJob({ status: 'running', total_count: data.total, deleted_count: 0, failed_count: 0 });
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  // When job is finished, show summary instead of progress
  const isRunning = jobId && job?.status === 'running';
  const isDone = jobId && ['success', 'partial', 'error'].includes(job?.status);
  const pct = job?.total_count
    ? Math.min(100, Math.round(((job.deleted_count || 0) + (job.failed_count || 0)) / job.total_count * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={!isRunning ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="bg-red-600 rounded-t-2xl px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-white" />
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg">מחיקה מ-Google Contacts</h2>
            <p className="text-red-100 text-sm">
              {accountEmail || `סלוט ${slot}`} • {isDone ? 'הסתיים' : isRunning ? 'מוחק...' : `שלב ${step} מתוך 3`}
            </p>
          </div>
          {!isRunning && (
            <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
          )}
        </div>

        {!jobId && (
          <div className="px-6 pt-4 flex items-center gap-2 flex-shrink-0">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-red-500' : 'bg-gray-200'}`} />
            ))}
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1">
          {/* Progress screen — takes over when job is running */}
          {jobId && (
            <div className="py-4">
              {isRunning && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <Loader className="w-6 h-6 text-red-500 animate-spin" />
                    <h3 className="font-bold text-gray-900 text-lg">המחיקה בעיצומה</h3>
                  </div>
                  <div className="mb-2 flex items-center justify-between text-sm text-gray-700">
                    <span>התקדמות</span>
                    <span className="font-mono font-bold">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-3">
                    <div className="h-3 bg-gradient-to-l from-red-500 to-red-600 transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                      <p className="text-xs text-green-600">נמחקו</p>
                      <p className="font-bold text-green-800 text-lg">{(job?.deleted_count || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                      <p className="text-xs text-red-600">נכשלו</p>
                      <p className="font-bold text-red-800 text-lg">{(job?.failed_count || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <p className="text-xs text-gray-600">סה״כ</p>
                      <p className="font-bold text-gray-800 text-lg">{(job?.total_count || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    אל תסגור את הטאב עד לסיום. המערכת מעדכנת כל 2 שניות.
                  </p>
                </>
              )}

              {isDone && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    {job.status === 'success' && <CheckCircle className="w-6 h-6 text-green-500" />}
                    {job.status === 'partial' && <AlertTriangle className="w-6 h-6 text-amber-500" />}
                    {job.status === 'error'   && <AlertTriangle className="w-6 h-6 text-red-500" />}
                    <h3 className="font-bold text-gray-900 text-lg">
                      {job.status === 'success' ? 'המחיקה הושלמה' : job.status === 'partial' ? 'הושלם חלקית' : 'נכשלה'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm mb-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-600">נמחקו בהצלחה</p>
                      <p className="font-bold text-green-800 text-xl">{(job.deleted_count || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs text-red-600">נכשלו</p>
                      <p className="font-bold text-red-800 text-xl">{(job.failed_count || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-600">סה״כ נבדקו</p>
                      <p className="font-bold text-gray-800 text-xl">{(job.total_count || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {job.error_message && (
                    <p className="text-sm text-red-600 mb-3">{job.error_message}</p>
                  )}
                  <div className="flex justify-end">
                    <button onClick={onClose}
                      className="px-5 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800">
                      סגור
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Wizard steps (only when no job has started) */}
          {!jobId && step === 1 && (
            <>
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4 flex gap-3">
                <Smartphone className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-900 mb-1">המחיקה תתפשט לכל המכשירים</p>
                  <p className="text-sm text-red-800">
                    אנשי הקשר שיימחקו ייעלמו גם מהוואטסאפ, מהטלפון, מ-Gmail וממכל מכשיר שמסונכרן עם <strong>{accountEmail}</strong>.
                  </p>
                </div>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">סקירת הרשימה ({count.toLocaleString()})</h3>
              <p className="text-sm text-gray-500 mb-3">אנשי קשר ברשימה השמורה מוחרגים אוטומטית.</p>
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2 text-right">שם</th>
                      <th className="px-3 py-2 text-right">טלפון</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedContacts.slice(0, 500).map(c => (
                      <tr key={c.resource_name}>
                        <td className="px-3 py-1.5 text-gray-800">{c.display_name || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500" dir="ltr">{c.primary_phone || c.phone_normalized || '—'}</td>
                      </tr>
                    ))}
                    {selectedContacts.length > 500 && (
                      <tr><td colSpan={2} className="px-3 py-2 text-center text-gray-400 text-xs">
                        + עוד {(selectedContacts.length - 500).toLocaleString()} שורות
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

          {!jobId && step === 2 && (
            <>
              <h3 className="font-bold text-gray-900 mb-2">גיבוי</h3>

              {/* Existing-backup shortcut */}
              {coveringBackup && !backup && (
                <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="font-bold text-green-900">גיבוי קיים מכסה את כל הרשימה</p>
                  </div>
                  <p className="text-sm text-green-800 mb-2">
                    נוצר ב-{new Date(coveringBackup.created_at).toLocaleString('he-IL')} • כולל {(coveringBackup.contact_count || 0).toLocaleString()} אנשי קשר.
                    אין צורך ליצור גיבוי חדש.
                  </p>
                  <button onClick={handleDownloadBackup}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50">
                    <Download className="w-4 h-4" /> הורד גיבוי
                  </button>
                </div>
              )}

              {backup && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-medium text-green-800">גיבוי טרי נוצר</p>
                  </div>
                  <p className="text-xs text-green-700">
                    {backup.contact_count?.toLocaleString()} אנשי קשר • {Math.round((backup.size_bytes || 0) / 1024).toLocaleString()} KB
                  </p>
                  <button onClick={handleDownloadBackup}
                    className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50">
                    <Download className="w-4 h-4" /> הורד כקובץ JSON
                  </button>
                </div>
              )}

              {!hasAnyBackup && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-3">
                  <p className="text-sm text-yellow-800 mb-3">עדיין לא נוצר גיבוי שמכסה את הרשימה</p>
                  <button onClick={handleCreateBackup} disabled={creatingBackup}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl font-medium hover:bg-yellow-600 disabled:opacity-50">
                    {creatingBackup
                      ? <><Loader className="w-4 h-4 animate-spin" /> יוצר גיבוי...</>
                      : <><ShieldCheck className="w-4 h-4" /> צור גיבוי עכשיו</>}
                  </button>
                  {backupError && <p className="text-sm text-red-600 mt-2">{backupError}</p>}
                </div>
              )}

              <p className="text-xs text-gray-500">
                שחזור הוא best-effort — Google API לא תומך ב"undelete". שחזור יוצר אנשי קשר חדשים מהגיבוי.
              </p>

              <div className="mt-5 flex gap-3 justify-end">
                <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">חזרה</button>
                <button onClick={() => setStep(3)} disabled={!hasAnyBackup}
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  המשך לאישור סופי
                </button>
              </div>
            </>
          )}

          {!jobId && step === 3 && (
            <>
              <h3 className="font-bold text-gray-900 mb-2">אישור סופי</h3>
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 mb-3 text-sm text-red-800">
                <strong>זוהי פעולה בלתי הפיכה.</strong> אנשי הקשר יימחקו מ-Google Contacts ויעלמו מכל המכשירים שלך תוך דקות.
              </div>

              <label className="flex items-start gap-2 mb-3 text-sm text-gray-700 cursor-pointer p-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50">
                <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="mt-0.5" />
                <span>אני מבין שהמחיקה תתפשט לכל המכשירים המסונכרנים לחשבון <strong>{accountEmail}</strong>, וכי לא ניתן לבטל אותה דרך Google.</span>
              </label>

              <p className="text-sm text-gray-500 mb-2">להמשך, הקלד את הביטוי הבא במדויק:</p>
              <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-center font-mono text-lg text-gray-900 mb-3 select-all">
                {phrase}
              </div>
              <input type="text" value={typed} onChange={e => { setTyped(e.target.value); setDeleteError(''); }}
                placeholder="הקלד כאן את ביטוי האישור..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
                dir="rtl" />
              {deleteError && (
                <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {deleteError}
                </p>
              )}

              <div className="mt-5 flex gap-3 justify-end">
                <button onClick={() => setStep(2)} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">חזרה</button>
                <button onClick={handleConfirmDelete} disabled={typed !== phrase || !acknowledged}
                  className="px-5 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
                  התחל מחיקה
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
