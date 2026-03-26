import { memo } from 'react';
import { Cog } from 'lucide-react';
import BaseNode from './BaseNode';

const actionLabels = {
  add_tag: { label: 'הוסף תגית', icon: '🏷️' },
  remove_tag: { label: 'הסר תגית', icon: '🏷️' },
  set_variable: { label: 'הגדר משתנה', icon: '📝' },
  stop_bot: { label: 'עצור בוט', icon: '🛑' },
  enable_bot: { label: 'הפעל בוט', icon: '▶️' },
  delete_contact: { label: 'מחק איש קשר', icon: '🗑️' },
  webhook: { label: 'Webhook', icon: '🌐' },
  http_request: { label: 'קריאת API', icon: '📡' },
  notify: { label: 'התראה', icon: '🔔' },
  download_file: { label: 'הורד קובץ למשתנה', icon: '📥' },
};

function ActionNode({ data, selected }) {
  const actions = data.actions || [];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="action"
      color="pink"
      icon={Cog}
      title="פעולות"
    >
      <div className="space-y-2">
        {actions.length === 0 ? (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להוספת פעולות
          </div>
        ) : (
          actions.map((action, i) => {
            const info = actionLabels[action.type || data.actionType] || { label: 'פעולה', icon: '⚙️' };
            return (
              <div key={i} className="flex items-center gap-2 bg-pink-50 rounded-lg px-3 py-2">
                <span className="text-lg">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-pink-700">{info.label}</div>
                  {(action.tagName || data.tagName) && (
                    <div className="text-xs text-pink-500 truncate">{action.tagName || data.tagName}</div>
                  )}
                  {(action.varKey || data.varKey) && (
                    <div className="text-xs text-pink-500 truncate">{action.varKey || data.varKey}</div>
                  )}
                  {action.variableName && (
                    <div className="text-xs text-pink-500 truncate font-mono">{`{{${action.variableName}}}`}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </BaseNode>
  );
}

export default memo(ActionNode);
