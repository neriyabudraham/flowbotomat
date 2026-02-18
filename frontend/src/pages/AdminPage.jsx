import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, BarChart3, Users, Settings, Activity, ArrowLeft, Database, CreditCard, Grid, Share2, Bell, Package, Smartphone
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';

// Admin Components
import AdminDashboard from '../components/admin/AdminDashboard';
import AdminUsers from '../components/admin/AdminUsers';
import AdminSettings from '../components/admin/AdminSettings';
import AdminLogs from '../components/admin/AdminLogs';
import AdminBackups from '../components/admin/AdminBackups';
import AdminSubscriptions from '../components/admin/AdminSubscriptions';
import AdminTemplates from '../components/admin/AdminTemplates';
import AdminAffiliate from '../components/admin/AdminAffiliate';
import AdminNotifications from '../components/admin/AdminNotifications';
import AdminServices from '../components/admin/AdminServices';
import AdminStatusBot from '../components/admin/AdminStatusBot';

const TABS = [
  { id: 'dashboard', label: 'דשבורד', icon: BarChart3 },
  { id: 'users', label: 'משתמשים', icon: Users },
  { id: 'subscriptions', label: 'תמחור', icon: CreditCard },
  { id: 'services', label: 'שירותים נוספים', icon: Package },
  { id: 'status-bot', label: 'בוט סטטוסים', icon: Smartphone },
  { id: 'affiliate', label: 'תוכנית שותפים', icon: Share2 },
  { id: 'notifications', label: 'התראות', icon: Bell },
  { id: 'templates', label: 'תבניות', icon: Grid },
  { id: 'settings', label: 'הגדרות', icon: Settings },
  { id: 'backups', label: 'גיבויים', icon: Database },
  { id: 'logs', label: 'לוגים', icon: Activity },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, fetchMe, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // Fetch user data on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    
    fetchMe().finally(() => setLoading(false));
  }, []);

  const isAdmin = user && ['admin', 'superadmin'].includes(user.role);

  // Redirect non-admin users after loading
  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, isAdmin, navigate]);

  // Show loading while fetching user data
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect via useEffect
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'users':
        return <AdminUsers />;
      case 'subscriptions':
        return <AdminSubscriptions />;
      case 'services':
        return <AdminServices />;
      case 'status-bot':
        return <AdminStatusBot />;
      case 'affiliate':
        return <AdminAffiliate />;
      case 'notifications':
        return <AdminNotifications />;
      case 'templates':
        return <AdminTemplates />;
      case 'settings':
        return <AdminSettings />;
      case 'backups':
        return <AdminBackups />;
      case 'logs':
        return <AdminLogs />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
              <div className="hidden md:block h-8 w-px bg-gray-200" />
              <div className="hidden md:flex items-center gap-2">
                <div className="p-2 bg-red-100 rounded-xl">
                  <Shield className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <span className="font-bold text-gray-800">ניהול מערכת</span>
                  <span className="text-xs text-gray-500 mr-2">
                    ({user?.role === 'superadmin' ? 'סופר-אדמין' : 'אדמין'})
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-l border-gray-200 min-h-[calc(100vh-73px)] sticky top-[73px]">
          <nav className="p-4 space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-red-50 text-red-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-red-600' : ''}`} />
                {tab.label}
              </button>
            ))}
          </nav>
          
          {/* Quick Stats in Sidebar */}
          <div className="p-4 border-t border-gray-100">
            <div className="text-xs text-gray-400 mb-2">גירסה</div>
            <div className="text-sm font-medium text-gray-600">Botomat v1.0.0</div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
