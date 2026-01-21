import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

function ConditionNode({ data, selected }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg border-2 min-w-[220px] ${
      selected ? 'border-orange-500' : 'border-orange-200'
    }`}>
      <Handle
        type="target"
        position={Position.Right}
        className="w-3 h-3 bg-orange-500"
      />
      
      <div className="bg-orange-500 text-white px-4 py-2 rounded-t-lg flex items-center gap-2">
        <GitBranch className="w-4 h-4" />
        <span className="font-medium">תנאי</span>
      </div>
      
      <div className="p-4 space-y-2">
        <select
          value={data.variable || ''}
          onChange={(e) => data.onChange?.({ variable: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">בחר משתנה...</option>
          <option value="message">הודעה</option>
          <option value="contact_name">שם איש קשר</option>
          <option value="first_contact">איש קשר חדש</option>
        </select>
        
        <select
          value={data.operator || 'equals'}
          onChange={(e) => data.onChange?.({ operator: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="equals">שווה ל</option>
          <option value="contains">מכיל</option>
          <option value="starts_with">מתחיל ב</option>
          <option value="is_true">אמת</option>
          <option value="is_false">שקר</option>
        </select>
        
        {!['is_true', 'is_false'].includes(data.operator) && (
          <input
            type="text"
            value={data.value || ''}
            onChange={(e) => data.onChange?.({ value: e.target.value })}
            placeholder="ערך..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        )}
      </div>
      
      <div className="flex justify-between px-4 pb-3 text-xs">
        <span className="text-green-600">כן ✓</span>
        <span className="text-red-600">לא ✗</span>
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        id="yes"
        style={{ top: '70%' }}
        className="w-3 h-3 bg-green-500"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="no"
        style={{ top: '85%' }}
        className="w-3 h-3 bg-red-500"
      />
    </div>
  );
}

export default memo(ConditionNode);
