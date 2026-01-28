import { useState, useEffect, useRef } from 'react';
import { 
  ChevronDown, User, Plus, Search, Check, Users, LogOut, 
  Building, UserPlus, ArrowLeftRight, X, Mail, Lock, Eye, EyeOff
} from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function AccountSwitcher() {
  const { user, setTokens, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState({ current: null, clients: [], linked: [] });
  const [loading, setLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingAs, setViewingAs] = useState(null);
  const dropdownRef = useRef(null);

  // Load accessible accounts
  const loadAccounts = async () => {
    try {
      const { data } = await api.get('/experts/accessible-accounts');
      setAccounts(data);
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
  };

  useEffect(() => {
    loadAccounts();
    
    // Check if we're viewing as another account
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.viewingAs) {
          setViewingAs(payload.viewingAs);
        }
      } catch (e) {}
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchAccount = async (targetUserId) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/experts/switch/${targetUserId}`);
      
      // Store the original token for returning
      const originalToken = localStorage.getItem('accessToken');
      if (!viewingAs) {
        localStorage.setItem('originalAccessToken', originalToken);
      }
      
      // Set the new token
      localStorage.setItem('accessToken', data.token);
      setTokens(data.token, localStorage.getItem('refreshToken'));
      
      // Reload the page to apply new context
      window.location.reload();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במעבר חשבון');
    } finally {
      setLoading(false);
      setIsOpen(false);
    }
  };

  const handleReturnToMyAccount = () => {
    const originalToken = localStorage.getItem('originalAccessToken');
    if (originalToken) {
      localStorage.setItem('accessToken', originalToken);
      localStorage.removeItem('originalAccessToken');
      window.location.reload();
    }
  };

  const allAccounts = [...accounts.clients, ...accounts.linked];

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                {(user?.name || user?.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900">{user?.name || 'משתמש'}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Viewing As Banner */}
        {viewingAs && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white" />
        )}

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
            {/* Current Account */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-2">חשבון נוכחי</p>
              <div className="flex items-center gap-3">
                {accounts.current?.avatar_url ? (
                  <img src={accounts.current.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                    {(accounts.current?.name || accounts.current?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{accounts.current?.name || 'ללא שם'}</p>
                  <p className="text-xs text-gray-500">{accounts.current?.email}</p>
                </div>
                <Check className="w-5 h-5 text-green-500" />
              </div>
              
              {viewingAs && (
                <button
                  onClick={handleReturnToMyAccount}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 text-sm font-medium"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  חזור לחשבון שלי
                </button>
              )}
            </div>

            {/* Other Accounts */}
            {allAccounts.length > 0 && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-2">חשבונות נגישים</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {allAccounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => handleSwitchAccount(account.id)}
                      disabled={loading}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {account.avatar_url ? (
                        <img src={account.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium">
                          {(account.name || account.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium text-gray-900">{account.name || 'ללא שם'}</p>
                        <p className="text-xs text-gray-500">{account.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        account.access_type === 'linked' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {account.access_type === 'linked' ? 'מקושר' : 'גישה'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="px-4 py-2 space-y-1">
              <button
                onClick={() => { setShowRequestModal(true); setIsOpen(false); }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm">בקש גישה לחשבון</span>
              </button>
              
              <button
                onClick={() => { setShowCreateModal(true); setIsOpen(false); }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-sm">צור חשבון חדש</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Request Access Modal */}
      {showRequestModal && (
        <RequestAccessModal 
          onClose={() => setShowRequestModal(false)} 
          onSuccess={() => { setShowRequestModal(false); loadAccounts(); }}
        />
      )}

      {/* Create Linked Account Modal */}
      {showCreateModal && (
        <CreateLinkedAccountModal 
          onClose={() => setShowCreateModal(false)} 
          onSuccess={() => { setShowCreateModal(false); loadAccounts(); }}
        />
      )}
    </>
  );
}

// Request Access Modal
function RequestAccessModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/experts/request-access', { email, message });
      alert('בקשת הגישה נשלחה בהצלחה');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשליחת בקשה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">בקש גישה לחשבון</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-1">הזן את האימייל של בעל החשבון</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הודעה (אופציונלי)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="הסבר קצר למה אתה מבקש גישה..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading || !email}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {loading ? 'שולח...' : 'שלח בקשה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create Linked Account Modal
function CreateLinkedAccountModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/experts/create-linked-account', form);
      alert('החשבון נוצר בהצלחה');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה ביצירת חשבון');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">צור חשבון מקושר</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-1">החשבון יהיה מקושר אליך אוטומטית</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
                required
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם (אופציונלי)</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="שם החשבון"
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="לפחות 6 תווים"
                required
                minLength={6}
                className="w-full pr-10 pl-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading || !form.email || !form.password}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {loading ? 'יוצר...' : 'צור חשבון'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
