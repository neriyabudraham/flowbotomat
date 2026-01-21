import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Lock, Globe, Save, ArrowLeft, Settings, Bell, Shield, 
  CreditCard, Crown, Check, Eye, EyeOff, Sparkles, ChevronRight,
  Mail, Phone, Building, Palette, Moon, Sun, Languages, Key
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import ExpertAccessManager from '../components/settings/ExpertAccessManager';
import MyClientsManager from '../components/settings/MyClientsManager';
import SubscriptionManager from '../components/settings/SubscriptionManager';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import api from '../services/api';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const [profile, setProfile] = useState({ name: '', language: 'he' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

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
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
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
    if (passwords.new.length < 6) {
      setMessage({ type: 'error', text: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
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
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה' });
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const tabs = [
    { id: 'profile', label: 'פרופיל', icon: User },
    { id: 'subscription', label: 'מנוי', icon: Crown },
    { id: 'security', label: 'אבטחה', icon: Shield },
    { id: 'experts', label: 'גישת מומחים', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50" dir="rtl">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
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
            </div>
            
            <div className="flex items-center gap-3">
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <span className="text-gray-500 text-sm hidden sm:block">{user?.name || user?.email}</span>
              <button 
                onClick={handleLogout}
                className="px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 backdrop-blur rounded-2xl">
                <Settings className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">הגדרות</h1>
                <p className="text-white/70 mt-1">נהל את הפרופיל, המנוי והאבטחה שלך</p>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="hidden md:flex items-center gap-4">
              <div className="text-center px-6 py-3 bg-white/20 backdrop-blur rounded-xl">
                <div className="text-2xl font-bold text-white">{user?.name?.charAt(0) || '👤'}</div>
                <div className="text-xs text-white/70">פרופיל</div>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-700' 
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.type === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <Shield className="w-5 h-5" />
            )}
            {message.text}
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 sticky top-28">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right transition-all ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                    {activeTab === tab.id && (
                      <ChevronRight className="w-4 h-4 mr-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-6">
            {/* Mobile Tabs */}
            <div className="flex lg:hidden gap-2 overflow-x-auto pb-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
                      activeTab === tab.id
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <User className="w-5 h-5" />
                      פרטי פרופיל
                    </h2>
                  </div>
                  
                  <form onSubmit={handleProfileSubmit} className="p-6 space-y-5">
                    {/* Avatar */}
                    <div className="flex items-center gap-4 pb-5 border-b border-gray-100">
                      <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="text-3xl font-bold text-white">
                          {profile.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '👤'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{profile.name || 'משתמש'}</h3>
                        <p className="text-sm text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Mail className="w-4 h-4 inline ml-1 text-gray-400" />
                          אימייל
                        </label>
                        <input
                          type="email"
                          value={user?.email || ''}
                          disabled
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <User className="w-4 h-4 inline ml-1 text-gray-400" />
                          שם
                        </label>
                        <input
                          type="text"
                          value={profile.name}
                          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          placeholder="הזן את שמך"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Languages className="w-4 h-4 inline ml-1 text-gray-400" />
                        שפת ממשק
                      </label>
                      <select
                        value={profile.language}
                        onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                      >
                        <option value="he">🇮🇱 עברית</option>
                        <option value="en">🇺🇸 English</option>
                      </select>
                    </div>
                    
                    <div className="pt-4">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        <Save className="w-5 h-5" />
                        {isLoading ? 'שומר...' : 'שמור שינויים'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Subscription Tab */}
            {activeTab === 'subscription' && (
              <SubscriptionManager />
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    שינוי סיסמה
                  </h2>
                </div>
                
                <form onSubmit={handlePasswordSubmit} className="p-6 space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                    <p className="text-sm text-amber-800 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      מומלץ להשתמש בסיסמה חזקה עם לפחות 8 תווים, אותיות ומספרים
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      סיסמה נוכחית
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={passwords.current}
                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all"
                        placeholder="הזן את הסיסמה הנוכחית"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        סיסמה חדשה
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={passwords.new}
                          onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all"
                          placeholder="הזן סיסמה חדשה"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        אימות סיסמה חדשה
                      </label>
                      <input
                        type="password"
                        value={passwords.confirm}
                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all"
                        placeholder="הזן שוב את הסיסמה החדשה"
                      />
                    </div>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {passwords.new && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">חוזק סיסמה:</span>
                        <span className={`font-medium ${
                          passwords.new.length >= 12 ? 'text-green-600' :
                          passwords.new.length >= 8 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          {passwords.new.length >= 12 ? 'חזקה מאוד' :
                           passwords.new.length >= 8 ? 'בינונית' :
                           'חלשה'}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            passwords.new.length >= 12 ? 'bg-green-500 w-full' :
                            passwords.new.length >= 8 ? 'bg-amber-500 w-2/3' :
                            passwords.new.length >= 6 ? 'bg-red-500 w-1/3' :
                            'bg-red-500 w-1/4'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isLoading || !passwords.current || !passwords.new || !passwords.confirm}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Lock className="w-5 h-5" />
                      {isLoading ? 'משנה...' : 'שנה סיסמה'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Experts Tab */}
            {activeTab === 'experts' && (
              <div className="space-y-6">
                <ExpertAccessManager />
                <MyClientsManager />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
