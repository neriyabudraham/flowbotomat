import { Plus, X, ChevronDown, ChevronUp, Trash2, RefreshCw, Clock, Copy, Wifi, Phone, Shield, Filter, List, Type } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../../../services/api';
import { toast } from '../../../../store/toastStore';
import TextInputWithVariables from './TextInputWithVariables';

const triggerTypes = [
  { id: 'any_message', label: 'כל הודעה נכנסת', icon: '💬', category: 'message' },
  { id: 'message_received', label: 'הודעה נכנסת לפי סוג', icon: '📨', hasMessageType: true, hasOptionalContent: true, category: 'message' },
  { id: 'first_message', label: 'הודעה ראשונה מאיש קשר', icon: '👋', category: 'message' },
  { id: 'no_message_in', label: 'לא שלח הודעה ב-X זמן', icon: '🔕', hasTimeValue: true, category: 'message' },
  { id: 'bot_activated', label: 'בעת הפעלת הבוט', icon: '▶️', category: 'bot' },
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
  { id: 'group_join', label: 'משתמש הצטרף לקבוצה', icon: '📥', category: 'group', hasGroupFilter: true },
  { id: 'group_leave', label: 'משתמש יצא מקבוצה', icon: '📤', category: 'group', hasGroupFilter: true },
  { id: 'channel_message', label: 'הודעה מערוץ (Newsletter)', icon: '📢', category: 'channel', hasChannelFilter: true },
  { id: 'facebook_campaign', label: 'הודעה מקמפיין פייסבוק', icon: '📣', category: 'campaign' },
  { id: 'call_received', label: 'שיחה נכנסת', icon: '📞', hasCallType: true, category: 'call' },
  { id: 'call_rejected', label: 'שיחה שנדחתה / לא נענתה', icon: '📵', hasCallType: true, category: 'call' },
  { id: 'call_accepted', label: 'שיחה שנענתה', icon: '✅', hasCallType: true, category: 'call' },
  { id: 'poll_vote', label: 'מענה על סקר', icon: '📊', hasValue: true, hasOperator: true, category: 'group' },
  { id: 'message_sent', label: 'הודעה יוצאת (מהמכשיר/ווב)', icon: '📤', hasMessageType: true, hasOptionalContent: true, category: 'message' },
  { id: 'message_revoked', label: 'הודעה נמחקה', icon: '🗑️', category: 'message' },
  { id: 'webhook', label: 'Webhook חיצוני', icon: '🔗', category: 'webhook' },
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

const messageTypeOptions = [
  { id: 'any', label: 'כל סוג הודעה', icon: '💬' },
  { id: 'text', label: 'טקסט בלבד', icon: '📝' },
  { id: 'image', label: 'תמונה', icon: '🖼️' },
  { id: 'video', label: 'סרטון', icon: '🎥' },
  { id: 'audio', label: 'הודעה קולית / שמע', icon: '🎵' },
  { id: 'file', label: 'קובץ / מסמך', icon: '📎' },
  { id: 'sticker', label: 'מדבקה', icon: '🎭' },
];

const contactFields = [
  { id: 'name', label: 'שם' },
  { id: 'phone', label: 'טלפון' },
  { id: 'email', label: 'אימייל' },
  { id: 'notes', label: 'הערות' },
  { id: 'custom', label: 'שדה מותאם...' },
];

// === Advanced Conditions Components (matching ConditionEditor quality) ===

const advVariables = [
  { id: 'message', label: 'תוכן ההודעה', group: 'הודעה' },
  { id: 'last_message', label: 'ההודעה האחרונה שהתקבלה', group: 'הודעה' },
  { id: 'message_type', label: 'סוג ההודעה', group: 'הודעה' },
  { id: 'has_media', label: 'האם יש מדיה', group: 'הודעה', isBoolean: true },
  { id: 'is_group', label: 'האם קבוצה', group: 'הודעה', isBoolean: true },
  { id: 'is_channel', label: 'האם ערוץ', group: 'הודעה', isBoolean: true },
  { id: 'contact_name', label: 'שם איש קשר', group: 'איש קשר' },
  { id: 'phone', label: 'מספר טלפון', group: 'איש קשר' },
  { id: 'is_first_contact', label: 'איש קשר חדש', group: 'איש קשר', isBoolean: true },
  { id: 'has_tag', label: 'יש תגית', group: 'איש קשר', isBoolean: true },
  { id: 'contact_var', label: 'משתנה מהמערכת', group: 'משתנים' },
  { id: 'time', label: 'שעה נוכחית', group: 'זמן' },
  { id: 'day', label: 'יום בשבוע', group: 'זמן' },
  { id: 'date', label: 'תאריך', group: 'זמן' },
  { id: 'random', label: 'מספר אקראי (1-100)', group: 'מתקדם' },
];

const advOperators = [
  { id: 'equals', label: 'שווה ל', group: 'בסיסי' },
  { id: 'not_equals', label: 'לא שווה ל', group: 'בסיסי' },
  { id: 'contains', label: 'מכיל', group: 'טקסט' },
  { id: 'not_contains', label: 'לא מכיל', group: 'טקסט' },
  { id: 'starts_with', label: 'מתחיל ב', group: 'טקסט' },
  { id: 'ends_with', label: 'נגמר ב', group: 'טקסט' },
  { id: 'matches_regex', label: 'תואם Regex', group: 'טקסט' },
  { id: 'greater_than', label: 'גדול מ', group: 'מספרים' },
  { id: 'less_than', label: 'קטן מ', group: 'מספרים' },
  { id: 'greater_or_equal', label: 'גדול או שווה ל', group: 'מספרים' },
  { id: 'less_or_equal', label: 'קטן או שווה ל', group: 'מספרים' },
  { id: 'is_empty', label: 'ריק', group: 'בדיקה' },
  { id: 'is_not_empty', label: 'לא ריק', group: 'בדיקה' },
  { id: 'is_true', label: 'אמת (true)', group: 'בדיקה' },
  { id: 'is_false', label: 'שקר (false)', group: 'בדיקה' },
  { id: 'is_text', label: 'זה טקסט', group: 'סוג נתון' },
  { id: 'is_number', label: 'זה מספר', group: 'סוג נתון' },
  { id: 'is_email', label: 'זה מייל תקין', group: 'סוג נתון' },
  { id: 'is_phone', label: 'זה מספר טלפון', group: 'סוג נתון' },
  { id: 'is_image', label: 'זו תמונה', group: 'סוג מדיה' },
  { id: 'is_video', label: 'זה סרטון', group: 'סוג מדיה' },
  { id: 'is_audio', label: 'זה קובץ שמע', group: 'סוג מדיה' },
  { id: 'is_document', label: 'זה מסמך', group: 'סוג מדיה' },
  { id: 'is_pdf', label: 'זה קובץ PDF', group: 'סוג מדיה' },
];

const advMessageTypes = [
  { id: 'text', label: 'טקסט' },
  { id: 'image', label: 'תמונה' },
  { id: 'video', label: 'סרטון' },
  { id: 'audio', label: 'קול' },
  { id: 'document', label: 'מסמך' },
  { id: 'sticker', label: 'סטיקר' },
  { id: 'location', label: 'מיקום' },
];

const advDays = [
  { id: '0', label: 'ראשון' },
  { id: '1', label: 'שני' },
  { id: '2', label: 'שלישי' },
  { id: '3', label: 'רביעי' },
  { id: '4', label: 'חמישי' },
  { id: '5', label: 'שישי' },
  { id: '6', label: 'שבת' },
];

const advBooleanOptions = [
  { value: 'true', label: 'כן (true)' },
  { value: 'false', label: 'לא (false)' },
];

const advGroupedVariables = advVariables.reduce((acc, v) => {
  if (!acc[v.group]) acc[v.group] = [];
  acc[v.group].push(v);
  return acc;
}, {});

const advGroupedOperators = advOperators.reduce((acc, o) => {
  if (!acc[o.group]) acc[o.group] = [];
  acc[o.group].push(o);
  return acc;
}, {});

const noValueOperators = ['is_empty', 'is_not_empty', 'is_true', 'is_false', 'is_text', 'is_number', 'is_email', 'is_phone', 'is_image', 'is_video', 'is_audio', 'is_document', 'is_pdf'];

function TriggerConditionRow({ condition, onChange, onRemove, canRemove, availableVars, loadingVars }) {
  const needsValue = !noValueOperators.includes(condition.operator);
  const needsVarName = condition.variable === 'has_tag';
  const needsVarSelect = condition.variable === 'contact_var';
  const selectedVar = advVariables.find(v => v.id === condition.variable);
  const isBooleanVar = selectedVar?.isBoolean || false;
  const showBooleanInput = isBooleanVar && needsValue && ['equals', 'not_equals'].includes(condition.operator);
  const boolInputMode = condition.boolInputMode || 'select';

  const groupedAvailableVars = availableVars.reduce((acc, v) => {
    const grp = v.group || 'משתנים שלי';
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(v);
    return acc;
  }, {});

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <select
            value={condition.variable || 'message'}
            onChange={(e) => onChange({ ...condition, variable: e.target.value, varName: '', value: '', boolInputMode: 'select' })}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            {Object.entries(advGroupedVariables).map(([grp, vars]) => (
              <optgroup key={grp} label={grp}>
                {vars.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </optgroup>
            ))}
          </select>
          <select
            value={condition.operator || 'equals'}
            onChange={(e) => onChange({ ...condition, operator: e.target.value })}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            {Object.entries(advGroupedOperators).map(([grp, ops]) => (
              <optgroup key={grp} label={grp}>
                {ops.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Variable dropdown for contact_var */}
      {needsVarSelect && (
        <select
          value={condition.varName || ''}
          onChange={(e) => onChange({ ...condition, varName: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">{loadingVars ? 'טוען משתנים...' : 'בחר משתנה...'}</option>
          {Object.entries(groupedAvailableVars).map(([grp, vars]) => (
            <optgroup key={grp} label={grp}>
              {vars.map(v => (
                <option key={v.key} value={`{{${v.key}}}`}>
                  {v.label} ({v.key})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {/* Tag name input */}
      {needsVarName && (
        <input
          type="text"
          value={condition.varName || ''}
          onChange={(e) => onChange({ ...condition, varName: e.target.value })}
          placeholder="שם התגית"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        />
      )}

      {/* Boolean value input - with mode toggle */}
      {showBooleanInput && (
        <div className="space-y-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => onChange({ ...condition, boolInputMode: 'select', value: '' })}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                boolInputMode === 'select' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-3 h-3" />
              בחירה מרשימה
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...condition, boolInputMode: 'variable', value: '' })}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                boolInputMode === 'variable' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Type className="w-3 h-3" />
              משתנה / טקסט
            </button>
          </div>
          {boolInputMode === 'select' && (
            <select
              value={condition.value || ''}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">בחר ערך...</option>
              {advBooleanOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {boolInputMode === 'variable' && (
            <>
              <TextInputWithVariables
                value={condition.value || ''}
                onChange={(val) => onChange({ ...condition, value: val })}
                placeholder="true / false / כן / לא / {{משתנה}}"
                className="text-sm"
              />
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span>💡</span>
                <span>מקבל: true, false, כן, לא או משתנה</span>
              </p>
            </>
          )}
        </div>
      )}

      {/* Regular value input */}
      {needsValue && !showBooleanInput && (
        condition.variable === 'message_type' ? (
          <select
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">בחר סוג...</option>
            {advMessageTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        ) : condition.variable === 'day' ? (
          <select
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">בחר יום...</option>
            {advDays.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        ) : condition.variable === 'time' ? (
          <input
            type="time"
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          />
        ) : (
          <TextInputWithVariables
            value={condition.value || ''}
            onChange={(val) => onChange({ ...condition, value: val })}
            placeholder="ערך להשוואה או {{משתנה}}"
            className="text-sm"
          />
        )
      )}
    </div>
  );
}

function TriggerConditionGroup({ group, onChange, onRemove, canRemove, isRoot = false, availableVars, loadingVars }) {
  const conditions = group.conditions || [];
  const logic = group.logic || 'AND';

  const addCondition = () => {
    onChange({
      ...group,
      conditions: [...conditions, { variable: 'contact_var', operator: 'equals', value: '', varName: '' }]
    });
  };

  const addNestedGroup = () => {
    onChange({
      ...group,
      conditions: [...conditions, { isGroup: true, logic: 'OR', conditions: [{ variable: 'message', operator: 'contains', value: '' }] }]
    });
  };

  const updateCondition = (index, newCondition) => {
    const newConditions = [...conditions];
    newConditions[index] = newCondition;
    onChange({ ...group, conditions: newConditions });
  };

  const removeCondition = (index) => {
    if (conditions.length <= 1 && !isRoot) return;
    onChange({ ...group, conditions: conditions.filter((_, i) => i !== index) });
  };

  return (
    <div className={`space-y-2 ${!isRoot ? 'bg-gray-50 rounded-xl p-3 border-2 border-dashed border-gray-200' : ''}`}>
      {!isRoot && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">קבוצת תנאים</span>
          {canRemove && (
            <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">הסר קבוצה</button>
          )}
        </div>
      )}

      {conditions.map((condition, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={() => onChange({ ...group, logic: logic === 'AND' ? 'OR' : 'AND' })}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  logic === 'AND'
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                {logic === 'AND' ? 'וגם' : 'או'}
              </button>
            </div>
          )}

          {condition.isGroup ? (
            <TriggerConditionGroup
              group={condition}
              onChange={(newGroup) => updateCondition(index, newGroup)}
              onRemove={() => removeCondition(index)}
              canRemove={conditions.length > 1 || !isRoot}
              availableVars={availableVars}
              loadingVars={loadingVars}
            />
          ) : (
            <TriggerConditionRow
              condition={condition}
              onChange={(newCond) => updateCondition(index, newCond)}
              onRemove={() => removeCondition(index)}
              canRemove={conditions.length > 1 || !isRoot}
              availableVars={availableVars}
              loadingVars={loadingVars}
            />
          )}
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={addCondition}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg"
        >
          <Plus className="w-3 h-3" />
          תנאי
        </button>
        <button
          type="button"
          onClick={addNestedGroup}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
        >
          <Plus className="w-3 h-3" />
          קבוצה
        </button>
      </div>
    </div>
  );
}

export default function TriggerEditor({ data, onUpdate, botId }) {
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
  const [whatsappGroups, setWhatsappGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [whatsappChannels, setWhatsappChannels] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState(null);
  const [generatingWebhook, setGeneratingWebhook] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [listeningWebhook, setListeningWebhook] = useState(false);
  const [listenCountdown, setListenCountdown] = useState(0);
  const [capturedPayload, setCapturedPayload] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [availableVars, setAvailableVars] = useState([]);
  const [loadingVars, setLoadingVars] = useState(false);

  const hasWebhookTrigger = groups.some(g => g.conditions?.some(c => c.type === 'webhook'));

  // Migrate legacy message_content conditions → message_received with content filter
  // Runs once on mount; existing bots keep working without any manual edits
  useEffect(() => {
    const hasMigration = groups.some(g => g.conditions?.some(c => c.type === 'message_content'));
    if (!hasMigration) return;
    const migratedGroups = groups.map(g => ({
      ...g,
      conditions: g.conditions.map(c => c.type !== 'message_content' ? c : {
        ...c,
        type: 'message_received',
        messageType: 'any',
        hasContentFilter: true,
      })
    }));
    onUpdate({ triggerGroups: migratedGroups });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load webhook secret when webhook trigger is selected
  useEffect(() => {
    if (hasWebhookTrigger && botId && !webhookSecret) {
      api.get(`/bots/${botId}`).then(({ data }) => {
        if (data.bot?.webhook_secret) setWebhookSecret(data.bot.webhook_secret);
      }).catch(() => {});
    }
  }, [hasWebhookTrigger, botId]);

  const generateWebhookSecret = async () => {
    if (!botId) return;
    setGeneratingWebhook(true);
    try {
      const { data } = await api.post(`/bots/${botId}/webhook`);
      setWebhookSecret(data.webhook_secret);
    } catch (e) {
      console.error('Failed to generate webhook:', e);
    } finally {
      setGeneratingWebhook(false);
    }
  };

  const getWebhookUrl = () => {
    const base = window.location.origin.replace(/:\d+$/, '') + (window.location.port === '5173' ? ':5001' : '');
    return `${base}/api/webhook/bot/${webhookSecret}`;
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(getWebhookUrl());
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const listenWebhook = async () => {
    if (!botId || !webhookSecret) return;
    setListeningWebhook(true);
    setCapturedPayload(null);
    setListenCountdown(60);
    try {
      await api.post(`/bots/${botId}/webhook/listen`);
    } catch (e) {
      setListeningWebhook(false);
      return;
    }
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 1.5;
      setListenCountdown(Math.max(0, 60 - elapsed));
      try {
        const { data } = await api.get(`/bots/${botId}/webhook/listen`);
        if (data.status === 'captured') {
          clearInterval(interval);
          setListeningWebhook(false);
          setCapturedPayload(data.payload);
        } else if (data.status === 'timeout' || data.status === 'not_listening' || elapsed >= 62) {
          clearInterval(interval);
          setListeningWebhook(false);
        }
      } catch (e) {
        clearInterval(interval);
        setListeningWebhook(false);
      }
    }, 1500);
  };

  const copyField = (fieldName) => {
    navigator.clipboard.writeText(`{{webhook.${fieldName}}}`);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const createWebhookVariable = async (fieldName) => {
    const varName = `webhook_${fieldName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    try {
      await api.post('/variables', {
        name: varName,
        label: `Webhook: ${fieldName}`,
        description: `שדה webhook - {{webhook.${fieldName}}}`,
        var_type: 'text',
      });
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      // Variable might already exist — still show feedback
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Load available tags
  useEffect(() => {
    loadTags();
    loadVariables();
  }, []);

  const loadVariables = async () => {
    try {
      setLoadingVars(true);
      const res = await api.get('/variables');
      const allVars = [];
      (res.data.systemVariables || []).forEach(v => {
        allVars.push({ key: v.name, label: v.label, group: 'משתני מערכת' });
      });
      (res.data.userVariables || []).forEach(v => {
        allVars.push({ key: v.name, label: v.label || v.name, group: 'משתנים שלי' });
      });
      (res.data.customSystemVariables || []).forEach(v => {
        allVars.push({ key: v.name, label: v.label || v.name, group: 'קבועים' });
      });
      setAvailableVars(allVars);
    } catch (err) {
      console.error('Failed to load variables:', err);
    } finally {
      setLoadingVars(false);
    }
  };

  // Load user statuses if any status trigger exists
  useEffect(() => {
    const hasStatusTrigger = groups.some(g => 
      g.conditions?.some(c => ['status_viewed', 'status_reaction', 'status_reply'].includes(c.type))
    );
    if (hasStatusTrigger && userStatuses.length === 0 && !loadingStatuses) {
      loadStatuses();
    }
  }, [groups]);

  // Load groups if any group trigger exists
  useEffect(() => {
    const hasGroupTrigger = groups.some(g => 
      g.conditions?.some(c => ['group_join', 'group_leave'].includes(c.type))
    );
    if (hasGroupTrigger && whatsappGroups.length === 0 && !loadingGroups) {
      loadGroups();
    }
  }, [groups]);

  // Load channels if any channel trigger exists
  useEffect(() => {
    const hasChannelTrigger = groups.some(g => 
      g.conditions?.some(c => ['channel_message'].includes(c.type))
    );
    if (hasChannelTrigger && whatsappChannels.length === 0 && !loadingChannels) {
      loadChannels();
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

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const response = await api.get('/whatsapp/groups');
      setWhatsappGroups(response.data?.groups || []);
    } catch (err) {
      console.error('Error loading groups:', err);
      setWhatsappGroups([]);
    }
    setLoadingGroups(false);
  };

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      const response = await api.get('/whatsapp/channels');
      setWhatsappChannels(response.data?.channels || []);
    } catch (err) {
      console.error('Error loading channels:', err);
      setWhatsappChannels([]);
    }
    setLoadingChannels(false);
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
      toast.error('שגיאה ביצירת התגית');
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
          conditions: [...g.conditions, { type: 'any_message', operator: 'contains', value: '', field: '' }]
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
                            <optgroup label="בוטים">
                              {triggerTypes.filter(t => t.category === 'bot').map(t => (
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
                            <optgroup label="ערוצים">
                              {triggerTypes.filter(t => t.category === 'channel').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="קמפיינים">
                              {triggerTypes.filter(t => t.category === 'campaign').map(t => (
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
                            <optgroup label="חיצוני">
                              {triggerTypes.filter(t => t.category === 'webhook').map(t => (
                                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                              ))}
                            </optgroup>
                          </select>
                          
                          {/* Webhook trigger — show URL management */}
                          {condition.type === 'webhook' && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                              <p className="text-xs text-indigo-700 font-medium">
                                🔗 הבוט יופעל כאשר מישהו קורא ל-URL הבא:
                              </p>
                              {webhookSecret ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    readOnly
                                    value={getWebhookUrl()}
                                    className="flex-1 text-xs px-2 py-1.5 bg-white border border-indigo-200 rounded-lg font-mono truncate"
                                    dir="ltr"
                                  />
                                  <button
                                    onClick={copyWebhookUrl}
                                    className="p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors"
                                    title="העתק URL"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-indigo-600" />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-indigo-500">לחץ "צור URL" כדי לקבל כתובת webhook</p>
                              )}
                              {copiedWebhook && <p className="text-xs text-green-600">הועתק!</p>}
                              <div className="flex gap-2">
                                <button
                                  onClick={generateWebhookSecret}
                                  disabled={generatingWebhook}
                                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                  {generatingWebhook ? 'יוצר...' : webhookSecret ? 'צור URL חדש' : 'צור URL'}
                                </button>
                              </div>
                              <p className="text-[10px] text-indigo-400">תמיכה ב-GET ו-POST. שלח `phone` בפרמטרים (מספר הטלפון של הקשר). שדות נוספים זמינים כ-{'{{webhook.שם_שדה}}'}.</p>
                              {/* Listen for incoming webhook */}
                              {webhookSecret && (
                                <div className="pt-2 border-t border-indigo-100 space-y-2">
                                  {!listeningWebhook && !capturedPayload && (
                                    <button
                                      onClick={listenWebhook}
                                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors w-full justify-center"
                                    >
                                      <Wifi className="w-3.5 h-3.5" />
                                      האזן לקריאה
                                    </button>
                                  )}
                                  {listeningWebhook && (
                                    <div className="flex items-center justify-between gap-2 text-xs text-indigo-600 bg-indigo-100 rounded-lg px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                        <span>ממתין לקריאה... ({Math.ceil(listenCountdown)}ש)</span>
                                      </div>
                                      <button onClick={() => setListeningWebhook(false)} className="text-indigo-400 hover:text-indigo-600 text-xs">ביטול</button>
                                    </div>
                                  )}
                                  {capturedPayload && (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs text-green-700 font-medium">✅ קריאה נקלטה — בחר שדות:</p>
                                        <button onClick={() => setCapturedPayload(null)} className="text-xs text-indigo-400 hover:text-indigo-600">נקה</button>
                                      </div>
                                      <div className="bg-white border border-indigo-200 rounded-lg overflow-hidden">
                                        {Object.entries(capturedPayload).map(([key, val]) => (
                                          <div key={key} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-indigo-50 last:border-0 hover:bg-indigo-50 group">
                                            <span className="text-xs font-mono text-indigo-800 flex-1 truncate">{key}</span>
                                            <span className="text-xs text-gray-400 truncate max-w-[60px]">{String(val).slice(0, 15)}</span>
                                            <button
                                              onClick={() => copyField(key)}
                                              className="text-xs px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                              title="העתק {{webhook.field}}"
                                            >
                                              {'{{}}'}
                                            </button>
                                            <button
                                              onClick={() => createWebhookVariable(key, val)}
                                              className="text-xs px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex-shrink-0"
                                              title="יצור משתנה במערכת"
                                            >
                                              {copiedField === key ? '✓ נוצר' : '+ משתנה'}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                      <p className="text-[10px] text-indigo-400">לחיצה על "+ משתנה" תוסיף את השדה לרשימת המשתנים שלך</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* message_received — message type picker + optional content filter */}
                          {(condition.type === 'message_received' || condition.type === 'message_sent') && (
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs text-gray-500 mb-1.5">סוג ההודעה:</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {messageTypeOptions.map(opt => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => updateCondition(group.id, conditionIndex, 'messageType', opt.id)}
                                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                                        (condition.messageType || 'any') === opt.id
                                          ? 'bg-purple-100 border-purple-400 text-purple-700 font-medium'
                                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                      }`}
                                    >
                                      <span>{opt.icon}</span>
                                      <span className="text-xs">{opt.label}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Optional content filter — only for text/any */}
                              {['any', 'text'].includes(condition.messageType || 'any') && (
                                <div className="space-y-2 border-t border-gray-100 pt-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!condition.hasContentFilter}
                                      onChange={(e) => updateCondition(group.id, conditionIndex, 'hasContentFilter', e.target.checked)}
                                      className="w-4 h-4 rounded border-gray-300 text-purple-600"
                                    />
                                    <span className="text-sm text-gray-700">סנן לפי תוכן ההודעה</span>
                                  </label>
                                  {condition.hasContentFilter && (
                                    <>
                                      <select
                                        value={condition.operator || 'contains'}
                                        onChange={(e) => updateCondition(group.id, conditionIndex, 'operator', e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                      >
                                        {operators.map(op => (
                                          <option key={op.id} value={op.id}>{op.label}</option>
                                        ))}
                                      </select>
                                      {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                                        <input
                                          type="text"
                                          value={condition.value || ''}
                                          onChange={(e) => updateCondition(group.id, conditionIndex, 'value', e.target.value)}
                                          placeholder={condition.operator === 'regex' ? 'ביטוי רגולרי...' : 'הזן ערך...'}
                                          className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                          dir={condition.operator === 'regex' ? 'ltr' : 'rtl'}
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* bot_activated — informational */}
                          {condition.type === 'bot_activated' && (
                            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                              <p className="text-xs text-violet-700">
                                ▶️ הבוט יופעל כאשר בוט אחר מפעיל אותו דרך פעולת <strong>״הפעל בוט״</strong>.
                              </p>
                            </div>
                          )}

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
                                    const checked = e.target.checked;
                                    const newGroups = groups.map(gr => {
                                      if (gr.id === group.id) {
                                        return {
                                          ...gr,
                                          conditions: gr.conditions.map((c, i) =>
                                            i === conditionIndex
                                              ? { ...c, filterByStatus: checked, ...(!checked ? { specificStatusId: '' } : {}) }
                                              : c
                                          )
                                        };
                                      }
                                      return gr;
                                    });
                                    onUpdate({ triggerGroups: newGroups });
                                    if (checked && userStatuses.length === 0) {
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
                                        const now = new Date();
                                        const hoursAgo = (now - time) / (1000 * 60 * 60);
                                        const isExpired = hoursAgo >= 24;
                                        const timeStr = time.toLocaleTimeString('he-IL', { 
                                          hour: '2-digit', minute: '2-digit' 
                                        });
                                        const typeIcon = status.message_type === 'text' ? '📝' :
                                                         status.message_type === 'image' ? '🖼️' :
                                                         status.message_type === 'video' ? '🎥' : '📎';
                                        const preview = status.content 
                                          ? status.content.substring(0, 40) + (status.content.length > 40 ? '...' : '')
                                          : `(${status.message_type})`;
                                        const expiredLabel = isExpired ? ' ⚠️ לא תקף' : '';
                                        return (
                                          <option key={status.wa_message_id} value={status.wa_message_id}>
                                            {typeIcon} {timeStr} - {preview}{expiredLabel}
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
                                  {condition.specificStatusId && (() => {
                                    const selected = userStatuses.find(s => s.wa_message_id === condition.specificStatusId);
                                    if (selected) {
                                      const hoursAgo = (new Date() - new Date(selected.posted_at)) / (1000 * 60 * 60);
                                      if (hoursAgo >= 24) {
                                        return (
                                          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-1">
                                            ⚠️ הסטטוס הזה כבר לא תקף (עבר 24 שעות). הטריגר לא יופעל עליו. העלה סטטוס חדש ובחר אותו.
                                          </p>
                                        );
                                      }
                                    } else if (condition.specificStatusId) {
                                      return (
                                        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-1">
                                          ⚠️ הסטטוס שנבחר כבר לא קיים ברשימה. בחר סטטוס חדש.
                                        </p>
                                      );
                                    }
                                    return null;
                                  })()}
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
                          
                          {/* Specific group filter for group triggers */}
                          {triggerInfo.hasGroupFilter && (
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={condition.filterByGroup || false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    // Update both fields at once by modifying the condition directly
                                    const newGroups = groups.map(gr => {
                                      if (gr.id === group.id) {
                                        return {
                                          ...gr,
                                          conditions: gr.conditions.map((c, i) =>
                                            i === conditionIndex
                                              ? { ...c, filterByGroup: checked, ...(!checked ? { specificGroupId: '' } : {}) }
                                              : c
                                          )
                                        };
                                      }
                                      return gr;
                                    });
                                    onUpdate({ triggerGroups: newGroups });
                                    if (checked && whatsappGroups.length === 0) {
                                      loadGroups();
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-purple-600"
                                />
                                <span className="text-sm text-gray-700">קבוצה ספציפית בלבד</span>
                              </label>
                              
                              {condition.filterByGroup && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={condition.specificGroupId || ''}
                                      onChange={(e) => updateCondition(group.id, conditionIndex, 'specificGroupId', e.target.value)}
                                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                    >
                                      <option value="">-- בחר קבוצה --</option>
                                      {whatsappGroups.map(g => (
                                        <option key={g.id} value={g.id}>
                                          👥 {g.name} ({g.participants} משתתפים)
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={loadGroups}
                                      disabled={loadingGroups}
                                      className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                      title="רענן רשימת קבוצות"
                                    >
                                      <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
                                    </button>
                                  </div>
                                  {whatsappGroups.length === 0 && !loadingGroups && (
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      לא נמצאו קבוצות. וודא שהווצאפ מחובר ורענן.
                                    </p>
                                  )}
                                  {loadingGroups && (
                                    <p className="text-xs text-gray-400">טוען קבוצות...</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Specific channel filter for channel triggers */}
                          {triggerInfo.hasChannelFilter && (
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={condition.filterByChannel || false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    const newGroups = groups.map(gr => {
                                      if (gr.id === group.id) {
                                        return {
                                          ...gr,
                                          conditions: gr.conditions.map((c, i) =>
                                            i === conditionIndex
                                              ? { ...c, filterByChannel: checked, ...(!checked ? { specificChannelId: '' } : {}) }
                                              : c
                                          )
                                        };
                                      }
                                      return gr;
                                    });
                                    onUpdate({ triggerGroups: newGroups });
                                    if (checked && whatsappChannels.length === 0) {
                                      loadChannels();
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-purple-600"
                                />
                                <span className="text-sm text-gray-700">ערוץ ספציפי בלבד</span>
                              </label>
                              
                              {condition.filterByChannel && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={condition.specificChannelId || ''}
                                      onChange={(e) => updateCondition(group.id, conditionIndex, 'specificChannelId', e.target.value)}
                                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                                    >
                                      <option value="">-- בחר ערוץ --</option>
                                      {whatsappChannels.map(ch => (
                                        <option key={ch.id} value={ch.id}>
                                          📢 {ch.name} {ch.verified ? '✓' : ''}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={loadChannels}
                                      disabled={loadingChannels}
                                      className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                      title="רענן רשימת ערוצים"
                                    >
                                      <RefreshCw className={`w-4 h-4 ${loadingChannels ? 'animate-spin' : ''}`} />
                                    </button>
                                  </div>
                                  {whatsappChannels.length === 0 && !loadingChannels && (
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      לא נמצאו ערוצים. וודא שהווצאפ מחובר והנך עוקב אחרי ערוצים.
                                    </p>
                                  )}
                                  {loadingChannels && (
                                    <p className="text-xs text-gray-400">טוען ערוצים...</p>
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

                        {/* Allow channel messages */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.allowChannelMessages || false}
                            onChange={(e) => updateGroupSetting(group.id, 'allowChannelMessages', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700">📢 הפעלה בערוצים</div>
                            <div className="text-xs text-gray-500">הפעל את הטריגר בהודעות מערוצים (Newsletters)</div>
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
                              if (e.target.checked) {
                                const newGroups = groups.map(g => {
                                  if (g.id === group.id) {
                                    return {
                                      ...g,
                                      hasActiveHours: true,
                                      activeFrom: g.activeFrom || '09:00',
                                      activeTo: g.activeTo || '18:00'
                                    };
                                  }
                                  return g;
                                });
                                onUpdate({ triggerGroups: newGroups });
                              } else {
                                updateGroupSetting(group.id, 'hasActiveHours', false);
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

                      {/* Phone number filter (whitelist/blacklist) */}
                      <div className="border-t border-gray-100 pt-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.phoneFilter === 'whitelist' || group.phoneFilter === 'blacklist'}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newGroups = groups.map(g => {
                                  if (g.id === group.id) {
                                    return {
                                      ...g,
                                      phoneFilter: 'whitelist',
                                      phoneNumbers: g.phoneNumbers || [],
                                      blacklistNumbers: g.blacklistNumbers || []
                                    };
                                  }
                                  return g;
                                });
                                onUpdate({ triggerGroups: newGroups });
                              } else {
                                updateGroupSetting(group.id, 'phoneFilter', 'all');
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5" />
                              סינון לפי מספר טלפון
                            </div>
                            <div className="text-xs text-gray-500">הגבל את הטריגר למספרים ספציפיים</div>
                          </div>
                        </label>

                        {(group.phoneFilter === 'whitelist' || group.phoneFilter === 'blacklist') && (
                          <div className="mt-3 mr-7 space-y-4">
                            {/* Mode toggle */}
                            <div className="flex bg-gray-100 rounded-lg p-1">
                              <button
                                type="button"
                                onClick={() => updateGroupSetting(group.id, 'phoneFilter', 'whitelist')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                                  group.phoneFilter === 'whitelist'
                                    ? 'bg-white shadow text-green-700'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <Shield className="w-3 h-3" />
                                מספרים מורשים בלבד
                              </button>
                              <button
                                type="button"
                                onClick={() => updateGroupSetting(group.id, 'phoneFilter', 'blacklist')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                                  group.phoneFilter === 'blacklist'
                                    ? 'bg-white shadow text-red-700'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <X className="w-3 h-3" />
                                מספרים חסומים בלבד
                              </button>
                            </div>

                            {/* Whitelist section */}
                            {group.phoneFilter === 'whitelist' && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span className="text-xs font-medium text-green-700">מספרים מורשים</span>
                                  <span className="text-[10px] text-gray-400">— רק מספרים אלה יפעילו את הטריגר</span>
                                </div>
                                {(group.phoneNumbers || []).map((num, numIdx) => (
                                  <div key={numIdx} className="flex items-center gap-2 group/phone">
                                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-green-100 text-green-600 text-xs font-medium flex-shrink-0">
                                      {numIdx + 1}
                                    </div>
                                    <input
                                      type="tel"
                                      value={num}
                                      onChange={(e) => {
                                        const newNums = [...(group.phoneNumbers || [])];
                                        newNums[numIdx] = e.target.value;
                                        updateGroupSetting(group.id, 'phoneNumbers', newNums);
                                      }}
                                      placeholder="050-1234567 / 972501234567"
                                      className="flex-1 px-3 py-2 border border-green-200 bg-green-50/50 rounded-lg text-sm focus:border-green-400 focus:ring-1 focus:ring-green-200 outline-none"
                                      dir="ltr"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newNums = (group.phoneNumbers || []).filter((_, i) => i !== numIdx);
                                        updateGroupSetting(group.id, 'phoneNumbers', newNums);
                                      }}
                                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover/phone:opacity-100 transition-opacity"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newNums = [...(group.phoneNumbers || []), ''];
                                    updateGroupSetting(group.id, 'phoneNumbers', newNums);
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors border border-dashed border-green-200"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  הוסף מספר מורשה
                                </button>
                              </div>
                            )}

                            {/* Blacklist section */}
                            {group.phoneFilter === 'blacklist' && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                  <span className="text-xs font-medium text-red-700">מספרים חסומים</span>
                                  <span className="text-[10px] text-gray-400">— מספרים אלה לא יפעילו את הטריגר</span>
                                </div>
                                {(group.blacklistNumbers || []).map((num, numIdx) => (
                                  <div key={numIdx} className="flex items-center gap-2 group/phone">
                                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-medium flex-shrink-0">
                                      {numIdx + 1}
                                    </div>
                                    <input
                                      type="tel"
                                      value={num}
                                      onChange={(e) => {
                                        const newNums = [...(group.blacklistNumbers || [])];
                                        newNums[numIdx] = e.target.value;
                                        updateGroupSetting(group.id, 'blacklistNumbers', newNums);
                                      }}
                                      placeholder="050-1234567 / 972501234567"
                                      className="flex-1 px-3 py-2 border border-red-200 bg-red-50/50 rounded-lg text-sm focus:border-red-400 focus:ring-1 focus:ring-red-200 outline-none"
                                      dir="ltr"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newNums = (group.blacklistNumbers || []).filter((_, i) => i !== numIdx);
                                        updateGroupSetting(group.id, 'blacklistNumbers', newNums);
                                      }}
                                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover/phone:opacity-100 transition-opacity"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newNums = [...(group.blacklistNumbers || []), ''];
                                    updateGroupSetting(group.id, 'blacklistNumbers', newNums);
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-dashed border-red-200"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  הוסף מספר לחסימה
                                </button>
                              </div>
                            )}

                            <p className="text-[10px] text-gray-400">
                              ניתן להזין בכל פורמט: 050-1234567, 0501234567, 972501234567, +972-50-123-4567
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Advanced conditions */}
                      <div className="border-t border-gray-100 pt-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!(group.advancedConditionGroup?.conditions?.length > 0 || (group.advancedConditions && group.advancedConditions.length > 0))}
                            onChange={(e) => {
                              const newGroups = groups.map(g => {
                                if (g.id === group.id) {
                                  if (e.target.checked) {
                                    return {
                                      ...g,
                                      advancedConditionGroup: {
                                        logic: 'AND',
                                        conditions: [{ variable: 'contact_var', operator: 'equals', value: '', varName: '' }]
                                      },
                                      advancedConditions: []
                                    };
                                  } else {
                                    return { ...g, advancedConditionGroup: null, advancedConditions: [] };
                                  }
                                }
                                return g;
                              });
                              onUpdate({ triggerGroups: newGroups });
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5" />
                              תנאים מתקדמים
                            </div>
                            <div className="text-xs text-gray-500">הוסף תנאים על משתנים, תגיות, זמנים ועוד</div>
                          </div>
                        </label>

                        {(() => {
                          // Migrate old flat advancedConditions to new conditionGroup format
                          const condGroup = group.advancedConditionGroup || (
                            group.advancedConditions && group.advancedConditions.length > 0
                              ? { logic: 'AND', conditions: group.advancedConditions }
                              : null
                          );
                          if (!condGroup || !condGroup.conditions || condGroup.conditions.length === 0) return null;

                          const updateCondGroup = (newGroup) => {
                            updateGroupSetting(group.id, 'advancedConditionGroup', newGroup);
                            updateGroupSetting(group.id, 'advancedConditions', []);
                          };

                          return (
                            <div className="mt-3 mr-7 space-y-2">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-gray-500">לחץ על "וגם"/"או" לשינוי לוגיקה</p>
                                <button
                                  type="button"
                                  onClick={loadVariables}
                                  disabled={loadingVars}
                                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                >
                                  <RefreshCw className={`w-3 h-3 ${loadingVars ? 'animate-spin' : ''}`} />
                                  רענן משתנים
                                </button>
                              </div>
                              <TriggerConditionGroup
                                group={condGroup}
                                onChange={updateCondGroup}
                                onRemove={() => {}}
                                canRemove={false}
                                isRoot={true}
                                availableVars={availableVars}
                                loadingVars={loadingVars}
                              />
                            </div>
                          );
                        })()}
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

    </div>
  );
}
