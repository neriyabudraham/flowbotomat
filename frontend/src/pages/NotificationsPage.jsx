import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Bell, CheckCheck, Trash2, Share2, AlertTriangle, Info, Settings,
  Check, X, Megaphone, Gift, Sparkles, ArrowRight, CreditCard
} from 'lucide-react';
import useNotificationsStore from '../store/notificationsStore';
import Logo from '../components/atoms/Logo';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
import ViewingAsBanner from '../components/layout/ViewingAsBanner';

const NOTIFICATION_ICONS = {
  share_received: { icon: Share2, color: 'text-purple-500', bg: 'bg-purple-100' },
  share_accepted: { icon: Share2, color: 'text-green-500', bg: 'bg-green-100' },
  bot_error: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' },
  quota_warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100' },
  system: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100' },
  broadcast: { icon: Megaphone, color: 'text-indigo-500', bg: 'bg-indigo-100' },
  promo: { icon: Gift, color: 'text-pink-500', bg: 'bg-pink-100' },
  update: { icon: Sparkles, color: 'text-cyan-500', bg: 'bg-cyan-100' },
  subscription: { icon: CreditCard, color: 'text-green-500', bg: 'bg-green-100' },
  critical: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' },
};

function formatTime(date) {
  const now = new Date();
  const d = new Date(date);
  const diff = (now - d) / 1000;
  
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שעות`;
  if (diff < 604800) return `לפני ${Math.floor(diff / 86400)} ימים`;
  return d.toLocaleDateString('he-IL');
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  
  const { 
    notifications, 
    unreadCount, 
    loading,
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
    markSelectedAsRead,
    deleteNotification,
  } = useNotificationsStore();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleNotificationClick = (notification) => {
    if (selectionMode) {
      toggleSelection(notification.id);
      return;
    }
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };
  
  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };
  
  const handleMarkSelectedAsRead = () => {
    if (selectedIds.length > 0) {
      markSelectedAsRead(selectedIds);
      setSelectedIds([]);
      setSelectionMode(false);
    }
  };
  
  const selectAllUnread = () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    setSelectedIds(unreadIds);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" dir="rtl">
      <ViewingAsBanner />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="hover:opacity-80">
              <Logo size="sm" />
            </button>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-gray-600" />
              <h1 className="text-lg font-semibold text-gray-800">התראות</h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                  {unreadCount} חדשות
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <>
                <button
                  onClick={selectAllUnread}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  בחר הכל לא נקראות
                </button>
                <button
                  onClick={handleMarkSelectedAsRead}
                  disabled={selectedIds.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  סמן כנקראו ({selectedIds.length})
                </button>
                <button
                  onClick={() => { setSelectionMode(false); setSelectedIds([]); }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </>
            ) : (
              <>
                {unreadCount > 0 && (
                  <>
                    <button
                      onClick={() => setSelectionMode(true)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      בחר
                    </button>
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <CheckCheck className="w-4 h-4" />
                      סמן הכל כנקרא
                    </button>
                  </>
                )}
                <Link
                  to="/settings?tab=notifications"
                  className="p-2 rounded-lg transition-colors hover:bg-gray-100"
                  title="הגדרות התראות"
                >
                  <Settings className="w-5 h-5 text-gray-600" />
                </Link>
                <div className="h-8 w-px bg-gray-200" />
                <AccountSwitcher />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Notifications List */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-gray-500">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              טוען...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <Bell className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">אין התראות</h3>
              <p>כשיהיו לך התראות חדשות, הן יופיעו כאן</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification) => {
                const config = NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.system;
                const Icon = config.icon;
                
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !notification.is_read ? 'bg-blue-50/30' : ''
                    } ${selectedIds.includes(notification.id) ? 'bg-blue-100' : ''}`}
                  >
                    <div className="flex gap-4">
                      {selectionMode && (
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(notification.id)}
                            onChange={() => toggleSelection(notification.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded border-gray-300 text-blue-600"
                          />
                        </div>
                      )}
                      
                      <div className={`w-12 h-12 rounded-2xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-6 h-6 ${config.color}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`${!notification.is_read ? 'font-semibold' : 'font-medium'} text-gray-800`}>
                              {notification.title}
                            </p>
                            {notification.message && (
                              <p className="text-sm text-gray-500 mt-1">
                                {notification.message}
                              </p>
                            )}
                            {notification.bot_name && (
                              <p className="text-xs text-gray-400 mt-2">
                                בוט: {notification.bot_name}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-gray-400">
                              {formatTime(notification.created_at)}
                            </span>
                            {!selectionMode && (
                              <>
                                {!notification.is_read && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(notification.id);
                                    }}
                                    className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-500"
                                    title="סמן כנקראה"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification.id);
                                  }}
                                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                {notification.action_url && (
                                  <ArrowRight className="w-4 h-4 text-gray-400" />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {!notification.is_read && !selectionMode && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
