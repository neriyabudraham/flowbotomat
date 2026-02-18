import { useState, useEffect } from 'react';
import { 
  Smartphone, RefreshCw, Users, Upload, Eye, Heart,
  Clock, Check, X, AlertCircle, Shield, Wifi, WifiOff,
  Phone, Search, ChevronDown
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function AdminStatusBot() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [liftingRestriction, setLiftingRestriction] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, statsRes] = await Promise.all([
        api.get('/status-bot/admin/users'),
        api.get('/status-bot/admin/stats'),
      ]);
      setUsers(usersRes.data.users || []);
      setStats(statsRes.data.stats || null);
    } catch (err) {
      console.error('Failed to load status bot data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLiftRestriction = async (connectionId) => {
    if (!confirm('האם להסיר את החסימה?')) return;
    
    setLiftingRestriction(connectionId);
    try {
      await api.post(`/status-bot/admin/lift-restriction/${connectionId}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהסרת החסימה');
    } finally {
      setLiftingRestriction(null);
    }
  };

  const filteredUsers = users.filter(u => 
    !search || 
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone_number?.includes(search)
  );

  // Check if user is in restriction period (24h or 30min short restriction)
  const getRestrictionInfo = (user) => {
    // First check short restriction (30 min "system updates")
    if (user.short_restriction_until && new Date(user.short_restriction_until) > new Date()) {
      return { restricted: true, type: 'short', endsAt: new Date(user.short_restriction_until) };
    }
    
    // Then check 24h restriction
    if (user.restriction_lifted) return { restricted: false };
    const connectionDate = user.last_connected_at || user.first_connected_at;
    if (!connectionDate) return { restricted: false };
    
    const connectedAt = new Date(connectionDate);
    const restrictionEnd = new Date(connectedAt.getTime() + 24 * 60 * 60 * 1000);
    if (new Date() < restrictionEnd) {
      return { restricted: true, type: 'full', endsAt: restrictionEnd };
    }
    
    return { restricted: false };
  };
  
  const isRestricted = (user) => getRestrictionInfo(user).restricted;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">בוט העלאת סטטוסים</h2>
        </div>
        
        <Button variant="ghost" onClick={loadData} className="!p-2">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="סה״כ חיבורים"
            value={stats.connections?.total || 0}
            color="blue"
          />
          <StatCard
            icon={Wifi}
            label="מחוברים"
            value={stats.connections?.connected || 0}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="בחסימה"
            value={stats.connections?.restricted || 0}
            color="amber"
          />
          <StatCard
            icon={Upload}
            label="סטטוסים היום"
            value={stats.statusesToday || 0}
            color="purple"
          />
        </div>
      )}

      {/* Queue Status */}
      {stats?.queue && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <h3 className="font-medium text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            מצב תור
          </h3>
          <div className="flex gap-6">
            <div>
              <span className="text-2xl font-bold text-blue-600">{stats.queue.pending || 0}</span>
              <span className="text-sm text-gray-500 mr-1">ממתינים</span>
            </div>
            <div>
              <span className="text-2xl font-bold text-amber-600">{stats.queue.processing || 0}</span>
              <span className="text-sm text-gray-500 mr-1">בעיבוד</span>
            </div>
            <div>
              <span className="text-2xl font-bold text-red-600">{stats.queue.failed || 0}</span>
              <span className="text-sm text-gray-500 mr-1">נכשלו</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי אימייל, שם או מספר..."
          className="w-full pr-10 pl-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
        />
      </div>

      {/* Users List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין משתמשים בשירות</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">משתמש</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">מצב חיבור</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">מספר טלפון</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">סטטוסים</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">מורשים</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">חסימה</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredUsers.map(user => {
                  const restricted = isRestricted(user);
                  
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white">
                            {user.user_name || '—'}
                          </p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          user.connection_status === 'connected'
                            ? 'bg-green-100 text-green-700'
                            : user.connection_status === 'qr_pending'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {user.connection_status === 'connected' ? (
                            <><Wifi className="w-3 h-3" /> מחובר</>
                          ) : user.connection_status === 'qr_pending' ? (
                            <><Clock className="w-3 h-3" /> ממתין ל-QR</>
                          ) : (
                            <><WifiOff className="w-3 h-3" /> לא מחובר</>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.phone_number ? (
                          <span dir="ltr" className="text-gray-700 dark:text-gray-300">
                            +{user.phone_number}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium text-gray-800 dark:text-white">
                          {user.total_statuses || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-gray-600 dark:text-gray-400">
                          {user.authorized_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const info = getRestrictionInfo(user);
                          if (user.restriction_lifted && !info.restricted) {
                            return (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                <Shield className="w-3 h-3" />
                                שוחרר
                              </span>
                            );
                          } else if (info.restricted) {
                            return (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                <AlertCircle className="w-3 h-3" />
                                {info.type === 'short' ? '30 דק׳' : '24 שעות'}
                              </span>
                            );
                          }
                          return <span className="text-gray-400 text-xs">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const info = getRestrictionInfo(user);
                          if (info.restricted) {
                            return (
                              <button
                                onClick={() => handleLiftRestriction(user.id)}
                                disabled={liftingRestriction === user.id}
                                className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                              >
                                {liftingRestriction === user.id ? 'מסיר...' : 'הסר חסימה'}
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
