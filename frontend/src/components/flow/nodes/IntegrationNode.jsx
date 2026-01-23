import { memo } from 'react';
import { Globe } from 'lucide-react';
import BaseNode from './BaseNode';

const actionLabels = {
  webhook: 'Webhook',
  http_request: 'קריאת API',
  notify: 'התראה',
};

const actionIcons = {
  webhook: '🌐',
  http_request: '📡',
  notify: '🔔',
};

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
            לחץ להוספת אינטגרציות
          </div>
        )}
        
        {actions.slice(0, 4).map((action, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg">
            <span className="text-base">{actionIcons[action.type] || '🔌'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-orange-700">
                {actionLabels[action.type] || action.type}
              </span>
              {action.type === 'webhook' && action.webhookUrl && (
                <p className="text-[10px] text-orange-500 truncate" dir="ltr">{action.webhookUrl}</p>
              )}
              {action.type === 'http_request' && action.apiUrl && (
                <p className="text-[10px] text-orange-500 truncate" dir="ltr">
                  {action.method || 'GET'} {action.apiUrl}
                </p>
              )}
              {action.type === 'notify' && action.text && (
                <p className="text-[10px] text-orange-500 truncate">{action.text}</p>
              )}
            </div>
          </div>
        ))}
        
        {actions.length > 4 && (
          <div className="text-xs text-gray-400 text-center">
            +{actions.length - 4} אינטגרציות נוספות
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(IntegrationNode);
