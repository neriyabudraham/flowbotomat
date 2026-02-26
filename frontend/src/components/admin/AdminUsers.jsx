import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Check, X, RefreshCw, Eye, CreditCard, Calendar, AlertCircle,
  ExternalLink, Users, Phone, BarChart3, Send, ArrowRightLeft, 
  MessageSquare, Bot, Filter, Copy, Link, AlertTriangle,
  Settings, Zap, Crown, Clock, DollarSign, Trash2, Edit,
  SlidersHorizontal, Download, MoreVertical, UserCheck, UserX,
  Package, Layers, CheckCircle, XCircle
} from 'lucide-react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

// Quick filter chips
const QUICK_FILTERS = [
  { id: 'all', label: 'הכל', icon: Users },
  { id: 'active_paid', label: 'משלמים פעילים', icon: Crown, color: 'green' },
  { id: 'trial', label: 'בניסיון', icon: Clock, color: 'cyan' },
  { id: 'no_credit_card', label: 'ללא אשראי', icon: AlertTriangle, color: 'red' },
  { id: 'cancelled', label: 'מבוטלים', icon: XCircle, color: 'orange' },
  { id: 'with_modules', label: 'עם מודולים', icon: Package, color: 'purple' },
  { id: 'connected_whatsapp', label: 'וואטסאפ מחובר', icon: Phone, color: 'green' },
];

// Sortable columns
const SORTABLE_COLUMNS = [
  { id: 'name', label: 'שם' },
  { id: 'created_at', label: 'תאריך הצטרפות' },
  { id: 'subscription_status', label: 'סטטוס מנוי' },
  { id: 'bots_count', label: 'בוטים' },
  { id: 'contacts_count', label: 'אנשי קשר' },
];

