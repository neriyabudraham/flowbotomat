import { memo } from 'react';
import { Globe } from 'lucide-react';
import BaseNode from './BaseNode';

function IntegrationNode({ data, selected }) {
  const actions = data.actions || [];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="integration"
      color="orange"
      icon={Globe}
      title="אינטגרציה"
    >
      <div className="space-y-2">
        {actions.length === 0 && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להוספת קריאות API
          </div>
        )}
        
        {actions.map((action, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg">
            <span className="text-base">📡</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-orange-700">קריאת API</span>
              {action.apiUrl && (
                <p className="text-[10px] text-orange-500 truncate" dir="ltr">
                  {action.method || 'GET'} {action.apiUrl}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </BaseNode>
  );
}

export default memo(IntegrationNode);
