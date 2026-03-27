import { memo } from 'react';
import { Zap } from 'lucide-react';
import BaseNode from './BaseNode';

const triggerLabels = {
  any_message: '💬 כל הודעה נכנסת',
  message_content: '🔍 תוכן הודעה',
  message_received: '📨 הודעה נכנסת לפי סוג',
  first_message: '👋 הודעה ראשונה',
  no_message_in: '🔕 לא שלח הודעה',
  bot_activated: '▶️ הפעלת הבוט',
  contact_field: '👤 שדה באיש קשר',
  has_tag: '🏷️ יש תגית',
  no_tag: '🏷️ אין תגית',
  contact_added: '➕ איש קשר נוסף',
  tag_added: '🏷️ תגית נוספה',
  tag_removed: '🏷️ תגית הוסרה',
  not_triggered_in: '⏰ לא הופעל',
  status_viewed: '👁️ צפייה בסטטוס',
  status_reaction: '💚 סימון לב על סטטוס',
  status_reply: '💬 תגובה על סטטוס',
  group_join: '📥 הצטרף לקבוצה',
  group_leave: '📤 יצא מקבוצה',
  channel_message: '📢 הודעה מערוץ',
  facebook_campaign: '📣 קמפיין פייסבוק',
  call_received: '📞 שיחה נכנסת',
  call_rejected: '📵 שיחה נדחתה',
  call_accepted: '✅ שיחה נענתה',
  poll_vote: '📊 מענה על סקר',
  message_sent: '📤 הודעה יוצאת',
  message_revoked: '🗑️ הודעה נמחקה',
  webhook: '🔗 Webhook חיצוני',
  image_received: '🖼️ תמונה נכנסת',
  video_received: '🎥 סרטון נכנס',
  audio_received: '🎵 הודעה קולית',
  file_received: '📎 קובץ נכנס',
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
  
  const messageTypeLabels = {
    any: 'כל סוג', text: 'טקסט', image: 'תמונה', video: 'סרטון',
    audio: 'הודעה קולית', file: 'קובץ', sticker: 'מדבקה',
  };

  const timeUnitLabels = {
    minutes: 'דקות', hours: 'שעות', days: 'ימים', weeks: 'שבועות',
  };

  // Build summary of conditions
  const getConditionSummary = (condition) => {
    const label = triggerLabels[condition.type] || condition.type;

    // message_received - show message type + optional content filter
    if (condition.type === 'message_received') {
      const msgType = messageTypeLabels[condition.messageType] || '';
      const parts = [label];
      if (msgType && condition.messageType !== 'any') parts[0] = `📨 ${msgType}`;
      if (condition.contentFilter && condition.value) {
        const op = operatorLabels[condition.contentFilter] || condition.contentFilter;
        parts.push(`${op} "${condition.value}"`);
      }
      return parts.join(' · ');
    }

    // Time-based triggers
    if (condition.type === 'no_message_in' || condition.type === 'not_triggered_in') {
      const unit = timeUnitLabels[condition.timeUnit] || condition.timeUnit || '';
      if (condition.timeValue) {
        return `${label} ${condition.timeValue} ${unit}`;
      }
      return label;
    }

    // Simple triggers with optional specific filters
    if (['any_message', 'first_message', 'contact_added', 'bot_activated', 'message_revoked',
         'status_viewed', 'status_reaction', 'status_reply',
         'group_join', 'group_leave', 'channel_message', 'facebook_campaign',
         'call_received', 'call_rejected', 'call_accepted', 'webhook',
         'image_received', 'video_received', 'audio_received', 'file_received'].includes(condition.type)) {
      if (condition.filterByStatus && condition.specificStatusId) {
        return `${label} (ספציפי)`;
      }
      if (condition.filterByGroup && condition.specificGroupId) {
        return `${label} (ספציפי)`;
      }
      return label;
    }

    // message_content with operator
    if (condition.type === 'message_content' && condition.operator) {
      const op = operatorLabels[condition.operator] || condition.operator;
      if (condition.value) {
        return `הודעה ${op} "${condition.value}"`;
      }
      return label;
    }

    // contact_field with field + operator + value
    if (condition.type === 'contact_field') {
      const field = condition.field || '';
      const op = operatorLabels[condition.operator] || condition.operator || '';
      if (field && condition.value) {
        return `👤 ${field} ${op} "${condition.value}"`;
      }
      if (field) return `👤 ${field}`;
      return label;
    }

    // poll_vote with operator + value
    if (condition.type === 'poll_vote' && condition.operator) {
      const op = operatorLabels[condition.operator] || condition.operator;
      if (condition.value) return `📊 תשובה ${op} "${condition.value}"`;
      return label;
    }

    // Triggers with just a value (has_tag, no_tag, tag_added, tag_removed)
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

  // Collect per-group advanced badges
  const groupBadges = (group) => {
    const badges = [];
    if (group.phoneFilter === 'whitelist') {
      badges.push(`📱 ${(group.phoneNumbers || []).filter(Boolean).length} מורשים`);
    } else if (group.phoneFilter === 'blacklist') {
      badges.push(`🚫 ${(group.phoneNumbers || []).filter(Boolean).length} חסומים`);
    }
    if (group.advancedConditions && group.advancedConditions.length > 0) {
      badges.push(`🔀 ${group.advancedConditions.length} תנאים`);
    }
    if (group.oncePerUser) badges.push('👤 פ״א');
    if (group.hasCooldown) badges.push('⏱️ השהיה');
    if (group.hasActiveHours) badges.push(`🕐 ${group.activeFrom || ''}-${group.activeTo || ''}`);
    return badges;
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
                {/* Per-group badges */}
                {groupBadges(group).length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {groupBadges(group).map((badge, idx) => (
                      <span key={idx} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
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
