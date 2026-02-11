import { useState, useEffect, useCallback } from 'react';
import { 
  X, ChevronDown, ChevronUp, Loader2, Plus, Trash2, 
  RefreshCw, AlertCircle, Check, Search, FileSpreadsheet,
  ArrowRight, Table2, Settings2, Zap
} from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const OPERATIONS = [
  { id: 'append_row', label: 'הוספת שורה', icon: '➕', description: 'הוסף שורה חדשה לגיליון' },
  { id: 'update_row', label: 'עדכון שורה', icon: '✏️', description: 'עדכן שורה קיימת לפי מספר שורה' },
  { id: 'search_rows', label: 'חיפוש שורות', icon: '🔍', description: 'חפש שורות לפי ערך בעמודה' },
  { id: 'read_rows', label: 'קריאת שורות', icon: '📖', description: 'קרא את כל השורות מגיליון' },
  { id: 'search_and_update', label: 'חיפוש ועדכון', icon: '🔄', description: 'מצא שורה ועדכן אותה' },
  { id: 'search_or_append', label: 'חיפוש או הוספה', icon: '🔎', description: 'מצא שורה ועדכן, או הוסף חדשה אם לא נמצאה' },
];

const SEARCH_OPERATORS = [
  { id: 'equals', label: 'שווה ל' },
  { id: 'contains', label: 'מכיל' },
  { id: 'starts_with', label: 'מתחיל ב' },
  { id: 'ends_with', label: 'מסתיים ב' },
  { id: 'not_equals', label: 'לא שווה ל' },
  { id: 'not_empty', label: 'לא ריק' },
  { id: 'is_empty', label: 'ריק' },
];

