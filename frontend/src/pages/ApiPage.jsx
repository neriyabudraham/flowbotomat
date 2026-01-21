import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Key, Plus, Copy, Trash2, RefreshCw, Eye, EyeOff, 
  Clock, Activity, Shield, AlertTriangle, Check, X,
  Code, Book, Zap, ChevronLeft, Lock, Crown, ExternalLink,
  Terminal, Play, ChevronDown, ChevronUp
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

export default function ApiPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewKey, setShowNewKey] = useState(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [hasApiAccess, setHasApiAccess] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, keyId: null, keyName: '' });
  const [regenerateModal, setRegenerateModal] = useState({ show: false, keyId: null, keyName: '' });
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  
  // API Playground state
  const [userApiKey, setUserApiKey] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [expandedCurl, setExpandedCurl] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    loadApiKeys();
    checkApiAccess();
  }, []);

  const checkApiAccess = async () => {
    try {
      const { data } = await api.get('/subscriptions/my');
      setHasApiAccess(data.plan?.allow_api_access || false);
    } catch (e) {
      setHasApiAccess(false);
    }
  };

  const loadApiKeys = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api-keys');
      setApiKeys(data.apiKeys || []);
    } catch (e) {
      console.error('Failed to load API keys:', e);
    }
    setLoading(false);
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    
    setCreating(true);
    try {
      const { data } = await api.post('/api-keys', { name: newKeyName });
      setShowNewKey(data.apiKey.key);
      setNewKeyName('');
      setShowCreateModal(false);
      loadApiKeys();
    } catch (e) {
      console.error('Failed to create API key:', e);
      if (e.response?.data?.code === 'API_ACCESS_DENIED') {
        alert('גישת API זמינה רק למנויים בתשלום');
      }
    }
    setCreating(false);
  };

  const deleteApiKey = async (keyId) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את המפתח?')) return;
    
    try {
      await api.delete(`/api-keys/${keyId}`);
      loadApiKeys();
    } catch (e) {
      console.error('Failed to delete API key:', e);
    }
  };

  const regenerateApiKey = async (keyId) => {
    if (!confirm('האם אתה בטוח? המפתח הנוכחי יפסיק לעבוד.')) return;
    
    try {
      const { data } = await api.post(`/api-keys/${keyId}/regenerate`);
      setShowNewKey(data.key);
      loadApiKeys();
    } catch (e) {
      console.error('Failed to regenerate API key:', e);
    }
  };

  const copyToClipboard = (text, keyId) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const BASE_URL = 'https://flow.botomat.co.il/api/v1';
  
  const apiDocs = [
    {
      id: 'text',
      method: 'POST',
      endpoint: '/v1/messages/text',
      description: 'שלח הודעת טקסט',
      body: {
        phone: '972501234567',
        message: 'שלום! זו הודעת בדיקה'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון עם קידומת מדינה' },
        { name: 'message', type: 'string', required: true, description: 'תוכן ההודעה' }
      ]
    },
    {
      id: 'image',
      method: 'POST',
      endpoint: '/v1/messages/image',
      description: 'שלח תמונה',
      body: {
        phone: '972501234567',
        imageUrl: 'https://example.com/image.jpg',
        caption: 'תיאור התמונה'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון' },
        { name: 'imageUrl', type: 'string', required: true, description: 'קישור לתמונה' },
        { name: 'caption', type: 'string', required: false, description: 'כיתוב לתמונה' }
      ]
    },
    {
      id: 'video',
      method: 'POST',
      endpoint: '/v1/messages/video',
      description: 'שלח סרטון',
      body: {
        phone: '972501234567',
        videoUrl: 'https://example.com/video.mp4',
        caption: 'תיאור הסרטון'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון' },
        { name: 'videoUrl', type: 'string', required: true, description: 'קישור לסרטון' },
        { name: 'caption', type: 'string', required: false, description: 'כיתוב לסרטון' }
      ]
    },
    {
      id: 'document',
      method: 'POST',
      endpoint: '/v1/messages/document',
      description: 'שלח מסמך/קובץ',
      body: {
        phone: '972501234567',
        documentUrl: 'https://example.com/file.pdf',
        filename: 'document.pdf',
        caption: 'קובץ חשוב'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון' },
        { name: 'documentUrl', type: 'string', required: true, description: 'קישור למסמך' },
        { name: 'filename', type: 'string', required: false, description: 'שם הקובץ' },
        { name: 'caption', type: 'string', required: false, description: 'כיתוב' }
      ]
    },
    {
      id: 'audio',
      method: 'POST',
      endpoint: '/v1/messages/audio',
      description: 'שלח קובץ אודיו',
      body: {
        phone: '972501234567',
        audioUrl: 'https://example.com/audio.mp3'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון' },
        { name: 'audioUrl', type: 'string', required: true, description: 'קישור לקובץ אודיו' }
      ]
    },
    {
      id: 'list',
      method: 'POST',
      endpoint: '/v1/messages/list',
      description: 'שלח רשימת בחירה',
      body: {
        phone: '972501234567',
        message: 'בחר מהרשימה:',
        buttonText: 'לחץ לבחירה',
        sections: [
          {
            title: 'קטגוריה 1',
            rows: [
              { id: 'item1', title: 'פריט 1', description: 'תיאור פריט 1' },
              { id: 'item2', title: 'פריט 2', description: 'תיאור פריט 2' }
            ]
          }
        ],
        footer: 'FlowBotomat API'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון' },
        { name: 'message', type: 'string', required: true, description: 'תוכן ההודעה' },
        { name: 'buttonText', type: 'string', required: true, description: 'טקסט הכפתור' },
        { name: 'sections', type: 'array', required: true, description: 'מערך סקשנים עם פריטים' },
        { name: 'footer', type: 'string', required: false, description: 'טקסט תחתון' }
      ]
    },
    {
      id: 'location',
      method: 'POST',
      endpoint: '/v1/messages/location',
      description: 'שלח מיקום',
      body: {
        phone: '972501234567',
        latitude: 32.0853,
        longitude: 34.7818,
        name: 'תל אביב',
        address: 'רוטשילד 1, תל אביב'
      },
      params: [
        { name: 'phone', type: 'string', required: true, description: 'מספר טלפון' },
        { name: 'latitude', type: 'number', required: true, description: 'קו רוחב' },
        { name: 'longitude', type: 'number', required: true, description: 'קו אורך' },
        { name: 'name', type: 'string', required: false, description: 'שם המיקום' },
        { name: 'address', type: 'string', required: false, description: 'כתובת' }
      ]
    },
    {
      id: 'contacts',
      method: 'GET',
      endpoint: '/v1/contacts',
      description: 'קבל רשימת אנשי קשר',
      body: null,
      params: [
        { name: 'limit', type: 'number', required: false, description: 'מספר תוצאות (ברירת מחדל: 100)' },
        { name: 'offset', type: 'number', required: false, description: 'דילוג על תוצאות' },
        { name: 'search', type: 'string', required: false, description: 'חיפוש לפי שם או טלפון' }
      ]
    },
    {
      id: 'status',
      method: 'GET',
      endpoint: '/v1/status',
      description: 'בדוק סטטוס חיבור WhatsApp',
      body: null,
      params: []
    },
  ];

  const generateCurl = (doc, apiKey) => {
    const key = apiKey || 'YOUR_API_KEY';
    const url = `${BASE_URL}${doc.endpoint.replace('/v1', '')}`;
    
    if (doc.method === 'GET') {
      return `curl -X GET "${url}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json"`;
    }
    
    return `curl -X POST "${url}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(doc.body, null, 2)}'`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 rotate-180" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{user?.email}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-white/20 backdrop-blur rounded-xl">
                  <Code className="w-6 h-6 text-white" />
                </div>
                <span className="px-3 py-1 bg-white/20 rounded-full text-white text-sm font-medium">API</span>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">גישת API</h1>
              <p className="text-white/70">שלח הודעות WhatsApp ישירות מהמערכות שלך</p>
            </div>
            
            {hasApiAccess && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-white text-purple-600 rounded-xl font-bold hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                צור מפתח חדש
              </button>
            )}
          </div>
        </div>

        {/* No API Access */}
        {!hasApiAccess && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 mb-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-2xl flex items-center justify-center">
              <Crown className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">גישת API זמינה למנויים בתשלום</h3>
            <p className="text-gray-600 mb-6">שדרג את החבילה שלך כדי לקבל גישה ל-API ולשלוח הודעות ישירות מהמערכות שלך</p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg transition-all"
            >
              צפה בתכניות
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* New Key Alert */}
        {showNewKey && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <Key className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  מפתח נוצר בהצלחה!
                </h3>
                <p className="text-green-700 text-sm mb-4">שמור את המפתח הזה! הוא לא יוצג שוב.</p>
                <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-green-200">
                  <code className="flex-1 font-mono text-sm text-gray-800 break-all">{showNewKey}</code>
                  <button
                    onClick={() => copyToClipboard(showNewKey, 'new')}
                    className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                  >
                    {copiedKey === 'new' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-600" />
                    )}
                  </button>
                </div>
              </div>
              <button onClick={() => setShowNewKey(null)} className="p-2 hover:bg-green-100 rounded-lg">
                <X className="w-5 h-5 text-green-600" />
              </button>
            </div>
          </div>
        )}

        {/* API Playground - Curl Generator */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <Terminal className="w-6 h-6" />
                מחולל פקודות cURL
              </h2>
            </div>
            
            {/* API Key Input */}
            <div className="relative">
              <input
                type="text"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                placeholder="הדבק את ה-API Key שלך כאן..."
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                dir="ltr"
              />
              {userApiKey && (
                <button
                  onClick={() => setUserApiKey('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-600 rounded"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
            {!userApiKey && (
              <p className="text-slate-400 text-sm mt-2">הדבק את המפתח כדי לקבל פקודות curl מוכנות להעתקה</p>
            )}
          </div>

          {/* Curl Commands */}
          <div className="divide-y divide-gray-100">
            {apiDocs.map((doc) => (
              <div key={doc.id} className="group">
                <button
                  onClick={() => setExpandedCurl(expandedCurl === doc.id ? null : doc.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded ${
                      doc.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {doc.method}
                    </span>
                    <code className="text-sm font-mono text-gray-700">{doc.endpoint}</code>
                    <span className="text-sm text-gray-500 hidden sm:inline">- {doc.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(generateCurl(doc, userApiKey), `curl-${doc.id}`);
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      title="העתק פקודת curl"
                    >
                      {copiedKey === `curl-${doc.id}` ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                    {expandedCurl === doc.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
                
                {expandedCurl === doc.id && (
                  <div className="px-6 pb-6 bg-gray-50">
                    {/* Parameters */}
                    {doc.params && doc.params.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">פרמטרים:</h4>
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">שם</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">סוג</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">חובה</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">תיאור</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {doc.params.map((param, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2 font-mono text-purple-600">{param.name}</td>
                                  <td className="px-3 py-2 text-gray-500">{param.type}</td>
                                  <td className="px-3 py-2">
                                    {param.required ? (
                                      <span className="text-red-500">כן</span>
                                    ) : (
                                      <span className="text-gray-400">לא</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600">{param.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* Curl Command */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700">פקודת cURL:</h4>
                        <button
                          onClick={() => copyToClipboard(generateCurl(doc, userApiKey), `curl-full-${doc.id}`)}
                          className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
                        >
                          {copiedKey === `curl-full-${doc.id}` ? (
                            <>
                              <Check className="w-3 h-3" />
                              הועתק!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              העתק
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm font-mono whitespace-pre-wrap" dir="ltr">
                        {generateCurl(doc, userApiKey)}
                      </pre>
                    </div>
                    
                    {/* Example Response */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">תגובה לדוגמה:</h4>
                      <pre className="bg-slate-800 text-green-400 rounded-xl p-4 overflow-x-auto text-sm font-mono" dir="ltr">
{`{
  "success": true,
  "messageId": "uuid-here",
  "timestamp": "2024-01-21T12:00:00Z"
}`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* API Keys List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-purple-600" />
                  מפתחות API
                </h2>
                <span className="text-sm text-gray-500">{apiKeys.length} מפתחות</span>
              </div>
              
              {loading ? (
                <div className="p-12 text-center">
                  <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <Key className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 mb-4">אין מפתחות API עדיין</p>
                  {hasApiAccess && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition-colors"
                    >
                      צור מפתח ראשון
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {apiKeys.map((key) => (
                    <div key={key.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${key.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                            <Key className={`w-4 h-4 ${key.is_active ? 'text-green-600' : 'text-gray-400'}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{key.name}</h3>
                            <code className="text-xs text-gray-500 font-mono">{key.key_prefix}</code>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => regenerateApiKey(key.id)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="חדש מפתח"
                          >
                            <RefreshCw className="w-4 h-4 text-gray-600" />
                          </button>
                          <button
                            onClick={() => deleteApiKey(key.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="מחק"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {key.request_count || 0} בקשות
                        </span>
                        {key.last_used_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            שימוש אחרון: {new Date(key.last_used_at).toLocaleDateString('he-IL')}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full ${key.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {key.is_active ? 'פעיל' : 'מושבת'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Reference */}
          <div className="space-y-6">
            {/* Base URL */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                התחלה מהירה
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Base URL</label>
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <code className="flex-1 text-sm font-mono">https://flow.botomat.co.il/api/v1</code>
                    <button
                      onClick={() => copyToClipboard('https://flow.botomat.co.il/api/v1', 'base')}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {copiedKey === 'base' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Header</label>
                  <code className="block p-2 bg-gray-50 rounded-lg text-sm font-mono">
                    Authorization: Bearer YOUR_API_KEY
                  </code>
                </div>
              </div>
            </div>

            {/* Endpoints */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Book className="w-5 h-5 text-blue-500" />
                  Endpoints
                </h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {apiDocs.map((doc, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                        doc.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {doc.method}
                      </span>
                      <code className="text-sm font-mono text-gray-700">{doc.endpoint}</code>
                    </div>
                    <p className="text-sm text-gray-500">{doc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Key className="w-6 h-6" />
                צור מפתח API חדש
              </h2>
              <p className="text-white/70 text-sm mt-1">המפתח יוצג פעם אחת בלבד</p>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">שם המפתח</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="לדוגמה: Production API"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">שמור את המפתח!</p>
                    <p>לאחר היצירה, המפתח יוצג פעם אחת בלבד. שמור אותו במקום בטוח.</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={createApiKey}
                  disabled={creating || !newKeyName.trim()}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      צור מפתח
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
