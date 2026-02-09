import { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Search, RefreshCw, Play, Pause, Settings,
  Loader2, X, Calendar, Clock, Users, MessageSquare, CheckCircle,
  AlertCircle, Eye, Zap, Timer, RotateCcw, CalendarDays, Repeat,
  ChevronDown, ChevronUp, Hash, ArrowRight, FileText, Send, 
  ArrowDown, PlayCircle, StopCircle, Target, Link2, Ban, Sparkles,
  AlertTriangle, Info
} from 'lucide-react';
import api from '../../services/api';
import { TemplateEditorModal } from './TemplatesTab';
import { AudienceEditorModal } from './AudiencesTab';

const SCHEDULE_TYPES = {
  manual: { label: 'הפעלה ידנית', icon: PlayCircle, description: 'מופעל בלחיצה' },
  interval: { label: 'כל X זמן', icon: Repeat, description: 'חוזר כל מספר שעות/ימים' },
  weekly: { label: 'שבועי', icon: CalendarDays, description: 'בימים בשבוע' },
  monthly: { label: 'חודשי', icon: Calendar, description: 'בתאריכים בחודש' },
};

const DAYS_OF_WEEK = [
  { value: 0, label: 'ראשון', short: 'א' },
  { value: 1, label: 'שני', short: 'ב' },
  { value: 2, label: 'שלישי', short: 'ג' },
  { value: 3, label: 'רביעי', short: 'ד' },
  { value: 4, label: 'חמישי', short: 'ה' },
  { value: 5, label: 'שישי', short: 'ו' },
  { value: 6, label: 'שבת', short: 'ש' }
];

const STEP_TYPES = {
  send: { label: 'שלח הודעה', icon: Send, color: 'amber' },
  wait: { label: 'המתן', icon: Timer, color: 'blue' },
  trigger_campaign: { label: 'הפעל קמפיין', icon: Zap, color: 'purple' }
};

