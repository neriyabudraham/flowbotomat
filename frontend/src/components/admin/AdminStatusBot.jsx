import { useState, useEffect, useRef } from 'react';
import {
  Smartphone, RefreshCw, Users, Upload, Eye, Heart,
  Clock, Check, X, AlertCircle, Shield, Wifi, WifiOff,
  Phone, Search, ChevronDown, ChevronUp, Activity, MessageCircle, Loader2,
  RotateCcw, PhoneCall, XCircle, AlertTriangle, BarChart3, TrendingUp,
  Trash2, RotateCw, FileText, Calendar, Zap, Timer, ChevronRight, ExternalLink,
  PauseCircle, PlayCircle, Ban, ListX
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';
import { io } from 'socket.io-client';

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

function formatTime(seconds) {
  if (seconds < 60) return `${seconds} שניות`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')} דקות`;
  return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')} שעות`;
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('he-IL', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatTimeAgo(timestamp, now) {
  const diff = now - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes >= 10) return null; // Expired
  if (minutes > 0) return `לפני ${minutes} דקות`;
  return `לפני ${seconds} שניות`;
}

export default function AdminStatusBot() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [liftingRestriction, setLiftingRestriction] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showErrorsModal, setShowErrorsModal] = useState(null);
  const [userErrors, setUserErrors] = useState([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  
  const [syncingPhones, setSyncingPhones] = useState(false);
  const [resettingQueue, setResettingQueue] = useState(false);
  const [cancellingItem, setCancellingItem] = useState(null);
  const [clearingErrors, setClearingErrors] = useState(null);
  const [retryingErrors, setRetryingErrors] = useState(null);

  // Bulk queue controls
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [pauseModal, setPauseModal] = useState(false);
  const [pauseMinutes, setPauseMinutes] = useState('30');
  const [pausing, setPausing] = useState(false);
  const [queuePauseStatus, setQueuePauseStatus] = useState({ paused: false });
  const [restrictModal, setRestrictModal] = useState(false);
  const [restrictMinutes, setRestrictMinutes] = useState('60');
  const [restricting, setRestricting] = useState(false);
  
  const [activeProcesses, setActiveProcesses] = useState({
    activeConversations: [],
    recentMessages: [],
    processingUploads: [],
    queueLock: null,
    pendingCount: 0,
    pendingQueue: [],
    scheduledStatuses: []
  });
  const [loadingProcesses, setLoadingProcesses] = useState(true);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef(null);

  // Queue settings
  const defaultQueueSettings = {
    timeoutMinutes: 10, maxParallelTotal: 5, maxParallelPerSource: 2,
    delayBetweenStatusesSeconds: 30, restrictionNewSessionHours: 24,
    restrictionWithMainBotMinutes: 30, delayOnDisconnectMinutes: 0,
  };
  const [queueSettings, setQueueSettings] = useState(defaultQueueSettings);
  const [editingSettings, setEditingSettings] = useState(
    Object.fromEntries(Object.entries(defaultQueueSettings).map(([k, v]) => [k, String(v)]))
  );
  const [editingTimeout, setEditingTimeout] = useState(''); // legacy alias
  const [savingSettings, setSavingSettings] = useState(false);
  const [showQueueSettings, setShowQueueSettings] = useState(false);

  // Upload stats
  const [uploadStats, setUploadStats] = useState([]);
  const [showUploadStats, setShowUploadStats] = useState(false);
  const [loadingUploadStats, setLoadingUploadStats] = useState(false);
  const [switchingUser, setSwitchingUser] = useState(null);

  // Restriction management
  const [settingRestriction, setSettingRestriction] = useState(null);
  const [restrictionInput, setRestrictionInput] = useState('');

  useEffect(() => {
    loadData();
    loadActiveProcesses();
    api.get('/status-bot/admin/queue-settings').then(({ data }) => {
      setQueueSettings(data);
      setEditingSettings(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
      setEditingTimeout(String(data.timeoutMinutes));
    }).catch(() => {});
    
    const timer = setInterval(() => setNow(Date.now()), 1000);
    
    const socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || '', {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Admin socket connected');
      socket.emit('join_admin');
    });
    
    socket.on('statusbot:conversation_update', () => loadActiveProcesses());
    socket.on('statusbot:processing_start', (data) => {
      console.log('Processing started:', data);
      loadActiveProcesses();
    });
    socket.on('statusbot:processing_end', (data) => {
      console.log('Processing ended:', data);
      loadActiveProcesses();
      loadData();
    });
    
    // Auto-refresh active processes every 5 seconds
    const processTimer = setInterval(() => loadActiveProcesses(), 5000);
    
    // Real-time message received - update recent messages list
    socket.on('statusbot:message_received', (data) => {
      console.log('Message received:', data);
      setActiveProcesses(prev => {
        // Update or add to recent messages
        const existingIndex = prev.recentMessages.findIndex(m => m.phone === data.phone);
        const newMessage = {
          phone: data.phone,
          lastMessageAt: data.timestamp,
          senderName: data.senderName,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
          connectionId: data.connectionId
        };
        
        let updatedMessages;
        if (existingIndex >= 0) {
          // Update existing - move to top
          updatedMessages = [
            newMessage,
            ...prev.recentMessages.filter((_, i) => i !== existingIndex)
          ];
        } else {
          // Add new at top
          updatedMessages = [newMessage, ...prev.recentMessages];
        }
        
        return { ...prev, recentMessages: updatedMessages };
      });
    });
    
    return () => {
      clearInterval(timer);
      clearInterval(processTimer);
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

  const loadUserDetails = async (connectionId) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/status-bot/admin/user/${connectionId}/details`);
      setUserDetails(res.data);
    } catch (err) {
      console.error('Failed to load user details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadUserErrors = async (connectionId) => {
    setLoadingErrors(true);
    try {
      const res = await api.get(`/status-bot/admin/user/${connectionId}/errors`);
      setUserErrors(res.data.errors || []);
    } catch (err) {
      console.error('Failed to load user errors:', err);
    } finally {
      setLoadingErrors(false);
    }
  };

  const handleExpandUser = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setUserDetails(null);
    } else {
      setExpandedUser(userId);
      await loadUserDetails(userId);
    }
  };

  const handleShowErrors = async (user) => {
    setShowErrorsModal(user);
    await loadUserErrors(user.id);
  };

  const handleSwitchToUser = async (e, userId) => {
    e.stopPropagation();
    setSwitchingUser(userId);
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && !localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      const { data } = await api.post(`/experts/switch/${userId}`);
      if (data?.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/status-bot';
      }
    } catch (err) {
      alert('שגיאה במעבר לחשבון');
    } finally {
      setSwitchingUser(null);
    }
  };

  const handleLoadUploadStats = async () => {
    setShowUploadStats(s => !s);
    if (!uploadStats.length) {
      setLoadingUploadStats(true);
      try {
        const { data } = await api.get('/status-bot/admin/upload-stats');
        setUploadStats(data.stats || []);
      } catch (err) {
        alert('שגיאה בטעינת סטטיסטיקות');
      } finally {
        setLoadingUploadStats(false);
      }
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
      loadActiveProcesses();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול');
    } finally {
      setCancellingItem(null);
    }
  };

  const handleClearUserErrors = async (connectionId) => {
    if (!confirm('למחוק את כל השגיאות?')) return;
    
    setClearingErrors(connectionId);
    try {
      const res = await api.delete(`/status-bot/admin/user/${connectionId}/errors`);
      alert(res.data.message);
      setShowErrorsModal(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקה');
    } finally {
      setClearingErrors(null);
    }
  };

  const handleRetryUserErrors = async (connectionId) => {
    if (!confirm('להחזיר את כל הנכשלים לתור?')) return;
    
    setRetryingErrors(connectionId);
    try {
      const res = await api.post(`/status-bot/admin/user/${connectionId}/retry-errors`);
      alert(res.data.message);
      setShowErrorsModal(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה');
    } finally {
      setRetryingErrors(null);
    }
  };

  const handleSetRestriction = async (connectionId, restrictionUntil) => {
    try {
      await api.patch(`/status-bot/admin/user/${connectionId}/set-restriction`, { restrictionUntil });
      setSettingRestriction(null);
      setRestrictionInput('');
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון הגבלה');
    }
  };

  const handleSaveAllSettings = async () => {
    setSavingSettings(true);
    try {
      const payload = {};
      for (const [k, v] of Object.entries(editingSettings)) {
        const num = parseFloat(v);
        if (!isNaN(num)) payload[k] = num;
      }
      await api.patch('/status-bot/admin/queue-settings', payload);
      const { data } = await api.get('/status-bot/admin/queue-settings');
      setQueueSettings(data);
      setEditingSettings(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
    } catch { }
    setSavingSettings(false);
  };

  // Load queue pause status on mount
  useEffect(() => {
    api.get('/status-bot/admin/queue/pause').then(({ data }) => setQueuePauseStatus(data)).catch(() => {});
  }, []);

  const handleAdminCancelItem = async (queueId) => {
    if (!confirm('לבטל פריט זה מהתור?')) return;
    setCancellingItem(queueId);
    try {
      await api.delete(`/status-bot/admin/queue/${queueId}`);
      loadActiveProcesses();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול');
    } finally {
      setCancellingItem(null);
    }
  };

  const handleBulkCancel = async () => {
    const total = (activeProcesses.pendingQueue?.length || 0) + (activeProcesses.scheduledStatuses?.length || 0);
    if (!confirm(`לבטל את כל ${total} הפריטים הממתינים והמתוזמנים?`)) return;
    setBulkCancelling(true);
    try {
      const { data } = await api.post('/status-bot/admin/queue/bulk-cancel', { statuses: ['pending', 'scheduled'] });
      alert(`בוטלו ${data.cancelled} פריטים בהצלחה`);
      loadActiveProcesses();
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול גורף');
    } finally {
      setBulkCancelling(false);
    }
  };

  const handlePauseQueue = async () => {
    setPausing(true);
    try {
      const { data } = await api.post('/status-bot/admin/queue/pause', { minutes: parseFloat(pauseMinutes) || 30 });
      setQueuePauseStatus({ paused: true, pausedUntil: data.pausedUntil });
      setPauseModal(false);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהשהיית התור');
    } finally {
      setPausing(false);
    }
  };

  const handleResumeQueue = async () => {
    try {
      await api.delete('/status-bot/admin/queue/pause');
      setQueuePauseStatus({ paused: false });
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה');
    }
  };

  const handleRestrictAllUsers = async () => {
    const mins = parseFloat(restrictMinutes) || 60;
    if (!confirm(`לחסום את כל המשתמשים המחוברים למשך ${mins} דקות?`)) return;
    setRestricting(true);
    try {
      const { data } = await api.post('/status-bot/admin/restrict-all-users', { minutes: mins });
      alert(`נחסמו ${data.restricted} משתמשים עד ${new Date(data.until).toLocaleTimeString('he-IL')}`);
      setRestrictModal(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בחסימה');
    } finally {
      setRestricting(false);
    }
  };

  const filteredUsers = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone_number?.includes(search)
  );

  const getRestrictionInfo = (user) => {
    if (user.short_restriction_until && new Date(user.short_restriction_until) > new Date()) {
      return { restricted: true, type: 'short', endsAt: new Date(user.short_restriction_until) };
    }
    if (user.restriction_lifted) return { restricted: false };
    // Use restriction_until if set
    if (user.restriction_until && new Date(user.restriction_until) > new Date()) {
      return { restricted: true, type: 'full', endsAt: new Date(user.restriction_until) };
    }
    // Fall back to 24h from last_connected_at
    const connectionDate = user.last_connected_at || user.first_connected_at;
    if (!connectionDate) return { restricted: false };
    const restrictionEnd = new Date(new Date(connectionDate).getTime() + 24 * 60 * 60 * 1000);
    if (new Date() < restrictionEnd) {
      return { restricted: true, type: 'full', endsAt: restrictionEnd };
    }
    return { restricted: false };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Smartphone className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">בוט העלאת סטטוסים</h2>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncPhones}
            disabled={syncingPhones}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
          >
            {syncingPhones ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
            סנכרן טלפונים
          </button>
          
          <button
            onClick={handleResetQueue}
            disabled={resettingQueue}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
          >
            {resettingQueue ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            אפס תור
          </button>
          
          <button
            onClick={() => setShowQueueSettings(s => !s)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <Timer className="w-4 h-4" />
            הגדרות תור
            <ChevronDown className={`w-4 h-4 transition-transform ${showQueueSettings ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={handleLoadUploadStats}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
          >
            {loadingUploadStats ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            זמני העלאה
            <ChevronDown className={`w-4 h-4 transition-transform ${showUploadStats ? 'rotate-180' : ''}`} />
          </button>

          <Button variant="ghost" onClick={loadData} className="!p-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Upload Stats Panel */}
      {showUploadStats && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            זמן העלאה ממוצע למשתמש (בשניות)
          </h3>
          {loadingUploadStats ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-right pb-2 font-medium">משתמש</th>
                    <th className="text-center pb-2 font-medium">טקסט</th>
                    <th className="text-center pb-2 font-medium">תמונה</th>
                    <th className="text-center pb-2 font-medium">סרטון</th>
                    <th className="text-center pb-2 font-medium">קול</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploadStats.map(row => (
                    <tr key={row.connection_id} className="hover:bg-gray-50">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-gray-800">{row.user_name || '—'}</p>
                        <p className="text-xs text-gray-500">{row.email}</p>
                      </td>
                      {['text', 'image', 'video', 'voice'].map(type => {
                        const avg = row[`avg_${type}_seconds`];
                        const count = parseInt(row[`${type}_count`] || 0);
                        return (
                          <td key={type} className="py-2 text-center">
                            {avg != null ? (
                              <div>
                                <span className="font-medium text-gray-800">{Math.round(avg)}ש׳</span>
                                <span className="text-xs text-gray-400 block">({count})</span>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {uploadStats.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-gray-400">אין נתונים</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Queue Settings Panel */}
      {showQueueSettings && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4" />
            הגדרות תור ועיבוד מקביל
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { key: 'timeoutMinutes', label: 'טיימאאוט (דקות)', min: 0.5, step: 0.5 },
              { key: 'maxParallelTotal', label: 'מקסימום מקביל סה"כ', min: 1, step: 1 },
              { key: 'maxParallelPerSource', label: 'מקסימום מקביל לשרת', min: 1, step: 1 },
              { key: 'delayBetweenStatusesSeconds', label: 'השהיה בין סטטוסים (שניות)', min: 0, step: 1 },
              { key: 'restrictionNewSessionHours', label: 'השהיה - סשן חדש (שעות)', min: 0, step: 0.5 },
              { key: 'restrictionWithMainBotMinutes', label: 'השהיה - בוט רגיל (דקות)', min: 0, step: 5 },
              { key: 'delayOnDisconnectMinutes', label: 'השהיה בניתוק (דקות)', min: 0, step: 1 },
            ].map(({ key, label, min, step }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input
                  type="number"
                  id={`queue-setting-${key}`}
                  name={`queue-setting-${key}`}
                  min={min}
                  step={step}
                  value={editingSettings[key] ?? String(queueSettings[key] ?? '')}
                  onChange={e => setEditingSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-700"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveAllSettings}
              disabled={savingSettings}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              שמור הגדרות
            </button>
          </div>
        </div>
      )}

      {/* Main Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard icon={Users} label="סה״כ חיבורים" value={stats.connections?.total || 0} color="blue" />
          <StatCard icon={Wifi} label="מחוברים" value={stats.connections?.connected || 0} color="green" />
          <StatCard icon={WifiOff} label="מנותקים" value={stats.connections?.disconnected || 0} color="gray" />
          <StatCard icon={Upload} label="סטטוסים היום" value={stats.statuses?.today || stats.statusesToday || 0} color="purple" />
          <StatCard icon={Eye} label="צפיות היום" value={stats.statuses?.views_today || 0} color="cyan" />
          <StatCard icon={Heart} label="לבבות היום" value={stats.statuses?.reactions_today || 0} color="pink" />
        </div>
      )}

      {/* Queue Status */}
      {stats?.queue && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <h3 className="font-medium text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            מצב תור
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <QueueStat label="ממתינים" value={stats.queue.pending || 0} color="blue" />
            <QueueStat label="בעיבוד" value={stats.queue.processing || 0} color="amber" pulse />
            <QueueStat label="נכשלו" value={stats.queue.failed || 0} color="red" />
            <QueueStat label="מתוזמנים" value={stats.queue.scheduled || 0} color="indigo" />
            <QueueStat label="נשלחו היום" value={stats.queue.sent_today || 0} color="green" />
            <QueueStat label="נכשלו היום" value={stats.queue.failed_today || 0} color="orange" />
          </div>
        </div>
      )}

      {/* Top Users Today */}
      {stats?.topUsersToday?.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <h3 className="font-medium text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            הכי פעילים היום
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stats.topUsersToday.map((user, idx) => (
              <div key={idx} className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm min-w-[150px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-gray-800 dark:text-white truncate">
                    {user.display_name || user.user_name || 'ללא שם'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-purple-600">{user.status_count}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Bulk Queue Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-800 dark:text-white flex items-center gap-2">
            <ListX className="w-4 h-4 text-red-600" />
            ניהול תור גורף
          </h3>
          {queuePauseStatus.paused && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <PauseCircle className="w-3 h-3" />
              התור מושהה עד {new Date(queuePauseStatus.pausedUntil).toLocaleTimeString('he-IL')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Pause / Resume */}
          {queuePauseStatus.paused ? (
            <button
              onClick={handleResumeQueue}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
            >
              <PlayCircle className="w-4 h-4" />
              חדש תור
            </button>
          ) : (
            <button
              onClick={() => setPauseModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200"
            >
              <PauseCircle className="w-4 h-4" />
              השהה תור
            </button>
          )}

          {/* Bulk cancel */}
          <button
            onClick={handleBulkCancel}
            disabled={bulkCancelling}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
          >
            {bulkCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListX className="w-4 h-4" />}
            ביטול גורף ממתינים+מתוזמנים
          </button>

          {/* Restrict all users */}
          <button
            onClick={() => setRestrictModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
          >
            <Ban className="w-4 h-4" />
            חסום כלל הלקוחות
          </button>
        </div>
      </div>

      {/* Pause Modal */}
      {pauseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <PauseCircle className="w-5 h-5 text-orange-500" />
              השהיית תור
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              לכמה דקות להשהות את עיבוד התור? (לא יבוטלו סטטוסים, רק לא יתחילו חדשים)
            </p>
            <div className="flex items-center gap-2 mb-5">
              <input
                type="number"
                value={pauseMinutes}
                onChange={e => setPauseMinutes(e.target.value)}
                min="1" max="1440"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <span className="text-sm text-gray-500">דקות</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPauseModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">ביטול</button>
              <button onClick={handlePauseQueue} disabled={pausing} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
                {pausing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
                השהה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restrict All Modal */}
      {restrictModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Ban className="w-5 h-5 text-purple-500" />
              חסימת כלל הלקוחות
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              חסימה זמנית של כל המשתמשים המחוברים מהעלאת סטטוסים למשך:
            </p>
            <div className="flex items-center gap-2 mb-5">
              <input
                type="number"
                value={restrictMinutes}
                onChange={e => setRestrictMinutes(e.target.value)}
                min="1" max="10080"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <span className="text-sm text-gray-500">דקות</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestrictModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">ביטול</button>
              <button onClick={handleRestrictAllUsers} disabled={restricting} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                {restricting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                חסום
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Active Processes */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-800 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-600" />
            ניטור בזמן אמת
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          </h3>
          <button onClick={loadActiveProcesses} className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1">
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
            {/* Recent Messages (last 10 minutes) */}
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                הודעות אחרונות (10 דקות אחרונות)
                <span className="text-xs text-gray-400">({activeProcesses.recentMessages?.filter(m => {
                  const timeAgo = formatTimeAgo(m.lastMessageAt, now);
                  return timeAgo !== null;
                }).length || 0})</span>
              </h4>
              {(() => {
                const validMessages = activeProcesses.recentMessages?.filter(m => {
                  const timeAgo = formatTimeAgo(m.lastMessageAt, now);
                  return timeAgo !== null;
                }) || [];
                
                if (validMessages.length === 0) {
                  return <p className="text-sm text-gray-400 py-2">אין הודעות ב-10 דקות האחרונות</p>;
                }
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {validMessages.map((msg, idx) => {
                      const timeAgo = formatTimeAgo(msg.lastMessageAt, now);
                      const diff = now - new Date(msg.lastMessageAt).getTime();
                      const seconds = Math.floor(diff / 1000);
                      const isRecent = seconds < 30; // Less than 30 seconds = very recent
                      
                      return (
                        <div key={idx} className={`bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border ${
                          isRecent ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-100 dark:border-gray-700'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'}`} />
                              <Phone className="w-4 h-4 text-amber-600" />
                              <span className="font-medium text-gray-800 dark:text-white" dir="ltr">+{msg.phone}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500">{msg.senderName || msg.ownerName || msg.ownerEmail || 'לא ידוע'}</p>
                            <span className={`text-xs font-medium ${isRecent ? 'text-amber-600' : 'text-gray-400'}`}>
                              {timeAgo}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            
            {/* Processing Uploads */}
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                העלאות בתהליך ({activeProcesses.processingUploads.length})
              </h4>
              {activeProcesses.processingUploads.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">אין העלאות בעיבוד כרגע</p>
              ) : (
                <div className="space-y-2">
                  {activeProcesses.processingUploads.map((upload, idx) => {
                    const startTime = new Date(upload.startedAt);
                    const processingSeconds = Math.round((now - startTime.getTime()) / 1000);
                    const isStuck = processingSeconds > 600; // 10 minutes
                    const isWarning = processingSeconds > 180; // 3 minutes
                    
                    return (
                      <div key={idx} className={`bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border ${
                        isStuck ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : 
                        isWarning ? 'border-amber-300 dark:border-amber-700' : 
                        'border-green-200 dark:border-green-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isStuck ? 'bg-red-100' : isWarning ? 'bg-amber-100' : 'bg-green-100'
                            }`}>
                              <Loader2 className={`w-5 h-5 animate-spin ${
                                isStuck ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-green-600'
                              }`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">
                                {upload.statusType === 'text' ? '📝 טקסט' : 
                                 upload.statusType === 'image' ? '🖼️ תמונה' : 
                                 upload.statusType === 'video' ? '🎬 סרטון' : '🎤 קול'}
                                {upload.totalParts > 1 && ` (חלק ${upload.partNumber}/${upload.totalParts})`}
                              </p>
                              <p className="text-sm text-gray-500">
                                {upload.userName || upload.userEmail}
                                {upload.sourcePhone && <span className="mr-1" dir="ltr">• {upload.sourcePhone}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-left">
                              <div className={`text-lg font-mono font-bold ${
                                isStuck ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-green-600'
                              }`}>
                                <Timer className="w-4 h-4 inline mr-1" />
                                {formatTime(processingSeconds)}
                              </div>
                              <p className="text-xs text-gray-400">התחיל: {startTime.toLocaleTimeString('he-IL')}</p>
                            </div>
                            <button
                              onClick={() => handleCancelItem(upload.id)}
                              disabled={cancellingItem === upload.id}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-lg disabled:opacity-50"
                            >
                              {cancellingItem === upload.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-5 h-5" />
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

            {/* Pending Queue */}
            {activeProcesses.pendingQueue?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  תור ממתין ({activeProcesses.pendingCount})
                </h4>
                <div className="space-y-2">
                  {activeProcesses.pendingQueue.map((item, idx) => (
                    <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                            #{idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white">
                              {item.statusType === 'text' ? '📝 טקסט' : 
                               item.statusType === 'image' ? '🖼️ תמונה' : 
                               item.statusType === 'video' ? '🎬 סרטון' : '🎤 קול'}
                              {item.totalParts > 1 && ` (חלק ${item.partNumber}/${item.totalParts})`}
                            </p>
                            <p className="text-sm text-gray-500">{item.userName || item.userEmail}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400">
                            נוסף: {new Date(item.createdAt).toLocaleTimeString('he-IL')}
                          </p>
                          <button
                            onClick={() => handleAdminCancelItem(item.id)}
                            disabled={cancellingItem === item.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                            title="בטל פריט"
                          >
                            {cancellingItem === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activeProcesses.pendingCount > activeProcesses.pendingQueue.length && (
                    <p className="text-center text-sm text-gray-400">
                      + {activeProcesses.pendingCount - activeProcesses.pendingQueue.length} נוספים בתור
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Scheduled Statuses */}
            {activeProcesses.scheduledStatuses?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  מתוזמנים ({activeProcesses.scheduledStatuses.length})
                </h4>
                <div className="space-y-2">
                  {activeProcesses.scheduledStatuses.map((item) => {
                    const scheduledTime = new Date(item.scheduledFor);
                    const timeUntil = scheduledTime.getTime() - now;
                    const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
                    const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
                    const secondsUntil = Math.floor((timeUntil % (1000 * 60)) / 1000);
                    
                    let countdownText = '';
                    if (hoursUntil > 0) {
                      countdownText = `${hoursUntil}:${minutesUntil.toString().padStart(2, '0')}:${secondsUntil.toString().padStart(2, '0')}`;
                    } else if (minutesUntil > 0) {
                      countdownText = `${minutesUntil}:${secondsUntil.toString().padStart(2, '0')}`;
                    } else {
                      countdownText = `${secondsUntil} שניות`;
                    }
                    
                    const isNear = timeUntil < 5 * 60 * 1000; // Less than 5 minutes
                    
                    return (
                      <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border ${
                        isNear ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/20' : 'border-indigo-100 dark:border-indigo-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isNear ? 'bg-indigo-200' : 'bg-indigo-100'
                            }`}>
                              <Timer className={`w-5 h-5 text-indigo-600 ${isNear ? 'animate-pulse' : ''}`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">
                                {item.statusType === 'text' ? '📝 טקסט' : 
                                 item.statusType === 'image' ? '🖼️ תמונה' : 
                                 item.statusType === 'video' ? '🎬 סרטון' : '🎤 קול'}
                                {item.totalParts > 1 && ` (חלק ${item.partNumber}/${item.totalParts})`}
                              </p>
                              <p className="text-sm text-gray-500">{item.userName || item.userEmail}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-left">
                            <div>
                              <div className={`text-lg font-mono font-bold ${isNear ? 'text-indigo-600' : 'text-gray-600'}`}>
                                {countdownText}
                              </div>
                              <p className="text-xs text-gray-400">
                                {scheduledTime.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}
                              </p>
                            </div>
                            <button
                              onClick={() => handleAdminCancelItem(item.id)}
                              disabled={cancellingItem === item.id}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                              title="בטל מתוזמן"
                            >
                              {cancellingItem === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Status Summary */}
            <div className={`p-3 rounded-lg ${
              activeProcesses.processingUploads.length === 0
                ? 'bg-green-100 dark:bg-green-900/30 border border-green-300'
                : 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300'
            }`}>
              <p className={`text-sm font-medium ${
                activeProcesses.processingUploads.length === 0
                  ? 'text-green-700' : 'text-amber-700'
              }`}>
                {activeProcesses.processingUploads.length === 0 ? (
                  <><Check className="w-4 h-4 inline mr-1" />בטוח לעשות ריסטארט</>
                ) : (
                  <><AlertCircle className="w-4 h-4 inline mr-1" />
                    יש {activeProcesses.processingUploads.length} העלאות פעילות
                  </>
                )}
              </p>
              {activeProcesses.pendingCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">{activeProcesses.pendingCount} סטטוסים ממתינים בתור</p>
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
        <div className="text-center py-8 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          טוען משתמשים...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין משתמשים בשירות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(user => {
            const restriction = getRestrictionInfo(user);
            const isExpanded = expandedUser === user.id;
            const hasErrors = parseInt(user.failed_count || 0) > 0;
            
            return (
              <div key={user.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* User Row */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  onClick={() => handleExpandUser(user.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Expand Icon */}
                      <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      
                      {/* User Info */}
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">{user.user_name || '—'}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                      
                      {/* Connection Status */}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.connection_status === 'connected' ? 'bg-green-100 text-green-700' :
                        user.connection_status === 'qr_pending' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {user.connection_status === 'connected' ? <><Wifi className="w-3 h-3 inline mr-1" />מחובר</> :
                         user.connection_status === 'qr_pending' ? 'ממתין ל-QR' : 'מנותק'}
                      </span>
                      
                      {/* Phone */}
                      {user.phone_number && (
                        <span className="text-sm text-gray-600 dark:text-gray-400" dir="ltr">+{user.phone_number}</span>
                      )}
                    </div>
                    
                    {/* Stats Badges */}
                    <div className="flex items-center gap-3">
                      {/* Switch to user account */}
                      <button
                        onClick={(e) => handleSwitchToUser(e, user.user_id)}
                        disabled={switchingUser === user.user_id}
                        className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 text-xs font-medium"
                        title="עבור לחשבון המשתמש"
                      >
                        {switchingUser === user.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                        כניסה
                      </button>
                      <StatBadge icon={Upload} value={user.statuses_today || 0} label="היום" color="purple" />
                      <StatBadge icon={Clock} value={user.pending_count || 0} label="בתור" color="blue" />
                      {hasErrors && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleShowErrors(user); }}
                          className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          <span>{user.failed_count}</span>
                        </button>
                      )}
                      <StatBadge icon={Users} value={user.authorized_count || 0} label="מורשים" color="green" />
                      
                      {restriction.restricted && (
                        <div className="flex items-center gap-1">
                          {/* Countdown timer */}
                          <RestrictionCountdown endsAt={restriction.endsAt} now={now} />
                          {/* Set restriction button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSettingRestriction(user.id);
                              setRestrictionInput(restriction.endsAt
                                ? restriction.endsAt.toISOString().slice(0, 16)
                                : new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16));
                            }}
                            className="p-1 text-amber-600 hover:bg-amber-100 rounded"
                            title="קבע זמן סיום"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          {/* Lift restriction */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLiftRestriction(user.id); }}
                            disabled={liftingRestriction === user.id}
                            className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200"
                          >
                            {liftingRestriction === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'הסר'}
                          </button>
                        </div>
                      )}
                      {!restriction.restricted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSettingRestriction(user.id);
                            setRestrictionInput(new Date(Date.now() + 24 * 60 * 60000).toISOString().slice(0, 16));
                          }}
                          className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                          title="הוסף השהיה"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Quick Stats Row */}
                  <div className="flex items-center gap-6 mt-3 text-sm text-gray-500">
                    <span>סה״כ: <strong className="text-gray-700 dark:text-gray-300">{user.total_statuses || 0}</strong></span>
                    <span>צפיות היום: <strong className="text-cyan-600">{user.views_today || 0}</strong></span>
                    <span>לבבות היום: <strong className="text-pink-600">{user.reactions_today || 0}</strong></span>
                    <span>תגובות היום: <strong className="text-blue-600">{user.replies_today || 0}</strong></span>
                    {user.last_status_sent && (
                      <span>שליחה אחרונה: <strong>{formatDate(user.last_status_sent)}</strong></span>
                    )}
                  </div>
                </div>
                
                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50">
                    {loadingDetails ? (
                      <div className="text-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                      </div>
                    ) : userDetails ? (
                      <div className="space-y-4">
                        {/* Recent Queue Items */}
                        <div>
                          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">פריטים בתור</h4>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {userDetails.queueItems?.slice(0, 10).map(item => (
                              <div key={item.id} className={`flex items-center justify-between p-2 rounded text-sm ${
                                item.queue_status === 'sent' ? 'bg-green-50' :
                                item.queue_status === 'failed' ? 'bg-red-50' :
                                item.queue_status === 'processing' ? 'bg-amber-50' :
                                'bg-white'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span>{item.status_type === 'text' ? '📝' : item.status_type === 'image' ? '🖼️' : item.status_type === 'video' ? '🎬' : '🎤'}</span>
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    item.queue_status === 'sent' ? 'bg-green-100 text-green-700' :
                                    item.queue_status === 'failed' ? 'bg-red-100 text-red-700' :
                                    item.queue_status === 'processing' ? 'bg-amber-100 text-amber-700' :
                                    item.queue_status === 'scheduled' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>{item.queue_status}</span>
                                  {item.error_message && <span className="text-red-600 text-xs truncate max-w-[200px]">{item.error_message}</span>}
                                </div>
                                <span className="text-gray-400 text-xs">{formatDate(item.created_at)}</span>
                              </div>
                            ))}
                            {(!userDetails.queueItems || userDetails.queueItems.length === 0) && (
                              <p className="text-gray-400 text-sm">אין פריטים בתור</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Authorized Numbers */}
                        <div>
                          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">מספרים מורשים ({userDetails.authorizedNumbers?.length || 0})</h4>
                          <div className="flex flex-wrap gap-2">
                            {userDetails.authorizedNumbers?.map((num, idx) => (
                              <span key={idx} className={`px-2 py-1 rounded text-sm ${num.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`} dir="ltr">
                                +{num.phone_number}
                              </span>
                            ))}
                            {(!userDetails.authorizedNumbers || userDetails.authorizedNumbers.length === 0) && (
                              <p className="text-gray-400 text-sm">אין מספרים מורשים</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restriction Set Modal */}
      {settingRestriction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSettingRestriction(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              קבע זמן סיום השהיה
            </h3>
            <input
              type="datetime-local"
              value={restrictionInput}
              onChange={e => setRestrictionInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-blue-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSetRestriction(settingRestriction, restrictionInput)}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium"
              >
                קבע
              </button>
              <button
                onClick={() => handleSetRestriction(settingRestriction, null)}
                className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium"
              >
                הסר לגמרי
              </button>
              <button
                onClick={() => setSettingRestriction(null)}
                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Errors Modal */}
      {showErrorsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowErrorsModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-lg">שגיאות - {showErrorsModal.user_name || showErrorsModal.email}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRetryUserErrors(showErrorsModal.id)}
                  disabled={retryingErrors === showErrorsModal.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                >
                  {retryingErrors === showErrorsModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                  נסה שוב הכל
                </button>
                <button
                  onClick={() => handleClearUserErrors(showErrorsModal.id)}
                  disabled={clearingErrors === showErrorsModal.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                >
                  {clearingErrors === showErrorsModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  מחק הכל
                </button>
                <button onClick={() => setShowErrorsModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {loadingErrors ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </div>
              ) : userErrors.length === 0 ? (
                <p className="text-center text-gray-500 py-8">אין שגיאות</p>
              ) : (
                <div className="space-y-2">
                  {userErrors.map(err => (
                    <div key={err.id} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-medium">{err.status_type === 'text' ? '📝 טקסט' : err.status_type === 'image' ? '🖼️ תמונה' : err.status_type === 'video' ? '🎬 סרטון' : '🎤 קול'}</span>
                          {err.part_number && <span className="text-sm text-gray-500 mr-2">(חלק {err.part_number}/{err.total_parts})</span>}
                        </div>
                        <span className="text-xs text-gray-500">{formatDate(err.created_at)}</span>
                      </div>
                      <p className="text-red-700 text-sm mt-1">{err.error_message || 'שגיאה לא ידועה'}</p>
                      {err.source_phone && <p className="text-xs text-gray-500 mt-1" dir="ltr">מ: {err.source_phone}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RestrictionCountdown({ endsAt, now }) {
  if (!endsAt) return null;
  const secsLeft = Math.max(0, Math.floor((endsAt.getTime() - now) / 1000));
  if (secsLeft <= 0) return null;
  const days = Math.floor(secsLeft / 86400);
  const hrs = Math.floor((secsLeft % 86400) / 3600);
  const mins = Math.floor((secsLeft % 3600) / 60);
  const secs = secsLeft % 60;
  let text;
  if (days > 0) text = `${days}י ${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;
  else if (hrs > 0) text = `${hrs}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  else text = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  return (
    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-mono font-medium">
      {text}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    cyan: 'bg-cyan-100 text-cyan-600',
    pink: 'bg-pink-100 text-pink-600',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function QueueStat({ label, value, color, pulse }) {
  const colors = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    green: 'text-green-600',
    indigo: 'text-indigo-600',
    orange: 'text-orange-600',
  };

  return (
    <div className="text-center">
      <span className={`text-2xl font-bold ${colors[color]} ${pulse && value > 0 ? 'animate-pulse' : ''}`}>{value}</span>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function StatBadge({ icon: Icon, value, label, color }) {
  const colors = {
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${colors[color]}`}>
      <Icon className="w-3 h-3" />
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}
