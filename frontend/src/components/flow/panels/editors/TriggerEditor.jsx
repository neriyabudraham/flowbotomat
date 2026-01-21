import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const triggerTypes = [
  { id: 'any_message', label: 'כל הודעה נכנסת', icon: '💬' },
  { id: 'contains', label: 'הודעה מכילה', icon: '🔍', hasValue: true },
  { id: 'starts_with', label: 'הודעה מתחילה ב...', icon: '▶️', hasValue: true },
  { id: 'exact', label: 'הודעה מדויקת', icon: '✓', hasValue: true },
  { id: 'regex', label: 'ביטוי רגולרי (Regex)', icon: '🔧', hasValue: true },
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        הגדר מתי הבוט יופעל. ניתן להוסיף מספר טריגרים (או).
      </p>
      
      {/* Triggers */}
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
                placeholder={trigger.type.includes('tag') ? 'שם התגית...' : trigger.type === 'regex' ? 'ביטוי רגולרי...' : 'הזן טקסט...'}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                dir={trigger.type === 'regex' ? 'ltr' : 'rtl'}
              />
            )}

            {/* Condition modifiers (AND/NOT) */}
            {triggerInfo.hasValue && (
              <div className="flex gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trigger.not || false}
                    onChange={(e) => updateTrigger(index, 'not', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600"
                  />
                  <span className="text-sm text-gray-600">לא מכיל (NOT)</span>
                </label>
              </div>
            )}
          </div>
        );
      })}
      
      {/* Add trigger */}
      <button
        onClick={addTrigger}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        הוסף טריגר (או)
      </button>

      {/* Advanced Settings */}
      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-gray-700 hover:text-gray-900"
        >
          <span className="font-medium">הגדרות מתקדמות</span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {/* Once per user */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.oncePerUser || false}
                onChange={(e) => onUpdate({ oncePerUser: e.target.checked })}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
              />
              <div>
                <div className="font-medium text-gray-700">פעם אחת ליוזר</div>
                <div className="text-xs text-gray-500">הבוט ירוץ פעם אחת בלבד לכל איש קשר</div>
              </div>
            </label>

            {/* Cooldown */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.hasCooldown || false}
                  onChange={(e) => onUpdate({ hasCooldown: e.target.checked, cooldownHours: e.target.checked ? 24 : null })}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
                />
                <div>
                  <div className="font-medium text-gray-700">הגבלת זמן בין הפעלות</div>
                  <div className="text-xs text-gray-500">לא יופעל שוב עד שיעבור זמן מסוים</div>
                </div>
              </label>
              
              {data.hasCooldown && (
                <div className="mt-2 mr-8 flex items-center gap-2">
                  <input
                    type="number"
                    value={data.cooldownHours || 24}
                    onChange={(e) => onUpdate({ cooldownHours: parseInt(e.target.value) || 24 })}
                    min={1}
                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center"
                  />
                  <span className="text-sm text-gray-500">שעות</span>
                </div>
              )}
            </div>

            {/* Active hours */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.hasActiveHours || false}
                  onChange={(e) => onUpdate({ hasActiveHours: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
                />
                <div>
                  <div className="font-medium text-gray-700">שעות פעילות</div>
                  <div className="text-xs text-gray-500">הבוט יפעל רק בשעות מסוימות</div>
                </div>
              </label>
              
              {data.hasActiveHours && (
                <div className="mt-2 mr-8 flex items-center gap-2">
                  <input
                    type="time"
                    value={data.activeFrom || '09:00'}
                    onChange={(e) => onUpdate({ activeFrom: e.target.value })}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <span className="text-sm text-gray-500">עד</span>
                  <input
                    type="time"
                    value={data.activeTo || '18:00'}
                    onChange={(e) => onUpdate({ activeTo: e.target.value })}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>

            {/* Excluded tags */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.hasExcludedTags || false}
                  onChange={(e) => onUpdate({ hasExcludedTags: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
                />
                <div>
                  <div className="font-medium text-gray-700">החרג לפי תגיות</div>
                  <div className="text-xs text-gray-500">לא יופעל לאנשי קשר עם תגיות מסוימות</div>
                </div>
              </label>
              
              {data.hasExcludedTags && (
                <div className="mt-2 mr-8">
                  <input
                    type="text"
                    value={data.excludedTags || ''}
                    onChange={(e) => onUpdate({ excludedTags: e.target.value })}
                    placeholder="תגיות מופרדות בפסיקים..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
