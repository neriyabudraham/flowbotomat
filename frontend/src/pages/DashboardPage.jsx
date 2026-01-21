import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  MessageCircle, Workflow, Users, Settings, Bot, MessageSquare, 
  TrendingUp, Grid, Shield, ChevronLeft, Zap, Activity, 
  Plus, ArrowUpRight, Clock, CheckCircle, Crown, Bell,
  Sparkles, ArrowRight, BarChart3, Calendar, Phone, Star,
  Target, Rocket, Gift, AlertCircle, X, ExternalLink
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useWhatsappStore from '../store/whatsappStore';
import useStatsStore from '../store/statsStore';
import Logo from '../components/atoms/Logo';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, fetchMe } = useAuthStore();
  const { connection, fetchStatus } = useWhatsappStore();
  const { stats, activity, fetchDashboardStats } = useStatsStore();
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [showMessage, setShowMessage] = useState(location.state?.message || null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchStatus();
    fetchDashboardStats();
    
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50" dir="rtl">
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
              
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'משתמש'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                  {(user?.name || user?.email || 'U')[0].toUpperCase()}
                </div>
              </div>
              
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
                <div className="text-3xl font-bold text-white">{stats?.activeBots || 0}</div>
                <div className="text-white/70 text-sm">בוטים פעילים</div>
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="relative z-10 mt-6 pt-6 border-t border-white/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/70 text-sm">התקדמות ההגדרה</span>
              <span className="text-white font-medium">{progressPercent}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* WhatsApp Connection Card */}
          <div className="lg:col-span-2">
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
          
          {/* Getting Started Card */}
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
                  עיין בתבניות מוכנות
                </span>
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

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
            icon={Bot} 
            label="בוטים פעילים" 
            value={stats?.activeBots || 0}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <QuickActionCard
              to="/bots"
              icon={Workflow}
              title="בוטים"
              description="יצירת וניהול אוטומציות"
              gradient="from-blue-500 to-indigo-600"
            />
            <QuickActionCard
              to="/templates"
              icon={Grid}
              title="תבניות"
              description="גלריית בוטים מוכנים"
              gradient="from-purple-500 to-pink-600"
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
          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                פעילות אחרונה
              </h3>
              <Link to="/contacts" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                צפה בהכל
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-4">
              {activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.label || item.name}</p>
                        <p className="text-sm text-gray-500">{item.count || item.value} הודעות</p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-gray-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">אין פעילות אחרונה</p>
                  <p className="text-sm text-gray-400">הודעות חדשות יופיעו כאן</p>
                </div>
              )}
            </div>
          </div>

          {/* Tips & Resources */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-purple-600" />
                טיפים ומשאבים
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <TipCard 
                icon={Bot}
                title="איך ליצור בוט אפקטיבי?"
                description="למד את הטכניקות הטובות ביותר ליצירת בוטים"
                color="blue"
              />
              <TipCard 
                icon={MessageSquare}
                title="תבניות הודעות מומלצות"
                description="הודעות שמניבות תגובות גבוהות"
                color="green"
              />
              <TipCard 
                icon={BarChart3}
                title="הבן את הסטטיסטיקות"
                description="איך לקרוא ולנתח את הנתונים"
                color="purple"
              />
            </div>
          </div>
        </div>

        {/* Upgrade Banner (for free users) */}
        {user && !user.subscription?.plan_id && (
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

function TipCard({ icon: Icon, title, description, color }) {
  const colors = {
    blue: 'from-blue-500 to-indigo-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-pink-600',
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <ChevronLeft className="w-4 h-4 text-gray-400" />
    </div>
  );
}
