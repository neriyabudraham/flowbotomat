import { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Search, RefreshCw, Play, Pause, Settings,
  Loader2, X, Calendar, Clock, Users, MessageSquare, CheckCircle,
  AlertCircle, Eye, Zap, Timer, RotateCcw, CalendarDays, Repeat,
  ChevronDown, ChevronUp, Hash, ArrowRight, FileText, Send
} from 'lucide-react';
import api from '../../services/api';

const SCHEDULE_TYPES = {
  interval: { label: 'כל X ימים', icon: Repeat, description: 'שליחה חוזרת כל מספר ימים קבוע' },
  weekly: { label: 'שבועי', icon: CalendarDays, description: 'שליחה בימים ספציפיים בשבוע' },
  monthly: { label: 'חודשי', icon: Calendar, description: 'שליחה בתאריכים ספציפיים בחודש' },
  specific_dates: { label: 'תאריכים ספציפיים', icon: Clock, description: 'שליחה בתאריכים מוגדרים מראש' }
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
    try {
      await api.post(`/broadcasts/automated/${id}/run`);
      alert('הקמפיין הופעל!');
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה');
    }
  };

  const formatNextRun = (nextRunAt) => {
    if (!nextRunAt) return 'לא מתוזמן';
    const date = new Date(nextRunAt);
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return 'עבר';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `בעוד ${days} ימים`;
    if (hours > 0) return `בעוד ${hours} שעות`;
    return 'בקרוב';
  };

  const formatSchedule = (campaign) => {
    const { schedule_type, schedule_config, send_time } = campaign;
    const time = send_time?.substring(0, 5) || '09:00';
    
    switch (schedule_type) {
      case 'interval':
        return `כל ${schedule_config?.days || 1} ימים בשעה ${time}`;
      case 'weekly':
        const days = (schedule_config?.days || []).map(d => DAYS_OF_WEEK.find(x => x.value === d)?.label).join(', ');
        return `כל ${days || 'יום ראשון'} בשעה ${time}`;
      case 'monthly':
        const dates = (schedule_config?.dates || [1]).join(', ');
        return `בכל ${dates} לחודש בשעה ${time}`;
      case 'specific_dates':
        return `תאריכים ספציפיים בשעה ${time}`;
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
          <p className="text-sm text-gray-500 mt-1">קמפיינים חוזרים ותזמונים אוטומטיים</p>
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
          <p className="text-gray-500 mb-4">צור קמפיין חוזר שישלח הודעות אוטומטית</p>
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
            <div 
              key={campaign.id}
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
                    </div>
                    
                    {campaign.description && (
                      <p className="text-sm text-gray-500 mb-3">{campaign.description}</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Calendar className="w-4 h-4 text-amber-500" />
                        <span>{formatSchedule(campaign)}</span>
                      </div>
                      
                      {campaign.audience_name && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Users className="w-4 h-4 text-blue-500" />
                          <span>{campaign.audience_name}</span>
                        </div>
                      )}
                      
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
                    <button
                      onClick={() => handleToggle(campaign)}
                      className={`p-2.5 rounded-xl transition-all ${
                        campaign.is_active
                          ? 'bg-green-100 text-green-600 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title={campaign.is_active ? 'השהה' : 'הפעל'}
                    >
                      {campaign.is_active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => { setEditCampaign(campaign); setShowEditor(true); }}
                      className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"
                      title="ערוך"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { setViewCampaign(campaign); fetchRuns(campaign.id); }}
                      className="p-2.5 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100"
                      title="צפה בהיסטוריה"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(campaign)}
                      className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"
                      title="מחק"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                {/* Next Run Info */}
                {campaign.is_active && campaign.next_run_at && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-600">
                      <Timer className="w-4 h-4" />
                      <span className="text-sm font-medium">הרצה הבאה: {formatNextRun(campaign.next_run_at)}</span>
                      <span className="text-xs text-gray-400">
                        ({new Date(campaign.next_run_at).toLocaleString('he-IL')})
                      </span>
                    </div>
                    <button
                      onClick={() => handleRunNow(campaign.id)}
                      className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center gap-1"
                    >
                      <Zap className="w-4 h-4" />
                      הרץ עכשיו
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <CampaignEditor
          campaign={editCampaign}
          audiences={audiences}
          templates={templates}
          onClose={() => setShowEditor(false)}
          onSave={() => { setShowEditor(false); fetchAll(); }}
        />
      )}

      {/* View History Modal */}
      {viewCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold">היסטוריית הרצות - {viewCampaign.name}</h3>
              <button onClick={() => setViewCampaign(null)} className="p-2 hover:bg-gray-100 rounded-lg">
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
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          run.status === 'completed' ? 'bg-green-100 text-green-700' :
                          run.status === 'running' ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {run.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(run.started_at).toLocaleString('he-IL')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>נשלחו: {run.recipients_sent || 0}</span>
                        <span>נכשלו: {run.recipients_failed || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
 * Campaign Editor Component
 */
function CampaignEditor({ campaign, audiences, templates, onClose, onSave }) {
  const [form, setForm] = useState({
    name: campaign?.name || '',
    description: campaign?.description || '',
    schedule_type: campaign?.schedule_type || 'interval',
    schedule_config: campaign?.schedule_config || { days: 7 },
    send_time: campaign?.send_time?.substring(0, 5) || '09:00',
    audience_id: campaign?.audience_id || '',
    steps: campaign?.steps || [{ step_type: 'send', template_id: '', direct_message: '' }]
  });
  const [saving, setSaving] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState(false);

  useEffect(() => {
    if (campaign?.id) {
      loadCampaignSteps();
    }
  }, [campaign?.id]);

  const loadCampaignSteps = async () => {
    if (!campaign?.id) return;
    setLoadingSteps(true);
    try {
      const { data } = await api.get(`/broadcasts/automated/${campaign.id}`);
      if (data.campaign?.steps) {
        setForm(prev => ({ ...prev, steps: data.campaign.steps }));
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

  const addStep = () => {
    setForm(prev => ({
      ...prev,
      steps: [...prev.steps, { step_type: 'send', template_id: '', direct_message: '' }]
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

  const updateScheduleConfig = (key, value) => {
    setForm(prev => ({
      ...prev,
      schedule_config: { ...prev.schedule_config, [key]: value }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
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
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              פרטי קמפיין
            </h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הקמפיין *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="לדוגמא: ברכת יום הולדת חודשית"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                rows={2}
                placeholder="תיאור קצר של מטרת הקמפיין..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קהל יעד</label>
              <select
                value={form.audience_id}
                onChange={(e) => setForm(prev => ({ ...prev, audience_id: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              >
                <option value="">ללא קהל ספציפי</option>
                {audiences.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              תזמון
            </h4>

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(SCHEDULE_TYPES).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => setForm(prev => ({ ...prev, schedule_type: type, schedule_config: {} }))}
                  className={`p-4 rounded-xl border-2 text-right transition-all ${
                    form.schedule_type === type
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <config.icon className={`w-5 h-5 mb-2 ${form.schedule_type === type ? 'text-amber-600' : 'text-gray-400'}`} />
                  <div className="font-medium text-gray-900">{config.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{config.description}</div>
                </button>
              ))}
            </div>

            {/* Schedule Config */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              {form.schedule_type === 'interval' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">כל כמה ימים?</label>
                  <input
                    type="number"
                    min="1"
                    value={form.schedule_config.days || 7}
                    onChange={(e) => updateScheduleConfig('days', parseInt(e.target.value))}
                    className="w-32 px-4 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              )}

              {form.schedule_type === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">באילו ימים?</label>
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
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-amber-300'
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">באילו תאריכים בחודש?</label>
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
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                          (form.schedule_config.dates || []).includes(date)
                            ? 'bg-amber-500 text-white'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-amber-300'
                        }`}
                      >
                        {date}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שעת שליחה</label>
                <input
                  type="time"
                  value={form.send_time}
                  onChange={(e) => setForm(prev => ({ ...prev, send_time: e.target.value }))}
                  className="w-32 px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                שלבי הקמפיין
              </h4>
              <button
                onClick={addStep}
                className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                הוסף שלב
              </button>
            </div>

            {loadingSteps ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {form.steps.map((step, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-4 relative">
                    <div className="absolute top-2 left-2 flex items-center gap-2">
                      <span className="w-6 h-6 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {index + 1}
                      </span>
                      {form.steps.length > 1 && (
                        <button
                          onClick={() => removeStep(index)}
                          className="p-1 text-red-500 hover:bg-red-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 pt-6">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => updateStep(index, { step_type: 'send' })}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                            step.step_type === 'send'
                              ? 'bg-amber-500 text-white'
                              : 'bg-white border border-gray-200 text-gray-700'
                          }`}
                        >
                          <Send className="w-4 h-4" />
                          שלח הודעה
                        </button>
                        <button
                          onClick={() => updateStep(index, { step_type: 'wait' })}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                            step.step_type === 'wait'
                              ? 'bg-amber-500 text-white'
                              : 'bg-white border border-gray-200 text-gray-700'
                          }`}
                        >
                          <Timer className="w-4 h-4" />
                          המתן
                        </button>
                      </div>

                      {step.step_type === 'send' ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">בחר תבנית</label>
                            <select
                              value={step.template_id || ''}
                              onChange={(e) => updateStep(index, { template_id: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            >
                              <option value="">בחר תבנית...</option>
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="text-center text-xs text-gray-400">או</div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">הודעה ישירה</label>
                            <textarea
                              value={step.direct_message || ''}
                              onChange={(e) => updateStep(index, { direct_message: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              rows={2}
                              placeholder="כתוב הודעה..."
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-gray-600">המתן</label>
                          <input
                            type="number"
                            min="1"
                            value={step.wait_config?.value || 1}
                            onChange={(e) => updateStep(index, { 
                              wait_config: { ...step.wait_config, type: 'days', value: parseInt(e.target.value) }
                            })}
                            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                          <span className="text-sm text-gray-600">ימים</span>
                        </div>
                      )}
                    </div>

                    {index < form.steps.length - 1 && (
                      <div className="flex justify-center mt-4">
                        <ArrowRight className="w-5 h-5 text-gray-300 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex items-center justify-between">
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
    </div>
  );
}
