import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

const variableLabels = {
  message: 'הודעה',
  contact_name: 'שם איש קשר',
  is_first_contact: 'איש קשר חדש',
  has_tag: 'יש תגית',
  custom_var: 'משתנה מותאם',
};

const operatorLabels = {
  equals: '=',
  not_equals: '≠',
  contains: 'מכיל',
  starts_with: 'מתחיל ב',
  is_true: 'אמת',
  is_false: 'שקר',
};

function ConditionNode({ data, selected }) {
  const varLabel = variableLabels[data.variable] || data.variable || 'בחר משתנה';
  const opLabel = operatorLabels[data.operator] || data.operator;
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[200px] cursor-pointer ${
        selected 
          ? 'border-orange-500 shadow-xl shadow-orange-500/20' 
          : 'border-gray-200 shadow-lg hover:border-orange-300 hover:shadow-xl'
      }`}
    >
      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-orange-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-orange-500 to-orange-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">תנאי</span>
      </div>
      
      {/* Content - Display Only */}
      <div className="p-4">
        <div className="text-sm text-gray-700 text-center">
          <span className="font-medium">{varLabel}</span>
          {opLabel && <span className="text-orange-600 mx-2">{opLabel}</span>}
          {data.value && <span className="text-gray-500">"{data.value}"</span>}
        </div>
      </div>
      
      {/* Output Labels */}
      <div className="flex justify-between px-4 pb-3 text-xs font-medium">
        <div className="flex items-center gap-1.5 text-green-600">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
          כן
        </div>
        <div className="flex items-center gap-1.5 text-red-600">
          לא
          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
        </div>
      </div>
      
      {/* Source Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ top: '65%' }}
        className="!w-4 !h-4 !bg-green-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        style={{ top: '85%' }}
        className="!w-4 !h-4 !bg-red-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
    </div>
  );
}

export default memo(ConditionNode);
