import { Plus, X, GripVertical, MessageSquare, Image, FileText, List, Clock } from 'lucide-react';

const actionTypes = [
  { id: 'text', label: 'טקסט', icon: MessageSquare, description: 'הודעת טקסט פשוטה' },
  { id: 'image', label: 'תמונה', icon: Image, description: 'שליחת תמונה' },
  { id: 'file', label: 'קובץ', icon: FileText, description: 'שליחת קובץ' },
  { id: 'list', label: 'רשימה', icon: List, description: 'רשימת בחירה' },
  { id: 'delay', label: 'השהייה', icon: Clock, description: 'המתנה בין הודעות' },
];

export default function MessageEditor({ data, onUpdate }) {
  const actions = data.actions || [{ type: 'text', content: '' }];

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

  const moveAction = (from, to) => {
    const newActions = [...actions];
    const [removed] = newActions.splice(from, 1);
    newActions.splice(to, 0, removed);
    onUpdate({ actions: newActions });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הוסף פעולות לשליחה. ניתן לשלב כמה סוגי תוכן.
      </p>

      {/* Actions List */}
      <div className="space-y-3">
        {actions.map((action, index) => (
          <ActionItem
            key={index}
            action={action}
            index={index}
            total={actions.length}
            onUpdate={(updates) => updateAction(index, updates)}
            onRemove={() => removeAction(index)}
            onMoveUp={() => index > 0 && moveAction(index, index - 1)}
            onMoveDown={() => index < actions.length - 1 && moveAction(index, index + 1)}
          />
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
              className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 rounded-lg transition-colors text-sm"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Variables Info */}
      <div className="bg-teal-50 rounded-xl p-4 mt-4">
        <h4 className="font-medium text-teal-800 mb-2">משתנים זמינים</h4>
        <div className="grid grid-cols-2 gap-2 text-sm text-teal-700">
          <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{name}}'}</code>
          <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{phone}}'}</code>
          <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{message}}'}</code>
          <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{date}}'}</code>
        </div>
      </div>
    </div>
  );
}

function ActionItem({ action, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  const Icon = actionTypes.find(a => a.id === action.type)?.icon || MessageSquare;

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex flex-col">
          <button onClick={onMoveUp} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
        <Icon className="w-4 h-4 text-teal-600" />
        <span className="text-sm font-medium text-gray-700 flex-1">
          {actionTypes.find(a => a.id === action.type)?.label}
        </span>
        {total > 1 && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {action.type === 'text' && (
        <textarea
          value={action.content || ''}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="כתוב את ההודעה..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none"
          rows={3}
        />
      )}

      {action.type === 'image' && (
        <div className="space-y-2">
          <input
            type="url"
            value={action.url || ''}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="כתובת URL לתמונה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
            dir="ltr"
          />
          <input
            type="text"
            value={action.caption || ''}
            onChange={(e) => onUpdate({ caption: e.target.value })}
            placeholder="כיתוב (אופציונלי)..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
          />
        </div>
      )}

      {action.type === 'file' && (
        <input
          type="url"
          value={action.url || ''}
          onChange={(e) => onUpdate({ url: e.target.value })}
          placeholder="כתובת URL לקובץ..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
          dir="ltr"
        />
      )}

      {action.type === 'list' && (
        <div className="space-y-2">
          <input
            type="text"
            value={action.title || ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="כותרת הרשימה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
          />
          <input
            type="text"
            value={action.buttonText || ''}
            onChange={(e) => onUpdate({ buttonText: e.target.value })}
            placeholder="טקסט הכפתור..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-200 outline-none"
          />
          <ListItemsEditor 
            items={action.items || []} 
            onChange={(items) => onUpdate({ items })}
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

function ListItemsEditor({ items, onChange }) {
  const addItem = () => {
    onChange([...items, { id: Date.now().toString(), title: '', description: '' }]);
  };

  const updateItem = (index, updates) => {
    const newItems = items.map((item, i) => i === index ? { ...item, ...updates } : item);
    onChange(newItems);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id || i} className="flex gap-2">
          <input
            type="text"
            value={item.title || ''}
            onChange={(e) => updateItem(i, { title: e.target.value })}
            placeholder={`פריט ${i + 1}...`}
            className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-sm focus:ring-2 focus:ring-teal-200 outline-none"
          />
          <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={addItem}
        className="w-full py-1 text-sm text-teal-600 hover:bg-teal-50 rounded transition-colors"
      >
        + הוסף פריט
      </button>
    </div>
  );
}

function getDefaultAction(type) {
  switch (type) {
    case 'text': return { type: 'text', content: '' };
    case 'image': return { type: 'image', url: '', caption: '' };
    case 'file': return { type: 'file', url: '' };
    case 'list': return { type: 'list', title: '', buttonText: 'בחר', items: [] };
    case 'delay': return { type: 'delay', delay: 1, unit: 'seconds' };
    default: return { type };
  }
}
