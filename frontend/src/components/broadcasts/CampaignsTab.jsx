import { useState, useEffect } from 'react';
import { 
  Plus, Send, Trash2, Edit2, Search, RefreshCw, Play, Pause,
  Loader2, X, Calendar, Clock, Users, MessageSquare, CheckCircle,
  AlertCircle, XCircle, Eye, Settings, MoreHorizontal, Target
} from 'lucide-react';
import api from '../../services/api';

const STATUS_CONFIG = {
  draft: { label: 'טיוטה', color: 'gray', icon: Edit2 },
  scheduled: { label: 'מתוזמן', color: 'blue', icon: Calendar },
  running: { label: 'פעיל', color: 'green', icon: Play },
  paused: { label: 'מושהה', color: 'yellow', icon: Pause },
  completed: { label: 'הושלם', color: 'green', icon: CheckCircle },
  cancelled: { label: 'בוטל', color: 'red', icon: XCircle },
  failed: { label: 'נכשל', color: 'red', icon: AlertCircle }
};

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
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    audience_id: '',
    template_id: '',
    direct_message: '',
    scheduled_at: '',
    settings: {
      delay_between_messages: 2,
      delay_between_batches: 30,
      batch_size: 50
    }
  });

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

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.audience_id) return;
    
    try {
      await api.post('/broadcasts/campaigns', {
        ...formData,
        scheduled_at: formData.scheduled_at || null
      });
      setShowCreate(false);
      resetForm();
      fetchAll();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת קמפיין');
    }
  };

  const handleUpdate = async () => {
    if (!formData.name.trim() || !editCampaign) return;
    
    try {
      await api.put(`/broadcasts/campaigns/${editCampaign.id}`, {
        ...formData,
        scheduled_at: formData.scheduled_at || null
      });
      setEditCampaign(null);
      resetForm();
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בעדכון קמפיין');
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
      await api.post(`/broadcasts/campaigns/${id}/${action}`);
      fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בביצוע פעולה');
    }
  };

  const openEdit = (campaign) => {
    setFormData({
      name: campaign.name,
      description: campaign.description || '',
      audience_id: campaign.audience_id || '',
      template_id: campaign.template_id || '',
      direct_message: campaign.direct_message || '',
      scheduled_at: campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : '',
      settings: campaign.settings || {
        delay_between_messages: 2,
        delay_between_batches: 30,
        batch_size: 50
      }
    });
    setEditCampaign(campaign);
  };

  const openView = async (campaign) => {
    setViewCampaign(campaign);
    fetchCampaignStats(campaign.id);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      audience_id: '',
      template_id: '',
      direct_message: '',
      scheduled_at: '',
      settings: {
        delay_between_messages: 2,
        delay_between_batches: 30,
        batch_size: 50
      }
    });
  };

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
              className="pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">כל הסטטוסים</option>
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          
          <button
            onClick={fetchAll}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <button
          onClick={() => setShowCreate(true)}
          disabled={audiences.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          צור קמפיין חדש
        </button>
      </div>

      {audiences.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          <AlertCircle className="w-4 h-4 inline ml-2" />
          יש ליצור קהל לפני יצירת קמפיין. עבור ללשונית "קהלים" כדי ליצור קהל חדש.
        </div>
      )}

      {/* Campaigns List */}
      {filteredCampaigns.length === 0 ? (
        <div className="text-center py-16">
          <Send className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין קמפיינים עדיין</h3>
          <p className="text-gray-500 mb-4">צור קמפיין כדי לשלוח הודעות תפוצה</p>
          {audiences.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              צור קמפיין ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCampaigns.map(campaign => {
            const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
            const StatusIcon = status.icon;
            
            return (
              <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg bg-${status.color}-100 flex items-center justify-center`}>
                      <StatusIcon className={`w-6 h-6 text-${status.color}-600`} />
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${status.color}-100 text-${status.color}-700`}>
                          {status.label}
                        </span>
                        {campaign.audience_name && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {campaign.audience_name}
                          </span>
                        )}
                        {campaign.template_name && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {campaign.template_name}
                          </span>
                        )}
                      </div>
                      
                      {campaign.scheduled_at && (
                        <div className="flex items-center gap-1 mt-2 text-sm text-blue-600">
                          <Calendar className="w-4 h-4" />
                          מתוזמן ל-{new Date(campaign.scheduled_at).toLocaleString('he-IL')}
                        </div>
                      )}
                      
                      {campaign.status === 'running' && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>{campaign.sent_count || 0} / {campaign.total_recipients || 0} נשלחו</span>
                          </div>
                          <div className="w-48 h-2 bg-gray-200 rounded-full mt-1">
                            <div 
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${campaign.total_recipients ? (campaign.sent_count / campaign.total_recipients) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {campaign.status === 'draft' && (
                      <button
                        onClick={() => handleAction(campaign.id, 'start')}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
                      >
                        <Play className="w-4 h-4" />
                        התחל
                      </button>
                    )}
                    
                    {campaign.status === 'running' && (
                      <button
                        onClick={() => handleAction(campaign.id, 'pause')}
                        className="px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 flex items-center gap-1"
                      >
                        <Pause className="w-4 h-4" />
                        השהה
                      </button>
                    )}
                    
                    {campaign.status === 'paused' && (
                      <button
                        onClick={() => handleAction(campaign.id, 'resume')}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
                      >
                        <Play className="w-4 h-4" />
                        המשך
                      </button>
                    )}
                    
                    {['running', 'paused', 'scheduled'].includes(campaign.status) && (
                      <button
                        onClick={() => handleAction(campaign.id, 'cancel')}
                        className="px-3 py-1.5 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200 flex items-center gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        בטל
                      </button>
                    )}
                    
                    <button
                      onClick={() => openView(campaign)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Eye className="w-4 h-4 text-gray-500" />
                    </button>
                    
                    {['draft', 'scheduled'].includes(campaign.status) && (
                      <button
                        onClick={() => openEdit(campaign)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => setDeleteConfirm(campaign)}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editCampaign) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowCreate(false); setEditCampaign(null); }}>
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editCampaign ? 'עריכת קמפיין' : 'יצירת קמפיין חדש'}
              </h3>
              <button onClick={() => { setShowCreate(false); setEditCampaign(null); resetForm(); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם הקמפיין *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="לדוגמה: מבצע חגים"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">קהל יעד *</label>
                  <select
                    value={formData.audience_id}
                    onChange={(e) => setFormData({ ...formData, audience_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">בחר קהל...</option>
                    {audiences.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.contacts_count || 0} אנשי קשר)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="תיאור קצר של הקמפיין..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">תוכן ההודעה</label>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className={`p-3 border-2 rounded-xl cursor-pointer transition-colors ${
                    formData.template_id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                  }`} onClick={() => setFormData({ ...formData, direct_message: '' })}>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className={`w-5 h-5 ${formData.template_id ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className="font-medium">מתבנית</span>
                    </div>
                    <select
                      value={formData.template_id}
                      onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      <option value="">בחר תבנית...</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={`p-3 border-2 rounded-xl transition-colors ${
                    formData.direct_message && !formData.template_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Edit2 className="w-5 h-5 text-gray-400" />
                      <span className="font-medium">הודעה ישירה</span>
                    </div>
                    <textarea
                      value={formData.direct_message}
                      onChange={(e) => setFormData({ ...formData, direct_message: e.target.value, template_id: '' })}
                      placeholder="כתוב הודעה..."
                      rows={2}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תזמון (אופציונלי)</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">השאר ריק לשליחה מיידית (ידנית)</p>
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">הגדרות שליחה</span>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
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
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreate(false); setEditCampaign(null); resetForm(); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={editCampaign ? handleUpdate : handleCreate}
                disabled={!formData.name.trim() || !formData.audience_id || (!formData.template_id && !formData.direct_message)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editCampaign ? 'שמור' : 'צור קמפיין'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Campaign Modal */}
      {viewCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setViewCampaign(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{viewCampaign.name}</h3>
              <button onClick={() => setViewCampaign(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {campaignStats && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{campaignStats.total}</div>
                  <div className="text-xs text-gray-500">סה״כ</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{campaignStats.sent}</div>
                  <div className="text-xs text-gray-500">נשלחו</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{campaignStats.failed}</div>
                  <div className="text-xs text-gray-500">נכשלו</div>
                </div>
              </div>
            )}
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">סטטוס:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs bg-${STATUS_CONFIG[viewCampaign.status]?.color}-100 text-${STATUS_CONFIG[viewCampaign.status]?.color}-700`}>
                  {STATUS_CONFIG[viewCampaign.status]?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">קהל:</span>
                <span>{viewCampaign.audience_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">תבנית:</span>
                <span>{viewCampaign.template_name || 'הודעה ישירה'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">נוצר:</span>
                <span>{new Date(viewCampaign.created_at).toLocaleString('he-IL')}</span>
              </div>
              {viewCampaign.started_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">התחיל:</span>
                  <span>{new Date(viewCampaign.started_at).toLocaleString('he-IL')}</span>
                </div>
              )}
              {viewCampaign.completed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">הסתיים:</span>
                  <span>{new Date(viewCampaign.completed_at).toLocaleString('he-IL')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">מחיקת קמפיין</h3>
            <p className="text-gray-600 mb-4">האם למחוק את הקמפיין "{deleteConfirm.name}"?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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
