import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MessageCircle, Workflow, Users, Settings } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useWhatsappStore from '../store/whatsappStore';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const { connection, fetchStatus } = useWhatsappStore();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchStatus();
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-6 opacity-50 cursor-not-allowed">
            <Workflow className="w-8 h-8 text-primary-500 mb-3" />
            <h3 className="font-semibold text-gray-800">בוטים</h3>
            <p className="text-sm text-gray-500">יצירת וניהול בוטים</p>
            <span className="text-xs text-gray-400">בקרוב...</span>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6 opacity-50 cursor-not-allowed">
            <Users className="w-8 h-8 text-primary-500 mb-3" />
            <h3 className="font-semibold text-gray-800">אנשי קשר</h3>
            <p className="text-sm text-gray-500">צפייה בצ'אטים ואנשי קשר</p>
            <span className="text-xs text-gray-400">בקרוב...</span>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6 opacity-50 cursor-not-allowed">
            <Settings className="w-8 h-8 text-primary-500 mb-3" />
            <h3 className="font-semibold text-gray-800">הגדרות</h3>
            <p className="text-sm text-gray-500">הגדרות חשבון</p>
            <span className="text-xs text-gray-400">בקרוב...</span>
          </div>
        </div>
      </main>
    </div>
  );
}
