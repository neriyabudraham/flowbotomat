import { useState, useEffect } from 'react';
import { 
  X, ChevronDown, ChevronUp, Loader2, RefreshCw, Plus, AlertCircle,
  FileSpreadsheet, ArrowRight, Search, Table, Zap, Check, Copy, Edit3
} from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const OPERATIONS = [
  { id: 'append_row', label: 'הוספת שורה', icon: '➕', description: 'הוסף שורה חדשה לגיליון' },
  { id: 'update_row', label: 'עדכון שורה', icon: '✏️', description: 'עדכן שורה לפי מספר' },
  { id: 'search_rows', label: 'חיפוש שורות', icon: '🔍', description: 'חפש שורות לפי ערך' },
  { id: 'read_rows', label: 'קריאת שורות', icon: '📖', description: 'קרא שורות מהגיליון' },
  { id: 'search_and_update', label: 'חיפוש ועדכון', icon: '🔄', description: 'מצא שורה ועדכן אותה' },
  { id: 'search_or_append', label: 'חיפוש או הוספה', icon: '🔎', description: 'מצא קיים או הוסף חדש' },
];

const SEARCH_OPERATORS = [
  { id: 'equals', label: 'שווה ל' },
  { id: 'contains', label: 'מכיל' },
  { id: 'starts_with', label: 'מתחיל ב' },
  { id: 'ends_with', label: 'מסתיים ב' },
];

// All result variables with descriptions and Hebrew labels
const RESULT_VARIABLES = [
  { key: 'sheets_found', hebrewLabel: 'גיליון - נמצא', description: 'האם נמצאה שורה (true/false)', operations: ['search_rows', 'search_and_update', 'search_or_append'] },
  { key: 'sheets_row_index', hebrewLabel: 'גיליון - מספר שורה', description: 'מספר השורה שנמצאה/נוצרה', operations: ['append_row', 'search_rows', 'search_and_update', 'search_or_append'] },
  { key: 'sheets_total_rows', hebrewLabel: 'גיליון - סה״כ שורות', description: 'כמות השורות בגיליון', operations: ['read_rows'] },
  { key: 'sheets_total_matches', hebrewLabel: 'גיליון - סה״כ תוצאות', description: 'כמות התוצאות שנמצאו', operations: ['search_rows'] },
  { key: 'sheets_action', hebrewLabel: 'גיליון - פעולה שבוצעה', description: 'הפעולה שבוצעה (appended/updated/found)', operations: ['append_row', 'update_row', 'search_and_update', 'search_or_append'] },
  { key: 'sheets_success', hebrewLabel: 'גיליון - פעולה הצליחה', description: 'האם הפעולה הצליחה (true/false)', operations: ['append_row', 'update_row', 'search_and_update', 'search_or_append'] },
  { key: 'sheets_error', hebrewLabel: 'גיליון - שגיאה', description: 'הודעת שגיאה אם נכשל', operations: ['append_row', 'update_row', 'search_rows', 'read_rows', 'search_and_update', 'search_or_append'] },
];

