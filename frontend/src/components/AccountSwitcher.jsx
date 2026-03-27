import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, Plus, Check, Shield,
  UserPlus, ArrowLeftRight, X, Mail, Copy, ExternalLink, Link2, Users
} from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

// Hide internal #sub_ email — show parent email or nothing
function displayEmail(email) {
  if (!email) return '';
  if (email.includes('#sub_')) return null;
  return email;
}

export default function AccountSwitcher() {
  const navigate = useNavigate();
  const { user, setTokens } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  const isAdmin = user && ['admin', 'superadmin'].includes(user.role);
  const [accounts, setAccounts] = useState({ current: null, original: null, clients: [], linked: [], isViewingAs: false });
  const [loading, setLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [viewingAs, setViewingAs] = useState(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copied, setCopied] = useState(false);
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

      const originalToken = localStorage.getItem('accessToken');
      if (!localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', originalToken);
      }

      localStorage.setItem('accessToken', data.token);
      setTokens(data.token, localStorage.getItem('refreshToken'));
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

  const handleCreateLinkedAccount = async () => {
    setCreatingLink(true);
    setIsOpen(false);
    try {
      const { data } = await api.post('/experts/generate-link-code');
      const link = `${window.location.origin}/signup?link=${data.code}`;
      setGeneratedLink(link);
      setShowLinkModal(true);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת קישור');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenLink = () => {
    if (generatedLink) {
      window.open(generatedLink, '_blank');
    }
  };

  // Build all accounts list, excluding the current one
  const allAccounts = [...accounts.clients, ...accounts.linked].filter(a => a.id !== accounts.current?.id);
  const hasSubAccounts = accounts.linked.length > 0;

  // For display: show the user's real email (not #sub_)
  const currentDisplayEmail = displayEmail(accounts.current?.email);

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
              <p className="text-sm font-medium text-gray-900">{user?.name || user?.phone || user?.email || 'משתמש'}</p>
              {currentDisplayEmail && <p className="text-xs text-gray-500">{currentDisplayEmail}</p>}
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
          <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 max-h-[70vh] overflow-hidden flex flex-col">
            {/* Current Account */}
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <p className="text-xs text-gray-500 mb-2">חשבון נוכחי</p>
              <div className="flex items-center gap-3">
                {accounts.current?.avatar_url ? (
                  <img src={accounts.current.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
                    {(accounts.current?.name || accounts.current?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{accounts.current?.name || 'ללא שם'}</p>
                  {currentDisplayEmail && <p className="text-xs text-gray-500 truncate">{currentDisplayEmail}</p>}
                </div>
                <Check className="w-5 h-5 text-green-500 shrink-0" />
              </div>
            </div>

            {/* All Accessible Accounts */}
            {(allAccounts.length > 0 || accounts.original) && (
              <div className="px-4 py-3 border-b border-gray-100 overflow-y-auto flex-1">
                <p className="text-xs text-gray-500 mb-2">חשבונות נגישים</p>
                <div className="space-y-1">
                  {/* Show original (my account) when viewing as another */}
                  {accounts.original && accounts.isViewingAs && (
                    <button
                      onClick={handleReturnToMyAccount}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-orange-50 bg-orange-50/50 transition-colors border border-orange-200"
                    >
                      {accounts.original.avatar_url ? (
                        <img src={accounts.original.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                          {(accounts.original.name || accounts.original.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-medium text-gray-900 truncate">{accounts.original.name || 'ללא שם'}</p>
                        {displayEmail(accounts.original.email) && (
                          <p className="text-xs text-gray-500 truncate">{displayEmail(accounts.original.email)}</p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium whitespace-nowrap shrink-0">
                        החשבון שלי
                      </span>
                    </button>
                  )}

                  {allAccounts.map((account) => {
                    const email = displayEmail(account.email);
                    return (
                      <button
                        key={account.id}
                        onClick={() => handleSwitchAccount(account.id)}
                        disabled={loading || account.isCurrentlyViewing}
                        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors disabled:opacity-50 ${
                          account.isCurrentlyViewing
                            ? 'bg-green-50 border border-green-200'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {account.avatar_url ? (
                          <img src={account.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium shrink-0">
                            {(account.name || account.email || 'U')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-medium text-gray-900 truncate">{account.name || 'ללא שם'}</p>
                          {email && <p className="text-xs text-gray-500 truncate">{email}</p>}
                        </div>
                        {account.isCurrentlyViewing ? (
                          <Check className="w-5 h-5 text-green-500 shrink-0" />
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                            account.access_type === 'linked'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {account.access_type === 'linked' ? 'משנה' : 'גישה'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="px-4 py-2 space-y-1 shrink-0">
              {/* My Accounts page (when sub-accounts exist) */}
              {hasSubAccounts && (
                <button
                  onClick={() => { navigate('/accounts'); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-purple-50 text-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-purple-600" />
                  </div>
                  <span className="text-sm font-medium">החשבונות שלי</span>
                </button>
              )}

              {/* Create sub-account (only when no sub-accounts yet) */}
              {!hasSubAccounts && (
                <button
                  onClick={() => { navigate('/accounts'); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-purple-600" />
                  </div>
                  <span className="text-sm">צור חשבון משנה</span>
                </button>
              )}

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
                onClick={handleCreateLinkedAccount}
                disabled={creatingLink}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-gray-600" />
                </div>
                <span className="text-sm">{creatingLink ? 'יוצר...' : 'קישור הרשמה לחשבון מקושר'}</span>
              </button>
            </div>

            {/* Admin Panel Link */}
            {isAdmin && (
              <div className="px-4 py-2 border-t border-gray-100 shrink-0">
                <button
                  onClick={() => { navigate('/admin'); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-red-50 text-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-red-600" />
                  </div>
                  <span className="text-sm font-medium text-red-700">ממשק ניהול</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request Access Modal */}
      {showRequestModal && createPortal(
        <RequestAccessModal
          onClose={() => setShowRequestModal(false)}
          onSuccess={() => { setShowRequestModal(false); loadAccounts(); }}
        />,
        document.body
      )}

      {/* Link Modal */}
      {showLinkModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">קישור להרשמה</h2>
                <button onClick={() => setShowLinkModal(false)} className="text-white/80 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">שתף את הקישור ליצירת חשבון מקושר</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Link2 className="w-7 h-7 text-purple-600" />
                </div>
                <p className="text-gray-600 text-sm">
                  מי שיירשם דרך הקישור יקושר אוטומטית לחשבון שלך
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={generatedLink || ''}
                    readOnly
                    dir="ltr"
                    className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`p-2.5 rounded-lg transition-colors ${copied ? 'bg-green-100 text-green-600' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`}
                    title="העתק"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleOpenLink}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  פתח הרשמה
                </button>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50"
                >
                  סגור
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                הקישור תקף ל-24 שעות
              </p>
            </div>
          </div>
        </div>,
        document.body
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
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשליחת בקשה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
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
                dir="ltr"
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
