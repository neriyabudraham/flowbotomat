import { memo } from 'react';
import BaseNode from './BaseNode';

const OPERATION_LABELS = {
  check_exists: 'בדיקת קיום',
  search_contact: 'חיפוש איש קשר',
  create_contact: 'יצירת איש קשר',
  update_contact: 'עדכון איש קשר',
  find_or_create: 'מצא או צור',
  add_to_label: 'הוספה לתווית',
  remove_from_label: 'הסרה מתווית',
};

const OPERATION_ICONS = {
  check_exists: '❓',
  search_contact: '🔍',
  create_contact: '➕',
  update_contact: '✏️',
  find_or_create: '🔎➕',
  add_to_label: '🏷️',
  remove_from_label: '🗑️',
};

function GoogleContactsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="18" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1"/>
    </svg>
  );
}

function GoogleContactsNode({ data, selected }) {
  const actions = data.actions || [];
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="google_contacts"
      color="blue"
      icon={GoogleContactsIcon}
      title="Google Contacts"
    >
      <div className="space-y-2">
        {actions.length === 0 && (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרת פעולה
          </div>
        )}
        
        {actions.map((action, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
            <span className="text-base">{OPERATION_ICONS[action.operation] || '👤'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-blue-700">
                {OPERATION_LABELS[action.operation] || 'פעולה'}
              </span>
              {action.labelName && (
                <p className="text-[10px] text-blue-500 truncate">
                  תווית: {action.labelName}
                </p>
              )}
              {action.searchBy && (
                <p className="text-[10px] text-blue-500 truncate">
                  חיפוש לפי: {action.searchBy === 'phone' ? 'טלפון' : 'אימייל'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </BaseNode>
  );
}

export default memo(GoogleContactsNode);
