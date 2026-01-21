import { useState, useEffect } from 'react';
import { Shield, Plus, X, Play, Check, AlertCircle, ChevronDown, ChevronUp, Trash2, Settings, Globe, Code } from 'lucide-react';
import api from '../../../../services/api';

const comparisonOptions = [
  { id: 'equals', label: 'שווה ל', icon: '=' },
  { id: 'not_equals', label: 'לא שווה ל', icon: '≠' },
  { id: 'contains', label: 'מכיל', icon: '⊃' },
  { id: 'not_contains', label: 'לא מכיל', icon: '⊄' },
  { id: 'starts_with', label: 'מתחיל ב', icon: '→' },
  { id: 'ends_with', label: 'נגמר ב', icon: '←' },
  { id: 'greater_than', label: 'גדול מ', icon: '>' },
  { id: 'greater_equal', label: 'גדול או שווה', icon: '≥' },
  { id: 'less_than', label: 'קטן מ', icon: '<' },
  { id: 'less_equal', label: 'קטן או שווה', icon: '≤' },
  { id: 'exists', label: 'קיים', icon: '∃' },
  { id: 'not_exists', label: 'לא קיים', icon: '∄' },
  { id: 'is_empty', label: 'ריק', icon: '∅' },
  { id: 'not_empty', label: 'לא ריק', icon: '≠∅' },
  { id: 'is_true', label: 'אמת (true)', icon: '✓' },
  { id: 'is_false', label: 'שקר (false)', icon: '✗' },
  { id: 'regex', label: 'ביטוי רגולרי', icon: '.*' },
];

const pathSourceOptions = [
  { id: 'specific', label: 'נתיב ספציפי' },
  { id: 'full', label: 'התגובה המלאה (data)' },
];

