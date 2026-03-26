import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, Edit2, Copy, Trash2 } from 'lucide-react';

const variableLabels = {
  message: 'תוכן ההודעה',
  last_message: 'ההודעה האחרונה',
  message_type: 'סוג ההודעה',
  contact_name: 'שם איש קשר',
  phone: 'מספר טלפון',
  is_first_contact: 'איש קשר חדש',
  has_tag: 'יש תגית',
  has_media: 'יש מדיה',
  is_group: 'קבוצה',
  is_channel: 'ערוץ',
  contact_var: 'משתנה',
  no_tag: 'אין תגית',
  variable: 'משתנה',
  time: 'שעה נוכחית',
  day: 'יום בשבוע',
  date: 'תאריך',
  random: 'מספר אקראי',
};

const operatorLabels = {
  equals: 'שווה ל',
  not_equals: 'לא שווה ל',
  contains: 'מכיל',
  not_contains: 'לא מכיל',
  starts_with: 'מתחיל ב',
  ends_with: 'נגמר ב',
  matches_regex: 'תואם ביטוי',
  regex: 'תואם ביטוי',
  greater_than: 'גדול מ',
  less_than: 'קטן מ',
  greater_or_equal: 'גדול או שווה ל',
  less_or_equal: 'קטן או שווה ל',
  is_true: 'אמת',
  is_false: 'שקר',
  is_empty: 'ריק',
  is_not_empty: 'לא ריק',
  is_text: 'טקסט',
  is_number: 'מספר',
  is_email: 'מייל תקין',
  is_phone: 'מספר טלפון',
  is_image: 'תמונה',
  is_video: 'סרטון',
  is_audio: 'קובץ שמע',
  is_document: 'מסמך',
  is_pdf: 'קובץ PDF',
};

function ConditionNode({ data, selected }) {
  // Support: conditionGroup (new), conditions array, or old format (variable, operator, value)
  const conditionGroup = data.conditionGroup || null;
  const conditions = conditionGroup?.conditions || data.conditions || [];
  const logic = conditionGroup?.logic || data.logic || 'AND';
  
  // Clean variable display name - strip {{ }} and show readable name
  const cleanVarName = (name) => {
    if (!name) return '';
    return name.replace(/^\{\{|\}\}$/g, '');
  };

  // Build condition summary
  const getConditionSummary = (condition) => {
    if (condition.isGroup) {
      return `קבוצה (${condition.conditions?.length || 0} תנאים)`;
    }

    const varLabel = variableLabels[condition.variable] || condition.variable || '?';
    const opLabel = operatorLabels[condition.operator] || condition.operator || '=';

    // Unary operators - no value needed
    if (['is_true', 'is_false', 'is_empty', 'is_not_empty',
         'is_text', 'is_number', 'is_email', 'is_phone',
         'is_image', 'is_video', 'is_audio', 'is_document', 'is_pdf'].includes(condition.operator)) {
      if (condition.variable === 'contact_var' && condition.varName) {
        return `${cleanVarName(condition.varName)} → ${opLabel}`;
      }
      return `${varLabel} → ${opLabel}`;
    }

    // contact_var with variable name
    if (condition.variable === 'contact_var' && condition.varName) {
      const displayName = cleanVarName(condition.varName);
      if (condition.value) {
        return `${displayName} ${opLabel} "${condition.value}"`;
      }
      return `${displayName} ${opLabel}`;
    }

    // has_tag with tag name
    if (condition.variable === 'has_tag' && condition.varName) {
      if (condition.value) {
        return `תגית "${condition.varName}" ${opLabel} "${condition.value}"`;
      }
      return `תגית "${condition.varName}"`;
    }

    if (condition.value) {
      return `${varLabel} ${opLabel} "${condition.value}"`;
    }

    return `${varLabel} ${opLabel}`;
  };
  
  // Fallback for old format
  const hasOldFormat = data.variable && !conditions.length && !conditionGroup;
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[220px] max-w-[300px] relative ${
        selected 
          ? 'border-orange-400 shadow-lg shadow-orange-200' 
          : 'border-gray-200 shadow-md hover:shadow-lg hover:border-gray-300'
      }`}
    >
      {/* Hover Actions */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1">
          <button 
            onClick={(e) => { e.stopPropagation(); data.onEdit?.(); }}
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDuplicate?.(); }}
            className="p-2 hover:bg-green-50 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4 text-green-600" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>

      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 bg-orange-500 !border-2 !border-white !-left-2"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-orange-500 to-orange-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">תנאי</span>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Empty State */}
        {conditions.length === 0 && !hasOldFormat && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרת תנאי
          </div>
        )}
        
        {/* Old format fallback */}
        {hasOldFormat && (
          <div className="bg-orange-50 rounded-lg p-2 text-sm">
            <span className="text-orange-700 font-medium text-xs">
              {variableLabels[data.variable] || data.variable} {operatorLabels[data.operator] || '='} {data.value ? `"${data.value}"` : ''}
            </span>
          </div>
        )}
        
        {/* New format conditions */}
        {conditions.filter(c => !c.isGroup).slice(0, 3).map((condition, index) => (
          <div key={index}>
            {index > 0 && (
              <div className="flex items-center justify-center py-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  logic.toUpperCase() === 'AND' ? 'text-blue-500 bg-blue-50' : 'text-orange-500 bg-orange-50'
                }`}>
                  {logic.toUpperCase() === 'AND' ? 'וגם' : 'או'}
                </span>
              </div>
            )}
            <div className="bg-orange-50 rounded-lg px-3 py-2 text-sm">
              {condition.variable === 'contact_var' && condition.varName ? (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded font-medium">
                    {cleanVarName(condition.varName)}
                  </span>
                  <span className="text-orange-500">{operatorLabels[condition.operator] || condition.operator}</span>
                  {condition.value && (
                    <span className="text-orange-700 font-medium">"{condition.value}"</span>
                  )}
                </div>
              ) : (
                <span className="text-orange-700 font-medium text-xs">
                  {getConditionSummary(condition)}
                </span>
              )}
            </div>
          </div>
        ))}
        {conditions.length > 3 && (
          <div className="text-xs text-gray-400 text-center">
            +{conditions.length - 3} תנאים נוספים
          </div>
        )}
      </div>
      
      {/* Source Handles with labels */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ top: '40%' }}
        className="!w-4 !h-4 !bg-green-500 !border-2 !border-white !-right-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        style={{ top: '70%' }}
        className="!w-4 !h-4 !bg-red-500 !border-2 !border-white !-right-2"
      />
      
      {/* Labels next to handles (outside node) */}
      <div className="absolute -right-10 text-xs font-medium" style={{ top: 'calc(40% - 8px)' }}>
        <span className="text-green-600">כן</span>
      </div>
      <div className="absolute -right-10 text-xs font-medium" style={{ top: 'calc(70% - 8px)' }}>
        <span className="text-red-600">לא</span>
      </div>
    </div>
  );
}

export default memo(ConditionNode);
