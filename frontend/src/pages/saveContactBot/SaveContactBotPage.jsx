import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Link2, Copy, Check, Trash2, Plus, ArrowUp, ArrowDown,
  MessageSquare, Image as ImageIcon, Video, FileAudio, File as FileIcon,
  Loader2, RefreshCw, AlertCircle, Users, Sparkles, QrCode,
  Phone, Clock, CheckCircle2, Search, Download, ExternalLink,
  ArrowLeft, Shield,
} from 'lucide-react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import { toast } from '../../store/toastStore';

// ───────────────────────────── Helpers ─────────────────────────────

function formatIsraeliPhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972')) {
    const rest = digits.slice(3);
    if (rest.length >= 9) return `+972 ${rest.slice(0, 2)}-${rest.slice(2, 5)}-${rest.slice(5, 9)}`;
    return `+972 ${rest}`;
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  return raw;
}

function whatsappUrl(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '972' + digits.slice(1);
  return `https://wa.me/${digits}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'לפני רגע';
  if (sec < 3600) return `לפני ${Math.floor(sec / 60)} דק׳`;
  if (sec < 86400) return `לפני ${Math.floor(sec / 3600)} שע׳`;
  if (sec < 7 * 86400) return `לפני ${Math.floor(sec / 86400)} ימים`;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const STEP_TYPES = [
  { value: 'text',     label: 'טקסט',  icon: MessageSquare },
  { value: 'image',    label: 'תמונה', icon: ImageIcon },
  { value: 'video',    label: 'סרטון', icon: Video },
  { value: 'audio',    label: 'שמע',   icon: FileAudio },
  { value: 'document', label: 'קובץ',  icon: FileIcon },
];

const DEFAULT_WELCOME = 'נשמרת בהצלחה אצל *{name}*\nעל מנת לצפות בסטטוסים *יש לשמור את איש הקשר* המצורף כאן\n👇🏻👇🏻👇🏻';
const DEFAULT_PREFILLED_PREFIX = 'אשמח להצטרף לסטטוס של ';
const PREFILLED_TEMPLATE_REGEX = /^\s*אשמח\s+להצטרף\s+לסטטוס\s+של\s+.*/u;

function renderTemplate(tpl, vars) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.split(`{${k}}`).join(v == null ? '' : String(v));
  }
  return out;
}

function qrUrlFor(deepLink, size = 300) {
  // qr.botomat.co.il auto-detects WhatsApp short-links and adds the branded
  // logo. We append `style=wa1` so the URL differs from any older cached
  // version that browsers may still have stored with a 24h max-age.
  if (!deepLink) return null;
  return `https://qr.botomat.co.il/qr?text=${encodeURIComponent(deepLink)}&size=${size}&style=wa1`;
}

function preferredQrSrc(profile, size = 300) {
  if (!profile) return null;
  return qrUrlFor(profile.qrdl_deep_link_url, size);
}

function mediaKind(step) {
  if (!step) return null;
  if (step.step_type === 'image') return 'image';
  if (step.step_type === 'video') return 'video';
  if (step.step_type === 'audio') return 'audio';
  if (step.step_type === 'document') return 'document';
  return null;
}

// ───────────────────────────── Page ─────────────────────────────

