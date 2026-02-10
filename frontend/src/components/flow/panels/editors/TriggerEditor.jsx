import { Plus, X, ChevronDown, ChevronUp, Trash2, RefreshCw, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../../../services/api';

const triggerTypes = [
  { id: 'any_message', label: 'כל הודעה נכנסת', icon: '💬', category: 'message' },
  { id: 'message_content', label: 'תוכן ההודעה', icon: '🔍', hasValue: true, hasOperator: true, category: 'message' },
  { id: 'first_message', label: 'הודעה ראשונה מאיש קשר', icon: '👋', category: 'message' },
  { id: 'no_message_in', label: 'לא שלח הודעה ב-X זמן', icon: '🔕', hasTimeValue: true, category: 'message' },
  { id: 'contact_field', label: 'שדה באיש קשר', icon: '👤', hasValue: true, hasOperator: true, hasField: true, category: 'contact' },
  { id: 'has_tag', label: 'יש תגית', icon: '🏷️', hasValue: true, category: 'contact' },
  { id: 'no_tag', label: 'אין תגית', icon: '🏷️', hasValue: true, category: 'contact' },
  { id: 'contact_added', label: 'איש קשר נוסף', icon: '➕', category: 'event' },
  { id: 'tag_added', label: 'תגית נוספה', icon: '🏷️', hasValue: true, category: 'event' },
  { id: 'tag_removed', label: 'תגית הוסרה', icon: '🏷️', hasValue: true, category: 'event' },
  { id: 'not_triggered_in', label: 'לא הופעל עבור המשתמש ב-X זמן', icon: '⏰', hasTimeValue: true, category: 'behavior' },
  { id: 'status_viewed', label: 'צפייה בסטטוס', icon: '👁️', category: 'status', hasStatusFilter: true },
  { id: 'status_reaction', label: 'סימון לב על סטטוס', icon: '💚', category: 'status', hasStatusFilter: true },
  { id: 'status_reply', label: 'תגובה על סטטוס', icon: '💬', category: 'status', hasStatusFilter: true },
  { id: 'group_join', label: 'משתמש הצטרף לקבוצה', icon: '📥', category: 'group' },
  { id: 'group_leave', label: 'משתמש יצא מקבוצה', icon: '📤', category: 'group' },
  { id: 'call_received', label: 'שיחה נכנסת', icon: '📞', hasCallType: true, category: 'call' },
  { id: 'call_rejected', label: 'שיחה שנדחתה / לא נענתה', icon: '📵', hasCallType: true, category: 'call' },
  { id: 'call_accepted', label: 'שיחה שנענתה', icon: '✅', hasCallType: true, category: 'call' },
  { id: 'poll_vote', label: 'מענה על סקר', icon: '📊', hasValue: true, hasOperator: true, category: 'group' },
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
  const [expandedGroups, setExpandedGroups] = useState(new Set(groups[0]?.id ? [groups[0].id] : []));
  const [availableTags, setAvailableTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [creatingTagFor, setCreatingTagFor] = useState(null); // { groupId, conditionIndex }
  const [newTagName, setNewTagName] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [userStatuses, setUserStatuses] = useState([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);

  // Load available tags
  useEffect(() => {
    loadTags();
  }, []);

  // Load user statuses if any status trigger exists
  useEffect(() => {
    const hasStatusTrigger = groups.some(g => 
      g.conditions?.some(c => ['status_viewed', 'status_reaction', 'status_reply'].includes(c.type))
    );
    if (hasStatusTrigger && userStatuses.length === 0 && !loadingStatuses) {
      loadStatuses();
    }
  }, [groups]);

  const loadStatuses = async () => {
    setLoadingStatuses(true);
    try {
      const response = await api.get('/whatsapp/statuses');
      setUserStatuses(response.data?.statuses || []);
    } catch (err) {
      console.error('Error loading statuses:', err);
      setUserStatuses([]);
    }
    setLoadingStatuses(false);
  };

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

  const createAndSelectTag = async (groupId, conditionIndex) => {
    if (!newTagName.trim()) return;
    
    setSavingTag(true);
    try {
      await api.post('/contacts/tags', { name: newTagName.trim() });
      await loadTags();
      updateCondition(groupId, conditionIndex, 'value', newTagName.trim());
      setCreatingTagFor(null);
      setNewTagName('');
    } catch (err) {
      console.error('Error creating tag:', err);
      alert('שגיאה ביצירת התגית');
    }
    setSavingTag(false);
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

  const updateGroupSetting = (groupId, field, value) => {
    const newGroups = groups.map(g => {
      if (g.id === groupId) {
        return { ...g, [field]: value };
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
                            <optgroup label="סטטוס">
                              {triggerTypes.filter(t => t.category === 'status').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="קבוצות">
                              {triggerTypes.filter(t => t.category === 'group').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="שיחות">
                              {triggerTypes.filter(t => t.category === 'call').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="אירועים">
                              {triggerTypes.filter(t => t.category === 'event').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="התנהגות">
                              {triggerTypes.filter(t => t.category === 'behavior').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                          </select>
                          
                          {/* Time value for inactivity conditions */}
                          {triggerInfo.hasTimeValue && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={condition.timeValue || 1}
                                onChange={(e) => updateCondition(group.id, conditionIndex, 'timeValue', parseInt(e.target.value) || 1)}
                                min={1}
                                className="w-20 px-3 py-3 bg-white border border-gray-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                              />
                              <select
                                value={condition.timeUnit || 'days'}
                                onChange={(e) => updateCondition(group.id, conditionIndex, 'timeUnit', e.target.value)}
                                className="flex-1 px-3 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                              >
                                <option value="minutes">דקות</option>
                                <option value="hours">שעות</option>
                                <option value="days">ימים</option>
                                <option value="weeks">שבועות</option>
                              </select>
                            </div>
                          )}
                          
                          {/* Call type selector for call triggers */}
                          {triggerInfo.hasCallType && (
                            <select
                              value={condition.callType || 'any'}
                              onChange={(e) => updateCondition(group.id, conditionIndex, 'callType', e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                            >
                              <option value="any">כל סוג שיחה</option>
                              <option value="audio">שיחה קולית בלבד</option>
                              <option value="video">שיחת וידאו בלבד</option>
                            </select>
                          )}
                          
                          {/* Specific status filter for status triggers */}
                          {triggerInfo.hasStatusFilter && (
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={condition.filterByStatus || false}
                                  onChange={(e) => {
                                    updateCondition(group.id, conditionIndex, 'filterByStatus', e.target.checked);
                                    if (!e.target.checked) {
                                      updateCondition(group.id, conditionIndex, 'specificStatusId', '');
                                    }
                                    if (e.target.checked && userStatuses.length === 0) {
                                      loadStatuses();
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-purple-600"
                                />
                                <span className="text-sm text-gray-700">סטטוס ספציפי בלבד</span>
                              </label>
                              
                              {condition.filterByStatus && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={condition.specificStatusId || ''}
                                      onChange={(e) => updateCondition(group.id, conditionIndex, 'specificStatusId', e.target.value)}
                                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                    >
                                      <option value="">-- בחר סטטוס --</option>
                                      {userStatuses.map(status => {
                                        const time = new Date(status.posted_at);
                                        const timeStr = time.toLocaleString('he-IL', { 
                                          day: '2-digit', month: '2-digit', 
                                          hour: '2-digit', minute: '2-digit' 
                                        });
                                        const typeIcon = status.message_type === 'text' ? '📝' :
                                                         status.message_type === 'image' ? '🖼️' :
                                                         status.message_type === 'video' ? '🎥' : '📎';
                                        const preview = status.content 
                                          ? status.content.substring(0, 40) + (status.content.length > 40 ? '...' : '')
                                          : `(${status.message_type})`;
                                        return (
                                          <option key={status.wa_message_id} value={status.wa_message_id}>
                                            {typeIcon} {timeStr} - {preview}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={loadStatuses}
                                      disabled={loadingStatuses}
                                      className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                      title="רענן רשימת סטטוסים"
                                    >
                                      <RefreshCw className={`w-4 h-4 ${loadingStatuses ? 'animate-spin' : ''}`} />
                                    </button>
                                  </div>
                                  {userStatuses.length === 0 && !loadingStatuses && (
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      אין סטטוסים ב-24 השעות האחרונות. העלה סטטוס ורענן.
                                    </p>
                                  )}
                                  {loadingStatuses && (
                                    <p className="text-xs text-gray-400">טוען סטטוסים...</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          
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
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCreatingTagFor({ groupId: group.id, conditionIndex });
                                      setNewTagName('');
                                    }}
                                    className="px-3 py-2 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg whitespace-nowrap"
                                    title="צור תגית חדשה"
                                  >
                                    + חדש
                                  </button>
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
                                {creatingTagFor?.groupId === group.id && creatingTagFor?.conditionIndex === conditionIndex && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <input
                                      type="text"
                                      value={newTagName}
                                      onChange={(e) => setNewTagName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          createAndSelectTag(group.id, conditionIndex);
                                        }
                                      }}
                                      placeholder="שם התגית החדשה..."
                                      className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => createAndSelectTag(group.id, conditionIndex)}
                                      disabled={savingTag || !newTagName.trim()}
                                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                                    >
                                      {savingTag ? '...' : 'הוסף'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setCreatingTagFor(null)}
                                      className="p-2 text-gray-500 hover:text-gray-700"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
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
                  
                  {/* Group-specific behavior settings */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">⚙️</span>
                      <span className="text-sm font-medium text-gray-700">הגדרות לקבוצה זו</span>
                    </div>
                    
                    <div className="space-y-3 bg-white rounded-lg p-3 border border-gray-100">
                      {/* Message source settings */}
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-500 mb-2">מקור ההודעות:</div>
                        
                        {/* Allow direct messages (chats) */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.allowDirectMessages !== false}
                            onChange={(e) => updateGroupSetting(group.id, 'allowDirectMessages', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700">💬 הפעלה בצ'אטים</div>
                            <div className="text-xs text-gray-500">הפעל את הטריגר בהודעות ישירות (פרטיות)</div>
                          </div>
                        </label>

                        {/* Allow group messages */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.allowGroupMessages || false}
                            onChange={(e) => updateGroupSetting(group.id, 'allowGroupMessages', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700">👥 הפעלה בקבוצות</div>
                            <div className="text-xs text-gray-500">הפעל את הטריגר בהודעות מקבוצות</div>
                          </div>
                        </label>
                      </div>

                      {/* Once per user */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={group.oncePerUser || false}
                          onChange={(e) => updateGroupSetting(group.id, 'oncePerUser', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-purple-600"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-700">פעם אחת ליוזר</div>
                          <div className="text-xs text-gray-500">קבוצת תנאים זו תרוץ פעם אחת בלבד לכל איש קשר</div>
                        </div>
                      </label>

                      {/* Cooldown */}
                      <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.hasCooldown || false}
                            onChange={(e) => updateGroupSetting(group.id, 'hasCooldown', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700">לא להפעיל שוב במשך...</div>
                            <div className="text-xs text-gray-500">מונע הפעלה חוזרת לאותו משתמש</div>
                          </div>
                        </label>
                        
                        {group.hasCooldown && (
                          <div className="mt-2 mr-7 flex items-center gap-2">
                            <input
                              type="number"
                              value={group.cooldownValue || 1}
                              onChange={(e) => updateGroupSetting(group.id, 'cooldownValue', parseInt(e.target.value) || 1)}
                              min={1}
                              className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                            />
                            <select
                              value={group.cooldownUnit || 'days'}
                              onChange={(e) => updateGroupSetting(group.id, 'cooldownUnit', e.target.value)}
                              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
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
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.hasActiveHours || false}
                            onChange={(e) => {
                              updateGroupSetting(group.id, 'hasActiveHours', e.target.checked);
                              // Set default values when enabling
                              if (e.target.checked && !group.activeFrom) {
                                updateGroupSetting(group.id, 'activeFrom', '09:00');
                              }
                              if (e.target.checked && !group.activeTo) {
                                updateGroupSetting(group.id, 'activeTo', '18:00');
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700">שעות פעילות</div>
                            <div className="text-xs text-gray-500">קבוצה זו תפעל רק בשעות מסוימות</div>
                          </div>
                        </label>
                        
                        {group.hasActiveHours && (
                          <div className="mt-2 mr-7 flex items-center gap-2">
                            <input
                              type="time"
                              value={group.activeFrom || '09:00'}
                              onChange={(e) => updateGroupSetting(group.id, 'activeFrom', e.target.value)}
                              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                            />
                            <span className="text-xs text-gray-500">עד</span>
                            <input
                              type="time"
                              value={group.activeTo || '18:00'}
                              onChange={(e) => updateGroupSetting(group.id, 'activeTo', e.target.value)}
                              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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

      {/* Global Settings removed - autoMarkSeen no longer shown */}
    </div>
  );
}
