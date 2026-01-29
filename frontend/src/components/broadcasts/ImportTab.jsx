import { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle, AlertCircle, X,
  ArrowLeft, ArrowRight, Plus, Database, User, Phone,
  ChevronDown, Check, FileSpreadsheet, Users, Trash2
} from 'lucide-react';
import api from '../../services/api';

export default function ImportTab({ onRefresh }) {
  // Steps: 1=upload, 2=mapping, 3=importing, 4=done
  const [step, setStep] = useState(1);
  
  // File data
  const [fileData, setFileData] = useState(null);
  
  // Mapping
  const [mapping, setMapping] = useState({});
  const [variables, setVariables] = useState({ systemFields: [], userVariables: [] });
  const [audiences, setAudiences] = useState([]);
  const [targetAudience, setTargetAudience] = useState('');
  
  // New variable modal
  const [showNewVariable, setShowNewVariable] = useState(false);
  const [newVarColumn, setNewVarColumn] = useState(null);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');
  
  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [varsRes, audRes] = await Promise.all([
        api.get('/broadcasts/import/variables'),
        api.get('/broadcasts/audiences')
      ]);
      setVariables(varsRes.data);
      setAudiences(audRes.data.audiences?.filter(a => a.is_static) || []);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const { data } = await api.post('/broadcasts/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setFileData(data);
      
      // Auto-map obvious columns
      const autoMapping = {};
      data.columns.forEach(col => {
        const colLower = col.toLowerCase().trim();
        if (colLower.includes('טלפון') || colLower.includes('phone') || colLower.includes('נייד') || colLower.includes('סלולרי') || colLower === 'פלאפון') {
          autoMapping[col] = 'phone';
        } else if (colLower === 'שם' || colLower.includes('name') || colLower === 'שם מלא' || colLower === 'שם פרטי') {
          autoMapping[col] = 'name';
        }
      });
      setMapping(autoMapping);
      
      setStep(2);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהעלאת הקובץ');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMapColumn = (column, value) => {
    if (value === '__new__') {
      setNewVarColumn(column);
      setNewVarLabel(column);
      setNewVarKey(column.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^[0-9]/, '_'));
      setShowNewVariable(true);
    } else if (value === '') {
      const newMapping = { ...mapping };
      delete newMapping[column];
      setMapping(newMapping);
    } else {
      setMapping({ ...mapping, [column]: value });
    }
  };

  const handleCreateVariable = async () => {
    if (!newVarKey || !newVarLabel) return;
    
    try {
      const { data } = await api.post('/broadcasts/import/variables', {
        key: newVarKey,
        label: newVarLabel
      });
      
      // Add to variables list
      setVariables(prev => ({
        ...prev,
        userVariables: [...prev.userVariables, data.variable]
      }));
      
      // Map the column
      if (newVarColumn) {
        setMapping(prev => ({ ...prev, [newVarColumn]: data.variable.key }));
      }
      
      setShowNewVariable(false);
      setNewVarColumn(null);
      setNewVarKey('');
      setNewVarLabel('');
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת משתנה');
    }
  };

  const handleImport = async () => {
    if (!mapping.phone && !Object.values(mapping).includes('phone')) {
      alert('חובה למפות עמודת טלפון');
      return;
    }
    
    // Convert mapping format: { column: variable }
    const mappingForBackend = {};
    Object.entries(mapping).forEach(([col, varKey]) => {
      mappingForBackend[col] = varKey;
    });
    
    // Ensure phone is in mapping
    if (!Object.values(mappingForBackend).includes('phone')) {
      alert('חובה למפות עמודת טלפון');
      return;
    }
    
    try {
      setImporting(true);
      setStep(3);
      
      const { data } = await api.post('/broadcasts/import/execute', {
        file_path: fileData.file_path,
        mapping: mappingForBackend,
        audience_id: targetAudience || null
      });
      
      setImportResult(data);
      setStep(4);
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בייבוא');
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = async () => {
    if (fileData?.file_path) {
      try {
        await api.post('/broadcasts/import/cancel', { file_path: fileData.file_path });
      } catch {}
    }
    
    setStep(1);
    setFileData(null);
    setMapping({});
    setTargetAudience('');
    setImportResult(null);
  };

  const isPhoneMapped = Object.values(mapping).includes('phone');
  const allVariables = [
    ...variables.systemFields,
    ...variables.userVariables.map(v => ({ ...v, isSystem: false }))
  ];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[
          { num: 1, label: 'העלאת קובץ' },
          { num: 2, label: 'מיפוי שדות' },
          { num: 3, label: 'ייבוא' },
          { num: 4, label: 'סיום' }
        ].map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
              step === s.num 
                ? 'bg-orange-600 text-white shadow-lg' 
                : step > s.num 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {step > s.num ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <span className="w-5 h-5 flex items-center justify-center text-sm font-bold">{s.num}</span>
              )}
              <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
            </div>
            {i < 3 && <div className={`w-8 h-0.5 mx-1 ${step > s.num ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-lg">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">העלה קובץ אנשי קשר</h3>
            <p className="text-gray-500 mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
            <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4" />
                Excel (.xlsx, .xls)
              </span>
              <span>או</span>
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                CSV
              </span>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              טיפים לייבוא מוצלח
            </h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>הקובץ חייב לכלול שורת כותרות בראש</li>
              <li>עמודת מספר טלפון היא חובה</li>
              <li>פורמטים נתמכים: 0501234567, +972501234567, 972501234567</li>
              <li>אנשי קשר קיימים יתעדכנו (לא ישוכפלו)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 2 && fileData && (
        <div className="space-y-6">
          {/* File Info */}
          <div className="flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">{fileData.file_name}</div>
                <div className="text-sm text-gray-500">
                  {fileData.columns.length} עמודות • {fileData.total_rows} שורות
                </div>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="בחר קובץ אחר"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mapping Status */}
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${
            isPhoneMapped 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            {isPhoneMapped ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-800 font-medium">עמודת טלפון ממופה - ניתן להמשיך</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-800 font-medium">חובה למפות עמודת מספר טלפון</span>
              </>
            )}
          </div>

          {/* Data Table with Mapping */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  {/* Mapping Row */}
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-12">#</th>
                    {fileData.columns.map((col, i) => (
                      <th key={i} className="px-4 py-3 min-w-[180px]">
                        <MappingDropdown
                          column={col}
                          value={mapping[col] || ''}
                          variables={allVariables}
                          onChange={(val) => handleMapColumn(col, val)}
                        />
                      </th>
                    ))}
                  </tr>
                  {/* Headers Row */}
                  <tr className="bg-white border-b border-gray-100">
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-400"></th>
                    {fileData.columns.map((col, i) => (
                      <th key={i} className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-h-[350px] overflow-y-auto">
                  {fileData.rows.slice(0, 15).map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">{rowIdx + 1}</td>
                      {fileData.columns.map((col, colIdx) => (
                        <td key={colIdx} className="px-4 py-2.5 text-sm text-gray-700">
                          {row[colIdx] || <span className="text-gray-300">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fileData.rows.length > 15 && (
              <div className="bg-gray-50 px-4 py-2 text-center text-sm text-gray-500 border-t border-gray-200">
                מציג 15 מתוך {fileData.total_rows} שורות
              </div>
            )}
          </div>

          {/* Target Audience */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline ml-1" />
              הוסף לקהל (אופציונלי)
            </label>
            <select
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">ללא - ייבוא כאנשי קשר בלבד</option>
              {audiences.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.contacts_count || 0} אנשי קשר)</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleReset}
              className="flex-1 px-6 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              בחר קובץ אחר
            </button>
            <button
              onClick={handleImport}
              disabled={!isPhoneMapped}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl hover:from-orange-700 hover:to-orange-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25"
            >
              ייבא {fileData.total_rows} אנשי קשר
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 3 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-orange-600 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">מייבא אנשי קשר...</h3>
          <p className="text-gray-500">זה יכול לקחת כמה שניות</p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && importResult && (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">הייבוא הושלם!</h3>
          
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto my-8">
            <div className="bg-green-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-green-600">{importResult.stats.imported}</div>
              <div className="text-sm text-green-700">נוספו חדשים</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-blue-600">{importResult.stats.updated}</div>
              <div className="text-sm text-blue-700">עודכנו</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-red-600">{importResult.stats.errors}</div>
              <div className="text-sm text-red-700">שגיאות</div>
            </div>
          </div>

          {importResult.errors?.length > 0 && (
            <div className="max-w-lg mx-auto mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-right">
                <h4 className="font-medium text-red-900 mb-2">שגיאות ({importResult.errors.length})</h4>
                <div className="max-h-32 overflow-y-auto text-sm text-red-700 space-y-1">
                  {importResult.errors.map((err, i) => (
                    <div key={i}>שורה {err.row}: {err.error}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <button
            onClick={handleReset}
            className="px-8 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl hover:from-orange-700 hover:to-orange-800 font-medium shadow-lg shadow-orange-500/25"
          >
            ייבוא נוסף
          </button>
        </div>
      )}

      {/* New Variable Modal */}
      {showNewVariable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewVariable(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">יצירת משתנה חדש</h3>
            <p className="text-sm text-gray-500 mb-4">
              המשתנה יתווסף לרשימת המשתנים שלך ויהיה זמין גם בבוטים.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם לתצוגה (עברית)</label>
                <input
                  type="text"
                  value={newVarLabel}
                  onChange={(e) => setNewVarLabel(e.target.value)}
                  placeholder="לדוגמה: עיר מגורים"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם משתנה (אנגלית)</label>
                <input
                  type="text"
                  value={newVarKey}
                  onChange={(e) => setNewVarKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="לדוגמה: city"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 font-mono"
                  dir="ltr"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ישמש בבוטים כ: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{`{{${newVarKey || 'variable'}}}`}</code>
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewVariable(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleCreateVariable}
                disabled={!newVarKey || !newVarLabel}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium disabled:opacity-50"
              >
                צור משתנה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Mapping Dropdown Component
// =============================================
function MappingDropdown({ column, value, variables, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedVar = variables.find(v => v.key === value);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
          value 
            ? 'bg-green-50 border-green-300 text-green-800' 
            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {value ? (
            <>
              {selectedVar?.isSystem ? <Database className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : <User className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
              <span className="truncate">{selectedVar?.label || value}</span>
            </>
          ) : (
            'בחר משתנה...'
          )}
        </span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
            {/* None option */}
            <button
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="w-full text-right px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              לא למפות
            </button>
            
            <div className="border-t border-gray-100" />
            
            {/* System fields */}
            <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 font-medium">שדות מערכת</div>
            {variables.filter(v => v.isSystem).map(v => (
              <button
                key={v.key}
                onClick={() => { onChange(v.key); setIsOpen(false); }}
                className={`w-full text-right px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-blue-50 ${
                  value === v.key ? 'bg-blue-50 text-blue-700' : ''
                }`}
              >
                {value === v.key && <Check className="w-4 h-4 text-blue-600" />}
                <Database className="w-4 h-4 text-blue-500" />
                <span className="flex-1">{v.label}</span>
                {v.required && <span className="text-xs text-red-500">חובה</span>}
              </button>
            ))}
            
            {/* User variables */}
            {variables.filter(v => !v.isSystem).length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 font-medium">משתנים שלי</div>
                {variables.filter(v => !v.isSystem).map(v => (
                  <button
                    key={v.key}
                    onClick={() => { onChange(v.key); setIsOpen(false); }}
                    className={`w-full text-right px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-purple-50 ${
                      value === v.key ? 'bg-purple-50 text-purple-700' : ''
                    }`}
                  >
                    {value === v.key && <Check className="w-4 h-4 text-purple-600" />}
                    <User className="w-4 h-4 text-purple-500" />
                    <span className="flex-1">{v.label}</span>
                  </button>
                ))}
              </>
            )}
            
            <div className="border-t border-gray-100" />
            
            {/* Create new */}
            <button
              onClick={() => { onChange('__new__'); setIsOpen(false); }}
              className="w-full text-right px-4 py-2.5 text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              צור משתנה חדש
            </button>
          </div>
        </>
      )}
    </div>
  );
}
