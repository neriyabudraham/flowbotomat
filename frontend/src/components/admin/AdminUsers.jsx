import { useState, useEffect } from 'react';
import { 
  Search, ChevronLeft, ChevronRight, Edit, Trash2,
  Check, X, RefreshCw, Eye, CreditCard, Calendar
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
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editSubscriptionUser, setEditSubscriptionUser] = useState(null);

  const loadUsers = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page,
        limit: 20,
      });
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      
      const { data } = await api.get(`/admin/users?${params}`);
      setUsers(data.users || []);
      setPagination(prev => ({
        ...prev,
        ...data.pagination,
      }));
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
  }, [search, roleFilter, currentUser]);
  
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

  const handleDeleteUser = async (userId) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו בלתי הפיכה!')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקת משתמש');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">ניהול משתמשים</h2>
        <button 
          onClick={loadUsers} 
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="רענון"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
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
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-800">{u.name || 'ללא שם'}</div>
                    <div className="text-sm text-gray-500">{u.email}</div>
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
                  <SubscriptionBadge user={u} onClick={() => setEditSubscriptionUser(u)} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.bots_count || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.contacts_count || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                      title="צפייה"
                    >
                      <Eye className="w-4 h-4" />
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
                        onClick={() => handleDeleteUser(u.id)}
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
                disabled={pagination.page <= 1}
                className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 px-2">
                {pagination.page} / {pagination.pages}
              </span>
              <button
                onClick={() => loadUsers(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 hover:bg-white rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {/* Edit Subscription Modal */}
      {editSubscriptionUser && (
        <EditSubscriptionModal 
          user={editSubscriptionUser} 
          onClose={() => setEditSubscriptionUser(null)}
          onSuccess={() => {
            loadUsers();
            setEditSubscriptionUser(null);
          }}
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

function UserDetailsModal({ user, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">פרטי משתמש</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">שם</label>
              <div className="font-medium">{user.name || 'לא צוין'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">מייל</label>
              <div className="font-medium">{user.email}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">תפקיד</label>
              <div><RoleBadge role={user.role} /></div>
            </div>
            <div>
              <label className="text-sm text-gray-500">תוכנית</label>
              <div>
                {user.plan_name_he || user.plan_name || 'חינמי'}
                {user.is_manual && <span className="text-xs text-purple-600 mr-1">(ידני)</span>}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">בוטים</label>
              <div className="font-medium">{user.bots_count || 0}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">אנשי קשר</label>
              <div className="font-medium">{user.contacts_count || 0}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">נוצר</label>
              <div className="font-medium">{new Date(user.created_at).toLocaleString('he-IL')}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">סטטוס</label>
              <div className="flex gap-1">
                {user.is_verified ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">מאומת</span>
                ) : (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">לא מאומת</span>
                )}
                {user.is_active ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">פעיל</span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">מושבת</span>
                )}
              </div>
            </div>
            {user.expires_at && (
              <div className="col-span-2">
                <label className="text-sm text-gray-500">תאריך תפוגה</label>
                <div className="font-medium">{new Date(user.expires_at).toLocaleDateString('he-IL')}</div>
              </div>
            )}
            {user.started_at && (
              <div className="col-span-2">
                <label className="text-sm text-gray-500">תחילת מנוי</label>
                <div className="font-medium">{new Date(user.started_at).toLocaleDateString('he-IL')}</div>
              </div>
            )}
            {user.referred_by_name && (
              <div className="col-span-2">
                <label className="text-sm text-gray-500">הגיע דרך</label>
                <div className="font-medium flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">שותף</span>
                  {user.referred_by_name}
                  <span className="text-gray-500 text-sm">({user.referred_by_email})</span>
                  {user.referral_status === 'converted' && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">הומר</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditSubscriptionModal({ user, onClose, onSuccess }) {
  const [plans, setPlans] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('subscription'); // 'subscription' | 'discount' | 'referral' | 'features'
  const [featureOverrides, setFeatureOverrides] = useState(null);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [formData, setFormData] = useState({
    planId: '',
    status: user.subscription_status || 'active',
    expiresAt: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
    noExpiry: !user.expires_at && user.is_manual,
    isManual: user.is_manual || false,
    adminNotes: '',
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

  const handleSaveFeatures = async () => {
    setSavingFeatures(true);
    try {
      await api.put(`/admin/users/${user.id}/feature-overrides`, {
        feature_overrides: featureOverrides
      });
      alert('הגדרות הפיצ\'רים עודכנו בהצלחה');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון הגדרות');
    } finally {
      setSavingFeatures(false);
    }
  };

  const clearFeatureOverrides = async () => {
    if (!confirm('האם למחוק את כל ההגדרות המותאמות? המשתמש יקבל את הגדרות התוכנית שלו')) return;
    setSavingFeatures(true);
    try {
      await api.put(`/admin/users/${user.id}/feature-overrides`, {
        feature_overrides: null
      });
      setFeatureOverrides(null);
      alert('ההגדרות המותאמות נמחקו');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקת הגדרות');
    } finally {
      setSavingFeatures(false);
    }
  };

  const updateFeatureOverride = (key, value) => {
    setFeatureOverrides(prev => {
      const newOverrides = { ...(prev || {}) };
      if (value === null || value === undefined || value === '') {
        delete newOverrides[key];
      } else {
        newOverrides[key] = value;
      }
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
      alert(err.response?.data?.error || 'שגיאה בעדכון מנוי');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            עריכת מנוי - {user.name || user.email}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setActiveTab('subscription')}
            className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
              activeTab === 'subscription' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            מנוי
          </button>
          <button
            onClick={() => setActiveTab('discount')}
            className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
              activeTab === 'discount' ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            הנחה
          </button>
          <button
            onClick={() => setActiveTab('referral')}
            className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
              activeTab === 'referral' ? 'bg-white shadow text-purple-600 font-medium' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            שותף
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
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

                <div className="space-y-3">
                  {/* Bots */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="block text-sm font-medium text-gray-700 mb-2">מכסת בוטים</label>
                    <input
                      type="number"
                      placeholder="ברירת מחדל מהתוכנית"
                      value={featureOverrides?.max_bots ?? ''}
                      onChange={(e) => updateFeatureOverride('max_bots', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">-1 = ללא הגבלה</p>
                  </div>

                  {/* Bot runs */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="block text-sm font-medium text-gray-700 mb-2">הרצות בוט בחודש</label>
                    <input
                      type="number"
                      placeholder="ברירת מחדל מהתוכנית"
                      value={featureOverrides?.max_bot_runs_per_month ?? ''}
                      onChange={(e) => updateFeatureOverride('max_bot_runs_per_month', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>

                  {/* Contacts */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <label className="block text-sm font-medium text-gray-700 mb-2">מכסת אנשי קשר</label>
                    <input
                      type="number"
                      placeholder="ברירת מחדל מהתוכנית"
                      value={featureOverrides?.max_contacts ?? ''}
                      onChange={(e) => updateFeatureOverride('max_contacts', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
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
                        <input
                          type="number"
                          placeholder="ברירת מחדל"
                          value={featureOverrides?.max_group_forwards ?? ''}
                          onChange={(e) => updateFeatureOverride('max_group_forwards', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">מקסימום יעדים</label>
                        <input
                          type="number"
                          placeholder="ברירת מחדל"
                          value={featureOverrides?.max_forward_targets ?? ''}
                          onChange={(e) => updateFeatureOverride('max_forward_targets', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                        />
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
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.planId}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'שומר...' : 'שמירה'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
