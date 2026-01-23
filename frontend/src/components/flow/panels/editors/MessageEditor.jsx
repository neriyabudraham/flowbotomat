import { useState, useRef } from 'react';
import { Plus, X, GripVertical, MessageSquare, Image, FileText, Video, Upload, CheckCircle, Play, Mic, User, MapPin, Keyboard, CheckCheck, SmilePlus, Link, Square, Clock } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import { COMMON_REACTIONS, EMOJI_CATEGORIES } from './emojis';

const LIMITS = { text: 4096, caption: 1024 };

// Content types - main message content
const contentTypes = [
  { id: 'text', label: 'טקסט', icon: MessageSquare, color: 'teal' },
  { id: 'image', label: 'תמונה', icon: Image, color: 'blue' },
  { id: 'video', label: 'סרטון', icon: Video, color: 'purple' },
  { id: 'audio', label: 'הודעה קולית', icon: Mic, color: 'pink' },
  { id: 'file', label: 'קובץ', icon: FileText, color: 'gray' },
  { id: 'contact', label: 'איש קשר', icon: User, color: 'indigo' },
  { id: 'location', label: 'מיקום', icon: MapPin, color: 'red' },
];

// Utility types - status actions
const utilityTypes = [
  { id: 'typing', label: 'מקליד/ה', icon: Keyboard, color: 'gray' },
  { id: 'delay', label: 'המתנה', icon: Clock, color: 'amber' },
  { id: 'mark_seen', label: 'סמן כנקרא', icon: CheckCheck, color: 'blue' },
  { id: 'reaction', label: 'ריאקציה', icon: SmilePlus, color: 'yellow' },
  { id: 'wait_reply', label: 'המתן לתגובה', icon: MessageSquare, color: 'teal' },
];

