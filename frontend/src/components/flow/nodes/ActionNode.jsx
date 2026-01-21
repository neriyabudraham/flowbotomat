import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Cog } from 'lucide-react';

const actionLabels = {
  add_tag: { label: 'הוסף תגית', icon: '🏷️' },
  remove_tag: { label: 'הסר תגית', icon: '🏷️' },
  set_variable: { label: 'הגדר משתנה', icon: '📝' },
  stop_bot: { label: 'עצור בוט', icon: '🛑' },
  enable_bot: { label: 'הפעל בוט', icon: '▶️' },
  delete_contact: { label: 'מחק איש קשר', icon: '🗑️' },
  webhook: { label: 'שלח Webhook', icon: '🌐' },
};

function ActionNode({ data, selected }) {
  const action = actionLabels[data.actionType] || { label: 'בחר פעולה', icon: '⚙️' };
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[200px] cursor-pointer ${
        selected 
          ? 'border-pink-500 shadow-xl shadow-pink-500/20' 
          : 'border-gray-200 shadow-lg hover:border-pink-300 hover:shadow-xl'
      }`}
    >
      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-pink-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-pink-500 to-pink-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Cog className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">פעולה</span>
      </div>
      
      {/* Content - Display Only */}
      <div className="p-4 flex items-center gap-3">
        <span className="text-2xl">{action.icon}</span>
        <div>
          <div className="font-medium text-gray-800">{action.label}</div>
          {data.tagName && <div className="text-sm text-gray-500">{data.tagName}</div>}
          {data.varKey && <div className="text-sm text-gray-500">{data.varKey} = {data.varValue}</div>}
        </div>
      </div>
      
      {/* Source Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-pink-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
    </div>
  );
}

export default memo(ActionNode);
