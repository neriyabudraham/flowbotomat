import { useState } from 'react';
import { Plus, X, GripVertical, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2, Globe, Bell, Send } from 'lucide-react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const integrationTypes = [
  { id: 'webhook', label: 'Webhook', icon: '🌐', description: 'שלח נתונים לכתובת URL' },
  { id: 'http_request', label: 'קריאת API', icon: '📡', description: 'קריאת API מתקדמת' },
  { id: 'notify', label: 'התראה', icon: '🔔', description: 'שלח התראה למערכת' },
];

export default function IntegrationEditor({ data, onUpdate }) {
  const actions = data.actions || [];
  const [dragIndex, setDragIndex] = useState(null);

  const addAction = (type) => {
    let newAction;
    switch (type) {
      case 'webhook':
        newAction = { type, webhookUrl: '' };
        break;
      case 'http_request':
        newAction = { type, method: 'GET', apiUrl: '', headers: [], body: '', mappings: [] };
        break;
      case 'notify':
        newAction = { type, text: '' };
        break;
      default:
        newAction = { type };
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
        <div className="text-center py-8 px-4 bg-gradient-to-b from-orange-50/50 to-white rounded-2xl border-2 border-dashed border-orange-200">
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Globe className="w-7 h-7 text-orange-600" />
          </div>
          <p className="text-gray-700 font-medium mb-1">אין אינטגרציות עדיין</p>
          <p className="text-sm text-gray-500">בחר סוג אינטגרציה להוספה</p>
        </div>
      )}

      {/* Add Integration Buttons */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">הוסף אינטגרציה</p>
        <div className="grid grid-cols-1 gap-2">
          {integrationTypes.map(({ id, label, icon, description }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className="flex items-center gap-3 p-3 bg-orange-50 hover:bg-orange-100 rounded-xl transition-all border border-orange-100 hover:border-orange-200 hover:shadow-sm text-right"
            >
              <span className="text-2xl">{icon}</span>
              <div className="flex-1">
                <span className="font-medium text-orange-700">{label}</span>
                <p className="text-xs text-orange-500">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationItem({ action, onUpdate, onRemove }) {
  const typeInfo = integrationTypes.find(t => t.id === action.type) || integrationTypes[0];
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-orange-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-orange-50">
        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
          <GripVertical className="w-4 h-4" />
        </div>
        <span className="text-xl">{typeInfo.icon}</span>
        <span className="font-medium text-sm text-orange-700 flex-1">{typeInfo.label}</span>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        <button 
          onClick={onRemove} 
          className="p-1.5 hover:bg-red-100 rounded-lg transition-colors group"
        >
          <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
        </button>
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 bg-white space-y-3">
          {action.type === 'webhook' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">כתובת Webhook:</label>
              <input
                type="url"
                value={action.webhookUrl || ''}
                onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
                placeholder="https://hooks.example.com/webhook"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                dir="ltr"
              />
              <p className="text-xs text-gray-400">הנתונים יישלחו בפורמט JSON עם פרטי איש הקשר</p>
            </div>
          )}

          {action.type === 'http_request' && (
            <ApiRequestEditor action={action} onUpdate={onUpdate} />
          )}

          {action.type === 'notify' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">תוכן ההתראה:</label>
              <TextInputWithVariables
                value={action.text || ''}
                onChange={(v) => onUpdate({ text: v })}
                placeholder="הודעה חדשה מ-{{contact_name}}"
                multiline
                rows={2}
              />
              <p className="text-xs text-gray-400">ההתראה תישלח למערכת הניהול</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Full API Request Editor
function ApiRequestEditor({ action, onUpdate }) {
  const [showHeaders, setShowHeaders] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  
  const headers = action.headers || [];
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
  
  const addMapping = () => {
    onUpdate({ mappings: [...mappings, { path: '', varName: '' }] });
  };
  
  const updateMapping = (index, field, value) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    onUpdate({ mappings: newMappings });
  };
  
  const removeMapping = (index) => {
    onUpdate({ mappings: mappings.filter((_, i) => i !== index) });
  };
  
  const testApiCall = async () => {
    if (!action.apiUrl) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const res = await api.post('/utils/test-api', {
        method: action.method || 'GET',
        url: action.apiUrl,
        headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
        body: action.body ? JSON.parse(action.body) : undefined
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
      <div className="space-y-2">
        <label className="text-xs text-gray-500">Method & URL:</label>
        <div className="flex gap-2">
          <select
            value={action.method || 'GET'}
            onChange={(e) => onUpdate({ method: e.target.value })}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="url"
            value={action.apiUrl || ''}
            onChange={(e) => onUpdate({ apiUrl: e.target.value })}
            placeholder="https://api.example.com/{{contact_id}}"
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            dir="ltr"
          />
        </div>
      </div>
      
      {/* Headers */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHeaders(!showHeaders)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm"
        >
          <span className="font-medium">Headers</span>
          <div className="flex items-center gap-2">
            {headers.length > 0 && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">{headers.length}</span>
            )}
            {showHeaders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showHeaders && (
          <div className="p-3 space-y-2 bg-white">
            {headers.map((header, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={header.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                  placeholder="Header"
                  className="w-32 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm"
                  dir="ltr"
                />
                <input
                  type="text"
                  value={header.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm"
                  dir="ltr"
                />
                <button onClick={() => removeHeader(i)} className="p-1 text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addHeader}
              className="w-full py-2 text-sm text-orange-600 hover:bg-orange-50 rounded border border-dashed border-orange-200"
            >
              + Header
            </button>
          </div>
        )}
      </div>
      
      {/* Body */}
      {['POST', 'PUT', 'PATCH'].includes(action.method || 'GET') && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500">Body (JSON):</label>
          <TextInputWithVariables
            value={action.body || ''}
            onChange={(v) => onUpdate({ body: v })}
            placeholder='{"name": "{{contact_name}}"}'
            multiline
            rows={4}
            dir="ltr"
          />
        </div>
      )}
      
      {/* Test Button */}
      <button
        onClick={testApiCall}
        disabled={!action.apiUrl || isTesting}
        className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 text-sm"
      >
        {isTesting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            בודק...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            בדיקת API
          </>
        )}
      </button>
      
      {/* Test Result */}
      {testResult && (
        <div className={`rounded-lg p-3 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {testResult.success ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">הצלחה! סטטוס: {testResult.status}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">שגיאה: {testResult.error}</span>
              </>
            )}
          </div>
          
          {testResult.success && testResult.data && (
            <pre className="text-xs overflow-auto max-h-32 bg-white/50 p-2 rounded" dir="ltr">
              {JSON.stringify(testResult.data, null, 2)}
            </pre>
          )}
        </div>
      )}
      
      {/* Response Mapping */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowMapping(!showMapping)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm"
        >
          <span className="font-medium">מיפוי תגובה למשתנים</span>
          <div className="flex items-center gap-2">
            {mappings.length > 0 && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">{mappings.length}</span>
            )}
            {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showMapping && (
          <div className="p-3 space-y-2 bg-white">
            {mappings.map((mapping, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={mapping.path}
                  onChange={(e) => updateMapping(i, 'path', e.target.value)}
                  placeholder="data.user.name"
                  className="w-32 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm font-mono"
                  dir="ltr"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="text"
                  value={mapping.varName}
                  onChange={(e) => updateMapping(i, 'varName', e.target.value)}
                  placeholder="שם_המשתנה"
                  className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm"
                />
                <button onClick={() => removeMapping(i)} className="p-1 text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addMapping}
              className="w-full py-2 text-sm text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200"
            >
              + מיפוי
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
