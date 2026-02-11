import { useState, useEffect } from 'react';
import { 
  X, ChevronDown, ChevronUp, Loader2, Plus, Trash2, 
  RefreshCw, AlertCircle, Users, Phone, Mail, Tag,
  ArrowRight, Zap, Search, UserPlus, UserCheck
} from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const OPERATIONS = [
  { id: 'check_exists', label: 'בדיקת קיום', icon: '❓', description: 'בדוק אם איש קשר קיים' },
  { id: 'search_contact', label: 'חיפוש איש קשר', icon: '🔍', description: 'חפש לפי טלפון או אימייל' },
  { id: 'create_contact', label: 'יצירת איש קשר', icon: '➕', description: 'צור איש קשר חדש' },
  { id: 'update_contact', label: 'עדכון איש קשר', icon: '✏️', description: 'עדכן פרטי איש קשר' },
  { id: 'find_or_create', label: 'מצא או צור', icon: '🔎', description: 'מצא לפי טלפון או צור חדש' },
  { id: 'add_to_label', label: 'הוספה לתווית', icon: '🏷️', description: 'הוסף איש קשר לתווית' },
  { id: 'remove_from_label', label: 'הסרה מתווית', icon: '🗑️', description: 'הסר איש קשר מתווית' },
];

const SEARCH_BY_OPTIONS = [
  { id: 'phone', label: 'טלפון', icon: Phone },
  { id: 'email', label: 'אימייל', icon: Mail },
];

// Available result fields that can be mapped to variables
const RESULT_FIELDS = [
  { id: 'exists', label: 'האם קיים', description: 'true/false' },
  { id: 'resourceName', label: 'מזהה איש קשר', description: 'people/xxx' },
  { id: 'name', label: 'שם', description: 'שם מלא' },
  { id: 'phone', label: 'טלפון', description: 'מספר טלפון' },
  { id: 'email', label: 'אימייל', description: 'כתובת אימייל' },
  { id: 'action', label: 'פעולה', description: 'found/created/updated' },
  { id: 'error', label: 'שגיאה', description: 'הודעת שגיאה' },
];