export default function ValidationSelector({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [validations, setValidations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  
  // Form state for creating/editing validation
  const [form, setForm] = useState({
    name: '',
    description: '',
    apiUrl: '',
    apiMethod: 'GET',
    apiHeaders: '{}',
    apiBody: '',
    pathSource: 'specific', // 'specific' or 'full'
    responsePath: '',
    expectedValue: '',
    comparison: 'equals',
  });
  
  useEffect(() => {
    if (isOpen) {
      loadValidations();
    }
  }, [isOpen]);
  
  const loadValidations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/validations');
      setValidations(res.data.validations || []);
    } catch (err) {
      console.error('Error loading validations:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSelect = (validation) => {
    onChange({ validationId: validation.id, validationName: validation.name });
    setIsOpen(false);
  };
  
  const handleClear = (e) => {
    e?.stopPropagation();
    onChange(null);
  };
  
  const handleCreateNew = async () => {
    if (!form.name || !form.apiUrl) {
      alert('נא למלא שם ו-URL');
      return;
    }
    if (form.pathSource === 'specific' && !form.responsePath) {
      alert('נא להזין נתיב בתגובה');
      return;
    }
    
    try {
      if (editingId) {
        const res = await api.put(`/validations/${editingId}`, form);
        setValidations(validations.map(v => v.id === editingId ? res.data.validation : v));
      } else {
        const res = await api.post('/validations', form);
        setValidations([...validations, res.data.validation]);
      }
      setShowCreate(false);
      setEditingId(null);
      resetForm();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירת אימות');
    }
  };
  
  const handleEdit = (validation) => {
    setForm({
      name: validation.name || '',
      description: validation.description || '',
      apiUrl: validation.api_url || '',
      apiMethod: validation.api_method || 'GET',
      apiHeaders: JSON.stringify(validation.api_headers || {}),
      apiBody: validation.api_body || '',
      pathSource: validation.path_source || (validation.response_path ? 'specific' : 'full'),
      responsePath: validation.response_path || '',
      expectedValue: validation.expected_value || '',
      comparison: validation.comparison || 'equals',
    });
    setEditingId(validation.id);
    setShowCreate(true);
  };
  
  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      
      const res = await api.post('/validations/test', form);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };
  
  const handleDelete = async (id) => {
    if (!confirm('למחוק את האימות?')) return;
    
    try {
      await api.delete(`/validations/${id}`);
      setValidations(validations.filter(v => v.id !== id));
      if (value?.validationId === id) {
        onChange(null);
      }
    } catch (err) {
      alert('שגיאה במחיקה');
    }
  };
  
  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      apiUrl: '',
      apiMethod: 'GET',
      apiHeaders: '{}',
      apiBody: '',
      pathSource: 'specific',
      responsePath: '',
      expectedValue: '',
      comparison: 'equals',
    });
    setTestResult(null);
    setEditingId(null);
  };
  
  const selectedValidation = validations.find(v => v.id === value?.validationId);
  
  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          value?.validationId 
            ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md hover:shadow-lg' 
            : 'bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-600 border border-gray-200 hover:border-purple-200'
        }`}
      >
        <Shield className="w-3.5 h-3.5" />
        {value?.validationId ? (selectedValidation?.name || value.validationName || 'אימות') : 'הוסף אימות'}
        {value?.validationId && (
          <X 
            className="w-3 h-3 hover:scale-125 transition-transform" 
            onClick={handleClear}
          />
        )}
      </button>
      
      {/* Full Screen Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">
                    {showCreate ? (editingId ? 'עריכת אימות' : 'יצירת אימות חדש') : 'ניהול אימותים'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {showCreate ? 'הגדר קריאת API ותנאי להצגת הרכיב' : 'בחר אימות קיים או צור חדש'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setIsOpen(false); setShowCreate(false); resetForm(); }}
                className="p-2 hover:bg-white/70 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto">
              {showCreate ? (
                <CreateValidationForm 
                  form={form}
                  setForm={setForm}
                  onSave={handleCreateNew}
                  onCancel={() => { setShowCreate(false); resetForm(); }}
                  onTest={handleTest}
                  testing={testing}
                  testResult={testResult}
                  isEditing={!!editingId}
                />
              ) : (
                <div className="p-6">
                  {/* Validation List */}
                  {loading ? (
                    <div className="py-16 text-center">
                      <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="mt-4 text-gray-500">טוען אימותים...</p>
                    </div>
                  ) : validations.length === 0 ? (
                    <div className="py-16 text-center">
                      <div className="w-20 h-20 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-10 h-10 text-purple-300" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">אין אימותים</h3>
                      <p className="text-gray-500 mb-6">צור אימות API כדי לסנן רכיבים דינמית</p>
                      <button
                        onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
                      >
                        <Plus className="w-5 h-5" />
                        צור אימות ראשון
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Create New Button */}
                      <button
                        onClick={() => setShowCreate(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-purple-200 rounded-xl text-purple-600 hover:bg-purple-50 hover:border-purple-300 transition-all"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="font-medium">צור אימות חדש</span>
                      </button>
                      
                      {/* Validation Cards */}
                      {validations.map(validation => (
                        <div 
                          key={validation.id}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                            value?.validationId === validation.id 
                              ? 'border-purple-500 bg-purple-50 shadow-md' 
                              : 'border-gray-200 hover:border-purple-200 hover:bg-gray-50'
                          }`}
                          onClick={() => handleSelect(validation)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                value?.validationId === validation.id 
                                  ? 'bg-purple-500 text-white' 
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                <Globe className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-gray-800">{validation.name}</h4>
                                {validation.description && (
                                  <p className="text-sm text-gray-500 mt-0.5">{validation.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    validation.api_method === 'GET' ? 'bg-green-100 text-green-700' :
                                    validation.api_method === 'POST' ? 'bg-blue-100 text-blue-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {validation.api_method}
                                  </span>
                                  <span className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                                    {validation.api_url}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => handleEdit(validation)}
                                className="p-2 hover:bg-blue-100 rounded-lg text-blue-600 transition-colors"
                                title="עריכה"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(validation.id)}
                                className="p-2 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
                                title="מחיקה"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Condition Preview */}
                          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                            <Code className="w-3.5 h-3.5" />
                            <span className="font-mono">{validation.response_path}</span>
                            <span className="px-1.5 py-0.5 bg-gray-200 rounded">
                              {comparisonOptions.find(c => c.id === validation.comparison)?.icon || '='}
                            </span>
                            <span className="font-mono">{validation.expected_value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Footer */}
            {!showCreate && validations.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  {value?.validationId ? `נבחר: ${selectedValidation?.name || 'אימות'}` : 'לחץ על אימות לבחירה'}
                </p>
                <div className="flex gap-2">
                  {value?.validationId && (
                    <button
                      onClick={handleClear}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
                    >
                      הסר אימות
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium"
                  >
                    סגור
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Form for creating new validation
function CreateValidationForm({ form, setForm, onSave, onCancel, onTest, testing, testResult, isEditing }) {
  const [showHeaders, setShowHeaders] = useState(false);
  
  return (
    <div className="p-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - API Configuration */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
            הגדרת קריאת API
          </h3>
          
          {/* Name & Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">שם האימות *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="בדיקת זכאות"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">תיאור</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="בדיקת זכאות למבצע"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
              />
            </div>
          </div>
          
          {/* Method & URL */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Method & URL *</label>
            <div className="flex gap-2">
              <select
                value={form.apiMethod}
                onChange={(e) => setForm({ ...form, apiMethod: e.target.value })}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
              <input
                type="text"
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                placeholder="https://api.example.com/check?phone={{contact_phone}}"
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                dir="ltr"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">ניתן להשתמש במשתנים: {'{{contact_phone}}'}, {'{{name}}'}</p>
          </div>
          
          {/* Headers */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHeaders(!showHeaders)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
            >
              <span>Headers (אופציונלי)</span>
              {showHeaders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showHeaders && (
              <div className="p-4">
                <textarea
                  value={form.apiHeaders}
                  onChange={(e) => setForm({ ...form, apiHeaders: e.target.value })}
                  placeholder='{"Authorization": "Bearer xxx", "Content-Type": "application/json"}'
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none h-20"
                  dir="ltr"
                />
              </div>
            )}
          </div>
          
          {/* Body for POST */}
          {['POST', 'PUT', 'PATCH'].includes(form.apiMethod) && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">גוף הבקשה (Body)</label>
              <textarea
                value={form.apiBody}
                onChange={(e) => setForm({ ...form, apiBody: e.target.value })}
                placeholder='{"phone": "{{contact_phone}}"}'
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none h-24"
                dir="ltr"
              />
            </div>
          )}
        </div>
        
        {/* Right Column - Condition */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
            תנאי להצגה
          </h3>
          
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-sm text-indigo-700 mb-4">הרכיב יוצג רק אם התנאי מתקיים</p>
            
            {/* Path Source Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">מקור הערך לבדיקה</label>
              <div className="flex gap-2">
                {pathSourceOptions.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm({ ...form, pathSource: opt.id, responsePath: opt.id === 'full' ? '' : form.responsePath })}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      form.pathSource === opt.id
                        ? 'bg-indigo-500 text-white shadow-md'
                        : 'bg-white border border-indigo-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Response Path - only if specific path selected */}
            {form.pathSource === 'specific' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">נתיב בתגובה *</label>
                <input
                  type="text"
                  value={form.responsePath}
                  onChange={(e) => setForm({ ...form, responsePath: e.target.value })}
                  placeholder="data.isEligible או status או data[0].name"
                  className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                  dir="ltr"
                />
                <p className="text-xs text-gray-400 mt-1">לדוגמא: data.user.isActive, items[0].status</p>
              </div>
            )}
            
            {form.pathSource === 'full' && (
              <div className="mb-4 p-3 bg-white/50 rounded-lg border border-indigo-100">
                <p className="text-xs text-indigo-600">הערך יהיה כל התגובה (ה-data המלא) כטקסט או JSON</p>
              </div>
            )}
            
            {/* Comparison */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">השוואה</label>
                <select
                  value={form.comparison}
                  onChange={(e) => setForm({ ...form, comparison: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                >
                  {comparisonOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.icon} {opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  ערך צפוי {form.comparison === 'regex' && '(ביטוי רגולרי)'}
                </label>
                <input
                  type="text"
                  value={form.expectedValue}
                  onChange={(e) => setForm({ ...form, expectedValue: e.target.value })}
                  placeholder={form.comparison === 'regex' ? '^[0-9]+$' : 'true'}
                  className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                  disabled={['exists', 'not_exists', 'is_true', 'is_false', 'is_empty', 'not_empty'].includes(form.comparison)}
                  dir="ltr"
                />
              </div>
            </div>
          </div>
          
          {/* Test Button */}
          <button
            onClick={onTest}
            disabled={testing || !form.apiUrl}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {testing ? 'בודק...' : 'בדיקת קריאה'}
          </button>
          
          {/* Test Result */}
          {testResult && (
            <div className={`p-4 rounded-xl ${
              testResult.passed 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center gap-2 font-medium mb-2">
                {testResult.passed ? (
                  <>
                    <Check className="w-5 h-5 text-green-600" />
                    <span className="text-green-700">האימות עבר בהצלחה!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-red-700">האימות נכשל</span>
                  </>
                )}
              </div>
              {testResult.extractedValue !== undefined && (
                <div className="text-sm opacity-80">
                  <span className="text-gray-600">ערך שהתקבל: </span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded">{String(testResult.extractedValue)}</span>
                </div>
              )}
              {testResult.error && (
                <div className="text-sm text-red-600 mt-1">{testResult.error}</div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
        <button
          onClick={onSave}
          className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl text-sm font-medium shadow-lg hover:shadow-xl transition-all"
        >
          {isEditing ? 'עדכן אימות' : 'צור אימות'}
        </button>
      </div>
    </div>
  );
}
