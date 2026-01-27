import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Forward, Play, Pause, Trash2, Edit2, X, Users, Clock, Settings,
  Search, MoreHorizontal, Copy, ChevronRight, MessageSquare, Send, Phone,
  CheckCircle, AlertCircle, Loader2, ChevronDown, Filter, RefreshCw,
  ArrowLeft, Zap, Target, Crown, UserCheck, Image, Video, Mic, FileText,
  History, LayoutGrid
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
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

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchForwards();
    fetchLimit();
    fetchActiveJobs();
  }, []);

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
        alert(e.response?.data?.error || 'שגיאה ביצירת העברה');
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
      alert(e.response?.data?.error || 'שגיאה בשינוי סטטוס');
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
        alert(e.response?.data?.error || 'שגיאה בשכפול');
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
      alert(e.response?.data?.error || 'שגיאה במחיקה');
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
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-bold text-sm">
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

        {/* Active Jobs Alert */}
        {activeJobs.length > 0 && activeTab === 'forwards' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <div>
                <h4 className="font-medium text-blue-900">יש משימות פעילות</h4>
                <p className="text-sm text-blue-700">
                  {activeJobs.length} העברות בתהליך שליחה
                </p>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && <JobHistoryTab />}

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
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl flex items-center justify-center">
              <Forward className="w-10 h-10 text-purple-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchQuery ? 'לא נמצאו העברות' : 'אין העברות עדיין'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery ? 'נסה לחפש משהו אחר' : 'צור העברה חדשה כדי להתחיל לשלוח הודעות לקבוצות'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                צור העברה ראשונה
              </Button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">יצירת העברה חדשה</h3>
                <button
                  onClick={() => setShowCreate(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  שם ההעברה
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="למשל: עדכון יומי לקבוצות"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  תיאור (אופציונלי)
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="תיאור קצר של ההעברה..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none"
                />
              </div>
            </div>
            
            <div className="p-6 pt-0 flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowCreate(false)}
                className="flex-1"
              >
                ביטול
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex-1 gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                צור והגדר
              </Button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                <Crown className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                שדרג את החבילה שלך
              </h3>
              <p className="text-gray-600 mb-6">
                {upgradeError || 'שדרג לחבילה מתקדמת יותר כדי ליצור עוד העברות'}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1"
                >
                  אחר כך
                </Button>
                <Button
                  onClick={() => navigate('/pricing')}
                  className="flex-1 gap-2"
                >
                  <Crown className="w-4 h-4" />
                  לדף התמחור
                </Button>
              </div>
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
    </div>
  );
}

// Quick Send Modal Component
function QuickSendModal({ forward, onClose, onJobCreated }) {
  const [messageType, setMessageType] = useState('text');
  const [messageText, setMessageText] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMediaFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setMediaPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if (messageType === 'text' && !messageText.trim()) {
      alert('יש להזין הודעה');
      return;
    }
    
    if (messageType !== 'text' && !mediaFile) {
      alert('יש לבחור קובץ');
      return;
    }
    
    try {
      setSending(true);
      
      // Upload media if needed
      let mediaUrl = null;
      if (mediaFile) {
        const formData = new FormData();
        formData.append('file', mediaFile);
        const uploadRes = await api.post('/upload', formData);
        mediaUrl = uploadRes.data.url;
      }
      
      // Create job
      const { data } = await api.post(`/group-forwards/${forward.id}/jobs`, {
        message_type: messageType,
        message_text: messageText,
        media_url: mediaUrl,
        media_mime_type: mediaFile?.type,
        media_filename: mediaFile?.name
      });
      
      setJob(data.job);
      onJobCreated?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשליחה');
      setSending(false);
    }
  };

  const handleConfirm = async () => {
    try {
      await api.post(`/group-forwards/jobs/${job.id}/confirm`);
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה באישור');
    }
  };

  const handleCancel = async () => {
    try {
      await api.post(`/group-forwards/jobs/${job.id}/cancel`);
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בביטול');
    }
  };

  // Show confirmation screen after job created
  if (job) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
              <Send className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              מוכן לשליחה
            </h3>
            <p className="text-gray-600 mb-6">
              ההודעה תישלח ל-<strong>{job.total_targets}</strong> קבוצות
              <br />
              <span className="text-sm">עם השהייה משתנה בין קבוצה לקבוצה</span>
            </p>
            
            {/* Message Preview */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-right">
              <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
                {messageType === 'text' && <FileText className="w-4 h-4" />}
                {messageType === 'image' && <Image className="w-4 h-4" />}
                {messageType === 'video' && <Video className="w-4 h-4" />}
                {messageType === 'audio' && <Mic className="w-4 h-4" />}
                <span>
                  {messageType === 'text' && 'הודעת טקסט'}
                  {messageType === 'image' && 'תמונה'}
                  {messageType === 'video' && 'סרטון'}
                  {messageType === 'audio' && 'הקלטה'}
                </span>
              </div>
              {messageText && (
                <p className="text-gray-700 text-sm line-clamp-3">{messageText}</p>
              )}
              {mediaPreview && messageType === 'image' && (
                <img src={mediaPreview} alt="Preview" className="w-20 h-20 object-cover rounded-lg mt-2" />
              )}
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={handleCancel}
                className="flex-1"
              >
                ביטול
              </Button>
              <Button
                onClick={handleConfirm}
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
              >
                <Send className="w-4 h-4" />
                שלח עכשיו
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">
              שליחה מהירה - {forward.name}
            </h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Message Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סוג ההודעה
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { type: 'text', icon: FileText, label: 'טקסט' },
                { type: 'image', icon: Image, label: 'תמונה' },
                { type: 'video', icon: Video, label: 'סרטון' },
                { type: 'audio', icon: Mic, label: 'הקלטה' },
              ].map(item => (
                <button
                  key={item.type}
                  onClick={() => setMessageType(item.type)}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    messageType === item.type
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <item.icon className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-xs">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Media Upload */}
          {messageType !== 'text' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {messageType === 'image' && 'בחר תמונה'}
                {messageType === 'video' && 'בחר סרטון'}
                {messageType === 'audio' && 'בחר הקלטה'}
              </label>
              <input
                type="file"
                accept={
                  messageType === 'image' ? 'image/*' :
                  messageType === 'video' ? 'video/*' :
                  'audio/*'
                }
                onChange={handleFileChange}
                className="w-full p-3 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-400"
              />
              {mediaPreview && messageType === 'image' && (
                <img src={mediaPreview} alt="Preview" className="mt-2 w-24 h-24 object-cover rounded-lg" />
              )}
            </div>
          )}
          
          {/* Text / Caption */}
          {messageType !== 'audio' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {messageType === 'text' ? 'הודעה' : 'כיתוב (אופציונלי)'}
              </label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="הקלד את ההודעה כאן..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none"
              />
            </div>
          )}
          
          {/* Info */}
          <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
            <strong>{forward.target_count}</strong> קבוצות יקבלו את ההודעה
            {forward.require_confirmation && ' (לאחר אישור שלך)'}
          </div>
        </div>
        
        <div className="p-6 pt-0 flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            ביטול
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || (messageType === 'text' && !messageText.trim()) || (messageType !== 'text' && !mediaFile)}
            className="flex-1 gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {forward.require_confirmation ? 'המשך' : 'שלח'}
          </Button>
        </div>
      </div>
    </div>
  );
}
