import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  MessageCircle, Workflow, Users, Settings, Bot, MessageSquare, 
  TrendingUp, Grid, Shield, ChevronLeft, Zap, Activity, 
  Plus, ArrowUpRight, Clock, CheckCircle, Crown
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useWhatsappStore from '../store/whatsappStore';
import useStatsStore from '../store/statsStore';
import Logo from '../components/atoms/Logo';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const { connection, fetchStatus } = useWhatsappStore();
  const { stats, activity, fetchDashboardStats } = useStatsStore();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchStatus();
    fetchDashboardStats();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isConnected = connection?.status === 'connected';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-gray-600 hidden sm:block">
              שלום, <span className="font-medium text-gray-900">{user?.name || user?.email}</span>
            </span>
            <button 
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-600 transition-colors text-sm"
            >
              התנתק
            </button>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            ברוך הבא ל-FlowBotomat
          </h1>
          <p className="text-gray-500">
            נהל את הבוטים והאוטומציות שלך בקלות
          </p>
        </div>

        {/* WhatsApp Status - Hero Card */}
        <Link to="/whatsapp" className="block mb-6">
          <div className={`relative overflow-hidden rounded-2xl p-6 transition-all hover:shadow-xl ${
            isConnected 
              ? 'bg-gradient-to-l from-green-500 to-emerald-600' 
              : 'bg-gradient-to-l from-orange-400 to-amber-500'
          }`}>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">WhatsApp</h3>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-white' : 'bg-white/60'} animate-pulse`} />
                    <span className="text-white/90">
                      {isConnected 
                        ? `מחובר${connection.phone_number ? ` - ${connection.phone_number}` : ''}`
                        : 'לא מחובר - לחץ לחיבור'
                      }
                    </span>
                  </div>
                </div>
              </div>
              <ChevronLeft className="w-6 h-6 text-white/80" />
            </div>
            {/* Background decoration */}
            <div className="absolute -top-8 -left-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          </div>
        </Link>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard 
            icon={Users} 
            label="אנשי קשר" 
            value={stats?.totalContacts || 0}
            color="blue"
            trend={stats?.contactsTrend}
          />
          <StatCard 
            icon={MessageSquare} 
            label="הודעות היום" 
            value={stats?.todayMessages || 0}
            color="green"
            trend={stats?.messageTrend}
          />
          <StatCard 
            icon={Bot} 
            label="בוטים פעילים" 
            value={stats?.activeBots || 0}
            color="purple"
          />
          <StatCard 
            icon={TrendingUp} 
            label="סה״כ הודעות" 
            value={stats?.totalMessages || 0}
            color="orange"
          />
        </div>

        {/* Quick Actions Grid */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">פעולות מהירות</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <QuickActionCard
              to="/bots"
              icon={Workflow}
              title="בוטים"
              description="יצירת וניהול אוטומציות"
              color="blue"
            />
            <QuickActionCard
              to="/templates"
              icon={Grid}
              title="תבניות"
              description="גלריית בוטים מוכנים"
              color="purple"
              badge="חדש"
            />
            <QuickActionCard
              to="/contacts"
              icon={Users}
              title="אנשי קשר"
              description="צפייה בצ'אטים"
              color="emerald"
            />
            <QuickActionCard
              to="/pricing"
              icon={Crown}
              title="תמחור"
              description="תכניות ומנויים"
              color="amber"
            />
            <QuickActionCard
              to="/settings"
              icon={Settings}
              title="הגדרות"
              description="הגדרות החשבון"
              color="gray"
            />
          </div>
        </div>

        {/* Recent Activity & Tips */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                פעילות אחרונה
              </h3>
              <Link to="/contacts" className="text-sm text-blue-600 hover:text-blue-700">
                צפה בהכל
              </Link>
            </div>
            {activity && activity.length > 0 ? (
              <div className="space-y-3">
                {activity.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.label || item.name}</p>
                      <p className="text-xs text-gray-500">{item.count || item.value} הודעות</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>אין פעילות אחרונה</p>
              </div>
            )}
          </div>

          {/* Getting Started Tips */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-amber-500" />
              צעדים ראשונים
            </h3>
            <div className="space-y-3">
              <TipItem 
                completed={isConnected}
                text="חבר את WhatsApp שלך"
                link="/whatsapp"
              />
              <TipItem 
                completed={stats?.activeBots > 0}
                text="צור את הבוט הראשון שלך"
                link="/bots"
              />
              <TipItem 
                completed={stats?.totalContacts > 0}
                text="קבל את ההודעה הראשונה"
                link="/contacts"
              />
              <TipItem 
                completed={false}
                text="בדוק את התבניות המוכנות"
                link="/templates"
              />
            </div>
          </div>
        </div>

        {/* Admin Panel Link */}
        {user && ['admin', 'superadmin'].includes(user.role) && (
          <Link 
            to="/admin" 
            className="mt-6 block bg-gradient-to-l from-red-500 to-rose-600 rounded-2xl p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6" />
                <div>
                  <span className="font-semibold">ניהול מערכת</span>
                  <p className="text-sm text-white/80">פאנל אדמין</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5" />
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, trend }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            trend > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function QuickActionCard({ to, icon: Icon, title, description, color, badge }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    gray: 'from-gray-500 to-gray-600',
  };

  return (
    <Link to={to} className="group relative bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg transition-all hover:-translate-y-0.5">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
      {badge && (
        <span className="absolute top-3 left-3 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
          {badge}
        </span>
      )}
      <ArrowUpRight className="absolute bottom-4 left-4 w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
    </Link>
  );
}

function TipItem({ completed, text, link }) {
  return (
    <Link 
      to={link}
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
        completed ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'
      }`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
        completed ? 'bg-green-500' : 'bg-gray-200'
      }`}>
        {completed ? (
          <CheckCircle className="w-4 h-4 text-white" />
        ) : (
          <span className="w-2 h-2 bg-gray-400 rounded-full" />
        )}
      </div>
      <span className={`text-sm flex-1 ${completed ? 'text-green-700 line-through' : 'text-gray-700'}`}>
        {text}
      </span>
      <ChevronLeft className="w-4 h-4 text-gray-400" />
    </Link>
  );
}
