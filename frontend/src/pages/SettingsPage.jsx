import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, Lock, Globe, Save, ArrowLeft, Settings, Bell, Shield, 
  CreditCard, Crown, Check, Eye, EyeOff, Sparkles, ChevronRight,
  Mail, Phone, Building, Palette, Moon, Sun, Languages, Key, Share2,
  Loader2
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import ExpertAccessManager from '../components/settings/ExpertAccessManager';
import MyClientsManager from '../components/settings/MyClientsManager';
import SubscriptionManager from '../components/settings/SubscriptionManager';
import AffiliatePanel from '../components/settings/AffiliatePanel';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import api from '../services/api';

// Notification preferences categories
const NOTIFICATION_CATEGORIES = [
  { 
    id: 'subscription', 
    label: 'רכישה ומנוי', 
    description: 'התראות על תשלומים, חידושי מנוי ושינויים בחבילה',
    emailKey: 'email_subscription',
    appKey: 'app_subscription'
  },
  { 
    id: 'updates', 
    label: 'שדרוגים ועדכונים', 
    description: 'עדכוני מערכת, פיצ\'רים חדשים ושיפורים',
    emailKey: 'email_updates',
    appKey: 'app_updates'
  },
  { 
    id: 'critical', 
    label: 'עדכונים קריטיים', 
    description: 'התראות חשובות שלא ניתן לבטל',
    emailKey: 'email_critical',
    appKey: 'app_critical',
    locked: true
  },
  { 
    id: 'promos', 
    label: 'הצעות והטבות', 
    description: 'מבצעים, הנחות והזדמנויות מיוחדות',
    emailKey: 'email_promos',
    appKey: 'app_promos'
  },
  { 
    id: 'newsletter', 
    label: 'ניוזלטר', 
    description: 'טיפים, מדריכים ותוכן מקצועי',
    emailKey: 'email_newsletter',
    appKey: null // No in-app for newsletter
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, fetchMe } = useAuthStore();
  const [profile, setProfile] = useState({ name: '', language: 'he', avatar_url: null, google_id: null, has_password: true });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  
  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    loadProfile();
    
    // Check URL param for tab
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
  
  useEffect(() => {
    if (activeTab === 'notifications') {
      loadNotificationPreferences();
    }
  }, [activeTab]);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/user/profile');
      setProfile({ 
            name: data.profile.name || '', 
            language: data.profile.language || 'he',
            avatar_url: data.profile.avatar_url || null,
            google_id: data.profile.google_id || null,
            has_password: data.profile.has_password !== false
          });
    } catch (err) {
      console.error(err);
    }
  };
  
  const loadNotificationPreferences = async () => {
    setNotifLoading(true);
    try {
      const { data } = await api.get('/notifications/preferences');
      setNotifPrefs(data);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    } finally {
      setNotifLoading(false);
    }
  };
  
  const updateNotificationPref = async (key, value) => {
    // Optimistic update
    setNotifPrefs(prev => ({ ...prev, [key]: value }));
    
    try {
      await api.put('/notifications/preferences', { [key]: value });
    } catch (err) {
      // Revert on error
      setNotifPrefs(prev => ({ ...prev, [key]: !value }));
      console.error('Failed to update preference:', err);
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
    { id: 'notifications', label: 'התראות', icon: Bell },
    { id: 'affiliate', label: 'תוכנית שותפים', icon: Share2 },
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
              <div className="flex items-center gap-2">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-gray-500 text-sm hidden sm:block">{user?.name || user?.email}</span>
              </div>
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
                      {profile.avatar_url ? (
                        <img 
                          src={profile.avatar_url} 
                          alt={profile.name || 'Profile'} 
                          className="w-20 h-20 rounded-2xl object-cover shadow-lg"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                          <span className="text-3xl font-bold text-white">
                            {profile.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '👤'}
                          </span>
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{profile.name || 'משתמש'}</h3>
                        <p className="text-sm text-gray-500">{user?.email}</p>
                        {profile.google_id && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-400">
                            <svg className="w-3 h-3" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            מחובר עם Google
                          </span>
                        )}
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

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bell className="w-5 h-5" />
                    הגדרות התראות
                  </h2>
                  <p className="text-white/70 text-sm mt-1">בחר אילו התראות תרצה לקבל</p>
                </div>
                
                {notifLoading ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
                    <p className="text-gray-500">טוען הגדרות...</p>
                  </div>
                ) : notifPrefs ? (
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
                      <div></div>
                      <div className="flex items-center gap-8 text-sm font-medium text-gray-500">
                        <div className="flex items-center gap-2 w-20 justify-center">
                          <Mail className="w-4 h-4" />
                          <span>מייל</span>
                        </div>
                        <div className="flex items-center gap-2 w-20 justify-center">
                          <Bell className="w-4 h-4" />
                          <span>מערכת</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Categories */}
                    <div className="space-y-4">
                      {NOTIFICATION_CATEGORIES.map((category) => (
                        <div 
                          key={category.id}
                          className={`flex items-center justify-between p-4 rounded-xl border ${
                            category.locked ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100 hover:border-gray-200'
                          } transition-colors`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-800">{category.label}</h4>
                              {category.locked && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                                  חובה
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">{category.description}</p>
                          </div>
                          
                          <div className="flex items-center gap-8">
                            {/* Email Toggle */}
                            <div className="w-20 flex justify-center">
                              {category.emailKey && (
                                <button
                                  onClick={() => !category.locked && updateNotificationPref(category.emailKey, !notifPrefs[category.emailKey])}
                                  disabled={category.locked}
                                  className={`relative w-12 h-6 rounded-full transition-colors ${
                                    notifPrefs[category.emailKey] 
                                      ? 'bg-blue-500' 
                                      : 'bg-gray-300'
                                  } ${category.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                    notifPrefs[category.emailKey] ? 'right-1' : 'left-1'
                                  }`} />
                                </button>
                              )}
                            </div>
                            
                            {/* App Toggle */}
                            <div className="w-20 flex justify-center">
                              {category.appKey ? (
                                <button
                                  onClick={() => !category.locked && updateNotificationPref(category.appKey, !notifPrefs[category.appKey])}
                                  disabled={category.locked}
                                  className={`relative w-12 h-6 rounded-full transition-colors ${
                                    notifPrefs[category.appKey] 
                                      ? 'bg-blue-500' 
                                      : 'bg-gray-300'
                                  } ${category.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                    notifPrefs[category.appKey] ? 'right-1' : 'left-1'
                                  }`} />
                                </button>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Info */}
                    <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-sm text-blue-700 flex items-start gap-2">
                        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                          עדכונים קריטיים כוללים התראות אבטחה, שינויים בתנאי השימוש, והודעות חשובות על המנוי שלך.
                          התראות אלו נשלחות תמיד כדי להבטיח שתישאר מעודכן.
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-gray-500">
                    שגיאה בטעינת ההגדרות
                  </div>
                )}
              </div>
            )}

            {/* Affiliate Tab */}
            {activeTab === 'affiliate' && (
              <AffiliatePanel />
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