export default function AdminUsers() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  
  // Filters
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  
  // UI State
  const [selectedUser, setSelectedUser] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 25,
        sort: sortBy,
        order: sortOrder,
      });
      
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      
      // Quick filter mappings
      if (quickFilter === 'active_paid') {
        params.append('status', 'active');
        params.append('has_payment', 'true');
      } else if (quickFilter === 'trial') {
        params.append('status', 'trial');
      } else if (quickFilter === 'no_credit_card') {
        params.append('no_payment_method', 'true');
      } else if (quickFilter === 'cancelled') {
        params.append('status', 'cancelled');
      } else if (quickFilter === 'with_modules') {
        params.append('has_modules', 'true');
      } else if (quickFilter === 'connected_whatsapp') {
        params.append('whatsapp_connected', 'true');
      }
      
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
  }, [search, quickFilter, sortBy, sortOrder, roleFilter]);

  useEffect(() => {
    if (currentUser) {
      loadUsers(1);
    }
  }, [loadUsers, currentUser]);
  
  if (!currentUser) {
    return <div className="flex items-center justify-center h-64 text-gray-500">טוען...</div>;
  }

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSwitchToAccount = async (userId, userName) => {
    setSwitching(userId);
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && !localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      
      const { data } = await api.post(`/experts/switch/${userId}`);
      
      if (data?.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/dashboard';
      } else {
        showToast('error', 'לא התקבל טוקן מהשרת');
        setSwitching(null);
      }
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה במעבר לחשבון');
      setSwitching(null);
    }
  };

  const handleGeneratePaymentLink = async (userId, userName) => {
    try {
      const { data } = await api.post(`/admin/users/${userId}/payment-link`);
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        setCopiedLink(userId);
        setTimeout(() => setCopiedLink(null), 2000);
        showToast('success', `לינק תשלום ל-${userName} הועתק!`);
      }
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה ביצירת לינק');
    }
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
          loadUsers(pagination.page);
        } catch (err) {
          showToast('error', err.response?.data?.error || 'שגיאה במחיקת משתמש');
        }
      }
    });
  };

  const handleToggleActive = async (userId, currentActive) => {
    try {
      await api.put(`/admin/users/${userId}`, { is_active: !currentActive });
      showToast('success', currentActive ? 'המשתמש הושבת' : 'המשתמש הופעל');
      loadUsers(pagination.page);
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בעדכון');
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
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
        <ConfirmModal 
          {...confirmModal}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">ניהול משתמשים</h2>
            <p className="text-sm text-gray-500">{pagination.total} משתמשים במערכת</p>
          </div>
        </div>
        <button 
          onClick={() => loadUsers(pagination.page)} 
          className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          title="רענון"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search & Quick Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        {/* Search Bar */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש לפי שם, מייל או טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl focus:ring-2 focus:ring-purple-500 text-gray-800 dark:text-white placeholder-gray-400"
            />
          </div>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`px-4 py-3 rounded-xl border transition-colors flex items-center gap-2 ${
              showAdvancedFilters 
                ? 'bg-purple-50 border-purple-200 text-purple-700' 
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span className="hidden sm:inline">סינון מתקדם</span>
          </button>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map(filter => (
            <button
              key={filter.id}
              onClick={() => setQuickFilter(filter.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                quickFilter === filter.id
                  ? filter.color 
                    ? `bg-${filter.color}-100 text-${filter.color}-700 ring-2 ring-${filter.color}-500 ring-offset-1`
                    : 'bg-purple-100 text-purple-700 ring-2 ring-purple-500 ring-offset-1'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <filter.icon className="w-3.5 h-3.5" />
              {filter.label}
            </button>
          ))}
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-600 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">תפקיד</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-sm"
              >
                <option value="">הכל</option>
                <option value="user">משתמש</option>
                <option value="expert">מומחה</option>
                <option value="admin">אדמין</option>
                <option value="superadmin">סופר-אדמין</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">מיון לפי</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-sm"
              >
                {SORTABLE_COLUMNS.map(col => (
                  <option key={col.id} value={col.id}>{col.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">סדר</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-sm"
              >
                <option value="desc">יורד</option>
                <option value="asc">עולה</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                <th className="px-4 py-3 text-right">
                  <button 
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-purple-600"
                  >
                    משתמש
                    {sortBy === 'name' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">מנוי</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">תשלום</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">WhatsApp</th>
                <th className="px-4 py-3 text-right">
                  <button 
                    onClick={() => handleSort('bots_count')}
                    className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-purple-600"
                  >
                    בוטים
                    {sortBy === 'bots_count' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">מודולים</th>
                <th className="px-4 py-3 text-right">
                  <button 
                    onClick={() => handleSort('created_at')}
                    className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-purple-600"
                  >
                    הצטרף
                    {sortBy === 'created_at' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600 dark:text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-500 mb-2" />
                    <span className="text-gray-500">טוען משתמשים...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    לא נמצאו משתמשים
                  </td>
                </tr>
              ) : users.map(u => (
                <UserRow 
                  key={u.id}
                  user={u}
                  currentUserId={currentUser.id}
                  currentUserRole={currentUser.role}
                  switching={switching}
                  copiedLink={copiedLink}
                  onSelect={() => setSelectedUser(u)}
                  onSwitch={() => handleSwitchToAccount(u.id, u.name || u.email)}
                  onGenerateLink={() => handleGeneratePaymentLink(u.id, u.name || u.email)}
                  onToggleActive={() => handleToggleActive(u.id, u.is_active)}
                  onDelete={() => handleDeleteUser(u.id, u.name || u.email)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <span className="text-sm text-gray-500">
              עמוד {pagination.page} מתוך {pagination.pages} ({pagination.total} משתמשים)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => loadUsers(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                let pageNum;
                if (pagination.pages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.pages - 2) {
                  pageNum = pagination.pages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => loadUsers(pageNum)}
                    disabled={loading}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      pagination.page === pageNum
                        ? 'bg-purple-600 text-white'
                        : 'hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => loadUsers(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages || loading}
                className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Modal */}
      {selectedUser && (
        <UserModal 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)}
          onSuccess={() => {
            loadUsers(pagination.page);
            setSelectedUser(null);
          }}
          onSwitchAccount={handleSwitchToAccount}
          onGeneratePaymentLink={handleGeneratePaymentLink}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
        />
      )}
    </div>
  );
}

// User Row Component
function UserRow({ user, currentUserId, currentUserRole, switching, copiedLink, onSelect, onSwitch, onGenerateLink, onToggleActive, onDelete }) {
  const u = user;
  
  // Determine subscription display
  const getSubscriptionInfo = () => {
    const status = u.subscription_status;
    const planName = u.plan_name_he || u.plan_name || 'חינם';
    
    if (status === 'active') {
      if (u.is_manual) {
        return { label: planName, sub: 'ידני', color: 'purple' };
      }
      if (planName === 'Free' || !u.plan_name) {
        return { label: 'חינם', sub: null, color: 'gray' };
      }
      return { label: planName, sub: null, color: 'green' };
    }
    if (status === 'trial') {
      const daysLeft = u.trial_ends_at 
        ? Math.max(0, Math.ceil((new Date(u.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;
      return { label: planName, sub: `ניסיון - ${daysLeft} ימים`, color: 'cyan' };
    }
    if (status === 'cancelled') {
      const daysLeft = u.expires_at 
        ? Math.max(0, Math.ceil((new Date(u.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;
      return { label: planName, sub: daysLeft > 0 ? `מבוטל - ${daysLeft} ימים` : 'מבוטל', color: 'orange' };
    }
    return { label: 'חינם', sub: null, color: 'gray' };
  };
  
  const subInfo = getSubscriptionInfo();
  const hasPaymentMethod = u.has_payment_method;
  const hasModules = (u.has_status_bot || u.group_forwards_count > 0 || u.broadcast_campaigns_count > 0);
  
  const colorClasses = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  };

  return (
    <tr 
      className="hover:bg-purple-50 dark:hover:bg-purple-900/10 cursor-pointer transition-colors group"
      onClick={onSelect}
    >
      {/* User Info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
            subInfo.color === 'green' ? 'bg-gradient-to-br from-green-400 to-green-600' :
            subInfo.color === 'cyan' ? 'bg-gradient-to-br from-cyan-400 to-cyan-600' :
            subInfo.color === 'purple' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
            subInfo.color === 'orange' ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
            'bg-gradient-to-br from-gray-400 to-gray-500'
          }`}>
            {(u.name || u.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-800 dark:text-white truncate flex items-center gap-2">
              {u.name || 'ללא שם'}
              {!u.is_active && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded">מושבת</span>
              )}
              <RoleBadge role={u.role} />
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
          </div>
        </div>
      </td>

      {/* Subscription */}
      <td className="px-4 py-3">
        <div className={`inline-flex flex-col items-center px-2.5 py-1 rounded-lg text-xs font-medium ${colorClasses[subInfo.color]}`}>
          <span>{subInfo.label}</span>
          {subInfo.sub && <span className="text-[10px] opacity-75">{subInfo.sub}</span>}
        </div>
      </td>

      {/* Payment Status */}
      <td className="px-4 py-3">
        {hasPaymentMethod ? (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CreditCard className="w-4 h-4" />
            <span className="text-xs">
              {u.card_last_digits ? `•••• ${u.card_last_digits}` : 'יש אשראי'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-red-500">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">אין אשראי</span>
          </div>
        )}
      </td>

      {/* WhatsApp */}
      <td className="px-4 py-3">
        {u.whatsapp_status === 'connected' ? (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <Phone className="w-4 h-4" />
            <span className="text-xs font-mono">{u.whatsapp_phone || 'מחובר'}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">לא מחובר</span>
        )}
      </td>

      {/* Bots */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-300">{u.bots_count || 0}</span>
          {u.active_bots_count > 0 && (
            <span className="text-xs text-green-500">({u.active_bots_count} פעילים)</span>
          )}
        </div>
      </td>

      {/* Modules */}
      <td className="px-4 py-3">
        {hasModules ? (
          <div className="flex items-center gap-1 flex-wrap">
            {u.has_status_bot && (
              <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 text-[10px] rounded">סטטוס בוט</span>
            )}
            {u.group_forwards_count > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] rounded">העברות ({u.group_forwards_count})</span>
            )}
            {u.broadcast_campaigns_count > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px] rounded">שידורים ({u.broadcast_campaigns_count})</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Created At */}
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        {new Date(u.created_at).toLocaleDateString('he-IL')}
      </td>

      {/* Actions */}
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          {/* Generate Payment Link */}
          <button
            onClick={onGenerateLink}
            className={`p-1.5 rounded-lg transition-colors ${
              copiedLink === u.id 
                ? 'bg-green-100 text-green-600' 
                : 'hover:bg-purple-100 text-purple-600 dark:hover:bg-purple-900/30'
            }`}
            title="העתק לינק תשלום"
          >
            {copiedLink === u.id ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
          </button>

          {/* Switch to Account */}
          <button
            onClick={onSwitch}
            disabled={switching === u.id || u.id === currentUserId}
            className={`p-1.5 rounded-lg transition-colors ${
              u.id === currentUserId 
                ? 'text-gray-300 cursor-not-allowed' 
                : 'hover:bg-blue-100 text-blue-600 dark:hover:bg-blue-900/30'
            }`}
            title="עבור לחשבון"
          >
            {switching === u.id ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
          </button>

          {/* Toggle Active */}
          <button
            onClick={onToggleActive}
            className={`p-1.5 rounded-lg transition-colors ${
              u.is_active
                ? 'hover:bg-yellow-100 text-yellow-600 dark:hover:bg-yellow-900/30'
                : 'hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30'
            }`}
            title={u.is_active ? 'השבת משתמש' : 'הפעל משתמש'}
          >
            {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </button>

          {/* Delete (superadmin only) */}
          {currentUserRole === 'superadmin' && u.id !== currentUserId && (
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 transition-colors"
              title="מחק משתמש"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RoleBadge({ role }) {
  const styles = {
    user: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    expert: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    superadmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels = {
    user: 'משתמש',
    expert: 'מומחה',
    admin: 'אדמין',
    superadmin: 'סופר',
  };

  if (role === 'user') return null;

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[role] || styles.user}`}>
      {labels[role] || role}
    </span>
  );
}

function ConfirmModal({ title, message, variant, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white transition-colors ${
              variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}

// User Modal Component - Full user management
function UserModal({ user, onClose, onSuccess, onSwitchAccount, onGeneratePaymentLink, currentUserId, currentUserRole }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [plans, setPlans] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [featureOverrides, setFeatureOverrides] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [userBots, setUserBots] = useState([]);
  
  const [formData, setFormData] = useState({
    planId: '',
    status: user.subscription_status || 'active',
    expiresAt: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
    noExpiry: !user.expires_at && user.is_manual,
    isManual: user.is_manual || false,
    adminNotes: user.admin_notes || '',
    nextChargeDate: user.next_charge_date ? new Date(user.next_charge_date).toISOString().split('T')[0] : '',
    trialEndsAt: user.trial_ends_at ? new Date(user.trial_ends_at).toISOString().split('T')[0] : '',
    customDiscount: user.custom_discount_percent || 0,
    discountType: user.custom_discount_type || 'none',
    affiliateId: user.referred_by_affiliate_id || '',
    skipTrial: user.skip_trial || false,
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [plansRes, affiliatesRes, overridesRes, billingRes, botsRes] = await Promise.all([
        api.get('/admin/plans'),
        api.get('/admin/affiliates/list').catch(() => ({ data: { affiliates: [] } })),
        api.get(`/admin/users/${user.id}/feature-overrides`).catch(() => ({ data: { feature_overrides: null } })),
        api.get(`/admin/users/${user.id}/billing-history`).catch(() => ({ data: { history: [] } })),
        api.get(`/admin/users/${user.id}/bots`).catch(() => ({ data: { bots: [] } })),
      ]);
      
      setPlans(plansRes.data.plans || []);
      setAffiliates(affiliatesRes.data.affiliates || []);
      setFeatureOverrides(overridesRes.data.feature_overrides || null);
      setBillingHistory(billingRes.data.history || []);
      setUserBots(botsRes.data.bots || []);
      
      if (plansRes.data.plans?.length > 0) {
        const currentPlan = plansRes.data.plans.find(p => p.name === user.plan_name || p.name_he === user.plan_name_he);
        if (currentPlan) {
          setFormData(f => ({ ...f, planId: currentPlan.id }));
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/subscription`, {
        planId: formData.planId,
        status: formData.status,
        expiresAt: formData.noExpiry ? null : (formData.expiresAt || null),
        isManual: formData.isManual,
        adminNotes: formData.adminNotes || null,
        nextChargeDate: formData.isManual ? null : (formData.nextChargeDate || null),
        trialEndsAt: formData.trialEndsAt || null,
        customDiscountPercent: formData.discountType !== 'none' ? formData.customDiscount : null,
        customDiscountType: formData.discountType !== 'none' ? formData.discountType : null,
        affiliateId: formData.affiliateId || null,
        skipTrial: formData.skipTrial || false,
      });
      showToast('success', 'המנוי עודכן בהצלחה');
      onSuccess();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'סקירה', icon: Eye },
    { id: 'subscription', label: 'מנוי', icon: Crown },
    { id: 'billing', label: 'חיובים', icon: DollarSign },
    { id: 'bots', label: 'בוטים', icon: Bot },
    { id: 'features', label: 'הגדרות', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Toast */}
        {toast && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg z-[60] flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}>
            {toast.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-l from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl ${
                user.subscription_status === 'active' && !user.is_manual ? 'bg-gradient-to-br from-green-400 to-green-600' :
                user.is_manual ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
                user.subscription_status === 'trial' ? 'bg-gradient-to-br from-cyan-400 to-cyan-600' :
                'bg-gradient-to-br from-gray-400 to-gray-500'
              }`}>
                {(user.name || user.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  {user.name || 'ללא שם'}
                  <RoleBadge role={user.role} />
                </h2>
                <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
                {user.phone && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" /> {user.phone}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onGeneratePaymentLink(user.id, user.name || user.email)}
                className="px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-xl hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors flex items-center gap-2 text-sm"
              >
                <Link className="w-4 h-4" />
                לינק תשלום
              </button>
              {user.id !== currentUserId && (
                <button
                  onClick={() => onSwitchAccount(user.id, user.name || user.email)}
                  className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-xl hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  כניסה לחשבון
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex gap-1 overflow-x-auto pb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-t-xl text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 border-t border-x border-gray-200 dark:border-gray-700 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <OverviewTab user={user} userBots={userBots} billingHistory={billingHistory} />
              )}

              {/* Subscription Tab */}
              {activeTab === 'subscription' && (
                <SubscriptionTab 
                  user={user}
                  formData={formData}
                  setFormData={setFormData}
                  plans={plans}
                  affiliates={affiliates}
                  saving={saving}
                  onSave={handleSave}
                />
              )}

              {/* Billing Tab */}
              {activeTab === 'billing' && (
                <BillingTab user={user} billingHistory={billingHistory} />
              )}

              {/* Bots Tab */}
              {activeTab === 'bots' && (
                <BotsTab user={user} userBots={userBots} onRefresh={loadAllData} />
              )}

              {/* Features Tab */}
              {activeTab === 'features' && (
                <FeaturesTab 
                  user={user}
                  featureOverrides={featureOverrides}
                  setFeatureOverrides={setFeatureOverrides}
                  plans={plans}
                  showToast={showToast}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({ user, userBots, billingHistory }) {
  const stats = [
    { label: 'בוטים', value: user.bots_count || 0, icon: Bot, color: 'purple' },
    { label: 'בוטים פעילים', value: user.active_bots_count || 0, icon: Zap, color: 'green' },
    { label: 'אנשי קשר', value: user.contacts_count || 0, icon: Users, color: 'blue' },
    { label: 'העברות קבוצות', value: user.group_forwards_count || 0, icon: ArrowRightLeft, color: 'cyan' },
    { label: 'קמפייני שידור', value: user.broadcast_campaigns_count || 0, icon: Send, color: 'orange' },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
            <stat.icon className={`w-6 h-6 mx-auto mb-2 text-${stat.color}-500`} />
            <div className="text-2xl font-bold text-gray-800 dark:text-white">{stat.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Subscription Status */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-500" />
          סטטוס מנוי
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">תוכנית:</span>
            <div className="font-medium text-gray-800 dark:text-white">{user.plan_name_he || user.plan_name || 'חינם'}</div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">סטטוס:</span>
            <div className="font-medium text-gray-800 dark:text-white">
              {user.subscription_status === 'active' ? 'פעיל' :
               user.subscription_status === 'trial' ? 'ניסיון' :
               user.subscription_status === 'cancelled' ? 'מבוטל' : 'לא פעיל'}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">אשראי:</span>
            <div className={`font-medium ${user.has_payment_method ? 'text-green-600' : 'text-red-500'}`}>
              {user.has_payment_method ? 'קיים' : 'חסר'}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">WhatsApp:</span>
            <div className={`font-medium ${user.whatsapp_status === 'connected' ? 'text-green-600' : 'text-gray-400'}`}>
              {user.whatsapp_status === 'connected' ? 'מחובר' : 'לא מחובר'}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Bots */}
      {userBots.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            בוטים אחרונים
          </h3>
          <div className="space-y-2">
            {userBots.slice(0, 3).map(bot => (
              <div key={bot.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-600 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${bot.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-gray-800 dark:text-white">{bot.name}</span>
                  {bot.locked_reason && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded">נעול</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{new Date(bot.updated_at).toLocaleDateString('he-IL')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      {billingHistory.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            תשלומים אחרונים
          </h3>
          <div className="space-y-2">
            {billingHistory.slice(0, 3).map(payment => (
              <div key={payment.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-600 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    payment.status === 'completed' ? 'bg-green-500' :
                    payment.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-gray-800 dark:text-white">₪{payment.amount}</span>
                </div>
                <span className="text-xs text-gray-500">{new Date(payment.created_at).toLocaleDateString('he-IL')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Subscription Tab
function SubscriptionTab({ user, formData, setFormData, plans, affiliates, saving, onSave }) {
  return (
    <div className="space-y-6">
      {/* Plan Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תוכנית</label>
        <select
          value={formData.planId}
          onChange={(e) => setFormData(f => ({ ...f, planId: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white"
        >
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.name_he || plan.name} - ₪{plan.price}/{plan.billing_period === 'monthly' ? 'חודש' : 'שנה'}
            </option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סטטוס מנוי</label>
        <select
          value={formData.status}
          onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white"
        >
          <option value="active">פעיל</option>
          <option value="trial">תקופת ניסיון</option>
          <option value="cancelled">מבוטל</option>
          <option value="expired">פג תוקף</option>
        </select>
      </div>

      {/* Manual Subscription */}
      <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
        <input
          type="checkbox"
          id="isManual"
          checked={formData.isManual}
          onChange={(e) => setFormData(f => ({ ...f, isManual: e.target.checked }))}
          className="w-5 h-5 rounded text-purple-600"
        />
        <label htmlFor="isManual" className="text-gray-700 dark:text-gray-300">
          מנוי ידני (ללא תשלום אוטומטי)
        </label>
      </div>

      {/* Expiry Date */}
      {!formData.isManual && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תאריך תפוגה</label>
          <input
            type="date"
            value={formData.expiresAt}
            onChange={(e) => setFormData(f => ({ ...f, expiresAt: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white"
          />
        </div>
      )}

      {formData.isManual && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="noExpiry"
            checked={formData.noExpiry}
            onChange={(e) => setFormData(f => ({ ...f, noExpiry: e.target.checked }))}
            className="w-5 h-5 rounded text-purple-600"
          />
          <label htmlFor="noExpiry" className="text-gray-700 dark:text-gray-300">
            ללא תאריך תפוגה (אינסופי)
          </label>
        </div>
      )}

      {/* Trial End Date */}
      {formData.status === 'trial' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סיום ניסיון</label>
          <input
            type="date"
            value={formData.trialEndsAt}
            onChange={(e) => setFormData(f => ({ ...f, trialEndsAt: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white"
          />
        </div>
      )}

      {/* Discount */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">הנחה</label>
        <select
          value={formData.discountType}
          onChange={(e) => setFormData(f => ({ ...f, discountType: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white"
        >
          <option value="none">ללא הנחה</option>
          <option value="first_payment">תשלום ראשון בלבד</option>
          <option value="first_year">שנה ראשונה</option>
          <option value="forever">לצמיתות</option>
        </select>
        
        {formData.discountType !== 'none' && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={formData.customDiscount}
              onChange={(e) => setFormData(f => ({ ...f, customDiscount: parseInt(e.target.value) || 0 }))}
              min="0"
              max="100"
              className="w-24 px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white"
            />
            <span className="text-gray-500">% הנחה</span>
          </div>
        )}
      </div>

      {/* Admin Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">הערות אדמין</label>
        <textarea
          value={formData.adminNotes}
          onChange={(e) => setFormData(f => ({ ...f, adminNotes: e.target.value }))}
          rows={3}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border-0 rounded-xl text-gray-800 dark:text-white resize-none"
          placeholder="הערות פנימיות..."
        />
      </div>

      {/* Save Button */}
      <button
        onClick={onSave}
        disabled={saving}
        className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        שמור שינויים
      </button>
    </div>
  );
}

// Billing Tab
function BillingTab({ user, billingHistory }) {
  return (
    <div className="space-y-6">
      {/* Payment Method Status */}
      <div className={`p-4 rounded-xl flex items-center gap-3 ${
        user.has_payment_method 
          ? 'bg-green-50 dark:bg-green-900/20' 
          : 'bg-red-50 dark:bg-red-900/20'
      }`}>
        {user.has_payment_method ? (
          <>
            <CreditCard className="w-6 h-6 text-green-600" />
            <div>
              <div className="font-medium text-green-700 dark:text-green-400">אשראי קיים במערכת</div>
              {user.card_last_digits && (
                <div className="text-sm text-green-600 dark:text-green-500">•••• {user.card_last_digits}</div>
              )}
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <div>
              <div className="font-medium text-red-700 dark:text-red-400">אין אשראי במערכת</div>
              <div className="text-sm text-red-600 dark:text-red-500">יש לשלוח למשתמש לינק להוספת אשראי</div>
            </div>
          </>
        )}
      </div>

      {/* Billing History */}
      <div>
        <h3 className="font-semibold text-gray-800 dark:text-white mb-3">היסטוריית חיובים</h3>
        {billingHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-30" />
            אין היסטוריית חיובים
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-gray-600">
                <tr>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-300">תאריך</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-300">סכום</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-300">סטטוס</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-300">סוג</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {billingHistory.map(payment => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {new Date(payment.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white">
                      ₪{payment.amount}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        payment.status === 'completed' ? 'bg-green-100 text-green-700' :
                        payment.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {payment.status === 'completed' ? 'הושלם' :
                         payment.status === 'failed' ? 'נכשל' : 'ממתין'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {payment.charge_type || 'חיוב'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Bots Tab
function BotsTab({ user, userBots, onRefresh }) {
  const [toggling, setToggling] = useState(null);

  const handleToggleLock = async (botId, currentLocked) => {
    setToggling(botId);
    try {
      await api.put(`/admin/bots/${botId}/lock`, { locked: !currentLocked });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle lock:', err);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-4">
      {userBots.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Bot className="w-12 h-12 mx-auto mb-2 opacity-30" />
          אין בוטים
        </div>
      ) : (
        <div className="space-y-3">
          {userBots.map(bot => (
            <div 
              key={bot.id} 
              className={`p-4 rounded-xl border ${
                bot.locked_reason 
                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                  : 'bg-gray-50 border-gray-200 dark:bg-gray-700/50 dark:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    bot.locked_reason ? 'bg-red-500' :
                    bot.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div>
                    <div className="font-medium text-gray-800 dark:text-white flex items-center gap-2">
                      {bot.name}
                      {bot.locked_reason && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded">
                          נעול: {bot.locked_reason}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      עודכן: {new Date(bot.updated_at).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleLock(bot.id, !!bot.locked_reason)}
                  disabled={toggling === bot.id}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    bot.locked_reason
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  {toggling === bot.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    bot.locked_reason ? 'בטל נעילה' : 'נעל'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Features Tab
function FeaturesTab({ user, featureOverrides, setFeatureOverrides, plans, showToast }) {
  const [saving, setSaving] = useState(false);
  
  const currentPlan = plans.find(p => p.name === user.plan_name || p.name_he === user.plan_name_he);
  const planLimits = currentPlan?.features || {};

  const features = [
    { key: 'max_bots', label: 'מקסימום בוטים', type: 'number' },
    { key: 'max_contacts', label: 'מקסימום אנשי קשר', type: 'number' },
    { key: 'max_active_bots', label: 'מקסימום בוטים פעילים', type: 'number' },
    { key: 'max_messages_per_day', label: 'הודעות ליום', type: 'number' },
    { key: 'allow_broadcasts', label: 'שידורים', type: 'boolean' },
    { key: 'allow_image_generation', label: 'יצירת תמונות', type: 'boolean' },
    { key: 'allow_ai', label: 'בינה מלאכותית', type: 'boolean' },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/feature-overrides`, {
        feature_overrides: featureOverrides
      });
      showToast('success', 'ההגדרות נשמרו');
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const updateOverride = (key, value) => {
    setFeatureOverrides(prev => {
      const newOverrides = { ...(prev || {}) };
      if (value === null || value === undefined || value === '') {
        delete newOverrides[key];
      } else {
        newOverrides[key] = value;
      }
      return Object.keys(newOverrides).length === 0 ? null : newOverrides;
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          הגדרות אלו דורסות את הגדרות התוכנית. השאר ריק לשימוש בברירת המחדל של התוכנית.
        </p>
      </div>

      <div className="space-y-4">
        {features.map(feature => (
          <div key={feature.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div>
              <div className="font-medium text-gray-800 dark:text-white">{feature.label}</div>
              <div className="text-xs text-gray-500">
                ברירת מחדל: {planLimits[feature.key] ?? 'לא מוגדר'}
              </div>
            </div>
            {feature.type === 'number' ? (
              <input
                type="number"
                value={featureOverrides?.[feature.key] ?? ''}
                onChange={(e) => updateOverride(feature.key, e.target.value ? parseInt(e.target.value) : null)}
                placeholder="ברירת מחדל"
                className="w-32 px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-gray-800 dark:text-white text-center"
              />
            ) : (
              <select
                value={featureOverrides?.[feature.key] === true ? 'true' : featureOverrides?.[feature.key] === false ? 'false' : ''}
                onChange={(e) => updateOverride(feature.key, e.target.value === '' ? null : e.target.value === 'true')}
                className="w-32 px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-gray-800 dark:text-white"
              >
                <option value="">ברירת מחדל</option>
                <option value="true">מופעל</option>
                <option value="false">מושבת</option>
              </select>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        שמור הגדרות
      </button>
    </div>
  );
}
