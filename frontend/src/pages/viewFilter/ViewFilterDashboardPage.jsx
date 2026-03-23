import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, Users, TrendingUp, Download, Smartphone, Search,
  ChevronDown, ChevronUp, Filter, RefreshCw, Play,
  AlertCircle, CheckCircle, Clock, BarChart2, FileText,
  ArrowUpRight, User, Heart, ArrowLeft, Shield, Plus, ExternalLink, X
} from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import ViewerProfileModal from '../../components/viewFilter/ViewerProfileModal';

export default function ViewFilterDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuthStore();

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
  const [googleAccounts, setGoogleAccounts] = useState([]);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Viewers filter/sort
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('view_count');
  const [sortDir, setSortDir] = useState('DESC');
  const [page, setPage] = useState(1);
  const [showGray, setShowGray] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
    } catch {}
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
  };

  const handleStartCampaign = async () => {
    setStartingCampaign(true);
    setError(null);
    try {
      const { data } = await api.post('/view-filter/campaign/start', { trackSince: 'all_time' });
      setCampaign(data.campaign);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהפעלת המעקב');
    } finally {
      setStartingCampaign(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post('/view-filter/google/sync');
      setSyncResult(data);
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
      <header className="bg-white/80 backdrop-blur-xl border-b border-purple-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
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
              <div className="h-8 w-px bg-gray-200" />
              <span className="text-lg font-bold text-gray-800">בוט סינון צפיות</span>
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
            ) : (
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
            )}
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
              { label: 'ממוצע צפיות', value: stats.avgViewsPerStatus ?? 0, icon: <ArrowUpRight className="w-5 h-5 text-emerald-500" /> },
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
            <div className="flex items-end gap-1 h-24">
              {dailyGrowth.slice(-30).map((d, i) => {
                const max = Math.max(...dailyGrowth.slice(-30).map(x => x.new_viewers));
                const height = max > 0 ? (d.new_viewers / max) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-purple-500 to-violet-400 rounded-t opacity-80 hover:opacity-100 transition-opacity cursor-default min-w-0"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${new Date(d.day || d.date).toLocaleDateString('he-IL')}: ${d.new_viewers} חדשים`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{dailyGrowth.length > 0 ? new Date(dailyGrowth[Math.max(0, dailyGrowth.length - 30)].day || dailyGrowth[Math.max(0, dailyGrowth.length - 30)].date).toLocaleDateString('he-IL') : ''}</span>
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
                </h3>
                <div className="flex items-center gap-2">
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
                          <div className="flex items-center gap-2">
                            {v.has_reaction && <Heart className="w-4 h-4 text-red-400" title="תגובה" />}
                            {v.has_reply && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">הגיב</span>}
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

        {/* Google Sync */}
        {campaign && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-purple-500" />
              סנכרון ל-Google Contacts
            </h3>
            <p className="text-sm text-gray-500 mb-4">סנכרן את כל הצופים כאנשי קשר ב-Google Contacts. תומך במספר חשבונות.</p>

            {syncResult && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {syncResult.message || `סנכרון הושלם — ${syncResult.synced} אנשי קשר`}
              </div>
            )}

            {/* Connected accounts */}
            {googleAccounts.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 mb-2">חשבונות מחוברים:</p>
                {googleAccounts.map((acc, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                    <div className="w-6 h-6 bg-white rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    </div>
                    <span className="text-gray-700 flex-1">{acc.account_email || `חשבון ${i + 1}`}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${acc.status === 'connected' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {acc.status === 'connected' ? 'מחובר' : 'מנותק'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSync}
                disabled={syncing || googleAccounts.filter(a => a.status === 'connected').length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                title={googleAccounts.filter(a => a.status === 'connected').length === 0 ? 'יש לחבר חשבון Google תחילה' : ''}
              >
                {syncing
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> מסנכרן...</>
                  : <><Smartphone className="w-4 h-4" /> סנכרן עכשיו</>
                }
              </button>

              <button
                onClick={handleConnectGoogle}
                disabled={connectingGoogle}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
              >
                {connectingGoogle
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> מחבר...</>
                  : <><Plus className="w-4 h-4" /> {googleAccounts.length > 0 ? 'הוסף חשבון' : 'חבר חשבון Google'}</>
                }
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Viewer Profile Modal */}
      {selectedViewer && (
        <ViewerProfileModal
          viewer={selectedViewer}
          onClose={() => setSelectedViewer(null)}
        />
      )}
    </div>
  );
}
