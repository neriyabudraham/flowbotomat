import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

function MessageNode({ data, selected }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg border-2 min-w-[220px] ${
      selected ? 'border-teal-500' : 'border-teal-200'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="w-3 h-3 bg-teal-500"
      />
      
      <div className="bg-teal-500 text-white px-4 py-2 rounded-t-lg flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        <span className="font-medium">הודעה</span>
      </div>
      
      <div className="p-4">
        <textarea
          value={data.content || ''}
          onChange={(e) => data.onChange?.({ content: e.target.value })}
          placeholder="תוכן ההודעה..."
          className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
          rows={3}
        />
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="w-3 h-3 bg-teal-500"
      />
    </div>
  );
}

export default memo(MessageNode);
