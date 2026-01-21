import { useState, useRef } from 'react';
import { Plus, X, GripVertical, MessageSquare, Image, FileText, Clock, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';

// WhatsApp limits
const LIMITS = {
  text: 4096,
  caption: 1024,
};

const actionTypes = [
  { id: 'text', label: 'טקסט', icon: MessageSquare, description: 'הודעת טקסט' },
  { id: 'image', label: 'תמונה', icon: Image, description: 'שליחת תמונה' },
  { id: 'file', label: 'קובץ', icon: FileText, description: 'שליחת קובץ' },
  { id: 'delay', label: 'השהייה', icon: Clock, description: 'המתנה' },
];

export default function MessageEditor({ data, onUpdate }) {
  const actions = data.actions || [{ type: 'text', content: '' }];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    const newAction = getDefaultAction(type);
    onUpdate({ actions: [...actions, newAction] });
  };

  const removeAction = (index) => {
    if (actions.length <= 1) return;
    onUpdate({ actions: actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, updates) => {
    const newActions = actions.map((a, i) => i === index ? { ...a, ...updates } : a);
    onUpdate({ actions: newActions });
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    
    const newActions = [...actions];
    const [removed] = newActions.splice(dragIndex, 1);
    newActions.splice(index, 0, removed);
    onUpdate({ actions: newActions });
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הוסף תוכן לשליחה. ניתן לגרור כדי לשנות סדר.
      </p>

      {/* Actions List */}
      <div className="space-y-3">
        {actions.map((action, index) => (
          <div
            key={index}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`transition-all ${dragIndex === index ? 'opacity-50 scale-95' : ''}`}
          >
            <ActionItem
              action={action}
              index={index}
              total={actions.length}
              onUpdate={(updates) => updateAction(index, updates)}
              onRemove={() => removeAction(index)}
            />
          </div>
        ))}
      </div>

      {/* Add Action Buttons */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-500 mb-3">הוסף תוכן:</p>
        <div className="grid grid-cols-2 gap-2">
          {actionTypes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 rounded-xl transition-colors text-sm border border-transparent hover:border-teal-200"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tip */}
      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
        💡 לשליחת רשימת בחירה, הוסף מודול "רשימה" נפרד מהפלטה.
      </div>
    </div>
  );
}

function ActionItem({ action, index, total, onUpdate, onRemove }) {
  const Icon = actionTypes.find(a => a.id === action.type)?.icon || MessageSquare;
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // For now, convert to base64 or you can upload to server
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({ 
        localFile: true,
        fileName: file.name,
        fileData: reader.result,
        url: URL.createObjectURL(file)
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:border-gray-200 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <Icon className="w-4 h-4 text-teal-600" />
        <span className="text-sm font-medium text-gray-700 flex-1">
          {actionTypes.find(a => a.id === action.type)?.label}
        </span>
        {total > 1 && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {action.type === 'text' && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">תוכן ההודעה</span>
            <span className={`${(action.content?.length || 0) > LIMITS.text ? 'text-red-500' : 'text-gray-400'}`}>
              {action.content?.length || 0}/{LIMITS.text}
            </span>
          </div>
          <TextInputWithVariables
            value={action.content || ''}
            onChange={(v) => onUpdate({ content: v })}
            placeholder="כתוב את ההודעה..."
            maxLength={LIMITS.text}
            multiline
            rows={3}
          />
        </div>
      )}

      {action.type === 'image' && (
        <div className="space-y-2">
          {/* Upload or URL */}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="text-sm">העלה תמונה</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          
          {action.fileName && (
            <div className="flex items-center gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <CheckCircle className="w-4 h-4" />
              {action.fileName}
            </div>
          )}
          
          <div className="text-xs text-gray-400 text-center">או</div>
          
          <input
            type="url"
            value={action.url || ''}
            onChange={(e) => onUpdate({ url: e.target.value, localFile: false })}
            placeholder="הדבק כתובת URL לתמונה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
            dir="ltr"
          />
          
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">כיתוב (אופציונלי)</span>
              <span className="text-gray-400">{action.caption?.length || 0}/{LIMITS.caption}</span>
            </div>
            <TextInputWithVariables
              value={action.caption || ''}
              onChange={(v) => onUpdate({ caption: v })}
              placeholder="כיתוב לתמונה..."
              maxLength={LIMITS.caption}
            />
          </div>
        </div>
      )}

      {action.type === 'file' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 hover:bg-teal-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="text-sm">העלה קובץ</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          
          {action.fileName && (
            <div className="flex items-center gap-2 p-2 bg-teal-50 rounded-lg text-sm text-teal-700">
              <CheckCircle className="w-4 h-4" />
              {action.fileName}
            </div>
          )}
          
          <div className="text-xs text-gray-400 text-center">או</div>
          
          <input
            type="url"
            value={action.url || ''}
            onChange={(e) => onUpdate({ url: e.target.value, localFile: false })}
            placeholder="הדבק כתובת URL לקובץ..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
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
            className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-200 outline-none"
          />
          <select
            value={action.unit || 'seconds'}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
          >
            <option value="seconds">שניות</option>
            <option value="minutes">דקות</option>
          </select>
        </div>
      )}
    </div>
  );
}

function getDefaultAction(type) {
  switch (type) {
    case 'text': return { type: 'text', content: '' };
    case 'image': return { type: 'image', url: '', caption: '' };
    case 'file': return { type: 'file', url: '' };
    case 'delay': return { type: 'delay', delay: 1, unit: 'seconds' };
    default: return { type };
  }
}
