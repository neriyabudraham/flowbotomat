import { memo } from 'react';
import BaseNode from './BaseNode';

const OPERATION_LABELS = {
  append_row: 'הוספת שורה',
  update_row: 'עדכון שורה',
  search_rows: 'חיפוש שורות',
  read_rows: 'קריאת שורות',
  search_and_update: 'חיפוש ועדכון',
  search_or_append: 'חיפוש או הוספה',
};

const OPERATION_ICONS = {
  append_row: '➕',
  update_row: '✏️',
  search_rows: '🔍',
  read_rows: '📖',
  search_and_update: '🔄',
  search_or_append: '🔎➕',
};

function GoogleSheetsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M14.5 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V7.5L14.5 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="12" y1="10" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function GoogleSheetsNode({ data, selected }) {
  const actions = data.actions || [];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="google_sheets"
      color="green"
      icon={GoogleSheetsIcon}
      title="Google Sheets"
    >
      <div className="space-y-2">
        {actions.length === 0 && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרת פעולה
          </div>
        )}
        
        {actions.map((action, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
            <span className="text-base">{OPERATION_ICONS[action.operation] || '📄'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-green-700">
                {OPERATION_LABELS[action.operation] || 'פעולה'}
              </span>
              {action.spreadsheetName && (
                <p className="text-[10px] text-green-500 truncate">
                  {action.spreadsheetName}
                  {action.sheetName ? ` / ${action.sheetName}` : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </BaseNode>
  );
}

export default memo(GoogleSheetsNode);
