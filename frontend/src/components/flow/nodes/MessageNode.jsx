import { memo } from 'react';
import { MessageSquare, Image, FileText, List, Clock } from 'lucide-react';
import BaseNode from './BaseNode';

const actionIcons = {
  text: MessageSquare,
  image: Image,
  file: FileText,
  list: List,
  delay: Clock,
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
        {actions.map((action, i) => {
          const Icon = actionIcons[action.type] || MessageSquare;
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-teal-600" />
                <span className="text-xs font-medium text-teal-700">
                  {action.type === 'text' && 'טקסט'}
                  {action.type === 'image' && 'תמונה'}
                  {action.type === 'file' && 'קובץ'}
                  {action.type === 'list' && 'רשימה'}
                  {action.type === 'delay' && 'השהייה'}
                </span>
              </div>
              <div className="text-sm text-gray-600 truncate">
                {action.type === 'text' && (action.content || 'לחץ לעריכה...')}
                {action.type === 'image' && (action.url ? '📷 תמונה מצורפת' : 'בחר תמונה...')}
                {action.type === 'list' && `${action.items?.length || 0} פריטים`}
                {action.type === 'delay' && `${action.delay || 1} ${action.unit === 'minutes' ? 'דקות' : 'שניות'}`}
              </div>
            </div>
          );
        })}
        <div className="text-xs text-gray-400 text-center pt-1">
          {actions.length} פעולות
        </div>
      </div>
    </BaseNode>
  );
}

export default memo(MessageNode);
