import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

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
  { id: 'random', label: 'מספר אקראי (1-100)', group: 'מתקדם' },
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
  { id: 'is_empty', label: 'ריק', group: 'בדיקה' },
  { id: 'is_not_empty', label: 'לא ריק', group: 'בדיקה' },
  { id: 'is_true', label: 'קיים/אמת', group: 'בדיקה' },
  { id: 'is_false', label: 'לא קיים/שקר', group: 'בדיקה' },
];

const messageTypes = [
  { id: 'text', label: 'טקסט' },
  { id: 'image', label: 'תמונה' },
  { id: 'video', label: 'סרטון' },
  { id: 'audio', label: 'קול' },
  { id: 'document', label: 'מסמך' },
  { id: 'sticker', label: 'סטיקר' },
  { id: 'location', label: 'מיקום' },
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

// Single condition component
function ConditionRow({ condition, onChange, onRemove, canRemove }) {
  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(condition.operator);
  const needsVarName = ['has_tag', 'contact_var'].includes(condition.variable);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <select
            value={condition.variable || 'message'}
            onChange={(e) => onChange({ ...condition, variable: e.target.value })}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            {Object.entries(groupedVariables).map(([group, vars]) => (
              <optgroup key={group} label={group}>
                {vars.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </optgroup>
            ))}
          </select>
          
          <select
            value={condition.operator || 'equals'}
            onChange={(e) => onChange({ ...condition, operator: e.target.value })}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            {Object.entries(groupedOperators).map(([group, ops]) => (
              <optgroup key={group} label={group}>
                {ops.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        
        {canRemove && (
          <button onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {needsVarName && (
        <input
          type="text"
          value={condition.varName || ''}
          onChange={(e) => onChange({ ...condition, varName: e.target.value })}
          placeholder={condition.variable === 'has_tag' ? 'שם התגית' : 'שם המשתנה'}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        />
      )}
      
      {needsValue && (
        condition.variable === 'message_type' ? (
          <select
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">בחר סוג...</option>
            {messageTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        ) : condition.variable === 'day' ? (
          <select
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">בחר יום...</option>
            {days.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        ) : condition.variable === 'time' ? (
          <input
            type="time"
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          />
        ) : (
          <input
            type="text"
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="ערך להשוואה..."
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          />
        )
      )}
    </div>
  );
}

// Condition group component
function ConditionGroup({ group, onChange, onRemove, canRemove, isRoot = false }) {
  const conditions = group.conditions || [];
  const logic = group.logic || 'AND';

  const addCondition = () => {
    onChange({
      ...group,
      conditions: [...conditions, { variable: 'message', operator: 'contains', value: '' }]
    });
  };

  const addGroup = () => {
    onChange({
      ...group,
      conditions: [...conditions, { isGroup: true, logic: 'OR', conditions: [{ variable: 'message', operator: 'contains', value: '' }] }]
    });
  };

  const updateCondition = (index, newCondition) => {
    const newConditions = [...conditions];
    newConditions[index] = newCondition;
    onChange({ ...group, conditions: newConditions });
  };

  const removeCondition = (index) => {
    if (conditions.length <= 1 && !isRoot) return;
    onChange({ ...group, conditions: conditions.filter((_, i) => i !== index) });
  };

  return (
    <div className={`space-y-2 ${!isRoot ? 'bg-gray-50 rounded-xl p-3 border-2 border-dashed border-gray-200' : ''}`}>
      {!isRoot && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">קבוצת תנאים</span>
          {canRemove && (
            <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">הסר קבוצה</button>
          )}
        </div>
      )}
      
      {conditions.map((condition, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="flex justify-center py-1">
              <button
                onClick={() => onChange({ ...group, logic: logic === 'AND' ? 'OR' : 'AND' })}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  logic === 'AND' 
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                {logic === 'AND' ? 'וגם' : 'או'}
              </button>
            </div>
          )}
          
          {condition.isGroup ? (
            <ConditionGroup
              group={condition}
              onChange={(newGroup) => updateCondition(index, newGroup)}
              onRemove={() => removeCondition(index)}
              canRemove={conditions.length > 1 || !isRoot}
            />
          ) : (
            <ConditionRow
              condition={condition}
              onChange={(newCond) => updateCondition(index, newCond)}
              onRemove={() => removeCondition(index)}
              canRemove={conditions.length > 1 || !isRoot}
            />
          )}
        </div>
      ))}
      
      {/* Add buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={addCondition}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg"
        >
          <Plus className="w-3 h-3" />
          תנאי
        </button>
        <button
          onClick={addGroup}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg"
        >
          <Plus className="w-3 h-3" />
          קבוצה
        </button>
      </div>
    </div>
  );
}

export default function ConditionEditor({ data, onUpdate }) {
  // Convert old format to new format if needed
  const conditionGroup = data.conditionGroup || {
    logic: 'AND',
    conditions: data.variable ? [{ variable: data.variable, operator: data.operator, value: data.value, varName: data.varName }] : [{ variable: 'message', operator: 'contains', value: '' }]
  };

  const handleGroupChange = (newGroup) => {
    onUpdate({ conditionGroup: newGroup });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הגדר תנאים מורכבים עם קבוצות. לחץ על "וגם"/"או" כדי לשנות את הלוגיקה.
      </p>
      
      <ConditionGroup
        group={conditionGroup}
        onChange={handleGroupChange}
        onRemove={() => {}}
        canRemove={false}
        isRoot={true}
      />
      
      <div className="bg-orange-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-green-500"></span>
          <span className="text-sm text-gray-700">אם כל התנאים מתקיימים → יציאה ירוקה</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-red-500"></span>
          <span className="text-sm text-gray-700">אם לא מתקיימים → יציאה אדומה</span>
        </div>
      </div>
    </div>
  );
}
