import { useState, useEffect } from 'react';
import { TrendingUp, Users, AlertTriangle, Calendar, Download, RefreshCw } from 'lucide-react';
import SimpleLineChart from '../charts/SimpleLineChart';
import api from '../../services/api';

export default function BotStatsPanel({ botId }) {
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, timelineRes] = await Promise.all([
        api.get(`/bots/${botId}/stats`),
        api.get(`/bots/${botId}/stats/timeline`, { params: { days } }),
      ]);
      setStats(statsRes.data);
      setTimeline(timelineRes.data.timeline || []);
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

  const handleExport = () => {
    window.open(`${api.defaults.baseURL}/bots/${botId}/stats/export?days=${days}`, '_blank');
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-gray-100 rounded-xl"></div>
        <div className="h-48 bg-gray-100 rounded-xl"></div>
      </div>
    );
  }

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
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
          >
            <Download className="w-4 h-4" />
            ייצוא CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
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
              : 0
            }
          </div>
          <div className="text-xs text-purple-500 mt-1">הפעלות ליום</div>
        </div>
      </div>

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
    </div>
  );
}
