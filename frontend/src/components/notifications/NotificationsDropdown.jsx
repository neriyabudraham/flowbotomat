import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, Share2, AlertTriangle, Info, X } from 'lucide-react';
import useNotificationsStore from '../../store/notificationsStore';

const NOTIFICATION_ICONS = {
  share_received: { icon: Share2, color: 'text-purple-500', bg: 'bg-purple-100' },
  share_accepted: { icon: Share2, color: 'text-green-500', bg: 'bg-green-100' },
  bot_error: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' },
  quota_warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100' },
  system: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100' },
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

export default function NotificationsDropdown() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const { 
    notifications, 
    unreadCount, 
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
    deleteNotification 
  } = useNotificationsStore();

  useEffect(() => {
    fetchNotifications();
    // Poll every minute
    const interval = setInterval(() => fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.action_url) {
      navigate(notification.action_url);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-gray-800' : 'text-gray-600'}`} />
        {unreadCount > 0 && (
          <>
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-1 font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">התראות</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                סמן הכל כנקרא
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Bell className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>אין התראות חדשות</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => {
                const config = NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.system;
                const Icon = config.icon;
                
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !notification.is_read ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4.5 h-4.5 ${config.color}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${!notification.is_read ? 'font-medium' : ''} text-gray-800`}>
                            {notification.title}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {notification.message && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTime(notification.created_at)}
                        </p>
                      </div>
                      
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <button 
                onClick={() => { navigate('/notifications'); setIsOpen(false); }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                הצג את כל ההתראות
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
