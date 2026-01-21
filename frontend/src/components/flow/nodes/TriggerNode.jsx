import { memo } from 'react';
import { Zap } from 'lucide-react';
import BaseNode from './BaseNode';

const triggerLabels = {
  any_message: '💬 כל הודעה',
  contains: '🔍 מכיל טקסט',
  starts_with: '▶️ מתחיל ב...',
  exact: '✓ טקסט מדויק',
  first_message: '👋 הודעה ראשונה',
  contact_added: '➕ איש קשר נוסף',
  contact_deleted: '🗑️ איש קשר נמחק',
  tag_added: '🏷️ תגית נוספה',
  tag_removed: '🏷️ תגית הוסרה',
  bot_enabled: '🤖 בוט הופעל',
  bot_disabled: '🚫 בוט כובה',
};

function TriggerNode({ data, selected }) {
  const triggers = data.triggers || [{ type: 'any_message' }];
  
  // Can delete trigger only if there are multiple triggers in the flow
  const triggerCount = data.triggerCount || 1;
  const canDelete = triggerCount > 1;
  
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
        {triggers.map((trigger, i) => (
          <div key={i} className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2 text-sm">
            <span className="text-purple-700 font-medium">
              {triggerLabels[trigger.type] || trigger.type}
            </span>
            {trigger.value && (
              <span className="text-purple-500 text-xs">"{trigger.value}"</span>
            )}
          </div>
        ))}
        {triggers.length > 1 && (
          <div className="text-xs text-gray-400 text-center">או</div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(TriggerNode);
