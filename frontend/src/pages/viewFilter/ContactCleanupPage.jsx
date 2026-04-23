import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, Filter, X, Trash2, Star, ShieldCheck, Download,
  Loader, Eye, EyeOff, RefreshCw, Users, AlertCircle, Plus, Minus,
  CheckSquare, Square, ChevronDown, ChevronUp, Tag, Archive, Upload,
  Shield, Clock, AlertTriangle
} from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import SafeDeleteModal from '../../components/viewFilter/SafeDeleteModal';
import ImportKeepListModal from '../../components/viewFilter/ImportKeepListModal';

const PAGE_SIZE = 100;
const BACKUP_FRESH_MS = 30 * 60 * 1000;
const SELECTION_STORAGE_KEY = 'flowbot_cleanup_selection_v1';

const emptyFilters = {
  viewerScope: 'non_viewers',
  validityScope: 'valid',
  search: '',
  includeName: '',
  excludeName: '',
  includePhone: '',
  excludePhone: '',
  phonePrefix: '',
  hasName: '',
  hasMessages: '',
  createdBefore: '',
  createdAfter: '',
  lastMessageBefore: '',
  lastMessageAfter: '',
  tagIds: [],
  excludeTagIds: [],
  includeKept: false,
  includeBlocked: false,
};

