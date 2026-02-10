import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  MessageCircle, Workflow, Users, Settings, Bot, MessageSquare, 
  TrendingUp, Shield, ChevronLeft, Zap, Activity, 
  Plus, ArrowUpRight, Clock, CheckCircle, Crown, Bell,
  Sparkles, ArrowRight, BarChart3, Calendar, Phone, Star,
  Target, Rocket, Gift, AlertCircle, X, ExternalLink, Lightbulb,
  Gauge, HardDrive, Code, Forward, Send
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useWhatsappStore from '../store/whatsappStore';
import useStatsStore from '../store/statsStore';
import Logo from '../components/atoms/Logo';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
import { Copy, Share2 } from 'lucide-react';
import ReferralBonusBanner from '../components/ReferralBonusBanner';
import api from '../services/api';

// Tips content data
const TIPS_DATA = {
  'create-bot': {
    icon: Bot,
    title: 'יצירת בוט ראשון',
    color: 'blue',
    content: [
      {
        title: '1. התחל עם טריגר',
        description: 'כל בוט מתחיל בטריגר - מילה או ביטוי שמפעיל את הבוט. בחר מילה פשוטה וקלה לזכור.'
      },
      {
        title: '2. הוסף הודעת פתיחה',
        description: 'צור הודעה ראשונה שתישלח ללקוח. היא צריכה להיות ברורה ולהסביר מה הבוט יכול לעזור.'
      },
      {
        title: '3. הוסף כפתורים או אפשרויות',
        description: 'תן ללקוחות אפשרויות לבחור. כפתורים מגדילים את אחוזי התגובה משמעותית.'
      },
      {
        title: '4. בדוק ופרסם',
        description: 'השתמש בתצוגה מקדימה כדי לבדוק את הבוט לפני הפעלתו.'
      }
    ],
    tips: ['התחל עם בוט פשוט', 'הוסף תמונות להודעות', 'תן תמיד אפשרות לדבר עם נציג']
  },
  'conditions': {
    icon: Workflow,
    title: 'שימוש בתנאים ומשתנים',
    color: 'indigo',
    content: [
      {
        title: 'מה זה משתנה?',
        description: 'משתנה הוא מידע ששומרים על הלקוח - כמו שם, עיר, או העדפות. אפשר להשתמש בו להתאמה אישית.'
      },
      {
        title: 'יצירת תנאי',
        description: 'תנאי מאפשר לשלוח הודעות שונות ללקוחות שונים. למשל: אם הלקוח מתל אביב - שלח הודעה X.'
      },
      {
        title: 'שימוש במשתנים בהודעות',
        description: 'הוסף {{name}} להודעה כדי לפנות ללקוח בשמו. זה מגדיל מעורבות!'
      }
    ],
    tips: ['שמור מידע חשוב כמשתנים', 'השתמש בתנאים לסגמנטציה', 'בדוק את הלוגיקה לפני פרסום']
  },
  'messages': {
    icon: MessageSquare,
    title: 'הודעות שמניבות תגובות',
    color: 'green',
    content: [
      {
        title: 'היה קצר וממוקד',
        description: 'הודעות קצרות מקבלות יותר תגובות. הגבל כל הודעה ל-2-3 משפטים.'
      },
      {
        title: 'השתמש באימוג\'י',
        description: 'אימוג\'י מוסיפים צבע וחמימות להודעות. אל תגזים - 1-2 לכל הודעה.'
      },
      {
        title: 'צור דחיפות',
        description: 'מילים כמו "עכשיו", "מוגבל", "בלעדי" מעודדות פעולה מהירה.'
      },
      {
        title: 'שאל שאלות',
        description: 'שאלות מזמינות תגובה. "מה מעניין אותך?" עדיף על "הנה הקטלוג שלנו".'
      }
    ],
    tips: ['בדוק A/B על הודעות שונות', 'הוסף תמונות ווידאו', 'תזמן הודעות לשעות אופטימליות']
  },
  'contacts': {
    icon: Users,
    title: 'ניהול אנשי קשר',
    color: 'cyan',
    content: [
      {
        title: 'תייג את הלקוחות',
        description: 'תגים עוזרים לסנן ולמצוא לקוחות. צור תגים כמו "VIP", "מתעניין", "לקוח קיים".'
      },
      {
        title: 'צפה בהיסטוריה',
        description: 'כל שיחה עם לקוח נשמרת. צפה בהודעות קודמות כדי להבין את ההקשר.'
      },
      {
        title: 'ייצא נתונים',
        description: 'ייצא את רשימת אנשי הקשר ל-Excel לגיבוי או לניתוח נוסף.'
      }
    ],
    tips: ['עדכן תגים באופן קבוע', 'מחק אנשי קשר לא רלוונטיים', 'השתמש בחיפוש למציאה מהירה']
  },
  'stats': {
    icon: BarChart3,
    title: 'קריאת סטטיסטיקות',
    color: 'purple',
    content: [
      {
        title: 'הודעות נכנסות vs יוצאות',
        description: 'עקוב אחרי היחס. אם יש יותר יוצאות מנכנסות - כנראה שאתה שולח יותר מדי.'
      },
      {
        title: 'אחוזי מעורבות',
        description: 'כמה לקוחות מגיבים? אחוז מעל 30% נחשב טוב לבוטים.'
      },
      {
        title: 'שעות פעילות',
        description: 'מתי הלקוחות הכי פעילים? תזמן הודעות לשעות האלה.'
      }
    ],
    tips: ['בדוק סטטיסטיקות שבועית', 'השווה בין תקופות', 'התמקד במגמות, לא במספרים בודדים']
  },
  'automation': {
    icon: Zap,
    title: 'אוטומציות מתקדמות',
    color: 'amber',
    content: [
      {
        title: 'תגובות אוטומטיות',
        description: 'הגדר תגובות לשאלות נפוצות. חסוך זמן ותן מענה מיידי 24/7.'
      },
      {
        title: 'רצפי הודעות',
        description: 'צור סדרה של הודעות שנשלחות באופן אוטומטי לאורך זמן.'
      },
      {
        title: 'טריגרים חכמים',
        description: 'הפעל בוטים על בסיס מילות מפתח, זמן, או פעולות של הלקוח.'
      }
    ],
    tips: ['התחל עם אוטומציה אחת פשוטה', 'בדוק שהבוט לא נתקע', 'תן תמיד אפשרות יציאה']
  }
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, fetchMe } = useAuthStore();
  const { connection, fetchStatus } = useWhatsappStore();
  const { stats, activity, fetchDashboardStats } = useStatsStore();
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [showMessage, setShowMessage] = useState(location.state?.message || null);
  const [selectedTip, setSelectedTip] = useState(null);
  const [usage, setUsage] = useState(null);
  const [viewingAs, setViewingAs] = useState(null);
  const [setupDismissed, setSetupDismissed] = useState(() => localStorage.getItem('setupDismissed') === 'true');
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    // Check if viewing another account
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.viewingAs) {
        setViewingAs({
          originalUserId: payload.viewingAs,
          accessType: payload.accessType
        });
      }
    } catch (e) {}
    
    fetchMe();
    fetchStatus();
    fetchDashboardStats();
    loadUsage();
    
    // Set greeting based on time
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('בוקר טוב');
    else if (hour < 17) setGreeting('צהריים טובים');
    else if (hour < 21) setGreeting('ערב טוב');
    else setGreeting('לילה טוב');
    
    // Update time
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    // Clear message after showing
    if (location.state?.message) {
      setTimeout(() => setShowMessage(null), 5000);
      window.history.replaceState({}, document.title);
    }
    
    return () => clearInterval(interval);
  }, []);

  const loadUsage = async () => {
    try {
      const { data } = await api.get('/subscriptions/my/usage');
      setUsage(data);
      
      // Check usage alerts
      await api.post('/notifications/check-usage');
    } catch (e) {
      console.error('Failed to load usage:', e);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isConnected = connection?.status === 'connected';
  const completedSteps = [
    isConnected,
    stats?.activeBots > 0,
    stats?.totalContacts > 0
  ].filter(Boolean).length;
  const totalSteps = 3;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const allStepsCompleted = completedSteps === totalSteps;

  // Auto-dismiss setup steps when all completed
  useEffect(() => {
    if (allStepsCompleted && !setupDismissed) {
      setShowCompletionMessage(true);
      const timer = setTimeout(() => {
        setShowCompletionMessage(false);
        setSetupDismissed(true);
        localStorage.setItem('setupDismissed', 'true');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [allStepsCompleted, setupDismissed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50" dir="rtl">
      {/* Viewing As Banner */}
      {viewingAs && (
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white py-2 px-4 text-center text-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
            <span>אתה צופה בחשבון של {user?.name || user?.email}</span>
            <button
              onClick={() => {
                const originalToken = localStorage.getItem('originalAccessToken');
                if (originalToken) {
                  localStorage.setItem('accessToken', originalToken);
                  localStorage.removeItem('originalAccessToken');
                  window.location.reload();
                }
              }}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-medium"
            >
              חזור לחשבון שלי
            </button>
          </div>
        </div>
      )}
      
      {/* Referral Bonus Banner */}
      <ReferralBonusBanner />
      
      {/* Success/Error Message Toast */}
      {showMessage && (
        <div className={`fixed top-4 right-4 left-4 md:left-auto md:w-96 z-50 animate-slide-down`}>
          <div className={`flex items-center gap-3 p-4 rounded-2xl shadow-lg ${
            location.state?.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}>
            {location.state?.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="flex-1">{showMessage}</span>
            <button onClick={() => setShowMessage(null)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="hidden md:block h-8 w-px bg-gray-200" />
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                <span>{currentTime}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <NotificationsDropdown />
              
              <div className="h-8 w-px bg-gray-200" />
              
              <AccountSwitcher />
              
              <button 
                onClick={handleLogout}
                className="px-3 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all text-sm"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Welcome Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white/70">{greeting},</span>
                <Sparkles className="w-5 h-5 text-yellow-300" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                {user?.name || 'משתמש'}!
              </h1>
              <p className="text-white/70 max-w-md">
                {isConnected 
                  ? 'הבוטים שלך פעילים ומוכנים לעבודה. בוא נראה מה קורה היום.'
                  : 'חבר את WhatsApp שלך כדי להתחיל להשתמש בבוטים.'
                }
              </p>
            </div>
            
            {/* Quick Stats in Hero */}
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur rounded-2xl px-6 py-4 text-center">
                <div className="text-3xl font-bold text-white">{stats?.todayMessages || 0}</div>
                <div className="text-white/70 text-sm">הודעות היום</div>
              </div>
              <div className="bg-white/20 backdrop-blur rounded-2xl px-6 py-4 text-center">
                <div className="text-3xl font-bold text-white">{stats?.totalContacts || 0}</div>
                <div className="text-white/70 text-sm">אנשי קשר</div>
              </div>
            </div>
          </div>
          
          {/* Progress Bar - hide when all steps completed and dismissed */}
          {!(allStepsCompleted && setupDismissed) && (
            <div className="relative z-10 mt-6 pt-6 border-t border-white/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70 text-sm">התקדמות ההגדרה</span>
                <span className="text-white font-medium">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    progressPercent >= 100 
                      ? 'bg-gradient-to-r from-green-400 to-emerald-400' 
                      : 'bg-gradient-to-r from-yellow-400 to-orange-400'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* WhatsApp Connection Card - full width when setup is dismissed */}
          <div className={allStepsCompleted && setupDismissed ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <Link to="/whatsapp" className="block group">
              <div className={`relative overflow-hidden rounded-2xl p-6 transition-all hover:shadow-2xl ${
                isConnected 
                  ? 'bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600' 
                  : 'bg-gradient-to-br from-amber-400 via-orange-500 to-red-500'
              }`}>
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                        <MessageCircle className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white mb-1">WhatsApp Business</h3>
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-white animate-pulse' : 'bg-white/50'}`} />
                          <span className="text-white/90 text-lg">
                            {isConnected ? 'מחובר ופעיל' : 'לא מחובר'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-white/20 rounded-xl group-hover:bg-white/30 transition-colors">
                      <ArrowRight className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  
                  {isConnected ? (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
                        <Phone className="w-5 h-5 text-white mx-auto mb-1" />
                        <p className="text-white/80 text-xs">מספר</p>
                        <p className="text-white font-medium text-sm">{connection.phone_number || 'לא זמין'}</p>
                      </div>
                      <div className="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
                        <MessageSquare className="w-5 h-5 text-white mx-auto mb-1" />
                        <p className="text-white/80 text-xs">הודעות היום</p>
                        <p className="text-white font-medium text-sm">{stats?.todayMessages || 0}</p>
                      </div>
                      <div className="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
                        <Users className="w-5 h-5 text-white mx-auto mb-1" />
                        <p className="text-white/80 text-xs">אנשי קשר</p>
                        <p className="text-white font-medium text-sm">{stats?.totalContacts || 0}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/20 backdrop-blur rounded-xl p-4 flex items-center gap-4">
                      <AlertCircle className="w-6 h-6 text-white" />
                      <div>
                        <p className="text-white font-medium">נדרש חיבור</p>
                        <p className="text-white/80 text-sm">לחץ כאן לסריקת קוד QR וחיבור WhatsApp</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Decorations */}
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute -bottom-10 -right-10 w-60 h-60 bg-white/10 rounded-full blur-3xl" />
              </div>
            </Link>
          </div>
          
          {/* Getting Started Card - hide when all steps completed and dismissed */}
          {allStepsCompleted && setupDismissed ? null : showCompletionMessage ? (
            <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-green-800 mb-2">כל ההגדרות הושלמו!</h3>
                <p className="text-green-600 text-sm">המערכת מוכנה לעבודה</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-5 h-5 text-amber-500" />
                  צעדים ראשונים
                </h3>
              </div>
              <div className="p-4 space-y-2">
                <SetupStep 
                  completed={isConnected}
                  number={1}
                  text="חבר את WhatsApp שלך"
                  link="/whatsapp"
                />
                <SetupStep 
                  completed={stats?.activeBots > 0}
                  number={2}
                  text="צור את הבוט הראשון"
                  link="/bots"
                />
                <SetupStep 
                  completed={stats?.totalContacts > 0}
                  number={3}
                  text="קבל את ההודעה הראשונה"
                  link="/contacts"
                />
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <Link 
                  to="/templates" 
                  className="flex items-center justify-between text-sm text-purple-600 hover:text-purple-700"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    גלריית תבניות בוטים מוכנות
                  </span>
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Usage Card */}
        {usage && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-indigo-600" />
                שימוש בחבילה החודשית
              </h3>
              {/* Hide upgrade link when all limits are unlimited */}
              {!(usage.limits?.max_bots === -1 && usage.limits?.max_contacts === -1 && usage.limits?.max_bot_runs_per_month === -1) && (
                <Link to="/pricing" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  שדרג חבילה
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              )}
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-3 gap-6">
                {/* Bot Runs */}
                <UsageBar
                  label="הרצות בוט החודש"
                  icon={Zap}
                  used={usage.usage?.bot_runs || 0}
                  limit={usage.limits?.max_bot_runs_per_month || 500}
                  color="indigo"
                />
                
                {/* Bots */}
                <UsageBar
                  label="בוטים"
                  icon={Bot}
                  used={usage.counts?.bots || 0}
                  limit={usage.limits?.max_bots || 1}
                  color="purple"
                />
                
                {/* Contacts */}
                <UsageBar
                  label="אנשי קשר"
                  icon={Users}
                  used={usage.counts?.contacts || 0}
                  limit={usage.limits?.max_contacts || 100}
                  color="blue"
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            icon={Users} 
            label="אנשי קשר" 
            value={stats?.totalContacts || 0}
            gradient="from-blue-500 to-cyan-500"
            bgColor="bg-blue-50"
            trend={stats?.contactsTrend}
          />
          <StatCard 
            icon={MessageSquare} 
            label="הודעות היום" 
            value={stats?.todayMessages || 0}
            gradient="from-green-500 to-emerald-500"
            bgColor="bg-green-50"
            trend={stats?.messageTrend}
          />
          <StatCard 
            icon={Zap} 
            label="הפעלות בוט החודש" 
            value={usage?.usage?.bot_runs || 0}
            gradient="from-purple-500 to-pink-500"
            bgColor="bg-purple-50"
          />
          <StatCard 
            icon={TrendingUp} 
            label="סה״כ הודעות" 
            value={stats?.totalMessages || 0}
            gradient="from-orange-500 to-red-500"
            bgColor="bg-orange-50"
          />
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">ניווט מהיר</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <QuickActionCard
              to="/bots"
              icon={Workflow}
              title="בוטים"
              description="יצירת וניהול אוטומציות"
              gradient="from-blue-500 to-indigo-600"
            />
            <QuickActionCard
              to="/group-forwards"
              icon={Forward}
              title="העברת הודעות"
              description="שליחה לקבוצות"
              gradient="from-cyan-500 to-blue-600"
            />
            <QuickActionCard
              to="/broadcasts"
              icon={Send}
              title="הודעות תפוצה"
              description="שליחה המונית"
              gradient="from-orange-500 to-red-600"
              badge="חדש"
            />
            <QuickActionCard
              to="/contacts"
              icon={Users}
              title="לייב צ'אט"
              description="צפייה בשיחות"
              gradient="from-emerald-500 to-teal-600"
            />
            <QuickActionCard
              to="/pricing"
              icon={Crown}
              title="תמחור"
              description="תכניות ומנויים"
              gradient="from-amber-500 to-orange-600"
            />
            <QuickActionCard
              to="/developers"
              icon={Code}
              title="API"
              description="גישת מפתחים"
              gradient="from-violet-500 to-purple-600"
            />
            <QuickActionCard
              to="/settings"
              icon={Settings}
              title="הגדרות"
              description="הגדרות החשבון"
              gradient="from-gray-500 to-slate-600"
            />
          </div>
        </div>

        {/* Activity & Tips Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Recent Activity - Recent Chats */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                שיחות אחרונות
              </h3>
              <Link to="/contacts" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                צפה בהכל
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-4">
              {activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.slice(0, 5).map((contact, i) => (
                    <Link 
                      key={contact.id || i} 
                      to={`/contacts?chat=${contact.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      {contact.profile_picture_url ? (
                        <img 
                          src={contact.profile_picture_url} 
                          alt="" 
                          className="w-10 h-10 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                          {(contact.display_name || contact.phone_number || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {contact.display_name || contact.phone_number}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Phone className="w-3 h-3" />
                          <span dir="ltr">{contact.phone_number}</span>
                          <span className="text-gray-300">•</span>
                          <span>{contact.message_count} הודעות</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-gray-400">
                          {contact.last_message_at && new Date(contact.last_message_at).toLocaleDateString('he-IL')}
                        </p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-gray-400" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">אין שיחות אחרונות</p>
                  <p className="text-sm text-gray-400">שיחות חדשות יופיעו כאן</p>
                </div>
              )}
            </div>
          </div>

          {/* Tips & Resources - Expanded */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-purple-600" />
                טיפים ומשאבים
              </h3>
              <p className="text-sm text-gray-500 mt-1">לחץ על טיפ כדי ללמוד עוד</p>
            </div>
            <div className="p-4 space-y-3">
              <TipCard 
                icon={Bot}
                title="יצירת בוט ראשון"
                description="מדריך צעד אחר צעד ליצירת בוט אפקטיבי"
                color="blue"
                badge="מומלץ"
                onClick={() => setSelectedTip('create-bot')}
              />
              <TipCard 
                icon={Workflow}
                title="שימוש בתנאים ומשתנים"
                description="איך ליצור תהליכים חכמים ומותאמים אישית"
                color="indigo"
                onClick={() => setSelectedTip('conditions')}
              />
              <TipCard 
                icon={MessageSquare}
                title="הודעות שמניבות תגובות"
                description="טיפים לכתיבת הודעות שגורמות ללקוחות לפעול"
                color="green"
                onClick={() => setSelectedTip('messages')}
              />
              <TipCard 
                icon={Users}
                title="ניהול אנשי קשר"
                description="איך לסנן, לתייג ולנהל את הלקוחות שלך"
                color="cyan"
                onClick={() => setSelectedTip('contacts')}
              />
              <TipCard 
                icon={BarChart3}
                title="קריאת סטטיסטיקות"
                description="הבן את הנתונים ושפר את הביצועים"
                color="purple"
                onClick={() => setSelectedTip('stats')}
              />
              <TipCard 
                icon={Zap}
                title="אוטומציות מתקדמות"
                description="טריגרים, תגובות אוטומטיות ועוד"
                color="amber"
                badge="PRO"
                onClick={() => setSelectedTip('automation')}
              />
            </div>
          </div>
        </div>

        {/* Tip Modal */}
        {selectedTip && TIPS_DATA[selectedTip] && (
          <TipModal 
            tip={TIPS_DATA[selectedTip]} 
            onClose={() => setSelectedTip(null)} 
          />
        )}

        {/* Affiliate Quick Link */}
        <AffiliateQuickLink />

        {/* Subscription Expiring/Cancelled Warning Banner */}
        <SubscriptionWarningBanner subscription={user?.subscription} hasPaymentMethod={!!user?.subscription?.has_payment_method} />

        {/* Upgrade Banner - Only for users without paid subscription */}
        {user && (!user.subscription || user.subscription.plan?.price === 0 || user.subscription.plan?.price === '0') && (
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-2xl p-6 mb-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                  <Gift className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">שדרג לפרימיום</h3>
                  <p className="text-white/80">קבל גישה לכל הפיצ'רים המתקדמים</p>
                </div>
              </div>
              <Link 
                to="/pricing"
                className="px-6 py-3 bg-white text-purple-600 rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105"
              >
                צפה בתכניות
              </Link>
            </div>
          </div>
        )}

        {/* Admin Panel Link */}
        {user && ['admin', 'superadmin'].includes(user.role) && (
          <Link 
            to="/admin" 
            className="block bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 rounded-2xl p-5 hover:shadow-xl transition-all group"
          >
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-lg font-bold">ניהול מערכת</span>
                  <p className="text-white/80">פאנל אדמין</p>
                </div>
              </div>
              <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </div>
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, gradient, bgColor, trend }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            trend > 0 ? 'bg-green-100 text-green-700' : trend < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function QuickActionCard({ to, icon: Icon, title, description, gradient, badge }) {
  return (
    <Link to={to} className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-xl transition-all hover:-translate-y-1">
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
      {badge && (
        <span className="absolute top-4 left-4 px-2.5 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-lg">
          {badge}
        </span>
      )}
      <div className="absolute bottom-4 left-4 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowUpRight className="w-4 h-4 text-gray-600" />
      </div>
    </Link>
  );
}

function SetupStep({ completed, number, text, link }) {
  return (
    <Link 
      to={link}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        completed ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
        completed 
          ? 'bg-green-500 text-white' 
          : 'bg-gray-200 text-gray-500'
      }`}>
        {completed ? <CheckCircle className="w-5 h-5" /> : number}
      </div>
      <span className={`flex-1 ${completed ? 'text-green-700 line-through' : 'text-gray-700'}`}>
        {text}
      </span>
      <ChevronLeft className={`w-4 h-4 ${completed ? 'text-green-400' : 'text-gray-400'}`} />
    </Link>
  );
}

function TipCard({ icon: Icon, title, description, color, badge, onClick }) {
  const colors = {
    blue: 'from-blue-500 to-indigo-600',
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-green-500 to-emerald-600',
    cyan: 'from-cyan-500 to-blue-600',
    purple: 'from-purple-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
  };

  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group text-right"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{title}</p>
          {badge && (
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
              badge === 'PRO' 
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
    </button>
  );
}

function UsageBar({ label, icon: Icon, used, limit, color }) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
  
  const colorClasses = {
    indigo: {
      bg: 'bg-indigo-100',
      bar: 'bg-gradient-to-r from-indigo-500 to-purple-500',
      text: 'text-indigo-600',
      icon: 'from-indigo-100 to-purple-100'
    },
    purple: {
      bg: 'bg-purple-100',
      bar: 'bg-gradient-to-r from-purple-500 to-pink-500',
      text: 'text-purple-600',
      icon: 'from-purple-100 to-pink-100'
    },
    blue: {
      bg: 'bg-blue-100',
      bar: 'bg-gradient-to-r from-blue-500 to-cyan-500',
      text: 'text-blue-600',
      icon: 'from-blue-100 to-cyan-100'
    }
  };
  
  const colors = colorClasses[color] || colorClasses.indigo;
  
  // Determine bar color based on percentage - green at 100% (fully utilized is ok)
  const getBarColor = () => {
    if (percentage >= 100) return 'bg-gradient-to-r from-green-500 to-emerald-500';
    if (percentage >= 80) return colors.bar;
    return colors.bar;
  };

  return (
    <div className="bg-gray-50 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.icon} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-gray-500">
            {isUnlimited ? (
              <span className="text-green-600">ללא הגבלה ✓</span>
            ) : (
              <>
                <span className="font-bold text-gray-900">{used.toLocaleString()}</span>
                <span> / {limit.toLocaleString()}</span>
              </>
            )}
          </p>
        </div>
        {!isUnlimited && (
          <span className={`text-lg font-bold ${
            percentage >= 100 ? 'text-green-600' : 
            colors.text
          }`}>
            {percentage}%
          </span>
        )}
      </div>
      
      {!isUnlimited && (
        <div className={`h-3 ${colors.bg} rounded-full overflow-hidden`}>
          <div 
            className={`h-full ${getBarColor()} rounded-full transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      
      {percentage >= 100 && !isUnlimited && (
        <p className="text-xs mt-2 text-green-600">
          ✓ ניצולת מלאה של החבילה
        </p>
      )}
    </div>
  );
}

function TipModal({ tip, onClose }) {
  const Icon = tip.icon;
  const colors = {
    blue: 'from-blue-500 to-indigo-600',
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-green-500 to-emerald-600',
    cyan: 'from-cyan-500 to-blue-600',
    purple: 'from-purple-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${colors[tip.color]} p-6 text-white rounded-t-3xl`}>
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <Icon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{tip.title}</h2>
              <p className="text-white/70">מדריך מפורט</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Steps */}
          <div className="space-y-4">
            {tip.content.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${colors[tip.color]} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pro Tips */}
          {tip.tips && tip.tips.length > 0 && (
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                טיפים נוספים
              </h3>
              <ul className="space-y-2">
                {tip.tips.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-amber-900 text-sm">
                    <CheckCircle className="w-4 h-4 text-amber-600" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={onClose}
            className={`w-full py-4 bg-gradient-to-r ${colors[tip.color]} text-white rounded-xl font-bold hover:shadow-lg transition-all`}
          >
            הבנתי, תודה!
          </button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionWarningBanner({ subscription, hasPaymentMethod }) {
  const navigate = useNavigate();
  
  if (!subscription) return null;
  
  const status = subscription.status;
  const isTrial = subscription.is_trial || status === 'trial';
  const isCancelled = status === 'cancelled';
  
  // Get end date
  const endDateRaw = isTrial 
    ? subscription.trial_ends_at 
    : (subscription.expires_at || subscription.next_charge_date);
  
  if (!endDateRaw) return null;
  
  const endDate = new Date(endDateRaw);
  const now = new Date();
  const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
  
  // Don't show if more than 7 days left and not cancelled
  if (daysLeft > 7 && !isCancelled) return null;
  
  // Don't show if already expired
  if (daysLeft < 0) return null;
  
  const formattedDate = endDate.toLocaleDateString('he-IL', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Determine banner color and message based on status
  let bgGradient, iconBg, title, message;
  
  if (isCancelled) {
    bgGradient = 'from-red-500 to-rose-600';
    iconBg = 'bg-white/20';
    title = `⚠️ המנוי שלך בוטל - עוד ${daysLeft} ימים`;
    message = daysLeft === 0 
      ? `המנוי מסתיים היום (${formattedDate}) - הבוטים יושבתו ותצטרך לבחור אחד לשמור`
      : daysLeft === 1
        ? `המנוי מסתיים מחר (${formattedDate}) - הבוטים יושבתו ותצטרך לבחור אחד לשמור`
        : `המנוי מסתיים בעוד ${daysLeft} ימים (${formattedDate}) - לאחר מכן הבוטים יושבתו`;
  } else if (isTrial) {
    if (hasPaymentMethod && !isCancelled) {
      // Trial with payment method (not cancelled) - show positive message
      bgGradient = 'from-green-500 to-emerald-500';
      iconBg = 'bg-white/20';
      title = 'תקופת ניסיון פעילה 🎉';
      message = daysLeft === 0 
        ? `החיוב הראשון יבוצע היום (${formattedDate})`
        : daysLeft === 1
          ? `החיוב הראשון יבוצע מחר (${formattedDate})`
          : `החיוב הראשון יבוצע בעוד ${daysLeft} ימים (${formattedDate})`;
    } else if (daysLeft <= 3) {
      bgGradient = 'from-red-500 to-rose-500';
      iconBg = 'bg-white/20';
      title = 'תקופת הניסיון עומדת להסתיים!';
      message = daysLeft === 0 
        ? `תקופת הניסיון מסתיימת היום (${formattedDate})`
        : daysLeft === 1
          ? `תקופת הניסיון מסתיימת מחר (${formattedDate})`
          : `תקופת הניסיון מסתיימת בעוד ${daysLeft} ימים (${formattedDate})`;
    } else {
      bgGradient = 'from-blue-500 to-indigo-500';
      iconBg = 'bg-white/20';
      title = 'אתה בתקופת ניסיון';
      message = `תקופת הניסיון מסתיימת בעוד ${daysLeft} ימים (${formattedDate})`;
    }
  } else {
    // Active subscription expiring soon
    bgGradient = 'from-amber-500 to-orange-500';
    iconBg = 'bg-white/20';
    title = 'המנוי שלך עומד להסתיים';
    message = daysLeft === 0 
      ? `המנוי מסתיים היום (${formattedDate})`
      : daysLeft === 1
        ? `המנוי מסתיים מחר (${formattedDate})`
        : `המנוי מסתיים בעוד ${daysLeft} ימים (${formattedDate})`;
  }

  return (
    <div className={`bg-gradient-to-r ${bgGradient} rounded-2xl p-5 mb-6`}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 ${iconBg} backdrop-blur rounded-xl flex items-center justify-center`}>
            <AlertCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-white/90">{message}</p>
            {isCancelled && (
              <p className="text-white/80 text-sm mt-1 font-medium">
                💡 הוסף כרטיס אשראי וחדש את המנוי כדי להמשיך להשתמש בכל הבוטים
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isCancelled ? (
            <button
              onClick={() => navigate('/settings')}
              className="px-5 py-2.5 bg-white text-amber-600 rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105"
            >
              הוסף כרטיס וחדש מנוי
            </button>
          ) : (
            <button
              onClick={() => navigate('/pricing')}
              className="px-5 py-2.5 bg-white text-orange-600 rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105"
            >
              {isTrial ? 'שדרג עכשיו' : 'חדש מנוי'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AffiliateQuickLink() {
  const [affiliate, setAffiliate] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadAffiliate();
  }, []);

  const loadAffiliate = async () => {
    try {
      const { data } = await api.get('/payment/affiliate/my');
      setAffiliate(data);
    } catch (err) {
      // User doesn't have affiliate yet
    }
  };

  if (!affiliate?.affiliate?.ref_code) return null;

  const shareLink = `https://botomat.co.il/?ref=${affiliate.affiliate.ref_code}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-5 mb-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">תוכנית שותפים</h3>
            <p className="text-sm text-gray-600">הרווח נקודות על כל חבר שמצטרף דרכך</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1 md:flex-none flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-4 py-2.5">
            <input 
              type="text" 
              value={shareLink} 
              readOnly 
              className="bg-transparent text-sm text-gray-700 w-48 md:w-64 outline-none"
              dir="ltr"
            />
            <button
              onClick={copyLink}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>
          
          <Link 
            to="/settings?tab=affiliate"
            className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors text-sm whitespace-nowrap"
          >
            ניהול מלא
          </Link>
        </div>
      </div>
    </div>
  );
}
