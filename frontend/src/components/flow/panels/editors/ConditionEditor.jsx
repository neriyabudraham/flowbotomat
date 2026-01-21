const variables = [
  { id: 'message', label: 'תוכן ההודעה', group: 'הודעה' },
  { id: 'last_message', label: 'ההודעה האחרונה שהתקבלה', group: 'הודעה' },
  { id: 'message_type', label: 'סוג ההודעה', group: 'הודעה' },
  { id: 'contact_name', label: 'שם איש קשר', group: 'איש קשר' },
  { id: 'phone', label: 'מספר טלפון', group: 'איש קשר' },
  { id: 'is_first_contact', label: 'איש קשר חדש', group: 'איש קשר' },
  { id: 'has_tag', label: 'יש תגית', group: 'איש קשר' },
  { id: 'contact_var', label: 'משתנה איש קשר', group: 'איש קשר' },
  { id: 'time', label: 'שעה נוכחית', group: 'זמן' },
  { id: 'day', label: 'יום בשבוע', group: 'זמן' },
  { id: 'date', label: 'תאריך', group: 'זמן' },
  { id: 'random', label: 'מספר אקראי', group: 'מתקדם' },
  { id: 'custom', label: 'ביטוי מותאם', group: 'מתקדם' },
];

const operators = [
  { id: 'equals', label: 'שווה ל', group: 'בסיסי' },
  { id: 'not_equals', label: 'לא שווה ל', group: 'בסיסי' },
  { id: 'contains', label: 'מכיל', group: 'טקסט' },
  { id: 'not_contains', label: 'לא מכיל', group: 'טקסט' },
  { id: 'starts_with', label: 'מתחיל ב', group: 'טקסט' },
  { id: 'ends_with', label: 'נגמר ב', group: 'טקסט' },
  { id: 'matches_regex', label: 'תואם Regex', group: 'טקסט' },
  { id: 'greater_than', label: 'גדול מ', group: 'מספרים' },
  { id: 'less_than', label: 'קטן מ', group: 'מספרים' },
  { id: 'greater_equal', label: 'גדול או שווה', group: 'מספרים' },
  { id: 'less_equal', label: 'קטן או שווה', group: 'מספרים' },
  { id: 'is_empty', label: 'ריק', group: 'בדיקה' },
  { id: 'is_not_empty', label: 'לא ריק', group: 'בדיקה' },
  { id: 'is_true', label: 'אמת', group: 'בדיקה' },
  { id: 'is_false', label: 'שקר', group: 'בדיקה' },
  { id: 'is_number', label: 'מספר', group: 'בדיקה' },
  { id: 'is_email', label: 'אימייל תקין', group: 'בדיקה' },
  { id: 'is_phone', label: 'טלפון תקין', group: 'בדיקה' },
];

const messageTypes = [
  { id: 'text', label: 'טקסט' },
  { id: 'image', label: 'תמונה' },
  { id: 'video', label: 'סרטון' },
  { id: 'audio', label: 'קול' },
  { id: 'document', label: 'מסמך' },
  { id: 'sticker', label: 'סטיקר' },
  { id: 'location', label: 'מיקום' },
  { id: 'contact', label: 'איש קשר' },
];

const days = [
  { id: '0', label: 'ראשון' },
  { id: '1', label: 'שני' },
  { id: '2', label: 'שלישי' },
  { id: '3', label: 'רביעי' },
  { id: '4', label: 'חמישי' },
  { id: '5', label: 'שישי' },
  { id: '6', label: 'שבת' },
];

export default function ConditionEditor({ data, onUpdate }) {
  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false', 'is_number', 'is_email', 'is_phone'].includes(data.operator);
  const needsVarName = ['has_tag', 'contact_var', 'custom'].includes(data.variable);

  const groupedVariables = variables.reduce((acc, v) => {
    if (!acc[v.group]) acc[v.group] = [];
    acc[v.group].push(v);
    return acc;
  }, {});

  const groupedOperators = operators.reduce((acc, o) => {
    if (!acc[o.group]) acc[o.group] = [];
    acc[o.group].push(o);
    return acc;
  }, {});

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
          {Object.entries(groupedVariables).map(([group, vars]) => (
            <optgroup key={group} label={group}>
              {vars.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      
      {needsVarName && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {data.variable === 'has_tag' ? 'שם התגית' : 
             data.variable === 'contact_var' ? 'שם המשתנה' : 'ביטוי'}
          </label>
          <input
            type="text"
            value={data.varName || ''}
            onChange={(e) => onUpdate({ varName: e.target.value })}
            placeholder={data.variable === 'custom' ? 'לדוגמה: {{name}}.length > 3' : 'הזן ערך...'}
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
          {Object.entries(groupedOperators).map(([group, ops]) => (
            <optgroup key={group} label={group}>
              {ops.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      
      {needsValue && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ערך
          </label>
          {data.variable === 'message_type' ? (
            <select
              value={data.value || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
            >
              <option value="">בחר סוג...</option>
              {messageTypes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          ) : data.variable === 'day' ? (
            <select
              value={data.value || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
            >
              <option value="">בחר יום...</option>
              {days.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          ) : data.variable === 'time' ? (
            <input
              type="time"
              value={data.value || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
            />
          ) : (
            <input
              type="text"
              value={data.value || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              placeholder="ערך להשוואה..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
            />
          )}
        </div>
      )}
      
      <div className="bg-orange-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-green-500"></span>
          <span className="text-sm text-gray-700">אם התנאי מתקיים → יציאה ירוקה</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-red-500"></span>
          <span className="text-sm text-gray-700">אם התנאי לא מתקיים → יציאה אדומה</span>
        </div>
      </div>
    </div>
  );
}
