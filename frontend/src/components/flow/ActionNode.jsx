import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Tag, Variable, UserX, Bot } from 'lucide-react';

const icons = {
  add_tag: Tag,
  set_variable: Variable,
  stop_bot: UserX,
  enable_bot: Bot,
};

function ActionNode({ data, selected }) {
  const Icon = icons[data.actionType] || Tag;
  
  return (
    <div className={`bg-white rounded-xl shadow-lg border-2 min-w-[200px] ${
      selected ? 'border-pink-500' : 'border-pink-200'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="w-3 h-3 bg-pink-500"
      />
      
      <div className="bg-pink-500 text-white px-4 py-2 rounded-t-lg flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="font-medium">פעולה</span>
      </div>
      
      <div className="p-4 space-y-2">
        <select
          value={data.actionType || 'add_tag'}
          onChange={(e) => data.onChange?.({ actionType: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="add_tag">הוסף תגית</option>
          <option value="remove_tag">הסר תגית</option>
          <option value="set_variable">הגדר משתנה</option>
          <option value="stop_bot">עצור בוט</option>
          <option value="enable_bot">הפעל בוט</option>
        </select>
        
        {['add_tag', 'remove_tag'].includes(data.actionType) && (
          <input
            type="text"
            value={data.tagName || ''}
            onChange={(e) => data.onChange?.({ tagName: e.target.value })}
            placeholder="שם התגית..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        )}
        
        {data.actionType === 'set_variable' && (
          <>
            <input
              type="text"
              value={data.varKey || ''}
              onChange={(e) => data.onChange?.({ varKey: e.target.value })}
              placeholder="שם המשתנה..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="text"
              value={data.varValue || ''}
              onChange={(e) => data.onChange?.({ varValue: e.target.value })}
              placeholder="ערך..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="w-3 h-3 bg-pink-500"
      />
    </div>
  );
}

export default memo(ActionNode);
