import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Bot, Play, Pause, Trash2, Edit2, X, Users, Zap, Settings, Tag, Variable, Info, 
  Share2, Download, Upload, Copy, ChevronRight, Sparkles, Clock, BarChart3, 
  ArrowLeft, Search, Filter, MoreHorizontal, Calendar, TrendingUp, Crown, CheckCircle
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useBotsStore from '../store/botsStore';
import Button from '../components/atoms/Button';
import ShareBotModal from '../components/bots/ShareBotModal';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
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
  const [activeTab, setActiveTab] = useState('my');
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateBot, setDuplicateBot] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBotTarget, setDeleteBotTarget] = useState(null);
  const [showDeleteTagConfirm, setShowDeleteTagConfirm] = useState(false);
  const [deleteTagTarget, setDeleteTagTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalStats, setTotalStats] = useState({ users: 0, triggers: 0, today: 0 });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeError, setUpgradeError] = useState(null);
  const [usage, setUsage] = useState(null);
  const [editingVariable, setEditingVariable] = useState(null);
  const [editVarLabel, setEditVarLabel] = useState('');

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
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const { data } = await api.get('/subscriptions/my/usage');
      setUsage(data);
    } catch (e) {
      console.error('Failed to fetch usage:', e);
    }
  };

  const fetchSharedBots = async () => {
    try {
      const { data } = await api.get('/sharing/shared-with-me');
      setSharedBots(data.bots || []);
    } catch (e) {
      console.error('Failed to fetch shared bots:', e);
    }
  };

  useEffect(() => {
    let total = { users: 0, triggers: 0, today: 0 };
    bots.forEach(async (bot) => {
      try {
        const res = await api.get(`/bots/${bot.id}/stats`);
        setBotStats(prev => ({ ...prev, [bot.id]: res.data }));
        total.users += res.data.uniqueUsers || 0;
        total.triggers += res.data.totalTriggers || 0;
        total.today += res.data.triggersToday || 0;
        setTotalStats({ ...total });
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

  const handleUpdateVariableLabel = async (varId, newLabel) => {
    try {
      await api.put(`/variables/${varId}`, { label: newLabel });
      fetchVariables();
    } catch (e) {
      alert('שגיאה בעדכון תווית');
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
      const errorCode = err.response?.data?.code;
      const errorData = err.response?.data;
      
      if (errorCode === 'BOTS_LIMIT_REACHED' || errorCode === 'HAS_DISABLED_BOT') {
        setShowCreate(false);
        setUpgradeError({
          code: errorCode,
          message: errorData?.error,
          limit: errorData?.limit,
          used: errorData?.used,
          hasDisabledBots: errorData?.hasDisabledBots
        });
        setShowUpgradeModal(true);
      } else {
        alert(err.response?.data?.error || 'שגיאה ביצירת בוט');
      }
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
      const errorData = e.response?.data;
      
      // Close duplicate modal first
      setShowDuplicate(false);
      setDuplicateBot(null);
      setDuplicateName('');
      
      // Show upgrade modal for limit errors
      if (errorData?.code === 'BOTS_LIMIT_REACHED' || errorData?.code === 'HAS_DISABLED_BOT') {
        setUpgradeError(errorData);
        setShowUpgradeModal(true);
      } else {
        alert(errorData?.error || 'שגיאה בשכפול');
      }
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
      const errorData = e.response?.data;
      
      // Close import modal first
      setShowImport(false);
      setImportData(null);
      setImportName('');
      
      // Show upgrade modal for limit errors
      if (errorData?.code === 'BOTS_LIMIT_REACHED') {
        setUpgradeError(errorData);
        setShowUpgradeModal(true);
      } else {
        alert(errorData?.error || 'שגיאה בייבוא');
      }
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
    try {
      await api.delete(`/contacts/tags/${tagId}`);
      fetchTags();
      setShowDeleteTagConfirm(false);
      setDeleteTagTarget(null);
    } catch (e) {
      console.error('Failed to delete tag:', e);
    }
  };

  const filteredBots = bots.filter(bot => 
    bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (bot.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeBots = bots.filter(b => b.is_active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50" dir="rtl">
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
            
            <div className="flex items-center gap-3">
              <NotificationsDropdown />
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors"
                title="הגדרות בוטים"
              >
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">הבוטים שלי</h1>
                    <p className="text-white/70">צור, נהל והפעל בוטים אוטומטיים</p>
                  </div>
                </div>
                
                {/* Quick Stats */}
                <div className="flex items-center gap-6 mt-6">
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{bots.length}</div>
                      <div className="text-xs text-white/60">בוטים</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-green-400/30 rounded-lg">
                      <Play className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{activeBots}</div>
                      <div className="text-xs text-white/60">פעילים</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalStats.users}</div>
                      <div className="text-xs text-white/60">משתמשים</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalStats.triggers}</div>
                      <div className="text-xs text-white/60">הפעלות</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/templates')}
                  className="flex items-center gap-2 px-5 py-3 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-medium transition-all"
                >
                  <Sparkles className="w-5 h-5" />
                  גלריית תבניות
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-2 px-5 py-3 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-medium transition-all"
                >
                  <Upload className="w-5 h-5" />
                  ייבוא
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  <Plus className="w-5 h-5" />
                  בוט חדש
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl">
            <button
              onClick={() => setActiveTab('my')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === 'my' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bot className="w-4 h-4" />
              הבוטים שלי
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'my' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {bots.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === 'shared' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Share2 className="w-4 h-4" />
              שותפו איתי
              {sharedBots.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'shared' ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  {sharedBots.length}
                </span>
              )}
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש בוט..."
                className="w-64 pr-10 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Bots Grid */}
        {activeTab === 'my' ? (
          filteredBots.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Bot className="w-12 h-12 text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {searchQuery ? 'לא נמצאו תוצאות' : 'אין בוטים עדיין'}
              </h3>
              <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                {searchQuery ? 'נסה לחפש במילים אחרות' : 'צור את הבוט הראשון שלך והתחל לאוטומט את התקשורת עם הלקוחות'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  <Sparkles className="w-5 h-5" />
                  צור את הבוט הראשון
                </button>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBots.map((bot) => {
                const stats = botStats[bot.id] || {};
                return (
                  <div
                    key={bot.id}
                    onClick={() => navigate(`/bots/${bot.id}`)}
                    className="group relative bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden"
                  >
                    {/* Status indicator */}
                    <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium ${
                      bot.is_active 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {bot.is_active ? '● פעיל' : '○ מושהה'}
                    </div>
                    
                    {/* Header */}
                    <div className="p-6 pb-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                          bot.is_active 
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                            : 'bg-gray-100'
                        }`}>
                          <Bot className={`w-7 h-7 ${bot.is_active ? 'text-white' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-lg truncate">{bot.name}</h3>
                          <p className="text-sm text-gray-500 truncate mt-1">
                            {bot.description || 'ללא תיאור'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="px-6 py-4 bg-gradient-to-b from-gray-50/50 to-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div className="font-bold text-gray-900">{stats.uniqueUsers || 0}</div>
                          <div className="text-xs text-gray-400">משתמשים</div>
                        </div>
                        <div className="text-center border-x border-gray-200">
                          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                            <Zap className="w-3.5 h-3.5" />
                          </div>
                          <div className="font-bold text-gray-900">{stats.totalTriggers || 0}</div>
                          <div className="text-xs text-gray-400">הפעלות</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                          </div>
                          <div className="font-bold text-green-600">{stats.triggersToday || 0}</div>
                          <div className="text-xs text-gray-400">היום</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleToggle(e, bot)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          bot.is_active 
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {bot.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {bot.is_active ? 'השהה' : 'הפעל'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}`); }}
                        className="p-2 bg-indigo-100 text-indigo-600 hover:bg-indigo-200 rounded-lg transition-colors"
                        title="עריכה"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDuplicateClick(e, bot)}
                        className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                        title="שכפול"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleExport(e, bot)}
                        className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                        title="ייצוא"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShareBot(bot); }}
                        className="p-2 bg-purple-100 text-purple-600 hover:bg-purple-200 rounded-lg transition-colors"
                        title="שיתוף"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(e, bot)}
                        className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                        title="מחיקה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {/* Create New Card */}
              <div
                onClick={() => setShowCreate(true)}
                className="group relative bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer flex items-center justify-center min-h-[280px]"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 group-hover:bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                    <Plus className="w-8 h-8 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <div className="font-semibold text-gray-600 group-hover:text-indigo-600 transition-colors">צור בוט חדש</div>
                  <div className="text-sm text-gray-400 mt-1">לחץ להתחלה</div>
                </div>
              </div>
            </div>
          )
        ) : (
          // Shared Bots Tab
          sharedBots.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-24 h-24 bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Share2 className="w-12 h-12 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">אין בוטים משותפים</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                כשמישהו ישתף איתך בוט, הוא יופיע כאן ותוכל לצפות ולערוך אותו
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sharedBots.map((bot) => (
                <div
                  key={bot.id}
                  onClick={() => navigate(`/bots/${bot.id}`)}
                  className="group relative bg-white rounded-2xl border border-purple-100 hover:border-purple-300 shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden"
                >
                  {/* Permission badge */}
                  <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium ${
                    bot.permission === 'admin' ? 'bg-purple-100 text-purple-700' :
                    bot.permission === 'edit' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {bot.permission === 'admin' ? '👑 מנהל' : bot.permission === 'edit' ? '✏️ עריכה' : '👁️ צפייה'}
                  </div>
                  
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Bot className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-lg truncate">{bot.name}</h3>
                        <p className="text-sm text-gray-500 truncate mt-1">
                          {bot.description || 'ללא תיאור'}
                        </p>
                        <p className="text-xs text-purple-500 mt-2 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          שותף ע״י: {bot.owner_name || bot.owner_email}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-4 py-3 bg-purple-50/50 border-t border-purple-100 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(bot.permission === 'edit' || bot.permission === 'admin') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}`); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-100 text-indigo-600 hover:bg-indigo-200 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        עריכה
                      </button>
                    )}
                    {bot.allow_export && (
                      <>
                        <button
                          onClick={(e) => handleDuplicateClick(e, bot)}
                          className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="שכפול"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleExport(e, bot)}
                          className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="ייצוא"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">יצירת בוט חדש</h2>
                  <p className="text-sm text-gray-500">התחל לבנות אוטומציה</p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">שם הבוט</label>
                <input
                  type="text"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="לדוגמה: בוט תמיכה, בוט מכירות..."
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">תיאור (אופציונלי)</label>
                <textarea
                  value={newBotDesc}
                  onChange={(e) => setNewBotDesc(e.target.value)}
                  placeholder="מה הבוט עושה? למי הוא מיועד?"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowCreate(false)} 
                className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                ביטול
              </button>
              <button 
                onClick={handleCreate} 
                disabled={!newBotName.trim()}
                className="flex-1 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                צור בוט
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gray-100 rounded-2xl">
                  <Settings className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">הגדרות מתקדמות</h2>
                  <p className="text-sm text-gray-500">תגיות, משתנים וקבועים</p>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-2 mb-6 p-1.5 bg-gray-100 rounded-xl">
              <button
                onClick={() => setSettingsTab('tags')}
                className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
                  settingsTab === 'tags' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Tag className="w-4 h-4" /> תגיות
              </button>
              <button
                onClick={() => { setSettingsTab('constants'); fetchVariables(); }}
                className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
                  settingsTab === 'constants' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Settings className="w-4 h-4" /> קבועים
              </button>
              <button
                onClick={() => { setSettingsTab('variables'); fetchVariables(); }}
                className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
                  settingsTab === 'variables' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Variable className="w-4 h-4" /> משתנים
              </button>
            </div>
            
            {/* Tags Tab */}
            {settingsTab === 'tags' && (
              <div>
                <p className="text-sm text-gray-500 mb-4">תגיות משמשות לסינון וקטלוג אנשי קשר</p>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="שם תגית חדשה..."
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <button 
                    onClick={handleAddTag} 
                    className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span key={tag.id} className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-sm font-medium">
                      {tag.name}
                      <button 
                        onClick={() => {
                          setDeleteTagTarget(tag);
                          setShowDeleteTagConfirm(true);
                        }} 
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
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
                <p className="text-sm text-gray-500">
                  משתנים עם ערך קבוע שניתן לשנות פעם אחת ויחול על כל הבוטים.
                </p>
                
                <div className="p-4 bg-purple-50 rounded-xl">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <input
                      type="text"
                      value={newSysVarName}
                      onChange={(e) => setNewSysVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder="שם (באנגלית)"
                      className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm"
                      dir="ltr"
                    />
                    <input
                      type="text"
                      value={newSysVarLabel}
                      onChange={(e) => setNewSysVarLabel(e.target.value)}
                      placeholder="תווית (עברית)"
                      className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm"
                    />
                    <input
                      type="text"
                      value={newSysVarValue}
                      onChange={(e) => setNewSysVarValue(e.target.value)}
                      placeholder="ערך"
                      className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <button 
                    onClick={handleAddSystemVariable} 
                    disabled={!newSysVarName.trim() || !newSysVarValue.trim()}
                    className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" /> הוסף קבוע
                  </button>
                </div>
                
                <div className="space-y-2">
                  {customSystemVars.map(v => (
                    <div key={v.id} className="flex items-center gap-3 p-4 bg-white border border-purple-200 rounded-xl">
                      <code className="text-purple-600 font-mono text-sm bg-purple-50 px-3 py-1.5 rounded-lg">{`{{${v.name}}}`}</code>
                      {editingVariable === `const-${v.id}` ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editVarLabel}
                            onChange={(e) => setEditVarLabel(e.target.value)}
                            placeholder="תווית..."
                            className="w-32 px-3 py-1.5 border border-purple-300 rounded-lg text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateVariableLabel(v.id, editVarLabel);
                                setEditingVariable(null);
                              }
                              if (e.key === 'Escape') setEditingVariable(null);
                            }}
                          />
                          <button onClick={() => { handleUpdateVariableLabel(v.id, editVarLabel); setEditingVariable(null); }} className="p-1 bg-purple-600 text-white rounded">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingVariable(null)} className="p-1 bg-gray-200 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => { setEditingVariable(`const-${v.id}`); setEditVarLabel(v.label || ''); }}
                          className="text-gray-600 text-sm hover:text-purple-600 hover:underline"
                          title="לחץ לעריכת תווית"
                        >
                          {v.label || v.name}
                          {!v.label && <span className="text-xs text-orange-500 mr-1">(חסר תווית)</span>}
                        </button>
                      )}
                      <span className="text-gray-400">=</span>
                      <input
                        type="text"
                        value={v.default_value || ''}
                        onChange={(e) => handleUpdateSystemVariable(v.id, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                      <button 
                        onClick={() => handleDeleteVariable(v.id)} 
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {customSystemVars.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-6">
                      אין משתנים קבועים. הוסף משתנים כמו שם העסק, טלפון וכו'.
                    </p>
                  )}
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
                    <span className="text-xs text-gray-400 font-normal bg-gray-100 px-2 py-0.5 rounded-full">קריאה בלבד</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {systemVariables.map(v => (
                      <div key={v.name} className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl text-sm">
                        <code className="text-purple-600 font-mono text-xs">{`{{${v.name}}}`}</code>
                        <span className="text-gray-500">-</span>
                        <span className="text-gray-700">{v.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* User Variables */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">משתני יוזר</h3>
                  <p className="text-sm text-gray-500 mb-4">משתנים אלו נשמרים על כל איש קשר</p>
                  
                  <div className="flex gap-2 mb-4 p-4 bg-gray-50 rounded-xl">
                    <input
                      type="text"
                      value={newVarName}
                      onChange={(e) => setNewVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder="שם (באנגלית)"
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm"
                      dir="ltr"
                    />
                    <input
                      type="text"
                      value={newVarLabel}
                      onChange={(e) => setNewVarLabel(e.target.value)}
                      placeholder="תווית"
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm"
                    />
                    <input
                      type="text"
                      value={newVarDefault}
                      onChange={(e) => setNewVarDefault(e.target.value)}
                      placeholder="ברירת מחדל"
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm"
                    />
                    <button 
                      onClick={handleAddVariable} 
                      disabled={!newVarName.trim()}
                      className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {userVariables.map(v => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm">
                        <code className="text-indigo-600 font-mono text-xs bg-indigo-50 px-2 py-1 rounded">{`{{${v.name}}}`}</code>
                        <span className="text-gray-400">→</span>
                        {editingVariable === v.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editVarLabel}
                              onChange={(e) => setEditVarLabel(e.target.value)}
                              placeholder="תווית לתצוגה..."
                              className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateVariableLabel(v.id, editVarLabel);
                                  setEditingVariable(null);
                                }
                                if (e.key === 'Escape') {
                                  setEditingVariable(null);
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                handleUpdateVariableLabel(v.id, editVarLabel);
                                setEditingVariable(null);
                              }}
                              className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEditingVariable(null)}
                              className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-gray-700 font-medium">{v.label || v.name}</span>
                            {!v.label && (
                              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded">חסר תווית</span>
                            )}
                            {v.default_value && (
                              <span className="text-xs text-gray-400">(ברירת מחדל: {v.default_value})</span>
                            )}
                            <div className="mr-auto flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  setEditingVariable(v.id);
                                  setEditVarLabel(v.label || '');
                                }}
                                className="p-2 hover:bg-indigo-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                                title="ערוך תווית"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteVariable(v.id)} 
                                className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                                title="מחק משתנה"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {userVariables.length === 0 && (
                      <p className="text-gray-400 text-sm text-center py-6">
                        אין משתני יוזר. משתנים יתווספו אוטומטית כשתשתמש בהם בבוטים.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setShowSettings(false)} 
                className="w-full px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCancelImport}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-2xl">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">ייבוא בוט</h2>
              </div>
              <button onClick={handleCancelImport} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {!importData ? (
              <div 
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer"
                onClick={() => document.getElementById('import-file').click()}
              >
                <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium mb-2">לחץ לבחירת קובץ</p>
                <p className="text-xs text-gray-400">קובץ JSON שיוצא ממערכת Botomat</p>
                <input
                  id="import-file"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="p-6 bg-green-50 rounded-2xl text-center">
                  <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Bot className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="text-green-700 font-bold">קובץ נקרא בהצלחה!</p>
                  {importData.bot.description && (
                    <p className="text-sm text-green-600 mt-1">{importData.bot.description}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">שם הבוט</label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="הזן שם לבוט..."
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none"
                    autoFocus
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={handleCancelImport} 
                    className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                  >
                    ביטול
                  </button>
                  <button 
                    onClick={handleImportConfirm} 
                    disabled={!importName.trim() || importing}
                    className="flex-1 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg disabled:opacity-50"
                  >
                    {importing ? 'מייבא...' : 'ייבא בוט'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share Bot Modal */}
      {shareBot && (
        <ShareBotModal bot={shareBot} onClose={() => setShareBot(null)} />
      )}

      {/* Duplicate Modal */}
      {showDuplicate && duplicateBot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDuplicate(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-2xl">
                  <Copy className="w-6 h-6 text-purple-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">שכפול בוט</h2>
              </div>
              <button onClick={() => setShowDuplicate(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 bg-purple-50 rounded-2xl mb-6 text-center">
              <p className="text-purple-700">יוצר עותק של</p>
              <p className="text-purple-900 font-bold text-lg">"{duplicateBot.name}"</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שם הבוט החדש</label>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="הזן שם..."
                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDuplicate(false)} className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50">
                ביטול
              </button>
              <button onClick={handleDuplicateConfirm} disabled={!duplicateName.trim()} className="flex-1 px-6 py-3.5 bg-purple-600 text-white rounded-xl font-bold shadow-lg hover:bg-purple-700 disabled:opacity-50">
                שכפל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteBotTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 rounded-2xl">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">מחיקת בוט</h2>
              </div>
              <button onClick={() => setShowDeleteConfirm(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 bg-red-50 rounded-2xl mb-6 text-center">
              <p className="text-red-700">האם למחוק את הבוט</p>
              <p className="text-red-900 font-bold text-xl my-2">"{deleteBotTarget.name}"?</p>
              <p className="text-red-600 text-sm">פעולה זו לא ניתנת לביטול</p>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50">
                ביטול
              </button>
              <button onClick={handleDeleteConfirm} className="flex-1 px-6 py-3.5 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700">
                מחק לצמיתות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Required Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowUpgradeModal(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {upgradeError?.code === 'HAS_DISABLED_BOT' ? 'יש לך בוט כבוי' : 'הגעת למגבלת הבוטים'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {upgradeError?.code === 'HAS_DISABLED_BOT' 
                      ? 'הפעל או מחק את הבוט הכבוי' 
                      : `${upgradeError?.used || 0} מתוך ${upgradeError?.limit || 1} בוטים`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl mb-6">
              {upgradeError?.code === 'HAS_DISABLED_BOT' ? (
                <div className="text-center">
                  <Pause className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                  <p className="text-amber-800 font-medium mb-2">
                    יש לך בוט במצב מושהה
                  </p>
                  <p className="text-amber-600 text-sm">
                    לפני שתוכל ליצור בוט חדש, עליך להפעיל או למחוק את הבוט הכבוי
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Bot className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                  <p className="text-amber-800 font-medium mb-2">
                    החבילה הנוכחית שלך מאפשרת עד {upgradeError?.limit || 1} בוטים
                  </p>
                  <p className="text-amber-600 text-sm">
                    שדרג את החבילה שלך כדי ליצור בוטים נוספים ולפתוח יכולות מתקדמות
                  </p>
                </div>
              )}
            </div>
            
            {/* Benefits */}
            {upgradeError?.code !== 'HAS_DISABLED_BOT' && (
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-green-800 text-sm">יותר בוטים פעילים</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                  <Zap className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-800 text-sm">יותר הרצות פלואו בחודש</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
                  <Users className="w-5 h-5 text-purple-600" />
                  <span className="text-purple-800 text-sm">יותר אנשי קשר</span>
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <button 
                onClick={() => setShowUpgradeModal(false)} 
                className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                אחר כך
              </button>
              {upgradeError?.code === 'HAS_DISABLED_BOT' ? (
                <button 
                  onClick={() => {
                    setShowUpgradeModal(false);
                    // Filter to find disabled bots
                    const disabledBot = bots.find(b => !b.is_active);
                    if (disabledBot) {
                      navigate(`/bots/${disabledBot.id}`);
                    }
                  }}
                  className="flex-1 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
                >
                  עבור לבוט הכבוי
                </button>
              ) : (
                <button 
                  onClick={() => {
                    setShowUpgradeModal(false);
                    navigate('/pricing');
                  }}
                  className="flex-1 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <Crown className="w-5 h-5" />
                  שדרג עכשיו
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Tag Confirmation Modal */}
      {showDeleteTagConfirm && deleteTagTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">מחיקת תגית</h3>
              <p className="text-gray-500">
                האם אתה בטוח שברצונך למחוק את התגית <span className="font-bold text-gray-900">"{deleteTagTarget.name}"</span>?
              </p>
              <p className="text-sm text-amber-600 mt-2 bg-amber-50 px-4 py-2 rounded-lg">
                ⚠️ התגית תוסר מכל אנשי הקשר שלך
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowDeleteTagConfirm(false);
                  setDeleteTagTarget(null);
                }} 
                className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                ביטול
              </button>
              <button 
                onClick={() => handleDeleteTag(deleteTagTarget.id)}
                className="flex-1 px-6 py-3.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                מחק תגית
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
