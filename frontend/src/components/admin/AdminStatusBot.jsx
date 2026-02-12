import { useState, useEffect } from 'react';
import { 
  Smartphone, RefreshCw, Users, Upload, Eye, Heart,
  Clock, Check, X, AlertCircle, Shield, Wifi, WifiOff,
  Phone, Search, ChevronDown, Palette, Plus, Trash2, Save
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function AdminStatusBot() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [liftingRestriction, setLiftingRestriction] = useState(null);
  
  // Colors management
  const [colors, setColors] = useState([]);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [colorsSaving, setColorsSaving] = useState(false);
  const [showColorManager, setShowColorManager] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#38b42f');
  const [newColorTitle, setNewColorTitle] = useState('');

  useEffect(() => {
    loadData();
    loadColors();
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

  const loadColors = async () => {
    try {
      setColorsLoading(true);
      const { data } = await api.get('/status-bot/colors');
      setColors(data.colors || []);
    } catch (err) {
      console.error('Failed to load colors:', err);
    } finally {
      setColorsLoading(false);
    }
  };

  const addColor = () => {
    if (!newColorHex || !newColorTitle.trim()) return;
    
    const hexId = newColorHex.replace('#', '').toLowerCase();
    if (colors.some(c => c.id === hexId)) {
      alert('צבע זה כבר קיים');
      return;
    }
    
    setColors([...colors, { id: hexId, title: newColorTitle.trim() }]);
    setNewColorHex('#38b42f');
    setNewColorTitle('');
  };

  const removeColor = (colorId) => {
    if (colors.length <= 1) {
      alert('חייב להישאר לפחות צבע אחד');
      return;
    }
    setColors(colors.filter(c => c.id !== colorId));
  };

  const saveColors = async () => {
    try {
      setColorsSaving(true);
      await api.put('/admin/settings/status_bot_colors', { value: colors });
      alert('הצבעים נשמרו בהצלחה');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירת הצבעים');
    } finally {
      setColorsSaving(false);
    }
  };

  const handleLiftRestriction = async (connectionId) => {
    if (!confirm('האם להסיר את חסימת 24 השעות?')) return;
    
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

  // Check if user is in 24h restriction period
  const isRestricted = (user) => {
    if (user.restriction_lifted) return false;
    if (!user.first_connected_at) return false;
    
    const firstConnected = new Date(user.first_connected_at);
    const restrictionEnd = new Date(firstConnected.getTime() + 24 * 60 * 60 * 1000);
    return new Date() < restrictionEnd;
  };

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

      {/* Color Manager */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setShowColorManager(!showColorManager)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-gray-800 dark:text-white">ניהול צבעי רקע</span>
            <span className="text-sm text-gray-500">({colors.length} צבעים)</span>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showColorManager ? 'rotate-180' : ''}`} />
        </button>
        
        {showColorManager && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
            {/* Current Colors */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">צבעים זמינים</h4>
              <div className="flex flex-wrap gap-2">
                {colors.map(color => (
                  <div
                    key={color.id}
                    className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2"
                  >
                    <div
                      className="w-6 h-6 rounded-md border border-gray-200"
                      style={{ backgroundColor: '#' + color.id }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{color.title}</span>
                    <button
                      onClick={() => removeColor(color.id)}
                      className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Add New Color */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">הוסף צבע חדש</h4>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={newColorHex}
                  onChange={(e) => setNewColorHex(e.target.value)}
                  className="w-12 h-10 rounded-lg cursor-pointer border-2 border-gray-200"
                />
                <input
                  type="text"
                  value={newColorTitle}
                  onChange={(e) => setNewColorTitle(e.target.value)}
                  placeholder="שם הצבע (למשל: ירוק)"
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={addColor}
                  disabled={!newColorTitle.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  הוסף
                </button>
              </div>
            </div>
            
            {/* Save Button */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                onClick={saveColors}
                disabled={colorsSaving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {colorsSaving ? 'שומר...' : 'שמור שינויים'}
              </button>
            </div>
          </div>
        )}
      </div>

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
                        {user.restriction_lifted ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <Shield className="w-3 h-3" />
                            שוחרר
                          </span>
                        ) : restricted ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="w-3 h-3" />
                            פעיל
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {restricted && !user.restriction_lifted && (
                          <button
                            onClick={() => handleLiftRestriction(user.id)}
                            disabled={liftingRestriction === user.id}
                            className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                          >
                            {liftingRestriction === user.id ? 'מסיר...' : 'הסר חסימה'}
                          </button>
                        )}
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