export default function GoogleSheetsEditor({ data, onUpdate }) {
  const actions = data.actions || [];

  const addAction = () => {
    const newAction = {
      operation: 'append_row',
      spreadsheetId: '',
      spreadsheetName: '',
      sheetName: '',
      columnMappings: [],
      searchColumn: '',
      searchOperator: 'equals',
      searchValue: '',
      rowIndex: '',
      // Column result mappings (column -> variable)
      resultMappings: [],
      // System variable names with Hebrew labels
      varNames: {
        sheets_found: { name: 'sheets_found', label: 'גיליון - נמצא' },
        sheets_row_index: { name: 'sheets_row_index', label: 'גיליון - מספר שורה' },
        sheets_total_rows: { name: 'sheets_total_rows', label: 'גיליון - סה״כ שורות' },
        sheets_total_matches: { name: 'sheets_total_matches', label: 'גיליון - סה״כ תוצאות' },
        sheets_action: { name: 'sheets_action', label: 'גיליון - פעולה שבוצעה' },
        sheets_success: { name: 'sheets_success', label: 'גיליון - פעולה הצליחה' },
        sheets_error: { name: 'sheets_error', label: 'גיליון - שגיאה' },
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
            <GoogleSheetsActionItem
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
          className="w-full flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 rounded-xl transition-all border border-green-200 hover:border-green-300 hover:shadow-sm"
        >
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 text-right">
            <span className="font-medium text-green-700 block">
              {actions.length > 0 ? 'הוסף פעולה נוספת' : 'הוסף פעולת Google Sheets'}
            </span>
            <p className="text-xs text-green-500">קרא, כתוב או חפש בגיליונות אלקטרוניים</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function GoogleSheetsActionItem({ action, onUpdate, onRemove, index }) {
  const [isOpen, setIsOpen] = useState(true);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState({ spreadsheets: false, sheets: false, headers: false });
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(null);
  const [showVarEditor, setShowVarEditor] = useState(false);
  const [copiedVar, setCopiedVar] = useState(null);

  useEffect(() => {
    checkConnection();
  }, []);

  useEffect(() => {
    if (action.spreadsheetId) {
      loadSheets(action.spreadsheetId);
    }
  }, [action.spreadsheetId]);

  useEffect(() => {
    if (action.spreadsheetId && action.sheetName) {
      loadHeaders(action.spreadsheetId, action.sheetName);
    }
  }, [action.spreadsheetId, action.sheetName]);

  const checkConnection = async () => {
    try {
      const { data } = await api.get('/google-sheets/status');
      setConnected(data.connected);
      if (data.connected) {
        loadSpreadsheets();
      }
    } catch (err) {
      setConnected(false);
    }
  };

  const loadSpreadsheets = async () => {
    try {
      setLoading(prev => ({ ...prev, spreadsheets: true }));
      setError(null);
      const { data } = await api.get('/google-sheets/spreadsheets');
      setSpreadsheets(data.spreadsheets || []);
    } catch (err) {
      console.error('Failed to load spreadsheets:', err);
      if (err.response?.data?.error === 'not_connected') {
        setConnected(false);
      } else {
        setError('שגיאה בטעינת גיליונות');
      }
    } finally {
      setLoading(prev => ({ ...prev, spreadsheets: false }));
    }
  };

  const loadSheets = async (spreadsheetId) => {
    if (!spreadsheetId) return;
    try {
      setLoading(prev => ({ ...prev, sheets: true }));
      const { data } = await api.get(`/google-sheets/spreadsheets/${spreadsheetId}/sheets`);
      setSheets(data.sheets || []);
    } catch (err) {
      console.error('Failed to load sheets:', err);
    } finally {
      setLoading(prev => ({ ...prev, sheets: false }));
    }
  };

  const loadHeaders = async (spreadsheetId, sheetName) => {
    if (!spreadsheetId || !sheetName) return;
    try {
      setLoading(prev => ({ ...prev, headers: true }));
      const { data } = await api.get(`/google-sheets/spreadsheets/${spreadsheetId}/headers`, {
        params: { sheet: sheetName }
      });
      setHeaders(data.headers || []);
    } catch (err) {
      console.error('Failed to load headers:', err);
    } finally {
      setLoading(prev => ({ ...prev, headers: false }));
    }
  };

  const handleSpreadsheetChange = (spreadsheetId) => {
    const selected = spreadsheets.find(s => s.id === spreadsheetId);
    onUpdate({
      spreadsheetId,
      spreadsheetName: selected?.name || '',
      sheetName: '',
      columnMappings: [],
      resultMappings: [],
      searchColumn: '',
    });
    setSheets([]);
    setHeaders([]);
  };

  const handleSheetChange = (sheetName) => {
    onUpdate({
      sheetName,
      columnMappings: [],
      resultMappings: [],
      searchColumn: '',
    });
  };

  const addColumnMapping = () => {
    onUpdate({
      columnMappings: [...(action.columnMappings || []), { column: '', value: '' }],
    });
  };

  const updateColumnMapping = (i, updates) => {
    const newMappings = [...(action.columnMappings || [])];
    newMappings[i] = { ...newMappings[i], ...updates };
    onUpdate({ columnMappings: newMappings });
  };

  const removeColumnMapping = (i) => {
    onUpdate({
      columnMappings: action.columnMappings.filter((_, idx) => idx !== i),
    });
  };

  const addResultMapping = () => {
    onUpdate({
      resultMappings: [...(action.resultMappings || []), { column: '', variable: '' }],
    });
  };

  const updateResultMapping = (i, updates) => {
    const newMappings = [...(action.resultMappings || [])];
    newMappings[i] = { ...newMappings[i], ...updates };
    onUpdate({ resultMappings: newMappings });
  };

  const removeResultMapping = (i) => {
    onUpdate({
      resultMappings: action.resultMappings.filter((_, idx) => idx !== i),
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

  const operationInfo = OPERATIONS.find(op => op.id === action.operation);
  
  const needsWriteColumns = ['append_row', 'update_row', 'search_and_update', 'search_or_append'].includes(action.operation);
  const needsSearch = ['search_rows', 'search_and_update', 'search_or_append'].includes(action.operation);
  const needsRowIndex = ['update_row', 'read_rows'].includes(action.operation);
  const needsResultMapping = ['search_rows', 'read_rows', 'search_and_update', 'search_or_append'].includes(action.operation);
  
  // Get relevant variables for current operation
  const relevantVars = RESULT_VARIABLES.filter(v => v.operations.includes(action.operation));
  const varNames = action.varNames || {};

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">Google Sheets לא מחובר</p>
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
    <div className="bg-white border border-green-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{operationInfo?.icon || '📊'}</span>
          <span className="font-medium text-green-800 text-sm">
            {operationInfo?.label || 'פעולת Google Sheets'}
          </span>
          {action.spreadsheetName && (
            <span className="text-xs text-green-500 bg-green-100 px-2 py-0.5 rounded-full">
              {action.spreadsheetName}
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
          {isOpen ? <ChevronUp className="w-4 h-4 text-green-400" /> : <ChevronDown className="w-4 h-4 text-green-400" />}
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
                      ? 'border-green-400 bg-green-50 text-green-800 shadow-sm'
                      : 'border-gray-200 hover:border-green-200 hover:bg-green-50/50 text-gray-600'
                  }`}
                >
                  <span className="text-base">{op.icon}</span>
                  <span className="font-medium text-xs">{op.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Spreadsheet Selection */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">בחירת גיליון</span>
              </div>
              <button
                onClick={loadSpreadsheets}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                disabled={loading.spreadsheets}
              >
                <RefreshCw className={`w-3 h-3 ${loading.spreadsheets ? 'animate-spin' : ''}`} />
                רענן
              </button>
            </div>

            <select
              value={action.spreadsheetId || ''}
              onChange={(e) => handleSpreadsheetChange(e.target.value)}
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
            >
              <option value="">בחר גיליון אלקטרוני...</option>
              {spreadsheets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {loading.spreadsheets && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                טוען גיליונות...
              </div>
            )}

            {action.spreadsheetId && (
              <select
                value={action.sheetName || ''}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-300"
              >
                <option value="">בחר גליון...</option>
                {sheets.map(s => (
                  <option key={s.title} value={s.title}>{s.title}</option>
                ))}
              </select>
            )}

            {loading.sheets && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                טוען גליונות...
              </div>
            )}
          </div>

          {/* Headers Preview */}
          {action.sheetName && headers.length > 0 && (
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">עמודות בגיליון</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {headers.map((h, i) => (
                  <span key={i} className="px-2 py-1 bg-white border border-green-200 rounded-lg text-xs text-green-700">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loading.headers && (
            <div className="flex items-center gap-2 text-xs text-gray-400 p-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              טוען כותרות...
            </div>
          )}

          {/* Search Configuration */}
          {needsSearch && action.sheetName && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">הגדרות חיפוש</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-blue-700 mb-1">עמודה לחיפוש</label>
                  <select
                    value={action.searchColumn || ''}
                    onChange={(e) => onUpdate({ searchColumn: e.target.value })}
                    className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">בחר עמודה...</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-blue-700 mb-1">סוג חיפוש</label>
                  <select
                    value={action.searchOperator || 'equals'}
                    onChange={(e) => onUpdate({ searchOperator: e.target.value })}
                    className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white"
                  >
                    {SEARCH_OPERATORS.map(op => (
                      <option key={op.id} value={op.id}>{op.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-blue-700 mb-1">ערך לחיפוש</label>
                <TextInputWithVariables
                  value={action.searchValue || ''}
                  onChange={(val) => onUpdate({ searchValue: val })}
                  placeholder="ערך לחיפוש"
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Row Index */}
          {needsRowIndex && action.sheetName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {action.operation === 'read_rows' ? 'מספר שורה להתחלה (אופציונלי)' : 'מספר שורה לעדכון'}
              </label>
              <TextInputWithVariables
                value={action.rowIndex || ''}
                onChange={(val) => onUpdate({ rowIndex: val })}
                placeholder={action.operation === 'read_rows' ? '2 (ברירת מחדל)' : 'מספר השורה לעדכון'}
                className="w-full"
              />
              <p className="text-[10px] text-gray-400 mt-1">שורה 1 היא כותרות, הנתונים מתחילים משורה 2</p>
            </div>
          )}

          {/* Column Mappings (for write operations) */}
          {needsWriteColumns && action.sheetName && (
            <div className="bg-orange-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800">ערכים לכתיבה</span>
                </div>
                <button
                  onClick={addColumnMapping}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1 bg-orange-100 hover:bg-orange-200 rounded-lg"
                >
                  <Plus className="w-3 h-3" />
                  הוסף
                </button>
              </div>
              
              {(action.columnMappings || []).length === 0 && (
                <div className="text-center py-3 text-orange-400 text-xs bg-white rounded-lg border border-dashed border-orange-200">
                  לחץ "הוסף" לקביעת ערכים לעמודות
                </div>
              )}
              
              {(action.columnMappings || []).map((mapping, i) => (
                <div key={i} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-orange-200">
                  <select
                    value={mapping.column || ''}
                    onChange={(e) => updateColumnMapping(i, { column: e.target.value })}
                    className="w-28 p-1.5 border border-orange-200 rounded text-xs bg-white"
                  >
                    <option value="">עמודה...</option>
                    {headers.map((h, hi) => (
                      <option key={hi} value={h}>{h}</option>
                    ))}
                  </select>
                  <ArrowRight className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <TextInputWithVariables
                    value={mapping.value || ''}
                    onChange={(val) => updateColumnMapping(i, { value: val })}
                    placeholder="ערך"
                    className="flex-1"
                    compact
                  />
                  <button
                    onClick={() => removeColumnMapping(i)}
                    className="p-1.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {headers.length > 0 && (action.columnMappings || []).length === 0 && (
                <button
                  onClick={() => {
                    onUpdate({
                      columnMappings: headers.map(h => ({ column: h, value: '' })),
                    });
                  }}
                  className="w-full text-xs text-orange-600 hover:text-orange-700 py-2 bg-white hover:bg-orange-100 rounded-lg transition-colors border border-orange-200"
                >
                  + הוסף את כל העמודות
                </button>
              )}
            </div>
          )}

          {/* Result Mappings (save column values to variables) */}
          {needsResultMapping && action.sheetName && (
            <div className="bg-purple-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">שמירת עמודות למשתנים</span>
                </div>
                <button
                  onClick={addResultMapping}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium px-2 py-1 bg-purple-100 hover:bg-purple-200 rounded-lg"
                >
                  <Plus className="w-3 h-3" />
                  הוסף
                </button>
              </div>
              
              <p className="text-xs text-purple-500">
                שמור ערכי עמודות מהשורה שנמצאה/נקראה למשתנים
              </p>
              
              {(action.resultMappings || []).length === 0 && (
                <div className="text-center py-3 text-purple-400 text-xs bg-white rounded-lg border border-dashed border-purple-200">
                  לחץ "הוסף" לשמירת ערכי עמודות למשתנים
                </div>
              )}
              
              {(action.resultMappings || []).map((mapping, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-purple-200">
                  <select
                    value={mapping.column || ''}
                    onChange={(e) => updateResultMapping(i, { column: e.target.value })}
                    className="w-28 p-1.5 border border-purple-200 rounded text-xs bg-purple-50"
                  >
                    <option value="">עמודה...</option>
                    {headers.map((h, hi) => (
                      <option key={hi} value={h}>{h}</option>
                    ))}
                  </select>
                  <ArrowRight className="w-3 h-3 text-purple-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={mapping.variable || ''}
                    onChange={(e) => updateResultMapping(i, { variable: e.target.value })}
                    placeholder="שם משתנה (באנגלית)"
                    className="flex-1 p-1.5 border border-purple-200 rounded text-xs"
                    dir="ltr"
                  />
                  <button
                    onClick={() => removeResultMapping(i)}
                    className="p-1.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              {headers.length > 0 && (action.resultMappings || []).length === 0 && (
                <button
                  onClick={() => {
                    onUpdate({
                      resultMappings: headers.map(h => ({ 
                        column: h, 
                        variable: h.toLowerCase().replace(/\s+/g, '_')
                      })),
                    });
                  }}
                  className="w-full text-xs text-purple-600 hover:text-purple-700 py-2 bg-white hover:bg-purple-100 rounded-lg transition-colors border border-purple-200"
                >
                  + הוסף את כל העמודות כמשתנים
                </button>
              )}
            </div>
          )}

          {/* System Variables Section */}
          {action.sheetName && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-amber-800">משתני מערכת שיישמרו</span>
                    <p className="text-[10px] text-amber-600">לחץ להעתקה, לחץ על עריכה לשינוי שם</p>
                  </div>
                </div>
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
              
              <div className="space-y-2">
                {relevantVars.map((v) => {
                  const config = getVarConfig(v.key);
                  const isCopied = copiedVar === config.name;
                  
                  return (
                    <div 
                      key={v.key} 
                      className="bg-white rounded-lg border border-amber-200 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-2">
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
                  לדוגמה: בדוק תנאי "{'{{sheets_found}}'} שווה ל-true" או שלח "נמצאו {'{{sheets_total_matches}}'} תוצאות"
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
