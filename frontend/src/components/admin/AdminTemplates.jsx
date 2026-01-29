import { useState, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Eye, EyeOff, Star, Crown, 
  Grid, X, Bot, RefreshCw, Copy, Search, Clock, Check,
  XCircle, AlertTriangle, User, ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../../services/api';
import socket from '../../services/socket';

export default function AdminTemplates() {
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showFromBot, setShowFromBot] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, approved, rejected
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [approveTemplate, setApproveTemplate] = useState(null);
  const [rejectTemplate, setRejectTemplate] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
    
    // Listen for new pending templates
    const handleNewPending = (data) => {
      console.log('New pending template:', data);
      loadData();
    };
    
    socket.on('template_pending', handleNewPending);
    
    return () => {
      socket.off('template_pending', handleNewPending);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        api.get('/templates/admin/all'),
        api.get('/templates/categories')
      ]);
      setTemplates(templatesRes.data.templates || []);
      setCategories(categoriesRes.data.categories || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBots = async () => {
    try {
      const { data } = await api.get('/bots');
      setBots(data.bots || []);
    } catch (err) {
      console.error('Failed to load bots:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('האם למחוק תבנית זו?')) return;
    try {
      await api.delete(`/templates/admin/${id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleTogglePublish = async (template) => {
    try {
      await api.put(`/templates/admin/${template.id}`, { 
        is_published: !template.is_published 
      });
      loadData();
    } catch (err) {
      alert('שגיאה בעדכון');
    }
  };

  const handleToggleFeatured = async (template) => {
    try {
      await api.put(`/templates/admin/${template.id}`, { 
        is_featured: !template.is_featured 
      });
      loadData();
    } catch (err) {
      alert('שגיאה בעדכון');
    }
  };

  const handleApprove = async (template, selectedCategory) => {
    setProcessing(true);
    try {
      await api.post(`/templates/admin/${template.id}/approve`, { 
        category: selectedCategory || template.category 
      });
      loadData();
      setApproveTemplate(null);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה באישור');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (template) => {
    if (!rejectReason.trim()) {
      alert('יש לציין סיבה לדחייה');
      return;
    }
    setProcessing(true);
    try {
      await api.post(`/templates/admin/${template.id}/reject`, { reason: rejectReason });
      loadData();
      setRejectTemplate(null);
      setRejectReason('');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בדחייה');
    } finally {
      setProcessing(false);
    }
  };

  // Filter templates by status and search
  const filteredTemplates = templates.filter(t => {
    const matchesSearch = !search || 
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.name_he?.includes(search);
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'pending' && t.status === 'pending') ||
      (statusFilter === 'approved' && (t.status === 'approved' || (t.is_published && !t.status))) ||
      (statusFilter === 'rejected' && t.status === 'rejected');
    
    return matchesSearch && matchesStatus;
  });

  // Count by status
  const pendingCount = templates.filter(t => t.status === 'pending').length;
  const approvedCount = templates.filter(t => t.status === 'approved' || (t.is_published && !t.status)).length;
  const rejectedCount = templates.filter(t => t.status === 'rejected').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">ניהול תבניות</h2>
        <div className="flex gap-2">
          <button 
            onClick={loadData} 
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { loadBots(); setShowFromBot(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200"
          >
            <Copy className="w-4 h-4" />
            מבוט קיים
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            תבנית חדשה
          </button>
        </div>
      </div>

      {/* Pending Alert */}
      {pendingCount > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-medium text-yellow-900">{pendingCount} תבניות ממתינות לאישור</h3>
              <p className="text-sm text-yellow-700">לחץ כדי לסקור ולאשר את התבניות</p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('pending')}
            className="px-4 py-2 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 font-medium"
          >
            צפה בתבניות
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            statusFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          הכל ({templates.length})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            statusFilter === 'pending' ? 'bg-white text-yellow-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          ממתינות ({pendingCount})
        </button>
        <button
          onClick={() => setStatusFilter('approved')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            statusFilter === 'approved' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Check className="w-4 h-4" />
          מאושרות ({approvedCount})
        </button>
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            statusFilter === 'rejected' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <XCircle className="w-4 h-4" />
          נדחו ({rejectedCount})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש תבניות..."
          className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">טוען...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12">
          <Grid className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">אין תבניות</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => (
            <div 
              key={template.id}
              className={`bg-white rounded-xl border p-4 ${
                template.status === 'pending' ? 'border-yellow-300 bg-yellow-50/30' :
                template.status === 'rejected' ? 'border-red-200 bg-red-50/30' :
                template.is_published ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    template.status === 'pending' ? 'bg-yellow-100' : 'bg-purple-100'
                  }`}>
                    <Bot className={`w-5 h-5 ${template.status === 'pending' ? 'text-yellow-600' : 'text-purple-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{template.name_he || template.name}</h3>
                    <p className="text-xs text-gray-500">{template.category}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {template.is_featured && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  )}
                  {template.is_premium && (
                    <Crown className="w-4 h-4 text-purple-500" />
                  )}
                </div>
              </div>

              {/* Submitter info for pending templates */}
              {template.status === 'pending' && template.creator_name && (
                <div className="flex items-center gap-2 mb-2 text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-lg">
                  <User className="w-3 h-3" />
                  <span>הוגש ע״י: {template.creator_name}</span>
                </div>
              )}

              <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                {template.description_he || template.description || 'ללא תיאור'}
              </p>

              {/* Rejection reason */}
              {template.status === 'rejected' && template.rejection_reason && (
                <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                  <strong>סיבת דחייה:</strong> {template.rejection_reason}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                <span>{template.use_count || 0} שימושים</span>
                <span className={`px-2 py-0.5 rounded-full ${
                  template.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  template.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  template.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {template.status === 'pending' ? 'ממתין לאישור' :
                   template.status === 'rejected' ? 'נדחה' :
                   template.is_published ? 'פורסם' : 'טיוטה'}
                </span>
              </div>

              {/* Action buttons for pending templates */}
              {template.status === 'pending' ? (
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setPreviewTemplate(template)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    צפייה
                  </button>
                  <button
                    onClick={() => setApproveTemplate(template)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                  >
                    <Check className="w-4 h-4" />
                    אשר
                  </button>
                  <button
                    onClick={() => setRejectTemplate(template)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                  >
                    <XCircle className="w-4 h-4" />
                    דחה
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setPreviewTemplate(template)}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                    title="צפייה"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleTogglePublish(template)}
                    className={`p-1.5 rounded ${
                      template.is_published 
                        ? 'hover:bg-yellow-50 text-yellow-600' 
                        : 'hover:bg-green-50 text-green-600'
                    }`}
                    title={template.is_published ? 'הסתר' : 'פרסם'}
                  >
                    {template.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleToggleFeatured(template)}
                    className={`p-1.5 rounded ${
                      template.is_featured 
                        ? 'bg-yellow-100 text-yellow-600' 
                        : 'hover:bg-gray-100 text-gray-400'
                    }`}
                    title={template.is_featured ? 'הסר מומלץ' : 'סמן כמומלץ'}
                  >
                    <Star className={`w-4 h-4 ${template.is_featured ? 'fill-yellow-500' : ''}`} />
                  </button>
                  <button
                    onClick={() => setEditTemplate(template)}
                    className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                    title="עריכה"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-600 mr-auto"
                    title="מחיקה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editTemplate) && (
        <TemplateFormModal
          template={editTemplate}
          categories={categories}
          onClose={() => { setShowCreate(false); setEditTemplate(null); }}
          onSave={() => { loadData(); setShowCreate(false); setEditTemplate(null); }}
        />
      )}

      {/* Create from Bot Modal */}
      {showFromBot && (
        <CreateFromBotModal
          bots={bots}
          categories={categories}
          onClose={() => setShowFromBot(false)}
          onSave={() => { loadData(); setShowFromBot(false); }}
        />
      )}

      {/* Preview Template Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onApprove={() => { setPreviewTemplate(null); setApproveTemplate(previewTemplate); }}
          onReject={() => { setPreviewTemplate(null); setRejectTemplate(previewTemplate); }}
        />
      )}

      {/* Approve Template Modal */}
      {approveTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setApproveTemplate(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">אישור תבנית</h3>
                  <p className="text-sm text-gray-500">{approveTemplate.name_he || approveTemplate.name}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">האם לאשר ולפרסם את התבנית?</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה לפרסום</label>
                <select
                  defaultValue={approveTemplate.category}
                  id="approve-category"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name_he}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setApproveTemplate(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => handleApprove(approveTemplate, document.getElementById('approve-category').value)}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? 'מאשר...' : (
                  <>
                    <Check className="w-4 h-4" />
                    אשר ופרסם
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Template Modal */}
      {rejectTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setRejectTemplate(null); setRejectReason(''); }}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">דחיית תבנית</h3>
                  <p className="text-sm text-gray-500">{rejectTemplate.name_he || rejectTemplate.name}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">התבנית לא תפורסם והמשתמש יקבל הודעה על הדחייה.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סיבת הדחייה *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none"
                  placeholder="הסבר למשתמש למה התבנית לא אושרה..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setRejectTemplate(null); setRejectReason(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => handleReject(rejectTemplate)}
                disabled={processing || !rejectReason.trim()}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? 'דוחה...' : (
                  <>
                    <XCircle className="w-4 h-4" />
                    דחה תבנית
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateFormModal({ template, categories, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    name_he: template?.name_he || '',
    description: template?.description || '',
    description_he: template?.description_he || '',
    category: template?.category || 'general',
    is_published: template?.is_published || false,
    is_featured: template?.is_featured || false,
    is_premium: template?.is_premium || false,
    sort_order: template?.sort_order || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('שם התבנית הוא שדה חובה');
      return;
    }
    
    setSaving(true);
    try {
      if (template) {
        await api.put(`/templates/admin/${template.id}`, formData);
      } else {
        await api.post('/templates/admin', formData);
      }
      onSave();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {template ? 'עריכת תבנית' : 'יצירת תבנית חדשה'}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם (אנגלית)</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם (עברית)</label>
              <input
                type="text"
                value={formData.name_he}
                onChange={(e) => setFormData({...formData, name_he: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (עברית)</label>
            <textarea
              value={formData.description_he}
              onChange={(e) => setFormData({...formData, description_he: e.target.value})}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name_he}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_published}
                onChange={(e) => setFormData({...formData, is_published: e.target.checked})}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">פורסם</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_featured}
                onChange={(e) => setFormData({...formData, is_featured: e.target.checked})}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">מומלץ</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_premium}
                onChange={(e) => setFormData({...formData, is_premium: e.target.checked})}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">פרימיום</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סדר מיון</label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({...formData, sort_order: parseInt(e.target.value) || 0})}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            ביטול
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateFromBotModal({ bots, categories, onClose, onSave }) {
  const [selectedBot, setSelectedBot] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    name_he: '',
    description_he: '',
    category: 'general',
  });
  const [saving, setSaving] = useState(false);

  const handleSelectBot = (bot) => {
    setSelectedBot(bot);
    setFormData({
      name: bot.name,
      name_he: bot.name,
      description_he: bot.description || '',
      category: 'general',
    });
  };

  const handleSave = async () => {
    if (!selectedBot || !formData.name.trim()) return;
    
    setSaving(true);
    try {
      await api.post(`/templates/admin/from-bot/${selectedBot.id}`, formData);
      onSave();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה ביצירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">יצירת תבנית מבוט קיים</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!selectedBot ? (
            <>
              <p className="text-sm text-gray-500 mb-4">בחר בוט ליצירת תבנית ממנו:</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {bots.map(bot => (
                  <div
                    key={bot.id}
                    onClick={() => handleSelectBot(bot)}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 cursor-pointer"
                  >
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Bot className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{bot.name}</h4>
                      <p className="text-xs text-gray-500">{bot.description || 'ללא תיאור'}</p>
                    </div>
                  </div>
                ))}
                {bots.length === 0 && (
                  <p className="text-center text-gray-400 py-8">אין בוטים זמינים</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-3 bg-purple-50 rounded-xl flex items-center gap-3">
                <Bot className="w-5 h-5 text-purple-600" />
                <span className="font-medium">{selectedBot.name}</span>
                <button 
                  onClick={() => setSelectedBot(null)}
                  className="mr-auto text-xs text-purple-600 hover:underline"
                >
                  שנה
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם התבנית</label>
                <input
                  type="text"
                  value={formData.name_he}
                  onChange={(e) => setFormData({...formData, name_he: e.target.value, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                <textarea
                  value={formData.description_he}
                  onChange={(e) => setFormData({...formData, description_he: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name_he}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            ביטול
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving || !selectedBot}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? 'יוצר...' : 'צור תבנית'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewModal({ template, onClose, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  
  // Parse flow_data if it's a string
  const flowData = typeof template.flow_data === 'string' 
    ? JSON.parse(template.flow_data) 
    : template.flow_data;
  
  // Count nodes by type
  const nodeCounts = {};
  if (flowData?.nodes) {
    flowData.nodes.forEach(node => {
      nodeCounts[node.type] = (nodeCounts[node.type] || 0) + 1;
    });
  }
  
  const nodeTypeNames = {
    trigger: 'טריגר',
    message: 'הודעה',
    condition: 'תנאי',
    action: 'פעולה',
    delay: 'השהייה',
    api: 'API',
    variable: 'משתנה',
    menu: 'תפריט',
    input: 'קלט',
    ai: 'AI'
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                <Bot className="w-7 h-7 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{template.name_he || template.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                    {template.category}
                  </span>
                  {template.status === 'pending' && (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      ממתין לאישור
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-xl">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Submitter Info */}
          {template.creator_name && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <User className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">הוגש על ידי: {template.creator_name}</p>
                <p className="text-xs text-gray-500">{template.creator_email}</p>
              </div>
              <span className="mr-auto text-xs text-gray-400">
                {new Date(template.created_at).toLocaleDateString('he-IL')}
              </span>
            </div>
          )}

          {/* Description */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">תיאור</h4>
            <p className="text-gray-600 bg-gray-50 p-3 rounded-xl">
              {template.description_he || template.description || 'ללא תיאור'}
            </p>
          </div>

          {/* Flow Summary */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">מבנה הבוט</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(nodeCounts).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <span className="text-lg font-bold text-purple-600">{count}</span>
                  <span className="text-sm text-gray-600">{nodeTypeNames[type] || type}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              סה״כ {flowData?.nodes?.length || 0} רכיבים, {flowData?.edges?.length || 0} חיבורים
            </p>
          </div>

          {/* Flow Data (Expandable) */}
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-purple-600"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              צפה בנתונים הטכניים
            </button>
            {expanded && (
              <pre className="mt-2 p-4 bg-gray-900 text-green-400 rounded-xl text-xs overflow-x-auto max-h-64" dir="ltr">
                {JSON.stringify(flowData, null, 2)}
              </pre>
            )}
          </div>

          {/* Trigger Config */}
          {template.trigger_config && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">הגדרות טריגר</h4>
              <pre className="p-3 bg-gray-50 rounded-xl text-xs overflow-x-auto" dir="ltr">
                {JSON.stringify(
                  typeof template.trigger_config === 'string' 
                    ? JSON.parse(template.trigger_config) 
                    : template.trigger_config, 
                  null, 2
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        {template.status === 'pending' && (
          <div className="p-6 border-t border-gray-100 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
            >
              סגור
            </button>
            <button
              onClick={onReject}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              דחה
            </button>
            <button
              onClick={onApprove}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              אשר
            </button>
          </div>
        )}
        
        {template.status !== 'pending' && (
          <div className="p-6 border-t border-gray-100">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
            >
              סגור
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
