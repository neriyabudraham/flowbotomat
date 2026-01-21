import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Play, Pause, Trash2, Edit2, X, Users, Zap, Settings, Tag } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useBotsStore from '../store/botsStore';
import Button from '../components/atoms/Button';
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
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchBots();
    fetchTags();
  }, []);

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

  const handleDelete = async (e, bot) => {
    e.stopPropagation();
    if (!confirm(`למחוק את הבוט "${bot.name}"?`)) return;
    await deleteBot(bot.id);
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
          <div className="flex gap-2">
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">הבוטים שלי</h1>
            <p className="text-gray-500 text-sm mt-1">צור ונהל בוטים אוטומטיים</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="!rounded-xl">
            <Plus className="w-4 h-4 ml-2" />
            בוט חדש
          </Button>
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
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">הגדרות מתקדמות</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {/* Tags Management */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4" /> ניהול תגיות
                </h3>
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

              <Button variant="ghost" onClick={() => setShowSettings(false)} className="w-full !rounded-xl">סגור</Button>
            </div>
          </div>
        )}

        {/* Bots List */}
        <div className="space-y-4">
          {bots.length === 0 ? (
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
                        onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}`); }}
                        className="p-2.5 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, bot)}
                        className="p-2.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-200"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