// Built-in result fields that can be saved
const BUILTIN_FIELDS = [
  { id: 'found', label: 'נמצא', description: 'true/false' },
  { id: 'rowIndex', label: 'מספר שורה', description: 'מספר השורה שנמצאה' },
  { id: 'totalMatches', label: 'סה"כ תוצאות', description: 'מספר התוצאות' },
  { id: 'action', label: 'פעולה', description: 'updated/appended' },
  { id: 'error', label: 'שגיאה', description: 'הודעת שגיאה' },
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
      resultMappings: [],
      builtInMappings: [], // User-defined mappings for built-in results (found, rowIndex, etc.)
      rowIndex: '',
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
            <p className="text-xs text-green-500">קרא, כתוב או עדכן נתונים בגיליון</p>
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

  // Check connection status on mount
  useEffect(() => {
    checkConnection();
  }, []);

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

  // Load spreadsheets
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

  // Load sheets when spreadsheet changes
  useEffect(() => {
    if (action.spreadsheetId) {
      loadSheets(action.spreadsheetId);
    } else {
      setSheets([]);
      setHeaders([]);
    }
  }, [action.spreadsheetId]);

  // Load headers when sheet changes
  useEffect(() => {
    if (action.spreadsheetId && action.sheetName) {
      loadHeaders(action.spreadsheetId, action.sheetName);
    } else {
      setHeaders([]);
    }
  }, [action.spreadsheetId, action.sheetName]);

  const loadSheets = async (spreadsheetId) => {
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
    try {
      setLoading(prev => ({ ...prev, headers: true }));
      const { data } = await api.get(`/google-sheets/spreadsheets/${spreadsheetId}/headers?sheet=${encodeURIComponent(sheetName)}`);
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
      searchColumn: '',
      resultMappings: [],
    });
  };

  const handleSheetChange = (sheetName) => {
    onUpdate({
      sheetName,
      columnMappings: [],
      searchColumn: '',
      resultMappings: [],
    });
  };

  // Column mappings management
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
    onUpdate({ columnMappings: (action.columnMappings || []).filter((_, idx) => idx !== i) });
  };

  // Result mappings management (for search/read operations)
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
    onUpdate({ resultMappings: (action.resultMappings || []).filter((_, idx) => idx !== i) });
  };

  const operationInfo = OPERATIONS.find(op => op.id === action.operation);
  const needsWriteColumns = ['append_row', 'update_row', 'search_and_update', 'search_or_append'].includes(action.operation);
  const needsSearch = ['search_rows', 'search_and_update', 'search_or_append'].includes(action.operation);
  const needsRowIndex = ['update_row'].includes(action.operation);
  const needsResultMapping = ['search_rows', 'read_rows', 'search_and_update', 'search_or_append'].includes(action.operation);

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
          <span className="text-lg">{operationInfo?.icon || '📄'}</span>
          <span className="font-medium text-green-800 text-sm">
            {operationInfo?.label || 'פעולת Google Sheets'}
          </span>
          {action.spreadsheetName && (
            <span className="text-xs text-green-500 max-w-[120px] truncate">
              - {action.spreadsheetName}
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
                  onClick={() => onUpdate({ operation: op.id, columnMappings: [], resultMappings: [], searchColumn: '', searchValue: '' })}
                  className={`flex items-center gap-2 p-2.5 rounded-lg text-right border transition-all text-sm ${
                    action.operation === op.id
                      ? 'border-green-400 bg-green-50 text-green-800 shadow-sm'
                      : 'border-gray-200 hover:border-green-200 hover:bg-green-50/50 text-gray-600'
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

          {/* Spreadsheet Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">גיליון אלקטרוני</label>
              <button
                onClick={loadSpreadsheets}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                disabled={loading.spreadsheets}
              >
                <RefreshCw className={`w-3 h-3 ${loading.spreadsheets ? 'animate-spin' : ''}`} />
                רענן
              </button>
            </div>
            <select
              value={action.spreadsheetId || ''}
              onChange={(e) => handleSpreadsheetChange(e.target.value)}
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 focus:border-green-300"
            >
              <option value="">בחר גיליון...</option>
              {spreadsheets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {loading.spreadsheets && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                טוען גיליונות...
              </div>
            )}
          </div>

          {/* Sheet (Tab) Selection */}
          {action.spreadsheetId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">גיליון (טאב)</label>
              <select
                value={action.sheetName || ''}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 focus:border-green-300"
              >
                <option value="">בחר גיליון...</option>
                {sheets.map(s => (
                  <option key={s.sheetId} value={s.title}>{s.title}</option>
                ))}
              </select>
              {loading.sheets && (
                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  טוען...
                </div>
              )}
            </div>
          )}

          {/* Column Headers Preview */}
          {headers.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Table2 className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-600">עמודות ({headers.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {headers.map((h, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search Configuration */}
          {needsSearch && action.sheetName && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">הגדרות חיפוש</span>
              </div>
              
              <div>
                <label className="block text-xs text-blue-700 mb-1">עמודת חיפוש</label>
                <select
                  value={action.searchColumn || ''}
                  onChange={(e) => onUpdate({ searchColumn: e.target.value })}
                  className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">בחר עמודה...</option>
                  {headers.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs text-blue-700 mb-1">תנאי</label>
                <select
                  value={action.searchOperator || 'equals'}
                  onChange={(e) => onUpdate({ searchOperator: e.target.value })}
                  className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-300"
                >
                  {SEARCH_OPERATORS.map(op => (
                    <option key={op.id} value={op.id}>{op.label}</option>
                  ))}
                </select>
              </div>
              
              {!['not_empty', 'is_empty'].includes(action.searchOperator) && (
                <div>
                  <label className="block text-xs text-blue-700 mb-1">ערך חיפוש</label>
                  <TextInputWithVariables
                    value={action.searchValue || ''}
                    onChange={(val) => onUpdate({ searchValue: val })}
                    placeholder="ערך לחיפוש (ניתן להשתמש ב-{{משתנה}})"
                    className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              )}
            </div>
          )}

          {/* Row Index for Update */}
          {needsRowIndex && action.sheetName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר שורה</label>
              <TextInputWithVariables
                value={action.rowIndex || ''}
                onChange={(val) => onUpdate({ rowIndex: val })}
                placeholder="מספר שורה (2 = שורה ראשונה אחרי הכותרת)"
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300"
              />
              <p className="text-xs text-gray-400 mt-1">
                ניתן להשתמש במשתנה שהגדרת בחיפוש קודם (לדוגמה: {'{{row_index}}'})
              </p>
            </div>
          )}

          {/* Column Mappings (for write operations) */}
          {needsWriteColumns && action.sheetName && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">מיפוי עמודות</label>
                <button
                  onClick={addColumnMapping}
                  className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  הוסף
                </button>
              </div>
              
              {(action.columnMappings || []).length === 0 && (
                <div className="text-center py-3 text-gray-400 text-xs bg-gray-50 rounded-lg">
                  לחץ "הוסף" למיפוי עמודות לערכים
                </div>
              )}
              
              {(action.columnMappings || []).map((mapping, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                  <select
                    value={mapping.column || ''}
                    onChange={(e) => updateColumnMapping(i, { column: e.target.value })}
                    className="flex-1 p-1.5 border border-gray-200 rounded text-sm bg-white"
                  >
                    <option value="">עמודה...</option>
                    {headers.map((h, hi) => (
                      <option key={hi} value={h}>{h}</option>
                    ))}
                  </select>
                  <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <TextInputWithVariables
                    value={mapping.value || ''}
                    onChange={(val) => updateColumnMapping(i, { value: val })}
                    placeholder="ערך / {{משתנה}}"
                    className="flex-1 p-1.5 border border-gray-200 rounded text-sm"
                  />
                  <button
                    onClick={() => removeColumnMapping(i)}
                    className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Quick-add all columns button */}
              {headers.length > 0 && (action.columnMappings || []).length === 0 && (
                <button
                  onClick={() => {
                    onUpdate({
                      columnMappings: headers.map(h => ({ column: h, value: '' })),
                    });
                  }}
                  className="w-full text-xs text-green-600 hover:text-green-700 py-1.5 hover:bg-green-50 rounded-lg transition-colors"
                >
                  + הוסף את כל העמודות
                </button>
              )}
            </div>
          )}

          {/* Column Result Mappings (for read/search operations) */}
          {needsResultMapping && action.sheetName && (
            <div className="bg-purple-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">שמירת עמודות למשתנים</span>
                </div>
                <button
                  onClick={addResultMapping}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  הוסף
                </button>
              </div>
              
              <p className="text-xs text-purple-500">
                שמור ערכים מעמודות הגיליון למשתנים
              </p>
              
              {(action.resultMappings || []).map((mapping, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-purple-200">
                  <select
                    value={mapping.column || ''}
                    onChange={(e) => updateResultMapping(i, { column: e.target.value })}
                    className="flex-1 p-1.5 border border-purple-200 rounded text-xs bg-purple-50"
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
                  <input
                    type="text"
                    value={mapping.label || ''}
                    onChange={(e) => updateResultMapping(i, { label: e.target.value })}
                    placeholder="תווית (בעברית)"
                    className="flex-1 p-1.5 border border-purple-200 rounded text-xs"
                  />
                  <button
                    onClick={() => removeResultMapping(i)}
                    className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Built-in Results Mappings */}
          {action.sheetName && (
            <div className="bg-amber-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">שמירת תוצאות מובנות</span>
                </div>
                <button
                  onClick={() => {
                    const mappings = action.builtInMappings || [];
                    onUpdate({ builtInMappings: [...mappings, { field: 'found', varName: '', label: '' }] });
                  }}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  הוסף
                </button>
              </div>
              
              {(action.builtInMappings || []).length === 0 ? (
                <p className="text-xs text-amber-600">
                  לחץ "הוסף" לשמור תוצאות כמו נמצא/לא נמצא, מספר שורה וכו׳
                </p>
              ) : (
                <div className="space-y-2">
                  {(action.builtInMappings || []).map((mapping, mIndex) => (
                    <div key={mIndex} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-amber-200">
                      <select
                        value={mapping.field || ''}
                        onChange={(e) => {
                          const newMappings = [...(action.builtInMappings || [])];
                          newMappings[mIndex] = { ...newMappings[mIndex], field: e.target.value };
                          onUpdate({ builtInMappings: newMappings });
                        }}
                        className="flex-1 p-1.5 text-xs border border-amber-200 rounded-lg bg-amber-50"
                      >
                        <option value="">בחר שדה...</option>
                        {BUILTIN_FIELDS.map(f => (
                          <option key={f.id} value={f.id}>{f.label} ({f.description})</option>
                        ))}
                      </select>
                      <ArrowRight className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={mapping.varName || ''}
                        onChange={(e) => {
                          const newMappings = [...(action.builtInMappings || [])];
                          newMappings[mIndex] = { ...newMappings[mIndex], varName: e.target.value };
                          onUpdate({ builtInMappings: newMappings });
                        }}
                        placeholder="שם משתנה (באנגלית)"
                        className="flex-1 p-1.5 text-xs border border-amber-200 rounded-lg"
                        dir="ltr"
                      />
                      <input
                        type="text"
                        value={mapping.label || ''}
                        onChange={(e) => {
                          const newMappings = [...(action.builtInMappings || [])];
                          newMappings[mIndex] = { ...newMappings[mIndex], label: e.target.value };
                          onUpdate({ builtInMappings: newMappings });
                        }}
                        placeholder="תווית (בעברית)"
                        className="flex-1 p-1.5 text-xs border border-amber-200 rounded-lg"
                      />
                      <button
                        onClick={() => {
                          const newMappings = (action.builtInMappings || []).filter((_, i) => i !== mIndex);
                          onUpdate({ builtInMappings: newMappings });
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
                💡 שם משתנה באנגלית (לדוגמה: row_found) ותווית בעברית (לדוגמה: נמצאה שורה)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
