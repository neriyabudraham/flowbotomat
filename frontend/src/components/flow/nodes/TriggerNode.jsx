import { memo } from 'react';
import { Zap } from 'lucide-react';
import BaseNode from './BaseNode';

const triggerLabels = {
  any_message: '💬 כל הודעה',
  message_content: '🔍 תוכן הודעה',
  first_message: '👋 הודעה ראשונה',
  contact_field: '👤 שדה באיש קשר',
  has_tag: '🏷️ יש תגית',
  no_tag: '🏷️ אין תגית',
  contact_added: '➕ איש קשר נוסף',
  tag_added: '🏷️ תגית נוספה',
  tag_removed: '🏷️ תגית הוסרה',
};

const operatorLabels = {
  contains: 'מכיל',
  not_contains: 'לא מכיל',
  equals: 'שווה',
  not_equals: 'לא שווה',
  starts_with: 'מתחיל ב',
  ends_with: 'מסתיים ב',
  regex: 'תואם Regex',
  is_empty: 'ריק',
  is_not_empty: 'לא ריק',
};

function TriggerNode({ data, selected }) {
  // Use triggerGroups (new format) - supports OR groups with AND conditions
  const groups = data.triggerGroups || [];
  
  // Can delete trigger only if there are multiple triggers in the flow
  const triggerCount = data.triggerCount || 1;
  const canDelete = triggerCount > 1;
  
  // Build summary of conditions
  const getConditionSummary = (condition) => {
    const label = triggerLabels[condition.type] || condition.type;
    
    // For simple triggers like any_message, first_message
    if (!condition.value && !condition.operator) {
      return label;
    }
    
    // For triggers with operators (message_content, contact_field)
    if (condition.operator) {
      const op = operatorLabels[condition.operator] || condition.operator;
      if (condition.value) {
        return `${label} ${op} "${condition.value}"`;
      }
      return `${label} ${op}`;
    }
    
    // For triggers with just a value (has_tag, no_tag)
    if (condition.value) {
      return `${label}: ${condition.value}`;
    }
    
    return label;
  };
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="trigger"
      color="purple"
      icon={Zap}
      title="טריגר התחלה"
      hasTarget={false}
      canDelete={canDelete}
      canDuplicate={false}
    >
      <div className="space-y-2">
        {groups.length === 0 ? (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרת טריגר
          </div>
        ) : (
          groups.map((group, groupIndex) => (
            <div key={group.id || groupIndex}>
              {/* OR separator between groups */}
              {groupIndex > 0 && (
                <div className="flex items-center justify-center py-1">
                  <span className="text-xs text-orange-500 font-medium bg-orange-50 px-2 py-0.5 rounded">או</span>
                </div>
              )}
              
              {/* Group conditions */}
              <div className="space-y-1">
                {group.conditions?.map((condition, condIndex) => (
                  <div key={condIndex}>
                    {/* AND separator within group */}
                    {condIndex > 0 && (
                      <div className="flex items-center justify-center py-0.5">
                        <span className="text-xs text-purple-400 font-medium">וגם</span>
                      </div>
                    )}
                    <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-purple-700 font-medium text-xs">
                        {getConditionSummary(condition)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </BaseNode>
  );
}

export default memo(TriggerNode);
