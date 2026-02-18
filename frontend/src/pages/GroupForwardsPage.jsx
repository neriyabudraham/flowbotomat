import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Forward, Play, Pause, Trash2, Edit2, X, Users, Clock, Settings,
  Search, MoreHorizontal, Copy, ChevronRight, MessageSquare, Send, Phone,
  CheckCircle, AlertCircle, Loader2, ChevronDown, Filter, RefreshCw,
  ArrowLeft, Zap, Target, Crown, UserCheck, Image, Video, Mic, FileText,
  History, LayoutGrid, Sparkles, Shield
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
import Logo from '../components/atoms/Logo';
import api from '../services/api';
import GroupForwardEditor from '../components/groupForwards/GroupForwardEditor';
import JobHistoryTab from '../components/groupForwards/JobHistoryTab';

export default function GroupForwardsPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [forwards, setForwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [editForward, setEditForward] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeError, setUpgradeError] = useState(null);
  const [limit, setLimit] = useState(null);
  const [activeJobs, setActiveJobs] = useState([]);
  const [quickSendForward, setQuickSendForward] = useState(null);
  const [activeTab, setActiveTab] = useState('forwards'); // 'forwards' | 'history'
  const [errorMessage, setErrorMessage] = useState(null);

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

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
  }, []);

  // Refetch data when user changes (for admin access)
  useEffect(() => {
    if (user?.id) {
      fetchForwards();
      fetchLimit();
      fetchActiveJobs();
    }
  }, [user?.id]);

  // Poll for active jobs updates
  useEffect(() => {
    if (activeJobs.length > 0) {
      const interval = setInterval(fetchActiveJobs, 3000);
      return () => clearInterval(interval);
    }
  }, [activeJobs.length]);

  const fetchForwards = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/group-forwards');
      setForwards(data.forwards || []);
    } catch (e) {
      console.error('Failed to fetch forwards:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLimit = async () => {
    try {
      const { data } = await api.get('/group-forwards/limit');
      setLimit(data);
    } catch (e) {
      console.error('Failed to fetch limit:', e);
    }
  };

  const fetchActiveJobs = async () => {
    try {
      const { data } = await api.get('/group-forwards/jobs/active');
      setActiveJobs(data.jobs || []);
    } catch (e) {
      console.error('Failed to fetch active jobs:', e);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    // Check limit first
    if (limit && !limit.allowed) {
      const message = limit.featureDisabled 
        ? 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את החבילה.'
        : `הגעת למגבלת ${limit.limit} העברות. שדרג את החבילה כדי ליצור עוד.`;
      setUpgradeError(message);
      setShowUpgradeModal(true);
      return;
    }
    
    try {
      setCreating(true);
      const { data } = await api.post('/group-forwards', {
        name: newName.trim(),
        description: newDesc.trim()
      });
      
      // Open the editor for the new forward
      setEditForward(data.forward);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      fetchForwards();
      fetchLimit();
    } catch (e) {
      if (e.response?.data?.code === 'LIMIT_REACHED' || e.response?.data?.code === 'FEATURE_NOT_ALLOWED' || e.response?.data?.upgrade) {
        setUpgradeError(e.response.data.error);
        setShowUpgradeModal(true);
      } else {
        setErrorMessage(e.response?.data?.error || 'שגיאה ביצירת העברה');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (forward) => {
    try {
      const { data } = await api.post(`/group-forwards/${forward.id}/toggle`);
      setForwards(forwards.map(f => f.id === forward.id ? data.forward : f));
    } catch (e) {
      setErrorMessage(e.response?.data?.error || 'שגיאה בשינוי סטטוס');
    }
  };

  const handleDuplicate = async (forward) => {
    try {
      const { data } = await api.post(`/group-forwards/${forward.id}/duplicate`);
      setForwards([data.forward, ...forwards]);
      fetchLimit();
    } catch (e) {
      if (e.response?.data?.code === 'LIMIT_REACHED' || e.response?.data?.code === 'FEATURE_NOT_ALLOWED' || e.response?.data?.upgrade) {
        setUpgradeError(e.response.data.error);
        setShowUpgradeModal(true);
      } else {
        setErrorMessage(e.response?.data?.error || 'שגיאה בשכפול');
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      await api.delete(`/group-forwards/${deleteTarget.id}`);
      setForwards(forwards.filter(f => f.id !== deleteTarget.id));
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      fetchLimit();
    } catch (e) {
      setErrorMessage(e.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const filteredForwards = forwards.filter(f =>
    f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // If editing a forward, show the editor
  if (editForward) {
    return (
      <GroupForwardEditor 
        forward={editForward}
        onClose={() => {
          setEditForward(null);
          fetchForwards();
        }}
        onSave={(updated) => {
          setForwards(forwards.map(f => f.id === updated.id ? updated : f));
        }}
      />
    );
  }

  const activeForwards = forwards.filter(f => f.is_active).length;
  const totalTargets = forwards.reduce((sum, f) => sum + (f.target_count || 0), 0);
  const totalSent = forwards.reduce((sum, f) => sum + (f.total_forwards || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30" dir="rtl">
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
                onClick={() => { localStorage.removeItem('accessToken'); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                    <Forward className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">העברת הודעות לקבוצות</h1>
                    <p className="text-white/70">שלח הודעות למספר קבוצות בו-זמנית</p>
                  </div>
                </div>
                
                {/* Quick Stats */}
                <div className="flex items-center gap-6 mt-6">
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Forward className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{forwards.length}</div>
                      <div className="text-xs text-white/60">העברות</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-green-400/30 rounded-lg">
                      <Play className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{activeForwards}</div>
                      <div className="text-xs text-white/60">פעילות</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalTargets}</div>
                      <div className="text-xs text-white/60">קבוצות יעד</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Send className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalSent}</div>
                      <div className="text-xs text-white/60">נשלחו</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                {limit && !limit.featureDisabled && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur text-white rounded-xl text-sm">
                    <span>{limit.used}/{limit.limit === -1 ? '∞' : limit.limit}</span>
                    <span className="text-white/70">מותר</span>
                  </div>
                )}
                {limit?.featureDisabled && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-500/30 backdrop-blur text-white rounded-xl text-sm">
                    <Crown className="w-4 h-4" />
                    <span>לא כלול בתוכנית</span>
                  </div>
                )}
                <button
                  onClick={() => limit && !limit.allowed ? (setUpgradeError(limit.featureDisabled ? 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את החבילה.' : `הגעת למגבלת ${limit.limit} העברות.`), setShowUpgradeModal(true)) : setShowCreate(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  <Plus className="w-5 h-5" />
                  העברה חדשה
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl">
            <button
              onClick={() => setActiveTab('forwards')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === 'forwards'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              העברות
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'forwards' ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {forwards.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="w-4 h-4" />
              היסטוריה
            </button>
          </div>

          {/* Search - only on forwards tab */}
          {activeTab === 'forwards' && (
            <div className="relative w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="חיפוש העברות..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
              />
            </div>
          )}
        </div>

        {/* Pending Jobs Alert (awaiting confirmation) */}
        {activeJobs.filter(j => j.status === 'pending').length > 0 && activeTab === 'forwards' && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-yellow-600" />
                <div>
                  <h4 className="font-medium text-yellow-900">משימות ממתינות לאישור</h4>
                  <p className="text-sm text-yellow-700">
                    {activeJobs.filter(j => j.status === 'pending').length} העברות ממתינות - אם לא יאושרו תוך 24 שעות יבוטלו אוטומטית
                  </p>
                </div>
              </div>
            </div>
            
            {/* Pending jobs list */}
            <div className="mt-4 space-y-2">
              {activeJobs.filter(j => j.status === 'pending').map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Forward className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{job.forward_name}</p>
                      <p className="text-xs text-gray-500">
                        {job.total_targets} קבוצות • ממתין מ-{new Date(job.created_at).toLocaleString('he-IL')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await api.post(`/group-forwards/jobs/${job.id}/confirm`);
                          fetchActiveJobs();
                        } catch (err) {
                          console.error('Confirm error:', err);
                          setErrorMessage('שגיאה באישור המשימה');
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5 inline ml-1" />
                      אשר ושלח
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await api.post(`/group-forwards/jobs/${job.id}/cancel`);
                          fetchActiveJobs();
                        } catch (err) {
                          console.error('Cancel error:', err);
                          setErrorMessage('שגיאה בביטול המשימה');
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5 inline ml-1" />
                      בטל
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Jobs Alert (sending) - with real-time progress */}
        {activeJobs.filter(j => j.status === 'sending' || j.status === 'confirmed').length > 0 && activeTab === 'forwards' && (
          <div className="mb-6 space-y-3">
            {activeJobs.filter(j => j.status === 'sending' || j.status === 'confirmed').map(job => (
              <div key={job.id} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    </div>
                    <div>
                      <h4 className="font-bold text-blue-900">{job.forward_name}</h4>
                      <p className="text-sm text-blue-600">
                        {job.status === 'confirmed' ? 'מתחיל לשלוח...' : 'שליחה בתהליך'}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-blue-700">
                      {job.sent_count || 0}/{job.total_targets}
                    </div>
                    <div className="text-xs text-blue-500">קבוצות נשלחו</div>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="mb-3">
                  <div className="h-3 bg-blue-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${job.progress_percent || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-blue-600">
                    <span>{job.progress_percent || 0}% הושלם</span>
                    {job.failed_count > 0 && (
                      <span className="text-red-500">{job.failed_count} נכשלו</span>
                    )}
                  </div>
                </div>
                
                {/* Current target */}
                {job.current_target_name && (
                  <div className="flex items-center gap-2 p-2 bg-white/50 rounded-lg border border-blue-100">
                    <Send className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-blue-700">שולח כעת ל:</span>
                    <span className="text-sm font-medium text-blue-900">{job.current_target_name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && <JobHistoryTab key={user?.id} />}

        {/* Forwards Tab Content */}
        {activeTab === 'forwards' && (
          <>

        {/* Forwards Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
        ) : filteredForwards.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Forward className="w-12 h-12 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              {searchQuery ? 'לא נמצאו תוצאות' : 'אין העברות עדיין'}
            </h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              {searchQuery ? 'נסה לחפש במילים אחרות' : 'צור את ההעברה הראשונה שלך והתחל לשלוח הודעות לקבוצות בקליק'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => limit && !limit.allowed ? (setUpgradeError(limit.featureDisabled ? 'התוכנית שלך לא כוללת העברת הודעות לקבוצות. שדרג את החבילה.' : `הגעת למגבלת ${limit.limit} העברות.`), setShowUpgradeModal(true)) : setShowCreate(true)}
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <Sparkles className="w-5 h-5" />
                צור את ההעברה הראשונה
              </button>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredForwards.map(forward => (
              <div
                key={forward.id}
                onClick={() => setEditForward(forward)}
                className="group relative bg-white rounded-2xl border border-gray-100 hover:border-purple-200 shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden"
              >
                {/* Status indicator */}
                <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium ${
                  forward.is_active 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {forward.is_active ? '● פעיל' : '○ מושהה'}
                </div>
                
                {/* Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                      forward.is_active 
                        ? 'bg-gradient-to-br from-purple-500 to-pink-600' 
                        : 'bg-gray-100'
                    }`}>
                      <Forward className={`w-7 h-7 ${forward.is_active ? 'text-white' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 text-lg truncate">{forward.name}</h3>
                      <p className="text-sm text-gray-500 truncate mt-1">
                        {forward.description || (forward.trigger_type === 'direct' ? 'הודעה ישירה לבוט' : 'האזנה לקבוצה')}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Stats */}
                <div className="px-6 py-4 bg-gradient-to-b from-gray-50/50 to-gray-50 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-gray-900">{forward.target_count || 0}</div>
                      <div className="text-xs text-gray-400">קבוצות</div>
                    </div>
                    <div className="text-center border-x border-gray-200">
                      <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                        <Send className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-gray-900">{forward.total_forwards || 0}</div>
                      <div className="text-xs text-gray-400">נשלחו</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-gray-900">
                        {forward.delay_min === forward.delay_max ? forward.delay_min : `${forward.delay_min}-${forward.delay_max}`}
                      </div>
                      <div className="text-xs text-gray-400">שניות</div>
                    </div>
                  </div>
                </div>
                
                {/* Actions - appear on hover */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(forward); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      forward.is_active 
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {forward.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {forward.is_active ? 'השהה' : 'הפעל'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditForward(forward); }}
                    className="p-2 bg-purple-100 text-purple-600 hover:bg-purple-200 rounded-lg transition-colors"
                    title="עריכה"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(forward); }}
                    className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    title="שכפול"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setQuickSendForward(forward); }}
                    disabled={!forward.is_active || forward.target_count === 0}
                    className="p-2 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="שלח עכשיו"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(forward); setShowDeleteConfirm(true); }}
                    className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                    title="מחיקה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {/* Create New Card */}
            <div
              onClick={() => setShowCreate(true)}
              className="group relative bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer flex items-center justify-center min-h-[280px]"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 group-hover:bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                  <Plus className="w-8 h-8 text-gray-400 group-hover:text-purple-500 transition-colors" />
                </div>
                <div className="font-semibold text-gray-600 group-hover:text-purple-600 transition-colors">צור העברה חדשה</div>
                <div className="text-sm text-gray-400 mt-1">לחץ להתחלה</div>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                  <Forward className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">יצירת העברה חדשה</h2>
                  <p className="text-sm text-gray-500">שלח הודעות לקבוצות בקלות</p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Form */}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">שם ההעברה</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="לדוגמה: עדכון יומי לקבוצות, הודעות שיווק..."
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all text-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">תיאור (אופציונלי)</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="מה ההעברה עושה? לאיזה קבוצות?"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                  rows={3}
                />
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowCreate(false)} 
                className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                ביטול
              </button>
              <button 
                onClick={handleCreate} 
                disabled={!newName.trim() || creating}
                className="flex-1 px-6 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                צור העברה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                למחוק את ההעברה?
              </h3>
              <p className="text-gray-600 mb-6">
                פעולה זו תמחק את "{deleteTarget?.name}" לצמיתות.
                <br />
                לא ניתן לשחזר פעולה זו.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                  }}
                  className="flex-1"
                >
                  ביטול
                </Button>
                <Button
                  onClick={handleDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  מחק
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowUpgradeModal(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {limit?.featureDisabled ? 'הפיצ\'ר לא זמין בתוכנית שלך' : 'הגעת למגבלת ההעברות'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {limit?.featureDisabled 
                      ? 'שדרג את התוכנית כדי להפעיל' 
                      : `${limit?.used || 0} מתוך ${limit?.limit === -1 ? '∞' : (limit?.limit || 0)} העברות`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Illustration */}
            <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl mb-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Forward className="w-8 h-8 text-white" />
                </div>
                <p className="text-purple-800 font-medium mb-2">
                  {limit?.featureDisabled 
                    ? 'העברת הודעות לקבוצות לא כלולה בתוכנית שלך'
                    : `החבילה שלך מאפשרת עד ${limit?.limit || 0} העברות`}
                </p>
                <p className="text-purple-600 text-sm">
                  {limit?.featureDisabled 
                    ? 'שדרג לתוכנית שכוללת העברת הודעות לקבוצות'
                    : 'שדרג את החבילה שלך כדי ליצור העברות נוספות ולפתוח יכולות מתקדמות'}
                </p>
              </div>
            </div>
            
            {/* Benefits */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
                <span className="text-green-800 text-sm font-medium">יותר העברות פעילות</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="text-blue-800 text-sm font-medium">יותר קבוצות יעד להעברה</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-purple-800 text-sm font-medium">שליחה מהירה ללא הגבלות</span>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={() => setShowUpgradeModal(false)} 
                className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all"
              >
                אחר כך
              </button>
              <button 
                onClick={() => {
                  setShowUpgradeModal(false);
                  navigate('/pricing');
                }}
                className="flex-1 px-6 py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Crown className="w-5 h-5" />
                שדרג עכשיו
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Send Modal */}
      {quickSendForward && (
        <QuickSendModal
          forward={quickSendForward}
          onClose={() => setQuickSendForward(null)}
          onJobCreated={fetchActiveJobs}
        />
      )}

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setErrorMessage(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">שגיאה</h3>
              <p className="text-gray-600 mb-6">{errorMessage}</p>
              
              <button
                onClick={() => setErrorMessage(null)}
                className="w-full px-4 py-2.5 text-white bg-gray-800 hover:bg-gray-900 rounded-xl font-medium transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick Send Modal Component - Redesigned
function QuickSendModal({ forward, onClose, onJobCreated }) {
  const [messageText, setMessageText] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'image' | 'video' | 'audio'
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMediaFile(file);
      setError(null);
      
      // Determine media type
      if (file.type.startsWith('image/')) {
        setMediaType('image');
      } else if (file.type.startsWith('video/')) {
        setMediaType('video');
      } else if (file.type.startsWith('audio/')) {
        setMediaType('audio');
      }
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setMediaPreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setMediaPreview(null);
      }
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
  };

  const getMessageType = () => {
    if (mediaFile) return mediaType;
    return 'text';
  };

  const handleSend = async () => {
    // Validation
    if (!messageText.trim() && !mediaFile) {
      setError('יש להזין הודעה או לצרף קובץ');
      return;
    }
    
    try {
      setSending(true);
      setError(null);
      
      // Upload media if needed
      let mediaUrl = null;
      if (mediaFile) {
        const formData = new FormData();
        formData.append('file', mediaFile);
        // Use fetch for file upload to avoid axios Content-Type issues
        const token = localStorage.getItem('accessToken');
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || 'שגיאה בהעלאת הקובץ');
        }
        mediaUrl = uploadData.url;
      }
      
      // Create job
      const { data } = await api.post(`/group-forwards/${forward.id}/jobs`, {
        message_type: getMessageType(),
        message_text: messageText,
        media_url: mediaUrl,
        media_mime_type: mediaFile?.type,
        media_filename: mediaFile?.name,
        sender_name: 'שליחה דרך האתר',
        sender_phone: 'website'
      });
      
      setJob(data.job);
      onJobCreated?.();
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה בשליחה');
      setSending(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);
      await api.post(`/group-forwards/jobs/${job.id}/confirm`);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה באישור');
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    try {
      setConfirming(true);
      await api.post(`/group-forwards/jobs/${job.id}/cancel`);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה בביטול');
      setConfirming(false);
    }
  };

  // Show confirmation screen after job created
  if (job) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <Send className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">מוכן לשליחה</h3>
            <p className="text-green-100 mt-1">ההודעה תישלח ל-{job.total_targets} קבוצות</p>
          </div>
          
          <div className="p-6">
            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            
            {/* Message Preview */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
                {getMessageType() === 'text' && <FileText className="w-4 h-4" />}
                {getMessageType() === 'image' && <Image className="w-4 h-4" />}
                {getMessageType() === 'video' && <Video className="w-4 h-4" />}
                {getMessageType() === 'audio' && <Mic className="w-4 h-4" />}
                <span>
                  {getMessageType() === 'text' && 'הודעת טקסט'}
                  {getMessageType() === 'image' && 'תמונה'}
                  {getMessageType() === 'video' && 'סרטון'}
                  {getMessageType() === 'audio' && 'הקלטה'}
                  {messageText && getMessageType() !== 'text' && ' + כיתוב'}
                </span>
              </div>
              
              {mediaPreview && (
                <img src={mediaPreview} alt="Preview" className="w-full max-h-40 object-cover rounded-xl mb-3" />
              )}
              
              {mediaFile && !mediaPreview && (
                <div className="flex items-center gap-2 p-3 bg-white rounded-xl mb-3">
                  {mediaType === 'video' && <Video className="w-5 h-5 text-purple-500" />}
                  {mediaType === 'audio' && <Mic className="w-5 h-5 text-green-500" />}
                  <span className="text-sm text-gray-700 truncate">{mediaFile.name}</span>
                </div>
              )}
              
              {messageText && (
                <p className="text-gray-700 text-sm whitespace-pre-wrap line-clamp-4">{messageText}</p>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={confirming}
                className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 px-4 py-3 text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl font-medium transition-all shadow-lg shadow-green-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {confirming ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    שלח עכשיו
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5" />
                שליחה מהירה
              </h3>
              <p className="text-purple-200 mt-1">{forward.name}</p>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-5">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          
          {/* Text Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              הודעה {mediaFile && <span className="text-gray-400 font-normal">(אופציונלי - ישמש ככיתוב)</span>}
            </label>
            <textarea
              value={messageText}
              onChange={(e) => { setMessageText(e.target.value); setError(null); }}
              placeholder="הקלד את ההודעה כאן..."
              rows={4}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 focus:bg-white resize-none transition-all"
            />
          </div>
          
          {/* File Attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              צירוף קובץ <span className="text-gray-400 font-normal">(אופציונלי)</span>
            </label>
            
            {!mediaFile ? (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="border-2 border-dashed border-gray-200 hover:border-purple-400 rounded-2xl p-6 text-center transition-colors">
                  <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Plus className="w-6 h-6 text-purple-600" />
                  </div>
                  <p className="text-sm text-gray-600">לחץ לבחירת קובץ</p>
                  <p className="text-xs text-gray-400 mt-1">תמונה, סרטון או הקלטה</p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  {mediaPreview ? (
                    <img src={mediaPreview} alt="Preview" className="w-16 h-16 object-cover rounded-xl" />
                  ) : (
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                      mediaType === 'video' ? 'bg-purple-100' : 'bg-green-100'
                    }`}>
                      {mediaType === 'video' && <Video className="w-7 h-7 text-purple-600" />}
                      {mediaType === 'audio' && <Mic className="w-7 h-7 text-green-600" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{mediaFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {mediaType === 'image' && 'תמונה'}
                      {mediaType === 'video' && 'סרטון'}
                      {mediaType === 'audio' && 'הקלטה'}
                      {' • '}
                      {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={removeMedia}
                    className="p-2 hover:bg-red-100 rounded-xl text-red-500 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Info */}
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{forward.target_count} קבוצות</p>
              <p className="text-sm text-gray-500">
                {forward.require_confirmation ? 'יידרש אישור לפני השליחה' : 'יישלח אוטומטית'}
              </p>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSend}
            disabled={sending || (!messageText.trim() && !mediaFile)}
            className="flex-1 px-4 py-3 text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 rounded-xl font-medium transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                {forward.require_confirmation ? 'המשך' : 'שלח'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