export default function MessageEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    let newAction;
    switch (type) {
      case 'text':
        newAction = { type, content: '', enableLinkPreview: false };
        break;
      case 'image':
      case 'video':
        newAction = { type, url: '', caption: '', inputMode: 'upload' };
        break;
      case 'audio':
        newAction = { type, url: '', inputMode: 'upload' };
        break;
      case 'file':
        newAction = { type, url: '', filename: '', inputMode: 'upload' };
        break;
      case 'contact':
        newAction = { type, contactName: '', contactPhone: '', contactOrg: '' };
        break;
      case 'location':
        newAction = { type, latitude: '', longitude: '', locationTitle: '' };
        break;
      case 'typing':
        newAction = { type, typingDuration: 3 };
        break;
      case 'delay':
        newAction = { type, delay: 1, unit: 'seconds' };
        break;
      case 'mark_seen':
        newAction = { type };
        break;
      case 'reaction':
        newAction = { type, reaction: '👍🏻' };
        break;
      case 'wait_reply':
        newAction = { type, saveToVariable: false, variableName: '' };
        break;
      default:
        newAction = { type };
    }
    onUpdate({ actions: [...actions, newAction] });
  };

  const removeAction = (index) => {
    onUpdate({ actions: actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, updates) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onUpdate({ actions: newActions });
  };

  const handleDragStart = (index) => setDragIndex(index);
  
  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newActions = [...actions];
    const [removed] = newActions.splice(dragIndex, 1);
    newActions.splice(index, 0, removed);
    onUpdate({ actions: newActions });
    setDragIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      {actions.length > 0 ? (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDragIndex(null)}
              className={`transition-opacity ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <ActionItem
                action={action}
                index={index}
                canRemove={true}
                onUpdate={(updates) => updateAction(index, updates)}
                onRemove={() => removeAction(index)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 px-4 bg-gradient-to-b from-teal-50/50 to-white rounded-2xl border-2 border-dashed border-teal-200">
          <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-teal-600" />
          </div>
          <p className="text-gray-700 font-medium mb-1">אין תוכן עדיין</p>
          <p className="text-sm text-gray-500">בחר סוג תוכן לשליחה</p>
        </div>
      )}

      {/* Add buttons */}
      <div className={actions.length > 0 ? "border-t border-gray-100 pt-4" : ""}>
        {/* Content Types */}
        <p className="text-sm font-medium text-gray-700 mb-2">תוכן לשליחה</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {contentTypes.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className={`flex flex-col items-center gap-1 p-2.5 bg-${color}-50 hover:bg-${color}-100 text-${color}-700 rounded-xl transition-all text-sm border border-${color}-100 hover:border-${color}-200 hover:shadow-sm`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>
        
        {/* Utility Types */}
        <p className="text-sm font-medium text-gray-700 mb-2">פעולות נוספות</p>
        <div className="grid grid-cols-4 gap-2">
          {utilityTypes.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className={`flex flex-col items-center gap-1 p-2.5 bg-${color}-50 hover:bg-${color}-100 text-${color}-700 rounded-xl transition-all text-sm border border-${color}-100 hover:border-${color}-200 hover:shadow-sm`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

function ActionItem({ action, index, canRemove, onUpdate, onRemove }) {
  const allTypes = [...contentTypes, ...utilityTypes];
  const typeInfo = allTypes.find(a => a.id === action.type) || { icon: MessageSquare, label: action.type, color: 'gray' };
  const Icon = typeInfo.icon;
  const fileInputRef = useRef(null);
  const [previewError, setPreviewError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadError('');
    setIsLoading(true);
    setUploadProgress(10);
    
    // Check file size - different limits for different types
    const maxSizeVideo = 20 * 1024 * 1024; // 20MB for video
    const maxSizeImage = 10 * 1024 * 1024;  // 10MB for images
    const maxSizeFile = 25 * 1024 * 1024;   // 25MB for files
    
    const maxSize = action.type === 'video' ? maxSizeVideo 
                  : action.type === 'image' ? maxSizeImage 
                  : maxSizeFile;
    
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      setUploadError(`הקובץ גדול מדי (${(file.size / (1024 * 1024)).toFixed(1)}MB). גודל מקסימלי: ${maxSizeMB}MB`);
      setIsLoading(false);
      return;
    }
    
    // Validate file type
    if (action.type === 'video' && !file.type.startsWith('video/')) {
      setUploadError('יש לבחור קובץ וידאו');
      setIsLoading(false);
      return;
    }
    
    if (action.type === 'image' && !file.type.startsWith('image/')) {
      setUploadError('יש לבחור קובץ תמונה');
      setIsLoading(false);
      return;
    }
    
    try {
      setUploadProgress(30);
      
      // Create object URL for preview (instant, no blocking)
      const objectUrl = URL.createObjectURL(file);
      setUploadProgress(50);
      
      // For videos, don't convert to base64 - upload directly to server
      if (action.type === 'video' && file.size > 2 * 1024 * 1024) {
        // Large video - upload to server first
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'video');
        
        setUploadProgress(60);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          },
          body: formData
        });
        
        setUploadProgress(90);
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'שגיאה בהעלאת הקובץ');
        }
        
        const data = await response.json();
        
        onUpdate({ 
          localFile: false, 
          fileName: file.name, 
          fileData: null, 
          url: data.url,
          previewUrl: objectUrl,
          fileSize: file.size
        });
      } else {
        // Small file - convert to base64
        const reader = new FileReader();
        
        reader.onload = () => {
          onUpdate({ 
            localFile: true, 
            fileName: file.name, 
            fileData: reader.result, 
            url: objectUrl,
            previewUrl: objectUrl,
            fileSize: file.size
          });
          setPreviewError(false);
          setIsLoading(false);
          setUploadProgress(100);
        };
        
        reader.onerror = () => {
          setUploadError('שגיאה בקריאת הקובץ. נסה שוב.');
          setIsLoading(false);
        };
        
        reader.readAsDataURL(file);
        return; // Exit early, reader.onload will handle the rest
      }
      
      setPreviewError(false);
      setIsLoading(false);
      setUploadProgress(100);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error.message || 'שגיאה בהעלאת הקובץ');
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const previewUrl = action.previewUrl || action.url;

  return (
    <div className={`bg-${typeInfo.color}-50 rounded-xl p-3 border border-${typeInfo.color}-100`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <Icon className={`w-4 h-4 text-${typeInfo.color}-600`} />
        <span className={`text-sm font-medium text-${typeInfo.color}-700 flex-1`}>
          {typeInfo.label}
        </span>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {action.type === 'text' && (
        <div className="space-y-3">
          <TextInputWithVariables
            value={action.content || ''}
            onChange={(v) => onUpdate({ content: v })}
            placeholder="כתוב את ההודעה..."
            maxLength={LIMITS.text}
            multiline
            rows={3}
            label="תוכן ההודעה"
          />
          
          {/* Link Preview Toggle - Compact */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-700">
            <input
              type="checkbox"
              checked={action.enableLinkPreview || false}
              onChange={(e) => onUpdate({ enableLinkPreview: e.target.checked, customLinkPreview: false })}
              className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span>תצוגה מקדימה של קישור</span>
          </label>
          
          {/* Custom Link Preview Fields */}
          {action.enableLinkPreview && (
            <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={action.customLinkPreview || false}
                  onChange={(e) => onUpdate({ customLinkPreview: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600"
                />
                <span>תצוגה מקדימה מותאמת אישית</span>
              </label>
              
              {action.customLinkPreview && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={action.linkPreviewTitle || ''}
                    onChange={(e) => onUpdate({ linkPreviewTitle: e.target.value })}
                    placeholder="כותרת התצוגה המקדימה"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={action.linkPreviewDescription || ''}
                    onChange={(e) => onUpdate({ linkPreviewDescription: e.target.value })}
                    placeholder="תיאור"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                  />
                  <input
                    type="url"
                    value={action.linkPreviewUrl || ''}
                    onChange={(e) => onUpdate({ linkPreviewUrl: e.target.value })}
                    placeholder="קישור (URL)"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                    dir="ltr"
                  />
                  <input
                    type="url"
                    value={action.linkPreviewImage || ''}
                    onChange={(e) => onUpdate({ linkPreviewImage: e.target.value })}
                    placeholder="תמונה (URL)"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(action.type === 'image' || action.type === 'video') && (
        <div className="space-y-3">
          {/* Error message */}
          {uploadError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
              <X className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          
          {/* Loading state */}
          {isLoading && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-gray-600">מעלה {action.type === 'image' ? 'תמונה' : 'סרטון'}...</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">{uploadProgress}%</p>
            </div>
          )}
          
          {/* Preview - Large size */}
          {previewUrl && !previewError && !isLoading && (
            <div className="relative rounded-xl overflow-hidden bg-gray-100 shadow-lg">
              {action.type === 'image' ? (
                <img 
                  src={previewUrl} 
                  alt="תצוגה מקדימה" 
                  className="w-full max-h-64 object-contain bg-black/5"
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <video 
                  src={previewUrl} 
                  className="w-full max-h-64"
                  controls
                  onError={() => setPreviewError(true)}
                />
              )}
              <button
                onClick={() => { onUpdate({ url: '', previewUrl: '', localFile: false, fileName: '', fileSize: null, inputMode: 'upload' }); setPreviewError(false); setUploadError(''); }}
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          {/* Preview error */}
          {previewError && (
            <div className="p-3 bg-yellow-50 text-yellow-700 rounded-lg text-sm border border-yellow-200 flex items-center gap-2">
              <span>⚠️</span>
              <span>לא ניתן להציג תצוגה מקדימה. ה{action.type === 'image' ? 'תמונה' : 'סרטון'} יישלח בכל זאת.</span>
            </div>
          )}

          {/* Input Mode Tabs */}
          {!previewUrl && !isLoading && (
            <>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'upload' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    (action.inputMode || 'upload') === 'upload'
                      ? 'bg-white shadow text-gray-800'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  העלאה
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'url' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    action.inputMode === 'url'
                      ? 'bg-white shadow text-gray-800'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  קישור
                </button>
              </div>
              
              {/* Upload Mode */}
              {(action.inputMode || 'upload') === 'upload' && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-teal-300 hover:bg-teal-50 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-600">לחץ להעלאת {action.type === 'image' ? 'תמונה' : 'סרטון'}</span>
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    גודל מקסימלי: {action.type === 'video' ? '20MB' : '10MB'}
                  </p>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept={action.type === 'image' ? 'image/*' : 'video/*'} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </>
              )}
              
              {/* URL Mode */}
              {action.inputMode === 'url' && (
                <TextInputWithVariables
                  value={action.url || ''}
                  onChange={(v) => { onUpdate({ url: v, previewUrl: v, localFile: false }); setPreviewError(false); setUploadError(''); }}
                  placeholder="https://example.com/image.jpg או {{משתנה}}"
                  label="קישור לקובץ (ניתן להשתמש במשתנים)"
                />
              )}
            </>
          )}

          {action.fileName && !isLoading && (
            <div className="flex items-center justify-between gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{action.fileName}</span>
              </div>
              {action.fileSize && (
                <span className="text-xs text-teal-600">{formatFileSize(action.fileSize)}</span>
              )}
            </div>
          )}
          
          {/* Caption */}
          <TextInputWithVariables
            value={action.caption || ''}
            onChange={(v) => onUpdate({ caption: v })}
            placeholder="הודעה מצורפת (אופציונלי)..."
            maxLength={LIMITS.caption}
            multiline
            rows={2}
            label="הודעה מצורפת (אופציונלי)"
          />
        </div>
      )}

      {/* Audio/Voice message */}
      {action.type === 'audio' && (
        <AudioRecorder action={action} onUpdate={onUpdate} fileInputRef={fileInputRef} handleFileUpload={handleFileUpload} />
      )}

      {/* File upload with auto-detect mimetype */}
      {action.type === 'file' && (
        <div className="space-y-3">
          {/* Input Mode Tabs */}
          {!action.fileName && (
            <>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'upload' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    (action.inputMode || 'upload') === 'upload'
                      ? 'bg-white shadow text-gray-800'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  העלאה
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ inputMode: 'url' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    action.inputMode === 'url'
                      ? 'bg-white shadow text-gray-800'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  קישור
                </button>
              </div>
              
              {/* Upload Mode */}
              {(action.inputMode || 'upload') === 'upload' && (
                <>
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-full flex items-center justify-center gap-2 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-600">לחץ להעלאת קובץ</span>
                  </button>
                  <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                  <p className="text-xs text-gray-400 text-center">נתמכים: PDF, Word, Excel, תמונות, וידאו, שמע</p>
                </>
              )}
              
              {/* URL Mode */}
              {action.inputMode === 'url' && (
                <TextInputWithVariables
                  value={action.url || ''}
                  onChange={(v) => onUpdate({ url: v, localFile: false })}
                  placeholder="https://example.com/file.pdf או {{משתנה}}"
                  label="קישור לקובץ (ניתן להשתמש במשתנים)"
                />
              )}
            </>
          )}
          
          {action.fileName && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-3 bg-gray-100 rounded-lg text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="truncate max-w-[180px]">{action.fileName}</span>
                  {action.fileSize && (
                    <span className="text-xs text-gray-500">({formatFileSize(action.fileSize)})</span>
                  )}
                </div>
                <button 
                  onClick={() => onUpdate({ url: '', fileName: '', localFile: false, fileSize: null, inputMode: 'upload', customFilename: '' })}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Custom filename option */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={action.customFilename || ''}
                  onChange={(e) => onUpdate({ customFilename: e.target.value })}
                  placeholder="שם מותאם (אופציונלי)"
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                />
                {action.fileName && (
                  <span className="text-xs text-gray-400">.{action.fileName.split('.').pop()}</span>
                )}
              </div>
              <p className="text-xs text-gray-400">הזן שם חדש לקובץ (ללא סיומת)</p>
            </div>
          )}
        </div>
      )}

      {/* Contact vCard */}
      {action.type === 'contact' && (
        <div className="space-y-3">
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <p className="text-xs text-indigo-600 mb-1 font-medium">שליחת כרטיס איש קשר (vCard)</p>
            <p className="text-xs text-indigo-500">הנמען יוכל לשמור את איש הקשר ישירות לטלפון</p>
          </div>
          
          <TextInputWithVariables
            value={action.contactName || ''}
            onChange={(v) => onUpdate({ contactName: v })}
            placeholder="שם איש הקשר..."
            label="שם איש הקשר"
          />
          
          <TextInputWithVariables
            value={action.contactPhone || ''}
            onChange={(v) => onUpdate({ contactPhone: v })}
            placeholder="972501234567"
            label="מספר טלפון (עם קידומת מדינה)"
          />
          
          <input
            type="text"
            value={action.contactOrg || ''}
            onChange={(e) => onUpdate({ contactOrg: e.target.value })}
            placeholder="שם החברה/ארגון (אופציונלי)"
            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        </div>
      )}

      {/* Location */}
      {action.type === 'location' && (
        <div className="space-y-3">
          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-600 mb-1 font-medium">שליחת מיקום</p>
            <p className="text-xs text-red-500">הנמען יוכל לפתוח את המיקום בוויז או גוגל מפות</p>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">קו רוחב (Latitude)</label>
              <input
                type="number"
                step="any"
                value={action.latitude || ''}
                onChange={(e) => onUpdate({ latitude: parseFloat(e.target.value) || '' })}
                placeholder="32.0853"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">קו אורך (Longitude)</label>
              <input
                type="number"
                step="any"
                value={action.longitude || ''}
                onChange={(e) => onUpdate({ longitude: parseFloat(e.target.value) || '' })}
                placeholder="34.7818"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                dir="ltr"
              />
            </div>
          </div>
          
          <TextInputWithVariables
            value={action.locationTitle || ''}
            onChange={(v) => onUpdate({ locationTitle: v })}
            placeholder="שם המיקום (אופציונלי)..."
            label="שם המיקום"
          />
        </div>
      )}

      {/* Typing indicator */}
      {action.type === 'typing' && (
        <div className="space-y-3">
          <div className="p-3 bg-gray-100 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600 font-medium">הבוט יציג "מקליד/ה..." למשך:</p>
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="30"
              value={action.typingDuration || 3}
              onChange={(e) => onUpdate({ typingDuration: Math.min(30, Math.max(1, parseInt(e.target.value) || 3)) })}
              className="w-24 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-center font-medium"
            />
            <span className="text-sm text-gray-500">שניות</span>
          </div>
          <p className="text-xs text-gray-400">מקסימום 30 שניות</p>
        </div>
      )}

      {/* Mark as seen */}
      {action.type === 'mark_seen' && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-600 font-medium">סימון ההודעה כנקראה</p>
          <p className="text-xs text-blue-500 mt-1">הבוט יסמן את ההודעה האחרונה שהתקבלה כנקראה - וי וי כחול ✓✓</p>
        </div>
      )}

      {/* Reaction - Compact */}
      {action.type === 'reaction' && (
        <div className="space-y-2">
          {/* Quick select - always visible */}
          <div className="flex items-center gap-2 flex-wrap">
            {['👍🏻', '❤️', '😂', '😮', '😢', '🙏🏻', '🔥', '🎉'].map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => onUpdate({ reaction: emoji })}
                className={`w-8 h-8 text-base rounded-lg border transition-all ${
                  action.reaction === emoji 
                    ? 'border-yellow-500 bg-yellow-50 scale-110' 
                    : 'border-gray-200 hover:border-yellow-300 hover:bg-yellow-50'
                }`}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="w-8 h-8 text-base rounded-lg border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 text-gray-400"
            >
              {showEmojiPicker ? '×' : '+'}
            </button>
          </div>
          
          {/* Expanded picker */}
          {showEmojiPicker && (
            <div className="max-h-40 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
              <div className="flex flex-wrap gap-1">
                {COMMON_REACTIONS.filter(e => !['👍🏻', '❤️', '😂', '😮', '😢', '🙏🏻', '🔥', '🎉'].includes(e)).map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { onUpdate({ reaction: emoji }); setShowEmojiPicker(false); }}
                    className={`w-7 h-7 text-sm rounded hover:bg-gray-100 ${
                      action.reaction === emoji ? 'bg-yellow-100' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delay */}
      {action.type === 'delay' && (
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-xs text-amber-600 font-medium">המתנה לפני הפעולה הבאה</p>
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="300"
              value={action.delay || 1}
              onChange={(e) => onUpdate({ delay: Math.min(300, Math.max(1, parseInt(e.target.value) || 1)) })}
              className="w-24 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-center font-medium"
            />
            <select
              value={action.unit || 'seconds'}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm"
            >
              <option value="seconds">שניות</option>
              <option value="minutes">דקות</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">מקסימום 300 שניות / 5 דקות</p>
        </div>
      )}

      {/* Wait for reply */}
      {action.type === 'wait_reply' && (
        <div className="space-y-3">
          <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
            <p className="text-xs text-teal-600 font-medium">הבוט ימתין לתגובה מהלקוח</p>
            <p className="text-xs text-teal-500 mt-1">הפעולות הבאות ימשיכו רק לאחר קבלת תגובה</p>
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={action.saveToVariable || false}
              onChange={(e) => onUpdate({ saveToVariable: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700">שמור את התגובה למשתנה</span>
          </label>
          
          {action.saveToVariable && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">בחר משתנה לשמירה:</label>
              <select
                value={action.variableName || ''}
                onChange={(e) => onUpdate({ variableName: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              >
                <option value="">בחר משתנה...</option>
                <optgroup label="משתנים נפוצים">
                  <option value="user_response">user_response - תגובת משתמש</option>
                  <option value="user_choice">user_choice - בחירת משתמש</option>
                  <option value="user_input">user_input - קלט משתמש</option>
                  <option value="answer">answer - תשובה</option>
                </optgroup>
                <optgroup label="פרטים אישיים">
                  <option value="full_name">full_name - שם מלא</option>
                  <option value="email">email - אימייל</option>
                  <option value="phone">phone - טלפון</option>
                  <option value="address">address - כתובת</option>
                  <option value="id_number">id_number - מספר זהות</option>
                </optgroup>
                <optgroup label="עסקי">
                  <option value="company">company - חברה</option>
                  <option value="order_id">order_id - מספר הזמנה</option>
                  <option value="product">product - מוצר</option>
                  <option value="quantity">quantity - כמות</option>
                  <option value="notes">notes - הערות</option>
                </optgroup>
              </select>
              <p className="text-xs text-gray-400">או הזן שם משתנה חדש:</p>
              <input
                type="text"
                value={action.variableName || ''}
                onChange={(e) => onUpdate({ variableName: e.target.value })}
                placeholder="שם_משתנה_חדש"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                dir="ltr"
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// Audio Recorder Component
function AudioRecorder({ action, onUpdate, fileInputRef, handleFileUpload }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('לא ניתן לגשת למיקרופון. אנא בדוק הרשאות.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const saveRecording = () => {
    if (audioBlob) {
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate({
          localFile: true,
          fileName: `recording_${Date.now()}.webm`,
          fileData: reader.result,
          url: audioUrl,
          fileSize: audioBlob.size
        });
      };
      reader.readAsDataURL(audioBlob);
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      {/* Input Mode Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => onUpdate({ inputMode: 'upload' })}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
            (action.inputMode || 'upload') === 'upload'
              ? 'bg-white shadow text-gray-800'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          העלאה
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ inputMode: 'record' })}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
            action.inputMode === 'record'
              ? 'bg-white shadow text-gray-800'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mic className="w-4 h-4" />
          הקלטה
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ inputMode: 'url' })}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
            action.inputMode === 'url'
              ? 'bg-white shadow text-gray-800'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Link className="w-4 h-4" />
          קישור
        </button>
      </div>

      {/* Already has file */}
      {action.fileName && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 p-3 bg-pink-50 rounded-lg text-sm text-pink-700">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span className="truncate max-w-[150px]">{action.fileName}</span>
            </div>
            <button 
              onClick={() => onUpdate({ url: '', fileName: '', localFile: false, fileData: null })}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {action.url && (
            <audio src={action.url} controls className="w-full" />
          )}
        </div>
      )}

      {/* Upload Mode */}
      {!action.fileName && (action.inputMode || 'upload') === 'upload' && (
        <>
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="w-full flex items-center justify-center gap-2 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-pink-300 hover:bg-pink-50 transition-colors"
          >
            <Upload className="w-6 h-6 text-gray-400" />
            <span className="text-sm text-gray-600">לחץ להעלאת קובץ שמע</span>
          </button>
          <input 
            ref={fileInputRef} 
            type="file" 
            accept="audio/*" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <p className="text-xs text-gray-400 text-center">פורמטים נתמכים: mp3, ogg, wav, webm</p>
        </>
      )}

      {/* Record Mode */}
      {!action.fileName && action.inputMode === 'record' && (
        <div className="space-y-3">
          {!audioUrl ? (
            <div className="flex flex-col items-center gap-3 py-6 bg-white border-2 border-dashed border-gray-200 rounded-xl">
              {isRecording ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-red-500 animate-pulse flex items-center justify-center">
                    <Mic className="w-8 h-8 text-white" />
                  </div>
                  <span className="text-lg font-mono text-red-600">{formatTime(recordingTime)}</span>
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    <Square className="w-4 h-4" />
                    עצור הקלטה
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-pink-500 hover:bg-pink-600 flex items-center justify-center transition-colors"
                  >
                    <Mic className="w-8 h-8 text-white" />
                  </button>
                  <span className="text-sm text-gray-500">לחץ להתחלת הקלטה</span>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-pink-50 rounded-xl">
              <p className="text-sm font-medium text-pink-700">תצוגה מקדימה:</p>
              <audio src={audioUrl} controls className="w-full" />
              <div className="flex gap-2">
                <button
                  onClick={saveRecording}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                >
                  <CheckCircle className="w-4 h-4" />
                  שמור
                </button>
                <button
                  onClick={discardRecording}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  <X className="w-4 h-4" />
                  הקלט מחדש
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* URL Mode */}
      {!action.fileName && action.inputMode === 'url' && (
        <TextInputWithVariables
          value={action.url || ''}
          onChange={(v) => onUpdate({ url: v, localFile: false })}
          placeholder="https://example.com/audio.mp3 או {{משתנה}}"
          label="קישור לקובץ שמע (ניתן להשתמש במשתנים)"
        />
      )}
    </div>
  );
}
