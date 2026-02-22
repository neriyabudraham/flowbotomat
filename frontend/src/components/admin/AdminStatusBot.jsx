import { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, RefreshCw, Users, Upload, Eye, Heart,
  Clock, Check, X, AlertCircle, Shield, Wifi, WifiOff,
  Phone, Search, ChevronDown, Activity, MessageCircle, Loader2,
  RotateCcw, PhoneCall, XCircle
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';
import { io } from 'socket.io-client';

// Helper to translate state names
function getStateName(state) {
  const stateNames = {
    'idle': 'לא פעיל',
    'select_account': 'בוחר חשבון',
    'select_color': 'בוחר צבע',
    'select_action': 'בוחר פעולה',
    'select_schedule_day': 'בוחר יום',
    'select_schedule_time': 'מזין שעה',
    'view_scheduled': 'צופה במתוזמנים',
    'view_status_actions': 'בוחר פעולה לסטטוס',
    'after_send_menu': 'תפריט אחרי שליחה',
    'video_split_caption_choice': 'בוחר כיתוב לסרטון',
    'video_split_custom_caption': 'מזין כיתוב מותאם'
  };
  return stateNames[state] || state;
}

export default function AdminStatusBot() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [liftingRestriction, setLiftingRestriction] = useState(null);
  
  // Admin actions state
  const [syncingPhones, setSyncingPhones] = useState(false);
  const [resettingQueue, setResettingQueue] = useState(false);
  const [cancellingItem, setCancellingItem] = useState(null);
  
  // Real-time monitoring state
  const [activeProcesses, setActiveProcesses] = useState({
    activeConversations: [],
    processingUploads: [],
    queueLock: null,
    pendingCount: 0
  });
  const [loadingProcesses, setLoadingProcesses] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    loadData();
    loadActiveProcesses();
    
    // Setup socket connection
    const socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || '', {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Admin socket connected');
      socket.emit('join_admin');
    });
    
    // Real-time updates
    socket.on('statusbot:conversation_update', (data) => {
      console.log('Conversation update:', data);
      loadActiveProcesses();
    });
    
    socket.on('statusbot:processing_start', (data) => {
      console.log('Processing started:', data);
      loadActiveProcesses();
    });
    
    socket.on('statusbot:processing_end', (data) => {
      console.log('Processing ended:', data);
      loadActiveProcesses();
    });
    
    return () => {
      socket.emit('leave_admin');
      socket.disconnect();
    };
  }, []);
  
  const loadActiveProcesses = async () => {
    try {
      const res = await api.get('/status-bot/admin/active-processes');
      setActiveProcesses(res.data);
    } catch (err) {
      console.error('Failed to load active processes:', err);
    } finally {
      setLoadingProcesses(false);
    }
  };

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

  const handleSyncPhones = async () => {
    if (!confirm('לסנכרן מספרי טלפון מכל החיבורים?')) return;
    
    setSyncingPhones(true);
    try {
      const res = await api.post('/status-bot/admin/sync-phones');
      const updated = res.data.results?.filter(r => r.status === 'updated').length || 0;
      alert(`סנכרון הושלם! ${updated} מספרים עודכנו מתוך ${res.data.totalConnections} חיבורים`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בסנכרון');
    } finally {
      setSyncingPhones(false);
    }
  };

  const handleResetQueue = async () => {
    if (!confirm('לאפס את התור? כל התהליכים הפעילים יבוטלו!')) return;
    
    setResettingQueue(true);
    try {
      const res = await api.post('/status-bot/admin/reset-queue');
      alert(res.data.message || 'התור אופס בהצלחה');
      loadData();
      loadActiveProcesses();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה באיפוס התור');
    } finally {
      setResettingQueue(false);
    }
  };

  const handleCancelItem = async (queueId) => {
    if (!confirm('לבטל את התהליך הזה?')) return;
    
    setCancellingItem(queueId);
    try {
      await api.post(`/status-bot/admin/cancel-item/${queueId}`);
      alert('התהליך בוטל');
      loadActiveProcesses();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול');
    } finally {
      setCancellingItem(null);
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
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncPhones}
            disabled={syncingPhones}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
            title="סנכרון מספרי טלפון מ-WAHA"
          >
            {syncingPhones ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
            סנכרן טלפונים
          </button>
          
          <button
            onClick={handleResetQueue}
            disabled={resettingQueue}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
            title="איפוס התור וביטול תהליכים תקועים"
          >
            {resettingQueue ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            אפס תור
          </button>
          
          <Button variant="ghost" onClick={loadData} className="!p-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
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
      
      {/* Real-time Active Processes Monitoring */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-800 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-600" />
            ניטור בזמן אמת
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          </h3>
          <button
            onClick={loadActiveProcesses}
            className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            רענן
          </button>
        </div>
        
        {loadingProcesses ? (
          <div className="text-center py-4 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            טוען...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Conversations */}
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                שיחות פעילות ({activeProcesses.activeConversations.length})
              </h4>
              {activeProcesses.activeConversations.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">אין שיחות פעילות כרגע</p>
              ) : (
                <div className="space-y-2">
                  {activeProcesses.activeConversations.map((conv, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Phone className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white" dir="ltr">
                              +{conv.phone}
                            </p>
                            <p className="text-xs text-gray-500">
                              {conv.userName || conv.userEmail || 'משתמש לא ידוע'}
                            </p>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            {getStateName(conv.state)}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(conv.lastMessageAt).toLocaleTimeString('he-IL')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Processing Uploads */}
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                העלאות בעיבוד ({activeProcesses.processingUploads.length})
              </h4>
              {activeProcesses.processingUploads.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">אין העלאות בעיבוד כרגע</p>
              ) : (
                <div className="space-y-2">
                  {activeProcesses.processingUploads.map((upload, idx) => {
                    const startTime = new Date(upload.startedAt);
                    const processingTime = Math.round((Date.now() - startTime.getTime()) / 1000);
                    const isStuck = processingTime > 180; // More than 3 minutes
                    
                    return (
                      <div key={idx} className={`bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border ${isStuck ? 'border-red-300 dark:border-red-700' : 'border-amber-200 dark:border-amber-800'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 ${isStuck ? 'bg-red-100' : 'bg-amber-100'} rounded-full flex items-center justify-center`}>
                              <Loader2 className={`w-4 h-4 ${isStuck ? 'text-red-600' : 'text-amber-600'} animate-spin`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">
                                {upload.statusType === 'text' ? 'טקסט' : 
                                 upload.statusType === 'image' ? 'תמונה' : 
                                 upload.statusType === 'video' ? 'סרטון' : 'קול'}
                                {upload.totalParts > 1 && ` (חלק ${upload.partNumber}/${upload.totalParts})`}
                              </p>
                              <p className="text-xs text-gray-500">
                                {upload.userName || upload.userEmail || 'משתמש לא ידוע'}
                                {upload.source === 'whatsapp' && upload.sourcePhone && (
                                  <span className="mr-1" dir="ltr">• מ-{upload.sourcePhone}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-left">
                              <span className={`inline-block px-2 py-1 ${isStuck ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} rounded-full text-xs font-medium ${!isStuck && 'animate-pulse'}`}>
                                {isStuck ? `תקוע! ${Math.floor(processingTime / 60)}:${(processingTime % 60).toString().padStart(2, '0')}` : 'מעלה...'}
                              </span>
                              <p className="text-xs text-gray-400 mt-1">
                                התחיל: {startTime.toLocaleTimeString('he-IL')}
                              </p>
                            </div>
                            <button
                              onClick={() => handleCancelItem(upload.id)}
                              disabled={cancellingItem === upload.id}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-lg disabled:opacity-50"
                              title="בטל תהליך"
                            >
                              {cancellingItem === upload.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Summary for restart safety */}
            <div className={`p-3 rounded-lg ${
              activeProcesses.activeConversations.length === 0 && activeProcesses.processingUploads.length === 0
                ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                : 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700'
            }`}>
              <p className={`text-sm font-medium ${
                activeProcesses.activeConversations.length === 0 && activeProcesses.processingUploads.length === 0
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {activeProcesses.activeConversations.length === 0 && activeProcesses.processingUploads.length === 0 ? (
                  <>
                    <Check className="w-4 h-4 inline mr-1" />
                    בטוח לעשות ריסטארט לשרת
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    יש תהליכים פעילים! המתן לפני ריסטארט
                    ({activeProcesses.activeConversations.length} שיחות, {activeProcesses.processingUploads.length} העלאות)
                  </>
                )}
              </p>
              {activeProcesses.pendingCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {activeProcesses.pendingCount} סטטוסים בתור ממתינים לשליחה
                </p>
              )}
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
