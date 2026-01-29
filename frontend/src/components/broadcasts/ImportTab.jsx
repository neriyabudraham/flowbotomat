import { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle, AlertCircle, X,
  ArrowRight, RefreshCw, Plus, Trash2, ChevronDown, Database,
  User, MapPin, Settings
} from 'lucide-react';
import api from '../../services/api';

export default function ImportTab({ onRefresh }) {
  const [jobs, setJobs] = useState([]);
  const [systemVariables, setSystemVariables] = useState([]);
  const [userVariables, setUserVariables] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Import state
  const [uploadData, setUploadData] = useState(null);
  const [allData, setAllData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [targetAudienceId, setTargetAudienceId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  // Modals
  const [showNewFieldModal, setShowNewFieldModal] = useState(false);
  const [activeColumn, setActiveColumn] = useState(null);
  const [newFieldData, setNewFieldData] = useState({ name: '', label: '' });
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [creatingField, setCreatingField] = useState(false);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [jobsRes, variablesRes, audiencesRes] = await Promise.all([
        api.get('/broadcasts/import/jobs'),
        api.get('/variables'), // Use existing variables API
        api.get('/broadcasts/audiences')
      ]);
      setJobs(jobsRes.data.jobs || []);
      
      // Variables from the bot system
      setSystemVariables(variablesRes.data.systemVariables || []);
      setUserVariables(variablesRes.data.userVariables || []);
      
      setAudiences(audiencesRes.data.audiences?.filter(a => a.is_static) || []);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Fields relevant for contact import (filter from system variables)
  const contactFields = [
    { name: 'contact_phone', label: 'טלפון איש קשר', is_system: true, required: true },
    { name: 'name', label: 'שם איש קשר', is_system: true },
  ];

  // All available fields for mapping
  const allFields = [
    ...contactFields,
    ...userVariables.map(v => ({ name: v.name, label: v.label, is_system: false }))
  ];

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setLoading(true);
      const { data } = await api.post('/broadcasts/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setUploadData(data);
      setAllData(data.sample_data || []);
      
      // Auto-map common fields
      const autoMapping = {};
      data.columns.forEach(col => {
        const colLower = col.toLowerCase();
        if (colLower.includes('phone') || colLower.includes('טלפון') || colLower.includes('נייד') || colLower.includes('פלאפון') || colLower.includes('סלולרי')) {
          autoMapping[col] = 'contact_phone';
        } else if (colLower.includes('name') || colLower === 'שם' || colLower.includes('שם מלא') || colLower.includes('שם פרטי')) {
          autoMapping[col] = 'name';
        }
      });
      setMapping(autoMapping);
      
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהעלאת קובץ');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleMapColumn = (column, fieldName) => {
    if (fieldName === '__new__') {
      setActiveColumn(column);
      setShowNewFieldModal(true);
      setNewFieldData({ name: '', label: column });
    } else if (fieldName === '__none__') {
      const newMapping = { ...mapping };
      delete newMapping[column];
      setMapping(newMapping);
    } else {
      setMapping({ ...mapping, [column]: fieldName });
    }
    setDropdownOpen(null);
  };

  const handleCreateField = async () => {
    if (!newFieldData.name || !newFieldData.label) {
      alert('יש למלא את כל השדות');
      return;
    }
    
    try {
      setCreatingField(true);
      // Use existing variables API to create variable
      const { data } = await api.post('/variables', {
        name: newFieldData.name,
        label: newFieldData.label,
        description: `משתנה שנוצר מייבוא אנשי קשר`,
        var_type: 'text'
      });
      
      // Add to user variables
      setUserVariables([...userVariables, data]);
      
      // Map the column to new field
      if (activeColumn) {
        setMapping({ ...mapping, [activeColumn]: data.name });
      }
      
      setShowNewFieldModal(false);
      setNewFieldData({ name: '', label: '' });
      setActiveColumn(null);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת משתנה');
    } finally {
      setCreatingField(false);
    }
  };

  const handleImport = async () => {
    if (!mapping.contact_phone) {
      alert('חובה למפות את עמודת מספר הטלפון');
      return;
    }
    
    // Convert mapping to use 'phone' for contact_phone (backend expects 'phone')
    const backendMapping = {};
    Object.entries(mapping).forEach(([col, field]) => {
      if (field === 'contact_phone') {
        backendMapping[col] = 'phone';
      } else {
        backendMapping[col] = field;
      }
    });
    
    try {
      setImporting(true);
      const { data } = await api.post('/broadcasts/import/execute', {
        file_path: uploadData.file_path,
        file_name: uploadData.file_name,
        field_mapping: backendMapping,
        target_audience_id: targetAudienceId || null,
        create_new_fields: false
      });
      
      setImportResult(data.job);
      fetchData();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בייבוא');
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setUploadData(null);
    setAllData([]);
    setMapping({});
    setTargetAudienceId('');
    setImportResult(null);
  };

  const getMappedFieldLabel = (column) => {
    const fieldName = mapping[column];
    if (!fieldName) return null;
    const field = allFields.find(f => f.name === fieldName);
    return field?.label || fieldName;
  };

  if (loading && !uploadData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  // Import result view
  if (importResult) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-medium text-gray-900 mb-2">הייבוא התחיל!</h3>
        <p className="text-gray-500 mb-6">
          הייבוא מתבצע ברקע. תוכל לראות את ההתקדמות ברשימת הייבואים למטה.
        </p>
        <button
          onClick={resetImport}
          className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
        >
          ייבוא נוסף
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Area or Data View */}
      {!uploadData ? (
        <>
          {/* Upload Area */}
          <div 
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-orange-400 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">העלה קובץ אנשי קשר</h3>
            <p className="text-gray-500 mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
            <p className="text-sm text-gray-400">נתמכים: Excel (.xlsx, .xls) ו-CSV</p>
          </div>
          
          {/* Available Variables */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4" />
              משתנים זמינים למיפוי
            </h4>
            <div className="flex flex-wrap gap-2">
              {contactFields.map(f => (
                <span 
                  key={f.name} 
                  className="px-3 py-1.5 rounded-lg text-sm bg-blue-100 text-blue-700 flex items-center gap-1"
                >
                  <Database className="w-3 h-3" />
                  {f.label}
                  {f.required && <span className="text-red-500">*</span>}
                </span>
              ))}
              {userVariables.map(v => (
                <span 
                  key={v.name} 
                  className="px-3 py-1.5 rounded-lg text-sm bg-purple-100 text-purple-700 flex items-center gap-1"
                >
                  <User className="w-3 h-3" />
                  {v.label}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <span className="text-blue-600">כחול</span> = שדות מערכת | 
              <span className="text-purple-600 mr-1">סגול</span> = משתנים שיצרת בבוטים
            </p>
          </div>
        </>
      ) : (
        <>
          {/* File Info Bar */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <span className="font-medium text-blue-900">{uploadData.file_name}</span>
                <span className="text-blue-600 text-sm mr-2">({uploadData.total_rows} שורות)</span>
              </div>
            </div>
            <button
              onClick={resetImport}
              className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Data Table with Mapping */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium w-10">#</th>
                      {uploadData.columns.map((col, i) => (
                        <th key={i} className="px-3 py-2 text-right min-w-[150px]">
                          <div className="space-y-2">
                            <div className="font-medium text-gray-900">{col}</div>
                            
                            {/* Mapping Dropdown */}
                            <div className="relative">
                              <button
                                onClick={() => setDropdownOpen(dropdownOpen === col ? null : col)}
                                className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded border transition-colors ${
                                  mapping[col] 
                                    ? 'bg-green-50 border-green-300 text-green-700' 
                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  {mapping[col] ? (
                                    <>
                                      <MapPin className="w-3 h-3" />
                                      {getMappedFieldLabel(col)}
                                    </>
                                  ) : (
                                    'בחר משתנה...'
                                  )}
                                </span>
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              
                              {dropdownOpen === col && (
                                <div className="absolute top-full right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                                  {/* None option */}
                                  <button
                                    onClick={() => handleMapColumn(col, '__none__')}
                                    className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 text-gray-500"
                                  >
                                    לא למפות
                                  </button>
                                  
                                  <div className="border-t border-gray-100" />
                                  
                                  {/* Contact fields */}
                                  <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50">שדות איש קשר</div>
                                  {contactFields.map(f => (
                                    <button
                                      key={f.name}
                                      onClick={() => handleMapColumn(col, f.name)}
                                      className={`w-full text-right px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between ${
                                        mapping[col] === f.name ? 'bg-blue-50 text-blue-700' : ''
                                      }`}
                                    >
                                      <span className="flex items-center gap-1">
                                        <Database className="w-3 h-3 text-blue-500" />
                                        {f.label}
                                      </span>
                                      {f.required && <span className="text-red-500 text-xs">חובה</span>}
                                    </button>
                                  ))}
                                  
                                  {/* User variables */}
                                  {userVariables.length > 0 && (
                                    <>
                                      <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50">משתנים מהבוטים</div>
                                      {userVariables.map(v => (
                                        <button
                                          key={v.name}
                                          onClick={() => handleMapColumn(col, v.name)}
                                          className={`w-full text-right px-3 py-2 text-sm hover:bg-purple-50 flex items-center gap-1 ${
                                            mapping[col] === v.name ? 'bg-purple-50 text-purple-700' : ''
                                          }`}
                                        >
                                          <User className="w-3 h-3 text-purple-500" />
                                          {v.label}
                                        </button>
                                      ))}
                                    </>
                                  )}
                                  
                                  <div className="border-t border-gray-100" />
                                  
                                  {/* Create new */}
                                  <button
                                    onClick={() => handleMapColumn(col, '__new__')}
                                    className="w-full text-right px-3 py-2 text-sm hover:bg-orange-50 text-orange-600 flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    צור משתנה חדש
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-center">{rowIndex + 1}</td>
                        {uploadData.columns.map((col, colIndex) => (
                          <td key={colIndex} className="px-3 py-2 text-gray-700">
                            {row[colIndex] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Mapping Summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-medium text-gray-900 mb-3">סיכום מיפוי</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(mapping).map(([col, fieldName]) => {
                const field = allFields.find(f => f.name === fieldName);
                return (
                  <div key={col} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm">
                    <span className="text-gray-600">{col}</span>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                    <span className={field?.is_system ? 'text-blue-600' : 'text-purple-600'}>
                      {field?.label || fieldName}
                    </span>
                  </div>
                );
              })}
              {Object.keys(mapping).length === 0 && (
                <span className="text-gray-400 text-sm">לא נבחרו מיפויים</span>
              )}
            </div>
            
            {!mapping.contact_phone && (
              <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                חובה למפות את עמודת מספר הטלפון
              </div>
            )}
          </div>

          {/* Target Audience */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">הוסף לקהל (אופציונלי):</label>
            <select
              value={targetAudienceId}
              onChange={(e) => setTargetAudienceId(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">ללא - ייבוא כאנשי קשר בלבד</option>
              {audiences.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button 
              onClick={resetImport} 
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
            >
              בחר קובץ אחר
            </button>
            <button
              onClick={handleImport}
              disabled={!mapping.contact_phone || importing}
              className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  מייבא...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  ייבא {uploadData.total_rows} אנשי קשר
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Recent Imports */}
      {jobs.length > 0 && !uploadData && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3">ייבואים אחרונים</h4>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(job => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm font-medium">{job.file_name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(job.created_at).toLocaleString('he-IL')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    job.status === 'completed' ? 'bg-green-100 text-green-700' :
                    job.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {job.status === 'completed' ? 'הושלם' : job.status === 'failed' ? 'נכשל' : 'בתהליך'}
                  </span>
                  {job.status === 'completed' && (
                    <span className="text-sm text-gray-600">
                      {job.success_count} נוספו, {job.error_count} שגיאות
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Variable Modal - Uses existing variables API */}
      {showNewFieldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewFieldModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">יצירת משתנה חדש</h3>
              <button onClick={() => setShowNewFieldModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
              המשתנה יתווסף לרשימת המשתנים שלך ויהיה זמין גם בבוטים.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם לתצוגה (עברית)</label>
                <input
                  type="text"
                  value={newFieldData.label}
                  onChange={(e) => setNewFieldData({ ...newFieldData, label: e.target.value })}
                  placeholder="לדוגמה: עיר מגורים"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם משתנה (אנגלית)</label>
                <input
                  type="text"
                  value={newFieldData.name}
                  onChange={(e) => setNewFieldData({ 
                    ...newFieldData, 
                    name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[0-9]/, '_')
                  })}
                  placeholder="לדוגמה: city"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 font-mono"
                  dir="ltr"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ישמש בבוטים כ: <code className="bg-gray-100 px-1 rounded">{`{{${newFieldData.name || 'variable_name'}}}`}</code>
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewFieldModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={handleCreateField}
                disabled={!newFieldData.name || !newFieldData.label || creatingField}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingField ? <Loader2 className="w-4 h-4 animate-spin" /> : 'צור משתנה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(null)} />
      )}
    </div>
  );
}
