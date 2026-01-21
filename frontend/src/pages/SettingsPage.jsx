import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Globe, Save } from 'lucide-react';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const [profile, setProfile] = useState({ name: '', language: 'he' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/user/profile');
      setProfile({ name: data.profile.name || '', language: data.profile.language || 'he' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.patch('/user/profile', profile);
      setMessage({ type: 'success', text: 'הפרופיל עודכן בהצלחה' });
      fetchMe();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה' });
    }
    setIsLoading(false);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'הסיסמאות לא תואמות' });
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/user/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.new,
      });
      setMessage({ type: 'success', text: 'הסיסמה שונתה בהצלחה' });
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה' });
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            ← חזרה
          </Button>
          <Logo />
          <Button variant="ghost" onClick={handleLogout}>
            התנתק
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">הגדרות</h1>

        {message.text && (
          <div className={`mb-4 p-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            פרטי פרופיל
          </h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                אימייל
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שם
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Globe className="w-4 h-4 inline ml-1" />
                שפה
              </label>
              <select
                value={profile.language}
                onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
            </div>
            <Button type="submit" disabled={isLoading}>
              <Save className="w-4 h-4 ml-2" />
              שמור שינויים
            </Button>
          </form>
        </div>

        {/* Password Section */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" />
            שינוי סיסמה
          </h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סיסמה נוכחית
              </label>
              <input
                type="password"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סיסמה חדשה
              </label>
              <input
                type="password"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                אימות סיסמה חדשה
              </label>
              <input
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={isLoading}>
              <Lock className="w-4 h-4 ml-2" />
              שנה סיסמה
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
