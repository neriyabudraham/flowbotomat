import { memo } from 'react';
import { Globe } from 'lucide-react';
import BaseNode from './BaseNode';

function getActionDisplay(action) {
  const actionType = action.type || 'http_request';
  
  switch (actionType) {
    case 'google_sheets': {
      const subActions = action.actions || [];
      const description = subActions.length > 0 
        ? subActions.map(a => {
            switch (a.operation) {
              case 'read': return 'קריאה';
              case 'add': return 'הוספה';
              case 'update': return 'עדכון';
              case 'search': return 'חיפוש';
              default: return a.operation;
            }
          }).join(', ')
        : 'לא הוגדר';
      return { icon: '📊', label: 'Google Sheets', description, bg: 'bg-green-50', text: 'text-green-700', desc: 'text-green-500' };
    }
    case 'google_contacts': {
      const subActions = action.actions || [];
      const description = subActions.length > 0
        ? subActions.map(a => {
            switch (a.operation) {
              case 'check_exists': return 'בדיקה';
              case 'search_contact': return 'חיפוש';
              case 'create_contact': return 'יצירה';
              case 'find_or_create': return 'מצא/צור';
              case 'add_to_label': return 'תווית';
              default: return a.operation;
            }
          }).join(', ')
        : 'לא הוגדר';
      return { icon: '👥', label: 'Google Contacts', description, bg: 'bg-blue-50', text: 'text-blue-700', desc: 'text-blue-500' };
    }
    default:
      return { 
        icon: '📡', 
        label: 'קריאת API', 
        description: action.apiUrl ? `${action.method || 'GET'} ${action.apiUrl}` : '', 
        bg: 'bg-orange-50', 
        text: 'text-orange-700',
        desc: 'text-orange-500',
        ltr: true
      };
  }
}

function IntegrationNode({ data, selected }) {
  const actions = data.actions || [];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="integration"
      color="amber"
      icon={Globe}
      title="אינטגרציה"
    >
      <div className="space-y-2">
        {actions.length === 0 && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להוספת פעולות
          </div>
        )}
        
        {actions.map((action, i) => {
          const display = getActionDisplay(action);
          return (
            <div key={i} className={`flex items-center gap-2 p-2 ${display.bg} rounded-lg`}>
              <span className="text-base">{display.icon}</span>
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-medium ${display.text}`}>{display.label}</span>
                {display.description && (
                  <p className={`text-[10px] ${display.desc} truncate`} dir={display.ltr ? 'ltr' : 'rtl'}>
                    {display.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </BaseNode>
  );
}

export default memo(IntegrationNode);
