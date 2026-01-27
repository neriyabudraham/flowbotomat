import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Forward, Play, Pause, Trash2, Edit2, X, Users, Clock, Settings,
  Search, MoreHorizontal, Copy, ChevronRight, MessageSquare, Send, Phone,
  CheckCircle, AlertCircle, Loader2, ChevronDown, Filter, RefreshCw,
  ArrowRight, Zap, Target, Crown, UserCheck, Image, Video, Mic, FileText
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import Logo from '../components/atoms/Logo';
import api from '../services/api';
import GroupForwardEditor from '../components/groupForwards/GroupForwardEditor';

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
      setUpgradeError(`הגעת למגבלת ${limit.limit} העברות. שדרג את החבילה כדי ליצור עוד.`);
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
      if (e.response?.data?.code === 'LIMIT_REACHED') {
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
      if (e.response?.data?.code === 'LIMIT_REACHED') {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Logo size="small" />
              <div className="h-6 w-px bg-gray-200 hidden md:block" />
              <h1 className="text-lg font-semibold text-gray-800 hidden md:block">
                העברת הודעות לקבוצות
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              <NotificationsDropdown />
              <button
                onClick={() => navigate('/dashboard')}
                className="text-sm text-gray-600 hover:text-purple-600 transition-colors"
              >
                חזרה לדשבורד
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats & Actions Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">העברות הודעות</h2>
            <p className="text-gray-600 mt-1">
              שלח הודעות למספר קבוצות בו-זמנית עם דיליי מותאם אישית
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Limit indicator */}
            {limit && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg text-sm">
                <span className="text-gray-600">
                  {limit.used}/{limit.limit === -1 ? '∞' : limit.limit}
                </span>
                <span className="text-purple-600 font-medium">העברות</span>
              </div>
            )}
            
            <Button
              onClick={() => setShowCreate(true)}
              className="gap-2"
              disabled={limit && !limit.allowed && limit.limit !== -1}
            >
              <Plus className="w-4 h-4" />
              העברה חדשה
            </Button>
          </div>
        </div>

        {/* Active Jobs Alert */}
        {activeJobs.length > 0 && (
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

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש העברות..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
            />
          </div>
        </div>

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredForwards.map(forward => (
              <div
                key={forward.id}
                className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all ${
                  forward.is_active ? 'border-green-200' : 'border-gray-200'
                }`}
              >
                {/* Card Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          forward.is_active ? 'bg-green-500' : 'bg-gray-300'
                        }`} />
                        <h3 className="font-semibold text-gray-900 truncate">
                          {forward.name}
                        </h3>
                      </div>
                      {forward.description && (
                        <p className="text-sm text-gray-500 mt-1 truncate">
                          {forward.description}
                        </p>
                      )}
                    </div>
                    
                    {/* Actions Menu */}
                    <div className="relative group">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
                        <button
                          onClick={() => setEditForward(forward)}
                          className="w-full px-3 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          עריכה
                        </button>
                        <button
                          onClick={() => handleDuplicate(forward)}
                          className="w-full px-3 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          שכפול
                        </button>
                        <button
                          onClick={() => handleToggle(forward)}
                          className="w-full px-3 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          {forward.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          {forward.is_active ? 'השבת' : 'הפעל'}
                        </button>
                        <hr className="my-1" />
                        <button
                          onClick={() => {
                            setDeleteTarget(forward);
                            setShowDeleteConfirm(true);
                          }}
                          className="w-full px-3 py-2 text-right text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          מחיקה
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-3">
                  {/* Trigger Type */}
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="w-4 h-4 text-purple-500" />
                    <span className="text-gray-600">טריגר:</span>
                    <span className="font-medium text-gray-900">
                      {forward.trigger_type === 'direct' ? 'הודעה ישירה לבוט' : 'האזנה לקבוצה'}
                    </span>
                  </div>
                  
                  {/* Target Count */}
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-blue-500" />
                    <span className="text-gray-600">קבוצות יעד:</span>
                    <span className="font-medium text-gray-900">
                      {forward.target_count || 0}
                    </span>
                  </div>

                  {/* Delay */}
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-orange-500" />
                    <span className="text-gray-600">השהייה:</span>
                    <span className="font-medium text-gray-900">
                      {forward.delay_min === forward.delay_max 
                        ? `${forward.delay_min} שניות`
                        : `${forward.delay_min}-${forward.delay_max} שניות`}
                    </span>
                  </div>

                  {/* Authorized Senders */}
                  <div className="flex items-center gap-2 text-sm">
                    <UserCheck className="w-4 h-4 text-green-500" />
                    <span className="text-gray-600">שולחים מורשים:</span>
                    <span className="font-medium text-gray-900">
                      {forward.sender_count || 0}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="pt-3 border-t border-gray-100 flex justify-between text-sm text-gray-500">
                    <span>נשלחו: {forward.total_forwards || 0}</span>
                    <span>
                      {forward.last_forward_at 
                        ? `אחרון: ${formatDate(forward.last_forward_at)}` 
                        : 'עדיין לא נשלחו'}
                    </span>
                  </div>
                </div>

                {/* Card Footer - Quick Actions */}
                <div className="px-5 py-3 bg-gray-50/50 rounded-b-2xl flex gap-2">
                  <button
                    onClick={() => setEditForward(forward)}
                    className="flex-1 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Settings className="w-4 h-4" />
                    הגדרות
                  </button>
                  <button
                    onClick={() => setQuickSendForward(forward)}
                    disabled={!forward.is_active || forward.target_count === 0}
                    className="flex-1 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    שלח עכשיו
                  </button>
                </div>
              </div>
            ))}
          </div>
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
