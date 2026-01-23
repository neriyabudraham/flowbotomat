import { useState } from 'react';
import { X, GripVertical, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2, Globe, Copy } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

export default function IntegrationEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = () => {
    const newAction = { type: 'http_request', method: 'GET', apiUrl: '', headers: [], body: '', bodyParams: [], mappings: [] };
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

  const handleDragStart = (index) => setDragIndex(index);
  
  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newActions = [...actions];
    const [removed] = newActions.splice(dragIndex, 1);
    newActions.splice(index, 0, removed);
    onUpdate({ actions: newActions });
    setDragIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Current Actions */}
      {actions.length > 0 && (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDragIndex(null)}
              className={`transition-opacity ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <IntegrationItem
                action={action}
                onUpdate={(updates) => updateAction(index, updates)}
                onRemove={() => removeAction(index)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add API call button - always visible */}
      <div className={actions.length > 0 ? "border-t border-gray-100 pt-4" : ""}>
        <button
          onClick={addAction}
          className="w-full flex items-center gap-3 p-4 bg-orange-50 hover:bg-orange-100 rounded-xl transition-all border border-orange-200 hover:border-orange-300 hover:shadow-sm"
        >
          <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
            <span className="text-2xl">📡</span>
          </div>
          <div className="flex-1 text-right">
            <span className="font-medium text-orange-700 block">
              {actions.length > 0 ? 'הוסף קריאת API נוספת' : 'הוסף קריאת API'}
            </span>
            <p className="text-xs text-orange-500">שלח בקשות HTTP ומפה תגובות למשתנים</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function IntegrationItem({ action, onUpdate, onRemove }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-orange-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-50">
          <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="text-xl">📡</span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm text-orange-700">קריאת API</span>
            {action.apiUrl && (
              <p className="text-[10px] text-orange-500 truncate" dir="ltr">
                {action.method || 'GET'} {action.apiUrl}
              </p>
            )}
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="px-3 py-1 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            הגדרות
          </button>
          <button 
            onClick={onRemove} 
            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors group"
          >
            <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
          </button>
        </div>
      </div>
      
      {showModal && (
        <ApiRequestModal action={action} onUpdate={onUpdate} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// Full API Request Modal
function ApiRequestModal({ action, onUpdate, onClose }) {
  const [showHeaders, setShowHeaders] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [showMapping, setShowMapping] = useState(true);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [draggedPath, setDraggedPath] = useState(null);
  
  const headers = action.headers || [];
  const bodyParams = action.bodyParams || [];
  const mappings = action.mappings || [];
  
  const addHeader = () => {
    onUpdate({ headers: [...headers, { key: '', value: '' }] });
  };
  
  const updateHeader = (index, field, value) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    onUpdate({ headers: newHeaders });
  };
  
  const removeHeader = (index) => {
    onUpdate({ headers: headers.filter((_, i) => i !== index) });
  };

  const addBodyParam = () => {
    onUpdate({ bodyParams: [...bodyParams, { key: '', value: '' }] });
  };
  
  const updateBodyParam = (index, field, value) => {
    const newParams = [...bodyParams];
    newParams[index] = { ...newParams[index], [field]: value };
    onUpdate({ bodyParams: newParams });
  };
  
  const removeBodyParam = (index) => {
    onUpdate({ bodyParams: bodyParams.filter((_, i) => i !== index) });
  };
  
  const addMapping = (path = '', varName = '') => {
    onUpdate({ mappings: [...mappings, { path, varName: varName || path.split('.').pop() || '' }] });
  };
  
  const updateMapping = (index, field, value) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    onUpdate({ mappings: newMappings });
  };
  
  const removeMapping = (index) => {
    onUpdate({ mappings: mappings.filter((_, i) => i !== index) });
  };
  
  // Build body from params for testing
  const buildBodyFromParams = () => {
    if (action.bodyMode === 'keyvalue' && bodyParams.length > 0) {
      const obj = {};
      bodyParams.forEach(p => {
        if (p.key) obj[p.key] = p.value;
      });
      return obj;
    }
    if (action.body) {
      try {
        return JSON.parse(action.body);
      } catch {
        return action.body;
      }
    }
    return undefined;
  };

  const testApiCall = async () => {
    if (!action.apiUrl) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const bodyData = buildBodyFromParams();
      const res = await api.post('/utils/test-api', {
        method: action.method || 'GET',
        url: action.apiUrl,
        headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
        body: bodyData
      });
      
      // Handle HTML or non-JSON response
      let data = res.data.data;
      if (typeof data === 'string') {
        // Try to parse as JSON, if fails wrap it
        try {
          data = JSON.parse(data);
        } catch {
          data = { _raw_response: data, _type: 'html_or_text' };
        }
      }
      
      setTestResult({ success: true, status: res.data.status, data });
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    }
    
    setIsTesting(false);
  };
  
  // Extract all paths from response data
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
  
  // Drag handlers for mapping
  const handleDragStart = (path) => {
    setDraggedPath(path);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedPath) {
      updateMapping(targetIndex, 'path', draggedPath);
      setDraggedPath(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📡</span>
            <div>
              <h2 className="text-lg font-bold text-gray-800">הגדרת קריאת API</h2>
              <p className="text-sm text-gray-500">הגדר את פרטי הקריאה, בדוק ומפה תגובות</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Request */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs">1</span>
                הגדרת הבקשה
              </h3>
              
              {/* Method & URL */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">Method & URL</label>
                <div className="flex gap-2">
                  <select
                    value={action.method || 'GET'}
                    onChange={(e) => onUpdate({ method: e.target.value })}
                    className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <TextInputWithVariables
                    value={action.apiUrl || ''}
                    onChange={(v) => onUpdate({ apiUrl: v })}
                    placeholder="https://api.example.com/endpoint - הקלד { למשתנים"
                    className="flex-1"
                    dir="ltr"
                    compact
                  />
                </div>
              </div>
              
              {/* Headers */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHeaders(!showHeaders)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                >
                  <span>Headers</span>
                  <div className="flex items-center gap-2">
                    {headers.length > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">{headers.length}</span>
                    )}
                    {showHeaders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                
                {showHeaders && (
                  <div className="p-4 space-y-2 bg-white">
                    {headers.map((header, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) => updateHeader(i, 'key', e.target.value)}
                          placeholder="Header Name"
                          className="w-[120px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm flex-shrink-0"
                          dir="ltr"
                        />
                        <div className="flex-1 min-w-0">
                          <TextInputWithVariables
                            value={header.value}
                            onChange={(v) => updateHeader(i, 'value', v)}
                            placeholder="Value - הקלד { למשתנים"
                            dir="ltr"
                            compact
                            className="bg-gray-50"
                          />
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeHeader(i)} 
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addHeader}
                      className="w-full py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg border border-dashed border-orange-200"
                    >
                      + הוסף Header
                    </button>
                  </div>
                )}
              </div>
              
              {/* Body */}
              {/* Body - always visible */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowBody(!showBody)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                >
                  <div className="flex items-center gap-2">
                    <span>Body</span>
                    {!['POST', 'PUT', 'PATCH'].includes(action.method || 'GET') && (
                      <span className="text-xs text-gray-400">(זמין ב-POST/PUT/PATCH)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onUpdate({ bodyMode: 'json' }); }}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          (action.bodyMode || 'json') === 'json' ? 'bg-white shadow text-gray-700' : 'text-gray-500'
                        }`}
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onUpdate({ bodyMode: 'keyvalue' }); }}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          action.bodyMode === 'keyvalue' ? 'bg-white shadow text-gray-700' : 'text-gray-500'
                        }`}
                      >
                        Key-Value
                      </button>
                    </div>
                    {showBody ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                
                {showBody && (
                  <div className="p-4 space-y-3 bg-white">
                    {!['POST', 'PUT', 'PATCH'].includes(action.method || 'GET') && (
                      <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
                        💡 Body יישלח רק בבקשות POST, PUT או PATCH
                      </p>
                    )}
                    
                    {(action.bodyMode || 'json') === 'json' ? (
                      <div className="space-y-2">
                        <TextInputWithVariables
                          value={action.body || ''}
                          onChange={(v) => onUpdate({ body: v })}
                          placeholder={'{\n  "name": "{{contact_name}}",\n  "phone": "{{phone}}"\n}'}
                          multiline
                          rows={6}
                          dir="ltr"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {bodyParams.map((param, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={param.key}
                              onChange={(e) => updateBodyParam(i, 'key', e.target.value)}
                              placeholder="Key"
                              className="w-[100px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm flex-shrink-0"
                              dir="ltr"
                            />
                            <div className="flex-1 min-w-0">
                              <TextInputWithVariables
                                value={param.value}
                                onChange={(v) => updateBodyParam(i, 'value', v)}
                                placeholder="Value - הקלד { למשתנים"
                                dir="ltr"
                                compact
                                className="bg-gray-50"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => removeBodyParam(i)}
                              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addBodyParam}
                          className="w-full py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg border border-dashed border-orange-200"
                        >
                          + הוסף פרמטר
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Test Button */}
              <button
                onClick={testApiCall}
                disabled={!action.apiUrl || isTesting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    שולח בקשה...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    בדיקת API
                  </>
                )}
              </button>
            </div>
            
            {/* Right Column - Response & Mapping */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs">2</span>
                תגובה ומיפוי
              </h3>
              
              {/* Test Result */}
              {testResult && (
                <div className={`rounded-xl overflow-hidden ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-inherit">
                    {testResult.success ? (
                      <>
                        <Check className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-green-700">הצלחה! סטטוס: {testResult.status}</span>
                        <button
                          onClick={() => addMapping('_full_response', 'api_response')}
                          className="mr-auto px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          מפה תגובה מלאה
                        </button>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <span className="font-medium text-red-700">שגיאה: {testResult.error}</span>
                      </>
                    )}
                  </div>
                  
                  {testResult.success && testResult.data && (
                    <div className="p-3">
                      <p className="text-xs text-gray-500 mb-2">גרור שדות למיפוי או לחץ להוספה:</p>
                      <div className="max-h-48 overflow-auto bg-white/50 rounded-lg p-2">
                        {availablePaths.map(({ path, value }) => (
                          <div
                            key={path}
                            draggable
                            onDragStart={() => handleDragStart(path)}
                            onClick={() => addMapping(path)}
                            className="flex items-center justify-between py-1.5 px-2 hover:bg-orange-50 rounded cursor-grab active:cursor-grabbing text-xs font-mono border-b border-gray-100 last:border-0"
                          >
                            <span className="text-orange-600">{path}</span>
                            <span className="text-gray-400 truncate max-w-[150px]" dir="ltr">
                              {typeof value === 'object' ? '{...}' : String(value).substring(0, 30)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {!testResult && (
                <div className="bg-gray-50 rounded-xl p-8 text-center border-2 border-dashed border-gray-200">
                  <div className="text-4xl mb-2">🧪</div>
                  <p className="text-gray-500 text-sm">הרץ בדיקת API כדי לראות את התגובה</p>
                </div>
              )}
              
              {/* Response Mapping */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowMapping(!showMapping)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                >
                  <span>מיפוי תגובה למשתנים</span>
                  <div className="flex items-center gap-2">
                    {mappings.length > 0 && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">{mappings.length}</span>
                    )}
                    {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                
                {showMapping && (
                  <div className="p-4 space-y-3 bg-white">
                    {mappings.map((mapping, i) => (
                      <div 
                        key={i} 
                        className="flex items-center gap-2"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, i)}
                      >
                        <input
                          type="text"
                          value={mapping.path}
                          onChange={(e) => updateMapping(i, 'path', e.target.value)}
                          placeholder="data.user.name או _full_response"
                          className="w-[160px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
                          dir="ltr"
                        />
                        <span className="text-gray-400 font-bold flex-shrink-0">→</span>
                        <input
                          type="text"
                          value={mapping.varName}
                          onChange={(e) => updateMapping(i, 'varName', e.target.value)}
                          placeholder="שם_המשתנה"
                          className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                        />
                        <button 
                          type="button"
                          onClick={() => removeMapping(i)} 
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    
                    <button
                      type="button"
                      onClick={() => addMapping()}
                      className="w-full py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg border border-dashed border-purple-200"
                    >
                      + הוסף מיפוי ידני
                    </button>
                    
                    {mappings.length > 0 && (
                      <p className="text-xs text-gray-400">
                        השתמש ב-_full_response למיפוי כל התגובה. המשתנים יישמרו לאיש הקשר.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
