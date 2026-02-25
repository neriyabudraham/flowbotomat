import { useState, useEffect } from 'react';
import { 
  CreditCard, Clock, AlertTriangle, CheckCircle, XCircle, 
  RefreshCw, Play, Calendar, Search, Filter, DollarSign,
  ChevronLeft, ChevronRight, Loader2, History, Ban, FileText, Download,
  User, ExternalLink
} from 'lucide-react';
import api from '../../services/api';
import { UnifiedUserModal } from './AdminUsers';
import useAuthStore from '../../store/authStore';

export default function AdminBilling() {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(null);
  
  useEffect(() => {
    loadStats();
  }, []);

  const handleViewUser = async (userId) => {
    setLoadingUser(userId);
    try {
      const { data } = await api.get(`/admin/users?search=${userId}&limit=50`);
      const user = data.users?.find(u => u.id === userId);
      if (user) {
        setSelectedUser(user);
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    } finally {
      setLoadingUser(null);
    }
  };

  const handleSwitchToAccount = async (userId) => {
    try {
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && !localStorage.getItem('originalAccessToken')) {
        localStorage.setItem('originalAccessToken', currentToken);
      }
      const { data } = await api.post(`/experts/switch/${userId}`);
      if (data?.token) {
        localStorage.setItem('accessToken', data.token);
        window.location.href = '/dashboard';
      }
    } catch (err) {
      console.error('Switch error:', err);
    }
  };
  
  const loadStats = async () => {
    try {
      const res = await api.get('/admin/billing/stats');
      setStats(res.data.stats);
    } catch (err) {
      console.error('Failed to load billing stats:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const tabs = [
    { id: 'upcoming', label: 'חיובים קרובים', icon: Clock, count: stats?.upcoming_7d },
    { id: 'failed', label: 'חיובים שנכשלו', icon: AlertTriangle, count: stats?.failed_count, alert: true },
    { id: 'history', label: 'היסטוריית תשלומים', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-800">ניהול חיובים</h2>
        </div>
        <button 
          onClick={loadStats}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="רענון"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            icon={Clock}
            label="ממתינים לחיוב"
            value={stats.pending_count || 0}
            color="blue"
          />
          <StatCard 
            icon={AlertTriangle}
            label="חיובים שנכשלו"
            value={stats.failed_count || 0}
            color={stats.failed_count > 0 ? 'red' : 'gray'}
          />
          <StatCard 
            icon={CheckCircle}
            label="חיובים ב-30 יום"
            value={stats.completed_30d || 0}
            color="green"
          />
          <StatCard 
            icon={DollarSign}
            label="הכנסות 30 יום"
            value={`₪${Number(stats.revenue_30d || 0).toLocaleString()}`}
            color="purple"
          />
        </div>
      )}
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${tab.alert && tab.count > 0 ? 'text-red-500' : ''}`} />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                tab.alert ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      {activeTab === 'upcoming' && <UpcomingCharges onRefresh={loadStats} onViewUser={handleViewUser} loadingUser={loadingUser} />}
      {activeTab === 'failed' && <FailedCharges onRefresh={loadStats} onViewUser={handleViewUser} loadingUser={loadingUser} />}
      {activeTab === 'history' && <PaymentHistory onViewUser={handleViewUser} loadingUser={loadingUser} />}

      {/* User Details Modal */}
      {selectedUser && (
        <UnifiedUserModal 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)}
          onSuccess={() => {
            loadStats();
            setSelectedUser(null);
          }}
          onSwitchAccount={handleSwitchToAccount}
          currentUserId={currentUser?.id}
        />
      )}
    </div>
  );
}

function UpcomingCharges({ onRefresh, onViewUser, loadingUser }) {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [actionLoading, setActionLoading] = useState(null);
  
  useEffect(() => {
    loadCharges();
  }, [days]);
  
  const loadCharges = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/billing/upcoming?days=${days}`);
      setCharges(res.data.charges || []);
    } catch (err) {
      console.error('Failed to load upcoming charges:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleChargeNow = async (id) => {
    if (!confirm('האם לחייב עכשיו?')) return;
    
    setActionLoading(id);
    try {
      await api.post(`/admin/billing/charge/${id}`);
      loadCharges();
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בחיוב');
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleCancel = async (id) => {
    if (!confirm('האם לבטל את החיוב?')) return;
    
    setActionLoading(id);
    try {
      await api.post(`/admin/billing/cancel/${id}`);
      loadCharges();
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול');
    } finally {
      setActionLoading(null);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-4">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value={7}>7 ימים הקרובים</option>
          <option value={14}>14 ימים הקרובים</option>
          <option value={30}>30 ימים הקרובים</option>
          <option value={60}>60 ימים הקרובים</option>
          <option value={90}>90 ימים הקרובים</option>
          <option value={9999}>כל התשלומים</option>
        </select>
        <span className="text-sm text-gray-500">
          {charges.length} חיובים מתוזמנים
        </span>
      </div>
      
      {/* Table */}
      {charges.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>אין חיובים מתוזמנים ב-{days} ימים הקרובים</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">משתמש</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">סכום</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תאריך</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">סוג</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תוכנית</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {charges.map(charge => (
                <tr key={charge.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onViewUser(charge.user_id)}
                      className="text-right hover:bg-purple-50 rounded p-1 -m-1 transition-colors group"
                      disabled={loadingUser === charge.user_id}
                    >
                      <div className="font-medium text-gray-800 group-hover:text-purple-600 flex items-center gap-1">
                        {loadingUser === charge.user_id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <User className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                        {charge.display_name || 'ללא שם'}
                        {!charge.has_payment_method && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded-full mr-1" title="אין כרטיס אשראי">
                            <AlertTriangle className="w-3 h-3 inline" />
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        {charge.email}
                        {charge.has_payment_method && charge.card_last_digits && (
                          <span className="text-[10px] text-gray-400">({charge.card_last_digits})</span>
                        )}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    ₪{Number(charge.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(charge.charge_date).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-4 py-3">
                    <BillingTypeBadge type={charge.billing_type} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {charge.plan_name_he || charge.plan_name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleChargeNow(charge.id)}
                        disabled={actionLoading === charge.id}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                        title="חייב עכשיו"
                      >
                        {actionLoading === charge.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleCancel(charge.id)}
                        disabled={actionLoading === charge.id}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="בטל חיוב"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FailedCharges({ onRefresh, onViewUser, loadingUser }) {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  
  useEffect(() => {
    loadCharges();
  }, []);
  
  const loadCharges = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/billing/failed');
      setCharges(res.data.charges || []);
    } catch (err) {
      console.error('Failed to load failed charges:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRetry = async (id) => {
    if (!confirm('האם לנסות שוב לחייב?')) return;
    
    setActionLoading(id);
    try {
      const res = await api.post(`/admin/billing/retry/${id}`);
      if (res.data.success) {
        alert('החיוב בוצע בהצלחה!');
      }
      loadCharges();
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בחיוב');
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleCancel = async (id) => {
    if (!confirm('האם לבטל את החיוב? (המשתמש לא יחויב)')) return;
    
    setActionLoading(id);
    try {
      await api.post(`/admin/billing/cancel/${id}`);
      loadCharges();
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול');
    } finally {
      setActionLoading(null);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }
  
  if (charges.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
        <p>אין חיובים שנכשלו</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {charges.map(charge => (
        <div 
          key={charge.id}
          className="bg-red-50 border border-red-200 rounded-xl p-4"
        >
            <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <button
                  onClick={() => onViewUser(charge.user_id)}
                  disabled={loadingUser === charge.user_id}
                  className="font-medium text-gray-800 hover:text-purple-600 flex items-center gap-1 transition-colors"
                >
                  {loadingUser === charge.user_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  {charge.display_name || charge.email}
                </button>
                <span className="text-lg font-bold text-red-600">
                  ₪{Number(charge.amount).toLocaleString()}
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">תאריך חיוב:</span>
                  <span className="text-gray-700 mr-1">
                    {new Date(charge.charge_date).toLocaleDateString('he-IL')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">ניסיונות:</span>
                  <span className="text-gray-700 mr-1">
                    {charge.retry_count} / {charge.max_retries || 2}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">ניסיון אחרון:</span>
                  <span className="text-gray-700 mr-1">
                    {charge.last_attempt_at 
                      ? new Date(charge.last_attempt_at).toLocaleDateString('he-IL')
                      : '-'
                    }
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">סוג:</span>
                  <BillingTypeBadge type={charge.billing_type} className="mr-1" />
                </div>
              </div>
              
              {charge.last_error && (
                <div className="mt-3 p-2 bg-red-100 rounded-lg text-sm text-red-700">
                  <span className="font-medium">שגיאה: </span>
                  {charge.last_error}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 mr-4">
              <button
                onClick={() => handleRetry(charge.id)}
                disabled={actionLoading === charge.id}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {actionLoading === charge.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                נסה שוב
              </button>
              <button
                onClick={() => handleCancel(charge.id)}
                disabled={actionLoading === charge.id}
                className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                בטל
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentHistory({ onViewUser, loadingUser }) {
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
    search: '',
    userEmail: ''
  });
  const [page, setPage] = useState(0);
  const limit = 20;
  
  useEffect(() => {
    loadPayments();
  }, [page, filters.status, filters.userEmail]);
  
  const loadPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString()
      });
      
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.search) params.append('search', filters.search);
      if (filters.userEmail) params.append('userEmail', filters.userEmail);
      
      const res = await api.get(`/admin/billing/history?${params}`);
      setPayments(res.data.payments || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to load payment history:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const filterByUser = (email) => {
    setFilters(f => ({ ...f, userEmail: email }));
    setPage(0);
  };
  
  const clearUserFilter = () => {
    setFilters(f => ({ ...f, userEmail: '' }));
    setPage(0);
  };
  
  const totalPages = Math.ceil(total / limit);
  
  return (
    <div className="space-y-4">
      {/* User Filter Badge */}
      {filters.userEmail && (
        <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <span className="text-sm text-purple-700">מציג תשלומים של:</span>
          <span className="font-medium text-purple-800">{filters.userEmail}</span>
          <button
            onClick={clearUserFilter}
            className="mr-auto px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            הצג הכל
          </button>
        </div>
      )}
      
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי מייל..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && loadPayments()}
            className="pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm w-48"
          />
        </div>
        
        <select
          value={filters.status}
          onChange={(e) => {
            setFilters(f => ({ ...f, status: e.target.value }));
            setPage(0);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="success">הצליח</option>
          <option value="failed">נכשל</option>
          <option value="refunded">זוכה</option>
        </select>
        
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <span className="text-gray-400">עד</span>
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        
        <button
          onClick={loadPayments}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          חפש
        </button>
        
        <span className="text-sm text-gray-500 mr-auto">
          {total} תשלומים
        </span>
      </div>
      
      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>אין תשלומים להצגה</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תאריך</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">משתמש</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">סכום</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">סטטוס</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תיאור</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">מזהה עסקה</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">קבלה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(payment => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {new Date(payment.created_at).toLocaleString('he-IL')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onViewUser(payment.user_id)}
                        disabled={loadingUser === payment.user_id}
                        className="text-right hover:bg-purple-50 rounded p-1 -m-1 transition-colors group"
                        title="לחץ לצפייה בפרטי המשתמש"
                      >
                        <div className="font-medium text-gray-800 text-sm group-hover:text-purple-600 flex items-center gap-1">
                          {loadingUser === payment.user_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <User className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                          {payment.display_name || 'ללא שם'}
                        </div>
                        <div className="text-xs text-gray-500">{payment.email}</div>
                      </button>
                      <button
                        onClick={() => filterByUser(payment.email)}
                        className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="סנן לפי משתמש"
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    ₪{Number(payment.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={payment.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                    {payment.description || payment.plan_name_he || '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {payment.sumit_transaction_id || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {payment.receipt_url ? (
                      <a 
                        href={payment.receipt_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors inline-flex"
                        title="הורד קבלה"
                      >
                        <FileText className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                עמוד {page + 1} מתוך {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-100' },
  };

  const c = colors[color] || colors.gray;

  return (
    <div className={`bg-white rounded-xl border ${c.border} p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>
        {value}
      </div>
    </div>
  );
}

function BillingTypeBadge({ type, className = '' }) {
  const types = {
    monthly: { label: 'חודשי', color: 'bg-blue-100 text-blue-700' },
    yearly: { label: 'שנתי', color: 'bg-purple-100 text-purple-700' },
    status_bot: { label: 'בוט סטטוסים', color: 'bg-amber-100 text-amber-700' },
    trial_conversion: { label: 'המרת ניסיון', color: 'bg-cyan-100 text-cyan-700' },
    first_payment: { label: 'תשלום ראשון', color: 'bg-emerald-100 text-emerald-700' },
    renewal: { label: 'חידוש מנוי', color: 'bg-teal-100 text-teal-700' },
    reactivation: { label: 'הפעלה מחדש', color: 'bg-green-100 text-green-700' },
    manual: { label: 'ידני', color: 'bg-gray-100 text-gray-700' },
  };
  
  const t = types[type] || { label: type || '-', color: 'bg-gray-100 text-gray-700' };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.color} ${className}`}>
      {t.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const statuses = {
    success: { label: 'הצליח', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    failed: { label: 'נכשל', color: 'bg-red-100 text-red-700', icon: XCircle },
    pending: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    refunded: { label: 'זוכה', color: 'bg-gray-100 text-gray-700', icon: RefreshCw },
  };
  
  const s = statuses[status] || statuses.pending;
  const Icon = s.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}
