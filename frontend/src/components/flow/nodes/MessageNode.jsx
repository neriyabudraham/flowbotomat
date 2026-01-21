import { memo } from 'react';
import { MessageSquare, Image, FileText, Clock } from 'lucide-react';
import BaseNode from './BaseNode';

const actionIcons = {
  text: MessageSquare,
  image: Image,
  file: FileText,
  delay: Clock,
};

const actionLabels = {
  text: 'טקסט',
  image: 'תמונה',
  file: 'קובץ',
  delay: 'השהייה',
};

function MessageNode({ data, selected }) {
  const actions = data.actions || [{ type: 'text', content: '' }];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="message"
      color="teal"
      icon={MessageSquare}
      title="שליחת הודעה"
    >
      <div className="space-y-2">
        {actions.slice(0, 3).map((action, i) => {
          const Icon = actionIcons[action.type] || MessageSquare;
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-teal-600" />
                <span className="text-xs font-medium text-teal-700">
                  {actionLabels[action.type] || action.type}
                </span>
              </div>
              <div className="text-sm text-gray-600 line-clamp-2">
                {action.type === 'text' && (action.content || '(ריק)')}
                {action.type === 'image' && (action.fileName || action.url ? '📷 תמונה' : '(בחר תמונה)')}
                {action.type === 'file' && (action.fileName || action.url ? '📎 קובץ' : '(בחר קובץ)')}
                {action.type === 'delay' && `${action.delay || 1} ${action.unit === 'minutes' ? 'דקות' : 'שניות'}`}
              </div>
            </div>
          );
        })}
        {actions.length > 3 && (
          <div className="text-xs text-gray-400 text-center">
            +{actions.length - 3} פעולות נוספות
          </div>
        )}
        {actions.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-2">
            לחץ לעריכה
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(MessageNode);
