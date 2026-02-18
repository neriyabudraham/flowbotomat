import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, Lock, Globe, Save, ArrowLeft, Settings, Bell, Shield, 
  CreditCard, Crown, Check, Eye, EyeOff, Sparkles, ChevronRight,
  Mail, Phone, Building, Palette, Moon, Sun, Languages, Key, Share2,
  Loader2, MessageSquare, Clock, Bot, Hand, Puzzle, ExternalLink,
  RefreshCw, Unplug, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import ExpertAccessManager from '../components/settings/ExpertAccessManager';
import MyClientsManager from '../components/settings/MyClientsManager';
import SubscriptionManager from '../components/settings/SubscriptionManager';
import AffiliatePanel from '../components/settings/AffiliatePanel';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
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
  const [profile, setProfile] = useState({ name: '', language: 'he', avatar_url: null, google_id: null, has_password: true, receipt_email: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  const [viewingAs, setViewingAs] = useState(null);

  // Check if user is admin (either directly or viewing as another account)
  const isAdmin = (() => {
    if (user && ['admin', 'superadmin'].includes(user.role)) return true;
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.viewingAs) return true;
      }
    } catch (e) {}
    return false;
  })();
  
  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  
  // Integrations
  const [googleSheetsStatus, setGoogleSheetsStatus] = useState(null);
  const [googleContactsStatus, setGoogleContactsStatus] = useState(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Live chat settings
  const [liveChatSettings, setLiveChatSettings] = useState({
    onManualMessage: 'pause_temp', // 'pause_temp' | 'pause_permanent' | 'none'
    pauseDuration: 30, // minutes
    pauseUnit: 'minutes', // 'minutes' | 'hours'
  });
  const [liveChatLoading, setLiveChatLoading] = useState(false);
  const [liveChatSaving, setLiveChatSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    // Check if viewing as another account
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.viewingAs) {
        setViewingAs({
          originalUserId: payload.viewingAs,
          originalUserName: payload.originalUserName,
        });
      }
    } catch (e) {}
    
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
    if (activeTab === 'livechat') {
      loadLiveChatSettings();
    }
    if (activeTab === 'integrations') {
      loadGoogleSheetsStatus();
      loadGoogleContactsStatus();
      
      // Clean up URL after OAuth callback and fix browser history
      const googleSheets = searchParams.get('google_sheets');
      const googleContacts = searchParams.get('google_contacts');
      if (googleSheets || googleContacts) {
        // Show success message
        if (googleSheets === 'connected') {
          setMessage({ type: 'success', text: 'Google Sheets חובר בהצלחה!' });
        }
        if (googleContacts === 'connected') {
          setMessage({ type: 'success', text: 'Google Contacts חובר בהצלחה!' });
        }
        
        // Replace current URL and history to remove Google OAuth from back button
        // Using navigate with replace: true
        navigate('/settings?tab=integrations', { replace: true });
      }
    }
  }, [activeTab]);

  const loadGoogleSheetsStatus = async () => {
    try {
      setSheetsLoading(true);
      const { data } = await api.get('/google-sheets/status');
      setGoogleSheetsStatus(data);
    } catch (err) {
      console.error('Failed to load Google Sheets status:', err);
    } finally {
      setSheetsLoading(false);
    }
  };

  const connectGoogleSheets = async () => {
    try {
      setSheetsLoading(true);
      const { data } = await api.get('/google-sheets/auth-url');
      window.location.replace(data.url);
    } catch (err) {
      console.error('Failed to get auth URL:', err);
      setMessage({ type: 'error', text: 'שגיאה בחיבור Google Sheets' });
    } finally {
      setSheetsLoading(false);
    }
  };

  const disconnectGoogleSheets = async () => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את Google Sheets?')) return;
    try {
      setSheetsLoading(true);
      await api.post('/google-sheets/disconnect');
      setGoogleSheetsStatus({ connected: false });
    } catch (err) {
      console.error('Failed to disconnect Google Sheets:', err);
    } finally {
      setSheetsLoading(false);
    }
  };

  const loadGoogleContactsStatus = async () => {
    try {
      setContactsLoading(true);
      const { data } = await api.get('/google-contacts/status');
      setGoogleContactsStatus(data);
    } catch (err) {
      console.error('Failed to load Google Contacts status:', err);
    } finally {
      setContactsLoading(false);
    }
  };

  const connectGoogleContacts = async () => {
    try {
      setContactsLoading(true);
      const { data } = await api.get('/google-contacts/auth-url');
      window.location.replace(data.url);
    } catch (err) {
      console.error('Failed to get auth URL:', err);
      setMessage({ type: 'error', text: 'שגיאה בחיבור Google Contacts' });
    } finally {
      setContactsLoading(false);
    }
  };

  const disconnectGoogleContacts = async () => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את Google Contacts?')) return;
    try {
      setContactsLoading(true);
      await api.post('/google-contacts/disconnect');
      setGoogleContactsStatus({ connected: false });
    } catch (err) {
      console.error('Failed to disconnect Google Contacts:', err);
    } finally {
      setContactsLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/user/profile');
      setProfile({ 
            name: data.profile.name || '', 
            language: data.profile.language || 'he',
            avatar_url: data.profile.avatar_url || null,
            google_id: data.profile.google_id || null,
            has_password: data.profile.has_password !== false,
            receipt_email: data.profile.receipt_email || ''
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
  
  const loadLiveChatSettings = async () => {
    setLiveChatLoading(true);
    try {
      const { data } = await api.get('/user/settings/livechat');
      if (data) {
        setLiveChatSettings({
          onManualMessage: data.on_manual_message || 'pause_temp',
          pauseDuration: data.pause_duration || 30,
          pauseUnit: data.pause_unit || 'minutes',
        });
      }
    } catch (err) {
      console.error('Failed to load live chat settings:', err);
    } finally {
      setLiveChatLoading(false);
    }
  };
  
  const saveLiveChatSettings = async () => {
    setLiveChatSaving(true);
    try {
      await api.put('/user/settings/livechat', {
        on_manual_message: liveChatSettings.onManualMessage,
        pause_duration: liveChatSettings.pauseDuration,
        pause_unit: liveChatSettings.pauseUnit,
      });
      setMessage({ type: 'success', text: 'הגדרות הלייב צ\'אט נשמרו בהצלחה' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'שגיאה בשמירת ההגדרות' });
      console.error('Failed to save live chat settings:', err);
    } finally {
      setLiveChatSaving(false);
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
    { id: 'livechat', label: 'לייב צ\'אט', icon: MessageSquare },
    { id: 'subscription', label: 'מנוי', icon: Crown },
    { id: 'notifications', label: 'התראות', icon: Bell },
    { id: 'affiliate', label: 'תוכנית שותפים', icon: Share2 },
    { id: 'integrations', label: 'אינטגרציות', icon: Puzzle },
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
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="p-2 hover:bg-red-50 rounded-xl transition-colors group"
                  title="ממשק ניהול"
                >
                  <Shield className="w-5 h-5 text-red-500 group-hover:text-red-600" />
                </button>
              )}
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button 
                onClick={handleLogout}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
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
                        <CreditCard className="w-4 h-4 inline ml-1 text-gray-400" />
                        אימייל לקבלות
                      </label>
                      <input
                        type="email"
                        value={profile.receipt_email || ''}
                        onChange={(e) => setProfile({ ...profile, receipt_email: e.target.value })}
                        placeholder={user?.email || 'השאר ריק לשימוש באימייל הראשי'}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                      />
                      <p className="text-xs text-gray-500 mt-1">קבלות על תשלומים יישלחו לכתובת זו. השאר ריק לשימוש באימייל הראשי.</p>
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

            {/* Live Chat Tab */}
            {activeTab === 'livechat' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    הגדרות לייב צ'אט
                  </h2>
                  <p className="text-white/70 text-sm mt-1">התנהגות המערכת בעת שליחת הודעה ידנית</p>
                </div>
                
                {liveChatLoading ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-green-500 mb-3" />
                    <p className="text-gray-500">טוען הגדרות...</p>
                  </div>
                ) : (
                  <div className="p-6 space-y-6">
                    {/* Info box */}
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-sm text-blue-700 flex items-start gap-2">
                        <Hand className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                          כאשר אתה שולח הודעה ידנית מהלייב צ'אט, המערכת יכולה לעצור את הבוט אוטומטית כדי לאפשר לך לנהל שיחה ללא הפרעות.
                        </span>
                      </p>
                    </div>
                    
                    {/* Action on manual message */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        מה לעשות כששולחים הודעה ידנית?
                      </label>
                      <div className="space-y-3">
                        {/* Option 1: Pause temporarily */}
                        <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          liveChatSettings.onManualMessage === 'pause_temp' 
                            ? 'border-green-500 bg-green-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="onManualMessage"
                            value="pause_temp"
                            checked={liveChatSettings.onManualMessage === 'pause_temp'}
                            onChange={(e) => setLiveChatSettings({ ...liveChatSettings, onManualMessage: e.target.value })}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Clock className="w-5 h-5 text-green-600" />
                              <span className="font-medium text-gray-800">עצור זמנית (מומלץ)</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              הבוט יעצור לזמן מוגדר ויחזור לפעולה אוטומטית
                            </p>
                            
                            {/* Duration settings */}
                            {liveChatSettings.onManualMessage === 'pause_temp' && (
                              <div className="mt-4 flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                                <span className="text-sm text-gray-600">עצור ל:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="1440"
                                  value={liveChatSettings.pauseDuration}
                                  onChange={(e) => setLiveChatSettings({ ...liveChatSettings, pauseDuration: parseInt(e.target.value) || 30 })}
                                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center"
                                />
                                <select
                                  value={liveChatSettings.pauseUnit}
                                  onChange={(e) => setLiveChatSettings({ ...liveChatSettings, pauseUnit: e.target.value })}
                                  className="px-3 py-2 border border-gray-200 rounded-lg"
                                >
                                  <option value="minutes">דקות</option>
                                  <option value="hours">שעות</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </label>
                        
                        {/* Option 2: Pause permanently */}
                        <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          liveChatSettings.onManualMessage === 'pause_permanent' 
                            ? 'border-orange-500 bg-orange-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="onManualMessage"
                            value="pause_permanent"
                            checked={liveChatSettings.onManualMessage === 'pause_permanent'}
                            onChange={(e) => setLiveChatSettings({ ...liveChatSettings, onManualMessage: e.target.value })}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Hand className="w-5 h-5 text-orange-600" />
                              <span className="font-medium text-gray-800">עצור לגמרי</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              הבוט יעצור עד שתחזיר אותו ידנית
                            </p>
                          </div>
                        </label>
                        
                        {/* Option 3: Don't stop */}
                        <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          liveChatSettings.onManualMessage === 'none' 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="onManualMessage"
                            value="none"
                            checked={liveChatSettings.onManualMessage === 'none'}
                            onChange={(e) => setLiveChatSettings({ ...liveChatSettings, onManualMessage: e.target.value })}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Bot className="w-5 h-5 text-blue-600" />
                              <span className="font-medium text-gray-800">אל תעצור את הבוט</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              הבוט ימשיך לפעול גם אחרי שליחת הודעה ידנית
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                    
                    {/* Save button */}
                    <div className="pt-4 border-t border-gray-100">
                      <button
                        onClick={saveLiveChatSettings}
                        disabled={liveChatSaving}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {liveChatSaving ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Save className="w-5 h-5" />
                        )}
                        {liveChatSaving ? 'שומר...' : 'שמור הגדרות'}
                      </button>
                    </div>
                  </div>
                )}
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

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Puzzle className="w-5 h-5" />
                      אינטגרציות
                    </h2>
                    <p className="text-green-100 text-sm mt-1">חבר שירותים חיצוניים למערכת הבוטים שלך</p>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    {/* Google Sheets Integration Card */}
                    <div className="border border-gray-200 rounded-xl p-5 hover:border-green-200 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                              <path d="M14.5 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V7.5L14.5 2Z" stroke="#0F9D58" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <polyline points="14,2 14,8 20,8" stroke="#0F9D58" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <line x1="8" y1="13" x2="16" y2="13" stroke="#0F9D58" strokeWidth="1.5"/>
                              <line x1="8" y1="17" x2="16" y2="17" stroke="#0F9D58" strokeWidth="1.5"/>
                              <line x1="12" y1="10" x2="12" y2="20" stroke="#0F9D58" strokeWidth="1.5"/>
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg">Google Sheets</h3>
                            <p className="text-sm text-gray-500">
                              {googleSheetsStatus?.connected 
                                ? `מחובר: ${googleSheetsStatus.email}`
                                : 'קרא, כתוב ועדכן נתונים בגיליונות אלקטרוניים'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {sheetsLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          ) : googleSheetsStatus?.connected ? (
                            <>
                              <span className="flex items-center gap-1.5 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg font-medium">
                                <CheckCircle2 className="w-4 h-4" />
                                מחובר
                              </span>
                              <button
                                onClick={disconnectGoogleSheets}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                              >
                                <Unplug className="w-4 h-4" />
                                נתק
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={connectGoogleSheets}
                              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm font-medium"
                            >
                              <ExternalLink className="w-4 h-4" />
                              חבר חשבון
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {googleSheetsStatus?.connected && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center gap-6 text-sm text-gray-500">
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-4 h-4" />
                              {googleSheetsStatus.email}
                            </span>
                            {googleSheetsStatus.name && (
                              <span className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                {googleSheetsStatus.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            ניתן להשתמש בפעולות Google Sheets בבוטים שלך דרך עורך הבוט
                          </p>
                        </div>
                      )}
                      
                      {!googleSheetsStatus?.connected && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="grid grid-cols-2 gap-3 text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-500" />
                              הוספת שורות לגיליון
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-500" />
                              עדכון שורות קיימות
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-500" />
                              חיפוש נתונים
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-500" />
                              קריאת נתונים מגיליון
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Google Contacts Integration Card */}
                    <div className="border border-gray-200 rounded-xl p-5 hover:border-blue-200 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                              <circle cx="12" cy="8" r="4" stroke="#4285F4" strokeWidth="2"/>
                              <path d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
                              <circle cx="18" cy="8" r="3" stroke="#4285F4" strokeWidth="1.5" strokeDasharray="2 1"/>
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg">Google Contacts</h3>
                            <p className="text-sm text-gray-500">
                              {googleContactsStatus?.connected 
                                ? `מחובר: ${googleContactsStatus.email}`
                                : 'חפש, צור ועדכן אנשי קשר בגוגל'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {contactsLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          ) : googleContactsStatus?.connected ? (
                            <>
                              <span className="flex items-center gap-1.5 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg font-medium">
                                <CheckCircle2 className="w-4 h-4" />
                                מחובר
                              </span>
                              <button
                                onClick={disconnectGoogleContacts}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                              >
                                <Unplug className="w-4 h-4" />
                                נתק
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={connectGoogleContacts}
                              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all shadow-sm font-medium"
                            >
                              <ExternalLink className="w-4 h-4" />
                              חבר חשבון
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {googleContactsStatus?.connected && (
                        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                          <div className="flex items-center gap-6 text-sm text-gray-500">
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-4 h-4" />
                              {googleContactsStatus.email}
                            </span>
                            {googleContactsStatus.name && (
                              <span className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                {googleContactsStatus.name}
                              </span>
                            )}
                          </div>
                          
                          {/* Contact count display */}
                          {googleContactsStatus.totalContacts !== null && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-500">
                                אנשי קשר: {googleContactsStatus.totalContacts?.toLocaleString()} / {googleContactsStatus.contactsLimit?.toLocaleString()}
                              </span>
                              {googleContactsStatus.isAtLimit && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                                  מלא
                                </span>
                              )}
                              {googleContactsStatus.isNearLimit && !googleContactsStatus.isAtLimit && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                                  כמעט מלא
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* Warning if at limit */}
                          {googleContactsStatus.isAtLimit && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm font-medium text-red-800">חשבון Google הגיע למגבלת אנשי קשר</p>
                                  <p className="text-xs text-red-600 mt-1">
                                    לא ניתן לשמור אנשי קשר חדשים בחשבון זה. יש למחוק אנשי קשר ישנים או להתחבר לחשבון אחר.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Warning if near limit */}
                          {googleContactsStatus.isNearLimit && !googleContactsStatus.isAtLimit && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm font-medium text-amber-800">חשבון Google כמעט מלא</p>
                                  <p className="text-xs text-amber-600 mt-1">
                                    נותרו פחות מ-{((googleContactsStatus.contactsLimit - googleContactsStatus.totalContacts) || 0).toLocaleString()} מקומות פנויים. שקול למחוק אנשי קשר ישנים.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {!googleContactsStatus.isAtLimit && (
                            <p className="text-xs text-gray-400">
                              ניתן להשתמש בפעולות Google Contacts בבוטים שלך דרך עורך הבוט
                            </p>
                          )}
                        </div>
                      )}
                      
                      {!googleContactsStatus?.connected && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="grid grid-cols-2 gap-3 text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-blue-500" />
                              בדיקת קיום איש קשר
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-blue-500" />
                              יצירת איש קשר חדש
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-blue-500" />
                              עדכון פרטי איש קשר
                            </div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-blue-500" />
                              הוספה לתוויות/קבוצות
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Placeholder for future integrations */}
                    <div className="border border-dashed border-gray-200 rounded-xl p-5 opacity-50">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center">
                          <Puzzle className="w-6 h-6 text-gray-300" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-400">אינטגרציות נוספות בקרוב...</h3>
                          <p className="text-sm text-gray-300">CRM, מערכות סליקה, ועוד</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              viewingAs ? (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 text-center">
                  <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-7 h-7 text-orange-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800 mb-2">אינך יכול לשנות סיסמה בעת צפייה בחשבון אחר</h3>
                  <p className="text-sm text-gray-600">
                    שינוי סיסמה זמין רק כשאתה מחובר לחשבון שלך.
                  </p>
                </div>
              ) : (
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
              )
            )}

            {/* Experts Tab */}
            {activeTab === 'experts' && (
              <div className="space-y-6">
                {viewingAs ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 text-center">
                    <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Shield className="w-7 h-7 text-orange-600" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">אינך יכול לערוך גישות בעת צפייה בחשבון אחר</h3>
                    <p className="text-sm text-gray-600">
                      ניהול גישות זמין רק כשאתה מחובר לחשבון שלך.
                    </p>
                  </div>
                ) : (
                  <>
                    <ExpertAccessManager />
                    <MyClientsManager />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
