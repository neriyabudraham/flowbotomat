import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, Users, TrendingUp, Download, Smartphone, Search,
  ChevronDown, ChevronUp, Filter, RefreshCw, Play,
  AlertCircle, CheckCircle, Clock, BarChart2, FileText,
  ArrowUpRight, User, Heart, ArrowLeft, Shield, Plus, ExternalLink, X, Award, Loader,
  Trash2, Cloud, Upload, Star
} from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import ViewerProfileModal from '../../components/viewFilter/ViewerProfileModal';
import ImportKeepListModal from '../../components/viewFilter/ImportKeepListModal';

export default function ViewFilterDashboardPage() {
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

  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState(null);
  const [viewers, setViewers] = useState([]);
  const [viewersMeta, setViewersMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [grayCheckmarks, setGrayCheckmarks] = useState([]);
  const [dailyGrowth, setDailyGrowth] = useState([]);
  const [startingCampaign, setStartingCampaign] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedViewer, setSelectedViewer] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [googleAccounts, setGoogleAccounts] = useState([]);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Viewers filter/sort
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('view_count');
  const [sortDir, setSortDir] = useState('DESC');
  const [page, setPage] = useState(1);
  const [showGray, setShowGray] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatingCert, setGeneratingCert] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [contactSyncResult, setContactSyncResult] = useState(null);
  const [showGoogleSyncWarning, setShowGoogleSyncWarning] = useState(false);
  const [whatsappDisconnected, setWhatsappDisconnected] = useState(false);
  const [canStartNewCampaign, setCanStartNewCampaign] = useState(true);
  const [googleContactCounts, setGoogleContactCounts] = useState([]);

  // Handle Google OAuth return
  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      loadGoogleAccounts();
      setSyncResult({ message: 'חשבון Google חובר בהצלחה' });
      navigate('/view-filter', { replace: true });
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (campaign) {
      loadViewers();
    }
  }, [search, sortBy, sortDir, page]);

  const loadAll = async () => {
    // Trigger background contact import (fire & forget — max once per 12h)
    api.get('/whatsapp/contacts/auto-import').catch(() => {});

    fetchMe();
    setLoading(true);
    setLoadingProgress(10);
    setLoadingStep('טוען פרטי מעקב...');
    try {
      const [campaignRes, statsRes] = await Promise.all([
        api.get('/view-filter/campaign').catch(() => ({ data: null })),
        api.get('/view-filter/stats').catch(() => ({ data: null })),
      ]);

      const campaignData = campaignRes.data?.campaign || null;
      const statsData = statsRes.data?.stats || null;
      setCampaign(campaignData);
      setStats(statsData);
      setWhatsappDisconnected(campaignRes.data?.whatsappDisconnected === true);
      setCanStartNewCampaign(campaignRes.data?.canStartNewCampaign !== false);
      setLoadingProgress(40);

      if (campaignData) {
        setLoadingStep('טוען רשימת צופים...');
        await loadViewers(campaignData);
        setLoadingProgress(65);

        setLoadingStep('טוען נתונים נוספים...');
        await Promise.all([
          loadGrayCheckmarks(),
          loadDailyGrowth(),
          loadGoogleAccounts(),
        ]);
        setLoadingProgress(90);
      } else {
        await loadGoogleAccounts();
        setLoadingProgress(90);
      }
    } catch (err) {
      setError('שגיאה בטעינת הנתונים');
    } finally {
      setLoadingProgress(100);
      setLoadingStep('');
      setLoading(false);
    }
  };

  const loadViewers = async (campaignArg) => {
    const activeCampaign = campaignArg || campaign;
    if (!activeCampaign) return;
    try {
      const sortMap = { view_count: 'statuses_viewed', view_percentage: 'view_percentage', last_view: 'last_seen', first_view: 'first_seen', name: 'viewer_name' };
      const backendSort = sortMap[sortBy] || sortBy;
      const params = new URLSearchParams({
        page,
        limit: 20,
        sort: backendSort,
        dir: sortDir,
        ...(search && { search }),
      });
      const { data } = await api.get(`/view-filter/viewers?${params}`);
      const normalized = (data.viewers || []).map(v => ({
        ...v,
        name: v.viewer_name || v.name || '',
        phone: v.viewer_phone || v.phone || '',
        view_count: v.statuses_viewed ?? v.view_count ?? 0,
        last_view: v.last_seen || v.last_view || null,
        first_view: v.first_seen || v.first_view || null,
      }));
      setViewers(normalized);
      setViewersMeta({ total: data.total || 0, page: data.page || 1, pages: Math.ceil((data.total || 0) / 20) });
    } catch (err) {
      console.error('[loadViewers]', err?.response?.data || err?.message);
      setError(`שגיאה בטעינת הצופים: ${err?.response?.data?.error || err?.message || 'שגיאה לא ידועה'}`);
    }
  };

  const loadGrayCheckmarks = async () => {
    try {
      const { data } = await api.get('/view-filter/gray-checkmarks');
      setGrayCheckmarks(data.contacts || []);
    } catch {}
  };

  const loadDailyGrowth = async () => {
    try {
      const { data } = await api.get('/view-filter/daily-growth');
      setDailyGrowth(data.days || data.growth || []);
    } catch {}
  };

  const loadGoogleAccounts = async () => {
    try {
      const { data } = await api.get('/view-filter/google/accounts');
      setGoogleAccounts(data.accounts || []);
    } catch {}
    try {
      const { data } = await api.get('/view-filter/google/contact-counts');
      setGoogleContactCounts(data.counts || []);
    } catch {}
  };

  const handleStartCampaign = async () => {
    setStartingCampaign(true);
    setError(null);
    try {
      const { data } = await api.post('/view-filter/campaign/start', { trackSince: 'all_time' });
      setCampaign(data.campaign);
      await loadAll();
    } catch (err) {
      if (err.response?.data?.whatsappDisconnected) {
        setError('WhatsApp לא מחובר. יש לחבר את WhatsApp דרך דף בוט הסטטוסים לפני שמתחילים מעקב.');
      } else {
        setError(err.response?.data?.error || 'שגיאה בהפעלת המעקב');
      }
    } finally {
      setStartingCampaign(false);
    }
  };

  const handleSync = () => {
    setShowGoogleSyncWarning(true);
  };

  const handleConfirmSync = async () => {
    setShowGoogleSyncWarning(false);
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post('/view-filter/google/sync');
      setSyncResult(data);
      // Refresh counts after sync
      try {
        const { data: cd } = await api.get('/view-filter/google/contact-counts');
        setGoogleContactCounts(cd.counts || []);
      } catch {}
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בסנכרון');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const { data } = await api.get('/view-filter/google/auth-url');
      window.location.href = data.url;
    } catch (err) {
      setError('שגיאה ביצירת קישור חיבור Google');
      setConnectingGoogle(false);
    }
  };

  const handleDownload = async (format) => {
    setDownloading(true);
    try {
      const res = await api.get(`/view-filter/download/contacts?format=${format}`, {
        responseType: 'blob',
      });
      const ext = format === 'vcf' ? 'vcf' : 'csv';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `view-filter-contacts.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('שגיאה בהורדת הקובץ');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/view-filter/download/report', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'view-filter-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('שגיאה בהורדת הדוח');
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenUserCertificate = async () => {
    setGeneratingCert(true);
    try {
      const res = await api.get('/view-filter/certificate', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'certificate.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('שגיאה ביצירת התעודה'); }
    finally { setGeneratingCert(false); }
  };

  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    setContactSyncResult(null);
    try {
      const { data } = await api.post('/whatsapp/contacts/sync-names', {}, { timeout: 300000 });
      setContactSyncResult({ success: true, imported: 0, updated: data.updated ?? 0 });
      loadViewers();
    } catch (err) {
      setContactSyncResult({ success: false, error: err.response?.data?.error || 'שגיאה בסנכרון אנשי קשר' });
    } finally {
      setSyncingContacts(false);
    }
  };

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'DESC' ? 'ASC' : 'DESC');
    } else {
      setSortBy(col);
      setSortDir('DESC');
    }
    setPage(1);
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronDown className="w-3 h-3 text-gray-300" />;
    return sortDir === 'DESC'
      ? <ChevronDown className="w-3 h-3 text-purple-500" />
      : <ChevronUp className="w-3 h-3 text-purple-500" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-violet-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Eye className="w-8 h-8 text-purple-500 animate-pulse" />
          </div>
          <p className="text-gray-700 font-semibold mb-1">בוט סינון צפיות</p>
          <p className="text-sm text-gray-500 mb-4 h-5">{loadingStep}</p>
          <div className="w-56 bg-gray-200 rounded-full h-2 mx-auto overflow-hidden">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 transition-all duration-500"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  const progressPercent = campaign?.progressPercent ?? 0;
  const daysElapsed = campaign?.daysElapsed ?? 0;
  const daysRemaining = campaign?.daysRemaining ?? 90;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="חזרה לדשבורד"
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

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError(null)} className="mr-auto text-red-400 hover:text-red-600 text-xs">סגור</button>
          </div>
        )}

        {/* WhatsApp Disconnected Warning */}
        {whatsappDisconnected && campaign && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3 text-orange-700">
            <Smartphone className="w-5 h-5 flex-shrink-0 text-orange-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">WhatsApp מנותק</p>
              <p className="text-xs text-orange-600 mt-0.5">המעקב מושהה. יש להתחבר מחדש ל-WhatsApp כדי להמשיך לאגור נתונים. כל הנתונים שנאספו עד כה שמורים ומוצגים למטה.</p>
            </div>
            <button onClick={() => navigate('/status-bot')} className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium whitespace-nowrap">
              התחבר מחדש
            </button>
          </div>
        )}

        {/* Campaign Status Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                {campaign?.status === 'active' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    <CheckCircle className="w-3 h-3" /> מעקב פעיל
                  </span>
                ) : campaign ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                    <Clock className="w-3 h-3" /> מעקב הסתיים
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">אין מעקב פעיל</span>
                )}
              </div>
            </div>

            {campaign ? (
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  {new Date(campaign.started_at).toLocaleDateString('he-IL')} — {new Date(campaign.ends_at).toLocaleDateString('he-IL')}
                </p>
                <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>יום {daysElapsed} מתוך 90</span>
                  <span className="font-medium text-purple-600">{Math.round(progressPercent)}% הושלם</span>
                  <span>נותרו {daysRemaining} ימים</span>
                </div>
              </div>
            ) : canStartNewCampaign ? (
              <div className="text-center py-6">
                <Play className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm text-gray-500 mb-4">לחץ כדי להתחיל לעקוב אחרי הצופים שלך</p>
                <button
                  onClick={handleStartCampaign}
                  disabled={startingCampaign}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {startingCampaign
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> מפעיל מעקב...</>
                    : <><Play className="w-4 h-4" /> התחל מעקב</>
                  }
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Clock className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">תקופת המעקב הסתיימה. הנתונים שנאספו מוצגים למטה.</p>
                <p className="text-xs text-gray-400 mt-1">להתחלת מעקב חדש, פנה למנהל המערכת.</p>
              </div>
            )}
          </div>
        </div>

        {/* Cleanup CTAs — Google + Local + Keep-list import */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Google Cleanup (primary) */}
          <div className="bg-gradient-to-l from-blue-50 via-indigo-50 to-white rounded-2xl border-2 border-blue-300 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Cloud className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  ניקוי אנשי קשר ב-Google
                  <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">חדש</span>
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  סנן לפי תוויות + צפיות, מחק מהחשבון Google שלך — הסנכרון מתפשט לכל המכשירים.
                </p>
              </div>
              <button
                onClick={() => navigate('/view-filter/cleanup/google')}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors shadow-sm hover:shadow"
              >
                <Cloud className="w-4 h-4" /> פתח מסך Google
              </button>
            </div>
          </div>

          {/* Local DB Cleanup (secondary) */}
          <div className="bg-gradient-to-l from-orange-50 via-amber-50 to-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <h3 className="font-bold text-gray-900 text-base">ניקוי DB מקומי של המערכת</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  מנקה את אנשי הקשר ש-FlowBotomat אגר. לא נוגע בגוגל ולא בטלפון.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/view-filter/cleanup')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
                >
                  פתח
                </button>
                <button
                  onClick={() => navigate('/view-filter/cleanup/backups')}
                  title="ניהול גיבויים ושחזור (DB מקומי)"
                  className="flex items-center gap-2 px-3 py-2.5 bg-white border border-orange-200 text-orange-700 rounded-xl font-medium hover:bg-orange-50 transition-colors text-sm"
                >
                  גיבויים
                </button>
              </div>
            </div>
          </div>

          {/* Keep-list import — mark contacts as "important, never delete" */}
          <div className="bg-gradient-to-l from-yellow-50 via-amber-50 to-white rounded-2xl border border-yellow-300 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Star className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <h3 className="font-bold text-gray-900 text-base">רשימה שמורה — אנשים חשובים</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  העלה קובץ CSV / VCF / vCard — אנשי הקשר יסומנו כשמורים ולא יימחקו בניקוי.
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500 text-white rounded-xl font-medium hover:bg-yellow-600 transition-colors"
              >
                <Upload className="w-4 h-4" /> ייבוא קובץ
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'צופים ייחודיים', value: stats.totalViewers ?? 0, icon: <Users className="w-5 h-5 text-purple-500" /> },
              { label: 'חדשים היום', value: stats.newToday ?? 0, icon: <TrendingUp className="w-5 h-5 text-violet-500" /> },
              { label: 'חדשים השבוע', value: stats.newThisWeek ?? 0, icon: <BarChart2 className="w-5 h-5 text-indigo-500" /> },
              { label: 'סטטוסים סה"כ', value: stats.totalStatuses ?? 0, icon: <Eye className="w-5 h-5 text-blue-500" /> },
              { label: 'ממוצע צפיות', value: Math.floor(stats.avgViewsPerStatus ?? 0), icon: <ArrowUpRight className="w-5 h-5 text-emerald-500" /> },
              { label: 'וי אפור', value: stats.grayCheckmarks ?? 0, icon: <Heart className="w-5 h-5 text-rose-400" /> },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">{s.icon}</div>
                <div className="text-2xl font-bold text-gray-900">{s.value.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Daily Growth Chart */}
        {dailyGrowth.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              צמיחת צופים יומית (30 ימים אחרונים)
            </h3>
            <div className="overflow-x-auto cursor-grab active:cursor-grabbing select-none" ref={el => {
              if (!el) return;
              el.onmousedown = (e) => {
                const startX = e.pageX - el.offsetLeft;
                const scrollLeft = el.scrollLeft;
                const onMove = (me) => { el.scrollLeft = scrollLeft - (me.pageX - el.offsetLeft - startX); };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              };
            }}>
              <div className="flex items-end gap-1 h-24" style={{ minWidth: `${Math.max(dailyGrowth.length * 18, 100)}px` }}>
                {dailyGrowth.map((d, i) => {
                  const max = Math.max(...dailyGrowth.map(x => x.new_viewers));
                  const height = max > 0 ? (d.new_viewers / max) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-purple-500 to-violet-400 rounded-t opacity-80 hover:opacity-100 transition-opacity cursor-default"
                      style={{ height: `${Math.max(height, 2)}%`, minWidth: '14px' }}
                      title={`${new Date(d.day || d.date).toLocaleDateString('he-IL')}: ${d.new_viewers} חדשים`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{dailyGrowth.length > 0 ? new Date(dailyGrowth[0].day || dailyGrowth[0].date).toLocaleDateString('he-IL') : ''}</span>
              <span>{dailyGrowth.length > 0 ? new Date(dailyGrowth[dailyGrowth.length - 1].day || dailyGrowth[dailyGrowth.length - 1].date).toLocaleDateString('he-IL') : ''}</span>
            </div>
          </div>
        )}

        {/* Viewers List */}
        {campaign && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  רשימת צופים
                  {viewersMeta.total > 0 && (
                    <span className="text-sm font-normal text-gray-500">({viewersMeta.total.toLocaleString()} סה"כ)</span>
                  )}
                  <button
                    onClick={handleOpenUserCertificate}
                    disabled={generatingCert}
                    title="הפק תעודת צפיות"
                    className="mr-1 p-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                  >
                    {generatingCert ? <Loader className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  </button>
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSyncContacts}
                    disabled={syncingContacts}
                    title="משוך שמות אנשי קשר מהוואטסאפ ועדכן את הרשימה"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50"
                  >
                    {syncingContacts
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> מסנכרן...</>
                      : <><RefreshCw className="w-4 h-4" /> סנכרן שמות</>
                    }
                  </button>
                  <button
                    onClick={() => handleDownload('vcf')}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Download className="w-4 h-4" /> VCF
                  </button>
                  <button
                    onClick={() => handleDownload('csv')}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Download className="w-4 h-4" /> CSV
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <FileText className="w-4 h-4" /> דוח מלא
                  </button>
                </div>
              </div>

              {contactSyncResult && (
                <div className={`mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${contactSyncResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {contactSyncResult.success
                    ? <><CheckCircle className="w-4 h-4 flex-shrink-0" /> סנכרון הושלם — {contactSyncResult.updated ?? 0} שמות עודכנו</>
                    : <><AlertCircle className="w-4 h-4 flex-shrink-0" /> {contactSyncResult.error}</>
                  }
                  <button onClick={() => setContactSyncResult(null)} className="mr-auto text-xs opacity-60 hover:opacity-100">✕</button>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="חפש לפי שם או מספר..."
                    className="w-full pr-9 pl-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="px-4 py-3 text-right font-medium cursor-pointer hover:text-purple-600" onClick={() => toggleSort('name')}>
                      <span className="flex items-center gap-1">איש קשר <SortIcon col="name" /></span>
                    </th>
                    <th className="px-4 py-3 text-right font-medium cursor-pointer hover:text-purple-600" onClick={() => toggleSort('view_count')}>
                      <span className="flex items-center gap-1">צפיות <SortIcon col="view_count" /></span>
                    </th>
                    <th className="px-4 py-3 text-right font-medium cursor-pointer hover:text-purple-600" onClick={() => toggleSort('view_percentage')}>
                      <span className="flex items-center gap-1">% <SortIcon col="view_percentage" /></span>
                    </th>
                    <th className="px-4 py-3 text-right font-medium cursor-pointer hover:text-purple-600" onClick={() => toggleSort('last_view')}>
                      <span className="flex items-center gap-1">צפייה אחרונה <SortIcon col="last_view" /></span>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">תגובות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {viewers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        {campaign?.status === 'active' ? 'עדיין אין צופים — המערכת עוקבת בזמן אמת' : 'אין צופים להציג'}
                      </td>
                    </tr>
                  ) : (
                    viewers.map((v, i) => (
                      <tr
                        key={i}
                        className="hover:bg-purple-50/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedViewer(v)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-purple-500" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{v.name || '—'}</p>
                              <p className="text-xs text-gray-400" dir="ltr">{v.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{v.view_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-violet-600"
                                style={{ width: `${Math.min(v.view_percentage, 100)}%` }}
                              />
                            </div>
                            <span className="text-gray-700">{Math.round(v.view_percentage)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {v.last_view ? new Date(v.last_view).toLocaleDateString('he-IL') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {v.is_gray_checkmark && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">וי אפור</span>
                            )}
                            {parseInt(v.reaction_count) > 0 && (
                              <span className="flex items-center gap-1 text-xs text-red-500">
                                <Heart className="w-3.5 h-3.5 fill-red-400 text-red-400" />
                                {parseInt(v.reaction_count) > 1 ? `×${v.reaction_count}` : ''}
                              </span>
                            )}
                            {v.is_gray_checkmark && v.has_reply && parseInt(v.reaction_count) === 0 && (
                              <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">הגיב</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {viewersMeta.pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-50 flex items-center justify-between">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  הקודם
                </button>
                <span className="text-sm text-gray-500">עמוד {page} מתוך {viewersMeta.pages}</span>
                <button
                  onClick={() => setPage(p => Math.min(viewersMeta.pages, p + 1))}
                  disabled={page >= viewersMeta.pages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  הבא
                </button>
              </div>
            )}
          </div>
        )}

        {/* Gray Checkmarks */}
        {grayCheckmarks.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowGray(g => !g)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-400" />
                וי אפור — הגיבו ללא צפייה גלויה
                <span className="bg-rose-100 text-rose-600 text-xs px-2 py-0.5 rounded-full">{grayCheckmarks.length}</span>
              </h3>
              {showGray ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {showGray && (
              <div className="border-t border-gray-50 divide-y divide-gray-50">
                {grayCheckmarks.map((c, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-rose-50 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-rose-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{c.name || '—'}</p>
                        <p className="text-xs text-gray-400" dir="ltr">{c.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {(c.has_reaction || c.type === 'reaction') && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Heart className="w-3 h-3" /> תגובה</span>}
                      {(c.has_reply || c.type === 'reply') && <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">תשובה</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Google integration now lives inside the Google cleanup page.
            We intentionally don't show sync/connect buttons on the dashboard anymore —
            everything Google-related is managed at /view-filter/cleanup/google. */}
      </main>

      {/* Viewer Profile Modal */}
      {selectedViewer && (
        <ViewerProfileModal
          viewer={selectedViewer}
          onClose={() => setSelectedViewer(null)}
        />
      )}

      {/* Import keep-list modal (from dashboard card) */}
      <ImportKeepListModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={(r) => setImportResult(r)}
      />
      {importResult && (
        <div className="fixed bottom-6 left-6 z-50 bg-green-50 border border-green-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-2 text-sm text-green-800" dir="rtl">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span>נוספו לרשימה השמורה: <strong>{(importResult.added || 0).toLocaleString()}</strong> אנשי קשר</span>
          <button onClick={() => setImportResult(null)} className="mr-2 text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Google Sync Warning Modal */}
      {showGoogleSyncWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowGoogleSyncWarning(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
            {/* Red header */}
            <div className="bg-red-500 rounded-t-2xl px-6 py-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">⚠️ פעולה בלתי הפיכה</h2>
                <p className="text-red-100 text-sm">קרא בעיון לפני האישור</p>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-800 font-medium mb-3">
                הסנכרון יבצע את הפעולות הבאות בחשבונות Google המחוברים:
              </p>
              <ul className="space-y-2 mb-5">
                <li className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                  <span className="font-bold mt-0.5">✕</span>
                  <span>כלל אנשי הקשר הקיימים בחשבונות יימחקו</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  <span className="font-bold mt-0.5">✓</span>
                  <span>רשימת הצופים החדשה תיכתב במקומם</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
                  <span className="font-bold mt-0.5">!</span>
                  <span>לא ניתן לבטל פעולה זו לאחר ביצועה</span>
                </li>
              </ul>

              {/* Account list with counts */}
              {googleAccounts.filter(a => a.status === 'connected').length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">חשבונות שיושפעו:</p>
                  <div className="space-y-1.5">
                    {googleAccounts.filter(a => a.status === 'connected').map((acc, i) => {
                      const countInfo = googleContactCounts.find(c => c.slot === acc.slot);
                      return (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <span className="text-gray-700">{acc.account_email || `חשבון ${i + 1}`}</span>
                          {countInfo?.count != null && (
                            <span className="text-red-600 font-medium">{countInfo.count.toLocaleString()} אנשי קשר יימחקו</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowGoogleSyncWarning(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={handleConfirmSync}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors"
                >
                  אני מבין, המשך בכל זאת
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
