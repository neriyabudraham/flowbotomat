import { Plus, X, GripVertical, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const actionTypes = [
  // Tags & Variables
  { id: 'add_tag', label: 'הוסף תגית', icon: '🏷️', hasValue: 'tag', category: 'tags' },
  { id: 'remove_tag', label: 'הסר תגית', icon: '🏷️', hasValue: 'tag', category: 'tags' },
  { id: 'set_variable', label: 'הגדר משתנה', icon: '📝', hasValue: 'keyvalue', category: 'variables' },
  { id: 'delete_variable', label: 'מחק משתנה', icon: '🗑️', hasValue: 'varname', category: 'variables' },
  
  // Bot Control
  { id: 'stop_bot', label: 'עצור בוט', icon: '🛑', category: 'control' },
  { id: 'delete_contact', label: 'מחק איש קשר', icon: '🗑️', category: 'control' },
  
  // Group Actions
  { id: 'add_to_group', label: 'הוסף לקבוצה', icon: '➕', hasValue: 'group', category: 'group' },
  { id: 'remove_from_group', label: 'הסר מקבוצה', icon: '➖', hasValue: 'group', category: 'group' },
  { id: 'check_group_member', label: 'בדוק חברות בקבוצה', icon: '🔍', hasValue: 'group_check', category: 'group' },
  { id: 'set_group_admin_only', label: 'הגדר הודעות מנהלים', icon: '👑', hasValue: 'group_settings', category: 'group' },
  { id: 'update_group_subject', label: 'עדכן שם קבוצה', icon: '✏️', hasValue: 'group_subject', category: 'group' },
  { id: 'update_group_description', label: 'עדכן תיאור קבוצה', icon: '📄', hasValue: 'group_desc', category: 'group' },
  
  // Labels (WhatsApp Business)
  { id: 'set_label', label: 'הגדר תווית', icon: '🔖', hasValue: 'label', category: 'business' },
  
  // Integration Actions
  { id: 'webhook', label: 'Webhook', icon: '🌐', hasValue: 'url', category: 'integration' },
  { id: 'http_request', label: 'קריאת API', icon: '📡', hasValue: 'api', category: 'integration' },
  { id: 'notify', label: 'התראה', icon: '🔔', hasValue: 'text', category: 'integration' },
];

const categories = [
  { id: 'tags', label: 'תגיות', icon: '🏷️', color: 'pink', defaultOpen: true },
  { id: 'variables', label: 'משתנים', icon: '📝', color: 'blue', defaultOpen: true },
  { id: 'control', label: 'שליטה', icon: '⚙️', color: 'red', defaultOpen: false },
  { id: 'group', label: 'קבוצות', icon: '👥', color: 'green', defaultOpen: false },
  { id: 'business', label: 'WhatsApp Business', icon: '🏢', color: 'purple', defaultOpen: false },
  { id: 'integration', label: 'אינטגרציות', icon: '🔌', color: 'orange', defaultOpen: false },
];

const categoryColors = {
  tags: { bg: 'bg-pink-50', hover: 'hover:bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  variables: { bg: 'bg-blue-50', hover: 'hover:bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  control: { bg: 'bg-red-50', hover: 'hover:bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  group: { bg: 'bg-green-50', hover: 'hover:bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  business: { bg: 'bg-purple-50', hover: 'hover:bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  integration: { bg: 'bg-orange-50', hover: 'hover:bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
};

export default function ActionEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const [openCategories, setOpenCategories] = useState(['basic']);
  const [dragIndex, setDragIndex] = useState(null);

  const toggleCategory = (categoryId) => {
    setOpenCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const addAction = (type) => {
    onUpdate({ actions: [...actions, { type }] });
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
    <div className="space-y-5">
      {/* Current Actions */}
      {actions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">פעולות פעילות</p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{actions.length}</span>
          </div>
          <div className="space-y-2">
            {actions.map((action, index) => (
              <div
                key={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={() => setDragIndex(null)}
                className={`cursor-grab active:cursor-grabbing ${dragIndex === index ? 'opacity-50' : ''}`}
              >
                <ActionItem
                  action={action}
                  onUpdate={(updates) => updateAction(index, updates)}
                  onRemove={() => removeAction(index)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {actions.length === 0 && (
        <div className="text-center py-8 px-4 bg-gradient-to-b from-pink-50/50 to-white rounded-2xl border-2 border-dashed border-pink-200">
          <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="text-gray-700 font-medium mb-1">אין פעולות עדיין</p>
          <p className="text-sm text-gray-500">בחר פעולה מהקטגוריות למטה</p>
        </div>
      )}

      {/* Add Actions by Category */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 mb-3">הוסף פעולה</p>
        
        {categories.map((category) => {
          const categoryActions = actionTypes.filter(a => a.category === category.id);
          const colors = categoryColors[category.id];
          const isOpen = openCategories.includes(category.id);
          
          return (
            <div key={category.id} className={`rounded-xl border ${colors.border} overflow-hidden`}>
              <button
                onClick={() => toggleCategory(category.id)}
                className={`w-full flex items-center justify-between px-4 py-3 ${colors.bg} ${colors.hover} transition-colors`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{category.icon}</span>
                  <span className={`text-sm font-medium ${colors.text}`}>{category.label}</span>
                  <span className="text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded">{categoryActions.length}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isOpen && (
                <div className="p-3 bg-white grid grid-cols-2 gap-2">
                  {categoryActions.map(({ id, label, icon }) => (
                    <button
                      key={id}
                      onClick={() => addAction(id)}
                      className={`flex items-center gap-2.5 p-3 ${colors.bg} ${colors.hover} rounded-xl text-sm transition-all hover:shadow-sm group`}
                    >
                      <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
                      <span className={`font-medium ${colors.text} text-xs`}>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionItem({ action, onUpdate, onRemove }) {
  const actionInfo = actionTypes.find(a => a.id === action.type) || actionTypes[0];
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  
  const colors = categoryColors[actionInfo.category] || categoryColors.basic;
  
  // Fetch groups when needed
  const needsGroups = ['group', 'group_check', 'group_settings', 'group_subject', 'group_desc'].includes(actionInfo.hasValue);
  
  useEffect(() => {
    if (needsGroups && groups.length === 0) {
      loadGroups();
    }
  }, [needsGroups]);
  
  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data } = await api.get('/whatsapp/groups');
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Error loading groups:', err);
    }
    setLoadingGroups(false);
  };

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden transition-all`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${colors.bg}`}>
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <span className="text-xl">{actionInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`font-medium text-sm ${colors.text}`}>{actionInfo.label}</span>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        <button 
          onClick={onRemove} 
          className="p-1.5 hover:bg-red-100 rounded-lg transition-colors group"
        >
          <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
        </button>
      </div>
      
      {/* Content */}
      {isExpanded && actionInfo.hasValue && (
        <div className="px-4 py-3 bg-white space-y-3">
          {actionInfo.hasValue === 'tag' && (
        <TextInputWithVariables
          value={action.tagName || ''}
          onChange={(v) => onUpdate({ tagName: v })}
          placeholder="שם התגית..."
        />
      )}

      {actionInfo.hasValue === 'keyvalue' && (
        <div className="space-y-2">
          <input
            type="text"
            value={action.varKey || ''}
            onChange={(e) => onUpdate({ varKey: e.target.value })}
            placeholder="שם המשתנה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          />
          <TextInputWithVariables
            value={action.varValue || ''}
            onChange={(v) => onUpdate({ varValue: v })}
            placeholder="ערך (ניתן להשתמש במשתנים)..."
          />
        </div>
      )}

      {actionInfo.hasValue === 'url' && (
        <input
          type="url"
          value={action.webhookUrl || ''}
          onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          dir="ltr"
        />
      )}

      {actionInfo.hasValue === 'api' && (
        <ApiRequestButton action={action} onUpdate={onUpdate} />
      )}

      {actionInfo.hasValue === 'text' && (
        <TextInputWithVariables
          value={action.text || ''}
          onChange={(v) => onUpdate({ text: v })}
          placeholder="תוכן ההתראה..."
        />
      )}
      
      {/* Delete Variable */}
      {actionInfo.hasValue === 'varname' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">שם המשתנה למחיקה:</p>
          <input
            type="text"
            value={action.varName || ''}
            onChange={(e) => onUpdate({ varName: e.target.value })}
            placeholder="שם המשתנה (לדוגמה: email)"
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400">המשתנה יימחק מפרופיל איש הקשר</p>
        </div>
      )}

      {/* Group selector */}
      {actionInfo.hasValue === 'group' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={action.groupId || ''}
              onChange={(e) => onUpdate({ groupId: e.target.value, useVariable: false })}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              disabled={loadingGroups || action.useVariable}
            >
              <option value="">-- בחר קבוצה --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.participants})</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadGroups}
              disabled={loadingGroups}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="רענן רשימת קבוצות"
            >
              <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={action.useVariable || false}
              onChange={(e) => onUpdate({ useVariable: e.target.checked, groupId: '' })}
              className="rounded"
            />
            <span>השתמש במשתנה</span>
          </label>
          {action.useVariable && (
            <TextInputWithVariables
              value={action.groupId || ''}
              onChange={(v) => onUpdate({ groupId: v })}
              placeholder="{{group_id}} או מזהה ידני..."
            />
          )}
          <p className="text-xs text-gray-400">איש הקשר הנוכחי יתווסף/יוסר מהקבוצה</p>
        </div>
      )}

      {/* Group check */}
      {actionInfo.hasValue === 'group_check' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={action.groupId || ''}
              onChange={(e) => onUpdate({ groupId: e.target.value, useVariable: false })}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              disabled={loadingGroups || action.useVariable}
            >
              <option value="">-- בחר קבוצה --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" onClick={loadGroups} disabled={loadingGroups} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={action.useVariable || false} onChange={(e) => onUpdate({ useVariable: e.target.checked, groupId: '' })} className="rounded" />
            <span>השתמש במשתנה</span>
          </label>
          {action.useVariable && (
            <TextInputWithVariables value={action.groupId || ''} onChange={(v) => onUpdate({ groupId: v })} placeholder="{{group_id}}" />
          )}
          <input
            type="text"
            value={action.resultVar || 'is_member'}
            onChange={(e) => onUpdate({ resultVar: e.target.value })}
            placeholder="שם משתנה לתוצאה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400">התוצאה תישמר במשתנה (true/false)</p>
        </div>
      )}

      {/* Group settings - admin only */}
      {actionInfo.hasValue === 'group_settings' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={action.groupId || ''}
              onChange={(e) => onUpdate({ groupId: e.target.value, useVariable: false })}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              disabled={loadingGroups || action.useVariable}
            >
              <option value="">-- בחר קבוצה --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" onClick={loadGroups} disabled={loadingGroups} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={action.useVariable || false} onChange={(e) => onUpdate({ useVariable: e.target.checked, groupId: '' })} className="rounded" />
            <span>השתמש במשתנה</span>
          </label>
          {action.useVariable && (
            <TextInputWithVariables value={action.groupId || ''} onChange={(v) => onUpdate({ groupId: v })} placeholder="{{group_id}}" />
          )}
          <select
            value={action.adminsOnly ? 'true' : 'false'}
            onChange={(e) => onUpdate({ adminsOnly: e.target.value === 'true' })}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          >
            <option value="true">רק מנהלים יכולים לשלוח הודעות</option>
            <option value="false">כולם יכולים לשלוח הודעות</option>
          </select>
        </div>
      )}

      {/* Group subject */}
      {actionInfo.hasValue === 'group_subject' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={action.groupId || ''}
              onChange={(e) => onUpdate({ groupId: e.target.value, useVariable: false })}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              disabled={loadingGroups || action.useVariable}
            >
              <option value="">-- בחר קבוצה --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" onClick={loadGroups} disabled={loadingGroups} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={action.useVariable || false} onChange={(e) => onUpdate({ useVariable: e.target.checked, groupId: '' })} className="rounded" />
            <span>השתמש במשתנה</span>
          </label>
          {action.useVariable && (
            <TextInputWithVariables value={action.groupId || ''} onChange={(v) => onUpdate({ groupId: v })} placeholder="{{group_id}}" />
          )}
          <TextInputWithVariables
            value={action.groupSubject || ''}
            onChange={(v) => onUpdate({ groupSubject: v })}
            placeholder="שם הקבוצה החדש..."
          />
        </div>
      )}

      {/* Group description */}
      {actionInfo.hasValue === 'group_desc' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={action.groupId || ''}
              onChange={(e) => onUpdate({ groupId: e.target.value, useVariable: false })}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              disabled={loadingGroups || action.useVariable}
            >
              <option value="">-- בחר קבוצה --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" onClick={loadGroups} disabled={loadingGroups} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={action.useVariable || false} onChange={(e) => onUpdate({ useVariable: e.target.checked, groupId: '' })} className="rounded" />
            <span>השתמש במשתנה</span>
          </label>
          {action.useVariable && (
            <TextInputWithVariables value={action.groupId || ''} onChange={(v) => onUpdate({ groupId: v })} placeholder="{{group_id}}" />
          )}
          <TextInputWithVariables
            value={action.groupDescription || ''}
            onChange={(v) => onUpdate({ groupDescription: v })}
            placeholder="תיאור הקבוצה החדש..."
            multiline
            rows={3}
          />
        </div>
      )}

          {/* Label with API fetch */}
          {actionInfo.hasValue === 'label' && (
            <LabelSelector action={action} onUpdate={onUpdate} />
          )}
        </div>
      )}
    </div>
  );
}

// Label Selector Component
function LabelSelector({ action, onUpdate }) {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const loadLabels = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/whatsapp/labels');
      setLabels(data.labels || []);
    } catch (err) {
      console.error('Error loading labels:', err);
      setError('לא ניתן לטעון תוויות. ודא שיש לך WhatsApp Business');
    }
    setLoading(false);
  };
  
  useEffect(() => {
    loadLabels();
  }, []);
  
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">זמין רק ב-WhatsApp Business</p>
      
      <div className="flex items-center gap-2">
        <select
          value={action.labelId || ''}
          onChange={(e) => {
            const selected = labels.find(l => l.id === e.target.value);
            onUpdate({ labelId: e.target.value, labelName: selected?.name || '' });
          }}
          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          disabled={loading}
        >
          <option value="">-- בחר תווית --</option>
          {labels.map(l => (
            <option key={l.id} value={l.id}>
              {l.name} {l.color && `(${l.color})`}
            </option>
          ))}
        </select>
        <button 
          type="button" 
          onClick={loadLabels} 
          disabled={loading} 
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          title="רענן תוויות"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      
      {action.labelId && action.labelName && (
        <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
          <span className="text-purple-600">🔖</span>
          <span className="text-sm text-purple-700">{action.labelName}</span>
        </div>
      )}
      
      <p className="text-xs text-gray-400">התווית תוגדר לאיש הקשר הנוכחי</p>
    </div>
  );
}

// API Request Button - opens modal
function ApiRequestButton({ action, onUpdate }) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center justify-center gap-2 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
      >
        <Play className="w-4 h-4" />
        {action.apiUrl ? `הגדרת API: ${action.method || 'GET'} ${action.apiUrl.substring(0, 30)}...` : 'הגדר קריאת API'}
      </button>
      
      {showModal && (
        <ApiRequestModal action={action} onUpdate={onUpdate} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// API Request Modal - full screen editor
function ApiRequestModal({ action, onUpdate, onClose }) {
  const [showHeaders, setShowHeaders] = useState(true);
  const [showMapping, setShowMapping] = useState(true);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  
  const headers = action.headers || [];
  const mappings = action.mappings || [];
  
  const addHeader = () => {
    onUpdate({ headers: [...headers, { key: '', value: '' }] });
  };
  
  const updateHeader = (index, field, value) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    onUpdate({ headers: newHeaders });
  };
  
  const removeHeader = (index) => {
    onUpdate({ headers: headers.filter((_, i) => i !== index) });
  };
  
  const addMapping = () => {
    onUpdate({ mappings: [...mappings, { path: '', varName: '' }] });
  };
  
  const updateMapping = (index, field, value) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    onUpdate({ mappings: newMappings });
  };
  
  const removeMapping = (index) => {
    onUpdate({ mappings: mappings.filter((_, i) => i !== index) });
  };
  
  // Test API call
  const testApiCall = async () => {
    if (!action.apiUrl) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const res = await api.post('/utils/test-api', {
        method: action.method || 'GET',
        url: action.apiUrl,
        headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
        body: action.body ? JSON.parse(action.body) : undefined
      });
      
      setTestResult({
        success: true,
        status: res.data.status,
        data: res.data.data
      });
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.error || err.message
      });
    }
    
    setIsTesting(false);
  };
  
  // Extract paths from response data
  const extractPaths = (obj, prefix = '') => {
    const paths = [];
    if (typeof obj !== 'object' || obj === null) return paths;
    
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        paths.push(...extractPaths(obj[key], path));
      }
    }
    return paths;
  };
  
  const availablePaths = testResult?.success ? extractPaths(testResult.data) : [];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📡</span>
            <div>
              <h2 className="text-lg font-bold text-gray-800">הגדרת קריאת API</h2>
              <p className="text-sm text-gray-500">הגדר את פרטי הקריאה, בדוק ומפה תגובות</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Request */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">1</span>
                הגדרת הבקשה
              </h3>
              
              {/* Method & URL */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">Method & URL</label>
                <div className="flex gap-2">
                  <select
                    value={action.method || 'GET'}
                    onChange={(e) => onUpdate({ method: e.target.value })}
                    className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <input
                    type="url"
                    value={action.apiUrl || ''}
                    onChange={(e) => onUpdate({ apiUrl: e.target.value })}
                    placeholder="https://api.example.com/endpoint/{{contact_id}}"
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-gray-400">ניתן להשתמש במשתנים: {'{{phone}}'}, {'{{contact_name}}'}, {'{{משתנה}}'}</p>
              </div>
              
              {/* Headers */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHeaders(!showHeaders)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                >
                  <span>Headers</span>
                  <div className="flex items-center gap-2">
                    {headers.length > 0 && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {headers.length}
                      </span>
                    )}
                    {showHeaders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                
                {showHeaders && (
                  <div className="p-4 space-y-2 bg-white">
                    {headers.map((header, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) => updateHeader(i, 'key', e.target.value)}
                          placeholder="Header Name"
                          className="w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                          dir="ltr"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(e) => updateHeader(i, 'value', e.target.value)}
                          placeholder="Value {{variable}}"
                          className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                          dir="ltr"
                        />
                        <button 
                          type="button"
                          onClick={() => removeHeader(i)} 
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addHeader}
                      className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200"
                    >
                      + הוסף Header
                    </button>
                    <p className="text-xs text-gray-400">ניתן להשתמש במשתנים בערכים: {'{{phone}}'}, {'{{contact_name}}'}</p>
                  </div>
                )}
              </div>
              
              {/* Body */}
              {['POST', 'PUT', 'PATCH'].includes(action.method || 'GET') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-600">Body</label>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => onUpdate({ bodyMode: 'json' })}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          (action.bodyMode || 'json') === 'json' ? 'bg-white shadow text-gray-700' : 'text-gray-500'
                        }`}
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdate({ bodyMode: 'keyvalue' })}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          action.bodyMode === 'keyvalue' ? 'bg-white shadow text-gray-700' : 'text-gray-500'
                        }`}
                      >
                        Key-Value
                      </button>
                    </div>
                  </div>
                  
                  {(action.bodyMode || 'json') === 'json' ? (
                    <TextInputWithVariables
                      value={action.body || ''}
                      onChange={(v) => onUpdate({ body: v })}
                      placeholder={'{\n  "name": "{{contact_name}}",\n  "phone": "{{phone}}"\n}'}
                      multiline
                      rows={6}
                      dir="ltr"
                      className="font-mono"
                    />
                  ) : (
                    <div className="space-y-2">
                      {(action.bodyParams || []).map((param, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={param.key}
                            onChange={(e) => {
                              const newParams = [...(action.bodyParams || [])];
                              newParams[i] = { ...newParams[i], key: e.target.value };
                              onUpdate({ bodyParams: newParams });
                            }}
                            placeholder="Key"
                            className="w-[120px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                            dir="ltr"
                          />
                          <input
                            type="text"
                            value={param.value}
                            onChange={(e) => {
                              const newParams = [...(action.bodyParams || [])];
                              newParams[i] = { ...newParams[i], value: e.target.value };
                              onUpdate({ bodyParams: newParams });
                            }}
                            placeholder="Value {{variable}}"
                            className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                            dir="ltr"
                          />
                          <button 
                            type="button"
                            onClick={() => {
                              const newParams = (action.bodyParams || []).filter((_, idx) => idx !== i);
                              onUpdate({ bodyParams: newParams });
                            }}
                            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => onUpdate({ bodyParams: [...(action.bodyParams || []), { key: '', value: '' }] })}
                        className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200"
                      >
                        + הוסף פרמטר
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">ניתן להשתמש במשתנים: {'{{phone}}'}, {'{{contact_name}}'}, {'{{משתנה_מותאם}}'}</p>
                </div>
              )}
              
              {/* Test Button */}
              <button
                onClick={testApiCall}
                disabled={!action.apiUrl || isTesting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    שולח בקשה...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    בדיקת API
                  </>
                )}
              </button>
            </div>
            
            {/* Right Column - Response & Mapping */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs">2</span>
                תגובה ומיפוי
              </h3>
              
              {/* Test Result */}
              {testResult && (
                <div className={`rounded-xl overflow-hidden ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-inherit">
                    {testResult.success ? (
                      <>
                        <Check className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-green-700">הצלחה! סטטוס: {testResult.status}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <span className="font-medium text-red-700">שגיאה: {testResult.error}</span>
                      </>
                    )}
                  </div>
                  
                  {testResult.success && testResult.data && (
                    <pre className="p-4 text-xs overflow-auto max-h-48 bg-white/50" dir="ltr">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  )}
                </div>
              )}
              
              {!testResult && (
                <div className="bg-gray-50 rounded-xl p-8 text-center border-2 border-dashed border-gray-200">
                  <div className="text-4xl mb-2">🧪</div>
                  <p className="text-gray-500 text-sm">הרץ בדיקת API כדי לראות את התגובה</p>
                </div>
              )}
              
              {/* Response Mapping */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowMapping(!showMapping)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                >
                  <span>מיפוי תגובה למשתנים</span>
                  <div className="flex items-center gap-2">
                    {mappings.length > 0 && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                        {mappings.length}
                      </span>
                    )}
                    {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                
                {showMapping && (
                  <div className="p-4 space-y-3 bg-white">
                    {availablePaths.length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-700 mb-2 font-medium">לחץ על שדה להוספה מהירה:</p>
                        <div className="flex flex-wrap gap-1">
                          {availablePaths.slice(0, 20).map((path) => (
                            <button
                              type="button"
                              key={path}
                              onClick={() => {
                                onUpdate({ mappings: [...mappings, { path, varName: path.split('.').pop() }] });
                              }}
                              className="px-2 py-1 bg-white border border-blue-200 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                            >
                              {path}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {mappings.map((mapping, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={mapping.path}
                          onChange={(e) => updateMapping(i, 'path', e.target.value)}
                          placeholder="data.user.name"
                          className="w-[140px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
                          dir="ltr"
                        />
                        <span className="text-gray-400 font-bold flex-shrink-0">→</span>
                        <input
                          type="text"
                          value={mapping.varName}
                          onChange={(e) => updateMapping(i, 'varName', e.target.value)}
                          placeholder="שם_המשתנה"
                          className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                        />
                        <button 
                          type="button"
                          onClick={() => removeMapping(i)} 
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    
                    <button
                      type="button"
                      onClick={addMapping}
                      className="w-full py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg border border-dashed border-purple-200"
                    >
                      + הוסף מיפוי ידני
                    </button>
                    
                    {mappings.length > 0 && (
                      <p className="text-xs text-gray-400">
                        המשתנים יישמרו לאיש הקשר וניתן להשתמש בהם: {'{{שם_המשתנה}}'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
