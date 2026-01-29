import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Send, Users, MessageSquare, Clock, Calendar, Play, Pause, 
  Trash2, Edit2, X, Search, MoreHorizontal, CheckCircle, AlertCircle, 
  Loader2, RefreshCw, ArrowLeft, Target, FileText, Settings,
  LayoutGrid, History, Zap, Copy, Filter, ChevronDown, Eye
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

// Tab Components
import AudiencesTab from '../components/broadcasts/AudiencesTab';
import TemplatesTab from '../components/broadcasts/TemplatesTab';
import CampaignsTab from '../components/broadcasts/CampaignsTab';
import ContactsTab from '../components/broadcasts/ContactsTab';

export default function BroadcastsPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'audiences' | 'templates' | 'import'
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchStats(true); // Show loading only on initial load
  }, []);

  const fetchStats = async (showLoading = false) => {
    try {
      // Only show loading on initial load, not on refresh
      if (showLoading) setLoading(true);
      
      // Fetch basic stats
      const [audiencesRes, templatesRes, campaignsRes] = await Promise.all([
        api.get('/broadcasts/audiences'),
        api.get('/broadcasts/templates'),
        api.get('/broadcasts/campaigns')
      ]);
      
      setStats({
        audiences: audiencesRes.data.audiences?.length || 0,
        templates: templatesRes.data.templates?.length || 0,
        campaigns: campaignsRes.data.campaigns?.length || 0,
        activeCampaigns: campaignsRes.data.campaigns?.filter(c => c.status === 'running').length || 0
      });
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Check if user is admin
  if (user && !['admin', 'superadmin'].includes(user.role)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">גישה מוגבלת</h1>
          <p className="text-gray-600 mb-4">רק מנהלי מערכת יכולים לגשת לעמוד זה</p>
          <Button onClick={() => navigate('/dashboard')}>חזרה לדשבורד</Button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'campaigns', label: 'קמפיינים', icon: Send, color: 'blue' },
    { id: 'audiences', label: 'קהלים', icon: Users, color: 'purple' },
    { id: 'templates', label: 'תבניות', icon: MessageSquare, color: 'green' },
    { id: 'contacts', label: 'אנשי קשר', icon: Target, color: 'pink' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <Logo className="h-8" />
              <div className="h-6 w-px bg-gray-200" />
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                שליחת הודעות תפוצה
              </h1>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                בטא - מנהלים בלבד
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <NotificationsDropdown />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-700 font-semibold">
                    {user?.name?.[0] || user?.email?.[0] || '?'}
                  </span>
                </div>
                <span className="hidden md:block">{user?.name || user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Send className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.campaigns}</div>
                  <div className="text-sm text-gray-500">קמפיינים</div>
                </div>
              </div>
              {stats.activeCampaigns > 0 && (
                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  {stats.activeCampaigns} פעילים כעת
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.audiences}</div>
                  <div className="text-sm text-gray-500">קהלים</div>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.templates}</div>
                  <div className="text-sm text-gray-500">תבניות</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Tab Header */}
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? `text-${tab.color}-600 border-b-2 border-${tab.color}-600 bg-${tab.color}-50`
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                {activeTab === 'campaigns' && <CampaignsTab onRefresh={fetchStats} />}
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
