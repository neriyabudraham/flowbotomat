import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, Play, Pause, Edit2, Zap, Users, ArrowRight, Plus, Upload, X } from 'lucide-react';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

export default function ClientBotsPage() {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [bots, setBots] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [clientInfo, setClientInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [botStats, setBotStats] = useState({});
  
  // Create/Import modals
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotDesc, setNewBotDesc] = useState('');
  const [importData, setImportData] = useState(null);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadClientBots();
  }, [clientId]);

  const loadClientBots = async () => {
    try {
      const { data } = await api.get(`/experts/client/${clientId}/bots`);
      setBots(data.bots || []);
      setPermissions(data.permissions || {});
      
      // Load stats for each bot
      data.bots?.forEach(async (bot) => {
        try {
          const res = await api.get(`/bots/${bot.id}/stats`);
          setBotStats(prev => ({ ...prev, [bot.id]: res.data }));
        } catch (e) {}
      });
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בטעינת הבוטים');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (e, bot) => {
    e.stopPropagation();
    if (!permissions.can_edit_bots) {
      alert('אין לך הרשאה לערוך בוטים');
      return;
    }
    try {
      await api.patch(`/bots/${bot.id}`, { is_active: !bot.is_active });
      setBots(prev => prev.map(b => 
        b.id === bot.id ? { ...b, is_active: !b.is_active } : b
      ));
    } catch (err) {
      alert('שגיאה בשינוי סטטוס');
    }
  };

  const handleCreate = async () => {
    if (!newBotName.trim()) return;
    try {
      await api.post(`/experts/client/${clientId}/bots`, { 
        name: newBotName.trim(), 
        description: newBotDesc.trim() 
      });
      setShowCreate(false);
      setNewBotName('');
      setNewBotDesc('');
      loadClientBots();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה ביצירת בוט');
    }
  };

  const handleFileSelect = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.bot) throw new Error('Invalid file');
      setImportData(data);
      setImportName(data.bot.name || 'בוט מיובא');
    } catch (e) {
      alert('שגיאה בקריאת הקובץ - ודא שהקובץ תקין');
    }
  };

  const handleImportConfirm = async () => {
    if (!importData || !importName.trim()) return;
    setImporting(true);
    try {
      await api.post(`/experts/client/${clientId}/bots/import`, { 
        data: importData, 
        name: importName.trim() 
      });
      setShowImport(false);
      setImportData(null);
      setImportName('');
      loadClientBots();
    } catch (e) {
      alert('שגיאה בייבוא');
    } finally {
      setImporting(false);
    }
  };

  const handleCancelImport = () => {
    setShowImport(false);
    setImportData(null);
    setImportName('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">טוען בוטים...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={() => navigate('/settings')}>חזור להגדרות</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/settings')} 
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowRight className="w-5 h-5" />
              חזרה
            </button>
          </div>
          <Logo />
          <div className="w-20" /> {/* Spacer */}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-blue-600 mb-2">
              <Users className="w-4 h-4" />
              ניהול חשבון לקוח
            </div>
            <h1 className="text-2xl font-bold text-gray-800">בוטים של הלקוח</h1>
            <p className="text-gray-500 text-sm mt-1">
              {permissions.can_edit_bots ? 'יש לך הרשאה לערוך' : 'צפייה בלבד'}
            </p>
          </div>
          
          {permissions.can_edit_bots && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowImport(true)} className="!rounded-xl">
                <Upload className="w-4 h-4 ml-2" />
                ייבוא
              </Button>
              <Button onClick={() => setShowCreate(true)} className="!rounded-xl">
                <Plus className="w-4 h-4 ml-2" />
                בוט חדש
              </Button>
            </div>
          )}
        </div>

        {/* Bots List */}
        <div className="space-y-4">
          {bots.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Bot className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-1">אין בוטים</h3>
              <p className="text-gray-500">ללקוח זה אין בוטים עדיין</p>
            </div>
          ) : (
            bots.map((bot) => {
              const stats = botStats[bot.id] || {};
              return (
                <div
                  key={bot.id}
                  onClick={() => permissions.can_edit_bots && navigate(`/bots/${bot.id}?client=${clientId}`)}
                  className={`bg-white/80 backdrop-blur rounded-2xl border border-blue-200 p-5 transition-all group ${
                    permissions.can_edit_bots ? 'cursor-pointer hover:shadow-lg hover:border-blue-300' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                      bot.is_active ? 'bg-gradient-to-br from-green-400 to-green-500' : 'bg-gray-100'
                    }`}>
                      <Bot className={`w-7 h-7 ${bot.is_active ? 'text-white' : 'text-gray-400'}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{bot.name}</h3>
                        {bot.is_active && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">פעיל</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{bot.description || 'ללא תיאור'}</p>
                      
                      {/* Stats */}
                      {permissions.can_view_analytics && (
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {stats.uniqueUsers || 0} יוזרים
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {stats.totalTriggers || 0} הפעלות
                          </span>
                        </div>
                      )}
                    </div>

                    {permissions.can_edit_bots && (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleToggle(e, bot)}
                          className={`p-2.5 rounded-xl transition-colors ${
                            bot.is_active ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                        >
                          {bot.is_active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}?client=${clientId}`); }}
                          className="p-2.5 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">יצירת בוט חדש ללקוח</h2>
                <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם הבוט</label>
                  <input
                    type="text"
                    value={newBotName}
                    onChange={(e) => setNewBotName(e.target.value)}
                    placeholder="לדוגמה: בוט תמיכה"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-200 outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                  <textarea
                    value={newBotDesc}
                    onChange={(e) => setNewBotDesc(e.target.value)}
                    placeholder="מה הבוט עושה?"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <Button variant="ghost" onClick={() => setShowCreate(false)} className="flex-1 !rounded-xl">ביטול</Button>
                <Button onClick={handleCreate} className="flex-1 !rounded-xl" disabled={!newBotName.trim()}>צור בוט</Button>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImport && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCancelImport}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">ייבוא בוט ללקוח</h2>
                <button onClick={handleCancelImport} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {!importData ? (
                <div 
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('import-file-client').click()}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">לחץ לבחירת קובץ</p>
                  <p className="text-xs text-gray-400">קובץ JSON שיוצא ממערכת FlowBotomat</p>
                  <input
                    id="import-file-client"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-xl text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Bot className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="text-green-700 font-medium">קובץ נקרא בהצלחה!</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם הבוט</label>
                    <input
                      type="text"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="הזן שם לבוט..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-200 outline-none"
                      autoFocus
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" onClick={handleCancelImport} className="flex-1 !rounded-xl">ביטול</Button>
                    <Button onClick={handleImportConfirm} className="flex-1 !rounded-xl" disabled={!importName.trim() || importing}>
                      {importing ? 'מייבא...' : 'ייבא בוט'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
