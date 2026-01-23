import { useState } from 'react';
import { Plus, X, Clock, Keyboard, GripVertical } from 'lucide-react';

const actionTypes = [
  { id: 'delay', label: 'השהייה', icon: Clock, color: 'amber' },
  { id: 'typing', label: 'מקליד/ה', icon: Keyboard, color: 'gray' },
];

export default function DelayEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    let newAction;
    if (type === 'delay') {
      newAction = { type: 'delay', delay: 1, unit: 'seconds' };
    } else {
      newAction = { type: 'typing', typingDuration: 3 };
    }
    onUpdate({ actions: [...actions, newAction] });
  };

  const removeAction = (index) => {
    onUpdate({ actions: actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, updates) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onUpdate({ actions: newActions });
  };

  const handleDragStart = (index) => setDragIndex(index);
  
  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newActions = [...actions];
    const [removed] = newActions.splice(dragIndex, 1);
    newActions.splice(index, 0, removed);
    onUpdate({ actions: newActions });
    setDragIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Empty State */}
      {actions.length === 0 && (
        <div className="text-center py-6 px-4 bg-gradient-to-b from-amber-50/50 to-white rounded-xl border-2 border-dashed border-amber-200">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-gray-700 font-medium mb-1">אין פעולות עדיין</p>
          <p className="text-sm text-gray-500">הוסף השהייה או הקלדה</p>
        </div>
      )}

      {/* Actions List */}
      <div className="space-y-2">
        {actions.map((action, index) => {
          const typeInfo = actionTypes.find(t => t.id === action.type);
          const Icon = typeInfo?.icon || Clock;
          
          return (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDragIndex(null)}
              className={`bg-white border rounded-xl p-3 ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">{typeInfo?.label}</span>
                </div>
                <button
                onClick={() => removeAction(index)}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
              </div>
              
              {action.type === 'delay' && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={action.delay || 1}
                    onChange={(e) => updateAction(index, { delay: Math.max(1, parseInt(e.target.value) || 1) })}
                    min={1}
                    className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center"
                  />
                  <select
                    value={action.unit || 'seconds'}
                    onChange={(e) => updateAction(index, { unit: e.target.value })}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="seconds">שניות</option>
                    <option value="minutes">דקות</option>
                  </select>
                </div>
              )}
              
              {action.type === 'typing' && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={action.typingDuration || 3}
                    onChange={(e) => updateAction(index, { typingDuration: Math.min(30, Math.max(1, parseInt(e.target.value) || 3)) })}
                    min={1}
                    max={30}
                    className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center"
                  />
                  <span className="text-sm text-gray-500">שניות</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Add Actions */}
      <div className="flex gap-2">
        {actionTypes.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => addAction(type.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
            >
              <Icon className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">{type.label}</span>
              <Plus className="w-3 h-3 text-gray-400" />
            </button>
          );
        })}
      </div>
      
      {/* Info */}
      <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
        <p>ההשהייה/הקלדה מתבצעת לפני המשך הפלואו לרכיב הבא.</p>
      </div>
    </div>
  );
}
