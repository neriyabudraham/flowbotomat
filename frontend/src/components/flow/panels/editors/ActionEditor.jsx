import { Plus, X, GripVertical, ChevronDown, ChevronUp, Play, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import TextInputWithVariables from './TextInputWithVariables';
import api from '../../../../services/api';

const actionTypes = [
  { id: 'add_tag', label: 'הוסף תגית', icon: '🏷️', hasValue: 'tag' },
  { id: 'remove_tag', label: 'הסר תגית', icon: '🏷️', hasValue: 'tag' },
  { id: 'set_variable', label: 'הגדר משתנה', icon: '📝', hasValue: 'keyvalue' },
  { id: 'stop_bot', label: 'עצור בוט', icon: '🛑' },
  { id: 'enable_bot', label: 'הפעל בוט', icon: '▶️' },
  { id: 'delete_contact', label: 'מחק איש קשר', icon: '🗑️' },
  { id: 'webhook', label: 'Webhook', icon: '🌐', hasValue: 'url' },
  { id: 'http_request', label: 'קריאת API', icon: '📡', hasValue: 'api' },
  { id: 'notify', label: 'התראה', icon: '🔔', hasValue: 'text' },
];

export default function ActionEditor({ data, onUpdate }) {
  const actions = data.actions || [{ type: 'add_tag' }];

  const addAction = (type) => {
    onUpdate({ actions: [...actions, { type }] });
  };

  const removeAction = (index) => {
    if (actions.length <= 1) return;
    onUpdate({ actions: actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, updates) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onUpdate({ actions: newActions });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">הוסף פעולות לביצוע.</p>

      {/* Actions */}
      <div className="space-y-3">
        {actions.map((action, index) => (
          <ActionItem
            key={index}
            action={action}
            canRemove={actions.length > 1}
            onUpdate={(updates) => updateAction(index, updates)}
            onRemove={() => removeAction(index)}
          />
        ))}
      </div>

      {/* Add buttons */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-500 mb-3">הוסף פעולה:</p>
        <div className="grid grid-cols-2 gap-2">
          {actionTypes.slice(0, 6).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => addAction(id)}
              className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-pink-50 hover:text-pink-700 rounded-lg text-sm"
            >
              <span>{icon}</span>
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <details className="mt-2">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">עוד...</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {actionTypes.slice(6).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => addAction(id)}
                className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-pink-50 hover:text-pink-700 rounded-lg text-sm"
              >
                <span>{icon}</span>
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function ActionItem({ action, canRemove, onUpdate, onRemove }) {
  const actionInfo = actionTypes.find(a => a.id === action.type) || actionTypes[0];

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-300" />
        <span className="text-lg">{actionInfo.icon}</span>
        <select
          value={action.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm"
        >
          {actionTypes.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {actionInfo.hasValue === 'tag' && (
        <TextInputWithVariables
          value={action.tagName || ''}
          onChange={(v) => onUpdate({ tagName: v })}
          placeholder="שם התגית..."
        />
      )}

      {actionInfo.hasValue === 'keyvalue' && (
        <div className="space-y-2">
          <input
            type="text"
            value={action.varKey || ''}
            onChange={(e) => onUpdate({ varKey: e.target.value })}
            placeholder="שם המשתנה..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          />
          <TextInputWithVariables
            value={action.varValue || ''}
            onChange={(v) => onUpdate({ varValue: v })}
            placeholder="ערך (ניתן להשתמש במשתנים)..."
          />
        </div>
      )}

      {actionInfo.hasValue === 'url' && (
        <input
          type="url"
          value={action.webhookUrl || ''}
          onChange={(e) => onUpdate({ webhookUrl: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          dir="ltr"
        />
      )}

      {actionInfo.hasValue === 'api' && (
        <ApiRequestEditor action={action} onUpdate={onUpdate} />
      )}

      {actionInfo.hasValue === 'text' && (
        <TextInputWithVariables
          value={action.text || ''}
          onChange={(v) => onUpdate({ text: v })}
          placeholder="תוכן ההתראה..."
        />
      )}
    </div>
  );
}

// Advanced API Request Editor Component
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
  
  // Test API call
  const testApiCall = async () => {
    if (!action.apiUrl) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const res = await api.post('/api/utils/test-api', {
        method: action.method || 'GET',
        url: action.apiUrl,
        headers: headers.reduce((acc, h) => h.key ? { ...acc, [h.key]: h.value } : acc, {}),
        body: action.body ? JSON.parse(action.body) : undefined
      });
      
      setTestResult({
        success: true,
        status: res.data.status,
        data: res.data.data
      });
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.error || err.message
      });
    }
    
    setIsTesting(false);
  };
  
  // Extract paths from response data
  const extractPaths = (obj, prefix = '') => {
    const paths = [];
    if (typeof obj !== 'object' || obj === null) return paths;
    
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        paths.push(...extractPaths(obj[key], path));
      }
    }
    return paths;
  };
  
  const availablePaths = testResult?.success ? extractPaths(testResult.data) : [];
  
  return (
    <div className="space-y-3">
      {/* Method & URL */}
      <div className="flex gap-2">
        <select
          value={action.method || 'GET'}
          onChange={(e) => onUpdate({ method: e.target.value })}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium"
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
          placeholder="https://api.example.com/endpoint"
          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          dir="ltr"
        />
      </div>
      
      {/* Headers */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowHeaders(!showHeaders)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm"
        >
          <span className="font-medium">כותרות (Headers)</span>
          <div className="flex items-center gap-2">
            {headers.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                {headers.length}
              </span>
            )}
            {showHeaders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showHeaders && (
          <div className="p-3 space-y-2 border-t border-gray-200">
            {headers.map((header, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={header.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                  placeholder="Key"
                  className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-sm"
                  dir="ltr"
                />
                <input
                  type="text"
                  value={header.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-sm"
                  dir="ltr"
                />
                <button onClick={() => removeHeader(i)} className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={addHeader}
              className="w-full py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded"
            >
              + הוסף כותרת
            </button>
          </div>
        )}
      </div>
      
      {/* Body */}
      {['POST', 'PUT', 'PATCH'].includes(action.method || 'GET') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body (JSON)</label>
          <textarea
            value={action.body || ''}
            onChange={(e) => onUpdate({ body: e.target.value })}
            placeholder='{"key": "{{variable}}"}'
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono resize-none"
            rows={3}
            dir="ltr"
          />
        </div>
      )}
      
      {/* Test Button */}
      <button
        onClick={testApiCall}
        disabled={!action.apiUrl || isTesting}
        className="w-full flex items-center justify-center gap-2 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium disabled:opacity-50"
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
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {testResult.success ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="font-medium text-green-700">סטטוס: {testResult.status}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="font-medium text-red-700">שגיאה: {testResult.error}</span>
              </>
            )}
          </div>
          
          {testResult.success && testResult.data && (
            <details>
              <summary className="cursor-pointer text-green-600 hover:text-green-800">הצג תגובה</summary>
              <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-32" dir="ltr">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            </details>
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
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                {mappings.length}
              </span>
            )}
            {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        
        {showMapping && (
          <div className="p-3 space-y-2 border-t border-gray-200">
            {availablePaths.length > 0 && (
              <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700 mb-2">גרור שדה מהתגובה:</p>
                <div className="flex flex-wrap gap-1">
                  {availablePaths.slice(0, 15).map((path) => (
                    <button
                      key={path}
                      onClick={() => addMapping() || updateMapping(mappings.length, 'path', path)}
                      className="px-2 py-1 bg-white border border-blue-200 rounded text-xs font-mono hover:bg-blue-100"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', path)}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {mappings.map((mapping, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={mapping.path}
                  onChange={(e) => updateMapping(i, 'path', e.target.value)}
                  placeholder="response.data.name"
                  className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-sm font-mono"
                  dir="ltr"
                  onDrop={(e) => {
                    e.preventDefault();
                    updateMapping(i, 'path', e.dataTransfer.getData('text/plain'));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                />
                <span className="text-gray-400">→</span>
                <input
                  type="text"
                  value={mapping.varName}
                  onChange={(e) => updateMapping(i, 'varName', e.target.value)}
                  placeholder="שם_משתנה"
                  className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-sm"
                />
                <button onClick={() => removeMapping(i)} className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            
            <button
              onClick={addMapping}
              className="w-full py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded"
            >
              + הוסף מיפוי
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