export default function GoogleContactsEditor({ data, onUpdate }) {
  const actions = data.actions || [];

  const addAction = () => {
    const newAction = {
      operation: 'check_exists',
      searchBy: 'phone',
      searchValue: '',
      name: '',
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      labelId: '',
      labelName: '',
      resultMappings: [], // User defines their own variable mappings
    };
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

  return (
    <div className="space-y-4">
      {actions.length > 0 && (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <GoogleContactsActionItem
              key={index}
              action={action}
              onUpdate={(updates) => updateAction(index, updates)}
              onRemove={() => removeAction(index)}
              index={index}
            />
          ))}
        </div>
      )}

      <div className={actions.length > 0 ? "border-t border-gray-100 pt-4" : ""}>
        <button
          onClick={addAction}
          className="w-full flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-200 hover:border-blue-300 hover:shadow-sm"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1 text-right">
            <span className="font-medium text-blue-700 block">
              {actions.length > 0 ? 'הוסף פעולה נוספת' : 'הוסף פעולת Google Contacts'}
            </span>
            <p className="text-xs text-blue-500">חפש, צור או עדכן אנשי קשר בגוגל</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function GoogleContactsActionItem({ action, onUpdate, onRemove, index }) {
  const [isOpen, setIsOpen] = useState(true);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState({ labels: false });
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(null);

  // Check connection status on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const { data } = await api.get('/google-contacts/status');
      setConnected(data.connected);
      if (data.connected) {
        loadLabels();
      }
    } catch (err) {
      setConnected(false);
    }
  };

  // Load labels
  const loadLabels = async () => {
    try {
      setLoading(prev => ({ ...prev, labels: true }));
      setError(null);
      const { data } = await api.get('/google-contacts/labels');
      setLabels(data.labels || []);
    } catch (err) {
      console.error('Failed to load labels:', err);
      if (err.response?.data?.error === 'not_connected') {
        setConnected(false);
      } else {
        setError('שגיאה בטעינת תוויות');
      }
    } finally {
      setLoading(prev => ({ ...prev, labels: false }));
    }
  };

  const handleLabelChange = (labelResourceName) => {
    const selected = labels.find(l => l.resourceName === labelResourceName);
    onUpdate({
      labelId: labelResourceName,
      labelName: selected?.name || '',
    });
  };

  const operationInfo = OPERATIONS.find(op => op.id === action.operation);
  
  // Determine what fields to show based on operation
  const needsSearch = ['check_exists', 'search_contact', 'find_or_create', 'update_contact', 'add_to_label', 'remove_from_label'].includes(action.operation);
  const needsContactDetails = ['create_contact', 'update_contact', 'find_or_create'].includes(action.operation);
  const needsLabel = ['create_contact', 'find_or_create', 'add_to_label', 'remove_from_label'].includes(action.operation);

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">Google Contacts לא מחובר</p>
            <p className="text-xs text-yellow-600 mt-1">
              יש לחבר את חשבון Google שלך בהגדרות → אינטגרציות
            </p>
          </div>
          <button
            onClick={() => window.open('/settings?tab=integrations', '_blank')}
            className="px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 text-sm rounded-lg transition-colors font-medium"
          >
            חבר עכשיו
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{operationInfo?.icon || '👤'}</span>
          <span className="font-medium text-blue-800 text-sm">
            {operationInfo?.label || 'פעולת Google Contacts'}
          </span>
          {action.labelName && (
            <span className="text-xs text-blue-500 max-w-[120px] truncate">
              - {action.labelName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 hover:bg-red-100 rounded-lg text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {isOpen ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 text-red-600 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Operation Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">סוג פעולה</label>
            <div className="grid grid-cols-2 gap-2">
              {OPERATIONS.map(op => (
                <button
                  key={op.id}
                  onClick={() => onUpdate({ operation: op.id })}
                  className={`flex items-center gap-2 p-2.5 rounded-lg text-right border transition-all text-sm ${
                    action.operation === op.id
                      ? 'border-blue-400 bg-blue-50 text-blue-800 shadow-sm'
                      : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 text-gray-600'
                  }`}
                >
                  <span className="text-base">{op.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium block text-xs">{op.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Search Configuration */}
          {needsSearch && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">חיפוש איש קשר</span>
              </div>
              
              <div>
                <label className="block text-xs text-blue-700 mb-1">חיפוש לפי</label>
                <div className="flex gap-2">
                  {SEARCH_BY_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdate({ searchBy: opt.id })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        action.searchBy === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-blue-200 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-blue-700 mb-1">
                  {action.searchBy === 'phone' ? 'מספר טלפון' : 'כתובת אימייל'}
                </label>
                <TextInputWithVariables
                  value={action.searchValue || ''}
                  onChange={(val) => onUpdate({ searchValue: val })}
                  placeholder={action.searchBy === 'phone' ? '{{phone}} או מספר טלפון' : '{{email}} או כתובת אימייל'}
                  className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
          )}

          {/* Contact Details (for create/update) */}
          {needsContactDetails && (
            <div className="bg-green-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">פרטי איש קשר</span>
              </div>
              
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-green-700 mb-1">שם פרטי</label>
                  <TextInputWithVariables
                    value={action.firstName || ''}
                    onChange={(val) => onUpdate({ firstName: val })}
                    placeholder="{{first_name}} או שם"
                    className="w-full p-2 border border-green-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-green-700 mb-1">שם משפחה</label>
                  <TextInputWithVariables
                    value={action.lastName || ''}
                    onChange={(val) => onUpdate({ lastName: val })}
                    placeholder="{{last_name}} או משפחה"
                    className="w-full p-2 border border-green-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-green-700 mb-1">או שם מלא</label>
                <TextInputWithVariables
                  value={action.name || ''}
                  onChange={(val) => onUpdate({ name: val })}
                  placeholder="{{name}} או שם מלא"
                  className="w-full p-2 border border-green-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
                />
              </div>
              
              <div>
                <label className="block text-xs text-green-700 mb-1">טלפון</label>
                <TextInputWithVariables
                  value={action.phone || ''}
                  onChange={(val) => onUpdate({ phone: val })}
                  placeholder="{{phone}}"
                  className="w-full p-2 border border-green-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
                />
              </div>
              
              <div>
                <label className="block text-xs text-green-700 mb-1">אימייל</label>
                <TextInputWithVariables
                  value={action.email || ''}
                  onChange={(val) => onUpdate({ email: val })}
                  placeholder="{{email}}"
                  className="w-full p-2 border border-green-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
                />
              </div>
            </div>
          )}

          {/* Label Selection */}
          {needsLabel && (
            <div className="bg-purple-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">תווית</span>
                </div>
                <button
                  onClick={loadLabels}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                  disabled={loading.labels}
                >
                  <RefreshCw className={`w-3 h-3 ${loading.labels ? 'animate-spin' : ''}`} />
                  רענן
                </button>
              </div>
              
              <select
                value={action.labelId || ''}
                onChange={(e) => handleLabelChange(e.target.value)}
                className="w-full p-2.5 border border-purple-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-300"
              >
                <option value="">בחר תווית (אופציונלי)...</option>
                {labels.map(l => (
                  <option key={l.resourceName} value={l.resourceName}>
                    {l.name} ({l.memberCount} אנשי קשר)
                  </option>
                ))}
              </select>
              
              {loading.labels && (
                <div className="flex items-center gap-2 text-xs text-purple-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  טוען תוויות...
                </div>
              )}
              
              <p className="text-xs text-purple-500">
                התווית תתווסף לאיש הקשר שנוצר או נמצא
              </p>
            </div>
          )}

          {/* Result Mappings - User defines which results to save */}
          <div className="bg-amber-50 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">שמירת תוצאות למשתנים</span>
              </div>
              <button
                onClick={() => {
                  const mappings = action.resultMappings || [];
                  onUpdate({ resultMappings: [...mappings, { field: 'exists', varName: '', label: '' }] });
                }}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                הוסף משתנה
              </button>
            </div>
            
            {(action.resultMappings || []).length === 0 ? (
              <p className="text-xs text-amber-600">
                לחץ "הוסף משתנה" כדי לשמור תוצאות מהפעולה
              </p>
            ) : (
              <div className="space-y-2">
                {(action.resultMappings || []).map((mapping, mIndex) => (
                  <div key={mIndex} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-amber-200">
                    <select
                      value={mapping.field || ''}
                      onChange={(e) => {
                        const newMappings = [...(action.resultMappings || [])];
                        newMappings[mIndex] = { ...newMappings[mIndex], field: e.target.value };
                        onUpdate({ resultMappings: newMappings });
                      }}
                      className="flex-1 p-1.5 text-xs border border-amber-200 rounded-lg bg-amber-50"
                    >
                      <option value="">בחר שדה...</option>
                      {RESULT_FIELDS.map(f => (
                        <option key={f.id} value={f.id}>{f.label} ({f.description})</option>
                      ))}
                    </select>
                    <ArrowRight className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={mapping.varName || ''}
                      onChange={(e) => {
                        const newMappings = [...(action.resultMappings || [])];
                        newMappings[mIndex] = { ...newMappings[mIndex], varName: e.target.value };
                        onUpdate({ resultMappings: newMappings });
                      }}
                      placeholder="שם משתנה (באנגלית)"
                      className="flex-1 p-1.5 text-xs border border-amber-200 rounded-lg"
                      dir="ltr"
                    />
                    <input
                      type="text"
                      value={mapping.label || ''}
                      onChange={(e) => {
                        const newMappings = [...(action.resultMappings || [])];
                        newMappings[mIndex] = { ...newMappings[mIndex], label: e.target.value };
                        onUpdate({ resultMappings: newMappings });
                      }}
                      placeholder="תווית (בעברית)"
                      className="flex-1 p-1.5 text-xs border border-amber-200 rounded-lg"
                    />
                    <button
                      onClick={() => {
                        const newMappings = (action.resultMappings || []).filter((_, i) => i !== mIndex);
                        onUpdate({ resultMappings: newMappings });
                      }}
                      className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <p className="text-[10px] text-amber-500">
              💡 השתמש בשם משתנה באנגלית (לדוגמה: contact_exists) ותווית בעברית (לדוגמה: איש קשר קיים)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
