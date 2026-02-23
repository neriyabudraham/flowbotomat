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
  status_viewed: '👁️ צפייה בסטטוס',
  status_reaction: '💚 סימון לב על סטטוס',
  status_reply: '💬 תגובה על סטטוס',
  group_join: '📥 הצטרף לקבוצה',
  group_leave: '📤 יצא מקבוצה',
  call_received: '📞 שיחה נכנסת',
  call_rejected: '📵 שיחה נדחתה',
  call_accepted: '✅ שיחה נענתה',
  poll_vote: '📊 מענה על סקר',
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
  
  // Trigger nodes cannot be deleted
  const canDelete = false;
  
  // Build summary of conditions
  const getConditionSummary = (condition) => {
    const label = triggerLabels[condition.type] || condition.type;
    
    // For simple triggers - no operator/value needed
    if (['any_message', 'first_message', 'contact_added', 'status_viewed', 'status_reaction', 'status_reply',
         'group_join', 'group_leave', 'call_received', 'call_rejected', 'call_accepted'].includes(condition.type)) {
      // Show specific status indicator if filtering by status
      if (condition.filterByStatus && condition.specificStatusId) {
        return `${label} (ספציפי)`;
      }
      // Show specific group indicator if filtering by group
      if (condition.filterByGroup && condition.specificGroupId) {
        return `${label} (ספציפי)`;
      }
      return label;
    }
    
    // For triggers with operators (message_content, contact_field)
    if (condition.operator && condition.type === 'message_content') {
      const op = operatorLabels[condition.operator] || condition.operator;
      if (condition.value) {
        return `הודעה ${op} "${condition.value}"`;
      }
      return label;
    }
    
    // For triggers with just a value (has_tag, no_tag, tag_added, tag_removed)
    if (condition.value) {
      return `${label}: ${condition.value}`;
    }
    
    return label;
  };
  
  // Build advanced settings summary
  const advancedSettings = [];
  // autoMarkSeen removed from display
  if (data.oncePerUser) advancedSettings.push('👤 פעם אחת ליוזר');
  if (data.hasCooldown) {
    const unit = { minutes: 'דקות', hours: 'שעות', days: 'ימים', weeks: 'שבועות' }[data.cooldownUnit] || data.cooldownUnit;
    advancedSettings.push(`⏱️ השהיה ${data.cooldownValue || data.cooldownHours || ''} ${unit || ''}`);
  }
  if (data.hasActiveHours) advancedSettings.push(`🕐 ${data.activeFrom || ''}-${data.activeTo || ''}`);
  
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
        
        {/* Advanced settings preview */}
        {advancedSettings.length > 0 && (
          <div className="border-t border-purple-100 pt-2 mt-2">
            <div className="flex flex-wrap gap-1">
              {advancedSettings.map((setting, idx) => (
                <span key={idx} className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                  {setting}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(TriggerNode);
