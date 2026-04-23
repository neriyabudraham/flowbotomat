import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Search, Filter, X, Trash2, Star, ShieldCheck,
  Loader, Eye, EyeOff, RefreshCw, Users, AlertCircle, Plus,
  CheckSquare, Square, ChevronDown, ChevronUp, Tag, Shield,
  AlertTriangle, Cloud, Mail, Upload, Archive, LogOut, Download,
  Clock, CheckCircle, FileJson, History, UserCheck, Zap
} from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import GoogleSafeDeleteModal from '../../components/viewFilter/GoogleSafeDeleteModal';
import ImportKeepListModal from '../../components/viewFilter/ImportKeepListModal';
import RuleBuilder, { isEmptyRule } from '../../components/viewFilter/RuleBuilder';

const PAGE_SIZE = 100;
const BACKUP_FRESH_MS = 30 * 60 * 1000;
const SELECTION_KEY = 'flowbot_google_cleanup_selection_v2';
const SLOTS_KEY = 'flowbot_google_cleanup_slots_v2';
const RULE_KEY = 'flowbot_google_cleanup_rule_v1';

const emptyRule = { op: 'AND', children: [] };

export default function GoogleContactCleanupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  const [accounts, setAccounts] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SLOTS_KEY)) || []; } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [viewerScope, setViewerScope] = useState('non_viewers');
  const [validityScope, setValidityScope] = useState('valid');
  const [includeKept, setIncludeKept] = useState(false);
  const [rule, setRule] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RULE_KEY)) || emptyRule; } catch { return emptyRule; }
  });
  const [appliedRule, setAppliedRule] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RULE_KEY)) || emptyRule; } catch { return emptyRule; }
  });
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('display_name');
  const [sortDir, setSortDir] = useState('ASC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [stats, setStats] = useState(null);
  const [labels, setLabels] = useState([]);
  const [syncStatusBySlot, setSyncStatusBySlot] = useState({});
  const [syncing, setSyncing] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBackupsPanel, setShowBackupsPanel] = useState(false);
  const [backups, setBackups] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  const [selected, setSelected] = useState(() => {
    try {
      const raw = localStorage.getItem(SELECTION_KEY);
      if (!raw) return new Map();
      const arr = JSON.parse(raw);
      return new Map(arr.map(c => [c.resource_name, c]));
    } catch { return new Map(); }
  });

  const debounceRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => { fetchMe(); }, []);
  useEffect(() => { loadAccounts(); }, []);

  // Handle OAuth return from Google
  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      loadAccounts();
      setSuccessMsg('חשבון Google חובר בהצלחה');
      navigate('/view-filter/cleanup/google', { replace: true });
    }
  }, []);

  // Persist selection + slots + rule
  useEffect(() => {
    try { localStorage.setItem(SELECTION_KEY, JSON.stringify(Array.from(selected.values()).slice(0, 10000))); } catch {}
  }, [selected]);
  useEffect(() => {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(selectedSlots)); } catch {}
  }, [selectedSlots]);

  // Debounce quick-search (top search bar)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setAppliedSearch(search);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  useEffect(() => {
    loadContacts();
    loadStats();
    loadLabels();
  }, [selectedSlots.join(','), appliedSearch, appliedRule, page, sortBy, sortDir, viewerScope, validityScope, includeKept]);

  // Poll sync status for any slot currently syncing
  useEffect(() => {
    const anyRunning = Object.values(syncStatusBySlot).some(s => s?.status === 'running');
    if (anyRunning) {
      pollRef.current = setInterval(() => {
        selectedSlots.forEach(slot => loadSyncStatus(slot));
        if (selectedSlots.length === 0) accounts.forEach(a => loadSyncStatus(a.slot));
      }, 3000);
      return () => clearInterval(pollRef.current);
    }
  }, [syncStatusBySlot, selectedSlots.join(','), accounts.length]);

  const loadAccounts = async () => {
    try {
      const { data } = await api.get('/contacts/cleanup/google/accounts');
      setAccounts(data.accounts || []);
      // On first visit, select all connected accounts by default
      if (selectedSlots.length === 0 && (data.accounts || []).length > 0) {
        const allConnected = data.accounts.filter(a => a.status === 'connected').map(a => a.slot);
        setSelectedSlots(allConnected);
      }
      (data.accounts || []).forEach(acc => loadSyncStatus(acc.slot));
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בטעינת חשבונות');
    }
  };

  const loadContacts = async () => {
    setLoading(true); setError('');
    try {
      const body = {
        slots: selectedSlots,
        page, limit: PAGE_SIZE, sortBy, sortDir,
        viewerScope, validityScope, includeKept,
      };
      if (appliedSearch.trim()) {
        // Quick-search is layered on top of the rule by constructing a synthetic rule
        // that AND-merges with the user's rule.
        const searchRule = {
          op: 'OR',
          children: [
            { field: 'display_name', operator: 'contains', value: appliedSearch.trim() },
            { field: 'primary_phone', operator: 'contains', value: appliedSearch.trim() },
            { field: 'phone_normalized', operator: 'contains', value: appliedSearch.trim() },
          ],
        };
        body.rule = isEmptyRule(appliedRule)
          ? searchRule
          : { op: 'AND', children: [appliedRule, searchRule] };
      } else if (!isEmptyRule(appliedRule)) {
        body.rule = appliedRule;
      }
      const { data } = await api.post('/contacts/cleanup/google/list', body);
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בטעינת הרשימה');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = useCallback(async () => {
    try {
      const slotsQuery = selectedSlots.length ? `?slots=${selectedSlots.join(',')}` : '';
      const { data } = await api.get(`/contacts/cleanup/google/stats${slotsQuery}`);
      setStats(data.stats);
    } catch {}
  }, [selectedSlots]);

  const loadLabels = useCallback(async () => {
    try {
      const promises = (selectedSlots.length ? selectedSlots : accounts.map(a => a.slot))
        .map(slot => api.get(`/contacts/cleanup/google/labels?slot=${slot}`).then(r => ({ slot, labels: r.data.labels || [] })));
      const results = await Promise.all(promises);
      const byName = new Map();
      for (const { slot, labels: ll } of results) {
        for (const l of ll) {
          const key = l.name;
          const existing = byName.get(key);
          if (existing) {
            existing.slots.push(slot);
            existing.member_count += (l.member_count || 0);
          } else {
            byName.set(key, { ...l, slots: [slot] });
          }
        }
      }
      setLabels(Array.from(byName.values()));
    } catch {}
  }, [selectedSlots.join(','), accounts.length]);

  const loadSyncStatus = async (slot) => {
    try {
      const { data } = await api.get(`/contacts/cleanup/google/sync-status?slot=${slot}`);
      setSyncStatusBySlot(prev => ({ ...prev, [slot]: data.status }));
    } catch {}
  };

  const loadBackups = async () => {
    try {
      const slotsToQuery = selectedSlots.length ? selectedSlots : accounts.map(a => a.slot);
      const promises = slotsToQuery.map(slot =>
        api.get(`/contacts/cleanup/google/backups?slot=${slot}`).then(r =>
          (r.data.backups || []).map(b => ({ ...b, slot }))
        )
      );
      const results = await Promise.all(promises);
      const merged = results.flat().sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );
      setBackups(merged);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בטעינת גיבויים');
    }
  };

  useEffect(() => { if (showBackupsPanel) loadBackups(); }, [showBackupsPanel, selectedSlots.join(',')]);

  const handleConnectGoogle = async () => {
    setConnecting(true);
    try {
      const { data } = await api.get('/view-filter/google/auth-url', {
        params: { returnTo: '/view-filter/cleanup/google' },
      });
      window.location.href = data.url;
    } catch (err) {
      setError('שגיאה בפתיחת חיבור Google');
      setConnecting(false);
    }
  };

  const handleSync = async (slot) => {
    setSyncing(prev => ({ ...prev, [slot]: true })); setError('');
    try {
      await api.post('/contacts/cleanup/google/sync', { slot });
      await loadSyncStatus(slot);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בסנכרון');
    } finally {
      setSyncing(prev => ({ ...prev, [slot]: false }));
    }
  };

  const handleCreateBackup = async () => {
    if (selectedSlots.length !== 1) {
      setError('בחר בדיוק חשבון אחד כדי ליצור גיבוי');
      return;
    }
    const slot = selectedSlots[0];
    setCreatingBackup(true); setError('');
    try {
      await api.post('/contacts/cleanup/google/backups', {
        slot,
        label: `גיבוי ידני — ${new Date().toLocaleString('he-IL')}`,
        reason: 'manual',
      });
      await loadStats();
      if (showBackupsPanel) loadBackups();
      setSuccessMsg('גיבוי נוצר');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה ביצירת גיבוי');
    } finally {
      setCreatingBackup(false);
    }
  };

  const applyRule = () => { setPage(1); setAppliedRule(JSON.parse(JSON.stringify(rule))); try { localStorage.setItem(RULE_KEY, JSON.stringify(rule)); } catch {} };
  const resetRule = () => { setRule(emptyRule); setAppliedRule(emptyRule); try { localStorage.removeItem(RULE_KEY); } catch {} };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const backupFreshness = useMemo(() => {
    if (!stats?.latest_backup_at) return { fresh: false, mins: 0, remainingMin: 0 };
    const ageMs = Date.now() - new Date(stats.latest_backup_at).getTime();
    const fresh = ageMs < BACKUP_FRESH_MS;
    return { fresh, mins: Math.floor(ageMs / 60000), remainingMin: Math.max(0, Math.ceil((BACKUP_FRESH_MS - ageMs) / 60000)) };
  }, [stats]);

  const toggleSelect = (c) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(c.resource_name)) next.delete(c.resource_name);
      else next.set(c.resource_name, c);
      return next;
    });
  };
  const togglePageSelect = () => {
    const allOnPageSelected = contacts.every(c => selected.has(c.resource_name));
    setSelected(prev => {
      const next = new Map(prev);
      if (allOnPageSelected) contacts.forEach(c => next.delete(c.resource_name));
      else contacts.forEach(c => next.set(c.resource_name, c));
      return next;
    });
  };
  const selectAllInFilter = async () => {
    setBulkBusy(true);
    try {
      const body = {
        slots: selectedSlots,
        viewerScope, validityScope, includeKept,
      };
      if (!isEmptyRule(appliedRule)) body.rule = appliedRule;
      const { data } = await api.post('/contacts/cleanup/google/preview', body);
      const next = new Map();
      (data.contacts || []).forEach(c => next.set(c.resource_name, c));
      setSelected(next);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally {
      setBulkBusy(false);
    }
  };
  const clearSelection = () => setSelected(new Map());

  const addSelectedToKeep = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const phones = Array.from(selected.values()).map(c => c.phone_normalized || c.primary_phone).filter(Boolean);
      await api.post('/contacts/cleanup/keep-list', { phones });
      clearSelection();
      await Promise.all([loadContacts(), loadStats()]);
      setSuccessMsg(`סומנו ${phones.length.toLocaleString()} כשמורים`);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally {
      setBulkBusy(false);
    }
  };

  const removeSelectedFromKeep = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const phones = Array.from(selected.values()).map(c => c.phone_normalized || c.primary_phone).filter(Boolean);
      await api.delete('/contacts/cleanup/keep-list', { data: { phones } });
      clearSelection();
      await Promise.all([loadContacts(), loadStats()]);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally {
      setBulkBusy(false);
    }
  };

  // Rule-builder field schema
  const labelOptions = useMemo(
    () => labels.map(l => ({ value: l.resource_name, label: `${l.name} ${l.slots.length > 1 ? `(${l.slots.length} חשבונות)` : ''}`.trim() })),
    [labels]
  );
  const accountOptions = useMemo(
    () => accounts.filter(a => a.status === 'connected').map(a => ({ value: String(a.slot), label: a.account_email || `סלוט ${a.slot}` })),
    [accounts]
  );
  const ruleFields = useMemo(() => [
    { key: 'display_name',    label: 'שם',                 type: 'text',  placeholder: 'ישראל' },
    { key: 'primary_phone',   label: 'טלפון (מקורי)',      type: 'text',  ltr: true },
    { key: 'phone_normalized',label: 'טלפון (מנורמל)',     type: 'text',  ltr: true, placeholder: '972...' },
    { key: 'email',           label: 'אימייל',             type: 'text',  ltr: true },
    { key: 'labels',          label: 'תוויות Google',      type: 'array', options: labelOptions },
    { key: 'account_email',   label: 'חשבון Google',       type: 'text' },
    { key: 'is_viewer',       label: 'צופה בסטטוסים',      type: 'boolean' },
    { key: 'is_kept',         label: 'ברשימה השמורה',       type: 'boolean' },
    { key: 'is_valid_phone',  label: 'מספר טלפון תקין',     type: 'boolean' },
  ], [labelOptions]);

  const allOnPageSelected = contacts.length > 0 && contacts.every(c => selected.has(c.resource_name));
  const anyConnected = accounts.some(a => a.status === 'connected');
  const canDelete = backupFreshness.fresh && selected.size > 0 && selectedSlots.length === 1;
  const ruleActive = !isEmptyRule(appliedRule);
  const labelById = useMemo(() => Object.fromEntries(labels.map(l => [l.resource_name, l.name])), [labels]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50" dir="rtl">
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/view-filter/dashboard')} className="p-2 hover:bg-gray-100 rounded-xl">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="h-8 w-px bg-gray-200" />
            <Logo />
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => navigate('/admin')} className="p-2 hover:bg-red-50 rounded-xl" title="ניהול">
                <Shield className="w-5 h-5 text-red-500" />
              </button>
            )}
            <NotificationsDropdown />
            <div className="h-8 w-px bg-gray-200" />
            <AccountSwitcher />
            <button onClick={() => { logout(); navigate('/login'); }}
              className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium">
              התנתק
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cloud className="w-6 h-6 text-blue-500" />
            ניקוי אנשי קשר ב-Google
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            חיבור וניהול של חשבונות Google Contacts, סינון מתקדם, גיבוי ומחיקה — הכל במסך אחד.
            <strong className="text-red-600 mr-1">מחיקה כאן תתפשט לכל המכשירים שלך.</strong>
          </p>
        </div>

        {/* Success / error */}
        {successMsg && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-800 text-sm">
            <CheckCircle className="w-4 h-4" /> {successMsg}
            <button onClick={() => setSuccessMsg('')} className="mr-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" /> <span>{error}</span>
            <button onClick={() => setError('')} className="mr-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Connected accounts panel (multi-account top section) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <Mail className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-gray-900">חשבונות Google מחוברים</h2>
            <span className="text-sm text-gray-400">({accounts.filter(a => a.status === 'connected').length} מחוברים)</span>
            <button onClick={handleConnectGoogle} disabled={connecting}
              className="mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
              {connecting ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              חבר חשבון {accounts.length > 0 ? 'נוסף' : ''}
            </button>
          </div>
          {accounts.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              <Cloud className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              עדיין לא חיברת חשבון Google. לחץ "חבר חשבון" כדי להתחיל.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {accounts.map(acc => {
                const isSel = selectedSlots.includes(acc.slot);
                const sync = syncStatusBySlot[acc.slot];
                const isSyncing = syncing[acc.slot] || sync?.status === 'running';
                const est = sync?.total_estimate || 0;
                const done = sync?.contact_count || 0;
                const pct = isSyncing && est > 0 ? Math.min(100, Math.round(done / est * 100)) : 0;
                return (
                  <div key={acc.slot} className={`px-5 py-3 ${isSel ? 'bg-blue-50/40' : ''}`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={isSel}
                          disabled={acc.status !== 'connected'}
                          onChange={e => {
                            setSelectedSlots(prev => e.target.checked
                              ? [...new Set([...prev, acc.slot])]
                              : prev.filter(s => s !== acc.slot)
                            );
                            clearSelection();
                          }} />
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900 text-sm">
                          {acc.account_email || `סלוט ${acc.slot}`}
                        </span>
                      </label>
                      <span className="text-xs text-gray-500">
                        {acc.cached_count?.toLocaleString() || 0} בקאש
                      </span>
                      {sync?.finished_at && !isSyncing && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(sync.finished_at).toLocaleString('he-IL')}
                        </span>
                      )}
                      {sync?.status === 'error' && (
                        <span className="text-xs text-red-500" title={sync.error_message}>שגיאה בסנכרון</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        acc.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {acc.status === 'connected' ? 'מחובר' : 'מנותק'}
                      </span>
                      <div className="mr-auto flex gap-1.5">
                        <button onClick={() => handleSync(acc.slot)}
                          disabled={isSyncing || acc.status !== 'connected'}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-40">
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'מסנכרן...' : 'סנכרן'}
                        </button>
                      </div>
                    </div>
                    {/* Progress bar when sync is running */}
                    {isSyncing && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <div className="flex-1 min-w-[200px] bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className="h-2 bg-gradient-to-l from-blue-500 to-indigo-500 transition-all duration-500"
                            style={{ width: `${est > 0 ? pct : 8}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 font-mono">
                          {est > 0
                            ? `${done.toLocaleString()} / ~${est.toLocaleString()} (${pct}%)`
                            : `${done.toLocaleString()} סונכרנו...`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!anyConnected ? null : (
          <>
            {/* Backup status banner */}
            {selectedSlots.length === 1 && (backupFreshness.fresh ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-green-800">גיבוי טרי קיים לחשבון זה</p>
                  <p className="text-xs text-green-700">נוצר לפני {backupFreshness.mins} דקות • תקף עוד {backupFreshness.remainingMin} דקות</p>
                </div>
                <button onClick={handleCreateBackup} disabled={creatingBackup}
                  className="text-sm px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50">
                  {creatingBackup ? 'יוצר...' : 'גיבוי חדש'}
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900">צור גיבוי טרי לפני מחיקה</p>
                  <p className="text-sm text-amber-800">מחיקה מ-Google היא בלתי הפיכה ומתפשטת לכל המכשירים.</p>
                </div>
                <button onClick={handleCreateBackup} disabled={creatingBackup}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50">
                  {creatingBackup ? <><Loader className="w-4 h-4 animate-spin" /> יוצר...</> : <><ShieldCheck className="w-4 h-4" /> צור גיבוי</>}
                </button>
              </div>
            ))}

            {/* Stats */}
            {stats && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">סיכום — לחץ על ריבוע כדי לסנן מיידית</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatPill label="סה״כ בחשבונות" value={stats.total_in_cache} icon={<Cloud className="w-4 h-4" />} color="gray"
                    clickable active={viewerScope === 'all' && validityScope === 'all'}
                    onClick={() => { setViewerScope('all'); setValidityScope('all'); clearSelection(); }} />
                  <StatPill label="תקינים" value={stats.total_valid} icon={<Users className="w-4 h-4" />} color="blue"
                    clickable active={viewerScope === 'all' && validityScope === 'valid'}
                    onClick={() => { setViewerScope('all'); setValidityScope('valid'); clearSelection(); }} />
                  <StatPill label="צופים" value={stats.viewers} icon={<Eye className="w-4 h-4" />} color="green"
                    clickable active={viewerScope === 'viewers_only'}
                    onClick={() => { setViewerScope('viewers_only'); setValidityScope('valid'); clearSelection(); }} />
                  <StatPill label="לא צופים" value={stats.non_viewers} icon={<EyeOff className="w-4 h-4" />} color="orange"
                    clickable active={viewerScope === 'non_viewers'}
                    onClick={() => { setViewerScope('non_viewers'); setValidityScope('valid'); clearSelection(); }} />
                  <StatPill label="שמורים (לא ימחקו)" value={stats.kept} icon={<Star className="w-4 h-4" />} color="yellow"
                    clickable active={includeKept}
                    onClick={() => { setIncludeKept(true); setViewerScope('all'); setValidityScope('all'); clearSelection(); }} />
                  <StatPill label="לא תקינים" value={stats.invalid_contacts} icon={<AlertTriangle className="w-4 h-4" />} color="red"
                    clickable active={validityScope === 'invalid'}
                    onClick={() => { setValidityScope('invalid'); setViewerScope('all'); clearSelection(); }} />
                </div>
              </div>
            )}

            {/* Quick actions row */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-xl hover:bg-yellow-100">
                <Upload className="w-4 h-4" /> ייבוא רשימה שמורה
              </button>
              <button onClick={() => setShowBackupsPanel(s => !s)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100">
                <Archive className="w-4 h-4" /> גיבויים ({stats?.backups || 0})
                {showBackupsPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Inline Backups Panel */}
            {showBackupsPanel && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Archive className="w-5 h-5 text-purple-500" />
                  <h3 className="font-bold text-gray-900">גיבויים זמינים</h3>
                  <span className="text-sm text-gray-400">({backups.length})</span>
                  <button onClick={loadBackups} className="mr-auto p-1.5 hover:bg-gray-100 rounded" title="רענן">
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                {backups.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">אין גיבויים — לחץ "צור גיבוי" למעלה</div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                    {backups.map(b => {
                      const acc = accounts.find(a => a.slot === b.slot);
                      return (
                        <div key={b.id} className="px-5 py-3 flex items-center gap-3">
                          <FileJson className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{b.label || 'גיבוי'}</p>
                            <p className="text-xs text-gray-500">
                              {acc?.account_email || `סלוט ${b.slot}`} • {(b.contact_count || 0).toLocaleString()} אנשי קשר •
                              {new Date(b.created_at).toLocaleString('he-IL')}
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                const res = await api.get(`/contacts/cleanup/google/backups/${b.id}/download`, { responseType: 'blob' });
                                const url = URL.createObjectURL(res.data);
                                const a = document.createElement('a');
                                a.href = url;
                                const ts = new Date(b.created_at).toISOString().slice(0, 19).replace(/[:T]/g, '-');
                                a.download = `google-contacts-${ts}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } catch {}
                            }}
                            className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="הורד">
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('למחוק את הגיבוי?')) return;
                              try {
                                await api.delete(`/contacts/cleanup/google/backups/${b.id}`);
                                loadBackups(); loadStats();
                              } catch {}
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="מחק">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Filters + rule builder */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="חיפוש מהיר — שם או טלפון..."
                    className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400" />
                </div>

                <select value={viewerScope} onChange={e => setViewerScope(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="non_viewers">רק לא צופים</option>
                  <option value="viewers_only">רק צופים</option>
                  <option value="all">כל אנשי הקשר</option>
                </select>
                <select value={validityScope} onChange={e => setValidityScope(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="valid">רק תקינים</option>
                  <option value="invalid">רק לא תקינים</option>
                  <option value="all">הכל</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={includeKept} onChange={e => setIncludeKept(e.target.checked)} />
                  הצג גם שמורים
                </label>

                <button onClick={() => setShowRuleBuilder(s => !s)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm border-2 transition-colors ${
                    showRuleBuilder ? 'bg-purple-500 text-white border-purple-500' : 'border-purple-200 text-purple-700 hover:bg-purple-50'
                  }`}>
                  <Filter className="w-4 h-4" /> תנאים מתקדמים
                  {ruleActive && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${showRuleBuilder ? 'bg-white text-purple-600' : 'bg-purple-100 text-purple-700'}`}>
                      פעיל
                    </span>
                  )}
                  {showRuleBuilder ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {showRuleBuilder && (
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <p className="text-xs text-gray-500">
                    בנה תנאים מורכבים: שלב <strong>גם וגם / או</strong>, קבץ בקבוצות מקוננות, השתמש ב"מתחיל ב", "מסתיים ב" ועוד.
                  </p>
                  <RuleBuilder value={rule} onChange={setRule} fields={ruleFields} maxDepth={4} />
                  <div className="flex items-center justify-end gap-2 pt-2">
                    {ruleActive && (
                      <button onClick={resetRule}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-red-600">
                        <X className="w-4 h-4 inline" /> איפוס
                      </button>
                    )}
                    <button onClick={applyRule}
                      className="px-5 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600">
                      <Zap className="w-4 h-4 inline ml-1" /> החל
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="bg-white rounded-2xl border-2 border-blue-300 shadow-md p-4 flex flex-wrap items-center gap-3 sticky top-20 z-20">
                <CheckSquare className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-gray-900">נבחרו {selected.size.toLocaleString()}</span>
                <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">נשמר ברענון</span>
                <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700">נקה</button>
                <div className="flex-1" />
                <button onClick={addSelectedToKeep} disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg hover:bg-yellow-200 disabled:opacity-50">
                  <Star className="w-4 h-4" /> סמן כשמורים
                </button>
                <button onClick={removeSelectedFromKeep} disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  הסר מהשמורים
                </button>
                <button onClick={() => setShowDeleteModal(true)} disabled={bulkBusy || !canDelete}
                  title={!backupFreshness.fresh ? 'נדרש גיבוי טרי' : (selectedSlots.length !== 1 ? 'בחר בדיוק חשבון אחד למחיקה' : '')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 className="w-4 h-4" />
                  {!backupFreshness.fresh ? 'נדרש גיבוי טרי' : selectedSlots.length !== 1 ? 'בחר חשבון יחיד' : 'מחק מגוגל'}
                </button>
              </div>
            )}

            {/* List */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                <button onClick={togglePageSelect}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600">
                  {allOnPageSelected ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
                  סמן את העמוד הזה ({contacts.length})
                </button>
                <button onClick={selectAllInFilter} disabled={bulkBusy || total === 0}
                  className="text-sm text-blue-600 hover:underline disabled:opacity-40">
                  סמן את כל {total.toLocaleString()} בסינון
                </button>
                <span className="text-sm text-gray-400 mr-auto">
                  {loading ? 'טוען...' : `${total.toLocaleString()} תוצאות`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="px-4 py-2.5 text-right w-10"></th>
                      <SortableHeader col="display_name" sortBy={sortBy} sortDir={sortDir} onSort={(c, d) => { setSortBy(c); setSortDir(d); }}>שם</SortableHeader>
                      <SortableHeader col="primary_phone" sortBy={sortBy} sortDir={sortDir} onSort={(c, d) => { setSortBy(c); setSortDir(d); }}>טלפון</SortableHeader>
                      <th className="px-4 py-2.5 text-right">אימייל</th>
                      <th className="px-4 py-2.5 text-right">תוויות</th>
                      <SortableHeader col="slot" sortBy={sortBy} sortDir={sortDir} onSort={(c, d) => { setSortBy(c); setSortDir(d); }}>חשבון</SortableHeader>
                      <th className="px-4 py-2.5 text-right">סטטוס</th>
                      <th className="px-4 py-2.5 text-right w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {contacts.length === 0 && !loading && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                        אין אנשי קשר שמתאימים לסינון — הפעל סנכרון אם טרם הפעלת
                      </td></tr>
                    )}
                    {contacts.map(c => {
                      const isSel = selected.has(c.resource_name);
                      const isExp = expandedRow === c.resource_name;
                      const primaryEmail = Array.isArray(c.emails) ? c.emails[0] : null;
                      return (
                        <FragmentGroup key={c.resource_name}>
                          <tr
                            className={`cursor-pointer transition-colors ${isSel ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'}`}
                            onClick={() => toggleSelect(c)}>
                            <td className="px-4 py-2">
                              {isSel ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-gray-300" />}
                            </td>
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {c.display_name || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2 text-gray-500" dir="ltr">{c.primary_phone || c.phone_normalized || '—'}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[180px]" dir="ltr" title={primaryEmail || ''}>
                              {primaryEmail || '—'}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {(c.label_resource_names || []).slice(0, 3).map((rn, i) => (
                                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full border border-blue-100">
                                    {labelById[rn] || '—'}
                                  </span>
                                ))}
                                {(c.label_resource_names?.length || 0) > 3 && (
                                  <span className="text-xs text-gray-400">+{c.label_resource_names.length - 3}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">
                              <span className="inline-block bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 truncate max-w-[160px]" title={c.account_email}>
                                {c.account_email || `סלוט ${c.slot}`}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1 flex-wrap">
                                {c.is_kept && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">שמור</span>}
                                {c.is_viewer && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">צופה</span>}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedRow(isExp ? null : c.resource_name); }}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="פרטים נוספים">
                                {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>
                          {isExp && (
                            <tr className="bg-blue-50/30">
                              <td colSpan={8} className="px-6 py-4">
                                <ContactDetails contact={c} labelById={labelById} />
                              </td>
                            </tr>
                          )}
                        </FragmentGroup>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">הקודם</button>
                  <span className="text-sm text-gray-500">עמוד {page} מתוך {totalPages.toLocaleString()}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">הבא</button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <GoogleSafeDeleteModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        slot={selectedSlots[0]}
        accountEmail={accounts.find(a => a.slot === selectedSlots[0])?.account_email}
        selectedContacts={Array.from(selected.values())}
        filterSummary={{ rule: appliedRule, viewerScope, validityScope, search: appliedSearch }}
        onDeleted={() => { clearSelection(); loadContacts(); loadStats(); loadAccounts(); }}
      />
      <ImportKeepListModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={(r) => { setSuccessMsg(`נוספו ${(r.added || 0).toLocaleString()} לרשימה השמורה`); loadStats(); loadContacts(); }}
      />
    </div>
  );
}

// Wrapper: React needs keyed Fragment when rendering a pair of <tr>s for expand-row.
function FragmentGroup({ children }) { return <>{children}</>; }

// Expanded-row detail view: shows all extra fields that Google People API
// provides (emails, phones, addresses, organizations, birthday, notes, etc).
function ContactDetails({ contact, labelById }) {
  const raw = contact.raw || {};
  const emails = Array.isArray(raw.emailAddresses) ? raw.emailAddresses : [];
  const phones = Array.isArray(raw.phoneNumbers) ? raw.phoneNumbers : [];
  const addresses = Array.isArray(raw.addresses) ? raw.addresses : [];
  const orgs = Array.isArray(raw.organizations) ? raw.organizations : [];
  const birthdays = Array.isArray(raw.birthdays) ? raw.birthdays : [];
  const biographies = Array.isArray(raw.biographies) ? raw.biographies : [];
  const nicknames = Array.isArray(raw.nicknames) ? raw.nicknames : [];
  const urls = Array.isArray(raw.urls) ? raw.urls : [];
  const labels = (contact.label_resource_names || []).map(rn => labelById[rn]).filter(Boolean);

  const hasAny = emails.length || phones.length > 1 || addresses.length || orgs.length || birthdays.length || biographies.length || nicknames.length || urls.length || labels.length;

  if (!hasAny) {
    return <p className="text-sm text-gray-400">אין פרטים נוספים לאיש קשר זה.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {phones.length > 1 && (
        <DetailBlock title="טלפונים">
          {phones.map((p, i) => (
            <div key={i} className="flex items-center gap-2" dir="ltr">
              <span className="font-mono">{p.value}</span>
              {p.type && <span className="text-xs text-gray-400">({p.type})</span>}
            </div>
          ))}
        </DetailBlock>
      )}
      {emails.length > 0 && (
        <DetailBlock title="אימייל">
          {emails.map((e, i) => (
            <div key={i} className="flex items-center gap-2" dir="ltr">
              <a href={`mailto:${e.value}`} className="text-blue-600 hover:underline">{e.value}</a>
              {e.type && <span className="text-xs text-gray-400">({e.type})</span>}
            </div>
          ))}
        </DetailBlock>
      )}
      {addresses.length > 0 && (
        <DetailBlock title="כתובות">
          {addresses.map((a, i) => (
            <div key={i}>
              <p className="text-gray-800">{a.formattedValue || [a.streetAddress, a.city, a.country].filter(Boolean).join(', ')}</p>
              {a.type && <span className="text-xs text-gray-400">{a.type}</span>}
            </div>
          ))}
        </DetailBlock>
      )}
      {orgs.length > 0 && (
        <DetailBlock title="חברה / תפקיד">
          {orgs.map((o, i) => (
            <div key={i}>
              <p className="text-gray-800">{o.name || '—'} {o.title && <span className="text-gray-500">• {o.title}</span>}</p>
              {o.department && <p className="text-xs text-gray-400">{o.department}</p>}
            </div>
          ))}
        </DetailBlock>
      )}
      {birthdays.length > 0 && (
        <DetailBlock title="יום הולדת">
          {birthdays.map((b, i) => (
            <p key={i} className="text-gray-800">{b.text || `${b.date?.day || ''}/${b.date?.month || ''}${b.date?.year ? '/' + b.date.year : ''}`}</p>
          ))}
        </DetailBlock>
      )}
      {urls.length > 0 && (
        <DetailBlock title="קישורים">
          {urls.map((u, i) => (
            <a key={i} href={u.value} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline block truncate" dir="ltr">{u.value}</a>
          ))}
        </DetailBlock>
      )}
      {nicknames.length > 0 && (
        <DetailBlock title="כינויים">
          {nicknames.map((n, i) => <p key={i} className="text-gray-800">{n.value}</p>)}
        </DetailBlock>
      )}
      {biographies.length > 0 && (
        <DetailBlock title="הערות">
          {biographies.map((b, i) => <p key={i} className="text-gray-700 whitespace-pre-wrap">{b.value}</p>)}
        </DetailBlock>
      )}
      {labels.length > 0 && (
        <DetailBlock title="תוויות Google">
          <div className="flex flex-wrap gap-1">
            {labels.map((l, i) => (
              <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">{l}</span>
            ))}
          </div>
        </DetailBlock>
      )}
    </div>
  );
}

function DetailBlock({ title, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function StatPill({ label, value, icon, color, onClick, clickable, active }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-700', green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700', yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-700',
  };
  const activeRing = active ? 'ring-2 ring-blue-400 border-blue-300' : 'border-gray-100';
  return (
    <div
      className={`bg-white rounded-xl border ${activeRing} p-3 shadow-sm transition-all ${clickable ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'לחץ לסינון מהיר' : undefined}>
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${colors[color]}`}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{(value || 0).toLocaleString()}</div>
    </div>
  );
}

function SortableHeader({ col, sortBy, sortDir, onSort, children }) {
  const active = sortBy === col;
  return (
    <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-blue-600"
      onClick={() => onSort(col, active && sortDir === 'DESC' ? 'ASC' : 'DESC')}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sortDir === 'DESC' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
      </span>
    </th>
  );
}
