const variables = [
  { id: 'message', label: 'תוכן ההודעה' },
  { id: 'contact_name', label: 'שם איש קשר' },
  { id: 'is_first_contact', label: 'איש קשר חדש' },
  { id: 'has_tag', label: 'יש תגית' },
  { id: 'custom_var', label: 'משתנה מותאם' },
];

const operators = [
  { id: 'equals', label: 'שווה ל' },
  { id: 'not_equals', label: 'לא שווה ל' },
  { id: 'contains', label: 'מכיל' },
  { id: 'not_contains', label: 'לא מכיל' },
  { id: 'starts_with', label: 'מתחיל ב' },
  { id: 'ends_with', label: 'נגמר ב' },
  { id: 'is_empty', label: 'ריק' },
  { id: 'is_not_empty', label: 'לא ריק' },
  { id: 'is_true', label: 'אמת' },
  { id: 'is_false', label: 'שקר' },
  { id: 'greater_than', label: 'גדול מ' },
  { id: 'less_than', label: 'קטן מ' },
];

export default function ConditionEditor({ data, onUpdate }) {
  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(data.operator);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הגדר תנאי שיקבע איזה נתיב הבוט ילך.
      </p>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          בדוק את
        </label>
        <select
          value={data.variable || 'message'}
          onChange={(e) => onUpdate({ variable: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
        >
          {variables.map(v => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </div>
      
      {data.variable === 'custom_var' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            שם המשתנה
          </label>
          <input
            type="text"
            value={data.varName || ''}
            onChange={(e) => onUpdate({ varName: e.target.value })}
            placeholder="שם המשתנה..."
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
          />
        </div>
      )}
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          תנאי
        </label>
        <select
          value={data.operator || 'equals'}
          onChange={(e) => onUpdate({ operator: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
        >
          {operators.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
      
      {needsValue && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ערך
          </label>
          <input
            type="text"
            value={data.value || ''}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="ערך להשוואה..."
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
          />
        </div>
      )}
      
      <div className="bg-orange-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
          <span className="text-sm text-gray-700">אם התנאי מתקיים → יציאה ירוקה</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span className="text-sm text-gray-700">אם התנאי לא מתקיים → יציאה אדומה</span>
        </div>
      </div>
    </div>
  );
}