export default function ContactCleanupPage() {
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

  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tags, setTags] = useState([]);

  // Selection — restored from localStorage on mount, persisted on change
  const [selected, setSelected] = useState(() => {
    try {
      const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
      if (!raw) return new Map();
      const arr = JSON.parse(raw);
      return new Map(arr.map(c => [c.id, c]));
    } catch { return new Map(); }
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => { fetchMe(); }, []);
  useEffect(() => { loadStats(); loadTags(); }, []);
  useEffect(() => { loadContacts(); }, [appliedFilters, page, sortBy, sortDir]);

  // Persist selection
  useEffect(() => {
    try {
      const arr = Array.from(selected.values()).slice(0, 10000); // cap to keep storage reasonable
      localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }, [selected]);

  // Debounced text-filter auto-apply
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setAppliedFilters({ ...filters });
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.includeName, filters.excludeName, filters.includePhone, filters.excludePhone, filters.phonePrefix]);

  const loadContacts = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/contacts/cleanup/list', {
        filters: appliedFilters, page, limit: PAGE_SIZE, sortBy, sortDir,
      });
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
      const { data } = await api.get('/contacts/cleanup/stats');
      setStats(data.stats);
    } catch {}
  }, []);

  const loadTags = async () => {
    try {
      const { data } = await api.get('/contacts/tags');
      setTags(data.tags || []);
    } catch {}
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const applyFilters = () => { setPage(1); setAppliedFilters({ ...filters }); };
  const resetFilters = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); };

  // Backup freshness
  const backupFreshness = useMemo(() => {
    if (!stats?.latest_backup_at) return { fresh: false, ageMin: null, mins: 0 };
    const ageMs = Date.now() - new Date(stats.latest_backup_at).getTime();
    const fresh = ageMs < BACKUP_FRESH_MS;
    const mins = Math.floor(ageMs / 60000);
    const remaining = Math.max(0, Math.ceil((BACKUP_FRESH_MS - ageMs) / 60000));
    return { fresh, mins, remainingMin: remaining };
  }, [stats]);

  const handleCreateBackupTop = async () => {
    setCreatingBackup(true);
    try {
      await api.post('/contacts/cleanup/backups', {
        label: `גיבוי לפני עבודה — ${new Date().toLocaleString('he-IL')}`,
        reason: 'manual',
      });
      await loadStats();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה ביצירת גיבוי');
    } finally {
      setCreatingBackup(false);
    }
  };

  const toggleSelect = (contact) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(contact.id)) next.delete(contact.id); else next.set(contact.id, contact);
      return next;
    });
  };

  const togglePageSelect = () => {
    const allOnPageSelected = contacts.every(c => selected.has(c.id));
    setSelected(prev => {
      const next = new Map(prev);
      if (allOnPageSelected) contacts.forEach(c => next.delete(c.id));
      else contacts.forEach(c => next.set(c.id, c));
      return next;
    });
  };

  const selectAllInFilter = async () => {
    setBulkBusy(true);
    try {
      const { data } = await api.post('/contacts/cleanup/preview', { filters: appliedFilters });
      const next = new Map();
      (data.contacts || []).forEach(c => next.set(c.id, c));
      setSelected(next);
      if (data.truncated) {
        const matched = Number(data.total_matched || 0).toLocaleString();
        const got = Number(data.total || data.contacts?.length || 0).toLocaleString();
        setError(`הסינון תואם ${matched} אנשי קשר — סומנו רק ${got} הראשונים. מחק בכמה סבבים.`);
      } else {
        setError('');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בבחירת כל הסינון');
    } finally {
      setBulkBusy(false);
    }
  };

  const clearSelection = () => setSelected(new Map());

  const addSelectedToKeep = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const phones = Array.from(selected.values()).map(c => c.phone);
      await api.post('/contacts/cleanup/keep-list', { phones });
      clearSelection();
      await Promise.all([loadContacts(), loadStats()]);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהוספה לרשימה השמורה');
    } finally {
      setBulkBusy(false);
    }
  };

  const removeSelectedFromKeep = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const phones = Array.from(selected.values()).map(c => c.phone);
      await api.delete('/contacts/cleanup/keep-list', { data: { phones } });
      clearSelection();
      await Promise.all([loadContacts(), loadStats()]);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהסרה מהרשימה השמורה');
    } finally {
      setBulkBusy(false);
    }
  };

  const filterSummary = useMemo(() => {
    const out = {};
    Object.entries(appliedFilters).forEach(([k, v]) => {
      if (v === '' || v === false || v == null) return;
      if (Array.isArray(v) && v.length === 0) return;
      out[k] = v;
    });
    return out;
  }, [appliedFilters]);

  const allOnPageSelected = contacts.length > 0 && contacts.every(c => selected.has(c.id));
  const activeFilterCount = Object.entries(filterSummary)
    .filter(([k, v]) => k !== 'viewerScope' && !(k === 'validityScope' && v === 'valid')).length;
  const canDelete = backupFreshness.fresh && selected.size > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50" dir="rtl">
      {/* Site-standard header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/view-filter/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="חזרה לבוט סינון צפיות"
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
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-5">
        {/* Page title */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-orange-500" />
              ניקוי אנשי קשר שלא צופים
            </h1>
            <p className="text-sm text-gray-500 mt-1">סנן, סמן את החשובים, גבה ומחק בבטחה.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100"
              title="העלה קובץ CSV / VCF / vCard עם אנשי קשר חשובים שלא יימחקו"
            >
              <Upload className="w-4 h-4" /> ייבוא רשימה שמורה מקובץ
            </button>
            <button
              onClick={() => navigate('/view-filter/cleanup/backups')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50"
              title="ניהול גיבויים ושחזור"
            >
              <Archive className="w-4 h-4" /> גיבויים
            </button>
            <button
              onClick={() => { loadContacts(); loadStats(); }}
              className="p-2 hover:bg-gray-100 rounded-xl"
              title="רענון"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Backup-status banner — required first step */}
        {backupFreshness.fresh ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-green-800">קיים גיבוי טרי — אפשר להמשיך בבטחה</p>
              <p className="text-xs text-green-700">
                נוצר לפני {backupFreshness.mins} דקות • תקף עוד {backupFreshness.remainingMin} דקות
              </p>
            </div>
            <button
              onClick={handleCreateBackupTop}
              disabled={creatingBackup}
              className="text-sm px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
            >
              {creatingBackup ? 'יוצר...' : 'צור גיבוי חדש'}
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-amber-900">צור גיבוי טרי לפני שתתחיל</p>
              <p className="text-sm text-amber-800">
                {stats?.latest_backup_at
                  ? `הגיבוי האחרון נוצר לפני ${backupFreshness.mins.toLocaleString()} דקות (יותר מ-30, נחשב ישן).`
                  : 'עדיין לא נוצר גיבוי. כפתור המחיקה יישאר חסום עד שיהיה גיבוי תקף.'}
              </p>
            </div>
            <button
              onClick={handleCreateBackupTop}
              disabled={creatingBackup}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {creatingBackup
                ? <><Loader className="w-4 h-4 animate-spin" /> יוצר גיבוי...</>
                : <><ShieldCheck className="w-4 h-4" /> צור גיבוי עכשיו</>}
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatPill label="סה״כ אנשי קשר תקינים" value={stats.total_contacts} icon={<Users className="w-4 h-4" />} color="gray" />
            <StatPill label="צופים" value={stats.viewers} icon={<Eye className="w-4 h-4" />} color="green" />
            <StatPill label="לא צופים" value={stats.non_viewers} icon={<EyeOff className="w-4 h-4" />} color="orange" />
            <StatPill label="שמורים (לא ימחקו)" value={stats.kept} icon={<Star className="w-4 h-4" />} color="yellow" />
            <StatPill
              label="לא תקינים (קבוצות/ID)"
              value={stats.invalid_contacts}
              icon={<AlertTriangle className="w-4 h-4" />}
              color="red"
              onClick={() => {
                setF('validityScope', 'invalid');
                setAppliedFilters({ ...filters, validityScope: 'invalid' });
                setPage(1);
              }}
              clickable
            />
            <StatPill label="גיבויים שמורים" value={stats.backups} icon={<ShieldCheck className="w-4 h-4" />} color="purple" />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={filters.search}
                onChange={e => setF('search', e.target.value)}
                placeholder="חיפוש מהיר לפי שם או טלפון..."
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400"
              />
            </div>
            <button
              onClick={() => setShowAdvanced(s => !s)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm border transition-colors ${
                showAdvanced ? 'bg-purple-500 text-white border-purple-500' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" /> סינון מתקדם
              {activeFilterCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${showAdvanced ? 'bg-white text-purple-600' : 'bg-purple-100 text-purple-700'}`}>
                  {activeFilterCount}
                </span>
              )}
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-sm text-gray-500 hover:text-red-600 px-2">
                <X className="w-4 h-4 inline" /> נקה
              </button>
            )}
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
              <FilterField label="מכיל בשם" icon={<Plus className="w-3.5 h-3.5 text-green-500" />}>
                <input type="text" value={filters.includeName} onChange={e => setF('includeName', e.target.value)}
                  placeholder='לדוגמה: "ישראל"'
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-purple-400" />
              </FilterField>
              <FilterField label="לא מכיל בשם" icon={<Minus className="w-3.5 h-3.5 text-red-500" />}>
                <input type="text" value={filters.excludeName} onChange={e => setF('excludeName', e.target.value)}
                  placeholder='לדוגמה: "ספאם"'
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-purple-400" />
              </FilterField>
              <FilterField label="קידומת טלפון" icon={<Plus className="w-3.5 h-3.5 text-green-500" />}>
                <input type="text" value={filters.phonePrefix} onChange={e => setF('phonePrefix', e.target.value)}
                  placeholder='לדוגמה: "972"' dir="ltr"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-purple-400" />
              </FilterField>
              <FilterField label="מכיל בטלפון" icon={<Plus className="w-3.5 h-3.5 text-green-500" />}>
                <input type="text" value={filters.includePhone} onChange={e => setF('includePhone', e.target.value)}
                  dir="ltr" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-purple-400" />
              </FilterField>
              <FilterField label="לא מכיל בטלפון" icon={<Minus className="w-3.5 h-3.5 text-red-500" />}>
                <input type="text" value={filters.excludePhone} onChange={e => setF('excludePhone', e.target.value)}
                  dir="ltr" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-purple-400" />
              </FilterField>
              <FilterField label="עם / בלי שם תצוגה">
                <select value={filters.hasName} onChange={e => setF('hasName', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">כולם</option>
                  <option value="true">רק עם שם</option>
                  <option value="false">רק בלי שם</option>
                </select>
              </FilterField>
              <FilterField label="עם / בלי הודעות">
                <select value={filters.hasMessages} onChange={e => setF('hasMessages', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">כולם</option>
                  <option value="true">רק עם הודעות</option>
                  <option value="false">רק בלי הודעות</option>
                </select>
              </FilterField>
              <FilterField label="הודעה אחרונה לפני">
                <select value={filters.lastMessageBefore} onChange={e => setF('lastMessageBefore', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">בלי סינון</option>
                  <option value="never">אף פעם לא הייתה הודעה</option>
                  <option value={isoDaysAgo(30)}>לפני יותר מ-30 יום</option>
                  <option value={isoDaysAgo(90)}>לפני יותר מ-90 יום</option>
                  <option value={isoDaysAgo(180)}>לפני יותר מ-180 יום</option>
                  <option value={isoDaysAgo(365)}>לפני יותר משנה</option>
                </select>
              </FilterField>
              <FilterField label="נוסף לאחר">
                <input type="date" value={filters.createdAfter || ''} onChange={e => setF('createdAfter', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
              </FilterField>

              {tags.length > 0 && (
                <>
                  <FilterField label="עם תגית" icon={<Tag className="w-3.5 h-3.5 text-purple-500" />} fullWidth>
                    <TagPicker selected={filters.tagIds} onChange={ids => setF('tagIds', ids)} tags={tags} />
                  </FilterField>
                  <FilterField label="בלי תגית" icon={<Tag className="w-3.5 h-3.5 text-red-400" />} fullWidth>
                    <TagPicker selected={filters.excludeTagIds} onChange={ids => setF('excludeTagIds', ids)} tags={tags} />
                  </FilterField>
                </>
              )}

              <div className="md:col-span-2 lg:col-span-3 flex items-center gap-4 pt-2 border-t border-gray-100 flex-wrap">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={filters.includeKept} onChange={e => setF('includeKept', e.target.checked)} />
                  הצג גם אנשי קשר ברשימה השמורה
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={filters.includeBlocked} onChange={e => setF('includeBlocked', e.target.checked)} />
                  הצג גם אנשי קשר חסומים
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer mr-auto">
                  היקף:
                  <select value={filters.viewerScope} onChange={e => setF('viewerScope', e.target.value)}
                    className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white">
                    <option value="non_viewers">רק לא צופים</option>
                    <option value="viewers_only">רק צופים</option>
                    <option value="all">כל אנשי הקשר</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  תקינות:
                  <select value={filters.validityScope} onChange={e => setF('validityScope', e.target.value)}
                    className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white">
                    <option value="valid">רק מספרים תקינים</option>
                    <option value="invalid">רק לא תקינים (קבוצות / IDs)</option>
                    <option value="all">הכל</option>
                  </select>
                </label>
                <button onClick={applyFilters}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600">
                  החל סינון
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bulk action bar (sticky) */}
        {selected.size > 0 && (
          <div className="bg-white rounded-2xl border-2 border-purple-300 shadow-md p-4 flex flex-wrap items-center gap-3 sticky top-20 z-20">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-purple-500" />
              <span className="font-medium text-gray-900">נבחרו {selected.size.toLocaleString()} אנשי קשר</span>
              <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">נשמר ברענון</span>
            </div>
            <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700">נקה בחירה</button>
            <div className="flex-1" />
            <button onClick={addSelectedToKeep} disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg hover:bg-yellow-200 disabled:opacity-50">
              <Star className="w-4 h-4" /> סמן כשמורים
            </button>
            <button onClick={removeSelectedFromKeep} disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              הסר מהשמורים
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={bulkBusy || !canDelete}
              title={!backupFreshness.fresh ? 'נדרש גיבוי טרי לפני המחיקה' : ''}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {!backupFreshness.fresh ? 'נדרש גיבוי טרי' : 'מחק לצמיתות'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
            <button onClick={() => setError('')} className="mr-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <button onClick={togglePageSelect}
              className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-purple-600">
              {allOnPageSelected ? <CheckSquare className="w-4 h-4 text-purple-500" /> : <Square className="w-4 h-4" />}
              סמן את העמוד הזה ({contacts.length})
            </button>
            <button onClick={selectAllInFilter} disabled={bulkBusy || total === 0}
              className="text-sm text-purple-600 hover:underline disabled:opacity-40">
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
                  <SortableHeader col="phone" sortBy={sortBy} sortDir={sortDir} onSort={(c, d) => { setSortBy(c); setSortDir(d); }}>טלפון</SortableHeader>
                  <th className="px-4 py-2.5 text-right">תגיות</th>
                  <th className="px-4 py-2.5 text-right">הודעות</th>
                  <SortableHeader col="last_message_at" sortBy={sortBy} sortDir={sortDir} onSort={(c, d) => { setSortBy(c); setSortDir(d); }}>הודעה אחרונה</SortableHeader>
                  <SortableHeader col="created_at" sortBy={sortBy} sortDir={sortDir} onSort={(c, d) => { setSortBy(c); setSortDir(d); }}>נוסף</SortableHeader>
                  <th className="px-4 py-2.5 text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contacts.length === 0 && !loading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    אין אנשי קשר שמתאימים לסינון
                  </td></tr>
                )}
                {contacts.map(c => {
                  const isSel = selected.has(c.id);
                  return (
                    <tr key={c.id}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-purple-50/60' : 'hover:bg-gray-50/60'}`}
                      onClick={() => toggleSelect(c)}>
                      <td className="px-4 py-2">
                        {isSel ? <CheckSquare className="w-4 h-4 text-purple-500" /> : <Square className="w-4 h-4 text-gray-300" />}
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {c.display_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-500" dir="ltr">{c.phone}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags || []).slice(0, 3).map((t, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t}</span>
                          ))}
                          {(c.tags?.length || 0) > 3 && <span className="text-xs text-gray-400">+{c.tags.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-500">{c.message_count || 0}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('he-IL') : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString('he-IL') : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {c.is_kept && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">שמור</span>}
                          {c.is_blocked && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">חסום</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                הקודם
              </button>
              <span className="text-sm text-gray-500">
                עמוד {page} מתוך {totalPages.toLocaleString()}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                הבא
              </button>
            </div>
          )}
        </div>
      </main>

      <SafeDeleteModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        selectedContacts={Array.from(selected.values())}
        filterSummary={filterSummary}
        onDeleted={() => { clearSelection(); loadContacts(); loadStats(); }}
      />

      <ImportKeepListModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() => { loadContacts(); loadStats(); }}
      />
    </div>
  );
}

function StatPill({ label, value, icon, color, onClick, clickable }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-700', green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700', yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700', red: 'bg-red-100 text-red-700',
  };
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 p-3 shadow-sm ${clickable ? 'cursor-pointer hover:border-gray-300 hover:shadow-md transition-all' : ''}`}
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'לחץ לסינון' : undefined}
    >
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${colors[color]}`}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{(value || 0).toLocaleString()}</div>
    </div>
  );
}

function FilterField({ label, icon, fullWidth, children }) {
  return (
    <div className={fullWidth ? 'md:col-span-2 lg:col-span-3' : ''}>
      <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

function TagPicker({ tags, selected, onChange }) {
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(t => (
        <button key={t.id} type="button" onClick={() => toggle(t.id)}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
            selected.includes(t.id) ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}>
          {t.name}
        </button>
      ))}
      {tags.length === 0 && <span className="text-xs text-gray-400">אין תגיות</span>}
    </div>
  );
}

function SortableHeader({ col, sortBy, sortDir, onSort, children }) {
  const active = sortBy === col;
  return (
    <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-purple-600"
        onClick={() => onSort(col, active && sortDir === 'DESC' ? 'ASC' : 'DESC')}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sortDir === 'DESC' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
      </span>
    </th>
  );
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
