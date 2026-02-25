import { useState, useEffect } from 'react';
import { Calendar, Clock, Edit2, Trash2, Plus, X, Check, Send, Image, Video, FileText, Mic, AlertCircle, Loader2 } from 'lucide-react';
import api from '../../services/api';

const MESSAGE_TYPES = {
  text: { icon: Send, label: 'טקסט', color: 'blue' },
  image: { icon: Image, label: 'תמונה', color: 'green' },
  video: { icon: Video, label: 'וידאו', color: 'purple' },
  document: { icon: FileText, label: 'קובץ', color: 'amber' },
  audio: { icon: Mic, label: 'הקלטה', color: 'pink' }
};

const STATUS_LABELS = {
  pending: { label: 'ממתין', color: 'amber', bg: 'bg-amber-50', text: 'text-amber-700' },
  processing: { label: 'בתהליך', color: 'blue', bg: 'bg-blue-50', text: 'text-blue-700' },
  sent: { label: 'נשלח', color: 'green', bg: 'bg-green-50', text: 'text-green-700' },
  failed: { label: 'נכשל', color: 'red', bg: 'bg-red-50', text: 'text-red-700' },
  cancelled: { label: 'בוטל', color: 'gray', bg: 'bg-gray-50', text: 'text-gray-700' }
};

