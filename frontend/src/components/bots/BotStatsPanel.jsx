import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Users, AlertTriangle, Calendar, Download, RefreshCw, Lock, Crown, Sparkles } from 'lucide-react';
import SimpleLineChart from '../charts/SimpleLineChart';
import api from '../../services/api';

export default function BotStatsPanel({ botId }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);
  const [premiumRequired, setPremiumRequired] = useState(false);

  const fetchData = async () => {
    try {
      // Basic stats - available to all
      const statsRes = await api.get(`/bots/${botId}/stats`);
      setStats(statsRes.data);
      
      // Timeline - may require premium
      try {
        const timelineRes = await api.get(`/bots/${botId}/stats/timeline`, { params: { days } });
        setTimeline(timelineRes.data.timeline || []);
        setPremiumRequired(false);
      } catch (err) {
        if (err.response?.data?.upgrade_required) {
          setPremiumRequired(true);
          setTimeline([]);
        }
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [botId, days]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleExport = async () => {
    try {
      const response = await api.get(`/bots/${botId}/stats/export`, {
        params: { days },
        responseType: 'blob'
      });
      
      // Check if response is an error (JSON) instead of CSV
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        const text = await response.data.text();
        const error = JSON.parse(text);
        if (error.upgrade_required) {
          setPremiumRequired(true);
          return;
        }
      }
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bot_stats_${botId}_${days}days.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.data?.upgrade_required) {
        setPremiumRequired(true);
      } else {
        console.error('Export failed:', err);
      }
    }
  };

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-gray-100 rounded-xl"></div>
        <div className="h-48 bg-gray-100 rounded-xl"></div>
      </div>
    );
  }

  // Premium upgrade banner
  const PremiumBanner = () => (
    <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 rounded-2xl p-6 text-white">
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/20 rounded-xl">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">סטטיסטיקות מתקדמות</h3>
            <p className="text-white/80 text-sm">שדרג לצפייה בגרפים וייצוא נתונים</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1.5 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>גרפים אינטראקטיביים</span>
          </div>
          <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1.5 text-sm">
            <Download className="w-4 h-4" />
            <span>ייצוא ל-CSV</span>
          </div>
          <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1.5 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>ניתוח מגמות</span>
          </div>
        </div>
        
        <button
          onClick={handleUpgrade}
          className="flex items-center gap-2 bg-white text-purple-600 px-6 py-3 rounded-xl font-medium hover:bg-white/90 transition-colors"
        >
          <Crown className="w-5 h-5" />
          צפה בתכניות
        </button>
      </div>
    </div>
  );

  // Locked chart placeholder
  const LockedChart = ({ title }) => (
    <div className="relative bg-white rounded-xl border border-gray-100 p-4 overflow-hidden">
      <h3 className="font-medium text-gray-700 mb-4">{title}</h3>
      
      {/* Blurred fake chart */}
      <div className="relative h-[180px]">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-100 via-blue-50 to-blue-100 rounded-lg blur-sm opacity-50">
          <svg className="w-full h-full" viewBox="0 0 400 180">
            <path
              d="M0,150 Q50,100 100,120 T200,80 T300,100 T400,60"
              fill="none"
              stroke="#93C5FD"
              strokeWidth="3"
            />
          </svg>
        </div>
        
        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
          <div className="text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Lock className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">זמין למנויים</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
          >
            <option value={7}>7 ימים</option>
            <option value={14}>14 ימים</option>
            <option value={30}>30 ימים</option>
            <option value={90}>90 ימים</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          {premiumRequired ? (
            <button
              onClick={handleUpgrade}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100"
            >
              <Lock className="w-4 h-4" />
              שדרג לייצוא
            </button>
          ) : (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
            >
              <Download className="w-4 h-4" />
              ייצוא CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards - Always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">הפעלות</span>
          </div>
          <div className="text-2xl font-bold text-blue-700">{stats?.totalTriggers || 0}</div>
          <div className="text-xs text-blue-500 mt-1">
            {stats?.triggersToday || 0} היום
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">משתמשים</span>
          </div>
          <div className="text-2xl font-bold text-green-700">{stats?.uniqueUsers || 0}</div>
          <div className="text-xs text-green-500 mt-1">משתמשים ייחודיים</div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-600 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">שגיאות</span>
          </div>
          <div className="text-2xl font-bold text-orange-700">{stats?.errors || 0}</div>
          <div className="text-xs text-orange-500 mt-1">
            {stats?.totalTriggers > 0 
              ? `${((stats?.errors / stats?.totalTriggers) * 100).toFixed(1)}% שגיאות`
              : 'ללא שגיאות'
            }
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-2">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">ממוצע יומי</span>
          </div>
          <div className="text-2xl font-bold text-purple-700">
            {timeline.length > 0 
              ? (timeline.reduce((sum, d) => sum + d.triggers, 0) / timeline.length).toFixed(1)
              : stats?.totalTriggers && days ? (stats.totalTriggers / days).toFixed(1) : 0
            }
          </div>
          <div className="text-xs text-purple-500 mt-1">הפעלות ליום</div>
        </div>
      </div>

      {/* Premium Banner or Charts */}
      {premiumRequired ? (
        <>
          <PremiumBanner />
          
          {/* Locked charts preview */}
          <div className="grid md:grid-cols-2 gap-6">
            <LockedChart title="הפעלות לאורך זמן" />
            <LockedChart title="משתמשים ייחודיים" />
          </div>
        </>
      ) : (
        <>
          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="font-medium text-gray-700 mb-4">הפעלות לאורך זמן</h3>
              <SimpleLineChart 
                data={timeline} 
                dataKey="triggers" 
                color="#3B82F6"
                height={180}
                showArea
              />
              {timeline.length > 0 && (
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>{new Date(timeline[0].date).toLocaleDateString('he-IL')}</span>
                  <span>{new Date(timeline[timeline.length - 1].date).toLocaleDateString('he-IL')}</span>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="font-medium text-gray-700 mb-4">משתמשים ייחודיים</h3>
              <SimpleLineChart 
                data={timeline} 
                dataKey="users" 
                color="#10B981"
                height={180}
                showArea
              />
              {timeline.length > 0 && (
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>{new Date(timeline[0].date).toLocaleDateString('he-IL')}</span>
                  <span>{new Date(timeline[timeline.length - 1].date).toLocaleDateString('he-IL')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Errors chart if there are errors */}
          {stats?.errors > 0 && (
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <h3 className="font-medium text-orange-700 mb-4">שגיאות לאורך זמן</h3>
              <SimpleLineChart 
                data={timeline} 
                dataKey="errors" 
                color="#F97316"
                height={120}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
