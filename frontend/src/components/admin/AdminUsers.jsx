import { useState, useEffect } from 'react';
import { 
  Search, ChevronLeft, ChevronRight, Edit, Trash2,
  Check, X, RefreshCw, Eye, CreditCard, Calendar, AlertCircle,
  ExternalLink, Users, Phone
} from 'lucide-react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

export default function AdminUsers() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const loadUsers = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page,
        limit: 20,
      });
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);
      
      const { data } = await api.get(`/admin/users?${params}`);
      setUsers(data.users || []);
      setPagination({
        page: data.pagination?.page || 1,
        pages: data.pagination?.pages || 1,
        total: data.pagination?.total || 0,
      });
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadUsers(1);
    }
  }, [search, roleFilter, statusFilter, currentUser]);
  
  // Safety check - if no user, don't render
  if (!currentUser) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  const handleUpdateUser = async (userId, updates) => {
    try {
      await api.put(`/admin/users/${userId}`, updates);
      loadUsers();
      setEditingUser(null);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון משתמש');
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteUser = async (userId, userName) => {
    setConfirmModal({
      title: 'מחיקת משתמש',
      message: `האם אתה בטוח שברצונך למחוק את ${userName}? פעולה זו בלתי הפיכה!`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/admin/users/${userId}`);
          showToast('success', 'המשתמש נמחק בהצלחה');
          loadUsers();
        } catch (err) {
          showToast('error', err.response?.data?.error || 'שגיאה במחיקת משתמש');
        }
      }
    });
  };

  const handleSwitchToAccount = async (userId, userName) => {
    setSwitching(userId);
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      
      const { data } = await api.post(`/experts/switch/${userId}`);
      
      if (data && data.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/dashboard';
      } else {
        showToast('error', 'לא התקבל טוקן מהשרת');
        setSwitching(null);
      }
    } catch (err) {
      console.error('Switch error:', err);
      showToast('error', err.response?.data?.error || 'שגיאה במעבר לחשבון');
      setSwitching(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg z-[60] flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">{confirmModal.title}</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`flex-1 px-4 py-2 rounded-xl text-white transition-colors ${
                  confirmModal.variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-800">ניהול משתמשים</h2>
          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
            {pagination.total} משתמשים
          </span>
        </div>
        <button 
          onClick={loadUsers} 
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="רענון"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם או מייל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
        >
          <option value="">כל התפקידים</option>
          <option value="user">משתמש</option>
          <option value="expert">מומחה</option>
          <option value="admin">אדמין</option>
          <option value="superadmin">סופר-אדמין</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
        >
          <option value="">כל הסטטוסים</option>
          <option value="active">מנוי פעיל</option>
          <option value="trial">תקופת ניסיון</option>
          <option value="manual">מנוי ידני</option>
          <option value="cancelled">מנוי מבוטל</option>
          <option value="free">חינם</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">משתמש</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">תפקיד</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">סטטוס</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">תוכנית</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">WhatsApp</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">בוטים</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">אנשי קשר</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">נוצר</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">טוען...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">לא נמצאו משתמשים</td>
              </tr>
            ) : users.map(u => (
              <tr 
                key={u.id} 
                className="hover:bg-purple-50 cursor-pointer transition-colors"
                onClick={() => setSelectedUser(u)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                      u.subscription_status === 'active' && !u.is_manual ? 'bg-green-500' :
                      u.is_manual ? 'bg-purple-500' :
                      u.subscription_status === 'trial' ? 'bg-cyan-500' :
                      'bg-gray-400'
                    }`}>
                      {(u.name || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{u.name || 'ללא שם'}</div>
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingUser === u.id ? (
                    <select
                      defaultValue={u.role}
                      onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="user">משתמש</option>
                      <option value="expert">מומחה</option>
                      <option value="admin">אדמין</option>
                      {currentUser.role === 'superadmin' && <option value="superadmin">סופר-אדמין</option>}
                    </select>
                  ) : (
                    <RoleBadge role={u.role} />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {u.is_verified ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">מאומת</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">לא מאומת</span>
                    )}
                    {!u.is_active && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">מושבת</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SubscriptionBadge user={u} onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }} />
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.whatsapp_status === 'connected' ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <Phone className="w-3.5 h-3.5" />
                      <span className="font-mono text-xs">{u.whatsapp_phone || '---'}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">לא מחובר</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.bots_count || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.contacts_count || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSwitchToAccount(u.id, u.name || u.email)}
                      disabled={switching === u.id || u.id === currentUser.id}
                      className={`p-1.5 rounded transition-colors ${
                        u.id === currentUser.id 
                          ? 'text-gray-300 cursor-not-allowed' 
                          : 'hover:bg-purple-100 text-purple-600'
                      }`}
                      title="עבור לחשבון"
                    >
                      {switching === u.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setEditingUser(editingUser === u.id ? null : u.id)}
                      className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                      title="עריכה"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {u.is_active ? (
                      <button
                        onClick={() => handleUpdateUser(u.id, { is_active: false })}
                        className="p-1.5 hover:bg-yellow-50 rounded text-yellow-600"
                        title="השבתה"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateUser(u.id, { is_active: true })}
                        className="p-1.5 hover:bg-green-50 rounded text-green-600"
                        title="הפעלה"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    {currentUser.role === 'superadmin' && u.id !== currentUser.id && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name || u.email)}
                        className="p-1.5 hover:bg-red-50 rounded text-red-600"
                        title="מחיקה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">
              {pagination.total} משתמשים
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadUsers(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 px-2">
                {pagination.page} / {pagination.pages}
              </span>
              <button
                onClick={() => loadUsers(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages || loading}
                className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unified User Card Modal */}
      {selectedUser && (
        <UnifiedUserModal 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)}
          onSuccess={() => {
            loadUsers();
            setSelectedUser(null);
          }}
          onSwitchAccount={(userId, userName) => handleSwitchToAccount(userId, userName)}
          currentUserId={currentUser?.id}
        />
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  const styles = {
    user: 'bg-gray-100 text-gray-700',
    expert: 'bg-blue-100 text-blue-700',
    admin: 'bg-orange-100 text-orange-700',
    superadmin: 'bg-red-100 text-red-700',
  };
  const labels = {
    user: 'משתמש',
    expert: 'מומחה',
    admin: 'אדמין',
    superadmin: 'סופר-אדמין',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[role] || styles.user}`}>
      {labels[role] || role}
    </span>
  );
}

function SubscriptionBadge({ user, onClick }) {
  // Determine display based on real subscription data
  const status = user.subscription_status;
  const planName = user.plan_name_he || user.plan_name;
  const isFree = user.plan_name === 'Free' || !planName;
  
  let badgeClass = 'bg-gray-100 text-gray-600';
  let label = 'חינמי';
  let subLabel = null;
  
  if (status === 'active') {
    if (isFree) {
      badgeClass = 'bg-green-100 text-green-700';
      label = 'חינם';
    } else {
      badgeClass = 'bg-blue-100 text-blue-700';
      label = planName || 'בתשלום';
    }
    
    if (user.is_manual) {
      badgeClass = 'bg-purple-100 text-purple-700';
      if (!user.expires_at) {
        subLabel = 'ידני ∞';
      } else {
        subLabel = 'ידני';
      }
    }
    
    if (user.expires_at) {
      const expiresAt = new Date(user.expires_at);
      const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        badgeClass = 'bg-yellow-100 text-yellow-700';
        subLabel = user.is_manual ? `ידני - ${daysLeft} ימים` : `${daysLeft} ימים נותרו`;
      } else if (daysLeft <= 0) {
        badgeClass = 'bg-red-100 text-red-700';
        subLabel = 'פג תוקף';
      }
    }
  } else if (status === 'cancelled') {
    badgeClass = 'bg-orange-100 text-orange-700';
    label = planName || 'מנוי';
    
    // Show remaining days until subscription ends
    if (user.expires_at) {
      const expiresAt = new Date(user.expires_at);
      const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) {
        subLabel = `מבוטל - ${daysLeft} ימים נותרו`;
      } else {
        subLabel = 'מבוטל - הסתיים';
        badgeClass = 'bg-red-100 text-red-700';
      }
    } else {
      subLabel = 'מבוטל';
    }
  } else if (status === 'trial') {
    badgeClass = 'bg-cyan-100 text-cyan-700';
    label = planName || 'ניסיון';
    
    // Show remaining trial days
    if (user.trial_ends_at) {
      const trialEnds = new Date(user.trial_ends_at);
      const daysLeft = Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) {
        subLabel = `ניסיון - ${daysLeft} ימים`;
      } else {
        subLabel = 'ניסיון הסתיים';
        badgeClass = 'bg-red-100 text-red-700';
      }
    } else {
      subLabel = 'תקופת ניסיון';
    }
  } else if (status === 'expired') {
    badgeClass = 'bg-red-100 text-red-700';
    label = planName || 'מנוי';
    subLabel = 'פג תוקף';
  }
  
  return (
    <button 
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass} hover:opacity-80 transition-opacity cursor-pointer flex flex-col items-center`}
      title="לחץ לעריכת מנוי"
    >
      <span>{label}</span>
      {subLabel && <span className="text-[10px] opacity-75">{subLabel}</span>}
    </button>
  );
}

function UnifiedUserModal({ user, onClose, onSuccess, onSwitchAccount, currentUserId }) {
  const [plans, setPlans] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('subscription'); // 'subscription' | 'discount' | 'referral' | 'features'
  const [featureOverrides, setFeatureOverrides] = useState(null);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  const [confirmModal, setConfirmModal] = useState(null); // { message: string, onConfirm: function }
  const [formData, setFormData] = useState({
    planId: '',
    status: user.subscription_status || 'active',
    expiresAt: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
    noExpiry: !user.expires_at && user.is_manual,
    isManual: user.is_manual || false,
    adminNotes: user.admin_notes || '',
    // Payment settings
    nextChargeDate: user.next_charge_date ? new Date(user.next_charge_date).toISOString().split('T')[0] : '',
    trialEndsAt: user.trial_ends_at ? new Date(user.trial_ends_at).toISOString().split('T')[0] : '',
    // Discount settings
    discountMode: user.custom_discount_mode || 'percent', // 'percent' or 'fixed_price'
    customDiscount: user.custom_discount_percent || 0,
    fixedPrice: user.custom_fixed_price || 0,
    discountType: user.custom_discount_type || 'none', // 'none', 'first_payment', 'custom_months', 'first_year', 'forever'
    discountMonths: user.custom_discount_months || 1,
    discountPlanId: user.custom_discount_plan_id || '', // Which plan the discount applies to
    skipTrial: user.skip_trial || false, // Skip free trial - immediate payment
    // Referral settings
    affiliateId: user.referred_by_affiliate_id || '',
  });
  
  // Calculate trial days used
  const trialDaysTotal = 14;
  const trialStartDate = user.started_at ? new Date(user.started_at) : null;
  const trialEndDate = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
  const trialDaysUsed = trialStartDate && trialEndDate 
    ? Math.max(0, Math.ceil((new Date() - trialStartDate) / (1000 * 60 * 60 * 24)))
    : 0;
  const trialDaysRemaining = trialEndDate 
    ? Math.max(0, Math.ceil((trialEndDate - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansRes, affiliatesRes, overridesRes] = await Promise.all([
        api.get('/admin/plans'),
        api.get('/admin/affiliates/list'),
        api.get(`/admin/users/${user.id}/feature-overrides`)
      ]);
      
      setPlans(plansRes.data.plans || []);
      setAffiliates(affiliatesRes.data.affiliates || []);
      setFeatureOverrides(overridesRes.data.feature_overrides || null);
      
      // Set current plan if exists
      if (plansRes.data.plans?.length > 0) {
        const currentPlan = plansRes.data.plans.find(p => p.name === user.plan_name || p.name_he === user.plan_name_he);
        if (currentPlan) {
          setFormData(f => ({ ...f, planId: currentPlan.id }));
        } else {
          setFormData(f => ({ ...f, planId: plansRes.data.plans[0].id }));
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveFeatures = async () => {
    setSavingFeatures(true);
    try {
      console.log('[Admin] Saving feature overrides:', featureOverrides);
      const response = await api.put(`/admin/users/${user.id}/feature-overrides`, {
        feature_overrides: featureOverrides
      });
      console.log('[Admin] Save response:', response.data);
      showToast('success', 'הגדרות הפיצ\'רים עודכנו בהצלחה');
      // Reload to verify saved correctly
      const overridesRes = await api.get(`/admin/users/${user.id}/feature-overrides`);
      console.log('[Admin] Reloaded overrides:', overridesRes.data.feature_overrides);
      setFeatureOverrides(overridesRes.data.feature_overrides || null);
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בעדכון הגדרות');
    } finally {
      setSavingFeatures(false);
    }
  };

  const clearFeatureOverrides = async () => {
    setConfirmModal({
      message: 'האם למחוק את כל ההגדרות המותאמות? המשתמש יקבל את הגדרות התוכנית שלו',
      onConfirm: async () => {
        setConfirmModal(null);
        setSavingFeatures(true);
        try {
          await api.put(`/admin/users/${user.id}/feature-overrides`, {
            feature_overrides: null
          });
          setFeatureOverrides(null);
          showToast('success', 'ההגדרות נמחקו');
        } catch (err) {
          showToast('error', err.response?.data?.error || 'שגיאה במחיקת הגדרות');
        } finally {
          setSavingFeatures(false);
        }
      }
    });
  };

  const updateFeatureOverride = (key, value) => {
    console.log('[Admin] updateFeatureOverride:', key, '=', value, 'type:', typeof value);
    setFeatureOverrides(prev => {
      const newOverrides = { ...(prev || {}) };
      if (value === null || value === undefined || value === '') {
        delete newOverrides[key];
      } else {
        newOverrides[key] = value;
      }
      console.log('[Admin] New overrides:', newOverrides);
      // If object is empty, set to null
      return Object.keys(newOverrides).length === 0 ? null : newOverrides;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/subscription`, {
        planId: formData.planId,
        status: formData.status,
        expiresAt: formData.noExpiry ? null : (formData.expiresAt || null),
        isManual: formData.isManual,
        adminNotes: formData.adminNotes || null,
        // Payment dates
        nextChargeDate: formData.isManual ? null : (formData.nextChargeDate || null),
        trialEndsAt: formData.trialEndsAt || null,
        // Discount
        customDiscountMode: formData.discountType !== 'none' ? formData.discountMode : null,
        customDiscountPercent: formData.discountType !== 'none' && formData.discountMode === 'percent' ? formData.customDiscount : null,
        customFixedPrice: formData.discountType !== 'none' && formData.discountMode === 'fixed_price' ? formData.fixedPrice : null,
        customDiscountType: formData.discountType !== 'none' ? formData.discountType : null,
        customDiscountMonths: formData.discountType === 'custom_months' ? formData.discountMonths : null,
        customDiscountPlanId: formData.discountType !== 'none' && formData.discountPlanId ? formData.discountPlanId : null,
        skipTrial: formData.skipTrial || false,
        // Referral
        affiliateId: formData.affiliateId || null,
      });
      onSuccess();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בעדכון מנוי');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg z-[60] flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Confirm Modal */}
        {confirmModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setConfirmModal(null)}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">אישור</h3>
              <p className="text-gray-600 mb-6">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600"
                >
                  אישור
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User Profile Header */}
        <div className="relative mb-6">
          {/* Close Button */}
          <button 
            onClick={onClose} 
            className="absolute top-0 left-0 p-2 hover:bg-gray-100 rounded-full z-10"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
          
          {/* Profile Card */}
          <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
                user.subscription_status === 'active' && !user.is_manual ? 'bg-green-400' :
                user.is_manual ? 'bg-purple-300' :
                user.subscription_status === 'trial' ? 'bg-cyan-400' :
                'bg-gray-300'
              } text-white shadow-lg`}>
                {(user.name || user.email || '?')[0].toUpperCase()}
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold truncate">{user.name || 'ללא שם'}</h2>
                <p className="text-purple-100 text-sm truncate">{user.email}</p>
                
                {/* Badges */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    user.is_manual ? 'bg-purple-300/30 text-white' :
                    user.subscription_status === 'active' ? 'bg-green-400/30 text-white' :
                    user.subscription_status === 'trial' ? 'bg-cyan-400/30 text-white' :
                    user.subscription_status === 'cancelled' ? 'bg-orange-400/30 text-white' :
                    'bg-white/20 text-white'
                  }`}>
                    {user.is_manual ? 'ידני' :
                     user.subscription_status === 'active' ? 'פעיל' :
                     user.subscription_status === 'trial' ? 'ניסיון' :
                     user.subscription_status === 'cancelled' ? 'מבוטל' : 'חינם'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                    {user.plan_name_he || user.plan_name || 'Free'}
                  </span>
                  <RoleBadge role={user.role} />
                </div>
              </div>
              
              {/* Switch Account Button */}
              {currentUserId !== user.id && (
                <button
                  onClick={() => onSwitchAccount(user.id, user.name || user.email)}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  עבור לחשבון
                </button>
              )}
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-3 -mt-4 mx-4">
            <div className="bg-white rounded-xl shadow-md p-3 text-center">
              <div className="text-lg font-bold text-gray-800">{user.bots_count || 0}</div>
              <div className="text-xs text-gray-500">בוטים</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-3 text-center">
              <div className="text-lg font-bold text-gray-800">{user.contacts_count || 0}</div>
              <div className="text-xs text-gray-500">אנשי קשר</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-3 text-center">
              {user.has_payment_method ? (
                <div className="text-lg font-bold text-green-600">✓</div>
              ) : (
                <div className="text-lg font-bold text-gray-400">✗</div>
              )}
              <div className="text-xs text-gray-500">כרטיס</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-3 text-center">
              {user.sumit_standing_order_id ? (
                <div className="text-lg font-bold text-green-600">✓</div>
              ) : (
                <div className="text-lg font-bold text-gray-400">✗</div>
              )}
              <div className="text-xs text-gray-500">הו״ק</div>
            </div>
          </div>
        </div>

        {/* User Details Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 p-4 bg-gray-50 rounded-xl text-sm">
          <div>
            <span className="text-gray-500">נרשם:</span>
            <span className="font-medium text-gray-800 mr-1">{new Date(user.created_at).toLocaleDateString('he-IL')}</span>
          </div>
          <div>
            <span className="text-gray-500">סטטוס:</span>
            <span className="mr-1">
              {user.is_verified ? (
                <span className="text-green-600">מאומת ✓</span>
              ) : (
                <span className="text-yellow-600">לא מאומת</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-gray-500">WhatsApp:</span>
            <span className="mr-1">
              {user.whatsapp_status === 'connected' ? (
                <span className="text-green-600 font-mono">{user.whatsapp_phone || 'מחובר'}</span>
              ) : (
                <span className="text-gray-400">לא מחובר</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-gray-500">מחיר:</span>
            <span className="font-medium text-gray-800 mr-1">
              {user.is_manual ? 'ללא תשלום' :
               user.custom_fixed_price ? `₪${user.custom_fixed_price}` :
               user.plan_price ? `₪${user.plan_price}` : 'חינם'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">
              {user.is_manual ? 'תפוגה:' : 'חיוב הבא:'}
            </span>
            <span className={`font-medium mr-1 ${
              (user.expires_at || user.next_charge_date) && 
              new Date(user.expires_at || user.next_charge_date) < new Date()
                ? 'text-red-600' : 'text-gray-800'
            }`}>
              {user.is_manual && !user.expires_at ? '∞' :
               user.expires_at ? new Date(user.expires_at).toLocaleDateString('he-IL') :
               user.next_charge_date ? new Date(user.next_charge_date).toLocaleDateString('he-IL') : 
               '-'}
            </span>
          </div>
          {user.referred_by_name && (
            <div className="col-span-2">
              <span className="text-gray-500">הגיע דרך שותף:</span>
              <span className="font-medium text-purple-600 mr-1">{user.referred_by_name}</span>
            </div>
          )}
          {user.admin_notes && (
            <div className="col-span-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <span className="text-yellow-800 text-xs">
                <strong>הערה:</strong> {user.admin_notes}
              </span>
            </div>
          )}
        </div>

        {/* Edit Section */}
        <div className="px-6 pb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Edit className="w-5 h-5 text-purple-600" />
            עריכת הגדרות
          </h3>
          
          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setActiveTab('subscription')}
              className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                activeTab === 'subscription' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              מנוי
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                activeTab === 'payments' ? 'bg-white shadow text-cyan-600 font-medium' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              תשלומים
            </button>
            <button
              onClick={() => setActiveTab('discount')}
              className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                activeTab === 'discount' ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              הנחה
            </button>
            <button
              onClick={() => setActiveTab('referral')}
              className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                activeTab === 'referral' ? 'bg-white shadow text-purple-600 font-medium' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              שותף
            </button>
            <button
              onClick={() => setActiveTab('features')}
              className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                activeTab === 'features' ? 'bg-white shadow text-orange-600 font-medium' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              פיצ׳רים
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">טוען...</div>
        ) : (
          <div className="space-y-4">
            {/* Subscription Tab */}
            {activeTab === 'subscription' && (
              <>
                {/* Manual Subscription Toggle */}
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isManual}
                      onChange={(e) => setFormData(f => ({ ...f, isManual: e.target.checked }))}
                      className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-medium text-purple-800">מנוי ידני (ללא תשלום)</span>
                      <p className="text-xs text-purple-600">המשתמש יקבל גישה מלאה ללא צורך בהזנת כרטיס אשראי</p>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תוכנית</label>
                  <select
                    value={formData.planId}
                    onChange={(e) => setFormData(f => ({ ...f, planId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    {plans.map(plan => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name_he} {plan.price > 0 ? `- ₪${plan.price}/חודש` : '(חינם)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">פעיל</option>
                    <option value="trial">ניסיון</option>
                    <option value="cancelled">בוטל</option>
                    <option value="expired">פג תוקף</option>
                  </select>
                </div>

                {/* No Expiry Toggle */}
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.noExpiry}
                      onChange={(e) => setFormData(f => ({ ...f, noExpiry: e.target.checked, expiresAt: '' }))}
                      className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-green-500"
                    />
                    <div>
                      <span className="font-medium text-green-800">ללא הגבלת זמן</span>
                      <p className="text-xs text-green-600">המנוי יהיה פעיל לתמיד ללא תאריך תפוגה</p>
                    </div>
                  </label>
                </div>

                {!formData.noExpiry && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      תאריך סיום
                    </label>
                    <input
                      type="date"
                      value={formData.expiresAt}
                      onChange={(e) => setFormData(f => ({ ...f, expiresAt: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">הערות אדמין</label>
                  <textarea
                    value={formData.adminNotes}
                    onChange={(e) => setFormData(f => ({ ...f, adminNotes: e.target.value }))}
                    rows={2}
                    placeholder="הערות פנימיות (לא יוצגו למשתמש)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Quick Actions */}
                {formData.isManual && (
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">פעולות מהירות:</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const plan = plans.find(p => p.name === 'Pro' || p.name_he?.includes('מקצוע'));
                          if (plan) setFormData(f => ({ ...f, planId: plan.id, status: 'active', noExpiry: true }));
                        }}
                        className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                      >
                        Pro לתמיד
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const plan = plans.find(p => p.name === 'Enterprise' || p.name_he?.includes('ארגונ'));
                          if (plan) setFormData(f => ({ ...f, planId: plan.id, status: 'active', noExpiry: true }));
                        }}
                        className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200"
                      >
                        Enterprise לתמיד
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextMonth = new Date();
                          nextMonth.setMonth(nextMonth.getMonth() + 1);
                          setFormData(f => ({ ...f, noExpiry: false, expiresAt: nextMonth.toISOString().split('T')[0] }));
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        חודש אחד
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextYear = new Date();
                          nextYear.setFullYear(nextYear.getFullYear() + 1);
                          setFormData(f => ({ ...f, noExpiry: false, expiresAt: nextYear.toISOString().split('T')[0] }));
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        שנה אחת
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
              <>
                {/* Trial Info */}
                {(user.is_trial || user.subscription_status === 'trial' || user.trial_ends_at) && (
                  <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-xl">
                    <h4 className="text-sm font-semibold text-cyan-800 mb-3">🎁 תקופת ניסיון</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <span className="text-cyan-600">נוצלו:</span>
                        <span className="font-medium text-cyan-800 mr-1">{trialDaysUsed} ימים</span>
                      </div>
                      <div>
                        <span className="text-cyan-600">נותרו:</span>
                        <span className="font-medium text-cyan-800 mr-1">{trialDaysRemaining} ימים</span>
                      </div>
                    </div>
                    <div className="w-full bg-cyan-200 rounded-full h-2 mb-3">
                      <div 
                        className="bg-cyan-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (trialDaysUsed / trialDaysTotal) * 100)}%` }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-cyan-700 mb-1">תאריך סיום ניסיון</label>
                      <input
                        type="date"
                        value={formData.trialEndsAt}
                        onChange={(e) => setFormData(f => ({ ...f, trialEndsAt: e.target.value }))}
                        className="w-full px-3 py-2 border border-cyan-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newDate = new Date();
                          newDate.setDate(newDate.getDate() + 7);
                          setFormData(f => ({ ...f, trialEndsAt: newDate.toISOString().split('T')[0] }));
                        }}
                        className="px-2 py-1 text-xs bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200"
                      >
                        +7 ימים
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newDate = new Date();
                          newDate.setDate(newDate.getDate() + 14);
                          setFormData(f => ({ ...f, trialEndsAt: newDate.toISOString().split('T')[0] }));
                        }}
                        className="px-2 py-1 text-xs bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200"
                      >
                        +14 ימים
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, trialEndsAt: '' }))}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        בטל ניסיון
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment Method Info */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">💳 אמצעי תשלום</h4>
                  {user.has_payment_method ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">VISA</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">****{user.card_last_digits || '????'}</p>
                        <p className="text-xs text-gray-500">כרטיס פעיל</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-gray-500 text-sm">אין כרטיס אשראי רשום</p>
                      <p className="text-xs text-gray-400">המשתמש צריך להוסיף אמצעי תשלום</p>
                    </div>
                  )}
                </div>

                {/* Standing Order / Next Charge */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <h4 className="text-sm font-semibold text-blue-800 mb-3">📅 מנוי ותשלומים</h4>
                  {/* Show as active if: has standing order ID OR (active subscription with payment method) */}
                  {(user.sumit_standing_order_id || (user.subscription_status === 'active' && user.has_payment_method && !user.is_manual)) ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div>
                          <span className="text-blue-600">מצב מנוי:</span>
                          <span className="text-green-600 font-medium mr-1">פעיל ✓</span>
                        </div>
                        {user.sumit_standing_order_id && (
                          <div>
                            <span className="text-blue-600">מזהה Sumit:</span>
                            <span className="font-mono text-blue-800 mr-1 text-xs">{user.sumit_standing_order_id}</span>
                          </div>
                        )}
                        {!user.sumit_standing_order_id && (
                          <div>
                            <span className="text-orange-600 text-xs">⚠️ חסר מזהה הוראת קבע</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-blue-700 mb-1">תאריך חיוב הבא</label>
                        <input
                          type="date"
                          value={formData.nextChargeDate}
                          onChange={(e) => setFormData(f => ({ ...f, nextChargeDate: e.target.value }))}
                          disabled={formData.isManual}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                        {formData.isManual && (
                          <p className="text-xs text-orange-600 mt-1">⚠️ מנוי ידני - אין חיובים אוטומטיים</p>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newDate = new Date();
                            newDate.setMonth(newDate.getMonth() + 1);
                            setFormData(f => ({ ...f, nextChargeDate: newDate.toISOString().split('T')[0] }));
                          }}
                          disabled={formData.isManual}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                        >
                          עוד חודש
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newDate = new Date();
                            newDate.setFullYear(newDate.getFullYear() + 1);
                            setFormData(f => ({ ...f, nextChargeDate: newDate.toISOString().split('T')[0] }));
                          }}
                          disabled={formData.isManual}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                        >
                          עוד שנה
                        </button>
                      </div>
                    </>
                  ) : user.is_manual ? (
                    <div className="text-center py-3">
                      <p className="text-purple-600 text-sm font-medium">מנוי ידני - ללא תשלום</p>
                      <p className="text-xs text-purple-500 mt-1">המנוי מנוהל ידנית על ידי מנהל</p>
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-gray-500 text-sm">אין מנוי פעיל</p>
                      {user.has_payment_method ? (
                        <p className="text-xs text-blue-600 mt-1">יש כרטיס - ניתן ליצור מנוי</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">אין כרטיס אשראי רשום</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Cancellation Info */}
                {user.subscription_status === 'cancelled' && (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                    <h4 className="text-sm font-semibold text-orange-800 mb-2">⚠️ מנוי מבוטל</h4>
                    <div className="text-sm text-orange-700 space-y-1">
                      <p>
                        <span className="text-orange-600">תוכנית:</span>
                        <span className="font-medium mr-1">{user.plan_name_he || user.plan_name || 'לא ידוע'}</span>
                      </p>
                      {user.expires_at && (
                        <p>
                          <span className="text-orange-600">תפוגה:</span>
                          <span className="font-medium mr-1">{new Date(user.expires_at).toLocaleDateString('he-IL')}</span>
                        </p>
                      )}
                      <p className="text-xs text-orange-600 mt-2">
                        המשתמש יכול להמשיך להשתמש בשירות עד תאריך התפוגה
                      </p>
                    </div>
                  </div>
                )}

                {/* Price Summary */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <h4 className="text-sm font-semibold text-green-800 mb-3">💰 סיכום מחיר</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600">מחיר תוכנית:</span>
                      <span className="font-medium">{user.plan_price ? `₪${user.plan_price}` : 'חינם'}</span>
                    </div>
                    {user.custom_discount_percent > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>הנחה ({user.custom_discount_percent}%):</span>
                        <span>-₪{Math.round(user.plan_price * user.custom_discount_percent / 100)}</span>
                      </div>
                    )}
                    {user.custom_fixed_price > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>מחיר מותאם:</span>
                        <span>₪{user.custom_fixed_price}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-green-300 font-bold text-green-800">
                      <span>לתשלום:</span>
                      <span>
                        {user.is_manual 
                          ? 'ללא תשלום (ידני)'
                          : user.custom_fixed_price
                            ? `₪${user.custom_fixed_price}`
                            : user.custom_discount_percent
                              ? `₪${Math.round(user.plan_price * (1 - user.custom_discount_percent / 100))}`
                              : user.plan_price
                                ? `₪${user.plan_price}`
                                : 'חינם'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Discount Tab */}
            {activeTab === 'discount' && (
              <>
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-sm text-green-800 font-medium mb-2">הנחה מותאמת אישית</p>
                  <p className="text-xs text-green-600">הגדר הנחה קבועה או מחיר קבוע למשתמש זה</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תקופת הנחה</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData(f => ({ ...f, discountType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
                  >
                    <option value="none">ללא הנחה</option>
                    <option value="first_payment">תשלום ראשון בלבד</option>
                    <option value="custom_months">מספר חודשים מותאם</option>
                    <option value="first_year">שנה ראשונה (12 חודשים)</option>
                    <option value="forever">לתמיד</option>
                  </select>
                </div>

                {formData.discountType !== 'none' && (
                  <>
                    {/* Plan Selection for Discount */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">תוכנית עבור ההנחה</label>
                      <select
                        value={formData.discountPlanId}
                        onChange={(e) => setFormData(f => ({ ...f, discountPlanId: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">בחר תוכנית...</option>
                        {plans.filter(p => parseFloat(p.price) > 0).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name_he} ({p.name}) - ₪{p.price}/חודש
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">בחר את התוכנית שהמשתמש יקבל במחיר המותאם</p>
                    </div>

                    {/* Discount Mode Toggle */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">סוג הנחה</label>
                      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setFormData(f => ({ ...f, discountMode: 'percent' }))}
                          className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
                            formData.discountMode === 'percent' ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-600'
                          }`}
                        >
                          אחוז הנחה (%)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(f => ({ ...f, discountMode: 'fixed_price' }))}
                          className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
                            formData.discountMode === 'fixed_price' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600'
                          }`}
                        >
                          מחיר קבוע (₪)
                        </button>
                      </div>
                    </div>

                    {formData.discountMode === 'percent' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">אחוז הנחה</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.customDiscount}
                            onChange={(e) => setFormData(f => ({ ...f, customDiscount: parseInt(e.target.value) || 0 }))}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-gray-500">%</span>
                          <div className="flex gap-1 mr-2">
                            {[10, 20, 30, 50].map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setFormData(f => ({ ...f, customDiscount: p }))}
                                className={`px-2 py-1 text-xs rounded ${formData.customDiscount === p ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                              >
                                {p}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">מחיר קבוע לחודש</label>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">₪</span>
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            value={formData.fixedPrice}
                            onChange={(e) => setFormData(f => ({ ...f, fixedPrice: parseInt(e.target.value) || 0 }))}
                            className="w-28 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-gray-500">/חודש</span>
                          <div className="flex gap-1 mr-2">
                            {[0, 29, 49, 69].map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setFormData(f => ({ ...f, fixedPrice: p }))}
                                className={`px-2 py-1 text-xs rounded ${formData.fixedPrice === p ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                              >
                                {p === 0 ? 'חינם' : `₪${p}`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">המשתמש ישלם מחיר זה במקום המחיר הרגיל של התוכנית</p>
                      </div>
                    )}

                    {formData.discountType === 'custom_months' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">מספר חודשים</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="36"
                            value={formData.discountMonths}
                            onChange={(e) => setFormData(f => ({ ...f, discountMonths: parseInt(e.target.value) || 1 }))}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-gray-500">חודשים</span>
                          <div className="flex gap-1 mr-2">
                            {[3, 6, 12].map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setFormData(f => ({ ...f, discountMonths: m }))}
                                className={`px-2 py-1 text-xs rounded ${formData.discountMonths === m ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Skip Trial Option */}
                    <label className="flex items-center gap-3 cursor-pointer p-3 bg-red-50 border border-red-200 rounded-xl">
                      <input
                        type="checkbox"
                        checked={formData.skipTrial}
                        onChange={(e) => setFormData(f => ({ ...f, skipTrial: e.target.checked }))}
                        className="w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <div className="font-medium text-red-700">ללא ניסיון חינם</div>
                        <div className="text-xs text-red-600">הסליקה תהיה מיידית עם הזנת פרטי אשראי</div>
                      </div>
                    </label>

                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                      <p className="text-sm text-yellow-800">
                        <strong>תצוגה מקדימה:</strong>{' '}
                        {formData.discountPlanId && (
                          <span className="text-purple-700">
                            תוכנית {plans.find(p => p.id == formData.discountPlanId)?.name_he || ''} ב
                          </span>
                        )}
                        {formData.discountMode === 'percent' 
                          ? `${formData.customDiscount}% הנחה`
                          : formData.fixedPrice === 0 
                            ? 'חינם (₪0)'
                            : `מחיר קבוע ₪${formData.fixedPrice}/חודש`
                        }{' '}
                        {formData.discountType === 'first_payment' && 'לתשלום הראשון'}
                        {formData.discountType === 'custom_months' && `ל-${formData.discountMonths} חודשים`}
                        {formData.discountType === 'first_year' && 'לשנה הראשונה (12 חודשים)'}
                        {formData.discountType === 'forever' && 'לתמיד'}
                        {formData.skipTrial && <span className="text-red-600 mr-2">• ללא ניסיון</span>}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Referral Tab */}
            {activeTab === 'referral' && (
              <>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <p className="text-sm text-purple-800 font-medium mb-2">שיוך לשותף</p>
                  <p className="text-xs text-purple-600">הגדר שהמשתמש הגיע דרך שותף מסוים</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שותף מפנה</label>
                  <select
                    value={formData.affiliateId}
                    onChange={(e) => setFormData(f => ({ ...f, affiliateId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">ללא שותף</option>
                    {affiliates.map(aff => (
                      <option key={aff.id} value={aff.id}>
                        {aff.user_name || aff.user_email} ({aff.ref_code})
                      </option>
                    ))}
                  </select>
                </div>

                {formData.affiliateId && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-sm text-blue-800">
                      המשתמש יסומן כהגיע דרך השותף שנבחר.
                      <br />
                      <span className="text-xs text-blue-600">השותף יקבל נקודות בהתאם להגדרותיו.</span>
                    </p>
                  </div>
                )}

                {user.referred_by_name && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <p className="text-sm text-gray-700">
                      <strong>שותף נוכחי:</strong> {user.referred_by_name}
                      <br />
                      <span className="text-xs text-gray-500">{user.referred_by_email}</span>
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Features Tab */}
            {activeTab === 'features' && (
              <>
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl mb-4">
                  <p className="text-sm text-orange-800">
                    <strong>הגדרות מותאמות אישית</strong>
                    <br />
                    <span className="text-xs">הגדרות אלו ידרסו את הגדרות התוכנית. השאר ריק לשימוש בברירת המחדל של התוכנית.</span>
                    <br />
                    <span className="text-xs text-orange-600">⚠️ בעת שינוי תוכנית, ההגדרות המותאמות יימחקו אוטומטית.</span>
                  </p>
                </div>

                {featureOverrides && (
                  <button
                    onClick={clearFeatureOverrides}
                    className="w-full mb-4 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50"
                  >
                    נקה את כל ההגדרות המותאמות
                  </button>
                )}

                <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg mb-3">
                  <p className="text-xs text-blue-700 text-center">💡 לחץ על <strong>∞</strong> או הזן <strong>-1</strong> לכמות ללא הגבלה</p>
                </div>

                <div className="space-y-3">
                  {/* Bots */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="block text-sm font-medium text-gray-700 mb-2">מכסת בוטים</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="-1"
                        placeholder="ברירת מחדל מהתוכנית"
                        value={featureOverrides?.max_bots ?? ''}
                        onChange={(e) => updateFeatureOverride('max_bots', e.target.value !== '' ? parseInt(e.target.value) : null)}
                        className={`flex-1 px-3 py-2 border rounded-lg text-sm ${featureOverrides?.max_bots === -1 ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateFeatureOverride('max_bots', featureOverrides?.max_bots === -1 ? null : -1)}
                        className={`px-3 py-2 text-sm rounded-lg font-bold ${featureOverrides?.max_bots === -1 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="ללא הגבלה"
                      >
                        ∞
                      </button>
                    </div>
                    {featureOverrides?.max_bots === -1 && (
                      <span className="text-xs text-green-600 mt-1 block">✓ ללא הגבלה</span>
                    )}
                  </div>

                  {/* Bot runs */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="block text-sm font-medium text-gray-700 mb-2">הרצות בוט בחודש</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="-1"
                        placeholder="ברירת מחדל מהתוכנית"
                        value={featureOverrides?.max_bot_runs_per_month ?? ''}
                        onChange={(e) => updateFeatureOverride('max_bot_runs_per_month', e.target.value !== '' ? parseInt(e.target.value) : null)}
                        className={`flex-1 px-3 py-2 border rounded-lg text-sm ${featureOverrides?.max_bot_runs_per_month === -1 ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateFeatureOverride('max_bot_runs_per_month', featureOverrides?.max_bot_runs_per_month === -1 ? null : -1)}
                        className={`px-3 py-2 text-sm rounded-lg font-bold ${featureOverrides?.max_bot_runs_per_month === -1 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="ללא הגבלה"
                      >
                        ∞
                      </button>
                    </div>
                    {featureOverrides?.max_bot_runs_per_month === -1 && (
                      <span className="text-xs text-green-600 mt-1 block">✓ ללא הגבלה</span>
                    )}
                  </div>

                  {/* Contacts */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="block text-sm font-medium text-gray-700 mb-2">מכסת אנשי קשר</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="-1"
                        placeholder="ברירת מחדל מהתוכנית"
                        value={featureOverrides?.max_contacts ?? ''}
                        onChange={(e) => updateFeatureOverride('max_contacts', e.target.value !== '' ? parseInt(e.target.value) : null)}
                        className={`flex-1 px-3 py-2 border rounded-lg text-sm ${featureOverrides?.max_contacts === -1 ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateFeatureOverride('max_contacts', featureOverrides?.max_contacts === -1 ? null : -1)}
                        className={`px-3 py-2 text-sm rounded-lg font-bold ${featureOverrides?.max_contacts === -1 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="ללא הגבלה"
                      >
                        ∞
                      </button>
                    </div>
                    {featureOverrides?.max_contacts === -1 && (
                      <span className="text-xs text-green-600 mt-1 block">✓ ללא הגבלה</span>
                    )}
                  </div>

                  {/* Group Forwards */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.allow_group_forwards ?? false}
                        onChange={(e) => updateFeatureOverride('allow_group_forwards', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm font-medium text-gray-700">העברת הודעות לקבוצות</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="text-xs text-gray-500">מקסימום העברות</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min="-1"
                            placeholder="ברירת מחדל"
                            value={featureOverrides?.max_group_forwards ?? ''}
                            onChange={(e) => updateFeatureOverride('max_group_forwards', e.target.value !== '' ? parseInt(e.target.value) : null)}
                            className={`flex-1 px-2 py-1 border rounded text-sm ${featureOverrides?.max_group_forwards === -1 ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
                          />
                          <button
                            type="button"
                            onClick={() => updateFeatureOverride('max_group_forwards', featureOverrides?.max_group_forwards === -1 ? null : -1)}
                            className={`px-2 py-1 text-xs rounded ${featureOverrides?.max_group_forwards === -1 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                            title="ללא הגבלה"
                          >
                            ∞
                          </button>
                        </div>
                        {featureOverrides?.max_group_forwards === -1 && (
                          <span className="text-xs text-green-600">ללא הגבלה</span>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">מקסימום יעדים</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min="-1"
                            placeholder="ברירת מחדל"
                            value={featureOverrides?.max_forward_targets ?? ''}
                            onChange={(e) => updateFeatureOverride('max_forward_targets', e.target.value !== '' ? parseInt(e.target.value) : null)}
                            className={`flex-1 px-2 py-1 border rounded text-sm ${featureOverrides?.max_forward_targets === -1 ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
                          />
                          <button
                            type="button"
                            onClick={() => updateFeatureOverride('max_forward_targets', featureOverrides?.max_forward_targets === -1 ? null : -1)}
                            className={`px-2 py-1 text-xs rounded ${featureOverrides?.max_forward_targets === -1 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                            title="ללא הגבלה"
                          >
                            ∞
                          </button>
                        </div>
                        {featureOverrides?.max_forward_targets === -1 && (
                          <span className="text-xs text-green-600">ללא הגבלה</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Boolean Features */}
                  <div className="p-3 bg-gray-50 rounded-xl space-y-2">
                    <label className="text-sm font-medium text-gray-700">פיצ׳רים נוספים</label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.allow_statistics ?? false}
                        onChange={(e) => updateFeatureOverride('allow_statistics', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm text-gray-600">סטטיסטיקות</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.allow_waha_creation ?? false}
                        onChange={(e) => updateFeatureOverride('allow_waha_creation', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm text-gray-600">יצירת חיבור WAHA</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.allow_export ?? false}
                        onChange={(e) => updateFeatureOverride('allow_export', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm text-gray-600">ייצוא נתונים</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.allow_api_access ?? false}
                        onChange={(e) => updateFeatureOverride('allow_api_access', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm text-gray-600">גישת API</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.priority_support ?? false}
                        onChange={(e) => updateFeatureOverride('priority_support', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm text-gray-600">תמיכה מועדפת</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureOverrides?.allow_broadcasts ?? false}
                        onChange={(e) => updateFeatureOverride('allow_broadcasts', e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600"
                      />
                      <span className="text-sm text-gray-600">הודעות תפוצה</span>
                    </label>
                  </div>

                  {/* Save Features Button */}
                  <button
                    onClick={handleSaveFeatures}
                    disabled={savingFeatures}
                    className="w-full px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 disabled:opacity-50"
                  >
                    {savingFeatures ? 'שומר...' : 'שמור הגדרות פיצ׳רים'}
                  </button>
                </div>
              </>
            )}

            {/* Save Button - Always visible */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                סגור
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.planId}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'שומר...' : 'שמור שינויים'}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
