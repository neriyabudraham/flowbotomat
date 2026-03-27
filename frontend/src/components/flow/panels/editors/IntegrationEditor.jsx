import { useState, useEffect, useRef } from 'react';
import { X, GripVertical, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2, FileSpreadsheet, Users, Upload, Plus } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import GoogleSheetsEditor from './GoogleSheetsEditor';
import GoogleContactsEditor from './GoogleContactsEditor';
import api from '../../../../services/api';

const integrationTypes = [
  { id: 'http_request', label: 'קריאת API', icon: '📡', color: 'orange' },
  { id: 'google_sheets', label: 'Google Sheets', icon: '📊', color: 'green' },
  { id: 'google_contacts', label: 'Google Contacts', icon: '👥', color: 'blue' },
];

const colorClasses = {
  orange: { bg: 'bg-orange-50', hover: 'hover:bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', button: 'bg-orange-600 hover:bg-orange-700' },
  green: { bg: 'bg-green-50', hover: 'hover:bg-green-100', text: 'text-green-700', border: 'border-green-200', button: 'bg-green-600 hover:bg-green-700' },
  blue: { bg: 'bg-blue-50', hover: 'hover:bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', button: 'bg-blue-600 hover:bg-blue-700' },
};

export default function IntegrationEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    let newAction;
    if (type === 'http_request') {
      newAction = { type: 'http_request', method: 'GET', apiUrl: '', headers: [], body: '', bodyParams: [], mappings: [] };
    } else if (type === 'google_sheets') {
      newAction = { type: 'google_sheets', actions: [] };
    } else if (type === 'google_contacts') {
      newAction = { type: 'google_contacts', actions: [] };
    }
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
      {actions.length > 0 ? (
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
      ) : (
        <div className="text-center py-8 px-4 bg-gradient-to-b from-amber-50/50 to-white rounded-2xl border-2 border-dashed border-amber-200">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔗</span>
          </div>
          <p className="text-gray-700 font-medium mb-1">אין אינטגרציות עדיין</p>
          <p className="text-sm text-gray-500">בחר אינטגרציה מהאפשרויות למטה</p>
        </div>
      )}

      {/* Add Integration Options */}
      <div className={actions.length > 0 ? "border-t border-gray-100 pt-4" : ""}>
        <p className="text-sm font-medium text-gray-600 mb-3">הוסף אינטגרציה</p>
        <div className="grid grid-cols-1 gap-2">
          {integrationTypes.map(({ id, label, icon, color }) => {
            const colors = colorClasses[color];
            return (
              <button
                key={id}
                onClick={() => addAction(id)}
                className={`flex items-center gap-3 p-3 ${colors.bg} ${colors.hover} rounded-xl transition-all text-sm border ${colors.border} hover:shadow-sm`}
              >
                <span className="text-xl">{icon}</span>
                <span className={`font-medium ${colors.text}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntegrationItem({ action, onUpdate, onRemove }) {
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  
  const actionType = action.type || 'http_request';
  const typeInfo = integrationTypes.find(t => t.id === actionType) || integrationTypes[0];
  const colors = colorClasses[typeInfo.color];

  // Get description based on type
  const getDescription = () => {
    if (actionType === 'http_request') {
      return action.apiUrl ? `${action.method || 'GET'} ${action.apiUrl}` : '';
    }
    if (actionType === 'google_sheets') {
      const subActions = action.actions || [];
      if (subActions.length === 0) return 'לחץ להגדרה';
      return subActions.map(a => {
        switch (a.operation) {
          case 'read': return 'קריאה';
          case 'add': case 'append_row': return 'הוספה';
          case 'update': return 'עדכון';
          case 'search': case 'search_rows': return 'חיפוש';
          case 'search_update': return 'חיפוש ועדכון';
          case 'search_or_add': return 'חיפוש או הוספה';
          default: return a.operation;
        }
      }).join(', ');
    }
    if (actionType === 'google_contacts') {
      const subActions = action.actions || [];
      if (subActions.length === 0) return 'לחץ להגדרה';
      return subActions.map(a => {
        switch (a.operation) {
          case 'check_exists': return 'בדיקה';
          case 'search_contact': return 'חיפוש';
          case 'create_contact': return 'יצירה';
          case 'find_or_create': return 'מצא/צור';
          case 'add_to_label': return 'תווית';
          default: return a.operation;
        }
      }).join(', ');
    }
    return '';
  };

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden transition-all`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${colors.bg}`}>
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <span className="text-xl">{typeInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`font-medium text-sm ${colors.text}`}>{typeInfo.label}</span>
          {getDescription() && (
            <p className="text-[10px] text-gray-500 truncate" dir={actionType === 'http_request' ? 'ltr' : 'rtl'}>
              {getDescription()}
            </p>
          )}
        </div>
        
        {/* For API - open modal, for others - toggle expand */}
        {actionType === 'http_request' ? (
          <button 
            onClick={() => setShowModal(true)}
            className={`px-3 py-1 text-xs ${colors.button} text-white rounded-lg`}
          >
            הגדרות
          </button>
        ) : (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
        )}
        
        <button 
          onClick={onRemove} 
          className="p-1.5 hover:bg-red-100 rounded-lg transition-colors group"
        >
          <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
        </button>
      </div>
      
      {/* Content - inline editor for Sheets/Contacts */}
      {actionType !== 'http_request' && isExpanded && (
        <div className="p-4 bg-white border-t border-gray-100">
          {actionType === 'google_sheets' && (
            <GoogleSheetsEditor 
              data={{ actions: action.actions || [] }} 
              onUpdate={(updates) => onUpdate({ ...action, actions: updates.actions })}
            />
          )}
          {actionType === 'google_contacts' && (
            <GoogleContactsEditor 
              data={{ actions: action.actions || [] }} 
              onUpdate={(updates) => onUpdate({ ...action, actions: updates.actions })}
            />
          )}
        </div>
      )}
      
      {/* API Modal */}
      {showModal && (
        <ApiRequestModal action={action} onUpdate={onUpdate} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

// Parse curl command and extract method, url, headers, body
function parseCurl(curlCommand) {
  const result = {
    method: 'GET',
    url: '',
    headers: [],
    body: null,
    formFields: null, // for -F / --form fields
  };

  // First, extract the body BEFORE normalizing whitespace to preserve JSON formatting
  let bodyContent = null;
  const originalCmd = curlCommand;

  // Find body with -d or --data variants - use greedy matching for quoted content
  // Match single-quoted body
  let bodyMatch = originalCmd.match(/(?:-d|--data(?:-raw|-binary|-urlencode)?)\s+'([\s\S]*?)'/);
  if (!bodyMatch) {
    // Match double-quoted body
    bodyMatch = originalCmd.match(/(?:-d|--data(?:-raw|-binary|-urlencode)?)\s+"([\s\S]*?)"/);
  }
  if (!bodyMatch) {
    // Match $'...' syntax
    bodyMatch = originalCmd.match(/(?:-d|--data(?:-raw|-binary|-urlencode)?)\s+\$'([\s\S]*?)'/);
  }

  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  // Now clean up the command for URL and header extraction
  let cmd = curlCommand
    .replace(/\\\s*\n/g, ' ')  // Handle line continuations
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();

  // Remove 'curl' from the beginning
  cmd = cmd.replace(/^curl\s+/i, '');

  // Extract URL - it's usually the first argument without a flag or the argument after --url
  const urlMatch = cmd.match(/(?:--url\s+)?['"]?(https?:\/\/[^\s'"]+)['"]?/i) ||
                   cmd.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
  if (urlMatch) {
    result.url = urlMatch[1];
  }

  // Extract method with -X or --request
  const methodMatch = cmd.match(/(?:-X|--request)\s+['"]?(\w+)['"]?/i);
  if (methodMatch) {
    result.method = methodMatch[1].toUpperCase();
  }

  // Extract headers with -H or --header (handle both single and double quotes)
  const headerRegex = /(?:-H|--header)\s+(?:'([^']*)'|"([^"]*)")/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(cmd)) !== null) {
    const headerStr = headerMatch[1] || headerMatch[2];
    const colonIndex = headerStr.indexOf(':');
    if (colonIndex > 0) {
      const key = headerStr.substring(0, colonIndex).trim();
      const value = headerStr.substring(colonIndex + 1).trim();
      result.headers.push({ key, value });
    }
  }

  // Extract -F / --form fields (multipart form-data)
  // Supports: -F 'key=value', -F "key=value", -F key=value, -F key="value", -F key=@file
  const formRegex = /(?:-F|--form)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/gi;
  let formMatch;
  const formFields = [];
  while ((formMatch = formRegex.exec(cmd)) !== null) {
    const fieldStr = formMatch[1] || formMatch[2] || formMatch[3];
    const eqIndex = fieldStr.indexOf('=');
    if (eqIndex > 0) {
      const key = fieldStr.substring(0, eqIndex).trim();
      let value = fieldStr.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, ''); // strip surrounding quotes
      // Detect file references like @filename or @/path/to/file
      const isFile = value.startsWith('@');
      if (isFile) value = value.substring(1); // remove @
      formFields.push({ key, value, isFile });
    }
  }

  if (formFields.length > 0) {
    result.formFields = formFields;
    if (!methodMatch) {
      result.method = 'POST';
    }
  }

  // Process the body content
  if (bodyContent && !result.formFields) {
    let body = bodyContent;
    // Try to parse and pretty-print JSON
    try {
      // Clean up the body - remove extra whitespace but preserve structure
      const cleanBody = body.replace(/\n\s*/g, '').trim();
      const parsed = JSON.parse(cleanBody);
      body = JSON.stringify(parsed, null, 2);
    } catch {
      // Try parsing as-is
      try {
        const parsed = JSON.parse(body);
        body = JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON, keep original but clean up
        body = body.trim();
      }
    }
    result.body = body;
    // If method wasn't explicitly set and we have a body, default to POST
    if (!methodMatch) {
      result.method = 'POST';
    }
  }

  return result;
}

// Full API Request Modal - the complete one
function ApiRequestModal({ action, onUpdate, onClose }) {
  const [showHeaders, setShowHeaders] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [showMapping, setShowMapping] = useState(true);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [draggedPath, setDraggedPath] = useState(null);
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  const [curlError, setCurlError] = useState('');
  const [showVarPrompt, setShowVarPrompt] = useState(false);
  const [pendingVariables, setPendingVariables] = useState([]);
  const [uploadingVar, setUploadingVar] = useState(null);
  const [availableVars, setAvailableVars] = useState([]);
  const [openVarDropdown, setOpenVarDropdown] = useState(null);
  const [varSearch, setVarSearch] = useState('');
  const [creatingVar, setCreatingVar] = useState(false);

  const headers = action.headers || [];
  const bodyParams = action.bodyParams || [];
  const mappings = action.mappings || [];

  // Fetch available variables
  useEffect(() => {
    const fetchVars = async () => {
      try {
        const res = await api.get('/variables');
        const all = [
          ...(res.data.systemVariables || []).map(v => ({ key: v.name, label: v.label || v.name })),
          ...(res.data.userVariables || []).map(v => ({ key: v.name, label: v.label || v.name })),
          ...(res.data.customSystemVariables || []).map(v => ({ key: v.name, label: v.label || v.name })),
        ];
        setAvailableVars(all);
      } catch { /* ignore */ }
    };
    fetchVars();
  }, []);

  // Create a new variable
  const createVariable = async (name) => {
    try {
      setCreatingVar(true);
      const key = name.trim().toLowerCase().replace(/\s+/g, '_');
      await api.post('/variables', { name: key, label: name.trim(), is_system: false });
      setAvailableVars(prev => [...prev, { key, label: name.trim() }]);
      return key;
    } catch (err) {
      console.error('Failed to create variable:', err);
      return null;
    } finally {
      setCreatingVar(false);
    }
  };
  
  // Handle curl import
  const handleCurlImport = () => {
    try {
      setCurlError('');
      const parsed = parseCurl(curlInput);
      
      if (!parsed.url) {
        setCurlError('לא נמצא URL בפקודת ה-curl');
        return;
      }
      
      // Update all fields from parsed curl
      const updates = {
        method: parsed.method,
        apiUrl: parsed.url,
      };

      if (parsed.headers.length > 0) {
        updates.headers = parsed.headers;
      }

      if (parsed.formFields) {
        // -F fields → formdata mode
        updates.bodyMode = 'formdata';
        updates.bodyParams = parsed.formFields.map(f => ({ key: f.key, value: f.value, isFile: f.isFile }));
      } else if (parsed.body) {
        updates.body = parsed.body;
        updates.bodyMode = 'json';
      }

      onUpdate(updates);
      setShowCurlImport(false);
      setCurlInput('');
    } catch (err) {
      setCurlError('שגיאה בפענוח ה-curl: ' + err.message);
    }
  };
  
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
    const autoName = path.split('.').pop() || '';
    // Avoid invalid auto-names like '_' or empty strings
    const safeName = varName || (/^[a-zA-Z\u0590-\u05FF]/.test(autoName) ? autoName : '');
    onUpdate({ mappings: [...mappings, { path, varName: safeName }] });
  };
  
  const updateMapping = (index, field, value) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    onUpdate({ mappings: newMappings });
  };
  
  const removeMapping = (index) => {
    onUpdate({ mappings: mappings.filter((_, i) => i !== index) });
  };
  
  // Extract all {{variable}} patterns from the request
  const extractVariables = () => {
    const varSet = new Set();
    const varRegex = /\{\{([^}]+)\}\}/g;
    const checkStr = (str) => {
      if (!str) return;
      let m;
      while ((m = varRegex.exec(str)) !== null) varSet.add(m[1]);
      varRegex.lastIndex = 0;
    };
    checkStr(action.apiUrl);
    headers.forEach(h => { checkStr(h.key); checkStr(h.value); });
    if (action.body) checkStr(action.body);
    bodyParams.forEach(p => { checkStr(p.key); checkStr(p.value); });
    return [...varSet];
  };

  // Replace variables in a string using the provided map
  const replaceVars = (str, replacements) => {
    if (!str) return str;
    let result = str;
    for (const [name, val] of Object.entries(replacements)) {
      result = result.replaceAll(`{{${name}}}`, val);
    }
    return result;
  };

  // Execute the test API call
  const executeTest = async (testUrl, testHeaders, testBody, testParams) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const headersObj = testHeaders.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {});
      let bodyData;
      if ((action.bodyMode === 'keyvalue' || action.bodyMode === 'formdata') && testParams.length > 0) {
        bodyData = {};
        testParams.forEach(p => { if (p.key) bodyData[p.key] = p.value; });
      } else if (testBody) {
        try { bodyData = JSON.parse(testBody); } catch { bodyData = testBody; }
      }
      const res = await api.post('/utils/test-api', {
        method: action.method || 'GET',
        url: testUrl,
        headers: headersObj,
        body: bodyData,
        bodyMode: action.bodyMode || 'json',
        bodyParams: action.bodyMode === 'formdata' ? testParams : undefined,
      });
      let data = res.data.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = { _raw_response: data, _type: 'html_or_text' }; }
      }
      setTestResult({ success: true, status: res.data.status, data });
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    }
    setIsTesting(false);
  };

  // Start test — if variables exist, prompt first
  const testApiCall = async () => {
    if (!action.apiUrl) return;
    const vars = extractVariables();
    if (vars.length > 0) {
      // Detect which variables are used in file fields
      const fileFieldVars = new Set();
      bodyParams.forEach(p => {
        if (p.isFile && p.value) {
          const m = p.value.match(/\{\{([^}]+)\}\}/g);
          if (m) m.forEach(v => fileFieldVars.add(v.replace(/\{|\}/g, '')));
        }
      });
      setPendingVariables(vars.map(name => ({ name, value: '', isFile: fileFieldVars.has(name) })));
      setShowVarPrompt(true);
      return;
    }
    executeTest(action.apiUrl, headers, action.body, bodyParams);
  };

  // Execute test after user fills in variable values
  const executeTestWithVars = () => {
    const replacements = {};
    pendingVariables.forEach(v => { replacements[v.name] = v.value; });
    const testUrl = replaceVars(action.apiUrl, replacements);
    const testHeaders = headers.map(h => ({ ...h, key: replaceVars(h.key, replacements), value: replaceVars(h.value, replacements) }));
    const testBody = replaceVars(action.body, replacements);
    const testParams = bodyParams.map(p => ({ ...p, key: replaceVars(p.key, replacements), value: replaceVars(p.value, replacements) }));
    setShowVarPrompt(false);
    executeTest(testUrl, testHeaders, testBody, testParams);
  };

  // Upload a file for testing and return its URL
  const uploadTestFile = async (file, varIndex) => {
    setUploadingVar(varIndex);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/utils/upload-test-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newVars = [...pendingVariables];
      newVars[varIndex] = { ...newVars[varIndex], value: res.data.url };
      setPendingVariables(newVars);
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setUploadingVar(null);
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
              
              {/* Import from curl */}
              <button
                type="button"
                onClick={() => setShowCurlImport(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
              >
                <span>📋</span>
                ייבוא מ-curl
              </button>
              
              {/* Curl Import Modal */}
              {showCurlImport && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-700">ייבוא מ-curl</h4>
                      <button 
                        onClick={() => { setShowCurlImport(false); setCurlInput(''); setCurlError(''); }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-500">הדבק פקודת curl והמערכת תמלא אוטומטית את השדות</p>
                    <textarea
                      value={curlInput}
                      onChange={(e) => setCurlInput(e.target.value)}
                      placeholder={`curl -X POST 'https://api.example.com/endpoint' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token' \\
  -d '{"key": "value"}'`}
                      className="w-full h-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono resize-none"
                      dir="ltr"
                    />
                    {curlError && (
                      <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{curlError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowCurlImport(false); setCurlInput(''); setCurlError(''); }}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        ביטול
                      </button>
                      <button
                        onClick={handleCurlImport}
                        disabled={!curlInput.trim()}
                        className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                      >
                        ייבוא
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
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
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onUpdate({ bodyMode: 'formdata' }); }}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          action.bodyMode === 'formdata' ? 'bg-white shadow text-gray-700' : 'text-gray-500'
                        }`}
                      >
                        Form-Data
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
                    ) : action.bodyMode === 'formdata' ? (
                      <div className="space-y-2">
                        <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded-lg">
                          multipart/form-data — לשדות קובץ, הערך צריך להיות URL של הקובץ (או משתנה כמו {'{{file_url}}'})
                        </p>
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
                                placeholder={param.isFile ? "URL קובץ או @filename" : "Value - הקלד { למשתנים"}
                                dir="ltr"
                                compact
                                className="bg-gray-50"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newParams = [...bodyParams];
                                newParams[i] = { ...newParams[i], isFile: !newParams[i].isFile };
                                onUpdate({ bodyParams: newParams });
                              }}
                              title={param.isFile ? 'שדה קובץ' : 'שדה טקסט'}
                              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold ${
                                param.isFile ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                              }`}
                            >
                              {param.isFile ? 'F' : 'T'}
                            </button>
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
                          + הוסף שדה
                        </button>
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
              
              {/* Response as File Toggle */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={action.responseAsFile || false}
                    onChange={(e) => onUpdate({ responseAsFile: e.target.checked })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">שמור תגובה כקובץ בינארי</span>
                </label>
                {action.responseAsFile && (
                  <div className="pr-7 space-y-2">
                    <p className="text-xs text-gray-500">התגובה תישמר כקובץ בשרת, וה-URL יישמר במשתנה שתבחר. מתאים לתמונות, PDF, אודיו וקבצים אחרים.</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 whitespace-nowrap">שמור URL למשתנה:</span>
                      <input
                        type="text"
                        value={action.fileVariable || ''}
                        onChange={(e) => onUpdate({ fileVariable: e.target.value })}
                        placeholder="file_url"
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

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
                        <div className="flex-1 min-w-0 relative">
                          <input
                            type="text"
                            value={mapping.varName}
                            onChange={(e) => {
                              updateMapping(i, 'varName', e.target.value);
                              setVarSearch(e.target.value);
                              setOpenVarDropdown(i);
                            }}
                            onFocus={() => { setOpenVarDropdown(i); setVarSearch(mapping.varName || ''); }}
                            onBlur={() => setTimeout(() => setOpenVarDropdown(null), 200)}
                            placeholder="בחר משתנה..."
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                          />
                          {openVarDropdown === i && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {availableVars
                                .filter(v => !varSearch || v.key.includes(varSearch.toLowerCase()) || v.label.includes(varSearch))
                                .map(v => (
                                  <button
                                    key={v.key}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); updateMapping(i, 'varName', v.key); setOpenVarDropdown(null); }}
                                    className="w-full text-right px-3 py-2 text-sm hover:bg-purple-50 flex items-center justify-between"
                                  >
                                    <span className="text-gray-500 text-xs font-mono" dir="ltr">{v.key}</span>
                                    <span className="text-gray-700">{v.label}</span>
                                  </button>
                                ))}
                              {varSearch && !availableVars.some(v => v.key === varSearch.trim().toLowerCase().replace(/\s+/g, '_')) && (
                                <button
                                  type="button"
                                  onMouseDown={async (e) => {
                                    e.preventDefault();
                                    const key = await createVariable(varSearch);
                                    if (key) { updateMapping(i, 'varName', key); setOpenVarDropdown(null); }
                                  }}
                                  disabled={creatingVar}
                                  className="w-full text-right px-3 py-2 text-sm hover:bg-green-50 border-t border-gray-100 flex items-center justify-between text-green-700"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>{creatingVar ? 'יוצר...' : `צור משתנה "${varSearch.trim()}"`}</span>
                                </button>
                              )}
                              {availableVars.length === 0 && !varSearch && (
                                <div className="px-3 py-2 text-sm text-gray-400 text-center">אין משתנים</div>
                              )}
                            </div>
                          )}
                        </div>
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

      {/* Variable Prompt Modal */}
      {showVarPrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-700">הזן ערכי משתנים לבדיקה</h4>
              <button onClick={() => setShowVarPrompt(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500">הבקשה מכילה משתנים. הזן ערכים כדי לבצע בדיקה:</p>
            <div className="space-y-3 max-h-[50vh] overflow-auto">
              {pendingVariables.map((v, i) => (
                <div key={v.name} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <code className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded text-sm font-mono">{`{{${v.name}}}`}</code>
                    <button
                      type="button"
                      onClick={() => {
                        const newVars = [...pendingVariables];
                        newVars[i] = { ...newVars[i], isFile: !newVars[i].isFile, value: '' };
                        setPendingVariables(newVars);
                      }}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        v.isFile ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {v.isFile ? 'קובץ' : 'טקסט'}
                    </button>
                  </div>
                  {v.isFile ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={v.value}
                        onChange={(e) => {
                          const newVars = [...pendingVariables];
                          newVars[i] = { ...newVars[i], value: e.target.value };
                          setPendingVariables(newVars);
                        }}
                        placeholder="הכנס URL של קובץ..."
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                        dir="ltr"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">או</span>
                        <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                          uploadingVar === i ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        }`}>
                          {uploadingVar === i ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> מעלה...</>
                          ) : (
                            <><Upload className="w-3 h-3" /> העלה קובץ</>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingVar === i}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadTestFile(file, i);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {v.value && v.value.startsWith('http') && (
                          <span className="text-xs text-green-600 truncate max-w-[200px]">
                            {v.value.split('/').pop()}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={v.value}
                      onChange={(e) => {
                        const newVars = [...pendingVariables];
                        newVars[i] = { ...newVars[i], value: e.target.value };
                        setPendingVariables(newVars);
                      }}
                      placeholder={`ערך עבור ${v.name}`}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                      dir="ltr"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowVarPrompt(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                ביטול
              </button>
              <button
                onClick={executeTestWithVars}
                disabled={uploadingVar !== null}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                הרץ בדיקה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
