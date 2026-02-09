import { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Search, RefreshCw, Play, Pause, Settings,
  Loader2, X, Calendar, Clock, Users, MessageSquare, CheckCircle,
  AlertCircle, Eye, Zap, Timer, RotateCcw, CalendarDays, Repeat,
  ChevronDown, ChevronUp, Hash, ArrowRight, FileText, Send, 
  ArrowDown, PlayCircle, StopCircle, Target, Link2
} from 'lucide-react';
import api from '../../services/api';
import { TemplateEditorModal } from './TemplatesTab';
import { AudienceEditorModal } from './AudiencesTab';

const SCHEDULE_TYPES = {
  manual: { label: 'הפעלה ידנית', icon: PlayCircle, description: 'מופעל בלחיצה, ממשיך לפי הרצף' },
  interval: { label: 'כל X זמן', icon: Repeat, description: 'שליחה חוזרת כל מספר שעות/ימים' },
  weekly: { label: 'שבועי', icon: CalendarDays, description: 'שליחה בימים ספציפיים בשבוע' },
  monthly: { label: 'חודשי', icon: Calendar, description: 'שליחה בתאריכים ספציפיים בחודש' },
};

const DAYS_OF_WEEK = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' }
];

const STEP_TYPES = {
  send: { label: 'שלח הודעה', icon: Send, color: 'amber' },
  wait: { label: 'המתן', icon: Timer, color: 'blue' },
  trigger_campaign: { label: 'הפעל קמפיין', icon: Zap, color: 'purple' }
};

