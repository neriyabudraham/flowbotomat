import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle, AlertCircle, X,
  ArrowLeft, ArrowRight, Plus, User, Phone, Users,
  ChevronLeft, ChevronRight, Globe, AlertTriangle,
  FileSpreadsheet, ExternalLink, History, Clock, Edit2, Save, RotateCcw
} from 'lucide-react';
import api from '../../services/api';

const COUNTRY_CODES = [
  { code: '972', label: 'ישראל (+972)', flag: '🇮🇱' },
  { code: '1', label: 'ארה"ב (+1)', flag: '🇺🇸' },
  { code: '44', label: 'בריטניה (+44)', flag: '🇬🇧' },
  { code: '49', label: 'גרמניה (+49)', flag: '🇩🇪' },
  { code: '33', label: 'צרפת (+33)', flag: '🇫🇷' },
];

// =============================================
// Import Result View Component
// =============================================
function ImportResultView({ importResult, importName, onReset, defaultCountryCode }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [editingErrors, setEditingErrors] = useState([...( importResult.errors || [])]);
  const [savingContact, setSavingContact] = useState(null);
  const [savedContacts, setSavedContacts] = useState([]);

  const formatPhoneForSave = (phone, countryCode = defaultCountryCode) => {
    if (!phone) return null;
    let clean = String(phone).replace(/[^\d+]/g, '');
    if (clean.startsWith('+')) clean = clean.substring(1);
    if (clean.startsWith('0')) clean = countryCode + clean.substring(1);
    else if (clean.length >= 9 && clean.length <= 10) {
      const startsWithCode = ['972', '1', '44', '49', '33', '7', '86', '91'].some(code => clean.startsWith(code));
      if (!startsWithCode) clean = countryCode + clean;
    }
    return clean;
  };

  const handleEditError = (index, field, value) => {
    const newErrors = [...editingErrors];
    if (!newErrors[index].data) newErrors[index].data = {};
    newErrors[index].data[field] = value;
    setEditingErrors(newErrors);
  };

  const handleSaveErrorContact = async (err, index) => {
    if (!err.data?.phone) {
      alert('חובה להזין מספר טלפון');
      return;
    }

    const phone = formatPhoneForSave(err.data.phone);
    if (!phone || !/^\d{10,15}$/.test(phone)) {
      alert('מספר טלפון לא תקין');
      return;
    }

    setSavingContact(index);
    try {
      // Create or update contact
      const { data } = await api.post('/contacts/create-or-update', {
        phone,
        display_name: err.data.name || null,
        variables: Object.entries(err.data || {})
          .filter(([key]) => key !== 'phone' && key !== 'name')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
      });

      // Mark as saved
      setSavedContacts([...savedContacts, index]);
      
      // Remove from errors
      const newErrors = editingErrors.filter((_, i) => i !== index);
      setEditingErrors(newErrors);

    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשמירת איש קשר');
    } finally {
      setSavingContact(null);
    }
  };

  const tabs = [
    { id: 'summary', label: 'סיכום', count: null },
    { id: 'imported', label: 'נוספו', count: importResult.stats?.imported || 0, color: 'green' },
    { id: 'updated', label: 'עודכנו', count: importResult.stats?.updated || 0, color: 'blue' },
    { id: 'errors', label: 'שגיאות', count: editingErrors.length, color: 'red' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`border rounded-2xl p-6 ${
        importResult.hadError 
          ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200'
          : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'
      }`}>
        <div className="text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
            importResult.hadError ? 'bg-orange-100' : 'bg-green-100'
          }`}>
            {importResult.hadError ? (
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            ) : (
              <CheckCircle className="w-8 h-8 text-green-600" />
            )}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            {importResult.hadError ? 'הייבוא הסתיים עם שגיאות' : 'הייבוא הושלם!'}
          </h3>
          <p className="text-gray-600 text-sm">{importName}</p>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mt-6">
          <button 
            onClick={() => setActiveTab('imported')}
            className={`bg-white rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow ${activeTab === 'imported' ? 'ring-2 ring-green-500' : ''}`}
          >
            <div className="text-2xl font-bold text-green-600">{importResult.stats?.imported?.toLocaleString() || 0}</div>
            <div className="text-xs text-gray-600">נוספו חדשים</div>
          </button>
          <button 
            onClick={() => setActiveTab('updated')}
            className={`bg-white rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow ${activeTab === 'updated' ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="text-2xl font-bold text-blue-600">{importResult.stats?.updated?.toLocaleString() || 0}</div>
            <div className="text-xs text-gray-600">עודכנו</div>
          </button>
          <button 
            onClick={() => setActiveTab('errors')}
            className={`bg-white rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow ${activeTab === 'errors' ? 'ring-2 ring-red-500' : ''}`}
          >
            <div className="text-2xl font-bold text-red-600">{editingErrors.length}</div>
            <div className="text-xs text-gray-600">שגיאות</div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={onReset}
            className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-medium flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            ייבוא נוסף
          </button>
        </div>
      </div>

      {/* Tabs Content */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={`mr-1 px-1.5 py-0.5 rounded-full text-xs ${
                  tab.color === 'green' ? 'bg-green-100 text-green-700' :
                  tab.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                  tab.color === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="text-center py-8">
              <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">
                סה"כ {importResult.stats?.total?.toLocaleString() || 0} שורות עובדו
              </p>
              <p className="text-sm text-gray-500">
                לחץ על הטאבים למעלה לצפייה בפרטים
              </p>
            </div>
          )}

          {/* Imported Tab */}
          {activeTab === 'imported' && (
            <div>
              {(importResult.importedContacts?.length || 0) === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>לא נוספו אנשי קשר חדשים</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {importResult.importedContacts.map((contact, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{contact.name || 'ללא שם'}</div>
                        <div className="text-sm text-gray-500 font-mono">{contact.phone}</div>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    </div>
                  ))}
                  {importResult.stats?.imported > 50 && (
                    <p className="text-center text-sm text-gray-500 py-2">
                      מציג 50 מתוך {importResult.stats.imported.toLocaleString()} אנשי קשר שנוספו
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Updated Tab */}
          {activeTab === 'updated' && (
            <div>
              {(importResult.updatedContacts?.length || 0) === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>לא עודכנו אנשי קשר</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {importResult.updatedContacts.map((contact, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{contact.name || 'ללא שם'}</div>
                        <div className="text-sm text-gray-500 font-mono">{contact.phone}</div>
                      </div>
                      <Edit2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    </div>
                  ))}
                  {importResult.stats?.updated > 50 && (
                    <p className="text-center text-sm text-gray-500 py-2">
                      מציג 50 מתוך {importResult.stats.updated.toLocaleString()} אנשי קשר שעודכנו
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Errors Tab */}
          {activeTab === 'errors' && (
            <div>
              {editingErrors.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
                  <p>אין שגיאות!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  <p className="text-sm text-gray-600 mb-3">
                    ניתן לערוך את הנתונים ולשמור כדי ליצור את אנשי הקשר
                  </p>
                  {editingErrors.map((err, i) => (
                    <div key={i} className="border border-red-200 rounded-lg p-4 bg-red-50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                          שורה {err.row}
                        </span>
                        <span className="text-red-600 text-sm">{err.error}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">מספר טלפון *</label>
                          <input
                            type="text"
                            value={err.data?.phone || ''}
                            onChange={(e) => handleEditError(i, 'phone', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white"
                            dir="ltr"
                            placeholder="0501234567"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">שם</label>
                          <input
                            type="text"
                            value={err.data?.name || ''}
                            onChange={(e) => handleEditError(i, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            placeholder="שם מלא"
                          />
                        </div>
                      </div>
                      
                      {/* Show other fields if exist */}
                      {err.data && Object.keys(err.data).filter(k => k !== 'phone' && k !== 'name').length > 0 && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          {Object.entries(err.data)
                            .filter(([key]) => key !== 'phone' && key !== 'name')
                            .map(([key, value]) => (
                              <div key={key}>
                                <label className="block text-xs text-gray-600 mb-1">{key}</label>
                                <input
                                  type="text"
                                  value={value || ''}
                                  onChange={(e) => handleEditError(i, key, e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                />
                              </div>
                            ))}
                        </div>
                      )}
                      
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={() => handleSaveErrorContact(err, i)}
                          disabled={savingContact === i}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                        >
                          {savingContact === i ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          שמור איש קשר
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImportTab({ onRefresh }) {
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileData, setFileData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [variables, setVariables] = useState({ systemVariables: [], userVariables: [] });
  const [defaultCountryCode, setDefaultCountryCode] = useState('972');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;
  
  // Import name
  const [importName, setImportName] = useState('');
  
  // Audiences
  const [audiences, setAudiences] = useState([]);
  const [targetAudience, setTargetAudience] = useState('');
  const [showCreateAudience, setShowCreateAudience] = useState(false);
  const [newAudienceName, setNewAudienceName] = useState('');
  const [newAudienceDesc, setNewAudienceDesc] = useState('');
  const [creatingAudience, setCreatingAudience] = useState(false);
  
  // New variable modal
  const [showNewVariable, setShowNewVariable] = useState(false);
  const [newVarColumn, setNewVarColumn] = useState(null);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');
  
  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importProgress, setImportProgress] = useState('');
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [varsRes, audRes] = await Promise.all([
        api.get('/variables'),
        api.get('/broadcasts/audiences').catch(() => ({ data: { audiences: [] } }))
      ]);
      setVariables(varsRes.data);
      setAudiences(audRes.data.audiences?.filter(a => a.is_static) || []);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  };

  const getDefaultImportName = () => {
    const now = new Date();
    return `ייבוא ${now.toLocaleDateString('he-IL')} ${now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setUploading(true);
      setUploadProgress(0);
      
      const { data } = await api.post('/broadcasts/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });
      
      setFileData(data);
      setImportName(data.file_name.replace(/\.(xlsx|xls|csv)$/i, ''));
      
      // Auto-map obvious columns
      const autoMapping = {};
      data.columns.forEach(col => {
        const colLower = col.toLowerCase().trim();
        if (colLower.includes('טלפון') || colLower.includes('phone') || colLower.includes('נייד') || colLower.includes('סלולרי') || colLower === 'פלאפון' || colLower === 'מספר') {
          autoMapping[col] = 'phone';
        } else if (colLower === 'שם' || colLower.includes('name') || colLower === 'שם מלא' || colLower === 'שם פרטי' || colLower === 'full_name') {
          autoMapping[col] = 'name';
        }
      });
      setMapping(autoMapping);
      setCurrentPage(1);
      setStep(2);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהעלאת הקובץ');
    } finally {
      setUploading(false);
      setUploadProgress(0);
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
      const { data } = await api.post('/variables', {
        name: newVarKey,
        label: newVarLabel
      });
      
      setVariables(prev => ({
        ...prev,
        userVariables: [...prev.userVariables, data]
      }));
      
      if (newVarColumn) {
        setMapping(prev => ({ ...prev, [newVarColumn]: newVarKey }));
      }
      
      setShowNewVariable(false);
      setNewVarColumn(null);
      setNewVarKey('');
      setNewVarLabel('');
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת משתנה');
    }
  };

  const handleCreateAudience = async () => {
    if (!newAudienceName.trim()) return;
    
    try {
      setCreatingAudience(true);
      const { data } = await api.post('/broadcasts/audiences', {
        name: newAudienceName.trim(),
        description: newAudienceDesc.trim(),
        is_static: true
      });
      
      setAudiences(prev => [...prev, data.audience]);
      setTargetAudience(data.audience.id);
      setShowCreateAudience(false);
      setNewAudienceName('');
      setNewAudienceDesc('');
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת קהל');
    } finally {
      setCreatingAudience(false);
    }
  };

  const formatPhoneNumber = (phone, countryCode = defaultCountryCode) => {
    if (!phone) return null;
    let clean = String(phone).replace(/[^\d+]/g, '');
    if (clean.startsWith('+')) clean = clean.substring(1);
    if (clean.startsWith('0')) clean = countryCode + clean.substring(1);
    else if (clean.length >= 9 && clean.length <= 10) {
      const startsWithCode = ['972', '1', '44', '49', '33', '7', '86', '91'].some(code => clean.startsWith(code));
      if (!startsWithCode) clean = countryCode + clean;
    }
    return clean;
  };

  const isValidPhoneNumber = (phone) => {
    if (!phone) return false;
    return /^\d{10,15}$/.test(phone);
  };

  const validationResults = useMemo(() => {
    if (!fileData || !mapping) return { validCount: 0, invalidCount: 0 };
    
    const phoneColumn = Object.keys(mapping).find(col => mapping[col] === 'phone');
    if (!phoneColumn) return { validCount: 0, invalidCount: 0 };
    
    const phoneColIndex = fileData.columns.indexOf(phoneColumn);
    let validCount = 0;
    let invalidCount = 0;
    
    fileData.rows.forEach((row) => {
      const rawPhone = row[phoneColIndex];
      const formatted = formatPhoneNumber(rawPhone);
      if (isValidPhoneNumber(formatted)) {
        validCount++;
      } else {
        invalidCount++;
      }
    });
    
    return { validCount, invalidCount };
  }, [fileData, mapping, defaultCountryCode]);

  const handleImport = async () => {
    const phoneColumn = Object.keys(mapping).find(col => mapping[col] === 'phone');
    if (!phoneColumn) {
      alert('חובה למפות עמודת טלפון');
      return;
    }
    
    if (validationResults.validCount === 0) {
      alert('אין שורות תקינות לייבוא');
      return;
    }
    
    setImporting(true);
    setStep(3);
    setImportProgress('מתחיל ייבוא...');
    
    try {
      // Use longer timeout for large imports
      const { data } = await api.post('/broadcasts/import/execute', {
        file_path: fileData.file_path,
        mapping,
        audience_id: targetAudience || null,
        default_country_code: defaultCountryCode,
        import_name: importName || getDefaultImportName()
      }, {
        timeout: 900000 // 15 minutes timeout
      });
      
      console.log('Import result:', data);
      setImportResult(data);
      setStep(4);
      onRefresh?.();
    } catch (e) {
      console.error('Import error:', e);
      // Show result even on error - show what was imported before error
      if (e.response?.data?.stats) {
        setImportResult({
          ...e.response.data,
          hadError: true
        });
        setStep(4);
      } else {
        // Complete failure - show error result
        setImportResult({
          success: false,
          hadError: true,
          errorMessage: e.response?.data?.error || e.message || 'שגיאה לא ידועה',
          stats: {
            total: validationResults.validCount,
            imported: 0,
            updated: 0,
            errors: validationResults.validCount
          },
          errors: [{ row: 0, error: e.response?.data?.error || 'שגיאה בתהליך הייבוא' }]
        });
        setStep(4);
      }
      onRefresh?.();
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFileData(null);
    setMapping({});
    setTargetAudience('');
    setImportResult(null);
    setCurrentPage(1);
    setImportName('');
    setImportProgress('');
  };

  const isPhoneMapped = Object.values(mapping).includes('phone');
  
  const contactFields = [
    { key: 'phone', label: 'מספר טלפון', required: true },
    { key: 'name', label: 'שם איש קשר', required: false },
  ];
  
  const userVars = (variables.userVariables || []).map(v => ({
    key: v.name,
    label: v.label || v.name
  }));
  
  const totalPages = fileData ? Math.ceil(fileData.rows.length / rowsPerPage) : 0;
  const paginatedRows = fileData ? fileData.rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage) : [];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[
          { num: 1, label: 'העלאה' },
          { num: 2, label: 'מיפוי' },
          { num: 3, label: 'ייבוא' },
          { num: 4, label: 'סיום' }
        ].map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all ${
              step === s.num 
                ? 'bg-orange-600 text-white shadow-lg' 
                : step > s.num 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {step > s.num ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{s.num}</span>
              )}
              <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
            </div>
            {i < 3 && <div className={`w-6 h-0.5 mx-1 ${step > s.num ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-6">
          <div 
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all group ${
              uploading 
                ? 'border-orange-400 bg-orange-50/50 cursor-wait' 
                : 'border-gray-300 cursor-pointer hover:border-orange-400 hover:bg-orange-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            
            {uploading ? (
              <>
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">מעלה קובץ...</h3>
                <div className="max-w-xs mx-auto">
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{uploadProgress}%</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-lg">
                  <Upload className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">העלה קובץ אנשי קשר</h3>
                <p className="text-gray-500 mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
                <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel
                  </span>
                  <span>או</span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    CSV
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              טיפים לייבוא מוצלח
            </h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>הקובץ חייב לכלול שורת כותרות בראש</li>
              <li>עמודת מספר טלפון היא חובה</li>
              <li>פורמטים נתמכים: 0501234567, 050-123-4567, +972501234567</li>
              <li>אנשי קשר קיימים יתעדכנו (לא ישוכפלו)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 2 && fileData && (
        <div className="space-y-6">
          {/* File Info + Import Name */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
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
              <button onClick={handleReset} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הייבוא</label>
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder={getDefaultImportName()}
                className="w-full px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
              />
            </div>
          </div>

          {/* Country Code + Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Globe className="w-4 h-4 inline ml-1" />
                קידומת ברירת מחדל
              </label>
              <select
                value={defaultCountryCode}
                onChange={(e) => setDefaultCountryCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
              >
                {COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
                ))}
              </select>
            </div>

            <div className={`flex items-center gap-3 p-4 rounded-xl border ${
              isPhoneMapped && validationResults.validCount > 0
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              {isPhoneMapped ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <span className="text-green-800 font-medium">{validationResults.validCount.toLocaleString()} תקינים</span>
                    {validationResults.invalidCount > 0 && (
                      <span className="text-red-600 mr-2">• {validationResults.invalidCount.toLocaleString()} לא תקינים</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="text-red-800 font-medium">חובה למפות עמודת טלפון</span>
                </>
              )}
            </div>
          </div>

          {/* Data Table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 w-12">#</th>
                    {fileData.columns.map((col, i) => (
                      <th key={i} className="px-2 py-2 min-w-[150px]">
                        <select
                          value={mapping[col] || ''}
                          onChange={(e) => handleMapColumn(col, e.target.value)}
                          className={`w-full px-2 py-1.5 text-xs rounded-lg border transition-all ${
                            mapping[col] 
                              ? 'bg-green-50 border-green-300 text-green-800 font-medium' 
                              : 'bg-white border-gray-200 text-gray-500'
                          }`}
                        >
                          <option value="">לא למפות</option>
                          <optgroup label="שדות איש קשר">
                            {contactFields.map(f => (
                              <option key={f.key} value={f.key}>{f.label} {f.required && '*'}</option>
                            ))}
                          </optgroup>
                          {userVars.length > 0 && (
                            <optgroup label="משתנים שלי">
                              {userVars.map(v => (
                                <option key={v.key} value={v.key}>{v.label}</option>
                              ))}
                            </optgroup>
                          )}
                          <option value="__new__">+ צור משתנה חדש</option>
                        </select>
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-400"></th>
                    {fileData.columns.map((col, i) => (
                      <th key={i} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, rowIdx) => {
                    const actualIdx = (currentPage - 1) * rowsPerPage + rowIdx;
                    const phoneColIdx = fileData.columns.indexOf(Object.keys(mapping).find(col => mapping[col] === 'phone'));
                    const rawPhone = phoneColIdx >= 0 ? row[phoneColIdx] : null;
                    const formattedPhone = formatPhoneNumber(rawPhone);
                    const isValid = isValidPhoneNumber(formattedPhone);
                    
                    return (
                      <tr key={rowIdx} className={`border-b border-gray-50 hover:bg-gray-50 ${!isValid && isPhoneMapped ? 'bg-red-50/50' : ''}`}>
                        <td className="px-3 py-2 text-center text-xs text-gray-400">{actualIdx + 1}</td>
                        {fileData.columns.map((col, colIdx) => (
                          <td key={colIdx} className={`px-3 py-2 text-sm ${mapping[col] ? 'text-gray-900' : 'text-gray-400'}`}>
                            {row[colIdx] || <span className="text-gray-300">-</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-500">עמוד {currentPage} מתוך {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Target Audience */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline ml-1" />
              הוסף לקהל (אופציונלי)
            </label>
            <div className="flex gap-2">
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
              >
                <option value="">ללא - ייבוא כאנשי קשר בלבד</option>
                {audiences.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.contacts_count || 0})</option>
                ))}
              </select>
              <button
                onClick={() => setShowCreateAudience(true)}
                className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                חדש
              </button>
            </div>
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
              disabled={!isPhoneMapped || validationResults.validCount === 0}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl hover:from-orange-700 hover:to-orange-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25"
            >
              ייבא {validationResults.validCount.toLocaleString()} אנשי קשר
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          {isPhoneMapped && validationResults.invalidCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-800 font-medium">
                <AlertTriangle className="w-5 h-5" />
                {validationResults.invalidCount.toLocaleString()} שורות עם טלפון לא תקין יידלגו
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 3 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-12 h-12 text-orange-600 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">מייבא אנשי קשר...</h3>
          <p className="text-gray-500 mb-4">התהליך יכול לקחת כמה דקות בקבצים גדולים</p>
          <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 px-4 py-2 rounded-full text-sm">
            <Clock className="w-4 h-4" />
            אנא המתן, אל תסגור את הדף
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && importResult && (
        <ImportResultView 
          importResult={importResult}
          importName={importName || getDefaultImportName()}
          onReset={handleReset}
          defaultCountryCode={defaultCountryCode}
        />
      )}

      {/* New Variable Modal */}
      {showNewVariable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewVariable(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">יצירת משתנה חדש</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם לתצוגה</label>
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
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNewVariable(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium">
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

      {/* Create Audience Modal */}
      {showCreateAudience && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateAudience(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">יצירת קהל חדש</h3>
                <p className="text-sm text-gray-500">אנשי הקשר יתווספו לקהל זה</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם הקהל *</label>
                <input
                  type="text"
                  value={newAudienceName}
                  onChange={(e) => setNewAudienceName(e.target.value)}
                  placeholder="לדוגמה: לקוחות VIP"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <textarea
                  value={newAudienceDesc}
                  onChange={(e) => setNewAudienceDesc(e.target.value)}
                  placeholder="תיאור קצר..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreateAudience(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium">
                ביטול
              </button>
              <button
                onClick={handleCreateAudience}
                disabled={!newAudienceName.trim() || creatingAudience}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl hover:from-orange-700 hover:to-orange-800 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingAudience ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                צור קהל
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
