import { useState, useEffect } from 'react';
import { 
  Plus, MessageSquare, Trash2, Edit2, Search, RefreshCw,
  Loader2, X, Image, Video, Mic, FileText, Type, Clock,
  GripVertical, ChevronUp, ChevronDown, Copy
} from 'lucide-react';
import api from '../../services/api';

export default function TemplatesTab({ onRefresh }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    messages: [{ message_type: 'text', content: '', delay_seconds: 0 }]
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/broadcasts/templates');
      setTemplates(data.templates || []);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateDetails = async (id) => {
    try {
      const { data } = await api.get(`/broadcasts/templates/${id}`);
      return data.template;
    } catch (e) {
      console.error('Failed to fetch template:', e);
      return null;
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    
    try {
      await api.post('/broadcasts/templates', formData);
      setShowCreate(false);
      setFormData({ name: '', description: '', messages: [{ message_type: 'text', content: '', delay_seconds: 0 }] });
      fetchTemplates();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת תבנית');
    }
  };

  const handleUpdate = async () => {
    if (!formData.name.trim() || !editTemplate) return;
    
    try {
      await api.put(`/broadcasts/templates/${editTemplate.id}`, {
        name: formData.name,
        description: formData.description
      });
      
      // Update messages separately if needed
      // For simplicity, we'll recreate the template content
      
      setEditTemplate(null);
      setFormData({ name: '', description: '', messages: [{ message_type: 'text', content: '', delay_seconds: 0 }] });
      fetchTemplates();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בעדכון תבנית');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/broadcasts/templates/${id}`);
      setDeleteConfirm(null);
      fetchTemplates();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקת תבנית');
    }
  };

  const openEdit = async (template) => {
    const full = await fetchTemplateDetails(template.id);
    if (full) {
      setFormData({
        name: full.name,
        description: full.description || '',
        messages: full.messages?.length > 0 ? full.messages : [{ message_type: 'text', content: '', delay_seconds: 0 }]
      });
      setEditTemplate(full);
    }
  };

  const addMessage = () => {
    setFormData({
      ...formData,
      messages: [...formData.messages, { message_type: 'text', content: '', delay_seconds: 2 }]
    });
  };

  const removeMessage = (index) => {
    if (formData.messages.length <= 1) return;
    setFormData({
      ...formData,
      messages: formData.messages.filter((_, i) => i !== index)
    });
  };

  const updateMessage = (index, field, value) => {
    const newMessages = [...formData.messages];
    newMessages[index] = { ...newMessages[index], [field]: value };
    setFormData({ ...formData, messages: newMessages });
  };

  const moveMessage = (index, direction) => {
    const newMessages = [...formData.messages];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newMessages.length) return;
    [newMessages[index], newMessages[newIndex]] = [newMessages[newIndex], newMessages[index]];
    setFormData({ ...formData, messages: newMessages });
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const messageTypeIcons = {
    text: Type,
    image: Image,
    video: Video,
    audio: Mic,
    document: FileText
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש תבניות..."
              className="pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={fetchTemplates}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          צור תבנית חדשה
        </button>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין תבניות עדיין</h3>
          <p className="text-gray-500 mb-4">צור תבנית הודעה לשימוש חוזר בקמפיינים</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="w-4 h-4" />
            צור תבנית ראשונה
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map(template => (
            <div key={template.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <span className="text-xs text-gray-500">
                      {template.messages_count || 0} הודעות
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(template)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(template)}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              
              {template.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
              )}
              
              <div className="text-xs text-gray-400">
                נוצר ב-{new Date(template.created_at).toLocaleDateString('he-IL')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editTemplate) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowCreate(false); setEditTemplate(null); }}>
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editTemplate ? 'עריכת תבנית' : 'יצירת תבנית חדשה'}
              </h3>
              <button onClick={() => { setShowCreate(false); setEditTemplate(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם התבנית</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="לדוגמה: ברכת יום הולדת"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="תיאור קצר..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">הודעות בתבנית</label>
                  <button
                    type="button"
                    onClick={addMessage}
                    className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף הודעה
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.messages.map((msg, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => moveMessage(index, 'up')}
                            disabled={index === 0}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveMessage(index, 'down')}
                            disabled={index === formData.messages.length - 1}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                        
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">הודעה {index + 1}</span>
                            <select
                              value={msg.message_type}
                              onChange={(e) => updateMessage(index, 'message_type', e.target.value)}
                              className="text-xs px-2 py-1 border border-gray-200 rounded"
                            >
                              <option value="text">טקסט</option>
                              <option value="image">תמונה</option>
                              <option value="video">וידאו</option>
                              <option value="audio">אודיו</option>
                              <option value="document">מסמך</option>
                            </select>
                            
                            {index > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3 h-3" />
                                <input
                                  type="number"
                                  value={msg.delay_seconds}
                                  onChange={(e) => updateMessage(index, 'delay_seconds', parseInt(e.target.value) || 0)}
                                  className="w-12 px-1 py-0.5 border border-gray-200 rounded text-center"
                                  min="0"
                                />
                                <span>שניות המתנה</span>
                              </div>
                            )}
                          </div>
                          
                          <textarea
                            value={msg.content}
                            onChange={(e) => updateMessage(index, 'content', e.target.value)}
                            placeholder="תוכן ההודעה... (השתמש ב-{{name}} למשתנים)"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                          />
                          
                          {msg.message_type !== 'text' && (
                            <input
                              type="text"
                              value={msg.media_url || ''}
                              onChange={(e) => updateMessage(index, 'media_url', e.target.value)}
                              placeholder="קישור למדיה..."
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                          )}
                        </div>
                        
                        {formData.messages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMessage(index)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <p className="text-xs text-gray-500 mt-2">
                  💡 טיפ: השתמש ב-{"{{name}}"} להכנסת שם איש הקשר, {"{{phone}}"} למספר טלפון
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreate(false); setEditTemplate(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={editTemplate ? handleUpdate : handleCreate}
                disabled={!formData.name.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {editTemplate ? 'שמור' : 'צור תבנית'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">מחיקת תבנית</h3>
            <p className="text-gray-600 mb-4">האם למחוק את התבנית "{deleteConfirm.name}"?</p>
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
