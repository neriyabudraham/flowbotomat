import { useState, useEffect, useRef } from 'react';
import {
  X, Upload, FileText, Trash2, Plus, AlertCircle,
  Loader2, CheckCircle, ToggleLeft, ToggleRight, Eye, Search,
  Mail, ExternalLink, TrendingUp, Link2, List, UserPlus, RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

const TABS = [
  { id: 'google', label: 'ייבוא מגוגל', icon: Mail },
  { id: 'file', label: 'קובץ / הדבקה', icon: Upload },
  { id: 'quick', label: 'הוספה מהירה', icon: Plus },
  { id: 'list', label: 'הרשימה', icon: List },
];

export default function ImportedContactsModal({ isOpen, onClose, authorizedNumberId = null, senderLabel = null }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  // Shared param for scoping all requests to a specific authorized sender (or null = connection-level)
  const scopeParams = authorizedNumberId ? { authorized_number_id: authorizedNumberId } : {};
  const scopeQuery = authorizedNumberId ? `?authorized_number_id=${encodeURIComponent(authorizedNumberId)}` : '';

  const [activeTab, setActiveTab] = useState('google');

  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50000);
  const [useImported, setUseImported] = useState(true);

  const [mode, setMode] = useState('append'); // 'append' | 'replace'
  const [manualText, setManualText] = useState('');
  const [file, setFile] = useState(null);

  const [previewResult, setPreviewResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [adding, setAdding] = useState(false);

  const [search, setSearch] = useState('');

  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googlePreviewing, setGooglePreviewing] = useState(false);
  const [googleImporting, setGoogleImporting] = useState(false);
  // Which Google accounts (slots) to pull from. Empty array = all.
  const [selectedSlots, setSelectedSlots] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('google');
      setPreviewResult(null);
      loadList();
      loadGoogleStatus();
    }
  }, [isOpen]);

  async function loadList() {
    setLoading(true);
    try {
      const { data } = await api.get(`/status-bot/imported-contacts${scopeQuery}`);
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
      setLimit(data.limit || 50000);
      setUseImported(data.use_imported_contacts !== false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בטעינת רשימה');
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleStatus() {
    setGoogleLoading(true);
    try {
      const { data } = await api.get('/status-bot/imported-contacts/google/status');
      setGoogleStatus(data);
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setGoogleLoading(false);
    }
  }

  function buildFormData() {
    const fd = new FormData();
    fd.append('mode', mode);
    if (authorizedNumberId) fd.append('authorized_number_id', authorizedNumberId);
    if (file) fd.append('file', file);
    else if (manualText.trim()) fd.append('manual', manualText);
    return fd;
  }

  function resetFileInputs() {
    setFile(null);
    setManualText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── File / Manual ─────────────────────────────────────
  async function handlePreview() {
    if (!file && !manualText.trim()) {
      toast.error('יש להעלות קובץ או להזין רשימה');
      return;
    }
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const { data } = await api.post('/status-bot/imported-contacts/preview', buildFormData(), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviewResult(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בפרסור');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!previewResult) return;
    if (previewResult.summary?.exceeds_limit) {
      if (!confirm(`הרשימה תחרוג מהמגבלה (${previewResult.summary.limit.toLocaleString()}). רק חלק ייכנס. להמשיך?`)) return;
    }
    setImporting(true);
    try {
      const { data } = await api.post('/status-bot/imported-contacts/import', buildFormData(), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`נוספו ${data.inserted.toLocaleString()} אנשי קשר חדשים`);
      setPreviewResult(null);
      resetFileInputs();
      await loadList();
      setActiveTab('list');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setImporting(false);
    }
  }

  // ── Google ────────────────────────────────────────────
  async function handleGooglePreview() {
    setGooglePreviewing(true);
    setPreviewResult(null);
    try {
      // Empty selectedSlots → backend treats as "all connected accounts"
      const payload = { mode, ...scopeParams };
      if (selectedSlots.length > 0) payload.slots = selectedSlots;
      const { data } = await api.post('/status-bot/imported-contacts/google/preview', payload);
      setPreviewResult(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בטעינה מגוגל');
    } finally {
      setGooglePreviewing(false);
    }
  }

  async function handleGoogleImport() {
    if (!previewResult || previewResult.source !== 'google') return;
    if (previewResult.summary?.exceeds_limit) {
      if (!confirm(`הרשימה תחרוג מהמגבלה (${previewResult.summary.limit.toLocaleString()}). רק חלק יישמר. להמשיך?`)) return;
    }
    setGoogleImporting(true);
    try {
      const payload = { mode, ...scopeParams };
      if (selectedSlots.length > 0) payload.slots = selectedSlots;
      const { data } = await api.post('/status-bot/imported-contacts/google/import', payload);
      toast.success(`נוספו ${data.inserted.toLocaleString()} אנשי קשר מגוגל`);
      setPreviewResult(null);
      await loadList();
      setActiveTab('list');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בייבוא מגוגל');
    } finally {
      setGoogleImporting(false);
    }
  }

  function copyGoogleAuthLink() {
    // Prefer the clean shareable `/connect/:userId/integrations` path over the
    // raw Google OAuth URL — shorter and matches the Settings → Integrations
    // flow the user is already familiar with.
    const shortLink = googleStatus?.shareablePath
      ? `${window.location.origin}${googleStatus.shareablePath}`
      : googleStatus?.authUrl;
    if (!shortLink) return;
    try {
      navigator.clipboard.writeText(shortLink);
      toast.success('הלינק הועתק — שתף אותו עם מי שצריך לחבר את חשבון גוגל');
    } catch {
      toast.error('לא ניתן להעתיק — העתק ידנית');
    }
  }

  // ── Quick add (phone only) ────────────────────────────
  async function handleQuickAdd() {
    if (!quickAddPhone.trim()) return;
    setAdding(true);
    try {
      const { data } = await api.post('/status-bot/imported-contacts/add', {
        phone: quickAddPhone,
        ...scopeParams,
      });
      setContacts(prev => [data.contact, ...prev]);
      setTotal(t => t + 1);
      setQuickAddPhone('');
      toast.success('המספר נוסף');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בהוספה');
    } finally {
      setAdding(false);
    }
  }

  // ── List ops ──────────────────────────────────────────
  async function handleRemoveOne(id) {
    if (!confirm('להסיר את המספר?')) return;
    try {
      await api.delete(`/status-bot/imported-contacts/${id}${scopeQuery}`);
      setContacts(prev => prev.filter(c => c.id !== id));
      setTotal(t => Math.max(0, t - 1));
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה במחיקה');
    }
  }

  async function handleClearAll() {
    if (!confirm(`למחוק את כל ${total.toLocaleString()} המספרים ברשימה?`)) return;
    try {
      const { data } = await api.delete(`/status-bot/imported-contacts${scopeQuery}`);
      toast.success(`נמחקו ${data.deleted.toLocaleString()} מספרים`);
      await loadList();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה במחיקה');
    }
  }

  async function handleToggle() {
    const next = !useImported;
    try {
      await api.patch('/status-bot/imported-contacts/toggle', { enabled: next });
      setUseImported(next);
      toast.success(next ? 'הרשימה פעילה' : 'הרשימה הושבתה');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה');
    }
  }

  const filteredContacts = search.trim()
    ? contacts.filter(c =>
        c.phone.includes(search) ||
        (c.display_name && c.display_name.toLowerCase().includes(search.toLowerCase()))
      )
    : contacts;

  if (!isOpen) return null;

  const fillPct = limit > 0 ? Math.min(100, (total / limit) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col max-h-[calc(100vh-4rem)]"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header — compact, always visible */}
        <div className="p-5 border-b bg-gradient-to-l from-indigo-50 via-purple-50 to-blue-50 rounded-t-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900">
                רשימת אנשי קשר מיובאים
                {senderLabel && <span className="text-indigo-700 mr-2">— {senderLabel}</span>}
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {authorizedNumberId
                  ? 'אנשי קשר פרטיים של המשתמש הזה — יישלחו לסטטוסים שהוא מעלה, בנוסף לרשימה הכללית'
                  : 'רק עבור שליחת סטטוסים בפורמט אנשי קשר — לא נשמרים כאנשי קשר במערכת'}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/70 rounded-lg transition" aria-label="סגור">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats row */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-white/80 flex items-center gap-3 flex-1 min-w-[200px]">
              <div className="flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-indigo-700">{total.toLocaleString()}</span>
                  <span className="text-xs text-gray-500">/ {limit.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-indigo-500 to-purple-500 transition-all"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            </div>
            {!authorizedNumberId && (
              <button
                onClick={handleToggle}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
                  useImported
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {useImported ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {useImported ? 'פעיל' : 'מושבת'}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPreviewResult(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition relative ${
                  active
                    ? 'text-indigo-700 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.id === 'list' && total > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-semibold">
                    {total > 999 ? `${Math.floor(total / 1000)}K` : total}
                  </span>
                )}
                {active && <span className="absolute bottom-0 right-0 left-0 h-0.5 bg-indigo-600" />}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'google' && <GoogleTab
            googleStatus={googleStatus}
            googleLoading={googleLoading}
            googlePreviewing={googlePreviewing}
            googleImporting={googleImporting}
            mode={mode}
            setMode={setMode}
            previewResult={previewResult}
            selectedSlots={selectedSlots}
            setSelectedSlots={setSelectedSlots}
            onPreview={handleGooglePreview}
            onImport={handleGoogleImport}
            onRefresh={loadGoogleStatus}
            onCopyLink={copyGoogleAuthLink}
          />}
          {activeTab === 'file' && <FileTab
            file={file}
            setFile={setFile}
            manualText={manualText}
            setManualText={setManualText}
            mode={mode}
            setMode={setMode}
            previewing={previewing}
            importing={importing}
            previewResult={previewResult}
            fileInputRef={fileInputRef}
            onPreview={handlePreview}
            onImport={handleImport}
            onReset={() => { resetFileInputs(); setPreviewResult(null); }}
          />}
          {activeTab === 'quick' && <QuickTab
            phone={quickAddPhone}
            setPhone={setQuickAddPhone}
            adding={adding}
            onAdd={handleQuickAdd}
          />}
          {activeTab === 'list' && <ListTab
            loading={loading}
            contacts={filteredContacts}
            total={total}
            search={search}
            setSearch={setSearch}
            onRemoveOne={handleRemoveOne}
            onClearAll={handleClearAll}
          />}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Tabs
// ══════════════════════════════════════════════════════

function GoogleTab({ googleStatus, googleLoading, googlePreviewing, googleImporting, mode, setMode, previewResult, selectedSlots, setSelectedSlots, onPreview, onImport, onRefresh, onCopyLink }) {
  if (googleLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  if (!googleStatus?.connected) {
    return (
      <div className="max-w-md mx-auto text-center py-8 space-y-4">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <Mail className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">חיבור חשבון גוגל</h3>
          <p className="text-sm text-gray-600 mt-1">
            התחבר לחשבון גוגל שלך כדי לייבא את אנשי הקשר ישירות לרשימה
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {(googleStatus?.shareablePath || googleStatus?.authUrl) && (
            <>
              <a
                href={googleStatus.shareablePath || googleStatus.authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                התחבר לגוגל
              </a>
              <button
                onClick={onCopyLink}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                <Link2 className="w-4 h-4" />
                העתק לינק
              </button>
            </>
          )}
        </div>
        <button onClick={onRefresh} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> רענן סטטוס חיבור
        </button>
      </div>
    );
  }

  const accounts = Array.isArray(googleStatus?.accounts) ? googleStatus.accounts : [];
  const multipleAccounts = accounts.length > 1;
  const effectiveSelected = selectedSlots?.length ? selectedSlots : accounts.map(a => a.slot);

  function toggleSlot(slot) {
    if (!setSelectedSlots) return;
    const cur = selectedSlots?.length ? selectedSlots : accounts.map(a => a.slot);
    const next = cur.includes(slot) ? cur.filter(s => s !== slot) : [...cur, slot];
    // Prevent empty selection — if the user unchecked everything, revert to "all"
    if (next.length === 0) {
      setSelectedSlots([]);
    } else if (next.length === accounts.length) {
      setSelectedSlots([]); // all selected → treat as "all" (pass no filter)
    } else {
      setSelectedSlots(next);
    }
  }

  return (
    <div className="space-y-5">
      {/* Connected banner — single account */}
      {!multipleAccounts && accounts[0] && (
        <div className="bg-gradient-to-l from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{accounts[0].email}</p>
            <p className="text-xs text-gray-600">מחובר</p>
          </div>
        </div>
      )}

      {/* Multi-account picker */}
      {multipleAccounts && (
        <div className="bg-gradient-to-l from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-gray-900">
              {accounts.length} חשבונות גוגל מחוברים — בחר ממי למשוך אנשי קשר
            </p>
          </div>
          <div className="space-y-2">
            {accounts.map(a => {
              const checked = effectiveSelected.includes(a.slot);
              return (
                <label
                  key={a.slot}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border-2 cursor-pointer transition ${
                    checked ? 'border-green-400 bg-white' : 'border-gray-200 bg-white/60 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSlot(a.slot)}
                    className="w-4 h-4 accent-green-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.email}</p>
                    {a.name && <p className="text-xs text-gray-500 truncate">{a.name}</p>}
                  </div>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-600 mt-2">
            {selectedSlots?.length > 0 && selectedSlots.length < accounts.length
              ? `${selectedSlots.length} מתוך ${accounts.length} נבחרו`
              : 'כל החשבונות ייכללו — כפילויות בטלפון יוסרו אוטומטית'}
          </p>
        </div>
      )}

      {/* Mode selector */}
      <ModeSelector mode={mode} setMode={setMode} />

      {/* Action */}
      <div className="flex justify-center">
        <button
          onClick={onPreview}
          disabled={googlePreviewing}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 font-medium shadow-sm"
        >
          {googlePreviewing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
          טען אנשי קשר מגוגל
        </button>
      </div>

      {previewResult?.source === 'google' && (
        <>
          <PreviewSummary previewResult={previewResult} />
          <div className="flex justify-center">
            <button
              onClick={onImport}
              disabled={googleImporting || !previewResult.summary?.new_contacts}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium shadow-sm"
            >
              {googleImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              שמור {previewResult.summary.new_contacts.toLocaleString()} מספרים לרשימה
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FileTab({ file, setFile, manualText, setManualText, mode, setMode, previewing, importing, previewResult, fileInputRef, onPreview, onImport, onReset }) {
  return (
    <div className="space-y-5">
      <div className="text-center py-2">
        <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-2">
          <Upload className="w-7 h-7 text-purple-600" />
        </div>
        <p className="text-sm text-gray-600">העלה קובץ CSV או VCF, או הדבק רשימת מספרים</p>
      </div>

      <ModeSelector mode={mode} setMode={setMode} />

      {/* File */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">קובץ CSV / VCF</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.vcf,.vcard,text/csv,text/vcard"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={!!manualText}
          className="block w-full text-sm border rounded-lg px-3 py-2 file:ml-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-purple-100 file:text-purple-700 file:cursor-pointer file:font-medium hover:file:bg-purple-200 disabled:opacity-50"
        />
        {manualText && <p className="text-xs text-gray-500 mt-1">נקה את הטקסט למטה כדי להעלות קובץ</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200"></div>
        <span className="text-xs text-gray-400">או</span>
        <div className="flex-1 border-t border-gray-200"></div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">הדבק מספרים</label>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="0501234567&#10;972501234567&#10;+44 7700 900000"
          rows={4}
          disabled={!!file}
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 mt-1">שורה לכל מספר או מופרדים בפסיק</p>
      </div>

      <div className="flex gap-2 flex-wrap justify-center pt-2">
        <button
          onClick={onPreview}
          disabled={previewing || (!file && !manualText.trim())}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          תצוגה מקדימה
        </button>
        {(file || manualText || previewResult) && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-700 border rounded-lg hover:bg-gray-50"
          >
            נקה
          </button>
        )}
      </div>

      {previewResult && previewResult.source !== 'google' && (
        <>
          <PreviewSummary previewResult={previewResult} />
          <div className="flex justify-center">
            <button
              onClick={onImport}
              disabled={importing || !previewResult.summary?.new_contacts}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium shadow-sm"
            >
              {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              שמור {previewResult.summary.new_contacts.toLocaleString()} מספרים
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function QuickTab({ phone, setPhone, adding, onAdd }) {
  return (
    <div className="max-w-sm mx-auto py-6 space-y-4">
      <div className="text-center">
        <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2">
          <UserPlus className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-semibold text-gray-900">הוספת מספר בודד</h3>
        <p className="text-sm text-gray-600 mt-1">מספר טלפון אחד — הוספה מהירה ישירות לרשימה</p>
      </div>

      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && phone.trim() && onAdd()}
        placeholder="0501234567 או +44 7700 900000"
        className="w-full border rounded-lg px-4 py-3 text-base font-mono text-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
        autoFocus
      />

      <button
        onClick={onAdd}
        disabled={adding || !phone.trim()}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
      >
        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        הוסף לרשימה
      </button>

      <p className="text-xs text-center text-gray-500">
        המספר מנורמל אוטומטית — מספרים ישראלים ובינלאומיים נתמכים
      </p>
    </div>
  );
}

function ListTab({ loading, contacts, total, search, setSearch, onRemoveOne, onClearAll }) {
  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  if (total === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <FileText className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600">הרשימה ריקה</p>
        <p className="text-sm text-gray-500 mt-1">עבור לטאב גוגל או קובץ כדי להוסיף מספרים</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי מספר או שם"
            className="w-full border rounded-lg pr-10 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          onClick={onClearAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          נקה הכל
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-right px-3 py-2 font-medium">מספר</th>
              <th className="text-right px-3 py-2 font-medium">שם</th>
              <th className="text-right px-3 py-2 font-medium">מקור</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.slice(0, 500).map(c => (
              <tr key={c.id} className="border-t hover:bg-gray-50 transition">
                <td className="px-3 py-2 font-mono text-xs text-gray-800">{c.phone}</td>
                <td className="px-3 py-2 text-gray-700">{c.display_name || <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${
                    c.source === 'google' ? 'bg-red-100 text-red-700' :
                    c.source === 'csv' ? 'bg-blue-100 text-blue-700' :
                    c.source === 'vcf' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {sourceLabel(c.source)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => onRemoveOne(c.id)}
                    className="text-gray-400 hover:text-red-600 transition"
                    aria-label="הסר"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contacts.length > 500 && (
        <p className="text-center text-xs text-gray-500">
          מוצגים 500 ראשונים מתוך {contacts.length.toLocaleString()} — השתמש בחיפוש כדי לצמצם
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Shared pieces
// ══════════════════════════════════════════════════════

function ModeSelector({ mode, setMode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">אופן העלאה</label>
      <div className="grid grid-cols-2 gap-2">
        <ModeButton active={mode === 'append'} onClick={() => setMode('append')} title="הוסף לקיים" subtitle="רק חדשים יתווספו" />
        <ModeButton active={mode === 'replace'} onClick={() => setMode('replace')} title="החלף רשימה" subtitle="מחק ישן, הכנס חדש" danger />
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, title, subtitle, danger }) {
  return (
    <button
      onClick={onClick}
      className={`text-right p-3 rounded-lg border-2 transition ${
        active
          ? (danger ? 'border-red-400 bg-red-50' : 'border-indigo-400 bg-indigo-50')
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className={`font-medium text-sm ${active ? (danger ? 'text-red-800' : 'text-indigo-800') : 'text-gray-900'}`}>{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
    </button>
  );
}

function PreviewSummary({ previewResult }) {
  const s = previewResult.summary;
  const isGoogle = previewResult.source === 'google';

  return (
    <div className="space-y-3">
      {/* Big reach card */}
      <div className="bg-gradient-to-l from-emerald-500 to-green-500 text-white rounded-xl p-4 shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5" />
          <span className="text-sm font-medium opacity-90">הסטטוס יישלח ל-</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{s.reach_after.toLocaleString()}</span>
          <span className="text-lg opacity-90">אנשי קשר</span>
        </div>
        {s.reach_delta > 0 && (
          <div className="mt-1 text-sm bg-white/20 rounded px-2 py-1 inline-block">
            +{s.reach_delta.toLocaleString()} חדשים שלא היו בטווח השליחה
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {isGoogle ? (
            <>
              <MiniStat label="בגוגל" value={s.total_google} />
              <MiniStat label="עם טלפון" value={s.total_with_phone} />
              <MiniStat label="תקינים" value={s.parsed_valid} tone="green" />
            </>
          ) : (
            <>
              <MiniStat label="שורות" value={s.raw_lines} />
              <MiniStat label="תקינים" value={s.parsed_valid} tone="green" />
              <MiniStat label="לא תקינים" value={s.invalid} tone={s.invalid > 0 ? 'red' : 'gray'} />
            </>
          )}
          <MiniStat label="כפולים במקור" value={s.duplicates_in_file} />
          <MiniStat label="כבר ברשימה" value={s.duplicates_in_db} />
          <MiniStat label="כבר ב-WhatsApp" value={s.already_in_waha} />
        </div>

        <div className="border-t pt-3 flex items-center justify-between text-sm">
          <span className="text-gray-600">יתווספו לרשימה המיובאת:</span>
          <span className="font-bold text-indigo-700 text-lg">{s.new_contacts.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">מתוכם חדשים לחלוטין (לא ב-WhatsApp):</span>
          <span className="font-bold text-green-700 text-lg">{s.new_reach.toLocaleString()}</span>
        </div>
      </div>

      {s.exceeds_limit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          חריגה מהמגבלה — רק חלק יישמר (מגבלה: {s.limit.toLocaleString()})
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone = 'default' }) {
  const toneMap = {
    default: 'text-gray-900',
    green: 'text-green-700',
    red: 'text-red-700',
    gray: 'text-gray-500',
  };
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-base ${toneMap[tone]}`}>{(value || 0).toLocaleString()}</div>
    </div>
  );
}

function sourceLabel(src) {
  if (src === 'csv') return 'CSV';
  if (src === 'vcf') return 'VCF';
  if (src === 'google') return 'גוגל';
  return 'ידני';
}
