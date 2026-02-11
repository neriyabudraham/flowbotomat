import { memo } from 'react';
import { Globe } from 'lucide-react';
import BaseNode from './BaseNode';

function IntegrationNode({ data, selected }) {
  const hasApi = data.api?.apiUrl;
  const hasSheets = data.sheets?.actions?.length > 0;
  const hasContacts = data.contacts?.actions?.length > 0;
  const hasAnyConfig = hasApi || hasSheets || hasContacts;
  
  // Backward compatibility: check old format
  const oldActions = data.actions || [];
  const hasOldConfig = oldActions.length > 0;
  
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
        {!hasAnyConfig && !hasOldConfig && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרה
          </div>
        )}
        
        {hasApi && (
          <div className="flex items-center gap-2 p-1.5 bg-orange-50 rounded-lg">
            <span className="text-sm">📡</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium text-orange-700">API</span>
              <p className="text-[9px] text-orange-500 truncate" dir="ltr">
                {data.api.method || 'GET'} {data.api.apiUrl}
              </p>
            </div>
          </div>
        )}
        
        {hasSheets && (
          <div className="flex items-center gap-2 p-1.5 bg-green-50 rounded-lg">
            <span className="text-sm">📊</span>
            <span className="text-[10px] font-medium text-green-700">
              Google Sheets ({data.sheets.actions.length})
            </span>
          </div>
        )}
        
        {hasContacts && (
          <div className="flex items-center gap-2 p-1.5 bg-blue-50 rounded-lg">
            <span className="text-sm">👥</span>
            <span className="text-[10px] font-medium text-blue-700">
              Google Contacts ({data.contacts.actions.length})
            </span>
          </div>
        )}
        
        {/* Backward compatibility: old format */}
        {hasOldConfig && oldActions.map((action, i) => {
          const type = action.type || 'http_request';
          if (type === 'http_request' && action.apiUrl) {
            return (
              <div key={i} className="flex items-center gap-2 p-1.5 bg-orange-50 rounded-lg">
                <span className="text-sm">📡</span>
                <p className="text-[9px] text-orange-500 truncate flex-1" dir="ltr">
                  {action.method || 'GET'} {action.apiUrl}
                </p>
              </div>
            );
          }
          if (type === 'google_sheets') {
            return (
              <div key={i} className="flex items-center gap-2 p-1.5 bg-green-50 rounded-lg">
                <span className="text-sm">📊</span>
                <span className="text-[10px] text-green-700">Sheets</span>
              </div>
            );
          }
          if (type === 'google_contacts') {
            return (
              <div key={i} className="flex items-center gap-2 p-1.5 bg-blue-50 rounded-lg">
                <span className="text-sm">👥</span>
                <span className="text-[10px] text-blue-700">Contacts</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </BaseNode>
  );
}

export default memo(IntegrationNode);
