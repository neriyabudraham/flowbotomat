import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Play, Pause, Trash2, Edit2 } from 'lucide-react';
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
      const bot = await createBot(newBotName);
      setNewBotName('');
      setShowCreate(false);
      navigate(`/bots/${bot.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (bot) => {
    await updateBot(bot.id, { is_active: !bot.is_active });
  };

  const handleDelete = async (bot) => {
    if (!confirm(`למחוק את הבוט "${bot.name}"?`)) return;
    await deleteBot(bot.id);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">הבוטים שלי</h1>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 ml-2" />
            בוט חדש
          </Button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4">יצירת בוט חדש</h2>
              <input
                type="text"
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                placeholder="שם הבוט..."
                className="w-full px-4 py-2 border rounded-lg mb-4"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  ביטול
                </Button>
                <Button onClick={handleCreate}>צור בוט</Button>
              </div>
            </div>
          </div>
        )}

        {/* Bots List */}
        <div className="space-y-4">
          {bots.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>אין בוטים עדיין</p>
              <p className="text-sm">לחץ על "בוט חדש" כדי להתחיל</p>
            </div>
          ) : (
            bots.map((bot) => (
              <div
                key={bot.id}
                className="bg-white rounded-xl shadow p-4 flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  bot.is_active ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <Bot className={`w-6 h-6 ${
                    bot.is_active ? 'text-green-600' : 'text-gray-400'
                  }`} />
                </div>
                
                <div className="flex-1">
                  <h3 className="font-semibold">{bot.name}</h3>
                  <p className="text-sm text-gray-500">
                    {bot.description || 'ללא תיאור'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(bot)}
                    className={`p-2 rounded-lg transition-colors ${
                      bot.is_active 
                        ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={bot.is_active ? 'כבה בוט' : 'הפעל בוט'}
                  >
                    {bot.is_active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  
                  <button
                    onClick={() => navigate(`/bots/${bot.id}`)}
                    className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200"
                    title="ערוך בוט"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={() => handleDelete(bot)}
                    className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
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
