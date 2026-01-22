import { useState, useEffect } from 'react';
import { AlertTriangle, Info, RefreshCw, CheckCircle, XCircle, Sparkles, Bell, X } from 'lucide-react';
import { onSystemAlert } from '../../services/socket';

export default function SystemAlertOverlay() {
  const [centerAlert, setCenterAlert] = useState(null);
  const [updateCountdown, setUpdateCountdown] = useState(null);
  const [dismissTimer, setDismissTimer] = useState(null);

  useEffect(() => {
    console.log('📢 SystemAlertOverlay: Registering alert listener');
    
    const unsubscribe = onSystemAlert((data) => {
      console.log('📢 SystemAlertOverlay: Received alert!', data);
      
      if (data.isUpdate) {
        console.log('🔄 Setting update countdown:', data.countdown);
        setUpdateCountdown(data.countdown || 10);
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

  // Countdown timer for system update
  useEffect(() => {
    if (updateCountdown === null) return;
    
    if (updateCountdown <= 0) {
      setUpdateCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setUpdateCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [updateCountdown]);

  // Auto-dismiss timer for alerts
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
      {/* System Update Overlay */}
      {updateCountdown !== null && (
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
          
          <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-10 max-w-md mx-4 text-center border border-white/20 shadow-2xl animate-scale-in">
            {/* Spinning icon */}
            <div className="relative mx-auto mb-8">
              <div className="w-28 h-28 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/40 animate-pulse-slow">
                <RefreshCw className="w-14 h-14 text-white animate-spin" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center animate-bounce">
                <Sparkles className="w-4 h-4 text-amber-800" />
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-4">
              עדכון מערכת
            </h2>
            <p className="text-white/70 mb-8 text-lg">
              אנחנו משפרים את המערכת עבורך
              <br />
              <span className="text-white/50 text-sm">העמוד יתרענן אוטומטית</span>
            </p>
            
            {/* Countdown circle */}
            <div className="relative w-32 h-32 mx-auto mb-8">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="url(#gradient)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(updateCountdown / 10) * 352} 352`}
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold text-white">{updateCountdown}</span>
                <span className="text-white/50 text-sm">שניות</span>
              </div>
            </div>
            
            <div className="p-4 bg-amber-500/20 rounded-2xl border border-amber-500/30">
              <p className="text-amber-200 flex items-center justify-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4" />
                אנא שמור את העבודה שלך ואל תסגור את הדפדפן
              </p>
            </div>
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
