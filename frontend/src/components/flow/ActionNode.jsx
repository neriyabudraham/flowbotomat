import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Cog } from 'lucide-react';

const actionTypes = [
  { id: 'add_tag', label: 'הוסף תגית', icon: '🏷️', hasValue: true },
  { id: 'remove_tag', label: 'הסר תגית', icon: '🏷️', hasValue: true },
  { id: 'set_variable', label: 'הגדר משתנה', icon: '📝', hasKeyValue: true },
  { id: 'stop_bot', label: 'עצור בוט לאיש קשר', icon: '🛑' },
  { id: 'enable_bot', label: 'הפעל בוט לאיש קשר', icon: '▶️' },
  { id: 'delete_contact', label: 'מחק איש קשר', icon: '🗑️' },
  { id: 'webhook', label: 'שלח Webhook', icon: '🌐', hasUrl: true },
];

function ActionNode({ data, selected }) {
  const actionInfo = actionTypes.find(a => a.id === data.actionType) || actionTypes[0];

  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border transition-all min-w-[260px] ${
      selected ? 'border-pink-400 shadow-lg shadow-pink-100' : 'border-gray-200 shadow-md'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="!w-3 !h-3 !bg-pink-500 !border-2 !border-white"
      />
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-white rounded-t-2xl">
        <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center">
          <Cog className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-800">פעולה</span>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
          <span className="text-lg">{actionInfo.icon}</span>
          <select
            value={data.actionType || 'add_tag'}
            onChange={(e) => data.onChange?.({ actionType: e.target.value })}
            className="flex-1 px-2 py-1 bg-transparent border-none text-sm focus:ring-0 outline-none"
          >
            {actionTypes.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        
        {actionInfo.hasValue && (
          <input
            type="text"
            value={data.tagName || ''}
            onChange={(e) => data.onChange?.({ tagName: e.target.value })}
            placeholder="שם התגית..."
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
          />
        )}
        
        {actionInfo.hasKeyValue && (
          <>
            <input
              type="text"
              value={data.varKey || ''}
              onChange={(e) => data.onChange?.({ varKey: e.target.value })}
              placeholder="שם המשתנה..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
            />
            <input
              type="text"
              value={data.varValue || ''}
              onChange={(e) => data.onChange?.({ varValue: e.target.value })}
              placeholder="ערך..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
            />
          </>
        )}
        
        {actionInfo.hasUrl && (
          <input
            type="url"
            value={data.webhookUrl || ''}
            onChange={(e) => data.onChange?.({ webhookUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none"
            dir="ltr"
          />
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="!w-3 !h-3 !bg-pink-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ActionNode);
