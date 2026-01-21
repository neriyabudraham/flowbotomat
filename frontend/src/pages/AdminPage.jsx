import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, BarChart3, Users, Settings, Activity, ArrowLeft, Database, CreditCard, Grid
} from 'lucide-react';
import useAuthStore from '../store/authStore';

// Admin Components
import AdminDashboard from '../components/admin/AdminDashboard';
import AdminUsers from '../components/admin/AdminUsers';
import AdminSettings from '../components/admin/AdminSettings';
import AdminLogs from '../components/admin/AdminLogs';
import AdminBackups from '../components/admin/AdminBackups';
import AdminSubscriptions from '../components/admin/AdminSubscriptions';
import AdminTemplates from '../components/admin/AdminTemplates';

const TABS = [
  { id: 'dashboard', label: 'דשבורד', icon: BarChart3 },
  { id: 'users', label: 'משתמשים', icon: Users },
  { id: 'subscriptions', label: 'מנויים ותמחור', icon: CreditCard },
  { id: 'templates', label: 'תבניות', icon: Grid },
  { id: 'settings', label: 'הגדרות', icon: Settings },
  { id: 'backups', label: 'גיבויים', icon: Database },
  { id: 'logs', label: 'לוגים', icon: Activity },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');

  const isAdmin = user && ['admin', 'superadmin'].includes(user.role);

  // Redirect non-admin users immediately
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, isLoading, isAdmin, navigate]);

  // Don't render anything while checking or if not admin
  if (isLoading) {
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
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-xl">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">ניהול מערכת</h1>
              <p className="text-sm text-gray-500">
                {user?.role === 'superadmin' ? 'סופר-אדמין' : 'אדמין'}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span>חזרה לדשבורד</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
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
            <div className="text-sm font-medium text-gray-600">FlowBotomat v1.0.0</div>
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
