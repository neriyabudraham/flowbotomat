import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Users, TrendingUp, Download, Smartphone, Search,
  ChevronDown, ChevronUp, Filter, RefreshCw, Play,
  AlertCircle, CheckCircle, Clock, BarChart2, FileText,
  ArrowUpRight, User, Heart, ArrowLeft, Shield
} from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import ViewerProfileModal from '../../components/viewFilter/ViewerProfileModal';

export default function ViewFilterDashboardPage() {
  const navigate = useNavigate();
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

  // Viewers filter/sort
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('view_count');
  const [sortDir, setSortDir] = useState('DESC');
  const [minPercent, setMinPercent] = useState('');
  const [maxPercent, setMaxPercent] = useState('');
  const [page, setPage] = useState(1);
  const [showGray, setShowGray] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (campaign?.status === 'active') {
      loadViewers();
    }
  }, [search, sortBy, sortDir, minPercent, maxPercent, page]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [campaignRes, statsRes] = await Promise.all([
        api.get('/view-filter/campaign').catch(() => ({ data: null })),
        api.get('/view-filter/stats').catch(() => ({ data: null })),
      ]);

      setCampaign(campaignRes.data);
      setStats(statsRes.data);

      if (campaignRes.data?.status === 'active') {
        await Promise.all([
          loadViewers(),
          loadGrayCheckmarks(),
          loadDailyGrowth(),
        ]);
      }
    } catch (err) {
      setError('שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  const loadViewers = async () => {
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        sortBy,
        sortDir,
        ...(search && { search }),
        ...(minPercent && { minPercent }),
        ...(maxPercent && { maxPercent }),
      });
      const { data } = await api.get(`/view-filter/viewers?${params}`);
      setViewers(data.viewers || []);
      setViewersMeta(data.meta || { total: 0, page: 1, pages: 1 });
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
      setDailyGrowth(data.growth || []);
    } catch {}
  };

  const handleStartCampaign = async () => {
    setStartingCampaign(true);
    setError(null);
    try {
      const { data } = await api.post('/view-filter/campaign/start');
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
      const { data } = await api.post('/view-filter/sync-google');
      setSyncResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בסנכרון');
    } finally {
      setSyncing(false);
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
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
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
        {!campaign || campaign.status !== 'active' ? (
          <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-purple-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">מוכן להתחיל מעקב?</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              לחץ על הכפתור להפעלת תקופת מעקב של 90 יום. המערכת תעקוב אחרי כל מי שצופה בסטטוסים שלך.
            </p>
            <button
              onClick={handleStartCampaign}
              disabled={startingCampaign}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all disabled:opacity-50"
            >
              {startingCampaign ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> מפעיל...</>
              ) : (
                <><Play className="w-5 h-5" /> התחל מעקב 90 יום</>
              )}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">תקופת מעקב פעילה</h2>
                <p className="text-sm text-gray-500">
                  התחיל: {new Date(campaign.started_at).toLocaleDateString('he-IL')} •
                  מסתיים: {new Date(campaign.ends_at).toLocaleDateString('he-IL')}
                </p>
              </div>
              <div className="text-left">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  <CheckCircle className="w-4 h-4" /> פעיל
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>יום {daysElapsed}</span>
              <span className="font-medium text-purple-600">{Math.round(progressPercent)}%</span>
              <span>נותרו {daysRemaining} ימים</span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'צופים ייחודיים', value: stats.totalViewers ?? 0, icon: <Users className="w-5 h-5 text-purple-500" />, color: 'purple' },
              { label: 'חדשים היום', value: stats.newToday ?? 0, icon: <TrendingUp className="w-5 h-5 text-violet-500" />, color: 'violet' },
              { label: 'חדשים השבוע', value: stats.newThisWeek ?? 0, icon: <BarChart2 className="w-5 h-5 text-indigo-500" />, color: 'indigo' },
              { label: 'סטטוסים סה"כ', value: stats.totalStatuses ?? 0, icon: <Eye className="w-5 h-5 text-blue-500" />, color: 'blue' },
              { label: 'ממוצע צפיות', value: stats.avgViews ?? 0, icon: <ArrowUpRight className="w-5 h-5 text-emerald-500" />, color: 'emerald' },
              { label: 'וי אפור', value: stats.grayCheckmarks ?? 0, icon: <Heart className="w-5 h-5 text-rose-400" />, color: 'rose' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">{s.icon}</div>
                <div className="text-2xl font-bold text-gray-900">{s.value.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Daily Growth Chart (simple bar) */}
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
                    title={`${new Date(d.date).toLocaleDateString('he-IL')}: ${d.new_viewers} חדשים`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{dailyGrowth.length > 0 ? new Date(dailyGrowth[Math.max(0, dailyGrowth.length - 30)].date).toLocaleDateString('he-IL') : ''}</span>
              <span>{dailyGrowth.length > 0 ? new Date(dailyGrowth[dailyGrowth.length - 1].date).toLocaleDateString('he-IL') : ''}</span>
            </div>
          </div>
        )}

        {/* Viewers List */}
        {campaign?.status === 'active' && (
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

              {/* Filters */}
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">% צפייה:</span>
                  <input
                    type="number"
                    value={minPercent}
                    onChange={e => { setMinPercent(e.target.value); setPage(1); }}
                    placeholder="מינ׳"
                    min="0" max="100"
                    className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center"
                  />
                  <span className="text-gray-400">—</span>
                  <input
                    type="number"
                    value={maxPercent}
                    onChange={e => { setMaxPercent(e.target.value); setPage(1); }}
                    placeholder="מקס׳"
                    min="0" max="100"
                    className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="px-4 py-3 text-right font-medium">איש קשר</th>
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
                        {campaign?.status === 'active' ? 'עדיין אין צופים — המערכת עוקבת בזמן אמת' : 'הפעל מעקב כדי לראות צופים'}
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

            {/* Pagination */}
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
                      {c.has_reaction && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Heart className="w-3 h-3" /> תגובה</span>}
                      {c.has_reply && <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">תשובה</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Google Sync */}
        {campaign?.status === 'active' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-purple-500" />
              סנכרון ל-Google Contacts
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              סנכרן את כל הצופים כאנשי קשר ב-Google Contacts. תומך במספר חשבונות.
            </p>

            {syncResult && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                סנכרון הושלם — {syncResult.synced} אנשי קשר סונכרנו
              </div>
            )}

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
            >
              {syncing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> מסנכרן...</>
              ) : (
                <><Smartphone className="w-4 h-4" /> סנכרן עכשיו</>
              )}
            </button>
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
