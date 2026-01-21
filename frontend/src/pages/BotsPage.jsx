import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Play, Pause, Trash2, Edit2, X, Users, Zap, Settings, Tag, Variable, Info, Share2, Download, Upload, Copy } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useBotsStore from '../store/botsStore';
import Button from '../components/atoms/Button';
import ShareBotModal from '../components/bots/ShareBotModal';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

export default function BotsPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const { bots, fetchBots, createBot, updateBot, deleteBot } = useBotsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotDesc, setNewBotDesc] = useState('');
  const [botStats, setBotStats] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('tags');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  // Variables state
  const [systemVariables, setSystemVariables] = useState([]);
  const [userVariables, setUserVariables] = useState([]);
  const [customSystemVars, setCustomSystemVars] = useState([]);
  const [newVarName, setNewVarName] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');
  const [newVarDefault, setNewVarDefault] = useState('');
  const [newSysVarName, setNewSysVarName] = useState('');
  const [newSysVarLabel, setNewSysVarLabel] = useState('');
  const [newSysVarValue, setNewSysVarValue] = useState('');
  const [shareBot, setShareBot] = useState(null);
  const [sharedBots, setSharedBots] = useState([]);
  const [activeTab, setActiveTab] = useState('my'); // 'my' or 'shared'
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  
  // Duplicate/Delete modals
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateBot, setDuplicateBot] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBotTarget, setDeleteBotTarget] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchBots();
    fetchTags();
    fetchSharedBots();
  }, []);

  const fetchSharedBots = async () => {
    try {
      const { data } = await api.get('/sharing/shared-with-me');
      setSharedBots(data.bots || []);
    } catch (e) {
      console.error('Failed to fetch shared bots:', e);
    }
  };

  // Fetch stats for each bot
  useEffect(() => {
    bots.forEach(async (bot) => {
      try {
        const res = await api.get(`/bots/${bot.id}/stats`);
        setBotStats(prev => ({ ...prev, [bot.id]: res.data }));
      } catch (e) {}
    });
  }, [bots]);

  const fetchTags = async () => {
    try {
      const res = await api.get('/contacts/tags');
      setTags(res.data.tags || []);
    } catch (e) {}
  };

  const fetchVariables = async () => {
    try {
      const res = await api.get('/variables');
      setSystemVariables(res.data.systemVariables || []);
      setUserVariables(res.data.userVariables || []);
      setCustomSystemVars(res.data.customSystemVariables || []);
    } catch (e) {
      console.error('Failed to fetch variables:', e);
    }
  };

  const handleAddVariable = async () => {
    if (!newVarName.trim()) return;
    try {
      await api.post('/variables', { 
        name: newVarName.trim().toLowerCase().replace(/\s+/g, '_'),
        label: newVarLabel.trim() || newVarName.trim(),
        default_value: newVarDefault.trim(),
        is_system: false
      });
      setNewVarName('');
      setNewVarLabel('');
      setNewVarDefault('');
      fetchVariables();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת משתנה');
    }
  };

  const handleAddSystemVariable = async () => {
    if (!newSysVarName.trim() || !newSysVarValue.trim()) return;
    try {
      await api.post('/variables', { 
        name: newSysVarName.trim().toLowerCase().replace(/\s+/g, '_'),
        label: newSysVarLabel.trim() || newSysVarName.trim(),
        default_value: newSysVarValue.trim(),
        is_system: true
      });
      setNewSysVarName('');
      setNewSysVarLabel('');
      setNewSysVarValue('');
      fetchVariables();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת משתנה');
    }
  };

  const handleUpdateSystemVariable = async (varId, newValue) => {
    try {
      await api.put(`/variables/${varId}`, { default_value: newValue });
      fetchVariables();
    } catch (e) {
      alert('שגיאה בעדכון משתנה');
    }
  };

  const handleDeleteVariable = async (varId) => {
    if (!confirm('למחוק משתנה?')) return;
    try {
      await api.delete(`/variables/${varId}`);
      fetchVariables();
    } catch (e) {}
  };

  const handleCreate = async () => {
    if (!newBotName.trim()) return;
    try {
      const bot = await createBot(newBotName, newBotDesc);
      setNewBotName('');
      setNewBotDesc('');
      setShowCreate(false);
      navigate(`/bots/${bot.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (e, bot) => {
    e.stopPropagation();
    await updateBot(bot.id, { is_active: !bot.is_active });
  };

  const handleDeleteClick = (e, bot) => {
    e.stopPropagation();
    setDeleteBotTarget(bot);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteBotTarget) return;
    await deleteBot(deleteBotTarget.id);
    setShowDeleteConfirm(false);
    setDeleteBotTarget(null);
  };

  const handleExport = async (e, bot) => {
    e.stopPropagation();
    try {
      const { data } = await api.get(`/bots/${bot.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bot.name.replace(/[^a-zA-Z0-9א-ת]/g, '_')}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('שגיאה בייצוא');
    }
  };

  const handleDuplicateClick = (e, bot) => {
    e.stopPropagation();
    setDuplicateBot(bot);
    setDuplicateName(`${bot.name} (עותק)`);
    setShowDuplicate(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateBot || !duplicateName.trim()) return;
    try {
      await api.post(`/bots/${duplicateBot.id}/duplicate`, { name: duplicateName.trim() });
      fetchBots();
      setShowDuplicate(false);
      setDuplicateBot(null);
      setDuplicateName('');
    } catch (e) {
      alert('שגיאה בשכפול');
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
      await api.post('/bots/import', { data: importData, name: importName.trim() });
      fetchBots();
      setShowImport(false);
      setImportData(null);
      setImportName('');
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

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      await api.post('/contacts/tags', { name: newTag.trim() });
      setNewTag('');
      fetchTags();
    } catch (e) {}
  };

  const handleDeleteTag = async (tagId) => {
    if (!confirm('למחוק תגית?')) return;
    try {
      await api.delete(`/contacts/tags/${tagId}`);
      fetchTags();
    } catch (e) {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            ← חזרה
          </Button>
          <Logo />
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" onClick={() => setShowSettings(true)}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" onClick={() => { logout(); navigate('/login'); }}>
              התנתק
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('my')}
            className={`pb-3 px-1 font-medium transition-colors relative ${
              activeTab === 'my' 
                ? 'text-primary-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            הבוטים שלי
            <span className="mr-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {bots.length}
            </span>
            {activeTab === 'my' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`pb-3 px-1 font-medium transition-colors relative ${
              activeTab === 'shared' 
                ? 'text-primary-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            שותפו איתי
            {sharedBots.length > 0 && (
              <span className="mr-2 text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                {sharedBots.length}
              </span>
            )}
            {activeTab === 'shared' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
            )}
          </button>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {activeTab === 'my' ? 'הבוטים שלי' : 'בוטים ששותפו איתי'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {activeTab === 'my' ? 'צור ונהל בוטים אוטומטיים' : 'בוטים שמשתמשים אחרים שיתפו איתך'}
            </p>
          </div>
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
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">יצירת בוט חדש</h2>
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

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">הגדרות מתקדמות</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {/* Tabs */}
              <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
                <button
                  onClick={() => setSettingsTab('tags')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    settingsTab === 'tags' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Tag className="w-4 h-4" /> תגיות
                </button>
                <button
                  onClick={() => { setSettingsTab('constants'); fetchVariables(); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    settingsTab === 'constants' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Settings className="w-4 h-4" /> קבועים
                </button>
                <button
                  onClick={() => { setSettingsTab('variables'); fetchVariables(); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    settingsTab === 'variables' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Variable className="w-4 h-4" /> משתנים
                </button>
              </div>
              
              {/* Tags Tab */}
              {settingsTab === 'tags' && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-700 mb-3">ניהול תגיות</h3>
                  <p className="text-sm text-gray-500 mb-4">תגיות משמשות לסינון וקטלוג אנשי קשר</p>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="שם תגית חדשה..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    />
                    <Button onClick={handleAddTag} className="!rounded-lg !px-4">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <span key={tag.id} className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm">
                        {tag.name}
                        <button onClick={() => handleDeleteTag(tag.id)} className="hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {tags.length === 0 && <p className="text-gray-400 text-sm">אין תגיות</p>}
                  </div>
                </div>
              )}
              
              {/* Constants Tab */}
              {settingsTab === 'constants' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">משתנים קבועים</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      משתנים עם ערך קבוע שניתן לשנות פעם אחת ויחול על כל הבוטים.
                      לדוגמה: שם העסק, מספר טלפון לפניות, כתובת וכו'.
                    </p>
                    
                    {/* Add new constant */}
                    <div className="p-3 bg-purple-50 rounded-lg mb-4">
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <input
                          type="text"
                          value={newSysVarName}
                          onChange={(e) => setNewSysVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                          placeholder="שם (באנגלית)"
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          dir="ltr"
                        />
                        <input
                          type="text"
                          value={newSysVarLabel}
                          onChange={(e) => setNewSysVarLabel(e.target.value)}
                          placeholder="תווית (עברית)"
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          value={newSysVarValue}
                          onChange={(e) => setNewSysVarValue(e.target.value)}
                          placeholder="ערך"
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      <Button 
                        onClick={handleAddSystemVariable} 
                        className="!rounded-lg w-full" 
                        disabled={!newSysVarName.trim() || !newSysVarValue.trim()}
                      >
                        <Plus className="w-4 h-4 ml-2" /> הוסף קבוע
                      </Button>
                    </div>
                    
                    {/* Constants list */}
                    <div className="space-y-2">
                      {customSystemVars.map(v => (
                        <div key={v.id} className="flex items-center gap-2 p-3 bg-white border border-purple-200 rounded-lg">
                          <code className="text-purple-600 font-mono text-xs bg-purple-50 px-2 py-1 rounded">{`{{${v.name}}}`}</code>
                          <span className="text-gray-600 text-sm">{v.label || v.name}</span>
                          <span className="text-gray-400 mx-2">=</span>
                          <input
                            type="text"
                            value={v.default_value || ''}
                            onChange={(e) => handleUpdateSystemVariable(v.id, e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                          />
                          <button 
                            onClick={() => handleDeleteVariable(v.id)} 
                            className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {customSystemVars.length === 0 && (
                        <p className="text-gray-400 text-sm text-center py-4">
                          אין משתנים קבועים. הוסף משתנים כמו שם העסק, טלפון וכו'.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Variables Tab */}
              {settingsTab === 'variables' && (
                <div className="space-y-6">
                  {/* System Variables */}
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      משתני מערכת
                      <span className="text-xs text-gray-400 font-normal">(קריאה בלבד)</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {systemVariables.map(v => (
                        <div key={v.name} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                          <code className="text-purple-600 font-mono text-xs">{`{{${v.name}}}`}</code>
                          <span className="text-gray-500">-</span>
                          <span className="text-gray-700">{v.label}</span>
                          <Info className="w-3 h-3 text-gray-400 mr-auto" title={v.description} />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* User Variables */}
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3">משתני יוזר</h3>
                    <p className="text-sm text-gray-500 mb-4">משתנים אלו נשמרים על כל איש קשר ומתעדכנים אוטומטית</p>
                    
                    {/* Add new variable */}
                    <div className="flex gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                      <input
                        type="text"
                        value={newVarName}
                        onChange={(e) => setNewVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="שם (באנגלית)"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        dir="ltr"
                      />
                      <input
                        type="text"
                        value={newVarLabel}
                        onChange={(e) => setNewVarLabel(e.target.value)}
                        placeholder="תווית (אופציונלי)"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        value={newVarDefault}
                        onChange={(e) => setNewVarDefault(e.target.value)}
                        placeholder="ערך ברירת מחדל"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <Button onClick={handleAddVariable} className="!rounded-lg !px-4" disabled={!newVarName.trim()}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {/* Variables list */}
                    <div className="space-y-2">
                      {userVariables.map(v => (
                        <div key={v.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                          <code className="text-indigo-600 font-mono text-xs">{`{{${v.name}}}`}</code>
                          <span className="text-gray-500">-</span>
                          <span className="text-gray-700">{v.label || v.name}</span>
                          {v.default_value && (
                            <span className="text-xs text-gray-400">(ברירת מחדל: {v.default_value})</span>
                          )}
                          <button 
                            onClick={() => handleDeleteVariable(v.id)} 
                            className="mr-auto p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {userVariables.length === 0 && (
                        <p className="text-gray-400 text-sm text-center py-4">
                          אין משתני יוזר. משתנים יתווספו אוטומטית כשתשתמש בהם בבוטים.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-gray-200">
                <Button variant="ghost" onClick={() => setShowSettings(false)} className="w-full !rounded-xl">סגור</Button>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImport && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCancelImport}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">ייבוא בוט</h2>
                <button onClick={handleCancelImport} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {!importData ? (
                // Step 1: Select file
                <div 
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('import-file').click()}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">לחץ לבחירת קובץ</p>
                  <p className="text-xs text-gray-400">קובץ JSON שיוצא ממערכת FlowBotomat</p>
                  <input
                    id="import-file"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                  />
                </div>
              ) : (
                // Step 2: Enter name and confirm
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-xl text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Bot className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="text-green-700 font-medium">קובץ נקרא בהצלחה!</p>
                    {importData.bot.description && (
                      <p className="text-xs text-green-600 mt-1">{importData.bot.description}</p>
                    )}
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
                    <Button 
                      variant="ghost" 
                      onClick={handleCancelImport} 
                      className="flex-1 !rounded-xl"
                    >
                      ביטול
                    </Button>
                    <Button 
                      onClick={handleImportConfirm} 
                      className="flex-1 !rounded-xl"
                      disabled={!importName.trim() || importing}
                    >
                      {importing ? 'מייבא...' : 'ייבא בוט'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bots List */}
        <div className="space-y-4">
          {activeTab === 'my' ? (
            // My Bots Tab
            bots.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-1">אין בוטים עדיין</h3>
                <p className="text-gray-500 mb-6">צור את הבוט הראשון שלך</p>
                <Button onClick={() => setShowCreate(true)} className="!rounded-xl">
                  <Plus className="w-4 h-4 ml-2" />צור בוט ראשון
                </Button>
              </div>
            ) : (
              bots.map((bot) => {
                const stats = botStats[bot.id] || {};
                return (
                  <div
                    key={bot.id}
                    onClick={() => navigate(`/bots/${bot.id}`)}
                    className="bg-white/80 backdrop-blur rounded-2xl border border-gray-200 p-5 cursor-pointer hover:shadow-lg hover:border-primary-200 transition-all group"
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
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {stats.uniqueUsers || 0} יוזרים
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {stats.totalTriggers || 0} הפעלות
                          </span>
                          <span className="flex items-center gap-1">
                            היום: {stats.triggersToday || 0}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleToggle(e, bot)}
                          className={`p-2 rounded-lg transition-colors ${
                            bot.is_active ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          title={bot.is_active ? 'השהה' : 'הפעל'}
                        >
                          {bot.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}`); }}
                          className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200"
                          title="עריכה"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDuplicateClick(e, bot)}
                          className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                          title="שכפול"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleExport(e, bot)}
                          className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                          title="ייצוא"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShareBot(bot); }}
                          className="p-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200"
                          title="שיתוף"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, bot)}
                          className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                          title="מחיקה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            // Shared Bots Tab
            sharedBots.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Share2 className="w-10 h-10 text-purple-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-1">אין בוטים משותפים</h3>
                <p className="text-gray-500">כשמישהו ישתף איתך בוט, הוא יופיע כאן</p>
              </div>
            ) : (
              sharedBots.map((bot) => (
                <div
                  key={bot.id}
                  onClick={() => navigate(`/bots/${bot.id}`)}
                  className="bg-white/80 backdrop-blur rounded-2xl border border-purple-200 p-5 cursor-pointer hover:shadow-lg hover:border-purple-300 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center">
                      <Bot className="w-7 h-7 text-white" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{bot.name}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          bot.permission === 'admin' ? 'bg-purple-100 text-purple-700' :
                          bot.permission === 'edit' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {bot.permission === 'admin' ? 'מנהל' : bot.permission === 'edit' ? 'עריכה' : 'צפייה'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{bot.description || 'ללא תיאור'}</p>
                      <p className="text-xs text-purple-500 mt-1">
                        שותף על ידי: {bot.owner_name || bot.owner_email}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(bot.permission === 'edit' || bot.permission === 'admin') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}`); }}
                          className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200"
                          title="עריכה"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {bot.allow_export && (
                        <>
                          <button
                            onClick={(e) => handleDuplicateClick(e, bot)}
                            className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                            title="שכפול"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleExport(e, bot)}
                            className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                            title="ייצוא"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </main>

      {/* Share Bot Modal */}
      {shareBot && (
        <ShareBotModal bot={shareBot} onClose={() => setShareBot(null)} />
      )}

      {/* Duplicate Modal */}
      {showDuplicate && duplicateBot && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDuplicate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">שכפול בוט</h2>
              <button onClick={() => setShowDuplicate(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 bg-purple-50 rounded-xl mb-4 text-center">
              <Copy className="w-8 h-8 text-purple-500 mx-auto mb-2" />
              <p className="text-purple-700 text-sm">יוצר עותק של "<span className="font-medium">{duplicateBot.name}</span>"</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הבוט החדש</label>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="הזן שם..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-200 outline-none"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button variant="ghost" onClick={() => setShowDuplicate(false)} className="flex-1 !rounded-xl">ביטול</Button>
              <Button onClick={handleDuplicateConfirm} className="flex-1 !rounded-xl" disabled={!duplicateName.trim()}>שכפל</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteBotTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">מחיקת בוט</h2>
              <button onClick={() => setShowDeleteConfirm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 bg-red-50 rounded-xl mb-4 text-center">
              <Trash2 className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-700">האם למחוק את הבוט</p>
              <p className="text-red-800 font-bold text-lg">"{deleteBotTarget.name}"?</p>
              <p className="text-red-600 text-sm mt-2">פעולה זו לא ניתנת לביטול</p>
            </div>
            
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="flex-1 !rounded-xl">ביטול</Button>
              <Button onClick={handleDeleteConfirm} className="flex-1 !rounded-xl !bg-red-500 hover:!bg-red-600">מחק</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
