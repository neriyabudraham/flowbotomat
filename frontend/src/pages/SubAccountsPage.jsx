import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ArrowLeftRight, Pencil, Check, X, Wifi, WifiOff, Crown, CreditCard,
  ArrowLeft, Users, Shield, Smartphone, Search, Trash2
} from 'lucide-react';
import api from '../services/api';
import { toast } from '../store/toastStore';
import useAuthStore from '../store/authStore';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
import Logo from '../components/atoms/Logo';

export default function SubAccountsPage() {
  const navigate = useNavigate();
  const { user, logout, setTokens, fetchMe } = useAuthStore();
  const [data, setData] = useState({ parentEmail: '', parentPlan: 'Free', subAccounts: [] });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [switching, setSwitching] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: result } = await api.get('/experts/sub-accounts');
      setData(result);
    } catch (e) {
      console.error('Failed to load sub-accounts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { navigate('/login'); return; }
    fetchMe();
    load();
  }, [load, navigate]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/experts/create-sub-account', { name: newName.trim() });
      setNewName('');
      setShowCreate(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'שגיאה ביצירת חשבון משנה');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id) => {
    if (!editName.trim()) return;
    try {
      await api.put(`/experts/sub-accounts/${id}/rename`, { name: editName.trim() });
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'שגיאה בשינוי שם');
    }
  };

  const handleSwitch = async (targetId) => {
    setSwitching(targetId);
    try {
      const { data: result } = await api.post(`/experts/switch/${targetId}`);
      if (!localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', localStorage.getItem('accessToken'));
      }
      localStorage.setItem('accessToken', result.token);
      setTokens(result.token, localStorage.getItem('refreshToken'));
      window.location.href = '/dashboard';
    } catch (e) {
      toast.error(e.response?.data?.error || 'שגיאה במעבר חשבון');
      setSwitching(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את חשבון המשנה "${name}"?\n\nכל הנתונים כולל בוטים, אנשי קשר והודעות יימחקו לצמיתות!`)) return;
    try {
      await api.delete(`/experts/sub-accounts/${id}`);
      toast.success('חשבון המשנה נמחק בהצלחה');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'שגיאה במחיקת חשבון משנה');
    }
  };

  const canCreate = data.parentPlan !== 'Free';
  const connectedCount = data.subAccounts.filter(a => a.whatsappStatus === 'connected').length;
  const filteredAccounts = data.subAccounts.filter(a =>
    (a.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50" dir="rtl">

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
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-500 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">החשבונות שלי</h1>
                    <p className="text-white/70">ניהול חשבונות משנה וחיבורי ווצאפ נוספים</p>
                  </div>
                </div>

                {/* Quick Stats */}
                {!loading && (
                  <div className="flex items-center gap-6 mt-6">
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{data.subAccounts.length}</div>
                        <div className="text-xs text-white/60">חשבונות משנה</div>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-white/20" />
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-green-400/30 rounded-lg">
                        <Wifi className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{connectedCount}</div>
                        <div className="text-xs text-white/60">מחוברים</div>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-white/20" />
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{data.parentPlan}</div>
                        <div className="text-xs text-white/60">מנוי ראשי</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                {canCreate ? (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  >
                    <Plus className="w-5 h-5" />
                    חשבון משנה חדש
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/pricing')}
                    className="flex items-center gap-2 px-5 py-3 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-medium transition-all"
                  >
                    <Crown className="w-5 h-5" />
                    שדרג ליצירת חשבונות
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        {data.subAccounts.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש חשבון..."
                className="pr-10 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none w-64"
              />
            </div>
            <p className="text-sm text-gray-500">
              {data.subAccounts.length} חשבונות משנה
            </p>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">חשבון משנה חדש</h2>
                  <button onClick={() => setShowCreate(false)} className="text-white/80 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-white/70 text-sm mt-1">החשבון יקושר אליך ואמצעי התשלום יועתק</p>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">שם החשבון</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder='לדוגמה: "מספר ווצאפ 2"'
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                    dir="rtl"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs text-blue-700">💳 אמצעי התשלום הנוכחי שלך יועתק אוטומטית.</p>
                  <p className="text-xs text-blue-700">📋 כל חשבון משנה דורש בחירת מנוי נפרד לחיבור ווצאפ.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 font-medium disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {creating ? 'יוצר...' : 'צור חשבון'}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setNewName(''); }}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          </div>
        ) : data.subAccounts.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-3xl border border-gray-200 p-16 text-center shadow-sm">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Smartphone className="w-10 h-10 text-purple-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">עדיין אין חשבונות משנה</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              צור חשבונות משנה כדי לחבר מספרי ווצאפ נוספים תחת אותו חשבון ראשי.
              כל חשבון משנה יכול להריץ בוטים עצמאיים.
            </p>
            {canCreate ? (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                צור חשבון משנה ראשון
              </button>
            ) : (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-sm">
                  <Crown className="w-4 h-4" />
                  נדרש מנוי בתשלום ליצירת חשבונות משנה
                </div>
                <br />
                <button
                  onClick={() => navigate('/pricing')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold"
                >
                  <Crown className="w-5 h-5" />
                  צפה במנויים
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Accounts Grid */
          <div className="grid gap-4">
            {filteredAccounts.map(account => (
              <div
                key={account.id}
                className="group bg-white rounded-2xl border border-gray-200 p-6 hover:border-purple-200 hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-5">
                  {/* Avatar */}
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-lg shadow-purple-200/50">
                    {(account.name || '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {editingId === account.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="flex-1 px-3 py-2 border border-purple-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none bg-purple-50"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(account.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button onClick={() => handleRename(account.id)} className="p-2 bg-green-100 text-green-600 hover:bg-green-200 rounded-xl transition-colors">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-2 bg-gray-100 text-gray-400 hover:bg-gray-200 rounded-xl transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900 truncate">{account.name}</h3>
                        <button
                          onClick={() => { setEditingId(account.id); setEditName(account.name || ''); }}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          title="שנה שם"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-1.5">
                      {/* WhatsApp status */}
                      <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${
                        account.whatsappStatus === 'connected'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-50 text-gray-500'
                      }`}>
                        {account.whatsappStatus === 'connected' ? (
                          <><Wifi className="w-3.5 h-3.5" /> {account.whatsappPhone || 'מחובר'}</>
                        ) : (
                          <><WifiOff className="w-3.5 h-3.5" /> לא מחובר</>
                        )}
                      </div>

                      {/* Plan */}
                      <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${
                        account.planName === 'Free'
                          ? 'bg-gray-50 text-gray-500'
                          : 'bg-purple-50 text-purple-700'
                      }`}>
                        <CreditCard className="w-3.5 h-3.5" />
                        {account.planName}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSwitch(account.id)}
                      disabled={switching === account.id}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium text-sm transition-all hover:shadow-lg hover:shadow-purple-200/50 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      {switching === account.id ? 'עובר...' : 'עבור לחשבון'}
                    </button>
                    <button
                      onClick={() => handleDelete(account.id, account.name)}
                      className="p-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-colors"
                      title="מחק חשבון משנה"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
