import { Plus, X, GripVertical } from 'lucide-react';

const actionTypes = [
  { id: 'add_tag', label: 'הוסף תגית', icon: '🏷️', hasValue: 'tag' },
  { id: 'remove_tag', label: 'הסר תגית', icon: '🏷️', hasValue: 'tag' },
  { id: 'set_variable', label: 'הגדר משתנה', icon: '📝', hasValue: 'keyvalue' },
  { id: 'stop_bot', label: 'עצור בוט לאיש קשר', icon: '🛑' },
  { id: 'enable_bot', label: 'הפעל בוט לאיש קשר', icon: '▶️' },
  { id: 'delete_contact', label: 'מחק איש קשר', icon: '🗑️' },
  { id: 'webhook', label: 'שלח Webhook', icon: '🌐', hasValue: 'url' },
  { id: 'http_request', label: 'קריאת API', icon: '📡', hasValue: 'api' },
  { id: 'notify', label: 'שלח התראה', icon: '🔔', hasValue: 'text' },
  { id: 'assign_to', label: 'הקצה לנציג', icon: '👤', hasValue: 'agent' },
];

export default function ActionEditor({ data, onUpdate }) {
  const actions = data.actions || [{ type: data.actionType || 'add_tag' }];

  const addAction = (type) => {
    onUpdate({ actions: [...actions, { type }] });
  };

  const removeAction = (index) => {
    if (actions.length <= 1) return;
    onUpdate({ actions: actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, updates) => {
    const newActions = actions.map((a, i) => i === index ? { ...a, ...updates } : a);
    onUpdate({ actions: newActions });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הוסף פעולות לביצוע. ניתן לשלב כמה פעולות.
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
          />
        ))}
      </div>

      {/* Add Action */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-500 mb-3">הוסף פעולה:</p>
        <div className="grid grid-cols-2 gap-2">
          {actionTypes.slice(0, 6).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-pink-50 hover:text-pink-700 rounded-lg transition-colors text-sm"
            >
              <span>{icon}</span>
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <details className="mt-2">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
            עוד פעולות...
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {actionTypes.slice(6).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => addAction(id)}
                className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-pink-50 hover:text-pink-700 rounded-lg transition-colors text-sm"
              >
                <span>{icon}</span>
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function ActionItem({ action, index, total, onUpdate, onRemove }) {
  const actionInfo = actionTypes.find(a => a.id === action.type) || actionTypes[0];

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-300 cursor-move" />
        <span className="text-lg">{actionInfo.icon}</span>
        <select
          value={action.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
        >
          {actionTypes.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        {total > 1 && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {actionInfo.hasValue === 'tag' && (
        <input
          type="text"
          value={action.tagName || ''}
          onChange={(e) => onUpdate({ tagName: e.target.value })}
          placeholder="שם התגית..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
        />
      )}

      {actionInfo.hasValue === 'keyvalue' && (
        <div className="space-y-2">
          <input
            type="text"
            value={action.varKey || ''}
            onChange={(e) => onUpdate({ varKey: e.target.value })}
            placeholder="שם המשתנה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
          />
          <input
            type="text"
            value={action.varValue || ''}
            onChange={(e) => onUpdate({ varValue: e.target.value })}
            placeholder="ערך (אפשר להשתמש ב-{{משתנים}})..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
          />
        </div>
      )}

      {actionInfo.hasValue === 'url' && (
        <input
          type="url"
          value={action.webhookUrl || ''}
          onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
          dir="ltr"
        />
      )}

      {actionInfo.hasValue === 'api' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={action.method || 'GET'}
              onChange={(e) => onUpdate({ method: e.target.value })}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input
              type="url"
              value={action.apiUrl || ''}
              onChange={(e) => onUpdate({ apiUrl: e.target.value })}
              placeholder="URL..."
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
              dir="ltr"
            />
          </div>
          <textarea
            value={action.body || ''}
            onChange={(e) => onUpdate({ body: e.target.value })}
            placeholder='{"key": "value"}'
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-pink-200 outline-none resize-none"
            rows={2}
            dir="ltr"
          />
        </div>
      )}

      {actionInfo.hasValue === 'text' && (
        <input
          type="text"
          value={action.text || ''}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="תוכן ההתראה..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-200 outline-none"
        />
      )}
    </div>
  );
}
