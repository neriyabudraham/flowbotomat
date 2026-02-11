import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2, Globe, FileSpreadsheet, Users } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

export default function IntegrationEditor({ data, onUpdate }) {
  const [activeType, setActiveType] = useState(null); // 'api', 'sheets', 'contacts'
  
  // Extract data for each type
  const apiData = data.api || { method: 'GET', apiUrl: '', headers: [], body: '', bodyParams: [], mappings: [] };
  const sheetsData = data.sheets || { actions: [] };
  const contactsData = data.contacts || { actions: [] };

  const updateApiData = (updates) => {
    onUpdate({ ...data, api: { ...apiData, ...updates } });
  };

  const updateSheetsData = (updates) => {
    onUpdate({ ...data, sheets: { ...sheetsData, ...updates } });
  };

  const updateContactsData = (updates) => {
    onUpdate({ ...data, contacts: { ...contactsData, ...updates } });
  };

  // Check if each type has configuration
  const hasApi = apiData.apiUrl;
  const hasSheets = sheetsData.actions?.length > 0;
  const hasContacts = contactsData.actions?.length > 0;

  return (
    <div className="space-y-3">
      {/* API Button */}
      <button
        onClick={() => setActiveType(activeType === 'api' ? null : 'api')}
        className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all border ${
          activeType === 'api' 
            ? 'bg-orange-100 border-orange-300' 
            : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
        }`}
      >
        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
          <span className="text-xl">📡</span>
        </div>
        <div className="flex-1 text-right">
          <span className="font-medium text-orange-800">קריאת API</span>
          {hasApi && (
            <p className="text-xs text-orange-600 truncate" dir="ltr">
              {apiData.method} {apiData.apiUrl}
            </p>
          )}
        </div>
        {hasApi && <Check className="w-5 h-5 text-orange-600" />}
        {activeType === 'api' ? <ChevronUp className="w-5 h-5 text-orange-400" /> : <ChevronDown className="w-5 h-5 text-orange-400" />}
      </button>
      
      {activeType === 'api' && (
        <div className="bg-white border border-orange-200 rounded-xl p-4">
          <ApiEditor data={apiData} onUpdate={updateApiData} />
        </div>
      )}

      {/* Google Sheets Button */}
      <button
        onClick={() => setActiveType(activeType === 'sheets' ? null : 'sheets')}
        className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all border ${
          activeType === 'sheets' 
            ? 'bg-green-100 border-green-300' 
            : 'bg-green-50 border-green-200 hover:bg-green-100'
        }`}
      >
        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
          <FileSpreadsheet className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-right">
          <span className="font-medium text-green-800">Google Sheets</span>
          {hasSheets && (
            <p className="text-xs text-green-600">
              {sheetsData.actions.length} פעולות מוגדרות
            </p>
          )}
        </div>
        {hasSheets && <Check className="w-5 h-5 text-green-600" />}
        {activeType === 'sheets' ? <ChevronUp className="w-5 h-5 text-green-400" /> : <ChevronDown className="w-5 h-5 text-green-400" />}
      </button>
      
      {activeType === 'sheets' && (
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <GoogleSheetsInlineEditor data={sheetsData} onUpdate={updateSheetsData} />
        </div>
      )}

      {/* Google Contacts Button */}
      <button
        onClick={() => setActiveType(activeType === 'contacts' ? null : 'contacts')}
        className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all border ${
          activeType === 'contacts' 
            ? 'bg-blue-100 border-blue-300' 
            : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
        }`}
      >
        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-right">
          <span className="font-medium text-blue-800">Google Contacts</span>
          {hasContacts && (
            <p className="text-xs text-blue-600">
              {contactsData.actions.length} פעולות מוגדרות
            </p>
          )}
        </div>
        {hasContacts && <Check className="w-5 h-5 text-blue-600" />}
        {activeType === 'contacts' ? <ChevronUp className="w-5 h-5 text-blue-400" /> : <ChevronDown className="w-5 h-5 text-blue-400" />}
      </button>
      
      {activeType === 'contacts' && (
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <GoogleContactsInlineEditor data={contactsData} onUpdate={updateContactsData} />
        </div>
      )}
    </div>
  );
}

// Lazy load the full editors
function GoogleSheetsInlineEditor({ data, onUpdate }) {
  const GoogleSheetsEditor = require('./GoogleSheetsEditor').default;
  return <GoogleSheetsEditor data={data} onUpdate={onUpdate} />;
}

function GoogleContactsInlineEditor({ data, onUpdate }) {
  const GoogleContactsEditor = require('./GoogleContactsEditor').default;
  return <GoogleContactsEditor data={data} onUpdate={onUpdate} />;
}

// Simple API Editor
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
        : data.body ? JSON.parse(data.body) : undefined;
        
      const res = await api.post('/utils/test-api', {
        method: data.method || 'GET',
        url: data.apiUrl,
        headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
        body: bodyData
      });
      
      setTestResult({ success: true, status: res.data.status, data: res.data.data });
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    }
    setIsTesting(false);
  };

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

      {/* Headers Toggle */}
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
                  className="w-24 px-2 py-1 border rounded text-sm"
                  dir="ltr"
                />
                <input
                  value={h.value}
                  onChange={(e) => {
                    const newHeaders = [...headers];
                    newHeaders[i] = { ...h, value: e.target.value };
                    onUpdate({ headers: newHeaders });
                  }}
                  placeholder="Value"
                  className="flex-1 px-2 py-1 border rounded text-sm"
                  dir="ltr"
                />
                <button onClick={() => onUpdate({ headers: headers.filter((_, idx) => idx !== i) })} className="text-red-500">
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

      {/* Body Toggle */}
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
        className="w-full py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        בדיקה
      </button>

      {/* Test Result */}
      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.success ? (
            <div>
              <div className="flex items-center gap-2 font-medium">
                <Check className="w-4 h-4" />
                הצלחה! סטטוס: {testResult.status}
              </div>
              <pre className="mt-2 text-xs overflow-auto max-h-32 bg-white/50 p-2 rounded" dir="ltr">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              שגיאה: {testResult.error}
            </div>
          )}
        </div>
      )}

      {/* Mappings Toggle */}
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
                  className="flex-1 px-2 py-1 border rounded text-sm"
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
                  className="flex-1 px-2 py-1 border rounded text-sm"
                />
                <button onClick={() => onUpdate({ mappings: mappings.filter((_, idx) => idx !== i) })} className="text-red-500">
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
