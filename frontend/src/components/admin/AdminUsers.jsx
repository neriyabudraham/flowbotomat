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
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
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
      setStats(data);
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
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        showToast('success', 'לינק תשלום הועתק!');
      }
    } catch (err) {
      showToast('error', 'שגיאה ביצירת לינק');
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

  const handleCopyPaymentLink = async (e) => {
    e.stopPropagation();
    setCopying(true);
    try {
      const { data } = await api.post(`/admin/users/${user.id}/payment-link`);
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        showToast('success', 'לינק תשלום הועתק!');
      }
    } catch (err) {
      showToast('error', 'שגיאה ביצירת לינק');
    } finally {
      setCopying(false);
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
  const [data, setData] = useState({ plans: [], bots: [], billing: [] });
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    loadData();
  }, [user.id]);

  const loadData = async () => {
    try {
      const [plansRes, botsRes, billingRes] = await Promise.all([
        api.get('/admin/plans'),
        api.get(`/admin/users/${user.id}/bots`).catch(() => ({ data: { bots: [] } })),
        api.get(`/admin/users/${user.id}/billing-history`).catch(() => ({ data: { history: [] } })),
      ]);
      setData({
        plans: plansRes.data.plans || [],
        bots: botsRes.data.bots || [],
        billing: billingRes.data.history || [],
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
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        showToast('success', 'לינק תשלום הועתק!');
      }
    } catch (err) {
      showToast('error', 'שגיאה ביצירת לינק');
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
    { id: 'subscription', label: 'מנוי', icon: Crown },
    { id: 'billing', label: 'חיובים', icon: Receipt },
    { id: 'bots', label: 'בוטים', icon: Bot },
    { id: 'settings', label: 'הגדרות', icon: Settings },
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
                <SubscriptionSection user={user} plans={data.plans} onRefresh={onRefresh} showToast={showToast} />
              )}
              {activeSection === 'billing' && (
                <BillingSection user={user} billing={data.billing} showToast={showToast} />
              )}
              {activeSection === 'bots' && (
                <BotsSection user={user} bots={data.bots} onRefresh={loadData} showToast={showToast} />
              )}
              {activeSection === 'settings' && (
                <SettingsSection user={user} plans={data.plans} onRefresh={onRefresh} showToast={showToast} />
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

// Subscription Section
function SubscriptionSection({ user, plans, onRefresh, showToast }) {
  const [formData, setFormData] = useState({
    planId: plans.find(p => p.name === user.plan_name)?.id || '',
    status: user.subscription_status || 'active',
    isManual: user.is_manual || false,
    expiresAt: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
    adminNotes: user.admin_notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/subscription`, formData);
      showToast('success', 'המנוי עודכן!');
      onRefresh();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תוכנית</label>
        <select
          value={formData.planId}
          onChange={(e) => setFormData(f => ({ ...f, planId: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
        >
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.name_he || plan.name} - ₪{plan.price}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סטטוס</label>
        <select
          value={formData.status}
          onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
        >
          <option value="active">פעיל</option>
          <option value="trial">ניסיון</option>
          <option value="cancelled">מבוטל</option>
          <option value="expired">פג תוקף</option>
        </select>
      </div>

      <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
        <input
          type="checkbox"
          id="isManual"
          checked={formData.isManual}
          onChange={(e) => setFormData(f => ({ ...f, isManual: e.target.checked }))}
          className="w-5 h-5 rounded text-violet-600"
        />
        <label htmlFor="isManual" className="text-gray-700 dark:text-gray-300">מנוי ידני (ללא חיוב אוטומטי)</label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תאריך תפוגה</label>
        <input
          type="date"
          value={formData.expiresAt}
          onChange={(e) => setFormData(f => ({ ...f, expiresAt: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">הערות אדמין</label>
        <textarea
          value={formData.adminNotes}
          onChange={(e) => setFormData(f => ({ ...f, adminNotes: e.target.value }))}
          rows={3}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl resize-none"
          placeholder="הערות פנימיות..."
        />
      </div>

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

// Settings Section
function SettingsSection({ user, plans, onRefresh, showToast }) {
  const [featureOverrides, setFeatureOverrides] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOverrides();
  }, []);

  const loadOverrides = async () => {
    try {
      const { data } = await api.get(`/admin/users/${user.id}/feature-overrides`);
      setFeatureOverrides(data.feature_overrides || {});
    } catch (err) {
      console.error('Failed to load overrides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/feature-overrides`, { feature_overrides: featureOverrides });
      showToast('success', 'ההגדרות נשמרו');
    } catch (err) {
      showToast('error', 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const features = [
    { key: 'max_bots', label: 'מקסימום בוטים', type: 'number' },
    { key: 'max_active_bots', label: 'מקסימום בוטים פעילים', type: 'number' },
    { key: 'max_contacts', label: 'מקסימום קונטקטים', type: 'number' },
    { key: 'allow_broadcasts', label: 'שידורים', type: 'boolean' },
    { key: 'allow_ai', label: 'בינה מלאכותית', type: 'boolean' },
  ];

  if (loading) {
    return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-violet-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          הגדרות אלו דורסות את ברירת המחדל של התוכנית. השאר ריק לשימוש בהגדרות התוכנית.
        </p>
      </div>

      {features.map(feature => (
        <div key={feature.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <span className="font-medium text-gray-900 dark:text-white">{feature.label}</span>
          {feature.type === 'number' ? (
            <input
              type="number"
              value={featureOverrides?.[feature.key] ?? ''}
              onChange={(e) => setFeatureOverrides(prev => ({
                ...prev,
                [feature.key]: e.target.value ? parseInt(e.target.value) : undefined
              }))}
              placeholder="ברירת מחדל"
              className="w-32 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-center"
            />
          ) : (
            <select
              value={featureOverrides?.[feature.key] === true ? 'true' : featureOverrides?.[feature.key] === false ? 'false' : ''}
              onChange={(e) => setFeatureOverrides(prev => ({
                ...prev,
                [feature.key]: e.target.value === '' ? undefined : e.target.value === 'true'
              }))}
              className="w-32 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
            >
              <option value="">ברירת מחדל</option>
              <option value="true">מופעל</option>
              <option value="false">מושבת</option>
            </select>
          )}
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium flex items-center justify-center gap-2"
      >
        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        שמור הגדרות
      </button>
    </div>
  );
}
