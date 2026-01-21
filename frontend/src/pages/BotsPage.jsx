import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Play, Pause, Trash2, Edit2, X } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useBotsStore from '../store/botsStore';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';

export default function BotsPage() {
  const navigate = useNavigate();
  const { user, logout, fetchMe } = useAuthStore();
  const { bots, fetchBots, createBot, updateBot, deleteBot } = useBotsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotDesc, setNewBotDesc] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchBots();
  }, []);

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            ← חזרה
          </Button>
          <Logo />
          <Button variant="ghost" onClick={handleLogout}>
            התנתק
          </Button>
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
                <button 
                  onClick={() => setShowCreate(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    שם הבוט
                  </label>
                  <input
                    type="text"
                    value={newBotName}
                    onChange={(e) => setNewBotName(e.target.value)}
                    placeholder="לדוגמה: בוט תמיכה"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-200 focus:border-primary-500 outline-none"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תיאור (אופציונלי)
                  </label>
                  <textarea
                    value={newBotDesc}
                    onChange={(e) => setNewBotDesc(e.target.value)}
                    placeholder="מה הבוט הזה עושה?"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-200 focus:border-primary-500 outline-none resize-none"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowCreate(false)}
                  className="flex-1 !rounded-xl"
                >
                  ביטול
                </Button>
                <Button 
                  onClick={handleCreate}
                  className="flex-1 !rounded-xl"
                  disabled={!newBotName.trim()}
                >
                  צור בוט
                </Button>
              </div>
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
              <p className="text-gray-500 mb-6">צור את הבוט הראשון שלך וה תחיל לאוטומט</p>
              <Button onClick={() => setShowCreate(true)} className="!rounded-xl">
                <Plus className="w-4 h-4 ml-2" />
                צור בוט ראשון
              </Button>
            </div>
          ) : (
            bots.map((bot) => (
              <div
                key={bot.id}
                onClick={() => navigate(`/bots/${bot.id}`)}
                className="bg-white/80 backdrop-blur rounded-2xl border border-gray-200 p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:border-primary-200 transition-all group"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                  bot.is_active 
                    ? 'bg-gradient-to-br from-green-400 to-green-500' 
                    : 'bg-gray-100'
                }`}>
                  <Bot className={`w-7 h-7 ${
                    bot.is_active ? 'text-white' : 'text-gray-400'
                  }`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800">{bot.name}</h3>
                    {bot.is_active && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        פעיל
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {bot.description || 'ללא תיאור'}
                  </p>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleToggle(e, bot)}
                    className={`p-2.5 rounded-xl transition-colors ${
                      bot.is_active 
                        ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={bot.is_active ? 'כבה בוט' : 'הפעל בוט'}
                  >
                    {bot.is_active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/bots/${bot.id}`);
                    }}
                    className="p-2.5 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                    title="ערוך בוט"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={(e) => handleDelete(e, bot)}
                    className="p-2.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                    title="מחק בוט"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
