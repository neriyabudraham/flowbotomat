const actionTypes = [
  { id: 'add_tag', label: 'הוסף תגית', icon: '🏷️', hasValue: 'tag' },
  { id: 'remove_tag', label: 'הסר תגית', icon: '🏷️', hasValue: 'tag' },
  { id: 'set_variable', label: 'הגדר משתנה', icon: '📝', hasValue: 'keyvalue' },
  { id: 'stop_bot', label: 'עצור בוט לאיש קשר', icon: '🛑' },
  { id: 'enable_bot', label: 'הפעל בוט לאיש קשר', icon: '▶️' },
  { id: 'delete_contact', label: 'מחק איש קשר', icon: '🗑️' },
  { id: 'webhook', label: 'שלח Webhook', icon: '🌐', hasValue: 'url' },
];

export default function ActionEditor({ data, onUpdate }) {
  const actionInfo = actionTypes.find(a => a.id === data.actionType) || actionTypes[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        בחר פעולה שתתבצע בשלב זה.
      </p>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          סוג הפעולה
        </label>
        <select
          value={data.actionType || 'add_tag'}
          onChange={(e) => onUpdate({ actionType: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
        >
          {actionTypes.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
          ))}
        </select>
      </div>
      
      {actionInfo.hasValue === 'tag' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            שם התגית
          </label>
          <input
            type="text"
            value={data.tagName || ''}
            onChange={(e) => onUpdate({ tagName: e.target.value })}
            placeholder="לדוגמה: לקוח_פעיל"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
          />
        </div>
      )}
      
      {actionInfo.hasValue === 'keyvalue' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              שם המשתנה
            </label>
            <input
              type="text"
              value={data.varKey || ''}
              onChange={(e) => onUpdate({ varKey: e.target.value })}
              placeholder="לדוגמה: status"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ערך
            </label>
            <input
              type="text"
              value={data.varValue || ''}
              onChange={(e) => onUpdate({ varValue: e.target.value })}
              placeholder="לדוגמה: active"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
            />
          </div>
        </>
      )}
      
      {actionInfo.hasValue === 'url' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            כתובת Webhook
          </label>
          <input
            type="url"
            value={data.webhookUrl || ''}
            onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
            dir="ltr"
          />
        </div>
      )}
      
      <div className="bg-pink-50 rounded-xl p-4 flex items-center gap-3">
        <span className="text-3xl">{actionInfo.icon}</span>
        <div>
          <div className="font-medium text-pink-800">{actionInfo.label}</div>
          <div className="text-sm text-pink-600">
            {data.tagName || data.varKey || data.webhookUrl || 'הגדר את הפרטים למעלה'}
          </div>
        </div>
      </div>
    </div>
  );
}
