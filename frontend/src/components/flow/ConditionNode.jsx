import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

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
];

function ConditionNode({ data, selected }) {
  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(data.operator);

  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border transition-all min-w-[260px] ${
      selected ? 'border-orange-400 shadow-lg shadow-orange-100' : 'border-gray-200 shadow-md'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"
      />
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white rounded-t-2xl">
        <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-800">תנאי</span>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        <select
          value={data.variable || 'message'}
          onChange={(e) => data.onChange?.({ variable: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
        >
          {variables.map(v => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        
        {data.variable === 'custom_var' && (
          <input
            type="text"
            value={data.varName || ''}
            onChange={(e) => data.onChange?.({ varName: e.target.value })}
            placeholder="שם המשתנה..."
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
          />
        )}
        
        <select
          value={data.operator || 'equals'}
          onChange={(e) => data.onChange?.({ operator: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
        >
          {operators.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        
        {needsValue && (
          <input
            type="text"
            value={data.value || ''}
            onChange={(e) => data.onChange?.({ value: e.target.value })}
            placeholder="ערך להשוואה..."
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
          />
        )}
      </div>
      
      {/* Outputs */}
      <div className="flex justify-between px-4 py-2 bg-gray-50 rounded-b-2xl text-xs font-medium">
        <div className="flex items-center gap-1 text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          כן
        </div>
        <div className="flex items-center gap-1 text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          לא
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        id="yes"
        style={{ top: '75%' }}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="no"
        style={{ top: '90%' }}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ConditionNode);
