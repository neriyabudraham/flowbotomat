import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeftRight, Pencil, Check, X, Wifi, WifiOff, Crown, CreditCard } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function SubAccountsPage() {
  const navigate = useNavigate();
  const { setTokens } = useAuthStore();
  const [data, setData] = useState({ parentEmail: '', parentPlan: 'Free', subAccounts: [] });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [switching, setSwitching] = useState(null);

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

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/experts/create-sub-account', { name: newName.trim() });
      setNewName('');
      setShowCreate(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת חשבון משנה');
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
      alert(e.response?.data?.error || 'שגיאה בשינוי שם');
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
      window.location.reload();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במעבר חשבון');
      setSwitching(null);
    }
  };

  const canCreate = data.parentPlan !== 'Free';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">החשבונות שלי</h1>
          <p className="text-gray-500 text-sm mt-1">ניהול חשבונות משנה מקושרים לחשבון הראשי</p>
        </div>
        {canCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            חשבון משנה חדש
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-500 rounded-xl text-sm">
            <Crown className="w-4 h-4" />
            נדרש מנוי בתשלום
          </div>
        )}
      </div>

      {/* Create new sub-account inline */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-purple-200 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">חשבון משנה חדש</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="שם החשבון..."
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-5 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 font-medium disabled:opacity-50 text-sm"
            >
              {creating ? 'יוצר...' : 'צור'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(''); }}
              className="px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm"
            >
              ביטול
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            💳 אמצעי התשלום שלך יועתק אוטומטית. כל חשבון משנה דורש מנוי נפרד לחיבור ווצאפ.
          </p>
        </div>
      )}

      {/* Sub-accounts list */}
      {data.subAccounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">אין חשבונות משנה</h3>
          <p className="text-gray-500 text-sm mb-4">
            צור חשבון משנה כדי לחבר מספר ווצאפ נוסף תחת אותו חשבון
          </p>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 font-medium"
            >
              צור חשבון משנה ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {data.subAccounts.map(account => (
            <div
              key={account.id}
              className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
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
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(account.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button onClick={() => handleRename(account.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900 truncate">{account.name}</h3>
                      <button
                        onClick={() => { setEditingId(account.id); setEditName(account.name || ''); }}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="שנה שם"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-1">
                    {/* WhatsApp status */}
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      account.whatsappStatus === 'connected' ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {account.whatsappStatus === 'connected' ? (
                        <><Wifi className="w-3 h-3" /> {account.whatsappPhone || 'מחובר'}</>
                      ) : (
                        <><WifiOff className="w-3 h-3" /> לא מחובר</>
                      )}
                    </span>

                    {/* Plan */}
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                      account.planName === 'Free'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      <CreditCard className="w-3 h-3" />
                      {account.planName}
                    </span>
                  </div>
                </div>

                {/* Switch button */}
                <button
                  onClick={() => handleSwitch(account.id)}
                  disabled={switching === account.id}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium text-sm transition-colors disabled:opacity-50 shrink-0"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {switching === account.id ? 'עובר...' : 'עבור לחשבון'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
