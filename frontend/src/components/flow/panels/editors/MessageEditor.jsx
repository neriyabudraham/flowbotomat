import { useState, useRef } from 'react';
import { Plus, X, GripVertical, MessageSquare, Image, FileText, Video, Clock, Upload, CheckCircle, Play } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';

const LIMITS = { text: 4096, caption: 1024 };

const actionTypes = [
  { id: 'text', label: 'טקסט', icon: MessageSquare },
  { id: 'image', label: 'תמונה', icon: Image },
  { id: 'video', label: 'סרטון', icon: Video },
  { id: 'file', label: 'קובץ', icon: FileText },
  { id: 'delay', label: 'השהייה', icon: Clock },
];

export default function MessageEditor({ data, onUpdate }) {
  const actions = data.actions || [{ type: 'text', content: '' }];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    const newAction = type === 'text' ? { type, content: '' } 
      : type === 'image' || type === 'video' ? { type, url: '', caption: '' }
      : type === 'file' ? { type, url: '' }
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

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({ 
        localFile: true, 
        fileName: file.name, 
        fileData: reader.result, 
        url: URL.createObjectURL(file),
        previewUrl: URL.createObjectURL(file)
      });
      setPreviewError(false);
    };
    reader.readAsDataURL(file);
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
          {/* Preview */}
          {previewUrl && !previewError && (
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
                    onError={() => setPreviewError(true)}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-10 h-10 text-white" />
                  </div>
                </div>
              )}
              <button
                onClick={() => { onUpdate({ url: '', previewUrl: '', localFile: false, fileName: '' }); setPreviewError(false); }}
                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Upload */}
          {!previewUrl && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-4 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50"
              >
                <Upload className="w-5 h-5" />
                <span className="text-sm">העלה {action.type === 'image' ? 'תמונה' : 'סרטון'}</span>
              </button>
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
                onChange={(e) => { onUpdate({ url: e.target.value, previewUrl: e.target.value, localFile: false }); setPreviewError(false); }}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                dir="ltr"
              />
            </>
          )}

          {action.fileName && (
            <div className="flex items-center gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <CheckCircle className="w-4 h-4" />{action.fileName}
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

      {action.type === 'file' && (
        <div className="space-y-2">
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50"
          >
            <Upload className="w-4 h-4" /><span className="text-sm">העלה קובץ</span>
          </button>
          <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
          {action.fileName && (
            <div className="flex items-center gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <CheckCircle className="w-4 h-4" />{action.fileName}
            </div>
          )}
          <div className="text-xs text-gray-400 text-center">או</div>
          <input 
            type="url" 
            value={action.url || ''} 
            onChange={(e) => onUpdate({ url: e.target.value, localFile: false })} 
            placeholder="URL לקובץ..." 
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" 
            dir="ltr" 
          />
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
