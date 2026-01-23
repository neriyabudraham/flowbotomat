import { memo } from 'react';
import { Clock, Keyboard } from 'lucide-react';
import BaseNode from './BaseNode';

const unitLabels = { seconds: 'ש׳', minutes: 'ד׳', hours: 'שע׳' };

function DelayNode({ data, selected }) {
  // Support both old format and new actions array format
  const actions = data.actions || [{ type: 'delay', delay: data.delay || 1, unit: data.unit || 'seconds' }];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="delay"
      color="blue"
      icon={Clock}
      title="השהייה/הקלדה"
    >
      <div className="space-y-2">
        {actions.map((action, i) => (
          <div key={i} className="bg-blue-50 rounded-lg p-2 flex items-center justify-center gap-2">
            {action.type === 'delay' ? (
              <>
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-lg font-bold text-blue-600">{action.delay || 1}</span>
                <span className="text-blue-500 text-sm">{unitLabels[action.unit] || 'ש׳'}</span>
              </>
            ) : (
              <>
                <Keyboard className="w-4 h-4 text-gray-500" />
                <span className="text-lg font-bold text-gray-600">{action.typingDuration || 3}</span>
                <span className="text-gray-500 text-sm">ש׳</span>
              </>
            )}
          </div>
        ))}
      </div>
    </BaseNode>
  );
}

export default memo(DelayNode);
