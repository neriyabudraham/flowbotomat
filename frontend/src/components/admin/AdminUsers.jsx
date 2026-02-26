import { useState, useEffect, useCallback } from 'react';
import { 
  Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Check, X, RefreshCw, Eye, CreditCard, Calendar, AlertCircle,
  ExternalLink, Users, Phone, BarChart3, Send, ArrowRightLeft, 
  MessageSquare, Bot, Filter, Copy, Link2, AlertTriangle,
  Settings, Zap, Crown, Clock, DollarSign, Trash2, Edit,
  SlidersHorizontal, Download, MoreVertical, UserCheck, UserX,
  Package, Layers, CheckCircle, XCircle, Activity, TrendingUp,
  Smartphone, Mail, Hash, Globe, Shield, Star, Sparkles,
  ArrowUpRight, MoreHorizontal, Wallet, Receipt, History,
  Lock, Unlock, PlayCircle, PauseCircle, Info
} from 'lucide-react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}

export default function AdminUsers() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  
  // Filters
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    subscriptionStatus: '',
    paymentStatus: '',
    whatsappStatus: '',
    hasModules: '',
    role: '',
    dateRange: '',
  });
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // UI State
  const [selectedUser, setSelectedUser] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'cards' | 'table'
  const [switching, setSwitching] = useState(null);
  const [toast, setToast] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [stats, setStats] = useState(null);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: viewMode === 'cards' ? 12 : 25,
        sort: sortBy,
        order: sortOrder,
      });
      
      if (search) params.append('search', search);
      if (filters.role) params.append('role', filters.role);
      if (filters.subscriptionStatus) params.append('status', filters.subscriptionStatus);
      if (filters.paymentStatus === 'has_payment') params.append('has_payment', 'true');
      if (filters.paymentStatus === 'no_payment') params.append('no_payment_method', 'true');
      if (filters.whatsappStatus === 'connected') params.append('whatsapp_connected', 'true');
      if (filters.hasModules === 'yes') params.append('has_modules', 'true');
      
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
  }, [search, filters, sortBy, sortOrder, viewMode]);

  const loadStats = async () => {
    try {
      const { data } = await api.get('/admin/stats');
      const s = data.stats || data;
      setStats({
        totalUsers: parseInt(s.total_users) || 0,
        activeSubscriptions: parseInt(s.active_subscriptions) || 0,
        trialUsers: parseInt(s.trial_users) || 0,
        usersWithoutPayment: parseInt(s.users_without_payment) || 0,
        connectedWhatsapp: parseInt(s.connected_whatsapp) || 0,
        activeBots: parseInt(s.active_bots) || 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadUsers(1);
      loadStats();
    }
  }, [loadUsers, currentUser]);
  
  if (!currentUser) {
    return <div className="flex items-center justify-center h-64 text-gray-500">טוען...</div>;
  }

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const clearFilters = () => {
    setFilters({
      subscriptionStatus: '',
      paymentStatus: '',
      whatsappStatus: '',
      hasModules: '',
      role: '',
      dateRange: '',
    });
    setSearch('');
  };

  const activeFiltersCount = Object.values(filters).filter(v => v).length + (search ? 1 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 dark:from-gray-900 dark:via-purple-900/10 dark:to-gray-900 -m-6 p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-2xl z-[60] flex items-center gap-3 backdrop-blur-xl ${
          toast.type === 'success' 
            ? 'bg-emerald-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                ניהול משתמשים
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {pagination.total} משתמשים במערכת
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'cards' 
                    ? 'bg-violet-500 text-white shadow-md' 
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                כרטיסים
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'table' 
                    ? 'bg-violet-500 text-white shadow-md' 
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                טבלה
              </button>
            </div>

            <button 
              onClick={() => loadUsers(pagination.page)} 
              className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all"
              title="רענון"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-6">
            <StatCard 
              icon={Users} 
              label="סה״כ משתמשים" 
              value={stats.totalUsers || 0} 
              color="violet"
            />
            <StatCard 
              icon={Crown} 
              label="מנויים פעילים" 
              value={stats.activeSubscriptions || 0} 
              color="emerald"
            />
            <StatCard 
              icon={Clock} 
              label="בניסיון" 
              value={stats.trialUsers || 0} 
              color="cyan"
            />
            <StatCard 
              icon={AlertTriangle} 
              label="ללא אשראי" 
              value={stats.usersWithoutPayment || 0} 
              color="red"
              highlight
            />
            <StatCard 
              icon={Phone} 
              label="וואטסאפ מחובר" 
              value={stats.connectedWhatsapp || 0} 
              color="green"
            />
            <StatCard 
              icon={Bot} 
              label="בוטים פעילים" 
              value={stats.activeBots || 0} 
              color="blue"
            />
          </div>
        )}
      </div>

      {/* Filters Section */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-200/50 dark:border-gray-700/50 p-6 mb-6">
        {/* Search & Filter Toggle */}
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש לפי שם, מייל, טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-12 pl-4 py-4 bg-gray-50 dark:bg-gray-700/50 border-0 rounded-2xl focus:ring-2 focus:ring-violet-500 text-gray-800 dark:text-white placeholder-gray-400 text-lg"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-6 py-4 rounded-2xl font-medium transition-all flex items-center gap-3 ${
              showFilters || activeFiltersCount > 0
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span>מסננים</span>
            {activeFiltersCount > 0 && (
              <span className="px-2.5 py-1 bg-violet-500 text-white text-sm rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="px-6 py-4 rounded-2xl font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition-all flex items-center gap-2"
            >
              <X className="w-5 h-5" />
              נקה הכל
            </button>
          )}
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <FilterSelect
              label="סטטוס מנוי"
              value={filters.subscriptionStatus}
              onChange={(v) => setFilters(f => ({ ...f, subscriptionStatus: v }))}
              options={[
                { value: '', label: 'הכל' },
                { value: 'active', label: '✓ פעיל' },
                { value: 'trial', label: '⏳ ניסיון' },
                { value: 'cancelled', label: '✕ מבוטל' },
                { value: 'free', label: '○ חינם' },
              ]}
            />
            <FilterSelect
              label="סטטוס תשלום"
              value={filters.paymentStatus}
              onChange={(v) => setFilters(f => ({ ...f, paymentStatus: v }))}
              options={[
                { value: '', label: 'הכל' },
                { value: 'has_payment', label: '💳 יש אשראי' },
                { value: 'no_payment', label: '⚠️ אין אשראי' },
              ]}
            />
            <FilterSelect
              label="WhatsApp"
              value={filters.whatsappStatus}
              onChange={(v) => setFilters(f => ({ ...f, whatsappStatus: v }))}
              options={[
                { value: '', label: 'הכל' },
                { value: 'connected', label: '📱 מחובר' },
              ]}
            />
            <FilterSelect
              label="מודולים נוספים"
              value={filters.hasModules}
              onChange={(v) => setFilters(f => ({ ...f, hasModules: v }))}
              options={[
                { value: '', label: 'הכל' },
                { value: 'yes', label: '✓ יש מודולים' },
              ]}
            />
            <FilterSelect
              label="תפקיד"
              value={filters.role}
              onChange={(v) => setFilters(f => ({ ...f, role: v }))}
              options={[
                { value: '', label: 'הכל' },
                { value: 'user', label: 'משתמש' },
                { value: 'expert', label: 'מומחה' },
                { value: 'admin', label: 'אדמין' },
                { value: 'superadmin', label: 'סופר-אדמין' },
              ]}
            />
            <FilterSelect
              label="מיון לפי"
              value={sortBy}
              onChange={(v) => setSortBy(v)}
              options={[
                { value: 'created_at', label: 'תאריך הצטרפות' },
                { value: 'name', label: 'שם' },
                { value: 'bots_count', label: 'כמות בוטים' },
              ]}
            />
          </div>
        )}
      </div>

      {/* Users Grid/Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
            <RefreshCw className="w-8 h-8 text-white animate-spin" />
          </div>
          <span className="text-gray-500 dark:text-gray-400 text-lg">טוען משתמשים...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mb-4">
            <Users className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
          <span className="text-gray-500 dark:text-gray-400 text-lg">לא נמצאו משתמשים</span>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {users.map(user => (
            <UserCard 
              key={user.id}
              user={user}
              currentUser={currentUser}
              onSelect={() => setSelectedUser(user)}
              showToast={showToast}
            />
          ))}
        </div>
      ) : (
        <UsersTable 
          users={users}
          currentUser={currentUser}
          onSelect={setSelectedUser}
          showToast={showToast}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(col) => {
            if (sortBy === col) {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
            } else {
              setSortBy(col);
              setSortOrder('desc');
            }
          }}
        />
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => loadUsers(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(7, pagination.pages) }, (_, i) => {
              let pageNum;
              if (pagination.pages <= 7) {
                pageNum = i + 1;
              } else if (pagination.page <= 4) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.pages - 3) {
                pageNum = pagination.pages - 6 + i;
              } else {
                pageNum = pagination.page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => loadUsers(pageNum)}
                  disabled={loading}
                  className={`w-11 h-11 rounded-xl text-sm font-medium transition-all ${
                    pagination.page === pageNum
                      ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25'
                      : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => loadUsers(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages || loading}
            className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onRefresh={() => loadUsers(pagination.page)}
          currentUser={currentUser}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ icon: Icon, label, value, color, highlight }) {
  const colors = {
    violet: 'from-violet-500 to-purple-600',
    emerald: 'from-emerald-500 to-green-600',
    cyan: 'from-cyan-500 to-blue-600',
    red: 'from-red-500 to-rose-600',
    green: 'from-green-500 to-emerald-600',
    blue: 'from-blue-500 to-indigo-600',
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border ${
      highlight ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className={`w-10 h-10 bg-gradient-to-br ${colors[color]} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

// Filter Select Component
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-0 rounded-xl text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-violet-500"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// User Card Component
function UserCard({ user, currentUser, onSelect, showToast }) {
  const [copying, setCopying] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleCopyPaymentLink = async (e) => {
    e.stopPropagation();
    setCopying(true);
    try {
      const { data } = await api.post(`/admin/users/${user.id}/payment-link`);
      if (data.link || data.url) {
        await copyToClipboard(data.link || data.url);
        showToast('success', 'לינק תשלום הועתק!');
      }
    } catch (err) {
      console.error('Payment link error:', err);
      showToast('error', err?.response?.data?.error || 'שגיאה ביצירת לינק');
    } finally {
      setCopying(false);
    }
  };

  const handleSwitchAccount = async (e) => {
    e.stopPropagation();
    setSwitching(true);
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && !localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      const { data } = await api.post(`/experts/switch/${user.id}`);
      if (data?.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/dashboard';
      }
    } catch (err) {
      showToast('error', 'שגיאה במעבר לחשבון');
      setSwitching(false);
    }
  };

  const getStatusColor = () => {
    if (user.subscription_status === 'active' && user.is_manual) return 'from-purple-500 to-violet-600';
    if (user.subscription_status === 'active') return 'from-emerald-500 to-green-600';
    if (user.subscription_status === 'trial') return 'from-cyan-500 to-blue-600';
    if (user.subscription_status === 'cancelled') return 'from-orange-500 to-red-600';
    return 'from-gray-400 to-gray-500';
  };

  const hasModules = user.has_status_bot || user.group_forwards_count > 0 || user.broadcast_campaigns_count > 0;

  return (
    <div 
      onClick={onSelect}
      className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm hover:shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 group"
    >
      {/* Header with gradient */}
      <div className={`h-2 bg-gradient-to-r ${getStatusColor()}`} />
      
      <div className="p-5">
        {/* Avatar & Name */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-14 h-14 bg-gradient-to-br ${getStatusColor()} rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg`}>
            {(user.name || user.email || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 dark:text-white truncate">
                {user.name || 'ללא שם'}
              </h3>
              {user.role !== 'user' && (
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                  user.role === 'superadmin' ? 'bg-red-100 text-red-700' :
                  user.role === 'admin' ? 'bg-orange-100 text-orange-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {user.role === 'superadmin' ? 'סופר' : user.role === 'admin' ? 'אדמין' : 'מומחה'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
            {user.phone && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{user.phone}</p>
            )}
          </div>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <InfoBadge 
            icon={Bot} 
            value={user.bots_count || 0} 
            label="בוטים"
            subValue={user.active_bots_count > 0 ? `${user.active_bots_count} פעילים` : null}
          />
          <InfoBadge 
            icon={Users} 
            value={user.contacts_count || 0} 
            label="קונטקטים"
          />
          <InfoBadge 
            icon={Phone} 
            value={user.whatsapp_status === 'connected' ? '✓' : '✕'}
            label="וואטסאפ"
            success={user.whatsapp_status === 'connected'}
          />
        </div>

        {/* Subscription Info */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">מנוי</span>
            <SubscriptionBadge user={user} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">אשראי</span>
            {user.has_payment_method ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CreditCard className="w-3.5 h-3.5" />
                {user.card_last_digits ? `•••• ${user.card_last_digits}` : 'קיים'}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                חסר!
              </span>
            )}
          </div>
        </div>

        {/* Modules Tags */}
        {hasModules && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {user.has_status_bot && (
              <span className="px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-[10px] rounded-lg font-medium">
                סטטוס בוט
              </span>
            )}
            {user.group_forwards_count > 0 && (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] rounded-lg font-medium">
                העברות ({user.group_forwards_count})
              </span>
            )}
            {user.broadcast_campaigns_count > 0 && (
              <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] rounded-lg font-medium">
                שידורים ({user.broadcast_campaigns_count})
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {/* Payment Link Button - PROMINENT */}
          <button
            onClick={handleCopyPaymentLink}
            disabled={copying}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-medium text-sm transition-all shadow-md shadow-violet-500/25 flex items-center justify-center gap-2"
          >
            {copying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                <span>לינק תשלום</span>
              </>
            )}
          </button>

          {/* Switch Account */}
          {user.id !== currentUser.id && (
            <button
              onClick={handleSwitchAccount}
              disabled={switching}
              className="px-3 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-all"
              title="כניסה לחשבון"
            >
              {switching ? (
                <RefreshCw className="w-4 h-4 animate-spin text-gray-600 dark:text-gray-300" />
              ) : (
                <ExternalLink className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              )}
            </button>
          )}
        </div>

        {/* Created Date */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            הצטרף {new Date(user.created_at).toLocaleDateString('he-IL')}
          </span>
          <button 
            onClick={onSelect}
            className="text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline"
          >
            פרטים מלאים →
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoBadge({ icon: Icon, value, label, subValue, success }) {
  return (
    <div className="text-center">
      <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-1 ${
        success === true ? 'bg-emerald-100 dark:bg-emerald-900/30' :
        success === false ? 'bg-gray-100 dark:bg-gray-700' :
        'bg-violet-100 dark:bg-violet-900/30'
      }`}>
        {typeof value === 'string' ? (
          <span className={`text-lg ${success ? 'text-emerald-600' : 'text-gray-400'}`}>{value}</span>
        ) : (
          <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{value}</span>
        )}
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400">{label}</div>
      {subValue && <div className="text-[9px] text-emerald-600">{subValue}</div>}
    </div>
  );
}

