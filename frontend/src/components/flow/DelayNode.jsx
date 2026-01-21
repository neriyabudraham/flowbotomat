import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';

function DelayNode({ data, selected }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg border-2 min-w-[180px] ${
      selected ? 'border-blue-500' : 'border-blue-200'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500"
      />
      
      <div className="bg-blue-500 text-white px-4 py-2 rounded-t-lg flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span className="font-medium">השהייה</span>
      </div>
      
      <div className="p-4 flex gap-2">
        <input
          type="number"
          value={data.delay || 1}
          onChange={(e) => data.onChange?.({ delay: parseInt(e.target.value) || 1 })}
          min={1}
          className="w-20 px-3 py-2 border rounded-lg text-sm"
        />
        <select
          value={data.unit || 'seconds'}
          onChange={(e) => data.onChange?.({ unit: e.target.value })}
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        >
          <option value="seconds">שניות</option>
          <option value="minutes">דקות</option>
          <option value="hours">שעות</option>
        </select>
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500"
      />
    </div>
  );
}

export default memo(DelayNode);
