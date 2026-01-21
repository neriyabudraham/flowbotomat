import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

function MessageNode({ data, selected }) {
  const content = data.content || 'לחץ לעריכה...';
  const preview = content.length > 60 ? content.slice(0, 60) + '...' : content;
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[200px] max-w-[280px] cursor-pointer ${
        selected 
          ? 'border-teal-500 shadow-xl shadow-teal-500/20' 
          : 'border-gray-200 shadow-lg hover:border-teal-300 hover:shadow-xl'
      }`}
    >
      {/* Target Handle - Left side */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-teal-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-teal-500 to-teal-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">הודעה</span>
      </div>
      
      {/* Content - Display Only */}
      <div className="p-4">
        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
          {data.content ? preview : <span className="text-gray-400 italic">לחץ לעריכה...</span>}
        </p>
      </div>
      
      {/* Source Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-teal-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
    </div>
  );
}

export default memo(MessageNode);