/**
 * Toast/Notification Component
 */
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />
  };

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg ${colors[type]} animate-slide-down`}>
      {icons[type]}
      <span className="font-medium">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-black/10 rounded-lg transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Confirmation Modal Component
 */
function ConfirmModal({ title, message, confirmText = 'אישור', cancelText = 'ביטול', type = 'danger', onConfirm, onCancel, loading }) {
  const typeStyles = {
    danger: { icon: Trash2, iconBg: 'bg-red-100', iconColor: 'text-red-500', btnBg: 'bg-red-500 hover:bg-red-600' },
    warning: { icon: AlertTriangle, iconBg: 'bg-amber-100', iconColor: 'text-amber-500', btnBg: 'bg-amber-500 hover:bg-amber-600' },
    info: { icon: Info, iconBg: 'bg-blue-100', iconColor: 'text-blue-500', btnBg: 'bg-blue-500 hover:bg-blue-600' },
    success: { icon: Zap, iconBg: 'bg-green-100', iconColor: 'text-green-500', btnBg: 'bg-green-500 hover:bg-green-600' }
  };
  
  const style = typeStyles[type];
  const Icon = style.icon;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className={`w-14 h-14 ${style.iconBg} rounded-xl flex items-center justify-center mx-auto mb-4`}>
          <Icon className={`w-7 h-7 ${style.iconColor}`} />
        </div>
        <h3 className="text-xl font-bold text-center mb-2">{title}</h3>
        <p className="text-gray-500 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${style.btnBg}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AutomatedCampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [runConfirm, setRunConfirm] = useState(null);
  const [viewCampaign, setViewCampaign] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runningAction, setRunningAction] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [campaignsRes, audiencesRes, templatesRes] = await Promise.all([
        api.get('/broadcasts/automated'),
        api.get('/broadcasts/audiences'),
        api.get('/broadcasts/templates')
      ]);
      setCampaigns(campaignsRes.data.campaigns || []);
      setAudiences(audiencesRes.data.audiences || []);
      setTemplates(templatesRes.data.templates || []);
    } catch (e) {
      console.error('Failed to fetch:', e);
      showToast('שגיאה בטעינת נתונים', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRuns = async (campaignId) => {
    try {
      const { data } = await api.get(`/broadcasts/automated/${campaignId}/runs`);
      setRuns(data.runs || []);
    } catch (e) {
      console.error('Failed to fetch runs:', e);
    }
  };

  const handleToggle = async (campaign) => {
    try {
      await api.patch(`/broadcasts/automated/${campaign.id}/toggle`, { is_active: !campaign.is_active });
      showToast(campaign.is_active ? 'הקמפיין הושהה' : 'הקמפיין הופעל', 'success');
      fetchAll();
    } catch (e) {
      showToast(e.response?.data?.error || 'שגיאה בעדכון סטטוס', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/broadcasts/automated/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      showToast('הקמפיין נמחק בהצלחה', 'success');
      fetchAll();
    } catch (e) {
      showToast(e.response?.data?.error || 'שגיאה במחיקה', 'error');
    }
  };

  const handleRunNow = async () => {
    if (!runConfirm) return;
    setRunningAction(runConfirm.id);
    try {
      const { data } = await api.post(`/broadcasts/automated/${runConfirm.id}/run`);
      setRunConfirm(null);
      showToast(data.message || 'הקמפיין הופעל בהצלחה!', 'success');
      fetchAll();
    } catch (e) {
      showToast(e.response?.data?.error || 'שגיאה בהפעלת הקמפיין', 'error');
    }
    setRunningAction(null);
  };

  const formatNextRun = (nextRunAt, scheduleType) => {
    if (scheduleType === 'manual') return 'הפעלה ידנית';
    if (!nextRunAt) return 'לא מתוזמן';
    
    const date = new Date(nextRunAt);
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return 'עבר';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `בעוד ${days} ימים`;
    if (hours > 0) return `בעוד ${hours} שעות`;
    if (minutes > 0) return `בעוד ${minutes} דקות`;
    return 'בקרוב';
  };

  const formatSchedule = (campaign) => {
    const { schedule_type, schedule_config } = campaign;
    
    switch (schedule_type) {
      case 'manual':
        return 'הפעלה ידנית';
      case 'interval': {
        const value = schedule_config?.value || 1;
        const unit = schedule_config?.unit || 'days';
        const unitLabel = unit === 'hours' ? 'שעות' : 'ימים';
        return `כל ${value} ${unitLabel}`;
      }
      case 'weekly': {
        const dayTimes = schedule_config?.day_times || {};
        const dayCount = Object.keys(dayTimes).length;
        return dayCount > 0 ? `${dayCount} ימים בשבוע` : 'שבועי';
      }
      case 'monthly': {
        const dateTimes = schedule_config?.date_times || {};
        const dateCount = Object.keys(dateTimes).length;
        return dateCount > 0 ? `${dateCount} תאריכים בחודש` : 'חודשי';
      }
      default:
        return schedule_type;
    }
  };

  const filtered = campaigns.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש קמפיינים..."
              className="pl-4 pr-10 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-400"
            />
          </div>
          <button
            onClick={fetchAll}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <button
          onClick={() => { setEditCampaign(null); setShowEditor(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium"
        >
          <Plus className="w-4 h-4" />
          צור קמפיין חדש
        </button>
      </div>

      {/* Campaigns List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-10 h-10 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">אין קמפיינים אוטומטיים</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">צור קמפיין חוזר או רצף הודעות אוטומטי</p>
          <button
            onClick={() => { setEditCampaign(null); setShowEditor(true); }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 font-medium shadow-lg shadow-orange-500/25"
          >
            <Sparkles className="w-5 h-5" />
            צור קמפיין ראשון
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onToggle={handleToggle}
              onEdit={() => { setEditCampaign(campaign); setShowEditor(true); }}
              onView={() => { setViewCampaign(campaign); fetchRuns(campaign.id); }}
              onDelete={() => setDeleteConfirm(campaign)}
              onRunNow={() => setRunConfirm(campaign)}
              runningAction={runningAction}
              formatSchedule={formatSchedule}
              formatNextRun={formatNextRun}
            />
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <CampaignEditor
          campaign={editCampaign}
          audiences={audiences}
          templates={templates}
          allCampaigns={campaigns.filter(c => c.id !== editCampaign?.id)}
          onClose={() => setShowEditor(false)}
          onSave={() => { setShowEditor(false); fetchAll(); showToast(editCampaign ? 'הקמפיין עודכן בהצלחה' : 'הקמפיין נוצר בהצלחה'); }}
          onRefreshData={fetchAll}
          showToast={showToast}
        />
      )}

      {/* View History Modal */}
      {viewCampaign && (
        <CampaignRunsModal
          campaign={viewCampaign}
          runs={runs}
          onClose={() => setViewCampaign(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <ConfirmModal
          title="מחיקת קמפיין"
          message={`האם למחוק את הקמפיין "${deleteConfirm.name}"? פעולה זו בלתי הפיכה.`}
          confirmText="מחק"
          type="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Run Confirm */}
      {runConfirm && (
        <ConfirmModal
          title="הפעלת קמפיין"
          message={`להפעיל את הקמפיין "${runConfirm.name}" עכשיו? ההודעות יישלחו מיד לכל הנמענים.`}
          confirmText="הפעל עכשיו"
          type="success"
          onConfirm={handleRunNow}
          onCancel={() => setRunConfirm(null)}
          loading={runningAction === runConfirm.id}
        />
      )}
    </div>
  );
}

/**
 * Campaign Card Component
 */
function CampaignCard({ campaign, onToggle, onEdit, onView, onDelete, onRunNow, runningAction, formatSchedule, formatNextRun }) {
  return (
    <div 
      className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-orange-200 transition-all cursor-pointer"
      onClick={onEdit}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
              campaign.is_active 
                ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-green-500/20' 
                : 'bg-gradient-to-br from-gray-400 to-gray-500 shadow-gray-500/20'
            }`}>
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatSchedule(campaign)}
              </span>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
            campaign.is_active 
              ? 'bg-green-100 text-green-700' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {campaign.is_active ? 'פעיל' : 'כבוי'}
          </span>
        </div>
        
        {campaign.description && (
          <p className="text-sm text-gray-500 mb-3 line-clamp-2">{campaign.description}</p>
        )}
        
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-4">
          <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg">
            <Hash className="w-3 h-3" />
            {campaign.steps_count || 0} שלבים
          </span>
          <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg">
            <RotateCcw className="w-3 h-3" />
            {campaign.total_sent || 0} הרצות
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          {campaign.schedule_type !== 'manual' && (
            <button
              onClick={() => onToggle(campaign)}
              className={`p-2 rounded-lg transition-all ${
                campaign.is_active
                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={campaign.is_active ? 'השהה' : 'הפעל'}
            >
              {campaign.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onView}
            className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
            title="היסטוריה"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            title="מחק"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRunNow}
            disabled={runningAction === campaign.id}
            className="mr-auto px-3 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg text-xs font-medium hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {runningAction === campaign.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            הרץ עכשיו
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Campaign Runs Modal
 */
function CampaignRunsModal({ campaign, runs, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">היסטוריית הרצות</h3>
              <p className="text-sm text-gray-500">{campaign.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {runs.length === 0 ? (
            <div className="text-center py-12">
              <RotateCcw className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">אין היסטוריה עדיין</p>
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map(run => (
                <div key={run.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        run.status === 'completed' ? 'bg-green-100 text-green-700' :
                        run.status === 'running' ? 'bg-blue-100 text-blue-700' :
                        run.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {run.status === 'completed' ? 'הושלם' :
                         run.status === 'running' ? 'פועל' :
                         run.status === 'paused' ? 'מושהה' : 'נכשל'}
                      </span>
                      {run.step_order !== undefined && (
                        <span className="text-xs text-gray-500">שלב {run.step_order + 1}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(run.started_at).toLocaleString('he-IL')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      {run.recipients_sent || 0} נשלחו
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      {run.recipients_failed || 0} נכשלו
                    </span>
                  </div>
                  {run.error_message && (
                    <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">{run.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Campaign Editor Component
 */
function CampaignEditor({ campaign, audiences, templates, allCampaigns, onClose, onSave, onRefreshData, showToast }) {
  const [form, setForm] = useState({
    name: campaign?.name || '',
    description: campaign?.description || '',
    schedule_type: campaign?.schedule_type || 'manual',
    schedule_config: campaign?.schedule_config || { value: 1, unit: 'days', day_times: {}, date_times: {} },
    send_time: campaign?.send_time?.substring(0, 5) || '09:00',
    settings: campaign?.settings || {
      delay_between_messages: 2,
      delay_unit: 'seconds',
      messages_per_group: 50,
      group_delay: 30,
      excluded_days: [],
      excluded_hours_start: null,
      excluded_hours_end: null
    },
    steps: []
  });
  const [saving, setSaving] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showCreateAudience, setShowCreateAudience] = useState(false);
  const [localTemplates, setLocalTemplates] = useState(templates);
  const [localAudiences, setLocalAudiences] = useState(audiences);

  useEffect(() => {
    if (campaign?.id) {
      loadCampaignSteps();
    } else {
      setForm(prev => ({
        ...prev,
        steps: [{ step_type: 'send', template_id: '', audience_id: '', send_time: '' }]
      }));
    }
  }, [campaign?.id]);

  useEffect(() => {
    setLocalTemplates(templates);
    setLocalAudiences(audiences);
  }, [templates, audiences]);

  const loadCampaignSteps = async () => {
    if (!campaign?.id) return;
    setLoadingSteps(true);
    try {
      const { data } = await api.get(`/broadcasts/automated/${campaign.id}`);
      if (data.campaign?.steps && data.campaign.steps.length > 0) {
        setForm(prev => ({ ...prev, steps: data.campaign.steps }));
      } else {
        setForm(prev => ({
          ...prev,
          steps: [{ step_type: 'send', template_id: '', audience_id: '', send_time: '' }]
        }));
      }
    } catch (e) {
      console.error('Failed to load steps:', e);
    }
    setLoadingSteps(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('נא להזין שם לקמפיין', 'error');
      return;
    }

    const sendSteps = form.steps.filter(s => s.step_type === 'send');
    if (sendSteps.length === 0) {
      showToast('יש להוסיף לפחות שלב שליחה אחד', 'error');
      return;
    }

    for (const step of sendSteps) {
      if (!step.template_id) {
        showToast('יש לבחור תבנית לכל שלבי השליחה', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      if (campaign?.id) {
        await api.put(`/broadcasts/automated/${campaign.id}`, form);
      } else {
        await api.post('/broadcasts/automated', form);
      }
      onSave();
    } catch (e) {
      showToast(e.response?.data?.error || 'שגיאה בשמירה', 'error');
    }
    setSaving(false);
  };

  const addStep = (type = 'send') => {
    const newStep = type === 'send' 
      ? { step_type: 'send', template_id: '', audience_id: '', send_time: '' }
      : type === 'wait'
      ? { step_type: 'wait', wait_config: { value: 1, unit: 'hours' } }
      : { step_type: 'trigger_campaign', campaign_id: '' };
    
    setForm(prev => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }));
  };

  const removeStep = (index) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }));
  };

  const updateStep = (index, updates) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => i === index ? { ...s, ...updates } : s)
    }));
  };

  const moveStep = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= form.steps.length) return;
    
    setForm(prev => {
      const newSteps = [...prev.steps];
      [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
      return { ...prev, steps: newSteps };
    });
  };

  const updateScheduleConfig = (key, value) => {
    setForm(prev => ({
      ...prev,
      schedule_config: { ...prev.schedule_config, [key]: value }
    }));
  };

  const updateSettings = (key, value) => {
    setForm(prev => ({
      ...prev,
      settings: { ...prev.settings, [key]: value }
    }));
  };

  const toggleDayTime = (dayValue) => {
    const dayTimes = { ...form.schedule_config.day_times };
    if (dayTimes[dayValue]) {
      delete dayTimes[dayValue];
    } else {
      dayTimes[dayValue] = '09:00';
    }
    updateScheduleConfig('day_times', dayTimes);
  };

  const updateDayTime = (dayValue, time) => {
    const dayTimes = { ...form.schedule_config.day_times };
    dayTimes[dayValue] = time;
    updateScheduleConfig('day_times', dayTimes);
  };

  const toggleDateTime = (date) => {
    const dateTimes = { ...form.schedule_config.date_times };
    if (dateTimes[date]) {
      delete dateTimes[date];
    } else {
      dateTimes[date] = '09:00';
    }
    updateScheduleConfig('date_times', dateTimes);
  };

  const updateDateTime = (date, time) => {
    const dateTimes = { ...form.schedule_config.date_times };
    dateTimes[date] = time;
    updateScheduleConfig('date_times', dateTimes);
  };

  const toggleExcludedDay = (dayValue) => {
    const excluded = form.settings.excluded_days || [];
    const newExcluded = excluded.includes(dayValue)
      ? excluded.filter(d => d !== dayValue)
      : [...excluded, dayValue];
    updateSettings('excluded_days', newExcluded);
  };

  const handleTemplateCreated = async () => {
    setShowCreateTemplate(false);
    try {
      const { data } = await api.get('/broadcasts/templates');
      setLocalTemplates(data.templates || []);
    } catch (e) {}
    onRefreshData?.();
  };

  const handleAudienceCreated = async () => {
    setShowCreateAudience(false);
    try {
      const { data } = await api.get('/broadcasts/audiences');
      setLocalAudiences(data.audiences || []);
    } catch (e) {}
    onRefreshData?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{campaign ? 'עריכת קמפיין אוטומטי' : 'קמפיין אוטומטי חדש'}</h3>
              <p className="text-sm text-gray-500">הגדר רצף הודעות אוטומטי</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basic Info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" />
              פרטי קמפיין
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">שם הקמפיין *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all"
                  placeholder="לדוגמא: רצף הצטרפות"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">תיאור</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all"
                  placeholder="תיאור קצר..."
                />
              </div>
            </div>
          </div>

          {/* Schedule Type */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              סוג הפעלה
            </h4>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(SCHEDULE_TYPES).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => setForm(prev => ({ ...prev, schedule_type: type }))}
                  className={`p-3 rounded-xl border-2 text-right transition-all ${
                    form.schedule_type === type
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-gray-200 bg-white hover:border-orange-200'
                  }`}
                >
                  <config.icon className={`w-5 h-5 mb-1.5 ${form.schedule_type === type ? 'text-orange-600' : 'text-gray-400'}`} />
                  <div className={`font-semibold text-sm ${form.schedule_type === type ? 'text-orange-900' : 'text-gray-700'}`}>{config.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{config.description}</div>
                </button>
              ))}
            </div>

            {/* Schedule Config */}
            {form.schedule_type !== 'manual' && (
              <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-4">
                {form.schedule_type === 'interval' && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-600 font-medium">כל</span>
                    <input
                      type="number"
                      min="1"
                      value={form.schedule_config.value || 1}
                      onChange={(e) => updateScheduleConfig('value', parseInt(e.target.value))}
                      className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-center font-semibold"
                    />
                    <select
                      value={form.schedule_config.unit || 'days'}
                      onChange={(e) => updateScheduleConfig('unit', e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-xl font-medium"
                    >
                      <option value="hours">שעות</option>
                      <option value="days">ימים</option>
                    </select>
                  </div>
                )}

                {form.schedule_type === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">בחר ימים ושעות:</label>
                    <div className="grid grid-cols-7 gap-2">
                      {DAYS_OF_WEEK.map(day => {
                        const isSelected = form.schedule_config.day_times?.[day.value];
                        return (
                          <div key={day.value} className="text-center">
                            <button
                              onClick={() => toggleDayTime(day.value)}
                              className={`w-full py-2 px-1 rounded-xl text-sm font-bold transition-all mb-1.5 ${
                                isSelected
                                  ? 'bg-orange-500 text-white shadow-lg'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {day.label}
                            </button>
                            {isSelected && (
                              <input
                                type="time"
                                value={form.schedule_config.day_times[day.value] || '09:00'}
                                onChange={(e) => updateDayTime(day.value, e.target.value)}
                                className="w-full px-1 py-1 text-xs border border-gray-200 rounded-lg"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.schedule_type === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">בחר תאריכים ושעות:</label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(date => {
                        const isSelected = form.schedule_config.date_times?.[date];
                        return (
                          <div key={date} className="text-center">
                            <button
                              onClick={() => toggleDateTime(date)}
                              className={`w-full h-9 rounded-lg text-sm font-bold transition-all ${
                                isSelected
                                  ? 'bg-orange-500 text-white shadow-lg'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {date}
                            </button>
                            {isSelected && (
                              <input
                                type="time"
                                value={form.schedule_config.date_times[date] || '09:00'}
                                onChange={(e) => updateDateTime(date, e.target.value)}
                                className="w-full px-0.5 py-0.5 text-[10px] border border-gray-200 rounded mt-1"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              שלבי הקמפיין
            </h4>

            {loadingSteps ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {form.steps.map((step, index) => (
                  <StepEditor
                    key={index}
                    step={step}
                    index={index}
                    totalSteps={form.steps.length}
                    templates={localTemplates}
                    audiences={localAudiences}
                    campaigns={allCampaigns}
                    scheduleType={form.schedule_type}
                    onUpdate={(updates) => updateStep(index, updates)}
                    onRemove={() => removeStep(index)}
                    onMove={(dir) => moveStep(index, dir)}
                    onCreateTemplate={() => setShowCreateTemplate(true)}
                    onCreateAudience={() => setShowCreateAudience(true)}
                  />
                ))}

                {/* Add Step Buttons */}
                <div className="flex items-center justify-center gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => addStep('send')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-lg transition-all text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    שליחה
                  </button>
                  <button
                    onClick={() => addStep('wait')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:shadow-lg transition-all text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    המתנה
                  </button>
                  <button
                    onClick={() => addStep('trigger_campaign')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    הפעל קמפיין
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <details className="bg-gray-50 rounded-xl overflow-hidden">
            <summary className="p-4 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer hover:bg-gray-100 transition-colors">
              <Settings className="w-4 h-4 text-gray-400" />
              הגדרות מתקדמות
              <ChevronDown className="w-4 h-4 mr-auto text-gray-400" />
            </summary>
            <div className="p-4 pt-0 space-y-4 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">השהייה בין הודעות</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={form.settings.delay_between_messages || 2}
                      onChange={(e) => updateSettings('delay_between_messages', parseInt(e.target.value))}
                      className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-center text-sm"
                    />
                    <select
                      value={form.settings.delay_unit || 'seconds'}
                      onChange={(e) => updateSettings('delay_unit', e.target.value)}
                      className="px-2 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="seconds">שניות</option>
                      <option value="minutes">דקות</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">הודעות לפני הפסקה</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={form.settings.messages_per_group || 50}
                    onChange={(e) => updateSettings('messages_per_group', parseInt(e.target.value))}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">הפסקה בין קבוצות (שניות)</label>
                  <input
                    type="number"
                    min="10"
                    value={form.settings.group_delay || 30}
                    onChange={(e) => updateSettings('group_delay', parseInt(e.target.value))}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Do Not Send Section */}
              <div className="pt-3 border-t border-gray-200">
                <h5 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                  <Ban className="w-4 h-4 text-red-500" />
                  לא לשלוח
                </h5>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5">ימים מוחרגים:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day.value}
                          onClick={() => toggleExcludedDay(day.value)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            (form.settings.excluded_days || []).includes(day.value)
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5">שעות מוחרגות:</label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm">מ:</span>
                      <input
                        type="time"
                        value={form.settings.excluded_hours_start || ''}
                        onChange={(e) => updateSettings('excluded_hours_start', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                      <span className="text-gray-500 text-sm">עד:</span>
                      <input
                        type="time"
                        value={form.settings.excluded_hours_end || ''}
                        onChange={(e) => updateSettings('excluded_hours_end', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-gray-50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 font-medium transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center gap-2 font-medium transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {campaign ? 'שמור שינויים' : 'צור קמפיין'}
          </button>
        </div>
      </div>

      {/* Create Template Modal */}
      {showCreateTemplate && (
        <TemplateEditorModal
          onClose={() => setShowCreateTemplate(false)}
          onSave={handleTemplateCreated}
        />
      )}

      {/* Create Audience Modal */}
      {showCreateAudience && (
        <AudienceEditorModal
          onClose={() => setShowCreateAudience(false)}
          onSave={handleAudienceCreated}
        />
      )}
    </div>
  );
}

/**
 * Step Editor Component
 */
function StepEditor({ step, index, totalSteps, templates, audiences, campaigns, scheduleType, onUpdate, onRemove, onMove, onCreateTemplate, onCreateAudience }) {
  const config = STEP_TYPES[step.step_type];
  const colorClasses = {
    amber: { border: 'border-amber-200', bg: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-700' },
    blue: { border: 'border-blue-200', bg: 'bg-blue-500', bgLight: 'bg-blue-50', text: 'text-blue-700' },
    purple: { border: 'border-purple-200', bg: 'bg-purple-500', bgLight: 'bg-purple-50', text: 'text-purple-700' }
  };
  const colors = colorClasses[config.color];
  
  return (
    <div className={`bg-white rounded-xl p-4 border ${colors.border} relative`}>
      {/* Step Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 ${colors.bg} text-white text-sm font-bold rounded-lg flex items-center justify-center`}>
            {index + 1}
          </span>
          <div className={`px-2.5 py-1 ${colors.bgLight} ${colors.text} rounded-lg font-medium flex items-center gap-1.5 text-sm`}>
            <config.icon className="w-3.5 h-3.5" />
            {config.label}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {index > 0 && (
            <button
              onClick={() => onMove(-1)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {index < totalSteps - 1 && (
            <button
              onClick={() => onMove(1)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {totalSteps > 1 && (
            <button
              onClick={onRemove}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Step Content */}
      {step.step_type === 'send' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תבנית הודעה *</label>
            <div className="flex gap-2">
              <select
                value={step.template_id || ''}
                onChange={(e) => onUpdate({ template_id: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 text-sm"
              >
                <option value="">בחר תבנית...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                onClick={onCreateTemplate}
                className="px-3 py-2 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קהל יעד (אופציונלי)</label>
              <div className="flex gap-2">
                <select
                  value={step.audience_id || ''}
                  onChange={(e) => onUpdate({ audience_id: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-200 text-sm"
                >
                  <option value="">מהקמפיין</option>
                  {audiences.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button
                  onClick={onCreateAudience}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {scheduleType !== 'manual' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שעת שליחה</label>
                <input
                  type="time"
                  value={step.send_time || ''}
                  onChange={(e) => onUpdate({ send_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {step.step_type === 'wait' && (
        <div className="flex items-center gap-3">
          <span className="text-gray-600 font-medium text-sm">המתן</span>
          <input
            type="number"
            min="1"
            value={step.wait_config?.value || 1}
            onChange={(e) => onUpdate({ 
              wait_config: { ...step.wait_config, value: parseInt(e.target.value) }
            })}
            className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-center font-semibold text-sm"
          />
          <select
            value={step.wait_config?.unit || 'hours'}
            onChange={(e) => onUpdate({ 
              wait_config: { ...step.wait_config, unit: e.target.value }
            })}
            className="px-3 py-2 border border-gray-200 rounded-xl font-medium text-sm"
          >
            <option value="minutes">דקות</option>
            <option value="hours">שעות</option>
            <option value="days">ימים</option>
          </select>
        </div>
      )}

      {step.step_type === 'trigger_campaign' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">הפעל קמפיין</label>
          <select
            value={step.campaign_id || ''}
            onChange={(e) => onUpdate({ campaign_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 text-sm"
          >
            <option value="">בחר קמפיין...</option>
            {campaigns.filter(c => c.schedule_type === 'manual').map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">רק קמפיינים עם הפעלה ידנית</p>
        </div>
      )}
    </div>
  );
}
