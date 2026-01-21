import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, Plus, X, ChevronDown } from 'lucide-react';

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

function TriggerNode({ data, selected }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggers = data.triggers || [{ type: 'any_message', value: '' }];

  const addTrigger = () => {
    const newTriggers = [...triggers, { type: 'any_message', value: '' }];
    data.onChange?.({ triggers: newTriggers });
  };

  const removeTrigger = (index) => {
    if (triggers.length <= 1) return;
    const newTriggers = triggers.filter((_, i) => i !== index);
    data.onChange?.({ triggers: newTriggers });
  };

  const updateTrigger = (index, field, value) => {
    const newTriggers = triggers.map((t, i) => 
      i === index ? { ...t, [field]: value } : t
    );
    data.onChange?.({ triggers: newTriggers });
  };

  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border transition-all min-w-[280px] ${
      selected ? 'border-purple-400 shadow-lg shadow-purple-100' : 'border-gray-200 shadow-md'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white rounded-t-2xl">
        <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-800">טריגר התחלה</span>
      </div>
      
      {/* Triggers List */}
      <div className="p-3 space-y-2">
        {triggers.map((trigger, index) => {
          const triggerInfo = triggerTypes.find(t => t.id === trigger.type) || triggerTypes[0];
          
          return (
            <div key={index} className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{triggerInfo.icon}</span>
                <select
                  value={trigger.type}
                  onChange={(e) => updateTrigger(index, 'type', e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                >
                  {triggerTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                {triggers.length > 1 && (
                  <button
                    onClick={() => removeTrigger(index)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {triggerInfo.hasValue && (
                <input
                  type="text"
                  value={trigger.value || ''}
                  onChange={(e) => updateTrigger(index, 'value', e.target.value)}
                  placeholder={trigger.type.includes('tag') ? 'שם התגית...' : 'הזן טקסט...'}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                />
              )}
            </div>
          );
        })}
        
        {/* Add Trigger Button */}
        <button
          onClick={addTrigger}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          הוסף טריגר נוסף
        </button>
      </div>
      
      <Handle
        type="source"
        position={Position.Left}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(TriggerNode);