export default function SaveContactBotPage() {
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [profile, setProfile] = useState(null);
  const [steps, setSteps] = useState([]);
  const [received, setReceived] = useState({ items: [], total: 0, matchedCount: 0, uniquePhones: 0 });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts'); // contacts | settings | sequence
  const [googleStatus, setGoogleStatus] = useState({ connected: false, loading: true });
  const [usage, setUsage] = useState(null);

  const [form, setForm] = useState({
    contact_name: '',
    contact_phone: '',
    prefilled_message: '',
    welcome_message: 'נשמרת בהצלחה אצל *{name}*\nעל מנת לצפות בסטטוסים *יש לשמור את איש הקשר* המצורף כאן\n👇🏻👇🏻👇🏻',
    is_active: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) { navigate('/save-contact-bot', { replace: true }); return; }
        await fetchMe();
        await reload();
      } catch (e) {
        if (e.response?.status === 403 && e.response?.data?.error === 'NO_ACCESS') {
          navigate('/save-contact-bot', { replace: true });
          return;
        }
        setError(e.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function fetchWhatsappDefaults() {
    try {
      const { data } = await api.get('/whatsapp/status');
      const conns = Array.isArray(data?.connections) ? data.connections : [];
      const conn = conns.find((c) => c?.status === 'connected') || conns[0] || null;
      return {
        display_name: conn?.display_name || data?.display_name || '',
        phone_number: conn?.phone_number || data?.phone_number || '',
      };
    } catch {
      return { display_name: '', phone_number: '' };
    }
  }

  async function loadGoogleStatus() {
    try {
      const { data } = await api.get('/save-contact-bot/google-contacts/status');
      setGoogleStatus({ ...data, loading: false });
    } catch {
      setGoogleStatus({ connected: false, loading: false });
    }
  }

  async function loadUsage() {
    try {
      const { data } = await api.get('/save-contact-bot/usage');
      setUsage(data);
    } catch { /* non-fatal */ }
  }

  async function handleConnectGoogle(slot = null) {
    try {
      const params = slot != null ? { slot } : {};
      const { data } = await api.get('/save-contact-bot/google-contacts/auth-url', { params });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function handleDisconnectGoogle(slot, email) {
    const ok = await toast.confirm(`להסיר את החשבון ${email}? המערכת לא תשמור אליו יותר אנשי קשר.`, { type: 'warning', confirmText: 'הסר', cancelText: 'ביטול' });
    if (!ok) return;
    try {
      await api.delete(`/save-contact-bot/google-contacts/slot/${slot}`);
      toast.success('החשבון הוסר');
      await loadGoogleStatus();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function handleSetPrimary(slot) {
    try {
      await api.post(`/save-contact-bot/google-contacts/slot/${slot}/primary`);
      toast.success('החשבון הוגדר כראשי');
      await loadGoogleStatus();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function handleSyncPending() {
    try {
      toast.info('מסנכרן אנשי קשר ל-Google…', 2500);
      const { data } = await api.post('/save-contact-bot/google-contacts/sync-pending');
      if (data.reason === 'disabled') {
        toast.warning('הסנכרון האוטומטי מושבת. הפעל אותו בהגדרות הבוט.');
      } else if (data.reason === 'no_profile') {
        toast.warning('הגדר קודם את פרטי הבוט.');
      } else {
        toast.success(`סנכרון הסתיים — נוצרו ${data.created}, דילוג על ${data.skippedExisting} כבר קיימים${data.failed ? `, נכשלו ${data.failed}` : ''}.`);
      }
      await reload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  function downloadVcf() {
    const token = localStorage.getItem('accessToken');
    // Open in new tab with auth header via fetch + blob download
    fetch('/api/save-contact-bot/received-requests/export.vcf', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.blob() : res.json().then((j) => Promise.reject(new Error(j.error || 'Export failed'))))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `save-contact-bot-${new Date().toISOString().slice(0, 10)}.vcf`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => toast.error(e.message));
  }

  async function toggleGoogleSync(enabled) {
    try {
      const { data } = await api.put('/save-contact-bot/profile', { ...form, google_contacts_sync_enabled: enabled });
      setProfile(data.profile);
      toast.success(enabled ? 'סנכרון אוטומטי הופעל' : 'סנכרון אוטומטי הושבת');
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      toast.error(msg);
    }
  }

  async function reload() {
    loadGoogleStatus();
    loadUsage();
    const { data } = await api.get('/save-contact-bot/profile');
    setProfile(data.profile);
    setSteps(data.steps || []);
    if (data.profile) {
      // Convert legacy {name} template to literal contact_name for a friendlier edit UX.
      const nm = data.profile.contact_name || '';
      const welcome = String(data.profile.welcome_message || '').split('{name}').join(nm);
      setForm({
        contact_name: data.profile.contact_name,
        contact_phone: formatIsraeliPhone(data.profile.contact_phone),
        prefilled_message: data.profile.prefilled_message,
        welcome_message: welcome,
        is_active: data.profile.is_active,
      });
      try {
        const { data: recv } = await api.get('/save-contact-bot/received-requests', { params: { limit: 200 } });
        setReceived(recv);
      } catch (e) { /* non-fatal */ }
      return;
    }
    const wa = await fetchWhatsappDefaults();
    if (wa.display_name || wa.phone_number) {
      setForm((prev) => ({
        ...prev,
        contact_name: prev.contact_name || wa.display_name || '',
        contact_phone: prev.contact_phone || formatIsraeliPhone(wa.phone_number) || '',
        prefilled_message: prev.prefilled_message || (wa.display_name ? `אשמח להצטרף לסטטוס של ${wa.display_name}` : ''),
      }));
    }
    setActiveTab('settings');
  }

  async function handleSaveProfile(e, { silent = false } = {}) {
    e?.preventDefault();
    setSaving(true); setError(null); setFieldErrors({});
    try {
      const { data } = await api.put('/save-contact-bot/profile', form);
      setProfile(data.profile);
      if (!silent) toast.success('פרטי הבוט נשמרו בהצלחה');
      return data.profile;
    } catch (e) {
      const body = e.response?.data || {};
      const msg = body.error || e.message;
      // Duplicate prefilled message → inline next to the specific field, no toast.
      if (body.code === 'DUPLICATE_PREFILLED' && body.field) {
        setFieldErrors({ [body.field]: msg });
      } else {
        setError(msg);
        toast.error(msg);
      }
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateLink() {
    setGenerating(true); setError(null);
    try {
      await handleSaveProfile(null, { silent: true });
      const { data } = await api.post('/save-contact-bot/profile/generate-link');
      setProfile(data.profile);
      toast.success(profile?.qrdl_code ? 'הקישור עודכן' : 'הקישור נוצר בהצלחה');
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!profile?.qrdl_deep_link_url) return;
    try {
      await navigator.clipboard.writeText(profile.qrdl_deep_link_url);
      setCopied(true);
      toast.success('הקישור הועתק');
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function exportCsv() {
    if (!received.items?.length) return;
    const header = ['שם', 'טלפון', 'מס׳ פניות', 'הודעה אחרונה', 'נשמר ב-Google', 'פנייה אחרונה'];
    const rows = received.items.map((r) => [
      r.from_wa_name || '',
      r.from_phone || '',
      r.send_count ?? 1,
      (r.last_message || '').replace(/"/g, '""'),
      r.synced ? 'כן' : 'לא',
      new Date(r.last_at || r.processed_at).toLocaleString('he-IL'),
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `save-contact-bot-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error && error.includes('not available')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex items-center justify-center p-8" dir="rtl">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-lg text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">המודול עדיין לא זמין עבורך</h1>
          <p className="text-gray-600 mb-6">בוט שמירת איש קשר נמצא כרגע בגרסת בטא סגורה.</p>
          <button onClick={() => navigate('/dashboard')} className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow-lg transition-shadow text-white font-semibold py-3 px-8 rounded-xl">חזרה ללוח</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30" dir="rtl">
      {/* Sticky header — same layout as other app pages */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                aria-label="חזרה ללוח הבקרה"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="p-2 hover:bg-red-50 rounded-xl transition-colors group"
                  title="ממשק ניהול"
                >
                  <Shield className="w-5 h-5 text-red-500 group-hover:text-red-600" />
                </button>
              )}
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero — gradient like /group-forwards */}
        <div className="relative overflow-hidden bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                  <UserPlus className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                    בוט שמירת איש קשר
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-white/20 backdrop-blur text-white rounded-full border border-white/30">
                      <Sparkles className="w-3 h-3" /> חדש
                    </span>
                  </h1>
                  <p className="text-white/80 mt-0.5">הוספה של אנשי קשר לסטטוס — קישור אישי שמפעיל רצף שמירת איש קשר אוטומטי</p>
                </div>
              </div>

              {profile && (
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur ${profile.is_active ? 'bg-green-400/20 text-white border border-green-300/40' : 'bg-white/20 text-white/90 border border-white/30'}`}>
                  <span className={`w-2 h-2 rounded-full ${profile.is_active ? 'bg-green-300 animate-pulse' : 'bg-white/60'}`} />
                  {profile.is_active ? 'הבוט פעיל' : 'הבוט מושבת'}
                </div>
              )}
            </div>

            {/* Quick stats inside hero */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              <HeroStat label="סה״כ פניות" value={received.total} />
              <HeroStat label="התאמות שנענו" value={received.matchedCount} />
              <HeroStat label="אנשים ייחודיים" value={received.uniquePhones} />
              <HeroStat label="צעדי רצף" value={steps.length} />
            </div>
          </div>
        </div>

        {error && !error.includes('not available') && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Monthly usage + overage card */}
        {usage && <UsageCard usage={usage} />}

        {/* Link card (shown when profile + link exist) */}
        {profile?.qrdl_deep_link_url && (
          <section className="bg-white rounded-3xl border border-teal-100 shadow-sm p-6 mb-6">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 mb-2 uppercase tracking-wide">
                  <Link2 className="w-3.5 h-3.5" /> הקישור הציבורי שלך
                </div>
                <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <code className="flex-1 text-sm font-mono text-gray-800 break-all" dir="ltr">{profile.qrdl_deep_link_url}</code>
                  <button onClick={handleCopy} title="העתק"
                    className="shrink-0 bg-white text-teal-700 hover:bg-teal-100 border border-teal-300 p-2 rounded-xl transition">
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span>קוד: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{profile.qrdl_code}</code></span>
                  <button onClick={handleGenerateLink} disabled={generating}
                    className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900">
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    רענן לפי ההגדרות
                  </button>
                </div>
              </div>
              {profile.qrdl_deep_link_url && (
                <div className="shrink-0 bg-white p-2.5 rounded-2xl border-2 border-teal-100">
                  <img
                    src={preferredQrSrc(profile)}
                    onError={(e) => {
                      // Last-ditch fallback: ask for the plain QR (no logo).
                      const fallback = `https://qr.botomat.co.il/qr?text=${encodeURIComponent(profile.qrdl_deep_link_url)}&size=300&logo=none`;
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                    alt="QR" className="w-32 h-32 object-contain"
                    key={profile.updated_at || profile.qrdl_code || profile.qrdl_deep_link_url}
                  />
                  <div className="text-center text-[10px] text-gray-500 mt-1.5 flex items-center justify-center gap-1"><QrCode className="w-3 h-3" /> קוד QR</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-t-3xl border border-gray-100 border-b-0 px-2 pt-2 flex gap-1 overflow-x-auto">
          <TabButton active={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')}
            icon={Users} label={`אנשי קשר שהתקבלו${received.uniquePhones ? ` (${received.uniquePhones})` : ''}`} />
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}
            icon={UserPlus} label="הגדרות הבוט" />
          <TabButton active={activeTab === 'sequence'} onClick={() => setActiveTab('sequence')}
            icon={Sparkles} label={`רצף הודעות${steps.length ? ` (${steps.length})` : ''}`} disabled={!profile} />
        </div>
        <div className="bg-white rounded-b-3xl border border-gray-100 p-6 shadow-sm">
          {activeTab === 'contacts' && (
            <ReceivedContactsView
              received={received}
              profile={profile}
              onExport={exportCsv}
              onExportVcf={downloadVcf}
              onRefresh={reload}
              onSyncPending={handleSyncPending}
              googleConnected={Array.isArray(googleStatus?.slots) && googleStatus.slots.length > 0}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsForm
              form={form}
              setForm={setForm}
              profile={profile}
              steps={steps}
              saving={saving}
              generating={generating}
              onSave={handleSaveProfile}
              onGenerateLink={handleGenerateLink}
              googleStatus={googleStatus}
              onConnectGoogle={handleConnectGoogle}
              onDisconnectGoogle={handleDisconnectGoogle}
              onSetPrimaryGoogle={handleSetPrimary}
              onToggleGoogleSync={toggleGoogleSync}
              fieldErrors={fieldErrors}
              clearFieldError={(k) => setFieldErrors((prev) => { const n = { ...prev }; delete n[k]; return n; })}
            />
          )}
          {activeTab === 'sequence' && profile?.id && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <SequenceEditor
                  profileId={profile.id}
                  steps={steps}
                  onReload={reload}
                  profile={profile}
                  form={form}
                  setForm={setForm}
                  onSaveWelcome={async (welcomeText) => {
                    try {
                      const { data } = await api.put('/save-contact-bot/profile', { ...form, welcome_message: welcomeText });
                      setProfile(data.profile);
                      toast.success('הודעת הפתיחה נשמרה');
                    } catch (e) {
                      toast.error(e.response?.data?.error || e.message);
                      throw e;
                    }
                  }}
                />
              </div>
              <aside className="lg:col-span-2">
                <div className="sticky top-24">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> תצוגה מקדימה של השיחה
                  </div>
                  <ChatPreview
                    contactName={form.contact_name || profile?.contact_name || '—'}
                    contactPhone={form.contact_phone || profile?.contact_phone}
                    prefilled={form.prefilled_message || profile?.prefilled_message}
                    welcomeRendered={form.welcome_message || profile?.welcome_message || DEFAULT_WELCOME.split('{name}').join(profile?.contact_name || '—')}
                    steps={steps}
                    profile={profile}
                  />
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ───────────────────────── Small UI atoms ─────────────────────────

// ───────────────────────── Usage card ─────────────────────────

function UsageCard({ usage }) {
  const { uniqueCount, limit, overageBlocks, overageNis, hasCard, blocked } = usage;
  const pct = Math.min(100, Math.round((uniqueCount / limit) * 100));
  const remaining = Math.max(0, limit - uniqueCount);

  // Color tier for the bar
  const tier = uniqueCount >= limit ? 'over' : pct >= 80 ? 'amber' : pct >= 60 ? 'yellow' : 'green';
  const barClass = {
    over:   'bg-gradient-to-r from-rose-500 to-red-600',
    amber:  'bg-gradient-to-r from-amber-500 to-orange-500',
    yellow: 'bg-gradient-to-r from-yellow-400 to-amber-400',
    green:  'bg-gradient-to-r from-teal-500 to-emerald-500',
  }[tier];
  const tierLabel = {
    over:   { text: `${uniqueCount - limit} מעל ל-${limit}`, badge: 'bg-red-50 text-red-700 border-red-200' },
    amber:  { text: `${remaining} פניות עד למגבלה`, badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    yellow: { text: `${remaining} פניות פנויות`, badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    green:  { text: `${remaining} פניות פנויות`, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  }[tier];

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            <Users className="w-3.5 h-3.5" />
            שימוש חודשי
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{uniqueCount.toLocaleString('he-IL')}</span>
            <span className="text-base text-gray-500">/ {limit.toLocaleString('he-IL')} אנשים החודש</span>
          </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-full border ${tierLabel.badge}`}>
          {tierLabel.text}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>

      {/* Overage / blocked / status info */}
      {blocked ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-sm">המודול נחסם זמנית</div>
            <div className="text-xs mt-1">הגעת ל-{limit} אנשים החודש ואין אמצעי תשלום בתוקף. הוסף אשראי כדי להמשיך לקבל פניות חדשות.</div>
            <a href="/settings?tab=payment" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-red-700 hover:text-red-900 underline">
              הוספת אמצעי תשלום
            </a>
          </div>
        </div>
      ) : overageBlocks > 0 ? (
        <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 flex items-start gap-3">
          <CreditCardIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-sm">תוספת חיוב מצטברת — ₪{overageNis}</div>
            <div className="text-xs mt-1">
              חרגת ב-{(uniqueCount - limit).toLocaleString('he-IL')} אנשים מעבר ל-{limit}. החיוב הנוסף ({overageBlocks} × 100 אנשים × 8 ₪) יצורף לחיוב החודשי הקרוב שלך.
            </div>
          </div>
        </div>
      ) : !hasCard && pct >= 60 ? (
        <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-sm">מתקרבים למגבלה החודשית</div>
            <div className="text-xs mt-1">
              עוד {remaining} פניות עד שהמודול ייחסם. הוסף אמצעי תשלום מראש — מעבר ל-{limit} ייגבה {OVERAGE_PRICE_TEXT} בלבד.
            </div>
            <a href="/settings?tab=payment" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-800 hover:text-amber-900 underline">
              הוספת אמצעי תשלום
            </a>
          </div>
        </div>
      ) : pct >= 80 ? (
        <div className="mt-4 text-xs text-gray-500">
          מעל {limit} פניות חודשיות יחויב {OVERAGE_PRICE_TEXT}, ייצורף לחיוב הקרוב.
        </div>
      ) : null}
    </div>
  );
}

const OVERAGE_PRICE_TEXT = '8 ₪ לכל 100 פניות נוספות';

function CreditCardIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function HeroStat({ label, value }) {
  return (
    <div className="bg-white/15 backdrop-blur rounded-2xl px-4 py-3 border border-white/20">
      <div className="text-[11px] font-medium text-white/70 mb-0.5">{label}</div>
      <div className="text-2xl font-bold text-white leading-tight">{(value ?? 0).toLocaleString('he-IL')}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap
        ${disabled ? 'text-gray-300 cursor-not-allowed' : active ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-200' : 'text-gray-600 hover:bg-gray-100'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

// ───────────────────────── Received contacts view ─────────────────────────

function ReceivedContactsView({ received, profile, onExport, onExportVcf, onRefresh, onSyncPending, googleConnected }) {
  const [query, setQuery] = useState('');
  const [selectedPhone, setSelectedPhone] = useState(null);
  const items = received.items || [];
  const filtered = items.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (r.from_wa_name || '').toLowerCase().includes(q) ||
           (r.from_phone || '').includes(q) ||
           (r.last_message || '').toLowerCase().includes(q);
  });

  if (!profile) {
    return (
      <EmptyState icon={UserPlus} title="הבוט עדיין לא הוגדר"
        description="גש ללשונית 'הגדרות הבוט' כדי להגדיר פרטי איש קשר וליצור קישור."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={Users} title="עדיין אין פניות"
        description={profile.qrdl_deep_link_url ? 'ברגע שמישהו יישלח הודעה דרך הקישור שלך, הוא יופיע כאן.' : 'צור קישור כדי להתחיל.'}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון או טקסט…"
            className="w-full pr-10 pl-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 text-sm outline-none" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onRefresh} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
          {googleConnected && profile?.google_contacts_sync_enabled && (
            <button onClick={onSyncPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl">
              <RefreshCw className="w-4 h-4" /> סנכרן עכשיו ל-Google
            </button>
          )}
          <button onClick={onExport} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded-xl">
            <Download className="w-4 h-4" /> ייצא CSV
          </button>
          <button onClick={onExportVcf} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl">
            <Download className="w-4 h-4" /> ייצא VCF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs font-semibold text-gray-500 border-b border-gray-200">
              <th className="py-2.5 pr-3 pl-2">שם</th>
              <th className="py-2.5 px-2">טלפון</th>
              <th className="py-2.5 px-2">פניות</th>
              <th className="py-2.5 px-2">נשמר ב-Google</th>
              <th className="py-2.5 px-2 whitespace-nowrap">פנייה אחרונה</th>
              <th className="py-2.5 pl-3 pr-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.from_phone}
                className="border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer"
                onClick={() => setSelectedPhone(r.from_phone)}>
                <td className="py-3 pr-3 pl-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-full flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
                      {(r.from_wa_name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate max-w-[12rem]">{r.from_wa_name || <span className="text-gray-400 font-normal">ללא שם</span>}</div>
                      {r.last_message && (
                        <div className="text-[11px] text-gray-500 truncate max-w-[16rem]">{r.last_message}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2 font-mono text-xs text-gray-700 whitespace-nowrap" dir="ltr">{formatIsraeliPhone(r.from_phone)}</td>
                <td className="py-3 px-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${r.send_count > 1 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-700'}`}>
                    ×{r.send_count}
                  </span>
                </td>
                <td className="py-3 px-2">
                  {r.sync_action === 'created' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-xs font-medium rounded-full"><CheckCircle2 className="w-3 h-3" /> נשמר</span>
                  ) : r.sync_action === 'preexisted' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium rounded-full">היה שמור</span>
                  ) : r.synced ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-xs font-medium rounded-full"><CheckCircle2 className="w-3 h-3" /> נשמר</span>
                  ) : r.any_matched ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-200 text-xs font-medium rounded-full">לא נשמר</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium rounded-full">ללא התאמה</span>
                  )}
                </td>
                <td className="py-3 px-2 text-xs text-gray-500 whitespace-nowrap"><Clock className="w-3 h-3 inline align-text-top ml-1" />{timeAgo(r.last_at)}</td>
                <td className="py-3 pl-3 pr-2 text-left">
                  <a href={whatsappUrl(r.from_phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 text-xs font-medium">
                    <MessageSquare className="w-3.5 h-3.5" /> שיחה
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400">לא נמצאו תוצאות לחיפוש.</div>
        )}
      </div>

      {selectedPhone && (
        <ContactHistoryModal phone={selectedPhone} onClose={() => setSelectedPhone(null)} />
      )}
    </div>
  );
}

function ContactHistoryModal({ phone, onClose }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/save-contact-bot/received-requests/history', { params: { phone } });
        setItems(data.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [phone]);

  const latestName = items[0]?.from_wa_name || 'ללא שם';
  const syncedAny = items.some((i) => i.google_contact_synced);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9000] flex items-center justify-center p-4"
      onClick={onClose} dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <header className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 flex items-center gap-3">
          <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-lg font-bold shrink-0">
            {(latestName).charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg truncate">{latestName}</div>
            <div className="text-sm text-white/80 font-mono" dir="ltr">{formatIsraeliPhone(phone)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(() => {
              const createdAny = items.some((i) => i.google_sync_action === 'created');
              const preexistedAny = items.some((i) => i.google_sync_action === 'preexisted');
              if (createdAny) return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-400/20 backdrop-blur text-white text-xs font-bold rounded-full border border-green-300/40">
                  <CheckCircle2 className="w-3 h-3" /> נשמר
                </span>
              );
              if (preexistedAny) return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-400/20 backdrop-blur text-white text-xs font-bold rounded-full border border-blue-300/40">
                  היה שמור
                </span>
              );
              if (syncedAny) return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-white/20 backdrop-blur text-white text-xs font-bold rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> נשמר
                </span>
              );
              return null;
            })()}
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition">
              <Trash2 className="w-5 h-5 rotate-45" />
            </button>
          </div>
        </header>

        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
          <b>{items.length}</b> {items.length === 1 ? 'פנייה' : 'פניות'} בסה״כ
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-gray-400">אין הסטוריה</div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-gray-500">{new Date(it.processed_at).toLocaleString('he-IL')}</div>
                  <div className="flex items-center gap-1.5">
                    {it.matched ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> נשלח</span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">ללא התאמה</span>
                    )}
                    {it.google_sync_action === 'created' && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">Google · נשמר</span>
                    )}
                    {it.google_sync_action === 'preexisted' && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded-full">Google · היה שמור</span>
                    )}
                    {!it.google_sync_action && it.google_contact_synced && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">Google ✓</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{it.message_text || <span className="text-gray-400 italic">(ללא טקסט)</span>}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="text-center py-14">
      <div className="w-20 h-20 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-5">
        <Icon className="w-10 h-10 text-teal-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">{description}</p>
    </div>
  );
}

// ───────────────────────── Settings form ─────────────────────────

function SettingsForm({ form, setForm, profile, steps = [], saving, generating, onSave, onGenerateLink, googleStatus, onConnectGoogle, onDisconnectGoogle, onSetPrimaryGoogle, onToggleGoogleSync, fieldErrors = {}, clearFieldError = () => {} }) {
  // Sync: when contact_name changes, auto-update prefilled_message & welcome_message
  // if they still match the default template.
  function handleNameChange(newName) {
    setForm((prev) => {
      const next = { ...prev, contact_name: newName };

      // Prefilled message — sync only if it matches the default template.
      if (!prev.prefilled_message || PREFILLED_TEMPLATE_REGEX.test(prev.prefilled_message)) {
        next.prefilled_message = newName ? `${DEFAULT_PREFILLED_PREFIX}${newName}` : '';
      }

      // Welcome message — only auto-replace if the current value is one of the
      // well-known default templates. NEVER do a substring replace on the old
      // name (that would corrupt the text when the old name is a common prefix
      // like "נ" that also appears inside "נשמרת").
      const defaultForNewName = newName ? DEFAULT_WELCOME.split('{name}').join(newName) : '';
      const defaultForOldName = prev.contact_name ? DEFAULT_WELCOME.split('{name}').join(prev.contact_name) : '';
      const defaultWithEmpty = DEFAULT_WELCOME.split('{name}').join('');
      const defaultAsTemplate = DEFAULT_WELCOME; // raw template with {name}

      const cur = (prev.welcome_message || '').trim();
      const isDefaultForOld = cur !== '' && cur === defaultForOldName.trim();
      const isEmptyDefault = cur === defaultWithEmpty.trim();
      const isTemplate = cur === defaultAsTemplate.trim();

      if (cur === '' || isDefaultForOld || isEmptyDefault || isTemplate) {
        next.welcome_message = defaultForNewName;
      }
      // otherwise user customised the welcome message — leave it alone.

      return next;
    });
  }

  const renderedWelcome = (form.welcome_message && form.welcome_message.trim())
    ? form.welcome_message
    : DEFAULT_WELCOME.split('{name}').join(form.contact_name || '—');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <form onSubmit={onSave} className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Step 1 */}
        <div className="md:col-span-2 flex items-center gap-2 text-xs font-bold text-teal-700 uppercase tracking-wide">
          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 inline-flex items-center justify-center">1</span>
          פרטי איש הקשר
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">שם מלא <span className="text-red-500">*</span></label>
          <input type="text" className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 text-sm outline-none" required
            placeholder="למשל: רחלי כהן"
            value={form.contact_name} onChange={(e) => handleNameChange(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">שם לאיש הקשר שהלקוח ישמור אצלו</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר טלפון <span className="text-red-500">*</span></label>
          <input type="tel" className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 text-sm outline-none" required dir="ltr"
            placeholder="052-742-8547"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            onBlur={(e) => setForm({ ...form, contact_phone: formatIsraeliPhone(e.target.value) })} />
          <p className="text-xs text-gray-500 mt-1">כל פורמט מתקבל — המערכת מנרמלת אוטומטית</p>
        </div>

        {/* Step 2 */}
        <div className="md:col-span-2 flex items-center gap-2 text-xs font-bold text-teal-700 uppercase tracking-wide mt-3">
          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 inline-flex items-center justify-center">2</span>
          טקסט ההצטרפות שייכתב בווצאפ
        </div>

        <div className="md:col-span-2">
          <input type="text"
            className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm outline-none transition ${fieldErrors.prefilled_message ? 'border-red-300 focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-red-50/30' : 'border-gray-200 focus:ring-2 focus:ring-teal-200 focus:border-teal-400'}`}
            required
            placeholder={`${DEFAULT_PREFILLED_PREFIX}${form.contact_name || 'רחלי'}`}
            value={form.prefilled_message}
            onChange={(e) => { setForm({ ...form, prefilled_message: e.target.value }); if (fieldErrors.prefilled_message) clearFieldError('prefilled_message'); }} />
          {fieldErrors.prefilled_message ? (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{fieldErrors.prefilled_message}</span>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-1">ההודעה שתופיע ללקוח אחרי לחיצה על הקישור — ותשמש גם להתאמה בצד הבוט. חייב להיות ייחודי.</p>
          )}
        </div>

        <div className="md:col-span-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-2.5 text-xs flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>הודעת הפתיחה (הטקסט שנשלח ללקוח לפני איש הקשר) מוגדרת בתוך לשונית <b>רצף הודעות</b>, לצד שאר שלבי הרצף.</span>
        </div>

        {/* Step 3: Google Contacts sync */}
        <div className="md:col-span-2 flex items-center gap-2 text-xs font-bold text-teal-700 uppercase tracking-wide mt-3">
          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 inline-flex items-center justify-center">3</span>
          הוספה אוטומטית לאנשי הקשר של Google
        </div>

        <div className="md:col-span-2">
          <GoogleContactsCard
            googleStatus={googleStatus}
            onConnect={onConnectGoogle}
            onDisconnect={onDisconnectGoogle}
            onSetPrimary={onSetPrimaryGoogle}
            profile={profile}
            onToggleSync={onToggleGoogleSync}
          />
        </div>

        {/* Bot toggle + actions */}
        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-100">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <div className="relative">
              <input type="checkbox" className="peer sr-only"
                checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <div className="w-11 h-6 bg-gray-300 peer-checked:bg-teal-500 rounded-full transition" />
              <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full peer-checked:-translate-x-5 transition-transform shadow" />
            </div>
            <span className="text-sm font-medium text-gray-700">{form.is_active ? 'הבוט פעיל' : 'הבוט מושבת'}</span>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow-lg disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-shadow">
              {saving ? 'שומר…' : 'שמור פרטים'}
            </button>
            <button type="button" onClick={onGenerateLink} disabled={generating}
              className="bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 font-semibold px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {profile?.qrdl_code ? 'רענן קישור' : 'צור קישור'}
            </button>
          </div>
        </div>
      </form>

      {/* Chat preview column */}
      <aside className="lg:col-span-2">
        <div className="sticky top-24">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> תצוגה מקדימה של השיחה
          </div>
          <ChatPreview
            contactName={form.contact_name || '—'}
            contactPhone={form.contact_phone}
            prefilled={form.prefilled_message}
            welcomeRendered={renderedWelcome}
            steps={steps}
            profile={profile}
          />
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────── Chat preview ─────────────────────────

function ChatPreview({ contactName, contactPhone, prefilled, welcomeRendered, steps, profile }) {
  const items = profile ? buildUnifiedItems(profile, steps) : [
    { kind: 'welcome', id: 'welcome', step_order: 0, text_content: welcomeRendered },
    { kind: 'contact', id: 'contact', step_order: 1 },
  ];

  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm bg-[#e5ddd5]">
      <div className="bg-[#075e54] text-white px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
          {contactName ? contactName.charAt(0) : 'ב'}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">בוטומט — שמירת איש קשר</div>
          <div className="text-xs text-white/70">פעיל עכשיו</div>
        </div>
      </div>

      <div className="p-3 space-y-2 max-h-[520px] overflow-y-auto" dir="rtl">
        <Bubble side="right" bg="bg-[#dcf8c6]">
          <p className="whitespace-pre-wrap text-sm">{prefilled || <span className="text-gray-400 italic">טקסט ההצטרפות יופיע כאן</span>}</p>
        </Bubble>

        {items.map((it) => {
          if (it.kind === 'welcome') {
            return (
              <Bubble key={it.id} side="left" bg="bg-white">
                <p className="whitespace-pre-wrap text-sm"><FormatBold text={welcomeRendered || it.text_content} /></p>
              </Bubble>
            );
          }
          if (it.kind === 'contact') {
            return (
              <Bubble key={it.id} side="left" bg="bg-white">
                <div className="flex items-center gap-3 py-1 px-1">
                  <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold shrink-0">
                    {contactName && contactName !== '—' ? contactName.charAt(0) : '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{contactName}</div>
                    <div className="text-xs text-gray-500" dir="ltr">{contactPhone || '—'}</div>
                  </div>
                </div>
                <div className="border-t border-gray-100 mt-1.5 pt-1.5 text-xs text-center text-teal-600 font-medium">איש קשר</div>
              </Bubble>
            );
          }
          return <StepBubble key={it.id} step={it} />;
        })}
      </div>
    </div>
  );
}

function Bubble({ side, bg, children }) {
  const align = side === 'right' ? 'justify-end' : 'justify-start';
  return (
    <div className={`flex ${align}`}>
      <div className={`${bg} rounded-xl shadow-sm px-3 py-2 max-w-[85%]`}>
        {children}
      </div>
    </div>
  );
}

function StepBubble({ step }) {
  const side = 'left';
  const bg = 'bg-white';
  if (step.step_type === 'text') {
    return (
      <Bubble side={side} bg={bg}>
        <p className="whitespace-pre-wrap text-sm">
          <FormatBold text={step.text_content || ''} />
        </p>
      </Bubble>
    );
  }
  if (step.step_type === 'image') {
    return (
      <Bubble side={side} bg={bg}>
        {step.media_url && (
          <img src={step.media_url} alt="" className="rounded-lg max-w-full max-h-60 object-cover" />
        )}
        {step.media_caption && <p className="text-sm mt-1.5 whitespace-pre-wrap">{step.media_caption}</p>}
      </Bubble>
    );
  }
  if (step.step_type === 'video') {
    return (
      <Bubble side={side} bg={bg}>
        {step.media_url && (
          <video src={step.media_url} controls className="rounded-lg max-w-full max-h-60" />
        )}
        {step.media_caption && <p className="text-sm mt-1.5 whitespace-pre-wrap">{step.media_caption}</p>}
      </Bubble>
    );
  }
  if (step.step_type === 'audio') {
    return (
      <Bubble side={side} bg={bg}>
        {step.media_url && <audio src={step.media_url} controls className="max-w-full" />}
      </Bubble>
    );
  }
  return (
    <Bubble side={side} bg={bg}>
      <div className="flex items-center gap-2 text-sm">
        <FileIcon className="w-4 h-4" /> קובץ מצורף
      </div>
      {step.media_caption && <p className="text-sm mt-1.5 whitespace-pre-wrap">{step.media_caption}</p>}
    </Bubble>
  );
}

// ───────────────────────── Google Contacts card ─────────────────────────

function GoogleContactsCard({ googleStatus, onConnect, onDisconnect, onSetPrimary, profile, onToggleSync }) {
  const slots = Array.isArray(googleStatus?.slots) ? googleStatus.slots : [];
  const connected = slots.length > 0;
  const loading = googleStatus?.loading;
  const syncEnabled = !!profile?.google_contacts_sync_enabled;
  const plural = slots.length > 1 ? 'חשבונות מחוברים' : 'חשבון מחובר';

  return (
    <div className={`rounded-2xl border p-5 transition ${connected ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white border border-gray-200 shadow-sm">
          <GoogleG />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900">אנשי קשר של Google</h4>
            {connected && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                <CheckCircle2 className="w-3 h-3" /> {slots.length} {plural}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-gray-500"><Loader2 className="w-3 h-3 animate-spin inline ml-1" /> בודק חיבור…</p>
          ) : !connected ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">חיבור לחשבון Google יאפשר לשמור אוטומטית את המספר של כל לקוח שמצטרף — עם השם המופיע בוואטסאפ שלו — עם תווית <b>"{"שמירת אנשי קשר"}"</b>.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onConnect(null)}
                  className="inline-flex items-center gap-2 bg-white border border-gray-300 hover:border-gray-400 hover:shadow-sm text-gray-800 font-medium px-4 py-2 rounded-xl text-sm transition">
                  <ExternalLink className="w-4 h-4" /> התחבר ל-Google
                </button>
                <button type="button" onClick={async () => {
                    try {
                      const { data } = await api.get('/save-contact-bot/google-contacts/auth-url');
                      if (data?.url) {
                        await navigator.clipboard.writeText(data.url);
                        toast.success('קישור ההתחברות הועתק');
                      }
                    } catch (e) {
                      toast.error(e.response?.data?.error || e.message);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-medium px-4 py-2 rounded-xl text-sm transition">
                  <Copy className="w-4 h-4" /> העתק קישור
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">שלח את הקישור ללקוח כדי שיתחבר מהמכשיר שלו.</p>
            </div>
          ) : (
            <div>
              <div className="space-y-2 mb-3">
                {slots.map((s) => (
                  <div key={s.slot} className="flex items-center gap-2 bg-white/80 border border-teal-100 rounded-xl px-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 flex items-center justify-center text-teal-700 text-sm font-bold shrink-0">
                      {(s.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 truncate" dir="ltr">{s.email}</div>
                      {s.name && <div className="text-xs text-gray-500 truncate">{s.name}</div>}
                    </div>
                    {s.slot === 0 ? (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">ראשי</span>
                    ) : (
                      <button type="button" onClick={() => onSetPrimary(s.slot)}
                        className="text-[10px] font-bold text-gray-600 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:bg-teal-50 px-2 py-0.5 rounded-full transition">
                        קבע כראשי
                      </button>
                    )}
                    <button type="button" onClick={() => onDisconnect(s.slot, s.email)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-lg" title="הסר חשבון זה">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button type="button" onClick={() => onConnect(null)}
                  className="inline-flex items-center gap-1.5 bg-white border border-teal-300 hover:bg-teal-50 text-teal-700 font-medium px-3.5 py-1.5 rounded-xl text-xs transition">
                  <Plus className="w-3.5 h-3.5" /> הוסף חשבון Google נוסף
                </button>
                <button type="button" onClick={async () => {
                    try {
                      const { data } = await api.get('/save-contact-bot/google-contacts/auth-url');
                      if (data?.url) {
                        await navigator.clipboard.writeText(data.url);
                        toast.success('קישור ההתחברות הועתק');
                      }
                    } catch (e) {
                      toast.error(e.response?.data?.error || e.message);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-medium px-3.5 py-1.5 rounded-xl text-xs transition">
                  <Copy className="w-3.5 h-3.5" /> העתק קישור להתחברות
                </button>
              </div>

              <div className="pt-3 border-t border-teal-200/60">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <div className="relative">
                    <input type="checkbox" className="peer sr-only"
                      checked={syncEnabled} onChange={(e) => onToggleSync(e.target.checked)}
                      disabled={!profile} />
                    <div className="w-11 h-6 bg-gray-300 peer-checked:bg-teal-500 rounded-full transition" />
                    <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full peer-checked:-translate-x-5 transition-transform shadow" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {syncEnabled ? 'סנכרון אוטומטי פעיל' : 'הפעל סנכרון אוטומטי'}
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  המערכת בודקת בכל החשבונות ואם איש הקשר כבר קיים — לא נשמר פעם נוספת. חדשים נשמרים בחשבון הראשי עם תווית <b>"שמירת אנשי קשר"</b>.
                </p>
                {!profile && (
                  <p className="text-xs text-amber-600 mt-2">שמור קודם את פרטי הבוט — ואז תוכל להפעיל סנכרון.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="w-6 h-6">
      <path fill="#FFC107" d="M43.6,20.1H42V20H24v8h11.3c-1.6,4.7-6.1,8-11.3,8c-6.6,0-12-5.4-12-12s5.4-12,12-12c3.1,0,5.9,1.2,8,3.1l5.7-5.7C34,6.1,29.3,4,24,4C12.9,4,4,12.9,4,24s8.9,20,20,20s20-8.9,20-20C44,22.7,43.9,21.4,43.6,20.1z" />
      <path fill="#FF3D00" d="M6.3,14.7l6.6,4.8C14.7,15.1,19,12,24,12c3.1,0,5.9,1.2,8,3.1l5.7-5.7C34,6.1,29.3,4,24,4C16.3,4,9.7,8.3,6.3,14.7z" />
      <path fill="#4CAF50" d="M24,44c5.2,0,9.9-2,13.4-5.2l-6.2-5.2c-2,1.5-4.5,2.4-7.2,2.4c-5.2,0-9.6-3.3-11.3-7.9l-6.5,5C9.5,39.6,16.2,44,24,44z" />
      <path fill="#1976D2" d="M43.6,20.1H42V20H24v8h11.3c-0.8,2.2-2.2,4.2-4.1,5.6c0,0,0,0,0,0l6.2,5.2C37,39.2,44,34,44,24C44,22.7,43.9,21.4,43.6,20.1z" />
    </svg>
  );
}

// Render WhatsApp-style *bold* text
function FormatBold({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') && p.length > 2
          ? <strong key={i}>{p.slice(1, -1)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

// ───────────────────────── Sequence editor ─────────────────────────

const MAX_CUSTOM_STEPS = 3;

function buildUnifiedItems(profile, steps) {
  const items = [];
  if (profile && profile.welcome_step_order != null) {
    items.push({
      kind: 'welcome',
      id: 'welcome',
      step_order: profile.welcome_step_order,
      text_content: profile.welcome_message,
    });
  }
  if (profile) {
    items.push({
      kind: 'contact',
      id: 'contact',
      step_order: profile.contact_step_order ?? 1,
    });
  }
  for (const s of steps || []) items.push({ kind: 'custom', ...s });
  items.sort((a, b) => a.step_order - b.step_order);
  return items;
}

function SequenceEditor({ profileId, steps, onReload, profile, form, setForm, onSaveWelcome }) {
  const items = buildUnifiedItems(profile, steps);
  const customCount = items.filter((i) => i.kind === 'custom').length;
  const welcomeDeleted = profile && profile.welcome_step_order == null;
  const welcomeEdited = profile && profile.welcome_message && profile.welcome_message !== DEFAULT_WELCOME.split('{name}').join(profile.contact_name || '');

  async function reorder(newIds) {
    try {
      await api.post('/save-contact-bot/sequence/reorder', { orderedIds: newIds });
      onReload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function moveItem(id, direction) {
    const ids = items.map((i) => i.id);
    const idx = ids.indexOf(id);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    await reorder(ids);
  }

  async function removeWelcome() {
    const ok = await toast.confirm('למחוק את הודעת הפתיחה? תוכל לשחזר אותה בלחיצה.', { type: 'warning', confirmText: 'מחק', cancelText: 'ביטול' });
    if (!ok) return;
    try {
      await api.post('/save-contact-bot/sequence/welcome/delete');
      toast.success('הודעת הפתיחה הוסרה');
      onReload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function restoreWelcome() {
    try {
      const { data } = await api.post('/save-contact-bot/sequence/welcome/restore');
      setForm((f) => ({ ...f, welcome_message: data.profile.welcome_message }));
      toast.success('הודעת הפתיחה שוחזרה לברירת המחדל');
      onReload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">רצף ההודעות</h2>
          <p className="text-sm text-gray-500 mt-0.5">גרור הודעות בידית <GripDots className="inline w-3 h-3 text-gray-400" /> כדי לסדר, או השתמש בחצים.</p>
        </div>
        {welcomeDeleted && (
          <button onClick={restoreWelcome}
            className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl">
            <RefreshCw className="w-3.5 h-3.5" /> שחזר הודעת פתיחה ברירת מחדל
          </button>
        )}
      </div>

      <DragList items={items} onReorder={reorder}>
        {(it, idx, dragHandleProps) => (
          <UnifiedStepCard
            key={it.id}
            item={it}
            index={idx}
            total={items.length}
            profile={profile}
            form={form}
            setForm={setForm}
            onSaveWelcome={onSaveWelcome}
            onRemoveWelcome={removeWelcome}
            onMoveUp={() => moveItem(it.id, 'up')}
            onMoveDown={() => moveItem(it.id, 'down')}
            onReload={onReload}
            dragHandleProps={dragHandleProps}
          />
        )}
      </DragList>

      {welcomeEdited && !welcomeDeleted && (
        <div className="mt-3">
          <button onClick={restoreWelcome}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-3 h-3" /> שחזר הודעת פתיחה לברירת מחדל
          </button>
        </div>
      )}

      {/* Add button — shown only when under the limit (silent cap). */}
      {customCount < MAX_CUSTOM_STEPS && (
        <div className="mt-4">
          <AddCustomStep onReload={onReload} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Drag-and-drop list ─────────────────────────

function DragList({ items, onReorder, children }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function onDragStart(idx, e) {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
  }
  function onDragOver(idx, e) {
    e.preventDefault();
    if (overIndex !== idx) setOverIndex(idx);
  }
  function onDragEnd() { setDragIndex(null); setOverIndex(null); }
  function onDrop(idx, e) {
    e.preventDefault();
    if (dragIndex == null || dragIndex === idx) { onDragEnd(); return; }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onReorder(next.map((i) => i.id));
    onDragEnd();
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => {
        const dragHandleProps = {
          draggable: true,
          onDragStart: (e) => onDragStart(idx, e),
          onDragEnd,
        };
        return (
          <div key={it.id}
            onDragOver={(e) => onDragOver(idx, e)}
            onDrop={(e) => onDrop(idx, e)}
            className={`transition ${overIndex === idx && dragIndex !== idx ? 'opacity-50 translate-y-0.5' : ''} ${dragIndex === idx ? 'opacity-60' : ''}`}>
            {children(it, idx, dragHandleProps)}
          </div>
        );
      })}
    </div>
  );
}

function GripDots({ className = '' }) {
  return (
    <svg viewBox="0 0 6 16" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="1.5" cy="2" r="1" /><circle cx="4.5" cy="2" r="1" />
      <circle cx="1.5" cy="6" r="1" /><circle cx="4.5" cy="6" r="1" />
      <circle cx="1.5" cy="10" r="1" /><circle cx="4.5" cy="10" r="1" />
      <circle cx="1.5" cy="14" r="1" /><circle cx="4.5" cy="14" r="1" />
    </svg>
  );
}

function DragHandle({ dragHandleProps }) {
  return (
    <button type="button" {...dragHandleProps}
      className="shrink-0 p-1.5 text-gray-400 hover:text-teal-700 hover:bg-white rounded-lg cursor-grab active:cursor-grabbing"
      title="גרור כדי לסדר">
      <GripDots className="w-3 h-4" />
    </button>
  );
}

function UnifiedStepCard({ item, index, total, profile, form, setForm, onSaveWelcome, onRemoveWelcome, onMoveUp, onMoveDown, onReload, dragHandleProps }) {
  if (item.kind === 'welcome') {
    return (
      <div className="bg-gradient-to-br from-teal-50 to-white border-2 border-teal-200 border-dashed rounded-2xl p-3">
        <WelcomeRow item={item} profile={profile} form={form} setForm={setForm} onSave={onSaveWelcome}
          onDelete={onRemoveWelcome} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
          isFirst={index === 0} isLast={index === total - 1} dragHandleProps={dragHandleProps} />
      </div>
    );
  }
  if (item.kind === 'contact') {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-300 rounded-2xl p-3">
        <ContactRow profile={profile} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
          isFirst={index === 0} isLast={index === total - 1} dragHandleProps={dragHandleProps} />
      </div>
    );
  }
  // Custom step
  return (
    <UnifiedCustomCard step={item} onReload={onReload} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
      isFirst={index === 0} isLast={index === total - 1} dragHandleProps={dragHandleProps} />
  );
}

function MoveControls({ onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div className="shrink-0 flex flex-col">
      <button onClick={onMoveUp} disabled={isFirst}
        className="text-gray-400 hover:text-teal-700 disabled:opacity-30 disabled:cursor-not-allowed">
        <ArrowUp className="w-4 h-4" />
      </button>
      <button onClick={onMoveDown} disabled={isLast}
        className="text-gray-400 hover:text-teal-700 disabled:opacity-30 disabled:cursor-not-allowed">
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  );
}

function WelcomeRow({ item, profile, form, setForm, onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast, dragHandleProps }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setDraft(form.welcome_message || item.text_content || DEFAULT_WELCOME.split('{name}').join(profile?.contact_name || ''));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      setForm((f) => ({ ...f, welcome_message: draft }));
      await onSave(draft);
      setEditing(false);
    } catch { /* toast already shown */ } finally {
      setSaving(false);
    }
  }

  const preview = form.welcome_message || item.text_content || DEFAULT_WELCOME.split('{name}').join(profile?.contact_name || '—');

  return (
    <div className="flex items-start gap-3">
      {dragHandleProps && <DragHandle dragHandleProps={dragHandleProps} />}
      <MoveControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
      <div className="shrink-0 bg-gradient-to-br from-teal-500 to-emerald-600 p-2 rounded-xl">
        <MessageSquare className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-bold text-teal-700 uppercase tracking-wide">הודעת פתיחה</div>
          {!editing && (
            <div className="flex items-center gap-2">
              <button onClick={openEdit} className="text-xs text-teal-700 hover:bg-teal-100 px-2 py-1 rounded-lg">עריכה</button>
              <button onClick={onDelete} className="text-xs text-red-600 hover:bg-red-50 p-1 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        {editing ? (
          <div>
            <textarea rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none" />
            <div className="flex gap-2 mt-2">
              <button onClick={save} disabled={saving}
                className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow text-white text-sm font-semibold px-4 py-1.5 rounded-xl disabled:opacity-50">
                {saving ? 'שומר…' : 'שמור'}
              </button>
              <button onClick={() => setEditing(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-xl">ביטול</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
            <FormatBold text={preview} />
          </p>
        )}
      </div>
    </div>
  );
}

function ContactRow({ profile, onMoveUp, onMoveDown, isFirst, isLast, dragHandleProps }) {
  return (
    <div className="flex items-start gap-3">
      {dragHandleProps && <DragHandle dragHandleProps={dragHandleProps} />}
      <MoveControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
      <div className="shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-xl">
        <UserPlus className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">איש הקשר (שולח כאן)</div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
            {(profile?.contact_name || '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{profile?.contact_name || '—'}</div>
            <div className="text-xs text-gray-500" dir="ltr">{profile?.contact_phone || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnifiedCustomCard({ step, onReload, onMoveUp, onMoveDown, isFirst, isLast, dragHandleProps }) {
  const typeMeta = STEP_TYPES.find((t) => t.value === step.step_type) || STEP_TYPES[0];
  const Icon = typeMeta.icon;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    text_content: step.text_content || '',
    media_url: step.media_url || '',
    media_filename: step.media_filename || '',
    media_caption: step.media_caption || '',
    delay_sec: step.delay_ms ? Math.round(step.delay_ms / 1000) : 0,
  }));
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function handleDelete() {
    const ok = await toast.confirm('למחוק את ההודעה הזו?', { type: 'warning', confirmText: 'מחק', cancelText: 'ביטול' });
    if (!ok) return;
    try {
      await api.delete(`/save-contact-bot/sequence-steps/${step.id}`);
      toast.success('ההודעה נמחקה');
      onReload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/upload/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDraft((d) => ({ ...d, media_url: data.url, media_filename: file.name }));
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const payload = {
        text_content: step.step_type === 'text' ? draft.text_content : null,
        media_url: step.step_type !== 'text' ? draft.media_url : null,
        media_filename: step.step_type !== 'text' ? (draft.media_filename || null) : null,
        media_caption: (step.step_type !== 'text' && step.step_type !== 'audio') ? draft.media_caption : null,
        delay_ms: Math.max(0, Math.round(Number(draft.delay_sec) * 1000) || 0),
      };
      if (step.step_type === 'text' && !payload.text_content) { toast.error('הטקסט לא יכול להיות ריק'); return; }
      if (step.step_type !== 'text' && !payload.media_url) { toast.error('חסר קובץ מדיה'); return; }
      await api.put(`/save-contact-bot/sequence-steps/${step.id}`, payload);
      toast.success('ההודעה עודכנה');
      setEditing(false);
      onReload();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  const delaySec = step.delay_ms ? Math.round(step.delay_ms / 1000) : 0;
  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-2xl p-3.5 hover:border-teal-200 transition">
      {dragHandleProps && <DragHandle dragHandleProps={dragHandleProps} />}
      <MoveControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
      <div className="shrink-0 bg-gradient-to-br from-teal-100 to-emerald-100 p-2 rounded-xl"><Icon className="w-4 h-4 text-teal-700" /></div>
      <div className="flex-1 min-w-0">
        {!editing && (
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-xs text-gray-500">{typeMeta.label}{delaySec > 0 && ` · המתנה ${delaySec} שנ׳`}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setDraft({
                text_content: step.text_content || '',
                media_url: step.media_url || '',
                media_caption: step.media_caption || '',
                delay_sec: step.delay_ms ? Math.round(step.delay_ms / 1000) : 0,
              }); setEditing(true); }}
                className="text-xs text-teal-700 hover:bg-teal-50 px-2 py-1 rounded-lg">עריכה</button>
              <button onClick={handleDelete} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {!editing ? (
          step.step_type === 'text' ? (
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{step.text_content}</p>
          ) : (
            <div>
              {step.step_type === 'image' && step.media_url && (
                <img src={step.media_url} alt="" className="max-w-full max-h-32 rounded-lg object-cover border border-gray-100" />
              )}
              {step.step_type === 'video' && step.media_url && (
                <video src={step.media_url} controls className="max-w-full max-h-32 rounded-lg border border-gray-100" />
              )}
              {step.step_type === 'audio' && step.media_url && (
                <audio src={step.media_url} controls className="max-w-full" />
              )}
              {step.step_type === 'document' && step.media_url && (
                <div className="inline-flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 max-w-full">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-teal-100 flex items-center justify-center">
                    <FileIcon className="w-4 h-4 text-indigo-700" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-[14rem]" title={step.media_filename || ''}>
                      {step.media_filename || 'קובץ מצורף'}
                    </div>
                    <a href={step.media_url} target="_blank" rel="noreferrer" className="text-[11px] text-teal-600 hover:underline">פתח</a>
                  </div>
                </div>
              )}
              {step.media_caption && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{step.media_caption}</p>}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {step.step_type === 'text' ? (
              <textarea rows={4} autoFocus value={draft.text_content}
                onChange={(e) => setDraft({ ...draft, text_content: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none" />
            ) : (
              <MediaTile type={step.step_type} url={draft.media_url} filename={draft.media_filename}
                onPick={() => fileRef.current?.click()}
                onClear={() => setDraft({ ...draft, media_url: '', media_filename: '' })} uploading={uploading} />
            )}
            <input type="file" ref={fileRef} onChange={uploadFile} className="hidden"
              accept={step.step_type === 'image' ? 'image/*' : step.step_type === 'video' ? 'video/*' : step.step_type === 'audio' ? 'audio/*' : '*'} />
            {['image', 'video', 'document'].includes(step.step_type) && (
              <textarea rows={2} value={draft.media_caption}
                onChange={(e) => setDraft({ ...draft, media_caption: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none resize-y"
                placeholder="כיתוב (אופציונלי) — ניתן להשתמש בשורות מרובות" />
            )}
            <DelayPill value={draft.delay_sec} onChange={(v) => setDraft({ ...draft, delay_sec: v })} />
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} disabled={savingEdit}
                className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow text-white text-sm font-semibold px-4 py-1.5 rounded-xl disabled:opacity-50">
                {savingEdit ? 'שומר…' : 'שמור'}
              </button>
              <button onClick={() => setEditing(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-xl">ביטול</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Prettier building blocks ─────────────────────────

function MediaTile({ type, url, filename, onPick, onClear, uploading }) {
  const accept = type === 'image' ? 'תמונה' : type === 'video' ? 'סרטון' : type === 'audio' ? 'שמע' : 'קובץ';
  const displayName = filename || (url ? decodeURIComponent(url.split('/').pop().split('?')[0]) : '');
  return (
    <div className="relative group">
      {url ? (
        <div className="rounded-2xl overflow-hidden border-2 border-teal-200 bg-white p-1.5 inline-block max-w-full">
          {type === 'image' && <img src={url} alt="" className="max-w-full max-h-48 rounded-lg object-contain" />}
          {type === 'video' && <video src={url} controls className="max-w-full max-h-48 rounded-lg" />}
          {type === 'audio' && <div className="p-3"><audio src={url} controls className="max-w-full" /></div>}
          {type === 'document' && (
            <div className="p-3 flex items-center gap-3 max-w-full min-w-[240px]">
              <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-100 to-teal-100 flex items-center justify-center">
                <FileIcon className="w-5 h-5 text-indigo-700" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate" title={displayName}>{displayName || 'קובץ'}</div>
                <div className="text-xs text-gray-500">קובץ מצורף</div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mt-2 px-2 pb-1">
            <button type="button" onClick={onPick}
              className="inline-flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-xl border border-teal-200">
              <RefreshCw className="w-3.5 h-3.5" /> החלף {accept}
            </button>
            <button type="button" onClick={onClear}
              className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">הסר</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onPick} disabled={uploading}
          className="w-full border-2 border-dashed border-teal-300 hover:border-teal-500 bg-gradient-to-br from-teal-50/50 to-emerald-50/50 hover:from-teal-50 hover:to-emerald-50 rounded-2xl px-5 py-8 transition flex flex-col items-center gap-2 text-teal-700">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
          </div>
          <div className="text-sm font-bold">{uploading ? 'מעלה קובץ…' : `בחר ${accept}`}</div>
          <div className="text-[11px] text-teal-600/70">גרור לכאן או לחץ לבחירה</div>
        </button>
      )}
    </div>
  );
}

function DelayPill({ value, onChange }) {
  const presets = [0, 2, 5, 10, 30];
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-2 border border-gray-200 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-gray-700 shrink-0">
        <Clock className="w-4 h-4 text-gray-500" /> המתנה לפני —
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {presets.map((p) => {
          const active = Number(value) === p;
          return (
            <button key={p} type="button" onClick={() => onChange(p)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${active ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300'}`}>
              {p === 0 ? 'מיידי' : `${p} שנ׳`}
            </button>
          );
        })}
        <div className="flex items-center gap-1 ml-1">
          <input type="number" min="0" step="1" value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-teal-200 outline-none text-center" />
          <span className="text-xs text-gray-500">שניות</span>
        </div>
      </div>
    </div>
  );
}

function AddCustomStep({ onReload }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(null); // null = picker visible
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ text_content: '', media_url: '', media_filename: '', media_caption: '', delay_sec: 0 });

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/upload/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((f) => ({ ...f, media_url: data.url }));
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setUploading(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (newType === 'text' && !form.text_content) return;
    if (newType !== 'text' && !form.media_url) return;
    const payload = {
      step_type: newType,
      text_content: newType === 'text' ? form.text_content : null,
      media_url: newType !== 'text' ? form.media_url : null,
      media_filename: newType !== 'text' ? (form.media_filename || null) : null,
      media_caption: (newType !== 'text' && newType !== 'audio') ? form.media_caption : null,
      delay_ms: Math.max(0, Math.round(Number(form.delay_sec) * 1000) || 0),
    };
    try {
      await api.post('/save-contact-bot/sequence-steps', payload);
      toast.success('ההודעה נוספה לרצף');
      closeAdd();
      onReload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  function openAdd() { setAdding(true); setNewType(null); }
  function closeAdd() {
    setAdding(false);
    setNewType(null);
    setForm({ text_content: '', media_url: '', media_filename: '', media_caption: '', delay_sec: 0 });
  }

  if (!adding) {
    return (
      <button onClick={openAdd}
        className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-teal-50 border-2 border-dashed border-teal-300 text-teal-700 font-semibold px-4 py-3 rounded-2xl text-sm transition">
        <Plus className="w-4 h-4" /> הוסף הודעה
      </button>
    );
  }

  // Step 1 — prettier picker grid
  if (!newType) {
    return (
      <div className="bg-gradient-to-br from-teal-50 via-white to-emerald-50 border-2 border-teal-200 rounded-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-bold text-gray-900 flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </div>
            איזו הודעה להוסיף?
          </h4>
          <button type="button" onClick={closeAdd} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M6 18L18 6" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {PICKER_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.value} type="button" onClick={() => setNewType(t.value)}
                className={`group flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all ${t.borderClass}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.bgClass} ${t.iconClass} transition-transform group-hover:scale-110`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-gray-800">{t.label}</div>
                <div className="text-[11px] text-gray-500 text-center leading-tight">{t.hint}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Step 2 — compose
  const chosen = PICKER_TYPES.find((t) => t.value === newType);
  const ChosenIcon = chosen.icon;
  return (
    <form onSubmit={save} className="bg-white border-2 border-teal-200 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-gray-900 flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${chosen.bgClass} ${chosen.iconClass}`}>
            <ChosenIcon className="w-4 h-4" />
          </div>
          הוספת {chosen.label}
        </h4>
        <button type="button" onClick={() => setNewType(null)} className="text-xs text-teal-700 hover:bg-teal-50 px-3 py-1.5 rounded-lg">שנה סוג</button>
      </div>

      {newType === 'text' ? (
        <textarea rows={4} className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-3 bg-gray-50 focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none text-sm"
          placeholder="טקסט ההודעה…" value={form.text_content}
          onChange={(e) => setForm({ ...form, text_content: e.target.value })} />
      ) : (
        <div className="mb-3">
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden"
            accept={newType === 'image' ? 'image/*' : newType === 'video' ? 'video/*' : newType === 'audio' ? 'audio/*' : '*'} />
          <MediaTile type={newType} url={form.media_url} filename={form.media_filename}
            onPick={() => fileInputRef.current?.click()}
            onClear={() => setForm({ ...form, media_url: '', media_filename: '' })} uploading={uploading} />
          {['image', 'video', 'document'].includes(newType) && (
            <textarea rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none text-sm mt-2 resize-y"
              placeholder="כיתוב (אופציונלי) — ניתן להשתמש בשורות מרובות"
              value={form.media_caption}
              onChange={(e) => setForm({ ...form, media_caption: e.target.value })} />
          )}
        </div>
      )}

      <div className="mb-4">
        <DelayPill value={form.delay_sec} onChange={(v) => setForm({ ...form, delay_sec: v })} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow text-white text-sm font-semibold px-5 py-2 rounded-xl">הוסף</button>
        <button type="button" onClick={closeAdd} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-5 py-2 rounded-xl">ביטול</button>
      </div>
    </form>
  );
}

const PICKER_TYPES = [
  { value: 'text',     label: 'טקסט',   icon: MessageSquare, bgClass: 'bg-blue-100',     iconClass: 'text-blue-700',   borderClass: 'border-transparent hover:border-blue-300',     hint: 'הודעת כתב' },
  { value: 'image',    label: 'תמונה',  icon: ImageIcon,     bgClass: 'bg-purple-100',   iconClass: 'text-purple-700', borderClass: 'border-transparent hover:border-purple-300',   hint: 'JPG, PNG, WEBP' },
  { value: 'video',    label: 'סרטון',  icon: Video,         bgClass: 'bg-rose-100',     iconClass: 'text-rose-700',   borderClass: 'border-transparent hover:border-rose-300',     hint: 'MP4, MOV' },
  { value: 'audio',    label: 'שמע',    icon: FileAudio,     bgClass: 'bg-amber-100',    iconClass: 'text-amber-700',  borderClass: 'border-transparent hover:border-amber-300',    hint: 'MP3, WAV, OGG' },
  { value: 'document', label: 'קובץ',   icon: FileIcon,      bgClass: 'bg-emerald-100',  iconClass: 'text-emerald-700',borderClass: 'border-transparent hover:border-emerald-300',  hint: 'PDF וכל קובץ' },
];

function WelcomeStepCard({ form, setForm, profile, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(form.welcome_message || '');
  const [savingLocal, setSavingLocal] = useState(false);

  function openEdit() {
    setDraft(form.welcome_message || DEFAULT_WELCOME.split('{name}').join(form.contact_name || ''));
    setEditing(true);
  }

  async function save() {
    setSavingLocal(true);
    try {
      setForm((f) => ({ ...f, welcome_message: draft }));
      await onSave(draft);
      setEditing(false);
    } finally {
      setSavingLocal(false);
    }
  }

  const preview = form.welcome_message || DEFAULT_WELCOME.split('{name}').join(form.contact_name || '—');

  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-teal-200 bg-gradient-to-br from-teal-50/50 to-white p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 bg-gradient-to-br from-teal-500 to-emerald-600 p-2 rounded-xl">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold text-teal-700 uppercase tracking-wide">הודעת פתיחה (מצורפת תמיד לפני איש הקשר)</div>
            {!editing && (
              <button onClick={openEdit} className="text-xs text-teal-700 hover:bg-teal-100 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                עריכה
              </button>
            )}
          </div>

          {editing ? (
            <div>
              <textarea rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none" />
              <div className="flex gap-2 mt-2">
                <button onClick={save} disabled={savingLocal}
                  className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow text-white text-sm font-semibold px-4 py-1.5 rounded-xl disabled:opacity-50">
                  {savingLocal ? 'שומר…' : 'שמור'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-xl">ביטול</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
              <FormatBold text={preview} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SequenceSection({ title, position, items, onReload }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('text');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ text_content: '', media_url: '', media_caption: '', delay_ms: 0 });

  async function handleAdd(e) {
    e.preventDefault();
    const payload = {
      position,
      step_type: newType,
      text_content: newType === 'text' ? form.text_content : null,
      media_url: newType !== 'text' ? form.media_url : null,
      media_caption: newType !== 'text' && newType !== 'audio' ? form.media_caption : null,
      delay_ms: Number(form.delay_ms) || 0,
    };
    if (newType === 'text' && !form.text_content) return;
    if (newType !== 'text' && !form.media_url) return;
    await api.post('/save-contact-bot/sequence-steps', payload);
    setAdding(false);
    setForm({ text_content: '', media_url: '', media_caption: '', delay_ms: 0 });
    onReload();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/upload/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((f) => ({ ...f, media_url: data.url }));
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    const ok = await toast.confirm('למחוק את הצעד הזה?', { type: 'warning', confirmText: 'מחק', cancelText: 'ביטול' });
    if (!ok) return;
    try {
      await api.delete(`/save-contact-bot/sequence-steps/${id}`);
      toast.success('הצעד נמחק');
      onReload();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function move(id, direction) {
    const ordered = items.map((s) => s.id);
    const idx = ordered.indexOf(id);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ordered.length) return;
    [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
    await api.post('/save-contact-bot/sequence-steps/reorder', { orderedIds: ordered });
    onReload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-sm text-teal-700 hover:bg-teal-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> הוסף הודעה
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-gray-400 italic py-2">אין הודעות כרגע.</p>
      )}

      <div className="space-y-2 mb-3">
        {items.map((s, i) => (
          <StepCard key={s.id} step={s} index={i} total={items.length}
            onDelete={() => handleDelete(s.id)}
            onMoveUp={() => move(s.id, 'up')}
            onMoveDown={() => move(s.id, 'down')} />
        ))}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {STEP_TYPES.map((t) => {
              const Icon = t.icon;
              const active = newType === t.value;
              return (
                <button key={t.value} type="button" onClick={() => setNewType(t.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition ${active ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-teal-500 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'}`}>
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>

          {newType === 'text' ? (
            <textarea rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-2 bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none text-sm"
              placeholder="טקסט ההודעה…" value={form.text_content}
              onChange={(e) => setForm({ ...form, text_content: e.target.value })} />
          ) : (
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-2">
                <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden"
                  accept={newType === 'image' ? 'image/*' : newType === 'video' ? 'video/*' : newType === 'audio' ? 'audio/*' : '*'} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="bg-white border border-gray-200 px-3 py-1.5 rounded-xl text-sm hover:border-teal-300 inline-flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> {uploading ? 'מעלה…' : form.media_url ? 'החלף קובץ' : 'בחר קובץ'}
                </button>
                {form.media_url && (
                  <button type="button" onClick={() => setForm({ ...form, media_url: '' })}
                    className="text-xs text-red-600 hover:text-red-800">הסר</button>
                )}
              </div>

              {/* Media preview */}
              {form.media_url && (
                <div className="mb-2 rounded-xl overflow-hidden border border-gray-200 bg-white p-2 inline-block max-w-full">
                  {newType === 'image' && (
                    <img src={form.media_url} alt="" className="max-w-full max-h-40 rounded-md object-contain" />
                  )}
                  {newType === 'video' && (
                    <video src={form.media_url} controls className="max-w-full max-h-40 rounded-md" />
                  )}
                  {newType === 'audio' && (
                    <audio src={form.media_url} controls className="max-w-full" />
                  )}
                  {newType === 'document' && (
                    <div className="text-xs text-gray-600 flex items-center gap-2">
                      <FileIcon className="w-4 h-4" />
                      <a href={form.media_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all" dir="ltr">{form.media_url}</a>
                    </div>
                  )}
                </div>
              )}

              {['image', 'video', 'document'].includes(newType) && (
                <input type="text" className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none text-sm"
                  placeholder="כיתוב (אופציונלי)" value={form.media_caption}
                  onChange={(e) => setForm({ ...form, media_caption: e.target.value })} />
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm text-gray-600">השהייה (מ"ש):</label>
            <input type="number" min="0" step="100" className="w-28 border border-gray-200 rounded-xl px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-teal-200 outline-none"
              value={form.delay_ms} onChange={(e) => setForm({ ...form, delay_ms: e.target.value })} />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow-md text-white text-sm font-semibold px-4 py-1.5 rounded-xl">הוסף</button>
            <button type="button" onClick={() => setAdding(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-xl">ביטול</button>
          </div>
        </form>
      )}
    </div>
  );
}

function StepCard({ step, index, total, onDelete, onMoveUp, onMoveDown }) {
  const typeMeta = STEP_TYPES.find((t) => t.value === step.step_type) || STEP_TYPES[0];
  const Icon = typeMeta.icon;
  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-2xl p-3.5 hover:border-teal-200 transition">
      <div className="shrink-0 flex flex-col items-center gap-1">
        <div className="bg-gradient-to-br from-teal-100 to-emerald-100 p-2 rounded-xl"><Icon className="w-4 h-4 text-teal-700" /></div>
        <div className="flex flex-col">
          <button onClick={onMoveUp} disabled={index === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-1">{typeMeta.label} {step.delay_ms > 0 && `· השהייה ${step.delay_ms}מ"ש`}</div>
        {step.step_type === 'text' ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{step.text_content}</p>
        ) : (
          <div>
            {step.step_type === 'image' && step.media_url && (
              <img src={step.media_url} alt="" className="max-w-full max-h-32 rounded-lg object-cover border border-gray-100" />
            )}
            {step.step_type === 'video' && step.media_url && (
              <video src={step.media_url} controls className="max-w-full max-h-32 rounded-lg border border-gray-100" />
            )}
            {step.step_type === 'audio' && step.media_url && (
              <audio src={step.media_url} controls className="max-w-full" />
            )}
            {step.step_type === 'document' && step.media_url && (
              <a href={step.media_url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline break-all inline-flex items-center gap-1.5" dir="ltr">
                <FileIcon className="w-4 h-4 shrink-0" /> {step.media_url}
              </a>
            )}
            {step.media_caption && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{step.media_caption}</p>}
          </div>
        )}
      </div>
      <button onClick={onDelete} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg shrink-0"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}
