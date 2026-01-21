import { useState, useEffect } from 'react';
import { Shield, Plus, X, Play, Check, AlertCircle, ChevronDown, Trash2, Edit2 } from 'lucide-react';
import api from '../../../../services/api';

const comparisonOptions = [
  { id: 'equals', label: 'שווה ל' },
  { id: 'not_equals', label: 'לא שווה ל' },
  { id: 'contains', label: 'מכיל' },
  { id: 'greater_than', label: 'גדול מ' },
  { id: 'less_than', label: 'קטן מ' },
  { id: 'exists', label: 'קיים' },
  { id: 'not_exists', label: 'לא קיים' },
  { id: 'is_true', label: 'אמת (true)' },
  { id: 'is_false', label: 'שקר (false)' },
];

export default function ValidationSelector({ value, onChange, buttonMode = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [validations, setValidations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
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
  
  const handleClear = () => {
    onChange(null);
  };
  
  const handleCreateNew = async () => {
    if (!form.name || !form.apiUrl || !form.responsePath) {
      alert('נא למלא את כל השדות הנדרשים');
      return;
    }
    
    try {
      const res = await api.post('/validations', form);
      setValidations([...validations, res.data.validation]);
      handleSelect(res.data.validation);
      setShowCreate(false);
      resetForm();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה ביצירת אימות');
    }
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
      responsePath: '',
      expectedValue: '',
      comparison: 'equals',
    });
    setTestResult(null);
  };
  
  const selectedValidation = validations.find(v => v.id === value?.validationId);
  
  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
          value?.validationId 
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
      >
        <Shield className="w-3.5 h-3.5" />
        {value?.validationId ? (selectedValidation?.name || 'אימות') : 'אימות'}
        {value?.validationId && (
          <X 
            className="w-3 h-3 hover:text-red-500" 
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
          />
        )}
      </button>
      
      {/* Dropdown Modal */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="bg-purple-50 px-4 py-3 border-b border-purple-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-purple-900">בחר אימות</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {showCreate ? (
              <CreateValidationForm 
                form={form}
                setForm={setForm}
                onSave={handleCreateNew}
                onCancel={() => { setShowCreate(false); resetForm(); }}
                onTest={handleTest}
                testing={testing}
                testResult={testResult}
              />
            ) : (
              <>
                {/* Validation List */}
                {loading ? (
                  <div className="p-4 text-center text-gray-500">טוען...</div>
                ) : validations.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>אין אימותים</p>
                    <p className="text-xs">צור אימות חדש</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {validations.map(validation => (
                      <div 
                        key={validation.id}
                        className={`p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between group ${
                          value?.validationId === validation.id ? 'bg-purple-50' : ''
                        }`}
                        onClick={() => handleSelect(validation)}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 text-sm">{validation.name}</div>
                          {validation.description && (
                            <div className="text-xs text-gray-500">{validation.description}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5 font-mono truncate">
                            {validation.api_url?.substring(0, 40)}...
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(validation.id); }}
                            className="p-1 hover:bg-red-100 rounded text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Create New Button */}
                <div className="p-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    צור אימות חדש
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Form for creating new validation
function CreateValidationForm({ form, setForm, onSave, onCancel, onTest, testing, testResult }) {
  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">שם האימות *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="בדיקת זכאות"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        />
      </div>
      
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">תיאור</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="בדיקת זכאות למבצע"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        />
      </div>
      
      <div className="flex gap-2">
        <div className="w-24">
          <label className="block text-xs font-medium text-gray-600 mb-1">שיטה</label>
          <select
            value={form.apiMethod}
            onChange={(e) => setForm({ ...form, apiMethod: e.target.value })}
            className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">כתובת API *</label>
          <input
            type="text"
            value={form.apiUrl}
            onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
            placeholder="https://api.example.com/check?phone={{contact_phone}}"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
            dir="ltr"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">כותרות (Headers - JSON)</label>
        <input
          type="text"
          value={form.apiHeaders}
          onChange={(e) => setForm({ ...form, apiHeaders: e.target.value })}
          placeholder='{"Authorization": "Bearer xxx"}'
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
          dir="ltr"
        />
      </div>
      
      {['POST', 'PUT', 'PATCH'].includes(form.apiMethod) && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">גוף הבקשה (Body)</label>
          <textarea
            value={form.apiBody}
            onChange={(e) => setForm({ ...form, apiBody: e.target.value })}
            placeholder='{"phone": "{{contact_phone}}"}'
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono h-16"
            dir="ltr"
          />
        </div>
      )}
      
      <div className="pt-2 border-t border-gray-100">
        <label className="block text-xs font-medium text-purple-600 mb-2">תנאי להצגה</label>
        
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">נתיב בתגובה *</label>
            <input
              type="text"
              value={form.responsePath}
              onChange={(e) => setForm({ ...form, responsePath: e.target.value })}
              placeholder="data.isEligible"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
              dir="ltr"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 mb-1">השוואה</label>
            <select
              value={form.comparison}
              onChange={(e) => setForm({ ...form, comparison: e.target.value })}
              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            >
              {comparisonOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs text-gray-500 mb-1">ערך</label>
            <input
              type="text"
              value={form.expectedValue}
              onChange={(e) => setForm({ ...form, expectedValue: e.target.value })}
              placeholder="true"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              disabled={['exists', 'not_exists', 'is_true', 'is_false'].includes(form.comparison)}
            />
          </div>
        </div>
      </div>
      
      {/* Test Result */}
      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.passed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <div className="flex items-center gap-2 font-medium">
            {testResult.passed ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {testResult.passed ? 'האימות עבר בהצלחה!' : 'האימות נכשל'}
          </div>
          {testResult.extractedValue !== undefined && (
            <div className="text-xs mt-1 opacity-75">
              ערך שהתקבל: <span className="font-mono">{String(testResult.extractedValue)}</span>
            </div>
          )}
          {testResult.error && (
            <div className="text-xs mt-1">{testResult.error}</div>
          )}
        </div>
      )}
      
      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
        >
          ביטול
        </button>
        <button
          onClick={onTest}
          disabled={testing || !form.apiUrl}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm flex items-center gap-1"
        >
          <Play className="w-3.5 h-3.5" />
          {testing ? 'בודק...' : 'בדיקה'}
        </button>
        <button
          onClick={onSave}
          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
        >
          שמור
        </button>
      </div>
    </div>
  );
}
