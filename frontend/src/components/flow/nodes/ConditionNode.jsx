import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, Edit2, Copy, Trash2 } from 'lucide-react';

const variableLabels = {
  message: 'הודעה',
  contact_name: 'שם איש קשר',
  phone: 'טלפון',
  is_first_contact: 'איש קשר חדש',
  has_tag: 'יש תגית',
  no_tag: 'אין תגית',
  variable: 'משתנה',
  time: 'שעה',
  day: 'יום',
};

const operatorLabels = {
  equals: 'שווה ל',
  not_equals: 'לא שווה ל',
  contains: 'מכיל',
  not_contains: 'לא מכיל',
  starts_with: 'מתחיל ב',
  ends_with: 'מסתיים ב',
  greater_than: 'גדול מ',
  less_than: 'קטן מ',
  is_true: 'אמת',
  is_false: 'שקר',
  is_empty: 'ריק',
  is_not_empty: 'לא ריק',
  regex: 'תואם ביטוי',
};

function ConditionNode({ data, selected }) {
  // Support both old format (variable, operator, value) and new format (conditions array)
  const conditions = data.conditions || [];
  const logic = data.logic || 'and';
  
  // Build condition summary
  const getConditionSummary = (condition) => {
    const varLabel = variableLabels[condition.variable] || condition.variable || '?';
    const opLabel = operatorLabels[condition.operator] || condition.operator || '=';
    
    if (['is_true', 'is_false', 'is_empty', 'is_not_empty'].includes(condition.operator)) {
      return `${varLabel} ${opLabel}`;
    }
    
    if (condition.value) {
      return `${varLabel} ${opLabel} "${condition.value}"`;
    }
    
    return `${varLabel} ${opLabel}`;
  };
  
  // Fallback for old format
  const hasOldFormat = data.variable && !conditions.length;
  
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
        {conditions.map((condition, index) => (
          <div key={index}>
            {index > 0 && (
              <div className="flex items-center justify-center py-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  logic === 'and' ? 'text-purple-500 bg-purple-50' : 'text-orange-500 bg-orange-50'
                }`}>
                  {logic === 'and' ? 'וגם' : 'או'}
                </span>
              </div>
            )}
            <div className="bg-orange-50 rounded-lg p-2 text-sm">
              <span className="text-orange-700 font-medium text-xs">
                {getConditionSummary(condition)}
              </span>
            </div>
          </div>
        ))}
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
