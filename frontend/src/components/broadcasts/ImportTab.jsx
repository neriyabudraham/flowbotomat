import { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle, AlertCircle, X,
  ArrowRight, Download, RefreshCw, Eye, Plus, Trash2, Edit2
} from 'lucide-react';
import api from '../../services/api';

export default function ImportTab({ onRefresh }) {
  const [jobs, setJobs] = useState([]);
  const [fields, setFields] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  
  // Import wizard state
  const [step, setStep] = useState(0); // 0 = upload, 1 = mapping, 2 = preview, 3 = importing
  const [uploadData, setUploadData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [targetAudienceId, setTargetAudienceId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [jobsRes, fieldsRes, audiencesRes] = await Promise.all([
        api.get('/broadcasts/import/jobs'),
        api.get('/broadcasts/fields'),
        api.get('/broadcasts/audiences')
      ]);
      setJobs(jobsRes.data.jobs || []);
      setFields(fieldsRes.data.fields || []);
      setAudiences(audiencesRes.data.audiences?.filter(a => a.is_static) || []);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  };

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
      
      // Auto-map common fields
      const autoMapping = {};
      data.columns.forEach(col => {
        const colLower = col.toLowerCase();
        if (colLower.includes('phone') || colLower.includes('טלפון') || colLower.includes('נייד')) {
          autoMapping[col] = 'phone';
        } else if (colLower.includes('name') || colLower.includes('שם')) {
          autoMapping[col] = 'name';
        } else if (colLower.includes('email') || colLower.includes('מייל')) {
          autoMapping[col] = 'email';
        }
      });
      setMapping(autoMapping);
      
      setStep(1);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהעלאת קובץ');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePreview = async () => {
    if (!mapping.phone) {
      alert('יש למפות את עמודת מספר הטלפון');
      return;
    }
    
    try {
      setLoading(true);
      const { data } = await api.post('/broadcasts/import/preview', {
        file_path: uploadData.file_path,
        field_mapping: mapping
      });
      setPreview(data);
      setStep(2);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בתצוגה מקדימה');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      const { data } = await api.post('/broadcasts/import/execute', {
        file_path: uploadData.file_path,
        file_name: uploadData.file_name,
        field_mapping: mapping,
        target_audience_id: targetAudienceId || null,
        create_new_fields: true
      });
      
      setImportResult(data.job);
      setStep(3);
      fetchData();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בייבוא');
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setStep(0);
    setUploadData(null);
    setMapping({});
    setPreview(null);
    setTargetAudienceId('');
    setImportResult(null);
  };

  if (loading && step === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Import Wizard */}
      {step === 0 && (
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
          
          {/* Fields Management */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">שדות אנשי קשר</h4>
              <button
                onClick={() => setShowFieldsModal(true)}
                className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                נהל שדות
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {fields.map(f => (
                <span 
                  key={f.field_key} 
                  className={`px-2 py-1 rounded text-xs ${
                    f.is_system ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {f.field_name}
                  {f.is_required && <span className="text-red-500 mr-1">*</span>}
                </span>
              ))}
            </div>
          </div>
          
          {/* Recent Imports */}
          {jobs.length > 0 && (
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
        </>
      )}

      {/* Step 1: Field Mapping */}
      {step === 1 && uploadData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">מיפוי שדות</h3>
            <button onClick={resetImport} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <strong>קובץ:</strong> {uploadData.file_name} ({uploadData.total_rows} שורות)
          </div>
          
          <div className="space-y-3">
            <p className="text-sm text-gray-600">מפה את העמודות בקובץ לשדות במערכת:</p>
            
            {uploadData.columns.map(col => (
              <div key={col} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <span className="text-sm font-medium">{col}</span>
                  {uploadData.sample_data[0]?.[uploadData.columns.indexOf(col)] && (
                    <span className="text-xs text-gray-400 mr-2">
                      (לדוגמה: {uploadData.sample_data[0][uploadData.columns.indexOf(col)]})
                    </span>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <select
                  value={mapping[col] || ''}
                  onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm min-w-[150px]"
                >
                  <option value="">לא למפות</option>
                  {fields.map(f => (
                    <option key={f.field_key} value={f.field_key}>
                      {f.field_name} {f.is_required ? '*' : ''}
                    </option>
                  ))}
                  <option value="__new__">+ צור שדה חדש</option>
                </select>
              </div>
            ))}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הוסף לקהל (אופציונלי)</label>
            <select
              value={targetAudienceId}
              onChange={(e) => setTargetAudienceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option value="">ללא - ייבוא כאנשי קשר בלבד</option>
              {audiences.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-3">
            <button onClick={resetImport} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              ביטול
            </button>
            <button
              onClick={handlePreview}
              disabled={!mapping.phone || loading}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'המשך לתצוגה מקדימה'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">תצוגה מקדימה</h3>
            <button onClick={resetImport} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-900">{preview.total_rows}</div>
              <div className="text-sm text-gray-500">סה״כ שורות</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{preview.valid_count}</div>
              <div className="text-sm text-gray-500">תקינות</div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600">{preview.preview.length - preview.valid_count}</div>
              <div className="text-sm text-gray-500">עם שגיאות</div>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">טלפון</th>
                  <th className="px-3 py-2 text-right">שם</th>
                  <th className="px-3 py-2 text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2 border-t">{i + 1}</td>
                    <td className="px-3 py-2 border-t font-mono">{row.mapped.phone || '-'}</td>
                    <td className="px-3 py-2 border-t">{row.mapped.name || '-'}</td>
                    <td className="px-3 py-2 border-t">
                      {row.valid ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <span className="text-xs text-red-600">{row.errors.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              חזור
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'התחל ייבוא'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing / Result */}
      {step === 3 && (
        <div className="text-center py-8">
          {importResult ? (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">הייבוא התחיל!</h3>
              <p className="text-gray-500 mb-4">
                הייבוא מתבצע ברקע. תוכל לראות את ההתקדמות ברשימת הייבואים.
              </p>
              <button
                onClick={resetImport}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                ייבוא נוסף
              </button>
            </>
          ) : (
            <>
              <Loader2 className="w-16 h-16 text-orange-500 animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">מייבא אנשי קשר...</h3>
              <p className="text-gray-500">אנא המתן</p>
            </>
          )}
        </div>
      )}

      {/* Fields Management Modal */}
      {showFieldsModal && (
        <FieldsModal 
          fields={fields}
          onClose={() => setShowFieldsModal(false)}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
}

function FieldsModal({ fields, onClose, onRefresh }) {
  const [newField, setNewField] = useState({ field_key: '', field_name: '', field_type: 'text' });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newField.field_key || !newField.field_name) return;
    
    try {
      setCreating(true);
      await api.post('/broadcasts/fields', newField);
      setNewField({ field_key: '', field_name: '', field_type: 'text' });
      onRefresh();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת שדה');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('האם למחוק שדה זה?')) return;
    
    try {
      await api.delete(`/broadcasts/fields/${id}`);
      onRefresh();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקת שדה');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">ניהול שדות</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Add new field */}
        <div className="space-y-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium">הוסף שדה חדש</h4>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newField.field_key}
              onChange={(e) => setNewField({ ...newField, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="מזהה (אנגלית)"
              className="px-3 py-2 border border-gray-200 rounded text-sm"
            />
            <input
              type="text"
              value={newField.field_name}
              onChange={(e) => setNewField({ ...newField, field_name: e.target.value })}
              placeholder="שם התצוגה"
              className="px-3 py-2 border border-gray-200 rounded text-sm"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={newField.field_type}
              onChange={(e) => setNewField({ ...newField, field_type: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm"
            >
              <option value="text">טקסט</option>
              <option value="number">מספר</option>
              <option value="date">תאריך</option>
              <option value="email">אימייל</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={!newField.field_key || !newField.field_name || creating}
              className="px-4 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוסף'}
            </button>
          </div>
        </div>
        
        {/* Fields list */}
        <div className="space-y-2">
          {fields.map(f => (
            <div key={f.field_key} className="flex items-center justify-between p-2 border border-gray-200 rounded">
              <div>
                <span className="font-medium text-sm">{f.field_name}</span>
                <span className="text-xs text-gray-400 mr-2">({f.field_key})</span>
                {f.is_system && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">מערכת</span>}
              </div>
              {!f.is_system && (
                <button
                  onClick={() => handleDelete(f.id)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
