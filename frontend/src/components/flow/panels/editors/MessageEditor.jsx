import { useState, useRef } from 'react';
import { Plus, X, GripVertical, MessageSquare, Image, FileText, Video, Clock, Upload, CheckCircle, Play, Mic } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';

const LIMITS = { text: 4096, caption: 1024 };

const actionTypes = [
  { id: 'text', label: 'טקסט', icon: MessageSquare },
  { id: 'image', label: 'תמונה', icon: Image },
  { id: 'video', label: 'סרטון', icon: Video },
  { id: 'audio', label: 'הודעה קולית', icon: Mic },
  { id: 'file', label: 'קובץ', icon: FileText },
  { id: 'delay', label: 'השהייה', icon: Clock },
];

export default function MessageEditor({ data, onUpdate }) {
  const actions = data.actions || [{ type: 'text', content: '' }];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    const newAction = type === 'text' ? { type, content: '' } 
      : type === 'image' || type === 'video' ? { type, url: '', caption: '' }
      : type === 'audio' ? { type, url: '' }
      : type === 'file' ? { type, url: '', filename: '' }
      : { type, delay: 1, unit: 'seconds' };
    onUpdate({ actions: [...actions, newAction] });
  };

  const removeAction = (index) => {
    if (actions.length <= 1) return;
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
      <p className="text-sm text-gray-500">הוסף תוכן לשליחה. גרור לשינוי סדר.</p>

      {/* Actions */}
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
              canRemove={actions.length > 1}
              onUpdate={(updates) => updateAction(index, updates)}
              onRemove={() => removeAction(index)}
            />
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-500 mb-3">הוסף תוכן:</p>
        <div className="grid grid-cols-3 gap-2">
          {actionTypes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className="flex flex-col items-center gap-1 p-3 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 rounded-xl transition-colors text-sm border border-transparent hover:border-teal-200"
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Wait for reply */}
      <div className="border-t border-gray-100 pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.waitForReply || false}
            onChange={(e) => onUpdate({ waitForReply: e.target.checked, timeout: e.target.checked ? null : undefined })}
            className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <div>
            <div className="font-medium text-gray-700">המתן לתגובה</div>
            <div className="text-xs text-gray-500">הבוט יחכה לתגובה לפני שימשיך</div>
          </div>
        </label>
        
        {data.waitForReply && (
          <div className="mt-3 mr-8 space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.timeout !== null && data.timeout !== undefined}
                onChange={(e) => onUpdate({ timeout: e.target.checked ? 60 : null })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-600">הגבל זמן המתנה</span>
            </label>
            
            {data.timeout !== null && data.timeout !== undefined && (
              <div className="flex items-center gap-2 mr-7">
                <input
                  type="number"
                  value={data.timeout}
                  onChange={(e) => onUpdate({ timeout: parseInt(e.target.value) || 60 })}
                  min={10}
                  className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center"
                />
                <span className="text-sm text-gray-500">שניות</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionItem({ action, index, canRemove, onUpdate, onRemove }) {
  const Icon = actionTypes.find(a => a.id === action.type)?.icon || MessageSquare;
  const fileInputRef = useRef(null);
  const [previewError, setPreviewError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadError('');
    setIsLoading(true);
    setUploadProgress(10);
    
    // Check file size - different limits for different types
    const maxSizeVideo = 16 * 1024 * 1024; // 16MB for video
    const maxSizeImage = 5 * 1024 * 1024;   // 5MB for images
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
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <Icon className="w-4 h-4 text-teal-600" />
        <span className="text-sm font-medium text-gray-700 flex-1">
          {actionTypes.find(a => a.id === action.type)?.label}
        </span>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {action.type === 'text' && (
        <TextInputWithVariables
          value={action.content || ''}
          onChange={(v) => onUpdate({ content: v })}
          placeholder="כתוב את ההודעה...&#10;ניתן להוסיף ירידות שורה"
          maxLength={LIMITS.text}
          multiline
          rows={4}
          label="תוכן ההודעה"
        />
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
          
          {/* Preview */}
          {previewUrl && !previewError && !isLoading && (
            <div className="relative rounded-lg overflow-hidden bg-gray-100">
              {action.type === 'image' ? (
                <img 
                  src={previewUrl} 
                  alt="תצוגה מקדימה" 
                  className="w-full h-32 object-cover"
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <div className="relative">
                  <video 
                    src={previewUrl} 
                    className="w-full h-32 object-cover"
                    controls
                    onError={() => setPreviewError(true)}
                  />
                </div>
              )}
              <button
                onClick={() => { onUpdate({ url: '', previewUrl: '', localFile: false, fileName: '', fileSize: null }); setPreviewError(false); setUploadError(''); }}
                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X className="w-3 h-3" />
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

          {/* Upload */}
          {!previewUrl && !isLoading && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-4 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span className="text-sm">העלה {action.type === 'image' ? 'תמונה' : 'סרטון'}</span>
              </button>
              <p className="text-xs text-gray-400 text-center">
                גודל מקסימלי: {action.type === 'video' ? '16MB' : '5MB'}
              </p>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept={action.type === 'image' ? 'image/*' : 'video/*'} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              
              <div className="text-xs text-gray-400 text-center">או הדבק URL</div>
              
              <input
                type="url"
                value={action.url || ''}
                onChange={(e) => { onUpdate({ url: e.target.value, previewUrl: e.target.value, localFile: false }); setPreviewError(false); setUploadError(''); }}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                dir="ltr"
              />
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
        <div className="space-y-3">
          {/* Upload */}
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="w-full flex items-center justify-center gap-2 py-4 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50 transition-colors"
          >
            <Mic className="w-5 h-5" />
            <span className="text-sm">העלה הקלטה קולית</span>
          </button>
          <input 
            ref={fileInputRef} 
            type="file" 
            accept="audio/*" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          
          {action.fileName && (
            <div className="flex items-center justify-between gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{action.fileName}</span>
              </div>
              <button 
                onClick={() => onUpdate({ url: '', fileName: '', localFile: false })}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className="text-xs text-gray-400 text-center">או הזן URL</div>
          
          <input 
            type="url" 
            value={action.url || ''} 
            onChange={(e) => onUpdate({ url: e.target.value, localFile: false })} 
            placeholder="URL לקובץ שמע (ogg/opus מומלץ)..." 
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" 
            dir="ltr" 
          />
          <p className="text-xs text-gray-400">פורמט מומלץ: ogg/opus. פורמטים נתמכים: mp3, ogg, wav</p>
        </div>
      )}

      {/* File upload with auto-detect mimetype */}
      {action.type === 'file' && (
        <div className="space-y-3">
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="w-full flex items-center justify-center gap-2 py-4 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50 transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span className="text-sm">העלה קובץ</span>
          </button>
          <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
          
          {action.fileName && (
            <div className="flex items-center justify-between gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{action.fileName}</span>
                {action.fileSize && (
                  <span className="text-xs text-teal-600">({formatFileSize(action.fileSize)})</span>
                )}
              </div>
              <button 
                onClick={() => onUpdate({ url: '', fileName: '', localFile: false, fileSize: null })}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className="text-xs text-gray-400 text-center">או הזן URL</div>
          
          <input 
            type="url" 
            value={action.url || ''} 
            onChange={(e) => onUpdate({ url: e.target.value, localFile: false })} 
            placeholder="URL לקובץ..." 
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" 
            dir="ltr" 
          />
          
          <p className="text-xs text-gray-400">סוג הקובץ יזוהה אוטומטית. נתמכים: PDF, Word, Excel, תמונות, וידאו, שמע</p>
        </div>
      )}

      {action.type === 'delay' && (
        <div className="flex gap-2">
          <input 
            type="number" 
            value={action.delay || 1} 
            onChange={(e) => onUpdate({ delay: Math.max(1, parseInt(e.target.value) || 1) })} 
            min={1} 
            className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-center" 
          />
          <select 
            value={action.unit || 'seconds'} 
            onChange={(e) => onUpdate({ unit: e.target.value })} 
            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          >
            <option value="seconds">שניות</option>
            <option value="minutes">דקות</option>
          </select>
        </div>
      )}
    </div>
  );
}
