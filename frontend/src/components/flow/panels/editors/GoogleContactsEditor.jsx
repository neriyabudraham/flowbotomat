import { useState, useEffect } from 'react';
import { 
  X, ChevronDown, ChevronUp, Loader2, Plus,
  RefreshCw, AlertCircle, Users, Phone, Mail, Tag,
  Zap, Search, UserPlus, Check, Copy, Edit3
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

// All possible result variables with descriptions and Hebrew labels
const RESULT_VARIABLES = [
  { key: 'contact_exists', hebrewLabel: 'גוגל - איש קשר קיים', description: 'האם איש הקשר קיים (true/false)', operations: ['check_exists', 'search_contact', 'find_or_create'] },
  { key: 'contact_id', hebrewLabel: 'גוגל - מזהה איש קשר', description: 'מזהה איש הקשר בגוגל', operations: ['check_exists', 'search_contact', 'create_contact', 'update_contact', 'find_or_create'] },
  { key: 'contact_name', hebrewLabel: 'גוגל - שם איש קשר', description: 'שם מלא של איש הקשר', operations: ['search_contact', 'find_or_create'] },
  { key: 'contact_phone', hebrewLabel: 'גוגל - טלפון איש קשר', description: 'מספר הטלפון שנמצא', operations: ['search_contact', 'find_or_create'] },
  { key: 'contact_email', hebrewLabel: 'גוגל - אימייל איש קשר', description: 'כתובת האימייל שנמצאה', operations: ['search_contact', 'find_or_create'] },
  { key: 'contact_action', hebrewLabel: 'גוגל - פעולה שבוצעה', description: 'הפעולה שבוצעה (found/created/updated)', operations: ['create_contact', 'update_contact', 'find_or_create'] },
  { key: 'contact_success', hebrewLabel: 'גוגל - פעולה הצליחה', description: 'האם הפעולה הצליחה (true/false)', operations: ['add_to_label', 'remove_from_label'] },
  { key: 'contact_error', hebrewLabel: 'גוגל - שגיאה', description: 'הודעת שגיאה אם נכשל', operations: ['check_exists', 'search_contact', 'create_contact', 'update_contact', 'find_or_create', 'add_to_label', 'remove_from_label'] },
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
      // Default variable names with Hebrew labels (can be customized)
      varNames: {
        contact_exists: { name: 'contact_exists', label: 'גוגל - איש קשר קיים' },
        contact_id: { name: 'contact_id', label: 'גוגל - מזהה איש קשר' },
        contact_name: { name: 'contact_name', label: 'גוגל - שם איש קשר' },
        contact_phone: { name: 'contact_phone', label: 'גוגל - טלפון איש קשר' },
        contact_email: { name: 'contact_email', label: 'גוגל - אימייל איש קשר' },
        contact_action: { name: 'contact_action', label: 'גוגל - פעולה שבוצעה' },
        contact_success: { name: 'contact_success', label: 'גוגל - פעולה הצליחה' },
        contact_error: { name: 'contact_error', label: 'גוגל - שגיאה' },
      },
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
  const [showVarEditor, setShowVarEditor] = useState(false);
  const [copiedVar, setCopiedVar] = useState(null);
  const [creatingVars, setCreatingVars] = useState(false);
  const [existingVars, setExistingVars] = useState(new Set());
  const [selectedVarsToCreate, setSelectedVarsToCreate] = useState(new Set());

  useEffect(() => {
    checkConnection();
    loadExistingVariables();
  }, []);
  
  // Load existing variables to check which ones already exist
  const loadExistingVariables = async () => {
    try {
      const { data } = await api.get('/variables');
      const allVarNames = new Set([
        ...(data.userVariables || []).map(v => v.name),
        ...(data.customSystemVariables || []).map(v => v.name)
      ]);
      setExistingVars(allVarNames);
    } catch (err) {
      console.error('Failed to load existing variables:', err);
    }
  };

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

  const getVarConfig = (key) => {
    const config = (action.varNames || {})[key];
    const defaultVar = RESULT_VARIABLES.find(v => v.key === key);
    if (typeof config === 'object' && config !== null) {
      return { name: config.name || key, label: config.label || defaultVar?.hebrewLabel || key };
    }
    // Backwards compatibility - if it's a string, use it as name
    if (typeof config === 'string') {
      return { name: config, label: defaultVar?.hebrewLabel || key };
    }
    return { name: key, label: defaultVar?.hebrewLabel || key };
  };

  const copyVarName = (varName) => {
    navigator.clipboard.writeText(`{{${varName}}}`);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const updateVarName = (key, newName) => {
    const currentConfig = getVarConfig(key);
    const newVarNames = { 
      ...(action.varNames || {}), 
      [key]: { name: newName, label: currentConfig.label }
    };
    onUpdate({ varNames: newVarNames });
  };

  // Toggle variable selection for creation
  const toggleVarSelection = (varName) => {
    setSelectedVarsToCreate(prev => {
      const newSet = new Set(prev);
      if (newSet.has(varName)) {
        newSet.delete(varName);
      } else {
        newSet.add(varName);
      }
      return newSet;
    });
  };
  
  // Create only selected variables
  const createSelectedVariables = async () => {
    if (selectedVarsToCreate.size === 0) return;
    
    setCreatingVars(true);
    
    try {
      // Get all vars info
      const allVarsInfo = {};
      relevantVars.forEach(v => {
        const config = getVarConfig(v.key);
        allVarsInfo[config.name] = { name: config.name, label: config.label };
      });
      
      for (const varName of selectedVarsToCreate) {
        const varInfo = allVarsInfo[varName];
        if (!varInfo) continue;
        
        try {
          await api.post('/variables', { name: varInfo.name, label: varInfo.label, is_system: false });
        } catch (e) {
          // Variable might already exist
        }
      }
      
      // Refresh existing variables list
      await loadExistingVariables();
      setSelectedVarsToCreate(new Set());
      
    } catch (err) {
      console.error('Failed to create variables:', err);
    } finally {
      setCreatingVars(false);
    }
  };

  const operationInfo = OPERATIONS.find(op => op.id === action.operation);
  
  const needsSearch = ['check_exists', 'search_contact', 'find_or_create', 'update_contact', 'add_to_label', 'remove_from_label'].includes(action.operation);
  const needsContactDetails = ['create_contact', 'update_contact', 'find_or_create'].includes(action.operation);
  const needsLabel = ['create_contact', 'find_or_create', 'add_to_label', 'remove_from_label'].includes(action.operation);
  
  // Get relevant variables for current operation
  const relevantVars = RESULT_VARIABLES.filter(v => v.operations.includes(action.operation));

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
                  <span className="font-medium text-xs">{op.label}</span>
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
                  placeholder={action.searchBy === 'phone' ? 'מספר טלפון לחיפוש' : 'כתובת אימייל לחיפוש'}
                  className="w-full"
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
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-green-700 mb-1">שם פרטי</label>
                  <TextInputWithVariables
                    value={action.firstName || ''}
                    onChange={(val) => onUpdate({ firstName: val })}
                    placeholder="שם פרטי"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-green-700 mb-1">שם משפחה</label>
                  <TextInputWithVariables
                    value={action.lastName || ''}
                    onChange={(val) => onUpdate({ lastName: val })}
                    placeholder="שם משפחה"
                    className="w-full"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-green-700 mb-1">או שם מלא</label>
                <TextInputWithVariables
                  value={action.name || ''}
                  onChange={(val) => onUpdate({ name: val })}
                  placeholder="שם מלא"
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-xs text-green-700 mb-1">טלפון</label>
                <TextInputWithVariables
                  value={action.phone || ''}
                  onChange={(val) => onUpdate({ phone: val })}
                  placeholder="מספר טלפון"
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-xs text-green-700 mb-1">אימייל</label>
                <TextInputWithVariables
                  value={action.email || ''}
                  onChange={(val) => onUpdate({ email: val })}
                  placeholder="כתובת אימייל"
                  className="w-full"
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
            </div>
          )}

          {/* Variables Section - Beautiful and Clear */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <span className="text-sm font-bold text-amber-800">משתנים שיישמרו</span>
                  <p className="text-[10px] text-amber-600">סמן משתנים ליצירה, או לחץ להעתקה</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={createSelectedVariables}
                  disabled={creatingVars || selectedVarsToCreate.size === 0}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                    selectedVarsToCreate.size > 0
                      ? 'bg-green-500 text-white hover:bg-green-600' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {creatingVars ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  צור ({selectedVarsToCreate.size})
                </button>
                <button
                  onClick={() => setShowVarEditor(!showVarEditor)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                    showVarEditor 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  {showVarEditor ? 'סגור' : 'ערוך שמות'}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              {relevantVars.map((v) => {
                const config = getVarConfig(v.key);
                const isCopied = copiedVar === config.name;
                const varExists = existingVars.has(config.name);
                const isSelected = selectedVarsToCreate.has(config.name);
                
                return (
                  <div 
                    key={v.key} 
                    className={`bg-white rounded-lg border overflow-hidden transition-colors ${
                      varExists ? 'border-green-300' : isSelected ? 'border-blue-400' : 'border-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 p-2">
                      {/* Checkbox for creation (only if doesn't exist) */}
                      {!varExists ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVarSelection(config.name)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-medium rounded">
                          קיים ✓
                        </span>
                      )}
                      
                      {/* Variable badge with copy */}
                      <button
                        onClick={() => copyVarName(config.name)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all flex-shrink-0 ${
                          isCopied 
                            ? 'bg-green-500 text-white' 
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3" />
                            הועתק!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            {`{{${config.name}}}`}
                          </>
                        )}
                      </button>
                      
                      {/* Hebrew label and description */}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-amber-800 block">{config.label}</span>
                        <span className="text-[10px] text-gray-500">{v.description}</span>
                      </div>
                    </div>
                    
                    {/* Edit mode */}
                    {showVarEditor && (
                      <div className="px-2 pb-2 pt-1 border-t border-amber-100 bg-amber-50/50">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-amber-600 whitespace-nowrap">שם המשתנה:</span>
                          <input
                            type="text"
                            value={config.name}
                            onChange={(e) => updateVarName(v.key, e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-amber-200 rounded bg-white focus:ring-1 focus:ring-amber-400"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-[10px] text-amber-700 leading-relaxed">
                💡 <strong>איך להשתמש:</strong> לחץ על משתנה להעתקה, ואז הדבק אותו בכל שדה טקסט במערכת.
                <br />
                לדוגמה: שלח הודעה "שלום {'{{contact_name}}'}" או בדוק תנאי "{'{{contact_exists}}'} שווה ל-true"
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
