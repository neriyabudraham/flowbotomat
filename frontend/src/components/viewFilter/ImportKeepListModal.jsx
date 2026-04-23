import { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader, FileJson, UserCheck, UserX, Edit3 } from 'lucide-react';
import api from '../../services/api';

// Two-step file import:
// 1. Upload file → server parses & returns preview (matched / unmatched)
// 2. User reviews, optionally deselects rows, confirms → bulk add to keep-list
export default function ImportKeepListModal({ open, onClose, onImported }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('file'); // 'file' | 'manual'
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // { items, parsedCount, matchedCount, ... }
  const [excluded, setExcluded] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [manualText, setManualText] = useState('');

  if (!open) return null;

  const reset = () => {
    setPreview(null); setExcluded(new Set()); setError(''); setFilterText(''); setManualText('');
  };

  // Parse manually pasted phones → build a preview-equivalent object locally,
  // then POST to the import endpoint as a synthesized JSON payload (so server
  // can cross-reference with existing contacts + keep-list).
  const handleManualSubmit = async () => {
    const lines = manualText
      .split(/[\n,;]+/)
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) { setError('הדבק לפחות מספר אחד'); return; }
    setError(''); setUploading(true);
    try {
      // Build a JSON "file" in-memory and send through the same import endpoint
      const jsonPayload = JSON.stringify({
        contacts: lines.map(p => ({ phone: p })),
      });
      const blob = new Blob([jsonPayload], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'manual-entry.json');
      fd.append('dryRun', 'true');
      const { data } = await api.post('/contacts/cleanup/keep-list/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      setPreview(data);
      // Manual entry: user presumably WANTS to save everything they typed,
      // including invalid. So start with nothing excluded.
      setExcluded(new Set());
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בניתוח הקלט');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setUploading(true); setPreview(null); setExcluded(new Set());
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dryRun', 'true');
      const { data } = await api.post('/contacts/cleanup/keep-list/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      setPreview(data);
      // Default: invalid phones start UNCHECKED so user must opt-in to save them.
      const initialExcluded = new Set();
      for (const it of (data.items || [])) {
        if (it.valid === false) initialExcluded.add(it.phone);
      }
      setExcluded(initialExcluded);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בקריאת הקובץ');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const toggle = (phone) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  };

  const filteredItems = preview?.items?.filter(i =>
    !filterText
      ? true
      : i.phone.includes(filterText.replace(/[^\d]/g, '')) || (i.name || '').toLowerCase().includes(filterText.toLowerCase())
  ) || [];

  const toAdd = (preview?.items || []).filter(i => !excluded.has(i.phone) && !i.already_kept);
  const hasInvalid = toAdd.some(i => !i.valid);

  const handleConfirm = async () => {
    if (toAdd.length === 0) { handleClose(); return; }
    setBusy(true); setError('');
    try {
      const phones = toAdd.map(i => i.phone);
      await api.post('/contacts/cleanup/keep-list', {
        phones,
        note: 'יובא מקובץ',
        allowInvalid: hasInvalid, // only sent when the selection actually includes non-valid entries
      });
      onImported?.({ added: phones.length });
      handleClose();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהוספה לרשימה השמורה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-l from-purple-500 to-violet-600 rounded-t-2xl px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <Upload className="w-6 h-6 text-white" />
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg">הוספה לרשימה השמורה</h2>
            <p className="text-white/80 text-sm">אנשי הקשר יסומנו כשמורים ולא יימחקו</p>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {!preview && (
          <div className="px-6 pt-4 flex gap-2 flex-shrink-0">
            <button
              onClick={() => { setMode('file'); setError(''); }}
              className={`px-4 py-2 text-sm rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                mode === 'file' ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <Upload className="w-4 h-4" /> מקובץ
            </button>
            <button
              onClick={() => { setMode('manual'); setError(''); }}
              className={`px-4 py-2 text-sm rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                mode === 'manual' ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <Edit3 className="w-4 h-4" /> הזנה ידנית
            </button>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1">
          {!preview && mode === 'manual' && (
            <>
              <p className="text-sm text-gray-600 mb-2">
                הדבק מספרי טלפון — אחד בכל שורה (או מופרדים בפסיק/נקודה־פסיק).
                גם מספרים לא תקינים יישמרו כמו שהם.
              </p>
              <textarea
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder={"972501234567\n0501234567\n+1-212-555-0100\n"}
                rows={12} dir="ltr"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              />
              <div className="mt-3 flex justify-end gap-3">
                <span className="text-xs text-gray-500 self-center mr-auto">
                  {manualText.split(/[\n,;]+/).filter(l => l.trim()).length.toLocaleString()} שורות
                </span>
                <button
                  onClick={handleManualSubmit}
                  disabled={uploading || !manualText.trim()}
                  className="px-5 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 disabled:opacity-40 inline-flex items-center gap-2"
                >
                  {uploading
                    ? <><Loader className="w-4 h-4 animate-spin" /> מנתח...</>
                    : <><CheckCircle className="w-4 h-4" /> המשך לתצוגה מקדימה</>}
                </button>
              </div>
              {error && <p className="text-sm text-red-600 mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
            </>
          )}

          {!preview && mode === 'file' && (
            <>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/30 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-purple-500', 'bg-purple-50/50'); }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-purple-500', 'bg-purple-50/50'); }}
                onDrop={e => {
                  e.preventDefault(); e.currentTarget.classList.remove('border-purple-500', 'bg-purple-50/50');
                  if (e.dataTransfer.files[0]) {
                    fileRef.current.files = e.dataTransfer.files;
                    handleFile({ target: fileRef.current });
                  }
                }}
              >
                {uploading ? (
                  <>
                    <Loader className="w-12 h-12 mx-auto mb-3 text-purple-500 animate-spin" />
                    <p className="text-gray-600">קורא את הקובץ...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-700 mb-1">גרור קובץ לכאן או לחץ לבחירה</p>
                    <p className="text-sm text-gray-500">פורמטים נתמכים: .csv, .vcf, .vcard, .json, .txt — עד 20MB</p>
                  </>
                )}
                <input
                  ref={fileRef} type="file" className="hidden"
                  accept=".csv,.tsv,.vcf,.vcard,.json,.txt,text/csv,text/vcard,application/json,text/plain"
                  onChange={handleFile}
                />
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormatHint icon={<FileText className="w-4 h-4" />} title="CSV" desc="עמודות שכותרתן Phone / Tel / טלפון" />
                <FormatHint icon={<FileText className="w-4 h-4" />} title="VCF / vCard" desc="קובץ אנשי קשר מהוואטסאפ או iPhone" />
                <FormatHint icon={<FileJson className="w-4 h-4" />} title="JSON" desc="מערך עם שדה phone לכל איש קשר" />
              </div>
              {error && <p className="text-sm text-red-600 mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
            </>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat color="purple" label="נמצאו בקובץ" value={preview.parsedCount} />
                <Stat color="green" label="תואמים לאנשי קשר קיימים" value={preview.matchedCount} icon={<UserCheck className="w-4 h-4" />} />
                <Stat color="gray" label="לא תואמים" value={preview.unmatchedCount} icon={<UserX className="w-4 h-4" />} />
              </div>

              {preview.alreadyKeptCount > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800 mb-3">
                  {preview.alreadyKeptCount.toLocaleString()} מספרים כבר ברשימה השמורה — ידולגו אוטומטית.
                </div>
              )}

              {(preview.invalidCount || 0) > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-800 mb-3 flex items-center gap-2 flex-wrap">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    נמצאו <strong>{preview.invalidCount.toLocaleString()}</strong> מספרים לא תקינים (קצרים / ארוכים / חריגים).
                    הם לא מסומנים כברירת מחדל — לחץ "סמן את כל הלא-תקינים" כדי לכלול אותם.
                  </span>
                  <button
                    onClick={() => {
                      // Remove all invalid phones from the excluded set → they become selected
                      setExcluded(prev => {
                        const next = new Set(prev);
                        for (const it of preview.items) {
                          if (it.valid === false) next.delete(it.phone);
                        }
                        return next;
                      });
                    }}
                    className="mr-auto px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600"
                  >
                    סמן את כל הלא-תקינים
                  </button>
                  <button
                    onClick={() => {
                      setExcluded(prev => {
                        const next = new Set(prev);
                        for (const it of preview.items) {
                          if (it.valid === false) next.add(it.phone);
                        }
                        return next;
                      });
                    }}
                    className="px-2 py-1 bg-white border border-orange-300 text-orange-700 rounded text-xs hover:bg-orange-50"
                  >
                    נקה
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 mb-2">
                <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                  placeholder="סנן ברשימה..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                <span className="text-xs text-gray-500">
                  {toAdd.length.toLocaleString()} ייווספו{hasInvalid && ` (כולל ${toAdd.filter(i => !i.valid).length} לא תקינים)`}
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2 text-right w-10"></th>
                      <th className="px-3 py-2 text-right">שם</th>
                      <th className="px-3 py-2 text-right">טלפון</th>
                      <th className="px-3 py-2 text-right">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.slice(0, 1000).map(it => {
                      const isExcluded = excluded.has(it.phone);
                      const willAdd = !isExcluded && !it.already_kept;
                      return (
                        <tr key={it.phone}
                            className={`cursor-pointer ${isExcluded || it.already_kept ? 'opacity-40' : ''}`}
                            onClick={() => !it.already_kept && toggle(it.phone)}>
                          <td className="px-3 py-1.5">
                            <input type="checkbox" checked={willAdd} onChange={() => {}} disabled={it.already_kept} />
                          </td>
                          <td className="px-3 py-1.5">{it.name || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-1.5 text-gray-600" dir="ltr">{it.phone}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              {it.already_kept && (
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">כבר שמור</span>
                              )}
                              {!it.already_kept && it.matches_contact && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">תואם</span>
                              )}
                              {!it.already_kept && !it.matches_contact && (
                                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">חדש</span>
                              )}
                              {it.valid === false && (
                                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">לא תקין</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredItems.length > 1000 && (
                      <tr><td colSpan={4} className="px-3 py-2 text-center text-gray-400 text-xs">
                        + {(filteredItems.length - 1000).toLocaleString()} שורות נוספות (לא מוצגות לטובת ביצועים)
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {error && <p className="text-sm text-red-600 mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
            </>
          )}
        </div>

        {preview && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end flex-shrink-0">
            <button onClick={reset} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
              קובץ אחר
            </button>
            <button onClick={handleClose} className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
              ביטול
            </button>
            <button onClick={handleConfirm} disabled={busy || toAdd.length === 0}
              className="px-5 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
              {busy
                ? <><Loader className="w-4 h-4 animate-spin" /> מוסיף...</>
                : <><CheckCircle className="w-4 h-4" /> הוסף {toAdd.length.toLocaleString()} לרשימה השמורה</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormatHint({ icon, title, desc }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-2 text-gray-700 font-medium text-sm mb-1">{icon} {title}</div>
      <p className="text-xs text-gray-500">{desc}</p>
    </div>
  );
}

function Stat({ color, label, value, icon }) {
  const colors = {
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 text-xs">{icon} {label}</div>
      <div className="text-xl font-bold mt-0.5">{(value || 0).toLocaleString()}</div>
    </div>
  );
}
