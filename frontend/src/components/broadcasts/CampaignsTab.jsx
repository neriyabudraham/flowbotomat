import { useState, useEffect, useRef } from 'react';
import { 
  Plus, Send, Trash2, Edit2, Search, RefreshCw, Play, Pause,
  Loader2, X, Calendar, Clock, Users, MessageSquare, CheckCircle,
  AlertCircle, XCircle, Eye, Settings, Target, Sparkles, Download,
  Copy, CalendarOff, BarChart3, ChevronDown, FileText, Zap,
  ArrowRight, TrendingUp, Timer, RotateCcw
} from 'lucide-react';
import api from '../../services/api';

const STATUS_CONFIG = {
  draft: { label: 'טיוטה', color: 'gray', bgColor: 'bg-gray-100', textColor: 'text-gray-700', icon: Edit2 },
  scheduled: { label: 'מתוזמן', color: 'blue', bgColor: 'bg-blue-100', textColor: 'text-blue-700', icon: Calendar },
  running: { label: 'פעיל', color: 'emerald', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700', icon: Play },
  paused: { label: 'מושהה', color: 'amber', bgColor: 'bg-amber-100', textColor: 'text-amber-700', icon: Pause },
  completed: { label: 'הושלם', color: 'green', bgColor: 'bg-green-100', textColor: 'text-green-700', icon: CheckCircle },
  cancelled: { label: 'בוטל', color: 'red', bgColor: 'bg-red-100', textColor: 'text-red-700', icon: XCircle },
  failed: { label: 'נכשל', color: 'red', bgColor: 'bg-red-100', textColor: 'text-red-700', icon: AlertCircle }
};

// Helper: Convert ISO/UTC date to datetime-local format (YYYY-MM-DDTHH:MM in local time)
function toLocalDateTimeString(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  // Format as local datetime
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper: Get min datetime for datetime-local input (now in local format)
function getMinDateTime() {
  return toLocalDateTimeString(new Date().toISOString());
}

export default function CampaignsTab({ onRefresh }) {
  const [campaigns, setCampaigns] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewCampaign, setViewCampaign] = useState(null);
  const [campaignStats, setCampaignStats] = useState(null);
  const [showReschedule, setShowReschedule] = useState(null);
  const [newScheduleTime, setNewScheduleTime] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [campaignsRes, audiencesRes, templatesRes] = await Promise.all([
        api.get('/broadcasts/campaigns'),
        api.get('/broadcasts/audiences'),
        api.get('/broadcasts/templates')
      ]);
      setCampaigns(campaignsRes.data.campaigns || []);
      setAudiences(audiencesRes.data.audiences || []);
      setTemplates(templatesRes.data.templates || []);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignStats = async (id) => {
    try {
      const { data } = await api.get(`/broadcasts/campaigns/${id}/stats`);
      setCampaignStats(data.stats);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/broadcasts/campaigns/${id}`);
      setDeleteConfirm(null);
      fetchAll();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקת קמפיין');
    }
  };

  const handleAction = async (id, action) => {
    try {
      setActionLoading(`${id}-${action}`);
      await api.post(`/broadcasts/campaigns/${id}/${action}`);
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בביצוע פעולה');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReschedule = async () => {
    if (!showReschedule || !newScheduleTime) return;
    try {
      setActionLoading('reschedule');
      // Convert local datetime to ISO string (which includes timezone info)
      const scheduledDate = new Date(newScheduleTime);
      await api.put(`/broadcasts/campaigns/${showReschedule.id}`, {
        scheduled_at: scheduledDate.toISOString()
      });
      setShowReschedule(null);
      setNewScheduleTime('');
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בעדכון תזמון');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSchedule = async (campaign) => {
    try {
      setActionLoading(`${campaign.id}-cancel-schedule`);
      await api.put(`/broadcasts/campaigns/${campaign.id}`, {
        scheduled_at: null,
        status: 'draft'
      });
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בביטול תזמון');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async (campaign) => {
    try {
      setActionLoading(`${campaign.id}-duplicate`);
      await api.post('/broadcasts/campaigns', {
        name: `${campaign.name} (העתק)`,
        description: campaign.description,
        audience_id: campaign.audience_id,
        template_id: campaign.template_id,
        direct_message: campaign.direct_message,
        settings: campaign.settings
      });
      fetchAll();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשכפול קמפיין');
    } finally {
      setActionLoading(null);
    }
  };

  const downloadReport = async (campaign) => {
    try {
      setActionLoading(`${campaign.id}-report`);
      const { data } = await api.get(`/broadcasts/campaigns/${campaign.id}/report`);
      
      // Create CSV content
      const headers = ['טלפון', 'שם', 'סטטוס', 'נשלח בתאריך', 'שגיאה'];
      const rows = (data.recipients || []).map(r => [
        r.phone,
        r.display_name || '',
        r.status === 'sent' ? 'נשלח' : r.status === 'failed' ? 'נכשל' : 'ממתין',
        r.sent_at ? new Date(r.sent_at).toLocaleString('he-IL') : '',
        r.error || ''
      ]);
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
      
      // Add BOM for Hebrew support
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-report-${campaign.name}-${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהורדת דוח');
    } finally {
      setActionLoading(null);
    }
  };

  const openView = async (campaign) => {
    setViewCampaign(campaign);
    setCampaignStats(null);
    fetchCampaignStats(campaign.id);
  };

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Group campaigns by status for overview
  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => ['running', 'scheduled'].includes(c.status)).length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    draft: campaigns.filter(c => c.status === 'draft').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
                <Send className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
                <div className="text-xs text-blue-600">סה"כ קמפיינים</div>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-4 border border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-900">{stats.active}</div>
                <div className="text-xs text-emerald-600">פעילים/מתוזמנים</div>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl p-4 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-900">{stats.completed}</div>
                <div className="text-xs text-green-600">הושלמו</div>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-2xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-500 flex items-center justify-center">
                <Edit2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.draft}</div>
                <div className="text-xs text-gray-600">טיוטות</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש קמפיינים..."
              className="pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="">כל הסטטוסים</option>
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          
          <button
            onClick={fetchAll}
            className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <button
          onClick={() => setShowCreate(true)}
          disabled={audiences.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg shadow-blue-500/25 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          צור קמפיין חדש
        </button>
      </div>

      {audiences.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="font-medium text-amber-900">נדרש קהל לפני יצירת קמפיין</div>
            <div className="text-sm text-amber-700">עבור ללשונית "קהלים" כדי ליצור קהל חדש.</div>
          </div>
        </div>
      )}

      {/* Campaigns List */}
      {filteredCampaigns.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Send className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">אין קמפיינים עדיין</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">צור קמפיין כדי לשלוח הודעות תפוצה לאנשי הקשר שלך</p>
          {audiences.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 font-medium shadow-lg shadow-blue-500/25"
            >
              <Sparkles className="w-5 h-5" />
              צור קמפיין ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onView={() => openView(campaign)}
              onEdit={() => setEditCampaign(campaign)}
              onDelete={() => setDeleteConfirm(campaign)}
              onAction={handleAction}
              onReschedule={() => {
                setShowReschedule(campaign);
                setNewScheduleTime(toLocalDateTimeString(campaign.scheduled_at));
              }}
              onCancelSchedule={() => handleCancelSchedule(campaign)}
              onDuplicate={() => handleDuplicate(campaign)}
              onDownloadReport={() => downloadReport(campaign)}
              actionLoading={actionLoading}
              onRefresh={fetchAll}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editCampaign) && (
        <CampaignEditorModal
          campaign={editCampaign}
          audiences={audiences}
          templates={templates}
          onClose={() => { setShowCreate(false); setEditCampaign(null); }}
          onSaved={() => {
            setShowCreate(false);
            setEditCampaign(null);
            fetchAll();
            onRefresh?.();
          }}
        />
      )}

      {/* View Campaign Modal */}
      {viewCampaign && (
        <CampaignViewModal
          campaign={viewCampaign}
          stats={campaignStats}
          onClose={() => { setViewCampaign(null); setCampaignStats(null); }}
          onDownloadReport={() => downloadReport(viewCampaign)}
        />
      )}

      {/* Reschedule Modal */}
      {showReschedule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReschedule(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">שינוי תזמון</h3>
                <p className="text-sm text-gray-500">{showReschedule.name}</p>
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">תאריך ושעה חדשים</label>
              <input
                type="datetime-local"
                value={newScheduleTime}
                onChange={(e) => setNewScheduleTime(e.target.value)}
                min={getMinDateTime()}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowReschedule(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleReschedule}
                disabled={!newScheduleTime || actionLoading === 'reschedule'}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'reschedule' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                עדכן תזמון
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת קמפיין</h3>
              <p className="text-gray-600 mb-6">האם למחוק את הקמפיין "{deleteConfirm.name}"?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                >
                  מחק
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Campaign Card Component
// =============================================
function CampaignCard({ campaign, onView, onEdit, onDelete, onAction, onReschedule, onCancelSchedule, onDuplicate, onDownloadReport, actionLoading, onRefresh }) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [liveProgress, setLiveProgress] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const menuButtonRef = useRef(null);
  const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;
  
  // Countdown timer for scheduled campaigns
  useEffect(() => {
    let interval;
    if (campaign.status === 'scheduled' && campaign.scheduled_at) {
      const updateCountdown = () => {
        const now = new Date().getTime();
        const scheduledTime = new Date(campaign.scheduled_at).getTime();
        const diff = scheduledTime - now;
        
        if (diff <= 0) {
          setCountdown({ expired: true, text: 'מתחיל עכשיו...' });
          // Poll for status change when time has passed
          return true; // Signal to start polling
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        let text = '';
        if (hours > 0) {
          text = `${hours} שעות ${minutes} דקות`;
        } else if (minutes > 0) {
          text = `${minutes} דקות ${seconds} שניות`;
        } else {
          text = `${seconds} שניות`;
        }
        
        setCountdown({ expired: false, text, hours, minutes, seconds });
        return false;
      };
      
      // Initial update
      const shouldPoll = updateCountdown();
      
      if (shouldPoll) {
        // Start polling for status change
        const pollInterval = setInterval(async () => {
          try {
            const { data } = await api.get(`/broadcasts/campaigns/${campaign.id}`);
            if (data.campaign?.status !== 'scheduled') {
              onRefresh?.();
              clearInterval(pollInterval);
            }
          } catch (e) {
            console.error('Error polling campaign status:', e);
          }
        }, 3000);
        
        return () => clearInterval(pollInterval);
      } else {
        // Update countdown every second
        interval = setInterval(() => {
          const shouldStartPolling = updateCountdown();
          if (shouldStartPolling) {
            clearInterval(interval);
            // Start polling
            const pollInterval = setInterval(async () => {
              try {
                const { data } = await api.get(`/broadcasts/campaigns/${campaign.id}`);
                if (data.campaign?.status !== 'scheduled') {
                  onRefresh?.();
                  clearInterval(pollInterval);
                }
              } catch (e) {
                console.error('Error polling campaign status:', e);
              }
            }, 3000);
          }
        }, 1000);
      }
    } else {
      setCountdown(null);
    }
    
    return () => clearInterval(interval);
  }, [campaign.id, campaign.status, campaign.scheduled_at, onRefresh]);
  
  // Poll for progress when campaign is running
  useEffect(() => {
    let interval;
    if (campaign.status === 'running') {
      const fetchProgress = async () => {
        try {
          const { data } = await api.get(`/broadcasts/campaigns/${campaign.id}/progress`);
          setLiveProgress(data);
          
          // If status changed, refresh the list
          if (data.campaign?.status !== 'running') {
            onRefresh?.();
          }
        } catch (e) {
          console.error('Error fetching progress:', e);
        }
      };
      
      fetchProgress();
      interval = setInterval(fetchProgress, 2000); // Poll every 2 seconds
    } else {
      setLiveProgress(null);
    }
    
    return () => clearInterval(interval);
  }, [campaign.id, campaign.status, onRefresh]);
  
  const progress = campaign.total_recipients 
    ? Math.round((campaign.sent_count || 0) / campaign.total_recipients * 100) 
    : 0;

  return (
    <div className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-blue-200 transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className={`w-14 h-14 rounded-xl ${status.bgColor} flex items-center justify-center flex-shrink-0`}>
              <StatusIcon className={`w-7 h-7 ${status.textColor}`} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-gray-900 text-lg truncate">{campaign.name}</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.textColor}`}>
                  {status.label}
                </span>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                {campaign.audience_name && (
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {campaign.audience_name}
                  </span>
                )}
                {campaign.template_name && (
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    {campaign.template_name}
                  </span>
                )}
              </div>
              
              {campaign.scheduled_at && campaign.status === 'scheduled' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg w-fit">
                    <Calendar className="w-4 h-4" />
                    מתוזמן ל-{new Date(campaign.scheduled_at).toLocaleString('he-IL')}
                  </div>
                  
                  {/* Countdown display */}
                  {countdown && (
                    countdown.expired ? (
                      <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="font-medium">{countdown.text}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                        <Timer className="w-4 h-4" />
                        <span>נשלח בעוד: <strong>{countdown.text}</strong></span>
                      </div>
                    )
                  )}
                </div>
              )}
              
              {campaign.status === 'running' && (
                <div className="mt-2 space-y-2">
                  {/* Live action indicator */}
                  {liveProgress?.liveProgress?.currentAction && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{liveProgress.liveProgress.currentAction}</span>
                    </div>
                  )}
                  
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">
                        {liveProgress?.stats?.sent || campaign.sent_count || 0} / {campaign.total_recipients || 0} נשלחו
                        {(liveProgress?.stats?.failed || campaign.failed_count || 0) > 0 && (
                          <span className="text-red-500 mr-2">
                            ({liveProgress?.stats?.failed || campaign.failed_count} נכשלו)
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-emerald-600">
                        {liveProgress?.stats?.sent 
                          ? Math.round((liveProgress.stats.sent / campaign.total_recipients) * 100)
                          : progress}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-500"
                        style={{ width: `${liveProgress?.stats?.sent 
                          ? Math.round((liveProgress.stats.sent / campaign.total_recipients) * 100)
                          : progress}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Recent recipients */}
                  {liveProgress?.recentRecipients?.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {liveProgress.recentRecipients.slice(0, 3).map((r, i) => (
                        <div key={i} className="flex items-center gap-1">
                          {r.status === 'sent' ? (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500" />
                          )}
                          <span>{r.contact_name || r.phone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {campaign.status === 'completed' && (
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    {campaign.sent_count || 0} נשלחו
                  </span>
                  {campaign.failed_count > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="w-4 h-4" />
                      {campaign.failed_count} נכשלו
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Primary Actions based on status */}
            {campaign.status === 'draft' && (
              <button
                onClick={() => onAction(campaign.id, 'start')}
                disabled={actionLoading === `${campaign.id}-start`}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm rounded-xl hover:from-emerald-600 hover:to-green-600 flex items-center gap-1.5 font-medium shadow-lg shadow-emerald-500/25"
              >
                {actionLoading === `${campaign.id}-start` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                התחל
              </button>
            )}
            
            {campaign.status === 'running' && (
              <button
                onClick={() => onAction(campaign.id, 'pause')}
                disabled={actionLoading === `${campaign.id}-pause`}
                className="px-4 py-2 bg-amber-100 text-amber-700 text-sm rounded-xl hover:bg-amber-200 flex items-center gap-1.5 font-medium"
              >
                {actionLoading === `${campaign.id}-pause` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                השהה
              </button>
            )}
            
            {campaign.status === 'paused' && (
              <button
                onClick={() => onAction(campaign.id, 'resume')}
                disabled={actionLoading === `${campaign.id}-resume`}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm rounded-xl hover:from-emerald-600 hover:to-green-600 flex items-center gap-1.5 font-medium shadow-lg shadow-emerald-500/25"
              >
                {actionLoading === `${campaign.id}-resume` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                המשך
              </button>
            )}
            
            {['running', 'paused'].includes(campaign.status) && (
              <button
                onClick={() => onAction(campaign.id, 'cancel')}
                disabled={actionLoading === `${campaign.id}-cancel`}
                className="px-4 py-2 bg-red-100 text-red-600 text-sm rounded-xl hover:bg-red-200 flex items-center gap-1.5 font-medium"
              >
                <XCircle className="w-4 h-4" />
                בטל
              </button>
            )}
            
            {/* View Button */}
            <button
              onClick={onView}
              className="p-2.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-xl transition-colors"
              title="פרטים"
            >
              <Eye className="w-4 h-4" />
            </button>
            
            {/* More Actions Menu */}
            <div className="relative">
              <button
                ref={menuButtonRef}
                onClick={() => {
                  if (!showMenu && menuButtonRef.current) {
                    const rect = menuButtonRef.current.getBoundingClientRect();
                    setMenuPosition({
                      top: rect.bottom + 4,
                      left: rect.left - 140 // Adjust for RTL and menu width
                    });
                  }
                  setShowMenu(!showMenu);
                }}
                className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
              </button>
              
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div 
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 py-1 w-48 z-50"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                  >
                    {['draft', 'scheduled'].includes(campaign.status) && (
                      <button
                        onClick={() => { onEdit(); setShowMenu(false); }}
                        className="w-full px-4 py-2.5 text-right text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        עריכה
                      </button>
                    )}
                    
                    {campaign.status === 'scheduled' && (
                      <>
                        <button
                          onClick={() => { onReschedule(); setShowMenu(false); }}
                          className="w-full px-4 py-2.5 text-right text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Calendar className="w-4 h-4" />
                          שינוי תזמון
                        </button>
                        <button
                          onClick={() => { onCancelSchedule(); setShowMenu(false); }}
                          disabled={actionLoading === `${campaign.id}-cancel-schedule`}
                          className="w-full px-4 py-2.5 text-right text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <CalendarOff className="w-4 h-4" />
                          ביטול תזמון
                        </button>
                      </>
                    )}
                    
                    <button
                      onClick={() => { onDuplicate(); setShowMenu(false); }}
                      disabled={actionLoading === `${campaign.id}-duplicate`}
                      className="w-full px-4 py-2.5 text-right text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      שכפול
                    </button>
                    
                    {['completed', 'cancelled', 'failed'].includes(campaign.status) && (
                      <button
                        onClick={() => { onDownloadReport(); setShowMenu(false); }}
                        disabled={actionLoading === `${campaign.id}-report`}
                        className="w-full px-4 py-2.5 text-right text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        הורד דוח
                      </button>
                    )}
                    
                    <div className="border-t border-gray-100 my-1" />
                    
                    <button
                      onClick={() => { onDelete(); setShowMenu(false); }}
                      className="w-full px-4 py-2.5 text-right text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      מחק
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Campaign Editor Modal
// =============================================
function CampaignEditorModal({ campaign, audiences, templates, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    name: campaign?.name || '',
    description: campaign?.description || '',
    audience_id: campaign?.audience_id || '',
    template_id: campaign?.template_id || '',
    direct_message: campaign?.direct_message || '',
    direct_media_url: campaign?.direct_media_url || '',
    scheduled_at: toLocalDateTimeString(campaign?.scheduled_at),
    settings: campaign?.settings || {
      delay_between_messages: 2,
      delay_between_batches: 30,
      batch_size: 50
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.audience_id) {
      setError('יש למלא שם וקהל יעד');
      return;
    }
    
    if (!formData.template_id && !formData.direct_message) {
      setError('יש לבחור תבנית או לכתוב הודעה');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // Convert local datetime to ISO string if provided
      const scheduledAt = formData.scheduled_at 
        ? new Date(formData.scheduled_at).toISOString() 
        : null;
      
      const payload = {
        ...formData,
        scheduled_at: scheduledAt,
        template_id: formData.template_id || null,
        direct_message: formData.direct_message || null,
        direct_media_url: formData.direct_media_url || null
      };
      
      if (campaign) {
        await api.put(`/broadcasts/campaigns/${campaign.id}`, payload);
      } else {
        await api.post('/broadcasts/campaigns', payload);
      }
      
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה בשמירת קמפיין');
    } finally {
      setSaving(false);
    }
  };

  const selectedAudience = audiences.find(a => a.id === formData.audience_id);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                <Send className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {campaign ? 'עריכת קמפיין' : 'יצירת קמפיין חדש'}
                </h3>
                <p className="text-blue-100 text-sm">שלח הודעות לאנשי קשר</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Name & Audience */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שם הקמפיין *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setError(null); }}
                placeholder="לדוגמה: מבצע חגים"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">קהל יעד *</label>
              <select
                value={formData.audience_id}
                onChange={(e) => { setFormData({ ...formData, audience_id: e.target.value }); setError(null); }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
              >
                <option value="">בחר קהל...</option>
                {audiences.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({(a.contacts_count || 0).toLocaleString()} אנשי קשר)
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {selectedAudience && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium text-blue-900">{selectedAudience.name}</div>
                <div className="text-sm text-blue-600">{(selectedAudience.contacts_count || 0).toLocaleString()} אנשי קשר יקבלו את ההודעה</div>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">תיאור (אופציונלי)</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="תיאור קצר של הקמפיין..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
            />
          </div>
          
          {/* Message Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">תוכן ההודעה *</label>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, direct_message: '', direct_media_url: '' })}
                className={`p-4 border-2 rounded-xl text-right transition-all ${
                  formData.template_id && !formData.direct_message
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className={`w-5 h-5 ${formData.template_id ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="font-medium">מתבנית</span>
                </div>
                <select
                  value={formData.template_id}
                  onChange={(e) => setFormData({ ...formData, template_id: e.target.value, direct_message: '', direct_media_url: '' })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">בחר תבנית...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </button>
              
              <div className={`p-4 border-2 rounded-xl transition-all ${
                formData.direct_message && !formData.template_id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <Edit2 className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">הודעה ישירה</span>
                </div>
                <textarea
                  value={formData.direct_message}
                  onChange={(e) => setFormData({ ...formData, direct_message: e.target.value, template_id: '' })}
                  placeholder="כתוב הודעה..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                />
              </div>
            </div>
          </div>
          
          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">תזמון (אופציונלי)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  min={getMinDateTime()}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
                />
              </div>
              {formData.scheduled_at && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, scheduled_at: '' })}
                  className="p-3 text-gray-500 hover:bg-gray-100 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">השאר ריק לשליחה ידנית</p>
          </div>
          
          {/* Advanced Settings */}
          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <Settings className="w-4 h-4" />
              הגדרות מתקדמות
              <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
            </button>
            
            {showSettings && (
              <div className="grid md:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">דיליי בין הודעות (שניות)</label>
                  <input
                    type="number"
                    value={formData.settings.delay_between_messages}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, delay_between_messages: parseInt(e.target.value) || 2 }
                    })}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">דיליי בין קבוצות (שניות)</label>
                  <input
                    type="number"
                    value={formData.settings.delay_between_batches}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, delay_between_batches: parseInt(e.target.value) || 30 }
                    })}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">גודל קבוצה</label>
                  <input
                    type="number"
                    value={formData.settings.batch_size}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, batch_size: parseInt(e.target.value) || 50 }
                    })}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3 flex-shrink-0 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.name.trim() || !formData.audience_id || (!formData.template_id && !formData.direct_message)}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
            {campaign ? 'שמור שינויים' : 'צור קמפיין'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Campaign View Modal
// =============================================
function CampaignViewModal({ campaign, stats, onClose, onDownloadReport }) {
  const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className={`p-3 ${status.bgColor} rounded-2xl`}>
                <StatusIcon className={`w-6 h-6 ${status.textColor}`} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{campaign.name}</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.textColor}`}>
                  {status.label}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 p-4 border-b border-gray-100">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <div className="text-2xl font-bold text-gray-900">{stats.total?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">סה״כ</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <div className="text-2xl font-bold text-green-600">{stats.sent?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">נשלחו</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-xl">
              <div className="text-2xl font-bold text-red-600">{stats.failed?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">נכשלו</div>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="p-6 space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">קהל:</span>
            <span className="font-medium">{campaign.audience_name || '-'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">תבנית:</span>
            <span className="font-medium">{campaign.template_name || 'הודעה ישירה'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">נוצר:</span>
            <span className="font-medium">{new Date(campaign.created_at).toLocaleString('he-IL')}</span>
          </div>
          {campaign.scheduled_at && (
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">מתוזמן ל:</span>
              <span className="font-medium text-blue-600">{new Date(campaign.scheduled_at).toLocaleString('he-IL')}</span>
            </div>
          )}
          {campaign.started_at && (
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">התחיל:</span>
              <span className="font-medium">{new Date(campaign.started_at).toLocaleString('he-IL')}</span>
            </div>
          )}
          {campaign.completed_at && (
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">הסתיים:</span>
              <span className="font-medium">{new Date(campaign.completed_at).toLocaleString('he-IL')}</span>
            </div>
          )}
          
          {campaign.description && (
            <div className="pt-2">
              <span className="text-gray-500 text-sm">תיאור:</span>
              <p className="text-gray-700 mt-1">{campaign.description}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {['completed', 'cancelled', 'failed'].includes(campaign.status) && (
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={onDownloadReport}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg shadow-blue-500/25"
            >
              <Download className="w-5 h-5" />
              הורד דוח שליחה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