function SubscriptionBadge({ user }) {
  const status = user.subscription_status;
  const planName = user.plan_name_he || user.plan_name || 'חינם';
  
  if (status === 'active' && user.is_manual) {
    return <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs rounded-lg font-medium">ידני ∞</span>;
  }
  if (status === 'active') {
    return <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs rounded-lg font-medium">{planName}</span>;
  }
  if (status === 'trial') {
    const daysLeft = user.trial_ends_at ? Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))) : 0;
    return <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 text-xs rounded-lg font-medium">ניסיון ({daysLeft})</span>;
  }
  if (status === 'cancelled') {
    return <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded-lg font-medium">מבוטל</span>;
  }
  return <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-lg font-medium">חינם</span>;
}

// Users Table Component
function UsersTable({ users, currentUser, onSelect, showToast, sortBy, sortOrder, onSort }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50">
              <SortableHeader label="משתמש" column="name" current={sortBy} order={sortOrder} onSort={onSort} />
              <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">מנוי</th>
              <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">אשראי</th>
              <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">וואטסאפ</th>
              <SortableHeader label="בוטים" column="bots_count" current={sortBy} order={sortOrder} onSort={onSort} />
              <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">מודולים</th>
              <SortableHeader label="הצטרף" column="created_at" current={sortBy} order={sortOrder} onSort={onSort} />
              <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600 dark:text-gray-300">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map(user => (
              <UserTableRow 
                key={user.id}
                user={user}
                currentUser={currentUser}
                onSelect={() => onSelect(user)}
                showToast={showToast}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({ label, column, current, order, onSort }) {
  return (
    <th className="px-4 py-4 text-right">
      <button 
        onClick={() => onSort(column)}
        className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-violet-600 transition-colors"
      >
        {label}
        {current === column && (
          order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
        )}
      </button>
    </th>
  );
}

function UserTableRow({ user, currentUser, onSelect, showToast }) {
  const [copying, setCopying] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleCopyPaymentLink = async (e) => {
    e.stopPropagation();
    setCopying(true);
    try {
      const { data } = await api.post(`/admin/users/${user.id}/payment-link`);
      if (data.link || data.url) {
        await copyToClipboard(data.link || data.url);
        showToast('success', 'לינק תשלום הועתק!');
      }
    } catch (err) {
      console.error('Payment link error:', err);
      showToast('error', err?.response?.data?.error || 'שגיאה ביצירת לינק');
    } finally {
      setCopying(false);
    }
  };

  const handleSwitchAccount = async (e) => {
    e.stopPropagation();
    setSwitching(true);
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && !localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      const { data } = await api.post(`/experts/switch/${user.id}`);
      if (data?.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/dashboard';
      }
    } catch (err) {
      showToast('error', 'שגיאה במעבר לחשבון');
      setSwitching(false);
    }
  };

  const hasModules = user.has_status_bot || user.group_forwards_count > 0 || user.broadcast_campaigns_count > 0;

  return (
    <tr onClick={onSelect} className="hover:bg-violet-50 dark:hover:bg-violet-900/10 cursor-pointer transition-colors">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${
            user.subscription_status === 'active' ? 'bg-gradient-to-br from-emerald-500 to-green-600' :
            user.subscription_status === 'trial' ? 'bg-gradient-to-br from-cyan-500 to-blue-600' :
            'bg-gradient-to-br from-gray-400 to-gray-500'
          }`}>
            {(user.name || user.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-white">{user.name || 'ללא שם'}</div>
            <div className="text-sm text-gray-500">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <SubscriptionBadge user={user} />
      </td>
      <td className="px-4 py-4">
        {user.has_payment_method ? (
          <span className="flex items-center gap-1 text-emerald-600 text-sm">
            <CreditCard className="w-4 h-4" />
            {user.card_last_digits || 'קיים'}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-500 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            חסר
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        {user.whatsapp_status === 'connected' ? (
          <span className="text-emerald-600 text-sm">✓ מחובר</span>
        ) : (
          <span className="text-gray-400 text-sm">לא מחובר</span>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
        {user.bots_count || 0}
        {user.active_bots_count > 0 && <span className="text-emerald-500 mr-1">({user.active_bots_count})</span>}
      </td>
      <td className="px-4 py-4">
        {hasModules ? (
          <div className="flex gap-1">
            {user.has_status_bot && <span className="w-2 h-2 rounded-full bg-teal-500" title="סטטוס בוט" />}
            {user.group_forwards_count > 0 && <span className="w-2 h-2 rounded-full bg-blue-500" title="העברות" />}
            {user.broadcast_campaigns_count > 0 && <span className="w-2 h-2 rounded-full bg-purple-500" title="שידורים" />}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-gray-500">
        {new Date(user.created_at).toLocaleDateString('he-IL')}
      </td>
      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={handleCopyPaymentLink}
            disabled={copying}
            className="p-2 bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 rounded-lg transition-colors"
            title="העתק לינק תשלום"
          >
            {copying ? <RefreshCw className="w-4 h-4 animate-spin text-violet-600" /> : <Link2 className="w-4 h-4 text-violet-600" />}
          </button>
          {user.id !== currentUser?.id && (
            <button
              onClick={handleSwitchAccount}
              disabled={switching}
              className="p-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-lg transition-colors"
              title="כניסה לחשבון"
            >
              {switching ? <RefreshCw className="w-4 h-4 animate-spin text-amber-600" /> : <ExternalLink className="w-4 h-4 text-amber-600" />}
            </button>
          )}
          <button
            onClick={onSelect}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="פרטים"
          >
            <Eye className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// User Detail Drawer (Slide-in Panel)
function UserDetailDrawer({ user, onClose, onRefresh, currentUser, showToast }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({ plans: [], affiliates: [], bots: [], billing: [], featureOverrides: null });
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    loadData();
  }, [user.id]);

  const loadData = async () => {
    try {
      const [plansRes, affiliatesRes, botsRes, billingRes, overridesRes] = await Promise.all([
        api.get('/admin/plans'),
        api.get('/admin/affiliates/list').catch(() => ({ data: { affiliates: [] } })),
        api.get(`/admin/users/${user.id}/bots`).catch(() => ({ data: { bots: [] } })),
        api.get(`/admin/users/${user.id}/billing-history`).catch(() => ({ data: { history: [] } })),
        api.get(`/admin/users/${user.id}/feature-overrides`).catch(() => ({ data: { feature_overrides: null } })),
      ]);
      setData({
        plans: plansRes.data.plans || [],
        affiliates: affiliatesRes.data.affiliates || [],
        bots: botsRes.data.bots || [],
        billing: billingRes.data.history || [],
        featureOverrides: overridesRes.data.feature_overrides || null,
      });
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPaymentLink = async () => {
    setCopying(true);
    try {
      const { data } = await api.post(`/admin/users/${user.id}/payment-link`);
      if (data.link || data.url) {
        await copyToClipboard(data.link || data.url);
        showToast('success', 'לינק תשלום הועתק!');
      }
    } catch (err) {
      console.error('Payment link error:', err);
      showToast('error', err?.response?.data?.error || 'שגיאה ביצירת לינק');
    } finally {
      setCopying(false);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && !localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      const { data } = await api.post(`/experts/switch/${user.id}`);
      if (data?.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/dashboard';
      }
    } catch (err) {
      showToast('error', 'שגיאה במעבר לחשבון');
    }
  };

  const sections = [
    { id: 'overview', label: 'סקירה', icon: Eye },
    { id: 'subscription', label: 'מנוי והנחה', icon: Crown },
    { id: 'billing', label: 'חיובים', icon: Receipt },
    { id: 'bots', label: 'בוטים', icon: Bot },
    { id: 'features', label: 'פיצ׳רים', icon: Zap },
    { id: 'services', label: 'שירותים', icon: Package },
    { id: 'stats', label: 'סטטיסטיקות', icon: BarChart3 },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-full max-w-2xl bg-white dark:bg-gray-900 z-50 shadow-2xl overflow-hidden flex flex-col animate-slide-in-left">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-6 text-white">
          <div className="flex items-start justify-between mb-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex gap-2">
              {/* MAIN ACTION: Copy Payment Link */}
              <button
                onClick={handleCopyPaymentLink}
                disabled={copying}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-medium flex items-center gap-2 transition-colors"
              >
                {copying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                העתק לינק תשלום
              </button>
              {user.id !== currentUser.id && (
                <button
                  onClick={handleSwitchAccount}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  כניסה לחשבון
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-bold">
              {(user.name || user.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{user.name || 'ללא שם'}</h2>
              <p className="text-white/80">{user.email}</p>
              {user.phone && <p className="text-white/60 text-sm">{user.phone}</p>}
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="flex gap-6 mt-6 pt-4 border-t border-white/20">
            <div>
              <div className="text-2xl font-bold">{user.bots_count || 0}</div>
              <div className="text-white/70 text-sm">בוטים</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{user.contacts_count || 0}</div>
              <div className="text-white/70 text-sm">קונטקטים</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${user.has_payment_method ? 'text-green-300' : 'text-red-300'}`}>
                {user.has_payment_method ? '✓' : '✕'}
              </div>
              <div className="text-white/70 text-sm">אשראי</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${user.whatsapp_status === 'connected' ? 'text-green-300' : 'text-white/50'}`}>
                {user.whatsapp_status === 'connected' ? '✓' : '✕'}
              </div>
              <div className="text-white/70 text-sm">וואטסאפ</div>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 -mb-px ${
                activeSection === section.id
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <section.icon className="w-4 h-4" />
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-violet-500" />
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <OverviewSection user={user} bots={data.bots} billing={data.billing} />
              )}
              {activeSection === 'subscription' && (
                <SubscriptionSection user={user} plans={data.plans} affiliates={data.affiliates} onRefresh={onRefresh} showToast={showToast} />
              )}
              {activeSection === 'billing' && (
                <BillingSection user={user} billing={data.billing} showToast={showToast} />
              )}
              {activeSection === 'bots' && (
                <BotsSection user={user} bots={data.bots} onRefresh={loadData} showToast={showToast} />
              )}
              {activeSection === 'features' && (
                <FeaturesSection user={user} featureOverrides={data.featureOverrides} onRefresh={loadData} showToast={showToast} />
              )}
              {activeSection === 'services' && (
                <ServicesSection userId={user.id} userName={user.name || user.email} showToast={showToast} />
              )}
              {activeSection === 'stats' && (
                <StatsSection user={user} />
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-in-left {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

// Overview Section
function OverviewSection({ user, bots, billing }) {
  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl p-4 border border-violet-200 dark:border-violet-800">
          <div className="flex items-center gap-3 mb-3">
            <Crown className="w-5 h-5 text-violet-600" />
            <span className="font-medium text-gray-900 dark:text-white">מנוי</span>
          </div>
          <div className="text-lg font-bold text-violet-600 dark:text-violet-400">
            {user.plan_name_he || user.plan_name || 'חינם'}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {user.subscription_status === 'active' ? 'פעיל' :
             user.subscription_status === 'trial' ? 'תקופת ניסיון' :
             user.subscription_status === 'cancelled' ? 'מבוטל' : 'לא פעיל'}
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${
          user.has_payment_method 
            ? 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <CreditCard className={`w-5 h-5 ${user.has_payment_method ? 'text-emerald-600' : 'text-red-600'}`} />
            <span className="font-medium text-gray-900 dark:text-white">אשראי</span>
          </div>
          <div className={`text-lg font-bold ${user.has_payment_method ? 'text-emerald-600' : 'text-red-600'}`}>
            {user.has_payment_method ? (user.card_last_digits ? `•••• ${user.card_last_digits}` : 'קיים במערכת') : 'לא קיים!'}
          </div>
          {!user.has_payment_method && (
            <div className="text-sm text-red-500 mt-1">יש להוסיף אשראי</div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-violet-500" />
          פעילות אחרונה
        </h3>
        <div className="space-y-3">
          {bots.slice(0, 3).map(bot => (
            <div key={bot.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${bot.is_active && !bot.locked_reason ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <span className="text-gray-900 dark:text-white">{bot.name}</span>
                {bot.locked_reason && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded">נעול</span>
                )}
              </div>
              <span className="text-xs text-gray-500">{new Date(bot.updated_at).toLocaleDateString('he-IL')}</span>
            </div>
          ))}
          {bots.length === 0 && (
            <div className="text-center py-6 text-gray-500">אין בוטים</div>
          )}
        </div>
      </div>

      {/* Recent Payments */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-violet-500" />
          חיובים אחרונים
        </h3>
        <div className="space-y-3">
          {billing.slice(0, 3).map(payment => (
            <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  payment.status === 'completed' ? 'bg-emerald-500' :
                  payment.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
                <span className="font-medium text-gray-900 dark:text-white">₪{payment.amount}</span>
                <span className="text-sm text-gray-500">{payment.charge_type}</span>
              </div>
              <span className="text-xs text-gray-500">{new Date(payment.created_at).toLocaleDateString('he-IL')}</span>
            </div>
          ))}
          {billing.length === 0 && (
            <div className="text-center py-6 text-gray-500">אין היסטוריית חיובים</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Subscription Section (full: plan, discount, referral, invoice, payments)
function SubscriptionSection({ user, plans, affiliates, onRefresh, showToast }) {
  const [formData, setFormData] = useState({
    planId: plans.find(p => p.name === user.plan_name || p.name_he === user.plan_name_he)?.id || (plans[0]?.id || ''),
    status: user.subscription_status || 'active',
    isManual: user.is_manual || false,
    noExpiry: !user.expires_at && user.is_manual,
    expiresAt: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
    adminNotes: user.admin_notes || '',
    nextChargeDate: user.next_charge_date ? new Date(user.next_charge_date).toISOString().split('T')[0] : '',
    trialEndsAt: user.trial_ends_at ? new Date(user.trial_ends_at).toISOString().split('T')[0] : '',
    discountMode: user.custom_discount_mode || 'percent',
    customDiscount: user.custom_discount_percent || 0,
    fixedPrice: user.custom_fixed_price || 0,
    discountType: user.custom_discount_type || 'none',
    discountMonths: user.custom_discount_months || 1,
    discountPlanId: user.custom_discount_plan_id || '',
    skipTrial: user.skip_trial || false,
    affiliateId: user.referred_by_affiliate_id || '',
    invoiceName: user.invoice_name || '',
    receiptEmail: user.receipt_email || '',
  });
  const [saving, setSaving] = useState(false);
  const [subTab, setSubTab] = useState('plan');

  const trialDaysUsed = user.started_at && user.trial_ends_at
    ? Math.max(0, Math.ceil((new Date() - new Date(user.started_at)) / (1000 * 60 * 60 * 24)))
    : 0;
  const trialDaysRemaining = user.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

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
        customDiscountMode: formData.discountType !== 'none' ? formData.discountMode : null,
        customDiscountPercent: formData.discountType !== 'none' && formData.discountMode === 'percent' ? formData.customDiscount : null,
        customFixedPrice: formData.discountType !== 'none' && formData.discountMode === 'fixed_price' ? formData.fixedPrice : null,
        customDiscountType: formData.discountType !== 'none' ? formData.discountType : null,
        customDiscountMonths: formData.discountType === 'custom_months' ? formData.discountMonths : null,
        customDiscountPlanId: formData.discountType !== 'none' && formData.discountPlanId ? formData.discountPlanId : null,
        skipTrial: formData.skipTrial || false,
        affiliateId: formData.affiliateId || null,
        invoiceName: formData.invoiceName || null,
        receiptEmail: formData.receiptEmail || null,
      });
      showToast('success', 'המנוי עודכן!');
      onRefresh();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  const subTabs = [
    { id: 'plan', label: 'מנוי' },
    { id: 'payments', label: 'תשלומים' },
    { id: 'discount', label: 'הנחה' },
    { id: 'referral', label: 'שותף' },
    { id: 'invoice', label: 'חשבונית' },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
              subTab === tab.id ? 'bg-white dark:bg-gray-600 shadow text-violet-600 font-medium' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'plan' && (
        <div className="space-y-4">
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={formData.isManual} onChange={(e) => setFormData(f => ({ ...f, isManual: e.target.checked }))} className="w-5 h-5 rounded text-purple-600" />
              <div>
                <span className="font-medium text-purple-800 dark:text-purple-400">מנוי ידני (ללא תשלום)</span>
                <p className="text-xs text-purple-600 dark:text-purple-500">גישה מלאה ללא צורך באשראי</p>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תוכנית</label>
            <select value={formData.planId} onChange={(e) => setFormData(f => ({ ...f, planId: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>{plan.name_he} {plan.price > 0 ? `- ₪${plan.price}/חודש` : '(חינם)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סטטוס</label>
            <select value={formData.status} onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <option value="active">פעיל</option>
              <option value="trial">ניסיון</option>
              <option value="cancelled">מבוטל</option>
              <option value="expired">פג תוקף</option>
            </select>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={formData.noExpiry} onChange={(e) => setFormData(f => ({ ...f, noExpiry: e.target.checked, expiresAt: '' }))} className="w-5 h-5 rounded text-green-600" />
              <div><span className="font-medium text-green-800 dark:text-green-400">ללא הגבלת זמן</span></div>
            </label>
          </div>

          {!formData.noExpiry && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תאריך סיום</label>
              <input type="date" value={formData.expiresAt} onChange={(e) => setFormData(f => ({ ...f, expiresAt: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl" />
            </div>
          )}

          {formData.isManual && (
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-gray-500">פעולות מהירות:</span>
              {[
                { label: 'Pro לתמיד', planKey: 'Pro' },
                { label: 'Enterprise לתמיד', planKey: 'Enterprise' },
              ].map(action => (
                <button key={action.label} type="button" onClick={() => {
                  const plan = plans.find(p => p.name === action.planKey);
                  if (plan) setFormData(f => ({ ...f, planId: plan.id, status: 'active', noExpiry: true }));
                }} className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">{action.label}</button>
              ))}
              <button type="button" onClick={() => {
                const d = new Date(); d.setMonth(d.getMonth() + 1);
                setFormData(f => ({ ...f, noExpiry: false, expiresAt: d.toISOString().split('T')[0] }));
              }} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">חודש אחד</button>
              <button type="button" onClick={() => {
                const d = new Date(); d.setFullYear(d.getFullYear() + 1);
                setFormData(f => ({ ...f, noExpiry: false, expiresAt: d.toISOString().split('T')[0] }));
              }} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">שנה אחת</button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">הערות אדמין</label>
            <textarea value={formData.adminNotes} onChange={(e) => setFormData(f => ({ ...f, adminNotes: e.target.value }))} rows={2} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl resize-none" placeholder="הערות פנימיות..." />
          </div>
        </div>
      )}

      {subTab === 'payments' && (
        <div className="space-y-4">
          {(user.is_trial || user.subscription_status === 'trial' || user.trial_ends_at) && (
            <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl">
              <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-400 mb-3">תקופת ניסיון</h4>
              <div className="flex gap-4 text-sm mb-3">
                <div><span className="text-cyan-600">נוצלו:</span> <strong>{trialDaysUsed}</strong> ימים</div>
                <div><span className="text-cyan-600">נותרו:</span> <strong>{trialDaysRemaining}</strong> ימים</div>
              </div>
              <div className="w-full bg-cyan-200 rounded-full h-2 mb-3">
                <div className="bg-cyan-600 h-2 rounded-full" style={{ width: `${Math.min(100, (trialDaysUsed / 14) * 100)}%` }} />
              </div>
              <label className="block text-xs font-medium text-cyan-700 mb-1">תאריך סיום ניסיון</label>
              <input type="date" value={formData.trialEndsAt} onChange={(e) => setFormData(f => ({ ...f, trialEndsAt: e.target.value }))} className="w-full px-3 py-2 border border-cyan-300 rounded-lg text-sm" />
              <div className="flex gap-2 mt-2">
                {[7, 14, 30].map(d => (
                  <button key={d} type="button" onClick={() => { const dt = new Date(); dt.setDate(dt.getDate() + d); setFormData(f => ({ ...f, trialEndsAt: dt.toISOString().split('T')[0] })); }} className="px-2 py-1 text-xs bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200">+{d} ימים</button>
                ))}
              </div>
            </div>
          )}

          {!formData.isManual && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תאריך חיוב הבא</label>
              <input type="date" value={formData.nextChargeDate} onChange={(e) => setFormData(f => ({ ...f, nextChargeDate: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl" />
            </div>
          )}

          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm space-y-2">
            <div className="flex justify-between"><span className="text-gray-500">Sumit Customer ID:</span><span className="font-mono text-gray-800 dark:text-gray-200">{user.sumit_customer_id || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Standing Order:</span><span className="font-mono text-gray-800 dark:text-gray-200">{user.sumit_standing_order_id || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">תקופת חיוב:</span><span className="text-gray-800 dark:text-gray-200">{user.billing_period === 'yearly' ? 'שנתי' : 'חודשי'}</span></div>
          </div>
        </div>
      )}

      {subTab === 'discount' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סוג הנחה</label>
            <select value={formData.discountType} onChange={(e) => setFormData(f => ({ ...f, discountType: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <option value="none">ללא הנחה</option>
              <option value="first_payment">תשלום ראשון בלבד</option>
              <option value="custom_months">מספר חודשים מוגדר</option>
              <option value="first_year">שנה ראשונה</option>
              <option value="forever">לתמיד</option>
            </select>
          </div>

          {formData.discountType !== 'none' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">חלה על תוכנית ספציפית</label>
                <select value={formData.discountPlanId} onChange={(e) => setFormData(f => ({ ...f, discountPlanId: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <option value="">כל התוכניות</option>
                  {plans.filter(p => p.price > 0).map(plan => (
                    <option key={plan.id} value={plan.id}>{plan.name_he}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
                <button type="button" onClick={() => setFormData(f => ({ ...f, discountMode: 'percent' }))} className={`flex-1 px-3 py-2 text-sm rounded-lg ${formData.discountMode === 'percent' ? 'bg-white dark:bg-gray-600 shadow font-medium text-violet-600' : 'text-gray-600'}`}>אחוז (%)</button>
                <button type="button" onClick={() => setFormData(f => ({ ...f, discountMode: 'fixed_price' }))} className={`flex-1 px-3 py-2 text-sm rounded-lg ${formData.discountMode === 'fixed_price' ? 'bg-white dark:bg-gray-600 shadow font-medium text-violet-600' : 'text-gray-600'}`}>מחיר קבוע (₪)</button>
              </div>

              {formData.discountMode === 'percent' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">אחוז הנחה</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="100" value={formData.customDiscount} onChange={(e) => setFormData(f => ({ ...f, customDiscount: parseInt(e.target.value) || 0 }))} className="w-24 px-3 py-2 border border-gray-200 rounded-xl" />
                    <span>%</span>
                    {[10, 20, 30, 50].map(p => (
                      <button key={p} type="button" onClick={() => setFormData(f => ({ ...f, customDiscount: p }))} className={`px-2 py-1 text-xs rounded ${formData.customDiscount === p ? 'bg-violet-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p}%</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">מחיר קבוע לחודש</label>
                  <div className="flex items-center gap-2">
                    <span>₪</span>
                    <input type="number" min="0" max="1000" value={formData.fixedPrice} onChange={(e) => setFormData(f => ({ ...f, fixedPrice: parseInt(e.target.value) || 0 }))} className="w-28 px-3 py-2 border border-gray-200 rounded-xl" />
                    {[0, 29, 49, 69].map(p => (
                      <button key={p} type="button" onClick={() => setFormData(f => ({ ...f, fixedPrice: p }))} className={`px-2 py-1 text-xs rounded ${formData.fixedPrice === p ? 'bg-violet-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p === 0 ? 'חינם' : `₪${p}`}</button>
                    ))}
                  </div>
                </div>
              )}

              {formData.discountType === 'custom_months' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">מספר חודשים</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="36" value={formData.discountMonths} onChange={(e) => setFormData(f => ({ ...f, discountMonths: parseInt(e.target.value) || 1 }))} className="w-24 px-3 py-2 border border-gray-200 rounded-xl" />
                    {[3, 6, 12].map(m => (
                      <button key={m} type="button" onClick={() => setFormData(f => ({ ...f, discountMonths: m }))} className={`px-2 py-1 text-xs rounded ${formData.discountMonths === m ? 'bg-violet-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{m}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.skipTrial} onChange={(e) => setFormData(f => ({ ...f, skipTrial: e.target.checked }))} className="w-5 h-5 rounded text-red-600" />
                  <div>
                    <div className="font-medium text-red-700 dark:text-red-400">ללא ניסיון חינם</div>
                    <div className="text-xs text-red-600">סליקה מיידית עם הזנת אשראי</div>
                  </div>
                </label>
              </div>

              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-xl text-sm text-yellow-800 dark:text-yellow-400">
                <strong>תצוגה מקדימה:</strong>{' '}
                {formData.discountMode === 'percent' ? `${formData.customDiscount}% הנחה` : formData.fixedPrice === 0 ? 'חינם' : `₪${formData.fixedPrice}/חודש`}
                {' '}{formData.discountType === 'first_payment' && 'לתשלום הראשון'}
                {formData.discountType === 'custom_months' && `ל-${formData.discountMonths} חודשים`}
                {formData.discountType === 'first_year' && 'לשנה הראשונה'}
                {formData.discountType === 'forever' && 'לתמיד'}
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'referral' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שותף מפנה</label>
            <select value={formData.affiliateId} onChange={(e) => setFormData(f => ({ ...f, affiliateId: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <option value="">ללא שותף</option>
              {affiliates.map(aff => (
                <option key={aff.id} value={aff.id}>{aff.user_name || aff.user_email} ({aff.ref_code})</option>
              ))}
            </select>
          </div>
          {user.referred_by_name && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm">
              <strong>שותף נוכחי:</strong> {user.referred_by_name} ({user.referred_by_email})
            </div>
          )}
        </div>
      )}

      {subTab === 'invoice' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שם לחשבונית</label>
            <input type="text" value={formData.invoiceName} onChange={(e) => setFormData(f => ({ ...f, invoiceName: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl" placeholder="שם או שם עסק" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">מייל לקבלה</label>
            <input type="email" value={formData.receiptEmail} onChange={(e) => setFormData(f => ({ ...f, receiptEmail: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl" placeholder="email@example.com" />
          </div>
        </div>
      )}

      {/* Save Button - always visible */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:from-violet-600 hover:to-purple-700 transition-all"
      >
        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        שמור שינויים
      </button>
    </div>
  );
}

// Billing Section
function BillingSection({ user, billing, showToast }) {
  return (
    <div className="space-y-6">
      {/* Payment Method Status */}
      <div className={`p-6 rounded-2xl ${
        user.has_payment_method 
          ? 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-200 dark:border-emerald-800'
          : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800'
      }`}>
        <div className="flex items-center gap-4">
          {user.has_payment_method ? (
            <>
              <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">כרטיס אשראי פעיל</div>
                {user.card_last_digits && (
                  <div className="text-emerald-600 dark:text-emerald-500">•••• {user.card_last_digits}</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-bold text-red-700 dark:text-red-400 text-lg">אין כרטיס אשראי!</div>
                <div className="text-red-600 dark:text-red-500">יש לשלוח למשתמש לינק להוספת אשראי</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Billing History */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">היסטוריית חיובים</h3>
        {billing.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
            אין היסטוריית חיובים
          </div>
        ) : (
          <div className="space-y-3">
            {billing.map(payment => (
              <div key={payment.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    payment.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                    payment.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30' :
                    'bg-yellow-100 dark:bg-yellow-900/30'
                  }`}>
                    {payment.status === 'completed' ? (
                      <Check className="w-5 h-5 text-emerald-600" />
                    ) : payment.status === 'failed' ? (
                      <X className="w-5 h-5 text-red-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-600" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white">₪{payment.amount}</div>
                    <div className="text-sm text-gray-500">{payment.charge_type || 'חיוב'}</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className={`text-sm font-medium ${
                    payment.status === 'completed' ? 'text-emerald-600' :
                    payment.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {payment.status === 'completed' ? 'הושלם' :
                     payment.status === 'failed' ? 'נכשל' : 'ממתין'}
                  </div>
                  <div className="text-xs text-gray-500">{new Date(payment.created_at).toLocaleDateString('he-IL')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Bots Section
function BotsSection({ user, bots, onRefresh, showToast }) {
  const [toggling, setToggling] = useState(null);

  const handleToggleLock = async (botId, currentLocked) => {
    setToggling(botId);
    try {
      await api.put(`/admin/bots/${botId}/lock`, { locked: !currentLocked });
      showToast('success', currentLocked ? 'הבוט שוחרר' : 'הבוט ננעל');
      onRefresh();
    } catch (err) {
      showToast('error', 'שגיאה בעדכון');
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-4">
      {bots.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
          אין בוטים
        </div>
      ) : (
        bots.map(bot => (
          <div 
            key={bot.id}
            className={`p-4 rounded-xl border ${
              bot.locked_reason 
                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  bot.locked_reason ? 'bg-red-500' :
                  bot.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                }`} />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{bot.name}</div>
                  <div className="text-xs text-gray-500">
                    עודכן {new Date(bot.updated_at).toLocaleDateString('he-IL')}
                  </div>
                </div>
                {bot.locked_reason && (
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-lg">
                    נעול: {bot.locked_reason}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleToggleLock(bot.id, !!bot.locked_reason)}
                disabled={toggling === bot.id}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  bot.locked_reason
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200'
                }`}
              >
                {toggling === bot.id ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : bot.locked_reason ? (
                  <span className="flex items-center gap-1"><Unlock className="w-4 h-4" /> שחרר</span>
                ) : (
                  <span className="flex items-center gap-1"><Lock className="w-4 h-4" /> נעל</span>
                )}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Features Section - Full feature overrides
function FeaturesSection({ user, featureOverrides: initialOverrides, onRefresh, showToast }) {
  const [overrides, setOverrides] = useState(initialOverrides || {});
  const [saving, setSaving] = useState(false);

  const update = (key, value) => {
    setOverrides(prev => {
      const n = { ...(prev || {}) };
      if (value === null || value === undefined || value === '') delete n[key];
      else n[key] = value;
      return Object.keys(n).length === 0 ? {} : n;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = Object.keys(overrides).length === 0 ? null : overrides;
      await api.put(`/admin/users/${user.id}/feature-overrides`, { feature_overrides: toSave });
      showToast('success', 'ההגדרות נשמרו');
      onRefresh();
    } catch (err) {
      showToast('error', 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('האם למחוק את כל ההגדרות המותאמות?')) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/feature-overrides`, { feature_overrides: null });
      setOverrides({});
      showToast('success', 'ההגדרות נמחקו');
      onRefresh();
    } catch (err) {
      showToast('error', 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const NumberField = ({ label, fieldKey }) => (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <div className="flex gap-2">
        <input type="number" min="-1" placeholder="ברירת מחדל" value={overrides[fieldKey] ?? ''}
          onChange={(e) => update(fieldKey, e.target.value !== '' ? parseInt(e.target.value) : null)}
          className={`flex-1 px-3 py-2 border rounded-lg text-sm ${overrides[fieldKey] === -1 ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
        />
        <button type="button" onClick={() => update(fieldKey, overrides[fieldKey] === -1 ? null : -1)}
          className={`px-3 py-2 text-sm rounded-lg font-bold ${overrides[fieldKey] === -1 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          title="ללא הגבלה">∞</button>
      </div>
      {overrides[fieldKey] === -1 && <span className="text-xs text-green-600 mt-1 block">✓ ללא הגבלה</span>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
        <p className="text-sm text-orange-800 dark:text-orange-400">
          <strong>הגדרות מותאמות</strong> - דורסות את התוכנית. הזן <strong>-1</strong> או לחץ <strong>∞</strong> לללא הגבלה.
        </p>
      </div>

      {Object.keys(overrides).length > 0 && (
        <button onClick={handleClear} className="w-full px-3 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50">
          נקה את כל ההגדרות המותאמות
        </button>
      )}

      <NumberField label="מכסת בוטים" fieldKey="max_bots" />
      <NumberField label="הרצות בוט בחודש" fieldKey="max_bot_runs_per_month" />
      <NumberField label="מכסת אנשי קשר" fieldKey="max_contacts" />

      {/* Group Forwards */}
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input type="checkbox" checked={overrides.allow_group_forwards ?? false} onChange={(e) => update('allow_group_forwards', e.target.checked ? true : null)} className="w-4 h-4 rounded text-orange-600" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">העברת הודעות לקבוצות</span>
        </label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-xs text-gray-500">מקסימום העברות</label>
            <div className="flex gap-1">
              <input type="number" min="-1" placeholder="ברירת מחדל" value={overrides.max_group_forwards ?? ''} onChange={(e) => update('max_group_forwards', e.target.value !== '' ? parseInt(e.target.value) : null)} className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm" />
              <button type="button" onClick={() => update('max_group_forwards', overrides.max_group_forwards === -1 ? null : -1)} className={`px-2 py-1 text-xs rounded ${overrides.max_group_forwards === -1 ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>∞</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">מקסימום יעדים</label>
            <div className="flex gap-1">
              <input type="number" min="-1" placeholder="ברירת מחדל" value={overrides.max_forward_targets ?? ''} onChange={(e) => update('max_forward_targets', e.target.value !== '' ? parseInt(e.target.value) : null)} className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm" />
              <button type="button" onClick={() => update('max_forward_targets', overrides.max_forward_targets === -1 ? null : -1)} className={`px-2 py-1 text-xs rounded ${overrides.max_forward_targets === -1 ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>∞</button>
            </div>
          </div>
        </div>
      </div>

      {/* Boolean Features */}
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">פיצ׳רים נוספים</label>
        {[
          { key: 'allow_statistics', label: 'סטטיסטיקות' },
          { key: 'allow_waha_creation', label: 'יצירת חיבור WAHA' },
          { key: 'allow_export', label: 'ייצוא נתונים' },
          { key: 'allow_api_access', label: 'גישת API' },
          { key: 'priority_support', label: 'תמיכה מועדפת' },
          { key: 'allow_broadcasts', label: 'הודעות תפוצה' },
        ].map(f => (
          <label key={f.key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={overrides[f.key] ?? false} onChange={(e) => update(f.key, e.target.checked ? true : null)} className="w-4 h-4 rounded text-orange-600" />
            <span className="text-sm text-gray-600 dark:text-gray-400">{f.label}</span>
          </label>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium flex items-center justify-center gap-2">
        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        שמור הגדרות פיצ׳רים
      </button>
    </div>
  );
}

// Services Section
function ServicesSection({ userId, userName, showToast }) {
  const [services, setServices] = useState([]);
  const [userServices, setUserServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [trialForm, setTrialForm] = useState({ serviceId: null, days: 14 });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [servicesRes, userServicesRes] = await Promise.all([
        api.get('/services/admin/all'),
        api.get(`/admin/users/${userId}/services`).catch(() => ({ data: { subscriptions: [] } }))
      ]);
      setServices(servicesRes.data.services || []);
      setUserServices(userServicesRes.data.subscriptions || []);
    } catch (err) {
      console.error('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGrantTrial = async (serviceId) => {
    setSaving(serviceId);
    try {
      await api.post(`/services/admin/${serviceId}/trial`, { userId, trialDays: trialForm.days, reason: `הוקצה על ידי אדמין ל${userName}` });
      showToast('success', 'תקופת ניסיון הוקצתה');
      setTrialForm({ serviceId: null, days: 14 });
      loadData();
    } catch (err) { showToast('error', err.response?.data?.error || 'שגיאה'); }
    finally { setSaving(null); }
  };

  const handleAssign = async (serviceId) => {
    setSaving(serviceId);
    try {
      await api.post(`/services/admin/${serviceId}/assign`, { userId, status: 'active', adminNotes: `הוקצה ידנית` });
      showToast('success', 'מנוי הוקצה');
      loadData();
    } catch (err) { showToast('error', err.response?.data?.error || 'שגיאה'); }
    finally { setSaving(null); }
  };

  const handleCancel = async (serviceId) => {
    if (!confirm('האם לבטל את המנוי?')) return;
    setSaving(serviceId);
    try {
      await api.post(`/services/admin/${serviceId}/cancel/${userId}`);
      showToast('success', 'מנוי בוטל');
      loadData();
    } catch (err) { showToast('error', err.response?.data?.error || 'שגיאה'); }
    finally { setSaving(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-violet-500" /></div>;

  return (
    <div className="space-y-4">
      {services.length === 0 ? (
        <div className="text-center py-8 text-gray-500">אין שירותים נוספים מוגדרים</div>
      ) : services.map(service => {
        const userSub = userServices.find(us => us.service_id === service.id);
        const isActive = userSub && (userSub.status === 'active' || userSub.status === 'trial');
        return (
          <div key={service.id} className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-medium text-gray-800 dark:text-white flex items-center gap-2">
                  {service.icon && <span>{service.icon}</span>}
                  {service.name_he || service.name}
                  {isActive && <span className={`text-xs px-2 py-0.5 rounded-full ${userSub.status === 'trial' ? 'bg-cyan-100 text-cyan-700' : 'bg-green-100 text-green-700'}`}>{userSub.status === 'trial' ? 'ניסיון' : 'פעיל'}</span>}
                </h4>
                <p className="text-xs text-gray-500 mt-1">₪{service.price}/חודש</p>
              </div>
            </div>
            {userSub && (
              <div className="mb-3 p-2 bg-white dark:bg-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <div className="flex justify-between"><span>סטטוס:</span><span className={userSub.status === 'active' ? 'text-green-600 font-medium' : userSub.status === 'trial' ? 'text-cyan-600 font-medium' : 'text-gray-600'}>{userSub.status === 'active' ? 'פעיל' : userSub.status === 'trial' ? 'ניסיון' : userSub.status === 'cancelled' ? 'מבוטל' : userSub.status}</span></div>
                {userSub.trial_ends_at && <div className="flex justify-between"><span>סיום ניסיון:</span><span>{new Date(userSub.trial_ends_at).toLocaleDateString('he-IL')}</span></div>}
                {userSub.is_manual && <div className="text-purple-600">✓ מנוי ידני</div>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!isActive ? (
                <>
                  {trialForm.serviceId === service.id ? (
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" value={trialForm.days} onChange={(e) => setTrialForm(f => ({ ...f, days: parseInt(e.target.value) || 0 }))} className="w-16 px-2 py-1 text-sm border rounded" />
                      <button onClick={() => handleGrantTrial(service.id)} disabled={saving === service.id} className="px-3 py-1 text-sm bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50">{saving === service.id ? '...' : 'אשר'}</button>
                      <button onClick={() => setTrialForm({ serviceId: null, days: 14 })} className="text-sm text-gray-600">ביטול</button>
                    </div>
                  ) : (
                    <button onClick={() => setTrialForm({ serviceId: service.id, days: 14 })} className="px-3 py-1.5 text-sm bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100 border border-cyan-200">הקצה ניסיון</button>
                  )}
                  <button onClick={() => handleAssign(service.id)} disabled={saving === service.id} className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 disabled:opacity-50">{saving === service.id ? '...' : 'הפעל מנוי'}</button>
                </>
              ) : (
                <>
                  <button onClick={() => handleCancel(service.id)} disabled={saving === service.id} className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 border border-red-200 disabled:opacity-50">{saving === service.id ? '...' : 'בטל מנוי'}</button>
                  {userSub?.status === 'trial' && (
                    <button onClick={() => handleAssign(service.id)} disabled={saving === service.id} className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 disabled:opacity-50">הפוך לפעיל</button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Stats Section
function StatsSection({ user }) {
  const statCards = [
    { icon: Bot, label: 'בוטים', value: user.bots_count || 0, sub: 'בוטים פעילים', color: 'purple' },
    { icon: Users, label: 'אנשי קשר', value: user.contacts_count || 0, sub: 'שמורים', color: 'blue' },
  ];

  const moduleStats = [
    { icon: Send, label: 'העברת הודעות', count: user.group_forwards_count || 0, jobs: user.forward_jobs_count || 0, color: 'green' },
    { icon: ArrowRightLeft, label: 'העברה בין קבוצות', count: user.group_transfers_count || 0, jobs: user.transfer_jobs_count || 0, color: 'orange' },
    { icon: MessageSquare, label: 'הודעות תפוצה', count: user.broadcast_campaigns_count || 0, jobs: user.broadcast_recipients_total || 0, jobsLabel: 'נמענים', color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        {statCards.map(s => (
          <div key={s.label} className={`p-4 bg-${s.color}-50 dark:bg-${s.color}-900/20 border border-${s.color}-200 dark:border-${s.color}-800 rounded-xl`}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-5 h-5 text-${s.color}-600`} />
              <span className={`font-medium text-${s.color}-800 dark:text-${s.color}-400`}>{s.label}</span>
            </div>
            <div className={`text-2xl font-bold text-${s.color}-700`}>{s.value}</div>
            <p className={`text-xs text-${s.color}-600 mt-1`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Module Usage */}
      <h3 className="font-semibold text-gray-800 dark:text-white">שימוש במודולים</h3>
      <div className="space-y-3">
        {moduleStats.map(m => (
          <div key={m.label} className={`p-4 bg-${m.color}-50 dark:bg-${m.color}-900/20 border border-${m.color}-200 dark:border-${m.color}-800 rounded-xl`}>
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={`w-5 h-5 text-${m.color}-600`} />
              <span className={`font-medium text-${m.color}-800 dark:text-${m.color}-400`}>{m.label}</span>
              {parseInt(m.count) > 0 && <span className={`px-2 py-0.5 bg-${m.color}-200 text-${m.color}-800 rounded-full text-xs`}>פעיל</span>}
            </div>
            <div className="flex items-baseline gap-4">
              <div className={`text-2xl font-bold text-${m.color}-700`}>{m.count}</div>
              <span className={`text-sm text-${m.color}-600`}>{m.jobs} {m.jobsLabel || 'הרצות'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Status Bot */}
      <div className={`p-4 rounded-xl border ${user.has_status_bot ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className={`w-5 h-5 ${user.has_status_bot ? 'text-teal-600' : 'text-gray-400'}`} />
          <span className="font-medium text-gray-800 dark:text-white">בוט סטטוסים</span>
        </div>
        {user.has_status_bot ? (
          <div className="text-lg font-bold text-green-600 flex items-center gap-1"><Check className="w-4 h-4" /> פעיל ({user.status_bot_status === 'active' ? 'פעיל' : user.status_bot_status === 'trial' ? 'ניסיון' : user.status_bot_status || '?'})</div>
        ) : (
          <div className="text-lg font-bold text-gray-400 flex items-center gap-1"><X className="w-4 h-4" /> לא פעיל</div>
        )}
      </div>

      {/* Usage Summary */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> סיכום</h4>
        <div className="space-y-2 text-sm">
          {[
            { label: 'העברת הודעות לקבוצות', active: parseInt(user.group_forwards_count) > 0 },
            { label: 'העברה בין קבוצות', active: parseInt(user.group_transfers_count) > 0 },
            { label: 'הודעות תפוצה', active: parseInt(user.broadcast_campaigns_count) > 0 },
            { label: 'בוט סטטוסים', active: user.has_status_bot },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">{item.label}:</span>
              <span className={item.active ? 'text-green-600 font-medium' : 'text-gray-400'}>
                {item.active ? 'משתמש' : 'לא משתמש'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Export for backwards compatibility with AdminBilling
export function UnifiedUserModal({ user, onClose, onSuccess, onSwitchAccount, currentUserId }) {
  const [toast, setToast] = useState(null);
  
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSwitchAccount = async (userId, userName) => {
    if (onSwitchAccount) {
      onSwitchAccount(userId, userName);
    }
  };

  return (
    <UserDetailDrawer
      user={user}
      onClose={onClose}
      onRefresh={onSuccess}
      currentUser={{ id: currentUserId }}
      showToast={showToast}
    />
  );
}
