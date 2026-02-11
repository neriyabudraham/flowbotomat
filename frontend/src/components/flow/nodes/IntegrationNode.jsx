import { memo } from 'react';
import { Globe } from 'lucide-react';
import BaseNode from './BaseNode';

function IntegrationNode({ data, selected }) {
  const hasApi = !!data.api?.apiUrl;
  const hasSheets = data.sheets?.actions?.length > 0;
  const hasContacts = data.contacts?.actions?.length > 0;
  const hasAny = hasApi || hasSheets || hasContacts;
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="integration"
      color="amber"
      icon={Globe}
      title="אינטגרציה"
    >
      <div className="space-y-1.5">
        {!hasAny && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרה
          </div>
        )}
        
        {hasApi && (
          <div className="flex items-center gap-2 p-1.5 bg-orange-50 rounded-lg">
            <span className="text-sm">📡</span>
            <p className="text-[9px] text-orange-600 truncate flex-1" dir="ltr">
              {data.api.method || 'GET'} {data.api.apiUrl}
            </p>
          </div>
        )}
        
        {hasSheets && (
          <div className="flex items-center gap-2 p-1.5 bg-green-50 rounded-lg">
            <span className="text-sm">📊</span>
            <span className="text-[10px] text-green-700">
              Sheets ({data.sheets.actions.length})
            </span>
          </div>
        )}
        
        {hasContacts && (
          <div className="flex items-center gap-2 p-1.5 bg-blue-50 rounded-lg">
            <span className="text-sm">👥</span>
            <span className="text-[10px] text-blue-700">
              Contacts ({data.contacts.actions.length})
            </span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(IntegrationNode);
