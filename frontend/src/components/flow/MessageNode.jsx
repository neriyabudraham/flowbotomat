import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

function MessageNode({ data, selected }) {
  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border transition-all min-w-[260px] ${
      selected ? 'border-teal-400 shadow-lg shadow-teal-100' : 'border-gray-200 shadow-md'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="!w-3 !h-3 !bg-teal-500 !border-2 !border-white"
      />
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white rounded-t-2xl">
        <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-800">שליחת הודעה</span>
      </div>
      
      {/* Content */}
      <div className="p-3">
        <textarea
          value={data.content || ''}
          onChange={(e) => data.onChange?.({ content: e.target.value })}
          placeholder="תוכן ההודעה...&#10;&#10;משתנים זמינים:&#10;{{name}} - שם איש קשר&#10;{{phone}} - מספר טלפון"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none"
          rows={4}
        />
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="!w-3 !h-3 !bg-teal-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(MessageNode);
