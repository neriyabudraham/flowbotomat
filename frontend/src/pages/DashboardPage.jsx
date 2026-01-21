import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MessageCircle, Workflow, Users, Settings, Bot, MessageSquare, TrendingUp, Grid } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useWhatsappStore from '../store/whatsappStore';
import useStatsStore from '../store/statsStore';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';
import StatCard from '../components/atoms/StatCard';
import ActivityChart from '../components/molecules/ActivityChart';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-gray-600">שלום, {user?.name || user?.email}</span>
            <Button variant="ghost" onClick={handleLogout}>
              התנתק
            </Button>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard 
            icon={Users} 
            label="אנשי קשר" 
            value={stats?.totalContacts || 0}
            color="blue"
          />
          <StatCard 
            icon={MessageSquare} 
            label="הודעות היום" 
            value={stats?.todayMessages || 0}
            color="green"
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

        {/* Activity Chart */}
        <div className="mb-6">
          <ActivityChart data={activity} />
        </div>

        {/* WhatsApp Status Card */}
        <Link to="/whatsapp" className="block mb-6">
          <div className={`bg-white rounded-xl shadow p-6 border-2 transition-all hover:shadow-lg ${
            connection?.status === 'connected' 
              ? 'border-green-200 hover:border-green-300' 
              : 'border-orange-200 hover:border-orange-300'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                connection?.status === 'connected' ? 'bg-green-100' : 'bg-orange-100'
              }`}>
                <MessageCircle className={`w-6 h-6 ${
                  connection?.status === 'connected' ? 'text-green-600' : 'text-orange-600'
                }`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800">WhatsApp</h3>
                <p className={`text-sm ${
                  connection?.status === 'connected' ? 'text-green-600' : 'text-orange-600'
                }`}>
                  {connection?.status === 'connected' 
                    ? `מחובר - ${connection.phone_number || 'פעיל'}`
                    : 'לא מחובר - לחץ לחיבור'}
                </p>
              </div>
              <span className="text-gray-400">←</span>
            </div>
          </div>
        </Link>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link to="/bots" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
            <Workflow className="w-8 h-8 text-primary-500 mb-3" />
            <h3 className="font-semibold text-gray-800">בוטים</h3>
            <p className="text-sm text-gray-500">יצירת וניהול בוטים</p>
          </Link>
          
          <Link to="/templates" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow border-2 border-purple-100">
            <Grid className="w-8 h-8 text-purple-500 mb-3" />
            <h3 className="font-semibold text-gray-800">תבניות</h3>
            <p className="text-sm text-gray-500">גלריית בוטים מוכנים</p>
          </Link>
          
          <Link to="/contacts" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
            <Users className="w-8 h-8 text-primary-500 mb-3" />
            <h3 className="font-semibold text-gray-800">אנשי קשר</h3>
            <p className="text-sm text-gray-500">צפייה בצ'אטים ואנשי קשר</p>
          </Link>
          
          <Link to="/settings" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
            <Settings className="w-8 h-8 text-primary-500 mb-3" />
            <h3 className="font-semibold text-gray-800">הגדרות</h3>
            <p className="text-sm text-gray-500">הגדרות חשבון</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
