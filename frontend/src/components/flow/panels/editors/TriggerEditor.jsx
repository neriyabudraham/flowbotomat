import { Plus, X } from 'lucide-react';

const triggerTypes = [
  { id: 'any_message', label: 'כל הודעה נכנסת', icon: '💬' },
  { id: 'contains', label: 'הודעה מכילה', icon: '🔍', hasValue: true },
  { id: 'starts_with', label: 'הודעה מתחילה ב...', icon: '▶️', hasValue: true },
  { id: 'exact', label: 'הודעה מדויקת', icon: '✓', hasValue: true },
  { id: 'first_message', label: 'הודעה ראשונה מאיש קשר', icon: '👋' },
  { id: 'contact_added', label: 'איש קשר נוסף', icon: '➕' },
  { id: 'contact_deleted', label: 'איש קשר נמחק', icon: '🗑️' },
  { id: 'tag_added', label: 'תגית נוספה', icon: '🏷️', hasValue: true },
  { id: 'tag_removed', label: 'תגית הוסרה', icon: '🏷️', hasValue: true },
  { id: 'bot_enabled', label: 'בוט הופעל', icon: '🤖' },
  { id: 'bot_disabled', label: 'בוט כובה', icon: '🚫' },
];

export default function TriggerEditor({ data, onUpdate }) {
  const triggers = data.triggers || [{ type: 'any_message', value: '' }];

  const addTrigger = () => {
    onUpdate({ triggers: [...triggers, { type: 'any_message', value: '' }] });
  };

  const removeTrigger = (index) => {
    if (triggers.length <= 1) return;
    onUpdate({ triggers: triggers.filter((_, i) => i !== index) });
  };

  const updateTrigger = (index, field, value) => {
    const newTriggers = triggers.map((t, i) => 
      i === index ? { ...t, [field]: value } : t
    );
    onUpdate({ triggers: newTriggers });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הגדר מתי הבוט יופעל. ניתן להוסיף מספר טריגרים.
      </p>
      
      {triggers.map((trigger, index) => {
        const triggerInfo = triggerTypes.find(t => t.id === trigger.type) || triggerTypes[0];
        
        return (
          <div key={index} className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg">{triggerInfo.icon}</span>
              {triggers.length > 1 && (
                <button
                  onClick={() => removeTrigger(index)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <select
              value={trigger.type}
              onChange={(e) => updateTrigger(index, 'type', e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            >
              {triggerTypes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            
            {triggerInfo.hasValue && (
              <input
                type="text"
                value={trigger.value || ''}
                onChange={(e) => updateTrigger(index, 'value', e.target.value)}
                placeholder={trigger.type.includes('tag') ? 'שם התגית...' : 'הזן טקסט...'}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
              />
            )}
          </div>
        );
      })}
      
      <button
        onClick={addTrigger}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        הוסף טריגר נוסף
      </button>
    </div>
  );
}
