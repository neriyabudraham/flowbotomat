import { Plus, X, ChevronDown, ChevronUp, Trash2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../../../services/api';

const triggerTypes = [
  { id: 'any_message', label: 'כל הודעה נכנסת', icon: '💬', category: 'message' },
  { id: 'message_content', label: 'תוכן ההודעה', icon: '🔍', hasValue: true, hasOperator: true, category: 'message' },
  { id: 'first_message', label: 'הודעה ראשונה מאיש קשר', icon: '👋', category: 'message' },
  { id: 'contact_field', label: 'שדה באיש קשר', icon: '👤', hasValue: true, hasOperator: true, hasField: true, category: 'contact' },
  { id: 'has_tag', label: 'יש תגית', icon: '🏷️', hasValue: true, category: 'contact' },
  { id: 'no_tag', label: 'אין תגית', icon: '🏷️', hasValue: true, category: 'contact' },
  { id: 'contact_added', label: 'איש קשר נוסף', icon: '➕', category: 'event' },
  { id: 'tag_added', label: 'תגית נוספה', icon: '🏷️', hasValue: true, category: 'event' },
  { id: 'tag_removed', label: 'תגית הוסרה', icon: '🏷️', hasValue: true, category: 'event' },
];

const operators = [
  { id: 'contains', label: 'מכיל' },
  { id: 'not_contains', label: 'לא מכיל' },
  { id: 'equals', label: 'שווה ל' },
  { id: 'not_equals', label: 'לא שווה ל' },
  { id: 'starts_with', label: 'מתחיל ב' },
  { id: 'ends_with', label: 'מסתיים ב' },
  { id: 'regex', label: 'תואם ביטוי (Regex)' },
  { id: 'is_empty', label: 'ריק' },
  { id: 'is_not_empty', label: 'לא ריק' },
];

const contactFields = [
  { id: 'name', label: 'שם' },
  { id: 'phone', label: 'טלפון' },
  { id: 'email', label: 'אימייל' },
  { id: 'notes', label: 'הערות' },
  { id: 'custom', label: 'שדה מותאם...' },
];

export default function TriggerEditor({ data, onUpdate }) {
  // Groups of conditions - each group is OR, conditions within group are AND
  const groups = data.triggerGroups || [];
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set(groups[0]?.id ? [groups[0].id] : []));
  const [availableTags, setAvailableTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Load available tags
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoadingTags(true);
    try {
      const response = await api.get('/contacts/tags');
      // Handle different response formats
      const tags = Array.isArray(response.data) 
        ? response.data 
        : (response.data?.tags || response.data?.data || []);
      setAvailableTags(Array.isArray(tags) ? tags : []);
    } catch (err) {
      console.error('Error loading tags:', err);
      setAvailableTags([]);
    }
    setLoadingTags(false);
  };

  const toggleGroup = (groupId) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const addGroup = () => {
    const newGroup = { 
      id: Date.now(), 
      conditions: [{ type: 'any_message', operator: 'contains', value: '', field: '' }] 
    };
    const newGroups = [...groups, newGroup];
    setExpandedGroups(new Set([...expandedGroups, newGroup.id]));
    onUpdate({ triggerGroups: newGroups });
  };

  const removeGroup = (groupId) => {
    onUpdate({ triggerGroups: groups.filter(g => g.id !== groupId) });
  };

  const addCondition = (groupId) => {
    const newGroups = groups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          conditions: [...g.conditions, { type: 'message_content', operator: 'contains', value: '', field: '' }]
        };
      }
      return g;
    });
    onUpdate({ triggerGroups: newGroups });
  };

  const removeCondition = (groupId, conditionIndex) => {
    const newGroups = groups.map(g => {
      if (g.id === groupId) {
        if (g.conditions.length <= 1) return g;
        return {
          ...g,
          conditions: g.conditions.filter((_, i) => i !== conditionIndex)
        };
      }
      return g;
    });
    onUpdate({ triggerGroups: newGroups });
  };

  const updateCondition = (groupId, conditionIndex, field, value) => {
    const newGroups = groups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          conditions: g.conditions.map((c, i) => 
            i === conditionIndex ? { ...c, [field]: value } : c
          )
        };
      }
      return g;
    });
    onUpdate({ triggerGroups: newGroups });
  };

  const needsValue = (operator) => !['is_empty', 'is_not_empty'].includes(operator);

  return (
    <div className="space-y-4">
      {/* Empty State */}
      {groups.length === 0 && (
        <div className="text-center py-8 px-4 bg-gradient-to-b from-purple-50/50 to-white rounded-2xl border-2 border-dashed border-purple-200">
          <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="text-gray-700 font-medium mb-1">אין טריגרים עדיין</p>
          <p className="text-sm text-gray-500 mb-4">הוסף תנאי להפעלת הבוט</p>
          <button
            onClick={addGroup}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסף טריגר
          </button>
        </div>
      )}
      
      {groups.length > 0 && (
        <p className="text-sm text-gray-500">
          הגדר מתי הבוט יופעל. קבוצות מחוברות ב-"או", תנאים בתוך קבוצה מחוברים ב-"וגם".
        </p>
      )}
      
      {/* Trigger Groups */}
      <div className="space-y-3">
        {groups.map((group, groupIndex) => {
          const isExpanded = expandedGroups.has(group.id);
          
          return (
            <div key={group.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              {/* Group Header */}
              <div 
                className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {groupIndex + 1}
                  </div>
                  <div>
                    <span className="font-medium text-gray-800">קבוצת תנאים</span>
                    <span className="text-sm text-gray-500 mr-2">
                      ({group.conditions.length} {group.conditions.length === 1 ? 'תנאי' : 'תנאים'})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeGroup(group.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
              
              {/* Group Content */}
              {isExpanded && (
                <div className="p-4 space-y-3">
                  {group.conditions.map((condition, conditionIndex) => {
                    const triggerInfo = triggerTypes.find(t => t.id === condition.type) || triggerTypes[0];
                    
                    return (
                      <div key={conditionIndex}>
                        {/* AND separator */}
                        {conditionIndex > 0 && (
                          <div className="flex items-center gap-2 py-2">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded">וגם</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                        
                        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                          {/* Header with icon and remove */}
                          <div className="flex items-center justify-between">
                            <span className="text-lg">{triggerInfo.icon}</span>
                            {group.conditions.length > 1 && (
                              <button
                                onClick={() => removeCondition(group.id, conditionIndex)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          
                          {/* Trigger type */}
                          <select
                            value={condition.type}
                            onChange={(e) => updateCondition(group.id, conditionIndex, 'type', e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                          >
                            <optgroup label="הודעות">
                              {triggerTypes.filter(t => t.category === 'message').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="איש קשר">
                              {triggerTypes.filter(t => t.category === 'contact').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="אירועים">
                              {triggerTypes.filter(t => t.category === 'event').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                          </select>
                          
                          {/* Field selector for contact_field */}
                          {triggerInfo.hasField && (
                            <select
                              value={condition.field || 'name'}
                              onChange={(e) => updateCondition(group.id, conditionIndex, 'field', e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                            >
                              {contactFields.map(f => (
                                <option key={f.id} value={f.id}>{f.label}</option>
                              ))}
                            </select>
                          )}
                          
                          {/* Custom field name */}
                          {triggerInfo.hasField && condition.field === 'custom' && (
                            <input
                              type="text"
                              value={condition.customField || ''}
                              onChange={(e) => updateCondition(group.id, conditionIndex, 'customField', e.target.value)}
                              placeholder="שם השדה המותאם..."
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                            />
                          )}
                          
                          {/* Operator */}
                          {triggerInfo.hasOperator && (
                            <select
                              value={condition.operator || 'contains'}
                              onChange={(e) => updateCondition(group.id, conditionIndex, 'operator', e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                            >
                              {operators.map(op => (
                                <option key={op.id} value={op.id}>{op.label}</option>
                              ))}
                            </select>
                          )}
                          
                          {/* Value input - with tag selector for tag-related conditions */}
                          {triggerInfo.hasValue && needsValue(condition.operator) && (
                            condition.type.includes('tag') ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={condition.value || ''}
                                    onChange={(e) => updateCondition(group.id, conditionIndex, 'value', e.target.value)}
                                    className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                  >
                                    <option value="">-- בחר תגית --</option>
                                    {(Array.isArray(availableTags) ? availableTags : []).map(tag => (
                                      <option key={typeof tag === 'string' ? tag : tag?.name || tag?.id} value={typeof tag === 'string' ? tag : tag?.name || ''}>
                                        {typeof tag === 'string' ? tag : tag?.name || ''}
                                      </option>
                                    ))}
                                    <option value="_new">+ צור תגית חדשה...</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={loadTags}
                                    disabled={loadingTags}
                                    className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                    title="רענן רשימת תגיות"
                                  >
                                    <RefreshCw className={`w-4 h-4 ${loadingTags ? 'animate-spin' : ''}`} />
                                  </button>
                                </div>
                                {condition.value === '_new' && (
                                  <input
                                    type="text"
                                    value={condition.customTagName || ''}
                                    onChange={(e) => {
                                      updateCondition(group.id, conditionIndex, 'customTagName', e.target.value);
                                      updateCondition(group.id, conditionIndex, 'value', e.target.value);
                                    }}
                                    placeholder="שם התגית החדשה..."
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                  />
                                )}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={condition.value || ''}
                                onChange={(e) => updateCondition(group.id, conditionIndex, 'value', e.target.value)}
                                placeholder={
                                  condition.operator === 'regex' ? 'ביטוי רגולרי...' : 
                                  'הזן ערך...'
                                }
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                dir={condition.operator === 'regex' ? 'ltr' : 'rtl'}
                              />
                            )
                          )}
                          
                          {/* Case sensitive option */}
                          {triggerInfo.hasOperator && condition.operator !== 'regex' && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={condition.caseSensitive || false}
                                onChange={(e) => updateCondition(group.id, conditionIndex, 'caseSensitive', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-purple-600"
                              />
                              <span className="text-sm text-gray-600">רגיש לאותיות גדולות/קטנות</span>
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Add condition button */}
                  <button
                    onClick={() => addCondition(group.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף תנאי (וגם)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* OR separator and add group */}
      {groups.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <button
            onClick={addGroup}
            className="flex items-center gap-2 px-4 py-2 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסף קבוצה (או)
          </button>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

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
                  onChange={(e) => onUpdate({ 
                    hasCooldown: e.target.checked, 
                    cooldownValue: e.target.checked ? 1 : null,
                    cooldownUnit: e.target.checked ? 'days' : null
                  })}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
                />
                <div>
                  <div className="font-medium text-gray-700">לא להפעיל שוב במשך...</div>
                  <div className="text-xs text-gray-500">מונע הפעלה חוזרת לאותו משתמש עד שיעבור הזמן</div>
                </div>
              </label>
              
              {data.hasCooldown && (
                <div className="mt-2 mr-8 flex items-center gap-2">
                  <input
                    type="number"
                    value={data.cooldownValue || 1}
                    onChange={(e) => onUpdate({ cooldownValue: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center"
                  />
                  <select
                    value={data.cooldownUnit || 'days'}
                    onChange={(e) => onUpdate({ cooldownUnit: e.target.value })}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="minutes">דקות</option>
                    <option value="hours">שעות</option>
                    <option value="days">ימים</option>
                    <option value="weeks">שבועות</option>
                  </select>
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

            {/* Mark all messages as read */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.markAllAsRead || false}
                onChange={(e) => onUpdate({ markAllAsRead: e.target.checked })}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
              />
              <div>
                <div className="font-medium text-gray-700">סמן כנקרא אוטומטית</div>
                <div className="text-xs text-gray-500">כל הודעה נכנסת תסומן כנקראה במהלך הפלואו</div>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
