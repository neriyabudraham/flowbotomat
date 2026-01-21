import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
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
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            ברוך הבא ל-FlowBotomat! 🎉
          </h1>
          <p className="text-gray-600">
            המערכת בבנייה. בקרוב תוכל ליצור בוטים מדהימים.
          </p>
        </div>
      </main>
    </div>
  );
}
