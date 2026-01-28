import { useState, useEffect } from 'react';
import { 
  UserCog, Plus, Trash2, Shield, Eye, Edit, Users, BarChart3, X, 
  Check, Mail, Clock, UserPlus, AlertCircle, ChevronDown, ChevronUp,
  ArrowRight, XCircle, AlertTriangle
} from 'lucide-react';
import api from '../../services/api';

const PERMISSIONS = [
  { key: 'can_view_bots', label: 'צפייה בבוטים', icon: Eye },
  { key: 'can_edit_bots', label: 'עריכת בוטים', icon: Edit },
  { key: 'can_manage_contacts', label: 'ניהול אנשי קשר', icon: Users },
  { key: 'can_view_analytics', label: 'צפייה בסטטיסטיקות', icon: BarChart3 },
];

export default function ExpertAccessManager() {
  const [experts, setExperts] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [email, setEmail] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [permissions, setPermissions] = useState({
    can_view_bots: true,
    can_edit_bots: true,
    can_manage_contacts: true,
    can_view_analytics: true,
  });
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState(null);
  const [approving, setApproving] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { type, id, name }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [expertsRes, requestsRes] = await Promise.all([
        api.get('/experts/my-experts'),
        api.get('/experts/pending-requests')
      ]);
      setExperts(expertsRes.data.experts || []);
      setPendingRequests(requestsRes.data.requests || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setInviting(true);
    setMessage(null);
    
    try {
      const { data } = await api.post('/experts/invite', { email: email.trim(), permissions });
      setMessage({ type: 'success', text: data.message });
      setEmail('');
      setShowInvite(false);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה בהוספת מומחה' });
    } finally {
      setInviting(false);
    }
  };

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setInviting(true);
    setMessage(null);
    
    try {
      await api.post('/experts/request-access', { 
        email: email.trim(), 
        message: requestMessage.trim() || undefined 
      });
      setMessage({ type: 'success', text: 'בקשת הגישה נשלחה בהצלחה' });
      setEmail('');
      setRequestMessage('');
      setShowRequest(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה בשליחת בקשה' });
    } finally {
      setInviting(false);
    }
  };

  const handleApprove = async (requestId) => {
    setApproving(requestId);
    try {
      await api.post(`/experts/approve/${requestId}`, { permissions });
      setMessage({ type: 'success', text: 'הבקשה אושרה בהצלחה' });
      setShowApproveModal(null);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה באישור בקשה' });
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (requestId) => {
    setApproving(requestId);
    try {
      await api.post(`/experts/reject/${requestId}`);
      setMessage({ type: 'success', text: 'הבקשה נדחתה' });
      setConfirmModal(null);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה בדחיית בקשה' });
    } finally {
      setApproving(null);
    }
  };

  const handleRemove = async (expertId) => {
    try {
      await api.delete(`/experts/expert/${expertId}`);
      setMessage({ type: 'success', text: 'הגישה הוסרה בהצלחה' });
      setConfirmModal(null);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה בהסרה' });
    }
  };

  const handleUpdatePermission = async (expertId, key, value) => {
    try {
      await api.put(`/experts/expert/${expertId}/permissions`, {
        permissions: { [key]: value }
      });
      setExperts(prev => prev.map(e => 
        e.expert_id === expertId ? { ...e, [key]: value } : e
      ));
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון');
    }
  };

  const activeExperts = experts.filter(e => e.is_active && e.status === 'approved');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-xl">
              <UserCog className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">ניהול גישות לחשבון</h2>
              <p className="text-sm text-gray-500">נהל מי יכול לגשת לחשבון שלך ובקש גישה לחשבונות אחרים</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסף גישה
          </button>
          
          <button
            onClick={() => setShowRequest(true)}
            className="flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-600 rounded-xl hover:bg-blue-50 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            בקש גישה לחשבון
          </button>
        </div>

        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="bg-white rounded-2xl border border-orange-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-100 rounded-xl">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">בקשות ממתינות</h3>
              <p className="text-sm text-gray-500">{pendingRequests.length} בקשות גישה ממתינות לאישור</p>
            </div>
          </div>

          <div className="space-y-3">
            {pendingRequests.map(request => (
              <div key={request.id} className="border border-orange-100 bg-orange-50/50 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                      <span className="font-medium text-orange-700">
                        {(request.expert_name || request.expert_email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">
                        {request.expert_name || 'משתמש'}
                      </div>
                      <div className="text-sm text-gray-500">{request.expert_email}</div>
                      {request.request_message && (
                        <div className="mt-2 text-sm text-gray-600 bg-white p-2 rounded-lg border border-orange-100">
                          "{request.request_message}"
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowApproveModal(request)}
                      disabled={approving === request.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      אשר
                    </button>
                    <button
                      onClick={() => setConfirmModal({ type: 'reject', id: request.id, name: request.expert_name || request.expert_email })}
                      disabled={approving === request.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      דחה
                    </button>
                  </div>
                </div>
                
                <div className="text-xs text-gray-400 mt-3">
                  התקבלה: {new Date(request.requested_at).toLocaleDateString('he-IL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Experts */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-xl">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">משתמשים עם גישה</h3>
            <p className="text-sm text-gray-500">
              {activeExperts.length > 0 
                ? `${activeExperts.length} משתמשים יכולים לגשת לחשבון שלך`
                : 'אין משתמשים עם גישה לחשבון'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : activeExperts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">עדיין לא הוספת משתמשים עם גישה</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeExperts.map(expert => (
              <div key={expert.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <span className="font-medium text-purple-700">
                        {(expert.expert_name || expert.expert_email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">
                        {expert.expert_name || 'מומחה'}
                      </div>
                      <div className="text-sm text-gray-500">{expert.expert_email}</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setConfirmModal({ type: 'remove', id: expert.expert_id, name: expert.expert_name || expert.expert_email })}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                    title="הסר גישה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Permissions toggles */}
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSIONS.map(perm => (
                    <label 
                      key={perm.key} 
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={expert[perm.key]}
                        onChange={(e) => handleUpdatePermission(expert.expert_id, perm.key, e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-purple-600"
                      />
                      <span className="text-gray-600">{perm.label}</span>
                    </label>
                  ))}
                </div>
                
                <div className="text-xs text-gray-400 mt-3">
                  אושר: {new Date(expert.approved_at || expert.created_at).toLocaleDateString('he-IL')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">הוסף גישה לחשבון</h3>
                <button onClick={() => setShowInvite(false)} className="text-white/80 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">תן למישהו גישה לנהל את החשבון שלך</p>
            </div>
            
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כתובת מייל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="הזן מייל של המשתמש..."
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                    dir="ltr"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">המשתמש חייב להיות רשום במערכת</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">הרשאות</label>
                <div className="space-y-2">
                  {PERMISSIONS.map(perm => (
                    <label key={perm.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={permissions[perm.key]}
                        onChange={(e) => setPermissions(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                        className="w-4 h-4 rounded text-purple-600"
                      />
                      <perm.icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={inviting || !email.trim()}
                  className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 disabled:opacity-50"
                >
                  {inviting ? 'מוסיף...' : 'הוסף גישה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Access Modal */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRequest(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">בקש גישה לחשבון</h3>
                <button onClick={() => setShowRequest(false)} className="text-white/80 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">בקש גישה לנהל חשבון של משתמש אחר</p>
            </div>
            
            <form onSubmit={handleRequestAccess} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל בעל החשבון</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    dir="ltr"
                    autoFocus
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הודעה (אופציונלי)</label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="הסבר קצר למה אתה מבקש גישה..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequest(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={inviting || !email.trim()}
                  className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50"
                >
                  {inviting ? 'שולח...' : 'שלח בקשה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve Modal with Permissions */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowApproveModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">אשר בקשת גישה</h3>
                <button onClick={() => setShowApproveModal(null)} className="text-white/80 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">
                {showApproveModal.expert_name || showApproveModal.expert_email}
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">בחר הרשאות</label>
                <div className="space-y-2">
                  {PERMISSIONS.map(perm => (
                    <label key={perm.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={permissions[perm.key]}
                        onChange={(e) => setPermissions(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                        className="w-4 h-4 rounded text-green-600"
                      />
                      <perm.icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApproveModal(null)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  onClick={() => handleApprove(showApproveModal.id)}
                  disabled={approving}
                  className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50"
                >
                  {approving ? 'מאשר...' : 'אשר גישה'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {confirmModal.type === 'remove' ? 'הסרת גישה' : 'דחיית בקשה'}
              </h3>
              <p className="text-gray-600 mb-6">
                {confirmModal.type === 'remove' 
                  ? `האם להסיר את הגישה של ${confirmModal.name}?`
                  : `האם לדחות את הבקשה של ${confirmModal.name}?`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  onClick={() => {
                    if (confirmModal.type === 'remove') {
                      handleRemove(confirmModal.id);
                    } else {
                      handleReject(confirmModal.id);
                    }
                  }}
                  disabled={approving}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50"
                >
                  {approving ? 'מעבד...' : (confirmModal.type === 'remove' ? 'הסר' : 'דחה')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
