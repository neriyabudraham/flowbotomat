import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Info, RefreshCw, X, Bell, CheckCircle, XCircle } from 'lucide-react';
import { getSocket } from '../../services/socket';

export default function SystemAlertOverlay() {
  const [centerAlert, setCenterAlert] = useState(null); // Full-screen center alert
  const [updateCountdown, setUpdateCountdown] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Listen for system alerts - show in CENTER of screen
  const handleSystemAlert = useCallback((data) => {
    console.log('📢 System alert received:', data);
    setCenterAlert({
      ...data,
      id: Date.now()
    });
    
    // Auto dismiss after 15 seconds if enabled
    if (data.autoDismiss) {
      setTimeout(() => {
        setCenterAlert(null);
      }, 15000);
    }
  }, []);

  // Listen for system update notification
  const handleSystemUpdate = useCallback((data) => {
    console.log('🔄 System update notification:', data);
    setUpdateCountdown(data.countdown || 10);
  }, []);

  useEffect(() => {
    // Check for socket periodically until connected
    const checkSocket = () => {
      const socket = getSocket();
      if (socket?.connected && !socketConnected) {
        console.log('🔌 SystemAlertOverlay: Socket connected, attaching listeners');
        setSocketConnected(true);
        
        socket.on('system_alert', handleSystemAlert);
        socket.on('system_update', handleSystemUpdate);
        
        return true;
      }
      return false;
    };
    
    // Initial check
    if (checkSocket()) return;
    
    // Keep checking until connected
    const interval = setInterval(() => {
      if (checkSocket()) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => {
      clearInterval(interval);
      const socket = getSocket();
      if (socket) {
        socket.off('system_alert', handleSystemAlert);
        socket.off('system_update', handleSystemUpdate);
      }
    };
  }, [handleSystemAlert, handleSystemUpdate, socketConnected]);

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

  const getAlertConfig = (type) => {
    switch (type) {
      case 'warning':
        return {
          gradient: 'from-amber-500 to-orange-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-800',
          icon: AlertTriangle,
        };
      case 'error':
        return {
          gradient: 'from-red-500 to-rose-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          icon: XCircle,
        };
      case 'success':
        return {
          gradient: 'from-green-500 to-emerald-600',
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          icon: CheckCircle,
        };
      default:
        return {
          gradient: 'from-blue-500 to-indigo-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-800',
          icon: Info,
        };
    }
  };

  return (
    <>
      {/* System Update Overlay */}
      {updateCountdown !== null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" dir="rtl">
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

      {/* CENTER SCREEN ALERT - For realtime notifications */}
      {centerAlert && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg mx-4 overflow-hidden animate-fade-in">
            {/* Header with gradient */}
            {(() => {
              const config = getAlertConfig(centerAlert.type);
              const Icon = config.icon;
              return (
                <>
                  <div className={`bg-gradient-to-r ${config.gradient} p-6 text-white text-center`}>
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold">{centerAlert.title}</h2>
                  </div>
                  
                  <div className="p-6">
                    <p className="text-gray-700 text-center text-lg leading-relaxed">
                      {centerAlert.message}
                    </p>
                    
                    <div className="mt-6 flex justify-center">
                      <button
                        onClick={() => setCenterAlert(null)}
                        className={`px-8 py-3 bg-gradient-to-r ${config.gradient} text-white rounded-xl font-medium hover:shadow-lg transition-all`}
                      >
                        הבנתי
                      </button>
                    </div>
                    
                    {centerAlert.autoDismiss && (
                      <p className="text-center text-sm text-gray-400 mt-4">
                        ההודעה תיסגר אוטומטית
                      </p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
