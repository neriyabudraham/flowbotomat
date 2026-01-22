import { useState, useEffect } from 'react';
import { AlertTriangle, Info, RefreshCw, CheckCircle, XCircle, Sparkles, Bell, X, Clock } from 'lucide-react';
import { onSystemAlert } from '../../services/socket';

export default function SystemAlertOverlay() {
  const [centerAlert, setCenterAlert] = useState(null);
  const [dismissTimer, setDismissTimer] = useState(null);
  
  // System update states
  const [updateAlert, setUpdateAlert] = useState(null); // Full screen alert
  const [updateCountdown, setUpdateCountdown] = useState(null); // Top banner countdown
  const [acknowledged, setAcknowledged] = useState(false); // User clicked "הבנתי"

  useEffect(() => {
    console.log('📢 SystemAlertOverlay: Registering alert listener');
    
    const unsubscribe = onSystemAlert((data) => {
      console.log('📢 SystemAlertOverlay: Received alert!', data);
      
      if (data.isUpdate) {
        console.log('🔄 System update alert received');
        // Show full screen alert with 30 second countdown
        setUpdateAlert(data);
        setUpdateCountdown(30);
        setAcknowledged(false);
      } else {
        console.log('📢 Setting center alert:', data.title);
        setCenterAlert({
          ...data,
          id: Date.now()
        });
        
        if (data.autoDismiss) {
          setDismissTimer(15);
        }
      }
    });
    
    return () => {
      console.log('📢 SystemAlertOverlay: Unregistering alert listener');
      unsubscribe();
    };
  }, []);

  // Countdown timer for system update (continues to -30 for "updating now" phase)
  useEffect(() => {
    if (updateCountdown === null) return;
    
    // Stop at -30 (60 seconds total from start)
    if (updateCountdown <= -30) {
      setUpdateAlert(null);
      setUpdateCountdown(null);
      setAcknowledged(false);
      return;
    }

    const timer = setTimeout(() => {
      setUpdateCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [updateCountdown]);

  // Auto-dismiss timer for regular alerts
  useEffect(() => {
    if (dismissTimer === null) return;
    
    if (dismissTimer <= 0) {
      setCenterAlert(null);
      setDismissTimer(null);
      return;
    }

    const timer = setTimeout(() => {
      setDismissTimer(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [dismissTimer]);

  // Handle acknowledge button
  const handleAcknowledge = () => {
    setAcknowledged(true);
    setUpdateAlert(null); // Close full screen, keep banner
  };

  const getAlertConfig = (type) => {
    switch (type) {
      case 'warning':
        return {
          gradient: 'from-amber-400 via-orange-500 to-red-500',
          glow: 'shadow-orange-500/30',
          iconBg: 'bg-orange-500',
          icon: AlertTriangle,
          emoji: '⚠️'
        };
      case 'error':
        return {
          gradient: 'from-red-500 via-rose-500 to-pink-500',
          glow: 'shadow-red-500/30',
          iconBg: 'bg-red-500',
          icon: XCircle,
          emoji: '❌'
        };
      case 'success':
        return {
          gradient: 'from-emerald-400 via-green-500 to-teal-500',
          glow: 'shadow-green-500/30',
          iconBg: 'bg-green-500',
          icon: CheckCircle,
          emoji: '✅'
        };
      default:
        return {
          gradient: 'from-blue-400 via-indigo-500 to-purple-500',
          glow: 'shadow-indigo-500/30',
          iconBg: 'bg-indigo-500',
          icon: Info,
          emoji: '💡'
        };
    }
  };

  return (
    <>
      {/* TOP BANNER - Shows countdown after user acknowledges */}
      {updateCountdown !== null && acknowledged && (
        <div className="fixed top-0 left-0 right-0 z-[9999] animate-slide-down" dir="rtl">
          <div className={`${updateCountdown <= 0 ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600' : 'bg-gradient-to-r from-amber-600 via-orange-600 to-red-600'} text-white py-4 px-4 shadow-lg`}>
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  {updateCountdown <= 0 ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  )}
                </div>
                <div>
                  {updateCountdown <= 0 ? (
                    <>
                      <p className="font-bold">מתעדכן עכשיו...</p>
                      <p className="text-white/80 text-sm">העדכון מתבצע כעת, העמוד יתרענן אוטומטית</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold">עדכון מערכת בדקה הקרובה</p>
                      <p className="text-white/80 text-sm">יש להמתין לסיום העדכון - אין לבצע פעולות</p>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {updateCountdown <= 0 ? (
                  <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl">
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                    <span className="font-bold">מעדכן...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl">
                    <Clock className="w-5 h-5" />
                    <span className="text-2xl font-bold tabular-nums">{updateCountdown}</span>
                    <span className="text-sm">שניות</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN UPDATE ALERT - Before user acknowledges OR when updating */}
      {updateAlert && !acknowledged && updateCountdown > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" dir="rtl">
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-indigo-900/90 to-slate-900/95 backdrop-blur-md" />
          
          {/* Floating particles effect */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white/20 rounded-full animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${3 + Math.random() * 4}s`
                }}
              />
            ))}
          </div>
          
          <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-10 max-w-lg mx-4 text-center border border-white/20 shadow-2xl animate-scale-in">
            {/* Icon */}
            <div className="relative mx-auto mb-8">
              <div className="w-28 h-28 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-500/40">
                <AlertTriangle className="w-14 h-14 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-4">
              עדכון מערכת בדקה הקרובה
            </h2>
            <p className="text-white/80 mb-6 text-lg leading-relaxed">
              האתר יתעדכן לגרסה חדשה בדקה הקרובה.
              <br />
              <span className="text-amber-300 font-semibold">יש לשמור את העבודה ולהמתין לסיום העדכון.</span>
            </p>
            
            {/* Warning box */}
            <div className="bg-red-500/20 border border-red-500/40 rounded-2xl p-4 mb-6">
              <p className="text-red-200 text-sm flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                אין להמשיך לעבוד עד לסיום העדכון
              </p>
            </div>
            
            {/* Countdown display */}
            <div className="bg-white/10 rounded-2xl p-6 mb-8">
              <p className="text-white/60 text-sm mb-2">העדכון יתחיל בעוד</p>
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-8 h-8 text-amber-400" />
                <span className="text-5xl font-bold text-white tabular-nums">{updateCountdown}</span>
                <span className="text-white/60 text-lg">שניות</span>
              </div>
              
              {/* Progress bar */}
              <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000"
                  style={{ width: `${(updateCountdown / 30) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Acknowledge button */}
            <button
              onClick={handleAcknowledge}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-2xl font-bold text-lg hover:shadow-lg hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <CheckCircle className="w-5 h-5 inline-block ml-2" />
              הבנתי, שמרתי את העבודה
            </button>
            
            <p className="text-white/40 text-sm mt-4">
              לאחר לחיצה ההודעה תיסגר, אך יש להמתין לסיום העדכון
            </p>
          </div>
        </div>
      )}

      {/* FULL SCREEN "UPDATING NOW" - When countdown reaches 0 and user didn't acknowledge */}
      {updateAlert && !acknowledged && updateCountdown !== null && updateCountdown <= 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" dir="rtl">
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-indigo-900/90 to-slate-900/95 backdrop-blur-md" />
          
          {/* Floating particles effect */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white/20 rounded-full animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${3 + Math.random() * 4}s`
                }}
              />
            ))}
          </div>
          
          <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-10 max-w-lg mx-4 text-center border border-white/20 shadow-2xl animate-scale-in">
            {/* Spinning icon */}
            <div className="relative mx-auto mb-8">
              <div className="w-28 h-28 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/40">
                <RefreshCw className="w-14 h-14 text-white animate-spin" />
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-4">
              מתעדכן עכשיו...
            </h2>
            <p className="text-white/80 mb-8 text-lg leading-relaxed">
              המערכת מתעדכנת כעת לגרסה חדשה.
              <br />
              <span className="text-indigo-300">העמוד יתרענן אוטומטית בסיום.</span>
            </p>
            
            {/* Loading indicator */}
            <div className="flex items-center justify-center gap-3 bg-white/10 rounded-2xl p-6">
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-white/70">אנא המתן...</span>
            </div>
            
            <p className="text-white/40 text-sm mt-6">
              אל תסגור את הדפדפן
            </p>
          </div>
        </div>
      )}

      {/* CENTER SCREEN ALERT - Beautiful popup */}
      {centerAlert && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" dir="rtl">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setCenterAlert(null)}
          />
          
          {(() => {
            const config = getAlertConfig(centerAlert.type);
            const Icon = config.icon;
            
            return (
              <div className={`relative bg-white rounded-3xl shadow-2xl ${config.glow} shadow-xl max-w-md w-full overflow-hidden animate-scale-in`}>
                {/* Gradient header */}
                <div className={`bg-gradient-to-r ${config.gradient} p-8 relative overflow-hidden`}>
                  {/* Decorative circles */}
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
                  <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full" />
                  
                  {/* Close button */}
                  <button
                    onClick={() => setCenterAlert(null)}
                    className="absolute top-4 left-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  
                  {/* Icon */}
                  <div className="relative">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <Icon className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white text-center">
                      {centerAlert.title}
                    </h2>
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-8">
                  <p className="text-gray-600 text-center text-lg leading-relaxed mb-8">
                    {centerAlert.message}
                  </p>
                  
                  {/* Button */}
                  <button
                    onClick={() => {
                      setCenterAlert(null);
                      setDismissTimer(null);
                    }}
                    className={`w-full py-4 bg-gradient-to-r ${config.gradient} text-white rounded-2xl font-bold text-lg hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200`}
                  >
                    הבנתי
                  </button>
                  
                  {/* Auto-dismiss countdown */}
                  {dismissTimer && (
                    <div className="mt-4 text-center">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                        <span className="text-sm text-gray-500">
                          נסגר אוטומטית בעוד {dismissTimer} שניות
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 1; }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-slide-down {
          animation: slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-float {
          animation: float 5s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
