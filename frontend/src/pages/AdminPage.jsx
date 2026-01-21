import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Settings, Activity, Shield, BarChart3, 
  Search, ChevronLeft, ChevronRight, Edit, Trash2,
  Check, X, AlertTriangle, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingUser, setEditingUser] = useState(null);

  // Check if user is admin
  useEffect(() => {
    if (user && !['admin', 'superadmin'].includes(user.role)) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Load stats
  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadStats();
    }
  }, [activeTab]);

  // Load users
  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab, pagination.page, search, roleFilter]);

  const loadStats = async () => {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: 20,
      });
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      
      const { data } = await api.get(`/admin/users?${params}`);
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    try {
      await api.put(`/admin/users/${userId}`, updates);
      loadUsers();
      setEditingUser(null);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון משתמש');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק משתמש זה?')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקת משתמש');
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'דשבורד', icon: BarChart3 },
    { id: 'users', label: 'משתמשים', icon: Users },
    { id: 'settings', label: 'הגדרות', icon: Settings },
    { id: 'logs', label: 'לוגים', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">ניהול מערכת</h1>
              <p className="text-sm text-gray-500">פאנל אדמין</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 hover:text-gray-700"
          >
            חזרה לדשבורד ←
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-l border-gray-200 min-h-[calc(100vh-73px)]">
          <nav className="p-4 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-red-50 text-red-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-800">סקירה כללית</h2>
              
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="סה״כ משתמשים" value={stats.total_users} color="blue" />
                <StatCard label="משתמשים פעילים" value={stats.active_users} color="green" />
                <StatCard label="משתמשים חדשים (שבוע)" value={stats.new_users_week} color="purple" />
                <StatCard label="חיבורי WhatsApp" value={stats.connected_whatsapp} color="teal" />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <StatCard label="סה״כ בוטים" value={stats.total_bots} color="orange" />
                <StatCard label="בוטים פעילים" value={stats.active_bots} color="green" />
                <StatCard label="אנשי קשר" value={stats.total_contacts} color="blue" />
                <StatCard label="הודעות היום" value={stats.messages_today} color="purple" />
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">ניהול משתמשים</h2>
                <button onClick={loadUsers} className="p-2 hover:bg-gray-100 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="חיפוש לפי שם או מייל..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-xl"
                >
                  <option value="">כל התפקידים</option>
                  <option value="user">משתמש</option>
                  <option value="expert">מומחה</option>
                  <option value="admin">אדמין</option>
                  <option value="superadmin">סופר-אדמין</option>
                </select>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">משתמש</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">תפקיד</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">סטטוס</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">בוטים</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">אנשי קשר</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">נוצר</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {usersLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">טוען...</td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">לא נמצאו משתמשים</td>
                      </tr>
                    ) : users.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-gray-800">{u.name || 'ללא שם'}</div>
                            <div className="text-sm text-gray-500">{u.email}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {editingUser === u.id ? (
                            <select
                              defaultValue={u.role}
                              onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                              className="px-2 py-1 border rounded"
                            >
                              <option value="user">משתמש</option>
                              <option value="expert">מומחה</option>
                              <option value="admin">אדמין</option>
                              {user.role === 'superadmin' && <option value="superadmin">סופר-אדמין</option>}
                            </select>
                          ) : (
                            <RoleBadge role={u.role} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {u.is_verified ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">מאומת</span>
                            ) : (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">לא מאומת</span>
                            )}
                            {!u.is_active && (
                              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">מושבת</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.bots_count}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.contacts_count}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(u.created_at).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingUser(editingUser === u.id ? null : u.id)}
                              className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                              title="עריכה"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {u.is_active ? (
                              <button
                                onClick={() => handleUpdateUser(u.id, { is_active: false })}
                                className="p-1.5 hover:bg-yellow-50 rounded text-yellow-600"
                                title="השבתה"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdateUser(u.id, { is_active: true })}
                                className="p-1.5 hover:bg-green-50 rounded text-green-600"
                                title="הפעלה"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {user.role === 'superadmin' && u.id !== user.id && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 hover:bg-red-50 rounded text-red-600"
                                title="מחיקה"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                    <span className="text-sm text-gray-500">
                      {pagination.total} משתמשים
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        disabled={pagination.page <= 1}
                        className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <span className="text-sm text-gray-600">
                        עמוד {pagination.page} מתוך {pagination.pages}
                      </span>
                      <button
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        disabled={pagination.page >= pagination.pages}
                        className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <SettingsTab />
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <LogsTab />
          )}
        </main>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700',
    teal: 'bg-teal-50 text-teal-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color]?.split(' ')[1] || 'text-gray-800'}`}>
        {value?.toLocaleString() || 0}
      </div>
    </div>
  );
}

// Role Badge Component
function RoleBadge({ role }) {
  const styles = {
    user: 'bg-gray-100 text-gray-700',
    expert: 'bg-blue-100 text-blue-700',
    admin: 'bg-orange-100 text-orange-700',
    superadmin: 'bg-red-100 text-red-700',
  };
  const labels = {
    user: 'משתמש',
    expert: 'מומחה',
    admin: 'אדמין',
    superadmin: 'סופר-אדמין',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[role] || styles.user}`}>
      {labels[role] || role}
    </span>
  );
}

// Settings Tab Component
function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/admin/settings');
      setSettings(data.settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען הגדרות...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">הגדרות מערכת</h2>
      
      <div className="grid gap-4">
        {Object.entries(settings).map(([key, setting]) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">{key}</h3>
              <span className="text-xs text-gray-400">
                עודכן: {new Date(setting.updated_at).toLocaleString('he-IL')}
              </span>
            </div>
            {setting.description && (
              <p className="text-sm text-gray-500 mb-2">{setting.description}</p>
            )}
            <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
              {JSON.stringify(setting.value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// Logs Tab Component
function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });

  useEffect(() => {
    loadLogs();
  }, [pagination.page]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/logs?page=${pagination.page}&limit=30`);
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const severityColors = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">לוגים ושגיאות</h2>

      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">אין לוגים</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {logs.map(log => (
              <div key={log.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${
                      log.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'
                    }`} />
                    <span className="font-medium text-gray-800">{log.error_type}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${severityColors[log.severity]}`}>
                      {log.severity}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString('he-IL')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{log.error_message}</p>
                {log.user_email && (
                  <p className="text-xs text-gray-400 mt-1">משתמש: {log.user_email}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
