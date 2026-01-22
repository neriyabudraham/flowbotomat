import { useState, useEffect } from 'react';
import { AlertTriangle, Info, RefreshCw, X, Bell } from 'lucide-react';
import { getSocket } from '../../services/socket';

export default function SystemAlertOverlay() {
  const [alerts, setAlerts] = useState([]);
  const [updateCountdown, setUpdateCountdown] = useState(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Listen for system alerts
    const handleSystemAlert = (data) => {
      console.log('📢 System alert received:', data);
      const id = Date.now();
      setAlerts(prev => [...prev, { ...data, id }]);
      
      // Auto dismiss after 10 seconds if enabled
      if (data.autoDismiss) {
        setTimeout(() => {
          setAlerts(prev => prev.filter(a => a.id !== id));
        }, 10000);
      }
    };

    // Listen for system update notification
    const handleSystemUpdate = (data) => {
      console.log('🔄 System update notification:', data);
      setUpdateCountdown(data.countdown || 10);
    };

    socket.on('system_alert', handleSystemAlert);
    socket.on('system_update', handleSystemUpdate);

    return () => {
      socket.off('system_alert', handleSystemAlert);
      socket.off('system_update', handleSystemUpdate);
    };
  }, []);

  // Countdown timer for system update
  useEffect(() => {
    if (updateCountdown === null) return;
    
    if (updateCountdown <= 0) {
      // Update complete message
      setUpdateCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setUpdateCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [updateCountdown]);

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const getAlertStyles = (type) => {
    switch (type) {
      case 'warning':
        return {
          bg: 'bg-amber-500',
          icon: AlertTriangle,
        };
      case 'error':
        return {
          bg: 'bg-red-500',
          icon: AlertTriangle,
        };
      case 'success':
        return {
          bg: 'bg-green-500',
          icon: Info,
        };
      default:
        return {
          bg: 'bg-blue-500',
          icon: Info,
        };
    }
  };

  return (
    <>
      {/* System Update Overlay */}
      {updateCountdown !== null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md mx-4 text-center animate-fade-in">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-10 h-10 text-white animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              🔄 עדכון מערכת
            </h2>
            <p className="text-gray-600 mb-6">
              המערכת מתעדכנת לגירסה חדשה.
              <br />
              העמוד יתרענן אוטומטית.
            </p>
            <div className="text-5xl font-bold text-indigo-600 mb-4">
              {updateCountdown}
            </div>
            <p className="text-sm text-gray-500">שניות</p>
            
            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-sm text-amber-800 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                אנא המתן ואל תסגור את הדפדפן
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Regular Alerts (top right corner) */}
      {alerts.length > 0 && (
        <div className="fixed top-4 left-4 z-[9998] space-y-3 max-w-sm" dir="rtl">
          {alerts.map((alert) => {
            const styles = getAlertStyles(alert.type);
            const Icon = styles.icon;
            
            return (
              <div
                key={alert.id}
                className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-slide-in"
              >
                <div className={`${styles.bg} px-4 py-2 flex items-center justify-between`}>
                  <div className="flex items-center gap-2 text-white">
                    <Icon className="w-4 h-4" />
                    <span className="font-medium text-sm">{alert.title}</span>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="text-white/80 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-gray-700 text-sm">{alert.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
