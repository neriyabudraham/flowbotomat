import { memo } from 'react';
import { GitBranch } from 'lucide-react';
import BaseNode from './BaseNode';

const variableLabels = {
  message: 'הודעה',
  contact_name: 'שם',
  phone: 'טלפון',
  is_first_contact: 'חדש?',
  has_tag: 'תגית',
  variable: 'משתנה',
  time: 'שעה',
  day: 'יום',
};

const operatorLabels = {
  equals: '=',
  not_equals: '≠',
  contains: '⊃',
  not_contains: '⊅',
  starts_with: 'מתחיל',
  ends_with: 'נגמר',
  greater_than: '>',
  less_than: '<',
  is_true: '✓',
  is_false: '✗',
  regex: 'regex',
};

function ConditionNode({ data, selected }) {
  const varLabel = variableLabels[data.variable] || data.variable || '?';
  const opLabel = operatorLabels[data.operator] || '=';
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="condition"
      color="orange"
      icon={GitBranch}
      title="תנאי"
      sourceHandles={[
        { id: 'yes', position: '40%', color: '!bg-green-500' },
        { id: 'no', position: '70%', color: '!bg-red-500' },
      ]}
    >
      <div className="bg-orange-50 rounded-lg p-3 text-center">
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="font-bold text-orange-700">{varLabel}</span>
          <span className="px-2 py-0.5 bg-orange-200 rounded text-orange-800 font-mono">{opLabel}</span>
          {data.value && <span className="text-orange-600">"{data.value}"</span>}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-xs font-medium px-1">
        <div className="flex items-center gap-1 text-green-600">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
          כן
        </div>
        <div className="flex items-center gap-1 text-red-600">
          לא
          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
        </div>
      </div>
    </BaseNode>
  );
}

export default memo(ConditionNode);
