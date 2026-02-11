import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2, FileSpreadsheet, Users } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import GoogleSheetsEditor from './GoogleSheetsEditor';
import GoogleContactsEditor from './GoogleContactsEditor';
import api from '../../../../services/api';

export default function IntegrationEditor({ data, onUpdate }) {
  const [activeSection, setActiveSection] = useState(null); // 'api' | 'sheets' | 'contacts'
  
  // Data for each section
  const apiData = data.api || { method: 'GET', apiUrl: '', headers: [], body: '', bodyParams: [], mappings: [] };
  const sheetsData = data.sheets || { actions: [] };
  const contactsData = data.contacts || { actions: [] };
  
  // Check if configured
  const hasApi = !!apiData.apiUrl;
  const hasSheets = sheetsData.actions?.length > 0;
  const hasContacts = contactsData.actions?.length > 0;

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? null : section);
  };

  return (
    <div className="space-y-3">
      {/* API Card */}
      <div className={`rounded-xl border overflow-hidden transition-all ${
        activeSection === 'api' ? 'border-orange-300 shadow-sm' : 'border-orange-200'
      }`}>
        <button
          onClick={() => toggleSection('api')}
          className={`w-full flex items-center gap-3 p-4 transition-all ${
            activeSection === 'api' ? 'bg-orange-100' : 'bg-orange-50 hover:bg-orange-100'
          }`}
        >
          <span className="text-2xl">📡</span>
          <div className="flex-1 text-right">
            <span className="font-medium text-orange-800">קריאת API</span>
            {hasApi && (
              <p className="text-xs text-orange-600 truncate" dir="ltr">
                {apiData.method} {apiData.apiUrl}
              </p>
            )}
          </div>
          {hasApi && <Check className="w-5 h-5 text-orange-600" />}
          {activeSection === 'api' ? (
            <ChevronUp className="w-5 h-5 text-orange-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-orange-400" />
          )}
        </button>
        
        {activeSection === 'api' && (
          <div className="p-4 bg-white border-t border-orange-100">
            <ApiEditor 
              data={apiData} 
              onUpdate={(updates) => onUpdate({ ...data, api: { ...apiData, ...updates } })} 
            />
          </div>
        )}
      </div>

      {/* Google Sheets Card */}
      <div className={`rounded-xl border overflow-hidden transition-all ${
        activeSection === 'sheets' ? 'border-green-300 shadow-sm' : 'border-green-200'
      }`}>
        <button
          onClick={() => toggleSection('sheets')}
          className={`w-full flex items-center gap-3 p-4 transition-all ${
            activeSection === 'sheets' ? 'bg-green-100' : 'bg-green-50 hover:bg-green-100'
          }`}
        >
          <FileSpreadsheet className="w-6 h-6 text-green-600" />
          <div className="flex-1 text-right">
            <span className="font-medium text-green-800">Google Sheets</span>
            {hasSheets && (
              <p className="text-xs text-green-600">
                {sheetsData.actions.length} פעולות
              </p>
            )}
          </div>
          {hasSheets && <Check className="w-5 h-5 text-green-600" />}
          {activeSection === 'sheets' ? (
            <ChevronUp className="w-5 h-5 text-green-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-green-400" />
          )}
        </button>
        
        {activeSection === 'sheets' && (
          <div className="p-4 bg-white border-t border-green-100">
            <GoogleSheetsEditor 
              data={sheetsData} 
              onUpdate={(updates) => onUpdate({ ...data, sheets: updates })} 
            />
          </div>
        )}
      </div>

      {/* Google Contacts Card */}
      <div className={`rounded-xl border overflow-hidden transition-all ${
        activeSection === 'contacts' ? 'border-blue-300 shadow-sm' : 'border-blue-200'
      }`}>
        <button
          onClick={() => toggleSection('contacts')}
          className={`w-full flex items-center gap-3 p-4 transition-all ${
            activeSection === 'contacts' ? 'bg-blue-100' : 'bg-blue-50 hover:bg-blue-100'
          }`}
        >
          <Users className="w-6 h-6 text-blue-600" />
          <div className="flex-1 text-right">
            <span className="font-medium text-blue-800">Google Contacts</span>
            {hasContacts && (
              <p className="text-xs text-blue-600">
                {contactsData.actions.length} פעולות
              </p>
            )}
          </div>
          {hasContacts && <Check className="w-5 h-5 text-blue-600" />}
          {activeSection === 'contacts' ? (
            <ChevronUp className="w-5 h-5 text-blue-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-blue-400" />
          )}
        </button>
        
        {activeSection === 'contacts' && (
          <div className="p-4 bg-white border-t border-blue-100">
            <GoogleContactsEditor 
              data={contactsData} 
              onUpdate={(updates) => onUpdate({ ...data, contacts: updates })} 
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Inline API Editor
function ApiEditor({ data, onUpdate }) {
  const [showHeaders, setShowHeaders] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  
  const headers = data.headers || [];
  const bodyParams = data.bodyParams || [];
  const mappings = data.mappings || [];

  const testApiCall = async () => {
    if (!data.apiUrl) return;
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const bodyData = data.bodyMode === 'keyvalue' && bodyParams.length > 0
        ? bodyParams.reduce((obj, p) => p.key ? { ...obj, [p.key]: p.value } : obj, {})
        : data.body ? (() => { try { return JSON.parse(data.body); } catch { return data.body; } })() : undefined;
        
      const res = await api.post('/utils/test-api', {
        method: data.method || 'GET',
        url: data.apiUrl,
        headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
        body: bodyData
      });
      
      let responseData = res.data.data;
      if (typeof responseData === 'string') {
        try { responseData = JSON.parse(responseData); } catch { responseData = { _raw: responseData }; }
      }
      setTestResult({ success: true, status: res.data.status, data: responseData });
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    }
    setIsTesting(false);
  };

  // Extract paths from response
  const extractPaths = (obj, prefix = '') => {
    const paths = [];
    if (typeof obj !== 'object' || obj === null) return paths;
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push({ path, value: obj[key] });
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        paths.push(...extractPaths(obj[key], path));
      }
    }
    return paths;
  };

  const availablePaths = testResult?.success ? extractPaths(testResult.data) : [];

  return (
    <div className="space-y-4">
      {/* Method & URL */}
      <div className="flex gap-2">
        <select
          value={data.method || 'GET'}
          onChange={(e) => onUpdate({ method: e.target.value })}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
        <TextInputWithVariables
          value={data.apiUrl || ''}
          onChange={(v) => onUpdate({ apiUrl: v })}
          placeholder="https://api.example.com/endpoint"
          className="flex-1"
          dir="ltr"
          compact
        />
      </div>

      {/* Headers */}
      <div className="border border-gray-200 rounded-lg">
        <button
          onClick={() => setShowHeaders(!showHeaders)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          <span>Headers {headers.length > 0 && `(${headers.length})`}</span>
          {showHeaders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showHeaders && (
          <div className="p-3 border-t border-gray-100 space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={h.key}
                  onChange={(e) => {
                    const newHeaders = [...headers];
                    newHeaders[i] = { ...h, key: e.target.value };
                    onUpdate({ headers: newHeaders });
                  }}
                  placeholder="Header"
                  className="w-28 px-2 py-1.5 border rounded text-sm"
                  dir="ltr"
                />
                <TextInputWithVariables
                  value={h.value}
                  onChange={(v) => {
                    const newHeaders = [...headers];
                    newHeaders[i] = { ...h, value: v };
                    onUpdate({ headers: newHeaders });
                  }}
                  placeholder="Value"
                  className="flex-1"
                  dir="ltr"
                  compact
                />
                <button onClick={() => onUpdate({ headers: headers.filter((_, idx) => idx !== i) })} className="text-red-500 px-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onUpdate({ headers: [...headers, { key: '', value: '' }] })}
              className="text-sm text-orange-600 hover:underline"
            >
              + הוסף Header
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {['POST', 'PUT', 'PATCH'].includes(data.method) && (
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => setShowBody(!showBody)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <span>Body</span>
            {showBody ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showBody && (
            <div className="p-3 border-t border-gray-100">
              <TextInputWithVariables
                value={data.body || ''}
                onChange={(v) => onUpdate({ body: v })}
                placeholder='{"key": "value"}'
                multiline
                rows={4}
                dir="ltr"
              />
            </div>
          )}
        </div>
      )}

      {/* Test Button */}
      <button
        onClick={testApiCall}
        disabled={!data.apiUrl || isTesting}
        className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        בדיקת API
      </button>

      {/* Test Result */}
      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {testResult.success ? (
            <div>
              <div className="flex items-center gap-2 font-medium text-green-700">
                <Check className="w-4 h-4" />
                הצלחה! סטטוס: {testResult.status}
              </div>
              <pre className="mt-2 text-xs overflow-auto max-h-32 bg-white/50 p-2 rounded" dir="ltr">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
              {availablePaths.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  <p className="mb-1">לחץ להוספת מיפוי:</p>
                  <div className="flex flex-wrap gap-1">
                    {availablePaths.slice(0, 10).map(({ path }) => (
                      <button
                        key={path}
                        onClick={() => onUpdate({ mappings: [...mappings, { path, varName: path.split('.').pop() }] })}
                        className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              שגיאה: {testResult.error}
            </div>
          )}
        </div>
      )}

      {/* Mappings */}
      <div className="border border-gray-200 rounded-lg">
        <button
          onClick={() => setShowMapping(!showMapping)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          <span>שמירה למשתנים {mappings.length > 0 && `(${mappings.length})`}</span>
          {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showMapping && (
          <div className="p-3 border-t border-gray-100 space-y-2">
            {mappings.map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={m.path}
                  onChange={(e) => {
                    const newMappings = [...mappings];
                    newMappings[i] = { ...m, path: e.target.value };
                    onUpdate({ mappings: newMappings });
                  }}
                  placeholder="data.field"
                  className="flex-1 px-2 py-1.5 border rounded text-sm"
                  dir="ltr"
                />
                <span className="text-gray-400">→</span>
                <input
                  value={m.varName}
                  onChange={(e) => {
                    const newMappings = [...mappings];
                    newMappings[i] = { ...m, varName: e.target.value };
                    onUpdate({ mappings: newMappings });
                  }}
                  placeholder="שם_משתנה"
                  className="flex-1 px-2 py-1.5 border rounded text-sm"
                />
                <button onClick={() => onUpdate({ mappings: mappings.filter((_, idx) => idx !== i) })} className="text-red-500 px-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onUpdate({ mappings: [...mappings, { path: '', varName: '' }] })}
              className="text-sm text-orange-600 hover:underline"
            >
              + הוסף מיפוי
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
