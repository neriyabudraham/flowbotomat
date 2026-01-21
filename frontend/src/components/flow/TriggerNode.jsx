import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

function TriggerNode({ data, selected }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg border-2 min-w-[200px] ${
      selected ? 'border-purple-500' : 'border-purple-200'
    }`}>
      <div className="bg-purple-500 text-white px-4 py-2 rounded-t-lg flex items-center gap-2">
        <Zap className="w-4 h-4" />
        <span className="font-medium">טריגר</span>
      </div>
      
      <div className="p-4">
        <select
          value={data.triggerType || 'any_message'}
          onChange={(e) => data.onChange?.({ triggerType: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg text-sm mb-2"
        >
          <option value="any_message">כל הודעה</option>
          <option value="contains">מכיל טקסט</option>
          <option value="starts_with">מתחיל ב...</option>
          <option value="exact">טקסט מדויק</option>
          <option value="first_message">הודעה ראשונה</option>
        </select>
        
        {['contains', 'starts_with', 'exact'].includes(data.triggerType) && (
          <input
            type="text"
            value={data.triggerValue || ''}
            onChange={(e) => data.onChange?.({ triggerValue: e.target.value })}
            placeholder="הזן טקסט..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="w-3 h-3 bg-purple-500"
      />
    </div>
  );
}

export default memo(TriggerNode);