export default function AutomatedCampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewCampaign, setViewCampaign] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runningAction, setRunningAction] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

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
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/broadcasts/automated/${id}`);
      setDeleteConfirm(null);
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleRunNow = async (id) => {
    setRunningAction(id);
    try {
      await api.post(`/broadcasts/automated/${id}/run`);
      alert('הקמפיין הופעל!');
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה');
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
    const { schedule_type, schedule_config, send_time } = campaign;
    const time = send_time?.substring(0, 5) || '09:00';
    
    switch (schedule_type) {
      case 'manual':
        return 'הפעלה ידנית בלחיצה';
      case 'interval': {
        const value = schedule_config?.value || 1;
        const unit = schedule_config?.unit || 'days';
        const unitLabel = unit === 'hours' ? 'שעות' : 'ימים';
        return `כל ${value} ${unitLabel}`;
      }
      case 'weekly':
        const days = (schedule_config?.days || []).map(d => DAYS_OF_WEEK.find(x => x.value === d)?.label).join(', ');
        return `כל ${days || 'יום ראשון'} בשעה ${time}`;
      case 'monthly':
        const dates = (schedule_config?.dates || [1]).join(', ');
        return `בכל ${dates} לחודש בשעה ${time}`;
      default:
        return schedule_type;
    }
  };

  const filtered = campaigns.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            קמפיינים אוטומטיים
          </h2>
          <p className="text-sm text-gray-500 mt-1">קמפיינים חוזרים ורצפי הודעות</p>
        </div>
        <button
          onClick={() => { setEditCampaign(null); setShowEditor(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-lg transition-all font-medium"
        >
          <Plus className="w-5 h-5" />
          קמפיין חדש
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חיפוש קמפיין..."
          className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
        />
      </div>

      {/* Campaigns List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl">
          <Zap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">אין קמפיינים אוטומטיים</h3>
          <p className="text-gray-500 mb-4">צור קמפיין חוזר או רצף הודעות</p>
          <button
            onClick={() => { setEditCampaign(null); setShowEditor(true); }}
            className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
          >
            צור קמפיין ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onToggle={handleToggle}
              onEdit={() => { setEditCampaign(campaign); setShowEditor(true); }}
              onView={() => { setViewCampaign(campaign); fetchRuns(campaign.id); }}
              onDelete={() => setDeleteConfirm(campaign)}
              onRunNow={handleRunNow}
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
          onSave={() => { setShowEditor(false); fetchAll(); }}
          onRefreshData={fetchAll}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">מחיקת קמפיין</h3>
            <p className="text-gray-600 mb-6">האם למחוק את הקמפיין "{deleteConfirm.name}"?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
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
      className={`bg-white rounded-2xl border-2 ${campaign.is_active ? 'border-amber-200 shadow-amber-100' : 'border-gray-100'} shadow-sm overflow-hidden`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-bold text-lg text-gray-900">{campaign.name}</h3>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                campaign.is_active 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {campaign.is_active ? 'פעיל' : 'כבוי'}
              </span>
              {campaign.schedule_type === 'manual' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                  ידני
                </span>
              )}
            </div>
            
            {campaign.description && (
              <p className="text-sm text-gray-500 mb-3">{campaign.description}</p>
            )}
            
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-gray-600">
                <Calendar className="w-4 h-4 text-amber-500" />
                <span>{formatSchedule(campaign)}</span>
              </div>
              
              <div className="flex items-center gap-1.5 text-gray-600">
                <Hash className="w-4 h-4 text-purple-500" />
                <span>{campaign.steps_count || 0} שלבים</span>
              </div>
              
              <div className="flex items-center gap-1.5 text-gray-600">
                <RotateCcw className="w-4 h-4 text-teal-500" />
                <span>{campaign.total_sent || 0} הרצות</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {campaign.schedule_type !== 'manual' && (
              <button
                onClick={() => onToggle(campaign)}
                className={`p-2.5 rounded-xl transition-all ${
                  campaign.is_active
                    ? 'bg-green-100 text-green-600 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={campaign.is_active ? 'השהה' : 'הפעל'}
              >
                {campaign.is_active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={onEdit}
              className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"
              title="ערוך"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button
              onClick={onView}
              className="p-2.5 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100"
              title="צפה בהיסטוריה"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"
              title="מחק"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Next Run / Manual Run */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          {campaign.schedule_type === 'manual' ? (
            <div className="flex items-center gap-2 text-purple-600">
              <PlayCircle className="w-4 h-4" />
              <span className="text-sm font-medium">לחץ להפעלה ידנית</span>
            </div>
          ) : campaign.is_active && campaign.next_run_at ? (
            <div className="flex items-center gap-2 text-amber-600">
              <Timer className="w-4 h-4" />
              <span className="text-sm font-medium">הרצה הבאה: {formatNextRun(campaign.next_run_at, campaign.schedule_type)}</span>
              <span className="text-xs text-gray-400">
                ({new Date(campaign.next_run_at).toLocaleString('he-IL')})
              </span>
            </div>
          ) : (
            <div className="text-sm text-gray-400">לא מתוזמן</div>
          )}
          
          <button
            onClick={() => onRunNow(campaign.id)}
            disabled={runningAction === campaign.id}
            className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center gap-1 disabled:opacity-50"
          >
            {runningAction === campaign.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">היסטוריית הרצות - {campaign.name}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {runs.length === 0 ? (
            <p className="text-center text-gray-500 py-8">אין היסטוריה עדיין</p>
          ) : (
            <div className="space-y-3">
              {runs.map(run => (
                <div key={run.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
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
                    <span>נשלחו: {run.recipients_sent || 0}</span>
                    <span>נכשלו: {run.recipients_failed || 0}</span>
                    {run.template_name && <span>תבנית: {run.template_name}</span>}
                  </div>
                  {run.error_message && (
                    <p className="mt-2 text-sm text-red-600">{run.error_message}</p>
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
function CampaignEditor({ campaign, audiences, templates, allCampaigns, onClose, onSave, onRefreshData }) {
  const [form, setForm] = useState({
    name: campaign?.name || '',
    description: campaign?.description || '',
    schedule_type: campaign?.schedule_type || 'manual',
    schedule_config: campaign?.schedule_config || { value: 1, unit: 'days' },
    send_time: campaign?.send_time?.substring(0, 5) || '09:00',
    settings: campaign?.settings || {
      delay_between_messages: 2,
      delay_unit: 'seconds',
      batch_size: 50,
      batch_delay: 30
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
      // Default first step
      setForm(prev => ({
        ...prev,
        steps: [{ step_type: 'send', template_id: '', audience_id: '', send_time: '09:00' }]
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
          steps: [{ step_type: 'send', template_id: '', audience_id: '', send_time: '09:00' }]
        }));
      }
    } catch (e) {
      console.error('Failed to load steps:', e);
    }
    setLoadingSteps(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('נא להזין שם לקמפיין');
      return;
    }

    // Validate steps
    const sendSteps = form.steps.filter(s => s.step_type === 'send');
    if (sendSteps.length === 0) {
      alert('יש להוסיף לפחות שלב שליחה אחד');
      return;
    }

    for (const step of sendSteps) {
      if (!step.template_id) {
        alert('יש לבחור תבנית לכל שלבי השליחה');
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
      alert(e.response?.data?.error || 'שגיאה בשמירה');
    }
    setSaving(false);
  };

  const addStep = (type = 'send') => {
    const newStep = type === 'send' 
      ? { step_type: 'send', template_id: '', audience_id: '', send_time: '09:00' }
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

  const handleTemplateCreated = async (template) => {
    setShowCreateTemplate(false);
    // Refresh templates
    try {
      const { data } = await api.get('/broadcasts/templates');
      setLocalTemplates(data.templates || []);
    } catch (e) {}
    onRefreshData?.();
  };

  const handleAudienceCreated = async (audience) => {
    setShowCreateAudience(false);
    // Refresh audiences
    try {
      const { data } = await api.get('/broadcasts/audiences');
      setLocalAudiences(data.audiences || []);
    } catch (e) {}
    onRefreshData?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            {campaign ? 'עריכת קמפיין אוטומטי' : 'קמפיין אוטומטי חדש'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              פרטי קמפיין
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם הקמפיין *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                  placeholder="לדוגמא: רצף הצטרפות"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                  placeholder="תיאור קצר..."
                />
              </div>
            </div>
          </div>

          {/* Schedule Type */}
          <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              סוג הפעלה
            </h4>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(SCHEDULE_TYPES).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => setForm(prev => ({ ...prev, schedule_type: type }))}
                  className={`p-4 rounded-xl border-2 text-right transition-all ${
                    form.schedule_type === type
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <config.icon className={`w-5 h-5 mb-2 ${form.schedule_type === type ? 'text-amber-600' : 'text-gray-400'}`} />
                  <div className="font-medium text-gray-900 text-sm">{config.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{config.description}</div>
                </button>
              ))}
            </div>

            {/* Schedule Config */}
            {form.schedule_type !== 'manual' && (
              <div className="bg-white rounded-xl p-4 space-y-4 border border-gray-200">
                {form.schedule_type === 'interval' && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">כל</label>
                    <input
                      type="number"
                      min="1"
                      value={form.schedule_config.value || 1}
                      onChange={(e) => updateScheduleConfig('value', parseInt(e.target.value))}
                      className="w-20 px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <select
                      value={form.schedule_config.unit || 'days'}
                      onChange={(e) => updateScheduleConfig('unit', e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    >
                      <option value="hours">שעות</option>
                      <option value="days">ימים</option>
                    </select>
                  </div>
                )}

                {form.schedule_type === 'weekly' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">באילו ימים?</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day.value}
                          onClick={() => {
                            const current = form.schedule_config.days || [];
                            const newDays = current.includes(day.value)
                              ? current.filter(d => d !== day.value)
                              : [...current, day.value];
                            updateScheduleConfig('days', newDays);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            (form.schedule_config.days || []).includes(day.value)
                              ? 'bg-amber-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.schedule_type === 'monthly' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">באילו תאריכים?</label>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(date => (
                        <button
                          key={date}
                          onClick={() => {
                            const current = form.schedule_config.dates || [];
                            const newDates = current.includes(date)
                              ? current.filter(d => d !== date)
                              : [...current, date];
                            updateScheduleConfig('dates', newDates);
                          }}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                            (form.schedule_config.dates || []).includes(date)
                              ? 'bg-amber-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {date}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.schedule_type !== 'manual' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">שעת הפעלה</label>
                    <input
                      type="time"
                      value={form.send_time}
                      onChange={(e) => setForm(prev => ({ ...prev, send_time: e.target.value }))}
                      className="w-32 px-3 py-2 border border-gray-200 rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <details className="bg-gray-50 rounded-2xl overflow-hidden">
            <summary className="p-5 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer hover:bg-gray-100">
              <Settings className="w-5 h-5 text-gray-400" />
              הגדרות מתקדמות
              <ChevronDown className="w-4 h-4 mr-auto" />
            </summary>
            <div className="p-5 pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">השהייה בין הודעות</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={form.settings.delay_between_messages || 2}
                      onChange={(e) => updateSettings('delay_between_messages', parseInt(e.target.value))}
                      className="w-20 px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <select
                      value={form.settings.delay_unit || 'seconds'}
                      onChange={(e) => updateSettings('delay_unit', e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    >
                      <option value="seconds">שניות</option>
                      <option value="minutes">דקות</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">גודל אצווה</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={form.settings.batch_size || 50}
                    onChange={(e) => updateSettings('batch_size', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                  <p className="text-xs text-gray-400 mt-1">כמה הודעות לשלוח לפני השהייה</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">השהייה בין אצוות (שניות)</label>
                  <input
                    type="number"
                    min="10"
                    value={form.settings.batch_delay || 30}
                    onChange={(e) => updateSettings('batch_delay', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                💡 במידה ויש שגיאת timeout, המערכת תמשיך אוטומטית מאיפה שהפסיקה
              </p>
            </div>
          </details>

          {/* Steps */}
          <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-gray-400" />
              שלבי הקמפיין
            </h4>

            {loadingSteps ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500" />
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
                    onUpdate={(updates) => updateStep(index, updates)}
                    onRemove={() => removeStep(index)}
                    onMove={(dir) => moveStep(index, dir)}
                    onCreateTemplate={() => setShowCreateTemplate(true)}
                    onCreateAudience={() => setShowCreateAudience(true)}
                  />
                ))}

                {/* Add Step Buttons */}
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => addStep('send')}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    שלב שליחה
                  </button>
                  <button
                    onClick={() => addStep('wait')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    שלב המתנה
                  </button>
                  <button
                    onClick={() => addStep('trigger_campaign')}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    הפעל קמפיין
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
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
function StepEditor({ step, index, totalSteps, templates, audiences, campaigns, onUpdate, onRemove, onMove, onCreateTemplate, onCreateAudience }) {
  const config = STEP_TYPES[step.step_type];
  
  return (
    <div className={`bg-white rounded-xl p-4 border-2 border-${config.color}-200 relative`}>
      {/* Step Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 bg-${config.color}-500 text-white text-sm font-bold rounded-full flex items-center justify-center`}>
            {index + 1}
          </span>
          <span className={`text-${config.color}-700 font-medium`}>{config.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {index > 0 && (
            <button
              onClick={() => onMove(-1)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="הזז למעלה"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {index < totalSteps - 1 && (
            <button
              onClick={() => onMove(1)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="הזז למטה"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {totalSteps > 1 && (
            <button
              onClick={onRemove}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="הסר שלב"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Step Content */}
      {step.step_type === 'send' && (
        <div className="space-y-4">
          {/* Template Selection */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">תבנית הודעה *</label>
            <div className="flex gap-2">
              <select
                value={step.template_id || ''}
                onChange={(e) => onUpdate({ template_id: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">בחר תבנית...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                onClick={onCreateTemplate}
                className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200"
                title="צור תבנית חדשה"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Audience Selection (Optional) */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">קהל יעד (אופציונלי - דורס את ברירת המחדל)</label>
            <div className="flex gap-2">
              <select
                value={step.audience_id || ''}
                onChange={(e) => onUpdate({ audience_id: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">ברירת מחדל (מהקמפיין)</option>
                {audiences.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button
                onClick={onCreateAudience}
                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                title="צור קהל חדש"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Send Time (Optional) */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">שעת שליחה (אופציונלי)</label>
            <input
              type="time"
              value={step.send_time || ''}
              onChange={(e) => onUpdate({ send_time: e.target.value })}
              className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {step.step_type === 'wait' && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">המתן</label>
          <input
            type="number"
            min="1"
            value={step.wait_config?.value || 1}
            onChange={(e) => onUpdate({ 
              wait_config: { ...step.wait_config, value: parseInt(e.target.value) }
            })}
            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <select
            value={step.wait_config?.unit || 'hours'}
            onChange={(e) => onUpdate({ 
              wait_config: { ...step.wait_config, unit: e.target.value }
            })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="minutes">דקות</option>
            <option value="hours">שעות</option>
            <option value="days">ימים</option>
          </select>
        </div>
      )}

      {step.step_type === 'trigger_campaign' && (
        <div>
          <label className="block text-sm text-gray-600 mb-1">הפעל קמפיין</label>
          <select
            value={step.campaign_id || ''}
            onChange={(e) => onUpdate({ campaign_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">בחר קמפיין...</option>
            {campaigns.filter(c => c.schedule_type === 'manual').map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">רק קמפיינים עם הפעלה ידנית יכולים להיות מופעלים</p>
        </div>
      )}

      {/* Arrow to next step */}
      {index < totalSteps - 1 && (
        <div className="flex justify-center mt-4 -mb-2">
          <ArrowDown className="w-5 h-5 text-gray-300" />
        </div>
      )}
    </div>
  );
}