export default function ScheduledTab({ forwards = [] }) {
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadScheduled();
  }, []);

  const loadScheduled = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/group-forwards/scheduled');
      setScheduled(data.scheduled || []);
    } catch (err) {
      console.error('Failed to load scheduled:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setDeleting(id);
      await api.delete(`/group-forwards/scheduled/${id}`);
      setScheduled(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
      alert(err.response?.data?.error || 'שגיאה במחיקה');
    } finally {
      setDeleting(null);
    }
  };

  const pendingCount = scheduled.filter(s => s.status === 'pending').length;
  const sentCount = scheduled.filter(s => s.status === 'sent').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl">
          <Clock className="w-4 h-4" />
          <span className="font-medium">{pendingCount} ממתינים</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl">
          <Check className="w-4 h-4" />
          <span className="font-medium">{sentCount} נשלחו</span>
        </div>
        <div className="mr-auto">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            תזמון חדש
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : scheduled.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-3xl flex items-center justify-center">
            <Calendar className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">אין הודעות מתוזמנות</h3>
          <p className="text-gray-500 mb-6">צור תזמון חדש כדי לשלוח הודעות בזמן מסוים</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            צור תזמון ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduled.map(item => {
            const status = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
            const type = MESSAGE_TYPES[item.message_type] || MESSAGE_TYPES.text;
            const TypeIcon = type.icon;
            const scheduledDate = new Date(item.scheduled_at);
            const isPast = scheduledDate < new Date();
            
            return (
              <div 
                key={item.id}
                className={`bg-white rounded-2xl border ${item.status === 'pending' ? 'border-amber-200' : 'border-gray-100'} shadow-sm p-4 hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-4">
                  {/* Type Icon */}
                  <div className={`w-12 h-12 rounded-xl bg-${type.color}-50 flex items-center justify-center flex-shrink-0`}>
                    <TypeIcon className={`w-6 h-6 text-${type.color}-600`} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{item.forward_name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 truncate mb-2">
                      {item.message_content || item.media_caption || `${type.label} ללא תיאור`}
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{scheduledDate.toLocaleDateString('he-IL')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{scheduledDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    
                    {item.error_message && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span>{item.error_message}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  {item.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                        title="ערוך"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                        title="בטל"
                      >
                        {deleting === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingItem) && (
        <ScheduleModal
          item={editingItem}
          forwards={forwards}
          onClose={() => {
            setShowCreateModal(false);
            setEditingItem(null);
          }}
          onSave={() => {
            loadScheduled();
            setShowCreateModal(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function ScheduleModal({ item, forwards, onClose, onSave }) {
  const [forwardId, setForwardId] = useState(item?.forward_id || '');
  const [messageType, setMessageType] = useState(item?.message_type || 'text');
  const [messageContent, setMessageContent] = useState(item?.message_content || '');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(item?.media_url || null);
  const [scheduledDate, setScheduledDate] = useState(
    item?.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0, 16) : ''
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  // Get selected forward's suffix settings
  const selectedForward = forwards.find(f => f.id === forwardId);
  const hasSuffix = selectedForward?.suffix_enabled && selectedForward?.message_suffix;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine type from file
    if (file.type.startsWith('image/')) {
      setMessageType('image');
    } else if (file.type.startsWith('video/')) {
      setMessageType('video');
    } else if (file.type.startsWith('audio/')) {
      setMessageType('audio');
    } else {
      setMessageType('document');
    }

    setMediaFile(file);
    
    // Create preview
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setMediaPreview(url);
    } else {
      setMediaPreview(null);
    }
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMessageType('text');
  };

  const handleSave = async () => {
    if (!forwardId || !scheduledDate) {
      setError('יש לבחור העברה ותאריך תזמון');
      return;
    }

    if (messageType === 'text' && !messageContent.trim()) {
      setError('יש להזין תוכן הודעה');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      let mediaUrl = item?.media_url || null;
      let mediaFilename = item?.media_filename || null;

      // Upload media file if selected
      if (mediaFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', mediaFile);
        
        const uploadRes = await api.post('/upload/media', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        mediaUrl = uploadRes.data.url;
        mediaFilename = mediaFile.name;
        setUploading(false);
      }

      const payload = {
        forward_id: forwardId,
        message_type: messageType,
        message_content: messageContent,
        media_url: mediaUrl,
        media_filename: mediaFilename,
        scheduled_at: new Date(scheduledDate).toISOString()
      };

      if (item) {
        await api.put(`/group-forwards/scheduled/${item.id}`, payload);
      } else {
        await api.post('/group-forwards/scheduled', payload);
      }

      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Calculate min datetime (now + 1 minute)
  const minDateTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">
              {item ? 'עריכת תזמון' : 'תזמון חדש'}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Forward Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">בחר העברה</label>
            <select
              value={forwardId}
              onChange={(e) => setForwardId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
            >
              <option value="">בחר...</option>
              {forwards.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Media Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">מדיה (אופציונלי)</label>
            {mediaPreview ? (
              <div className="relative">
                {messageType === 'image' && (
                  <img src={mediaPreview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                )}
                {messageType === 'video' && (
                  <video src={mediaPreview} className="w-full h-48 object-cover rounded-xl" controls />
                )}
                {(messageType === 'document' || messageType === 'audio') && (
                  <div className="w-full h-24 bg-gray-100 rounded-xl flex items-center justify-center">
                    <FileText className="w-8 h-8 text-gray-400" />
                    <span className="mr-2 text-gray-600">{mediaFile?.name}</span>
                  </div>
                )}
                <button
                  onClick={clearMedia}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors">
                <div className="flex flex-col items-center">
                  <div className="flex gap-2 text-gray-400 mb-2">
                    <Image className="w-6 h-6" />
                    <Video className="w-6 h-6" />
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="text-sm text-gray-500">לחץ להעלאת תמונה, סרטון או קובץ</span>
                </div>
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Message Content / Caption */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {messageType !== 'text' ? 'כיתוב למדיה' : 'תוכן ההודעה'}
            </label>
            <textarea
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              placeholder={messageType !== 'text' ? 'הוסף כיתוב למדיה (אופציונלי)...' : 'הקלד את תוכן ההודעה...'}
              rows={4}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none"
            />
          </div>

          {/* Suffix Info */}
          {hasSuffix && (
            <div className="p-3 bg-blue-50 text-blue-700 rounded-xl text-sm">
              <div className="flex items-center gap-2 font-medium mb-1">
                <Check className="w-4 h-4" />
                סיומת תתווסף אוטומטית
              </div>
              <p className="text-blue-600 text-xs">{selectedForward.message_suffix}</p>
            </div>
          )}

          {/* Schedule Date/Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">תאריך ושעת שליחה</label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={minDateTime}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white rounded-b-3xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !forwardId || !scheduledDate}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium disabled:opacity-50 hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {uploading ? 'מעלה...' : 'שומר...'}
              </>
            ) : (
              <>
                <Calendar className="w-5 h-5" />
                {item ? 'שמור שינויים' : 'צור תזמון'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
