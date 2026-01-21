import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';

const unitLabels = {
  seconds: 'שניות',
  minutes: 'דקות',
  hours: 'שעות',
};

function DelayNode({ data, selected }) {
  const delay = data.delay || 1;
  const unit = unitLabels[data.unit] || 'שניות';
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[180px] cursor-pointer ${
        selected 
          ? 'border-blue-500 shadow-xl shadow-blue-500/20' 
          : 'border-gray-200 shadow-lg hover:border-blue-300 hover:shadow-xl'
      }`}
    >
      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-blue-500 to-blue-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Clock className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">השהייה</span>
      </div>
      
      {/* Content - Display Only */}
      <div className="p-4 text-center">
        <span className="text-2xl font-bold text-blue-600">{delay}</span>
        <span className="text-gray-500 text-sm mr-2">{unit}</span>
      </div>
      
      {/* Source Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-blue-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
    </div>
  );
}

export default memo(DelayNode);
