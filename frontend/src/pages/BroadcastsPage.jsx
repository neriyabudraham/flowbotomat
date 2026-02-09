import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Send, Users, MessageSquare, Clock, Calendar, Play, Pause, 
  Trash2, Edit2, X, Search, MoreHorizontal, CheckCircle, 
  Loader2, RefreshCw, ArrowLeft, Target, FileText, Settings,
  LayoutGrid, History, Zap, Copy, Filter, ChevronDown, Eye, Sparkles,
  TrendingUp, BarChart3, Crown, Lock
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

// Tab Components
import AudiencesTab from '../components/broadcasts/AudiencesTab';
import TemplatesTab from '../components/broadcasts/TemplatesTab';
import CampaignsTab from '../components/broadcasts/CampaignsTab';
import ContactsTab from '../components/broadcasts/ContactsTab';
import AutomatedCampaignsTab from '../components/broadcasts/AutomatedCampaignsTab';

export default function BroadcastsPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [stats, setStats] = useState(null);
  const [hasAccess, setHasAccess] = useState(null); // null = loading, true/false = checked

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const { data } = await api.get('/broadcasts/access');
      setHasAccess(data.allowed);
      
      if (data.allowed) {
        fetchStats(true);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error('Failed to check access:', e);
      // If error, assume no access
      setHasAccess(false);
      setLoading(false);
    }
  };

  const fetchStats = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      
      const [audiencesRes, templatesRes, campaignsRes] = await Promise.all([
        api.get('/broadcasts/audiences'),
        api.get('/broadcasts/templates'),
        api.get('/broadcasts/campaigns')
      ]);
      
      const campaigns = campaignsRes.data.campaigns || [];
      const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
      const totalRecipients = campaigns.reduce((sum, c) => sum + (c.total_recipients || 0), 0);
      
      setStats({
        audiences: audiencesRes.data.audiences?.length || 0,
        templates: templatesRes.data.templates?.length || 0,
        campaigns: campaigns.length,
        activeCampaigns: campaigns.filter(c => c.status === 'running').length,
        scheduledCampaigns: campaigns.filter(c => c.status === 'scheduled').length,
        completedCampaigns: campaigns.filter(c => c.status === 'completed').length,
        totalSent,
        totalRecipients
      });
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Show upgrade page if no access
  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/30" dir="rtl">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 py-4">
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
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-bold text-sm">
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <button 
                  onClick={() => { localStorage.removeItem('accessToken'); navigate('/login'); }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
                >
                  התנתק
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center">
            {/* Icon */}
            <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl flex items-center justify-center shadow-xl shadow-orange-500/30">
              <Lock className="w-12 h-12 text-white" />
            </div>
            
            {/* Title */}
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              שליחת הודעות תפוצה
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-lg mx-auto">
              התכונה הזו לא כלולה בתוכנית הנוכחית שלך.
              שדרג את החבילה כדי לשלוח הודעות תפוצה לכל אנשי הקשר שלך.
            </p>
            
            {/* Features List */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-8 mb-8 text-right">
              <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">מה תקבל עם שדרוג?</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl">
                  <div className="p-2 bg-orange-500 rounded-xl">
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">קמפיינים ללא הגבלה</p>
                    <p className="text-sm text-gray-500">שלח כמה קמפיינים שתרצה</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl">
                  <div className="p-2 bg-orange-500 rounded-xl">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">קהלים דינאמיים</p>
                    <p className="text-sm text-gray-500">סנן לפי תגיות ומאפיינים</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl">
                  <div className="p-2 bg-orange-500 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">תבניות הודעה</p>
                    <p className="text-sm text-gray-500">צור תבניות לשימוש חוזר</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl">
                  <div className="p-2 bg-orange-500 rounded-xl">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">תזמון שליחה</p>
                    <p className="text-sm text-gray-500">תזמן קמפיינים מראש</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* CTA */}
            <button
              onClick={() => navigate('/pricing')}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-orange-500/30 transition-all hover:scale-105"
            >
              <Crown className="w-6 h-6" />
              שדרג עכשיו
            </button>
            
            <p className="text-sm text-gray-500 mt-4">
              <button onClick={() => navigate('/dashboard')} className="text-orange-600 hover:underline">
                חזרה לדשבורד
              </button>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const tabs = [
    { id: 'campaigns', label: 'קמפיינים', icon: Send, count: stats?.campaigns },
    { id: 'automated', label: 'אוטומטי', icon: Zap },
    { id: 'audiences', label: 'קהלים', icon: Users, count: stats?.audiences },
    { id: 'templates', label: 'תבניות', icon: MessageSquare, count: stats?.templates },
    { id: 'contacts', label: 'אנשי קשר', icon: Target },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
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
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-bold text-sm">
                  {(user?.name || user?.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <button 
                onClick={() => { localStorage.removeItem('accessToken'); navigate('/login'); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-orange-500 via-red-500 to-red-600 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                    <Send className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">שליחת הודעות תפוצה</h1>
                    <p className="text-white/70">צור קמפיינים ושלח הודעות לקהלים שלך</p>
                  </div>
                </div>
                
                {/* Quick Stats */}
                {stats && (
                  <div className="flex items-center gap-6 mt-6">
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{stats.campaigns}</div>
                        <div className="text-xs text-white/60">קמפיינים</div>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-white/20" />
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-green-400/30 rounded-lg">
                        <Play className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{stats.activeCampaigns}</div>
                        <div className="text-xs text-white/60">פעילים</div>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-white/20" />
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-amber-400/30 rounded-lg">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{stats.scheduledCampaigns}</div>
                        <div className="text-xs text-white/60">מתוזמנים</div>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-white/20" />
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{stats.totalSent.toLocaleString()}</div>
                        <div className="text-xs text-white/60">הודעות נשלחו</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-2 items-end">
                <span className="px-3 py-1 bg-white/20 backdrop-blur text-white text-xs font-medium rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  חדש
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl mb-6 w-fit">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-orange-600 mx-auto mb-4" />
                  <p className="text-gray-500">טוען נתונים...</p>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'campaigns' && <CampaignsTab onRefresh={fetchStats} />}
                {activeTab === 'automated' && <AutomatedCampaignsTab />}
                {activeTab === 'audiences' && <AudiencesTab onRefresh={fetchStats} />}
                {activeTab === 'templates' && <TemplatesTab onRefresh={fetchStats} />}
                {activeTab === 'contacts' && <ContactsTab onRefresh={fetchStats} />}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
