import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

const triggerLabels = {
  any_message: 'כל הודעה',
  contains: 'הודעה מכילה',
  starts_with: 'מתחילה ב...',
  exact: 'טקסט מדויק',
  first_message: 'הודעה ראשונה',
  contact_added: 'איש קשר נוסף',
  tag_added: 'תגית נוספה',
};

function TriggerNode({ data, selected }) {
  const triggers = data.triggers || [{ type: 'any_message' }];
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[200px] cursor-pointer ${
        selected 
          ? 'border-purple-500 shadow-xl shadow-purple-500/20' 
          : 'border-gray-200 shadow-lg hover:border-purple-300 hover:shadow-xl'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-purple-500 to-purple-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">טריגר</span>
      </div>
      
      {/* Content - Display Only */}
      <div className="p-4 space-y-2">
        {triggers.map((trigger, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span className="text-gray-700">
              {triggerLabels[trigger.type] || trigger.type}
              {trigger.value && <span className="text-gray-500 mr-1">: {trigger.value}</span>}
            </span>
          </div>
        ))}
      </div>
      
      {/* Source Handle - Right side for RTL flow */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-purple-500 !border-[3px] !border-white !shadow-lg transition-transform hover:!scale-125"
      />
    </div>
  );
}

export default memo(TriggerNode);
