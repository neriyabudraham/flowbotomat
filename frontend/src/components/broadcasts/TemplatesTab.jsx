import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MessageSquare, Trash2, Edit2, Search, RefreshCw,
  Loader2, X, Image, Video, Mic, FileText, Type, Clock,
  ChevronUp, ChevronDown, Copy, Send, AlertCircle, Upload,
  GripVertical, Sparkles
} from 'lucide-react';
import api from '../../services/api';

export default function TemplatesTab({ onRefresh }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
      setEditTemplate(full);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
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
              className="pl-4 pr-10 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-400"
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
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium"
        >
          <Plus className="w-4 h-4" />
          צור תבנית חדשה
        </button>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-10 h-10 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">אין תבניות עדיין</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">צור תבנית הודעה לשימוש חוזר בקמפיינים</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 font-medium shadow-lg shadow-orange-500/25"
          >
            <Sparkles className="w-5 h-5" />
            צור תבנית ראשונה
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map(template => (
            <div 
              key={template.id} 
              className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-orange-200 transition-all cursor-pointer"
              onClick={() => openEdit(template)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                      <MessageSquare className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Send className="w-3 h-3" />
                        {template.messages_count || 0} הודעות
                      </span>
                    </div>
                  </div>
                </div>
                
                {template.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
                )}
              </div>
              
              {/* Actions - appear on hover */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(template); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg text-sm font-medium transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  עריכה
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(template); }}
                  className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          
          {/* Create New Card */}
          <div
            onClick={() => setShowCreate(true)}
            className="group relative bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50/30 transition-all cursor-pointer flex items-center justify-center min-h-[200px]"
          >
            <div className="text-center">
              <div className="w-14 h-14 bg-gray-100 group-hover:bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
                <Plus className="w-7 h-7 text-gray-400 group-hover:text-orange-500 transition-colors" />
              </div>
              <div className="font-medium text-gray-600 group-hover:text-orange-600 transition-colors">צור תבנית חדשה</div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editTemplate) && (
        <TemplateEditorModal
          template={editTemplate}
          onClose={() => { setShowCreate(false); setEditTemplate(null); }}
          onSave={() => {
            setShowCreate(false);
            setEditTemplate(null);
            fetchTemplates();
            onRefresh?.();
          }}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-2xl flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת תבנית</h3>
              <p className="text-gray-600 mb-6">האם למחוק את התבנית "{deleteConfirm.name}"?</p>
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
// Template Editor Modal Component (exported for use in CampaignsTab)
// =============================================
export function TemplateEditorModal({ template, onClose, onSave }) {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [messages, setMessages] = useState(
    template?.messages?.length > 0 
      ? template.messages.map(m => ({
          id: m.id || Math.random().toString(36).substr(2, 9),
          message_type: m.message_type || 'text',
          content: m.content || '',
          media_url: m.media_url || '',
          delay_seconds: m.delay_seconds || 0,
          mediaFile: null,
          mediaPreview: null
        }))
      : [{ id: '1', message_type: 'text', content: '', media_url: '', delay_seconds: 0, mediaFile: null, mediaPreview: null }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const addMessage = () => {
    setMessages([...messages, {
      id: Math.random().toString(36).substr(2, 9),
      message_type: 'text',
      content: '',
      media_url: '',
      delay_seconds: 2,
      mediaFile: null,
      mediaPreview: null
    }]);
  };

  const removeMessage = (index) => {
    if (messages.length <= 1) return;
    setMessages(messages.filter((_, i) => i !== index));
  };

  const updateMessage = (index, updates) => {
    const newMessages = [...messages];
    newMessages[index] = { ...newMessages[index], ...updates };
    setMessages(newMessages);
  };

  const moveMessage = (index, direction) => {
    const newMessages = [...messages];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newMessages.length) return;
    [newMessages[index], newMessages[newIndex]] = [newMessages[newIndex], newMessages[index]];
    setMessages(newMessages);
  };

  const handleFileChange = async (index, file) => {
    if (!file) return;

    // Determine media type
    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    // Create preview for images
    let preview = null;
    if (file.type.startsWith('image/')) {
      preview = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    updateMessage(index, {
      message_type: mediaType,
      mediaFile: file,
      mediaPreview: preview
    });
  };

  const removeMedia = (index) => {
    updateMessage(index, {
      message_type: 'text',
      mediaFile: null,
      mediaPreview: null,
      media_url: ''
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('יש להזין שם לתבנית');
      return;
    }

    if (messages.every(m => !m.content.trim() && !m.mediaFile && !m.media_url)) {
      setError('יש להזין לפחות הודעה אחת');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Upload media files first
      const processedMessages = [];
      for (const msg of messages) {
        let mediaUrl = msg.media_url;
        
        if (msg.mediaFile) {
          const formData = new FormData();
          formData.append('file', msg.mediaFile);
          const token = localStorage.getItem('accessToken');
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) {
            throw new Error(uploadData.error || 'שגיאה בהעלאת קובץ');
          }
          mediaUrl = uploadData.url;
        }

        processedMessages.push({
          message_type: msg.message_type,
          content: msg.content,
          media_url: mediaUrl || null,
          delay_seconds: msg.delay_seconds || 0
        });
      }

      // Create or update template
      if (template?.id) {
        await api.put(`/broadcasts/templates/${template.id}`, {
          name,
          description,
          messages: processedMessages
        });
      } else {
        await api.post('/broadcasts/templates', {
          name,
          description,
          messages: processedMessages
        });
      }

      onSave();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'שגיאה בשמירת תבנית');
    } finally {
      setSaving(false);
    }
  };

  const messageTypeIcons = {
    text: Type,
    image: Image,
    video: Video,
    audio: Mic,
    document: FileText
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {template ? 'עריכת תבנית' : 'יצירת תבנית חדשה'}
                </h3>
                <p className="text-orange-100 text-sm">הגדר הודעות לשליחה</p>
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
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Name & Description */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שם התבנית *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="לדוגמה: ברכת יום הולדת"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">תיאור (אופציונלי)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תיאור קצר..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Messages */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">הודעות בתבנית</label>
              <button
                type="button"
                onClick={addMessage}
                className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1 font-medium"
              >
                <Plus className="w-4 h-4" />
                הוסף הודעה
              </button>
            </div>

            <div className="space-y-4">
              {messages.map((msg, index) => (
                <MessageEditor
                  key={msg.id}
                  message={msg}
                  index={index}
                  total={messages.length}
                  onUpdate={(updates) => updateMessage(index, updates)}
                  onRemove={() => removeMessage(index)}
                  onMove={(dir) => moveMessage(index, dir)}
                  onFileChange={(file) => handleFileChange(index, file)}
                  onRemoveMedia={() => removeMedia(index)}
                />
              ))}
            </div>

            <p className="text-xs text-gray-500 mt-3 bg-orange-50 p-3 rounded-xl">
              💡 טיפ: השתמש ב-{"{{name}}"} להכנסת שם איש הקשר, {"{{phone}}"} למספר טלפון, או כל משתנה אחר שהגדרת
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3 flex-shrink-0 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl font-medium transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 px-4 py-3 text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl font-medium transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                {template ? 'שמור שינויים' : 'צור תבנית'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Message Editor Component (like QuickSendModal)
// =============================================
function MessageEditor({ message, index, total, onUpdate, onRemove, onMove, onFileChange, onRemoveMedia }) {
  const fileInputRef = useRef(null);

  const getTypeIcon = () => {
    const icons = { text: Type, image: Image, video: Video, audio: Mic, document: FileText };
    const Icon = icons[message.message_type] || Type;
    return <Icon className="w-4 h-4" />;
  };

  const getTypeLabel = () => {
    const labels = { text: 'טקסט', image: 'תמונה', video: 'סרטון', audio: 'הקלטה', document: 'מסמך' };
    return labels[message.message_type] || 'טקסט';
  };

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* Message Header */}
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => onMove('up')}
              disabled={index === 0}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMove('down')}
              disabled={index === total - 1}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
              {index + 1}
            </span>
            <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              {getTypeIcon()}
              {getTypeLabel()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-200">
              <Clock className="w-3 h-3" />
              <input
                type="number"
                value={message.delay_seconds}
                onChange={(e) => onUpdate({ delay_seconds: parseInt(e.target.value) || 0 })}
                className="w-10 text-center border-0 focus:ring-0 p-0 text-xs bg-transparent"
                min="0"
              />
              <span>שניות</span>
            </div>
          )}
          
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message Content */}
      <div className="p-4 space-y-4">
        {/* Text Input */}
        <div>
          <textarea
            value={message.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder={message.message_type !== 'text' ? 'כיתוב (אופציונלי)...' : 'הקלד את ההודעה כאן...'}
            rows={3}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 focus:bg-white resize-none transition-all text-sm"
          />
        </div>

        {/* Media Section */}
        <div>
          {!message.mediaFile && !message.media_url ? (
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => onFileChange(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-gray-200 hover:border-orange-400 rounded-xl p-4 text-center transition-colors cursor-pointer">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Upload className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">צירוף קובץ</p>
                      <p className="text-xs text-gray-400">תמונה, סרטון, הקלטה או מסמך</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-3">
                {message.mediaPreview ? (
                  <img src={message.mediaPreview} alt="Preview" className="w-16 h-16 object-cover rounded-lg" />
                ) : (
                  <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                    message.message_type === 'video' ? 'bg-purple-100' : 
                    message.message_type === 'audio' ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    {message.message_type === 'video' && <Video className="w-7 h-7 text-purple-600" />}
                    {message.message_type === 'audio' && <Mic className="w-7 h-7 text-green-600" />}
                    {message.message_type === 'document' && <FileText className="w-7 h-7 text-blue-600" />}
                    {message.message_type === 'image' && <Image className="w-7 h-7 text-orange-600" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {message.mediaFile ? (
                    <>
                      <p className="font-medium text-gray-900 truncate text-sm">{message.mediaFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {getTypeLabel()} • {(message.mediaFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </>
                  ) : message.media_url ? (
                    <>
                      <p className="font-medium text-gray-900 truncate text-sm">קובץ מדיה</p>
                      <p className="text-xs text-gray-500 truncate">{message.media_url}</p>
                    </>
                  ) : null}
                </div>
                <button
                  onClick={onRemoveMedia}
                  className="p-2 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
