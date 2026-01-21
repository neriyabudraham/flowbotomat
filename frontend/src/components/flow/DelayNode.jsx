import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';

function DelayNode({ data, selected }) {
  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border transition-all min-w-[220px] ${
      selected ? 'border-blue-400 shadow-lg shadow-blue-100' : 'border-gray-200 shadow-md'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white rounded-t-2xl">
        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
          <Clock className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-800">השהייה</span>
      </div>
      
      {/* Content */}
      <div className="p-3">
        <div className="flex gap-2">
          <input
            type="number"
            value={data.delay || 1}
            onChange={(e) => data.onChange?.({ delay: Math.max(1, parseInt(e.target.value) || 1) })}
            min={1}
            className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          />
          <select
            value={data.unit || 'seconds'}
            onChange={(e) => data.onChange?.({ unit: e.target.value })}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          >
            <option value="seconds">שניות</option>
            <option value="minutes">דקות</option>
            <option value="hours">שעות</option>
          </select>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(DelayNode);
