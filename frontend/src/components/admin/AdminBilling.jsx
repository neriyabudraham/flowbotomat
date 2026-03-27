import { useState, useEffect, useRef } from 'react';
import {
  CreditCard, Clock, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Calendar, Search, Filter, DollarSign,
  ChevronLeft, ChevronRight, Loader2, History, Ban, FileText,
  User, MoreVertical, Play, SkipForward, Edit3, Receipt,
  AlertCircle, TrendingDown, ChevronDown, UserX, Trash2,
  Link2, Check
} from 'lucide-react';
import api from '../../services/api';
import { toast } from '../../store/toastStore';
import { UnifiedUserModal } from './AdminUsers';
import useAuthStore from '../../store/authStore';

export default function AdminBilling() {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(null);
  // For switching to history tab with a user pre-filtered
  const [historyUserEmail, setHistoryUserEmail] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const handleViewUser = async (userId) => {
    setLoadingUser(userId);
    try {
      const { data } = await api.get(`/admin/users?search=${userId}&limit=50`);
      const user = data.users?.find(u => u.id === userId);
      if (user) setSelectedUser(user);
    } catch (err) {
      console.error('Failed to load user:', err);
    } finally {
      setLoadingUser(null);
    }
  };

  const handleViewHistory = (email) => {
    setHistoryUserEmail(email);
    setActiveTab('history');
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
      {/* Header */}
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
          <StatCard icon={Clock} label="ממתינים לחיוב" value={stats.pending_count || 0} color="blue" />
          <StatCard icon={AlertTriangle} label="חיובים שנכשלו" value={stats.failed_count || 0} color={stats.failed_count > 0 ? 'red' : 'gray'} />
          <StatCard icon={CheckCircle} label="חיובים ב-30 יום" value={stats.completed_30d || 0} color="green" />
          <StatCard icon={DollarSign} label="הכנסות 30 יום" value={`₪${Number(stats.revenue_30d || 0).toLocaleString()}`} color="purple" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${tab.alert && tab.count > 0 ? 'text-red-500' : ''}`} />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-2 py-0.5 text-xs rounded-full ${tab.alert ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'upcoming' && (
        <UpcomingCharges onRefresh={loadStats} onViewUser={handleViewUser} loadingUser={loadingUser} onViewHistory={handleViewHistory} />
      )}
      {activeTab === 'failed' && (
        <FailedCharges onRefresh={loadStats} onViewUser={handleViewUser} loadingUser={loadingUser} onViewHistory={handleViewHistory} />
      )}
      {activeTab === 'history' && (
        <PaymentHistory onViewUser={handleViewUser} loadingUser={loadingUser} initialUserEmail={historyUserEmail} onClearUserEmail={() => setHistoryUserEmail('')} />
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <UnifiedUserModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSuccess={() => { loadStats(); setSelectedUser(null); }}
          onSwitchAccount={handleSwitchToAccount}
          currentUserId={currentUser?.id}
        />
      )}
    </div>
  );
}

// ─── Actions Dropdown ────────────────────────────────────────────────────────

function ChargeActionsMenu({ charge, onRefresh, onViewUser, loadingUser, onViewHistory, onOpenChangeAmount, onOpenChangeDate, onOpenEditSumitId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const run = async (fn) => {
    setOpen(false);
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  };

  const handleChargeNow = () => run(async () => {
    if (!confirm(`לחייב ₪${Number(charge.amount).toLocaleString()} עכשיו?`)) return;
    const res = await api.post(`/admin/billing/charge/${charge.id}`);
    if (res.data.success) {
      toast.success(`חויב בהצלחה!\nמזהה עסקה: ${res.data.transactionId}`);
      onRefresh?.();
    } else {
      toast.error(`החיוב נכשל: ${res.data.error}`);
    }
  });

  const handleSkip = () => run(async () => {
    if (!confirm('לדלג על חיוב זה ולדחות חודש?')) return;
    await api.post(`/admin/billing/skip/${charge.id}`);
    onRefresh?.();
  });

  const handleCancel = () => run(async () => {
    if (!confirm('לבטל את החיוב לצמיתות?')) return;
    await api.post(`/admin/billing/cancel/${charge.id}`);
    onRefresh?.();
  });

  const handleCancelSubscription = () => run(async () => {
    const reason = prompt(`ביטול מנוי עבור ${charge.display_name || charge.email}\n\nהמשתמש יועבר לתוכנית חינמית והבוטים שלו יינעלו.\n\nסיבה לביטול (אופציונלי):`);
    if (reason === null) return; // user pressed cancel
    await api.post(`/admin/billing/cancel-subscription/${charge.user_id}`, { reason });
    toast.success('המנוי בוטל בהצלחה');
    onRefresh?.();
  });

  const menuItems = [
    {
      icon: Play, label: 'חייב עכשיו', color: 'text-green-600 hover:bg-green-50',
      onClick: handleChargeNow,
    },
    {
      icon: SkipForward, label: 'דלג על חיוב זה (+ חודש)', color: 'text-blue-600 hover:bg-blue-50',
      onClick: handleSkip,
    },
    {
      icon: Edit3, label: 'שנה עלות', color: 'text-orange-600 hover:bg-orange-50',
      onClick: () => { setOpen(false); onOpenChangeAmount(charge); },
    },
    {
      icon: Calendar, label: 'שנה תאריך חיוב', color: 'text-teal-600 hover:bg-teal-50',
      onClick: () => { setOpen(false); onOpenChangeDate(charge); },
    },
    {
      icon: CreditCard, label: 'ערוך מזהה Sumit', color: 'text-indigo-600 hover:bg-indigo-50',
      onClick: () => { setOpen(false); onOpenEditSumitId(charge); },
    },
    {
      icon: History, label: 'היסטוריית תשלומים', color: 'text-purple-600 hover:bg-purple-50',
      onClick: () => { setOpen(false); onViewHistory(charge.email); },
    },
    { divider: true },
    {
      icon: Ban, label: 'בטל חיוב', color: 'text-red-600 hover:bg-red-50',
      onClick: handleCancel,
    },
    {
      icon: UserX, label: 'בטל מנוי (→ חינמי)', color: 'text-red-700 hover:bg-red-50 font-semibold',
      onClick: handleCancelSubscription,
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <MoreVertical className="w-3 h-3" />}
        פעולות
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 overflow-hidden">
          {menuItems.map((item, i) =>
            item.divider ? (
              <div key={i} className="h-px bg-gray-100 my-1" />
            ) : (
              <button
                key={i}
                onClick={item.onClick}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${item.color}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Change Amount Modal ──────────────────────────────────────────────────────

function ChangeAmountModal({ charge, onClose, onDone }) {
  const [amount, setAmount] = useState(charge.amount);
  const [applyTo, setApplyTo] = useState('0'); // '0'=only this, '3'=next 3, '-1'=all
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applyOptions = [
    { value: '0', label: 'רק לחיוב זה' },
    { value: '3', label: '3 חיובים הקרובים' },
    { value: '6', label: '6 חיובים הקרובים' },
    { value: '12', label: '12 חיובים הקרובים' },
    { value: '-1', label: 'כל החיובים העתידיים' },
  ];

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) { setError('סכום לא תקין'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/admin/billing/amount/${charge.id}`, {
        amount: num,
        applyToNext: parseInt(applyTo),
      });
      onDone(`✅ עודכן בהצלחה - ${res.data.updatedCount} חיובים עודכנו`);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" dir="rtl">
        <div>
          <h3 className="text-lg font-bold text-gray-900">שנה עלות חיוב</h3>
          <p className="text-sm text-gray-500 mt-1">
            {charge.display_name || charge.email} — חיוב מתוזמן ל-{new Date(charge.charge_date).toLocaleDateString('he-IL')}
          </p>
        </div>

        <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>עלות נוכחית:</span>
            <span className="font-bold">₪{Number(charge.amount).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>סוג:</span>
            <span>{charge.billing_type}</span>
          </div>
          {charge.plan_name_he && (
            <div className="flex justify-between">
              <span>תוכנית:</span>
              <span>{charge.plan_name_he}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">עלות חדשה (₪)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">החל על</label>
          <div className="space-y-2">
            {applyOptions.map(opt => (
              <label key={opt.value} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="applyTo"
                  value={opt.value}
                  checked={applyTo === opt.value}
                  onChange={() => setApplyTo(opt.value)}
                  className="accent-purple-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Date Modal ───────────────────────────────────────────────────────

function ChangeDateModal({ charge, onClose, onDone }) {
  const [chargeDate, setChargeDate] = useState(
    new Date(charge.charge_date).toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!chargeDate) { setError('נא לבחור תאריך'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/billing/charge-date/${charge.id}`, { chargeDate });
      onDone('✅ תאריך החיוב עודכן בהצלחה');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" dir="rtl">
        <div>
          <h3 className="text-lg font-bold text-gray-900">שנה תאריך חיוב</h3>
          <p className="text-sm text-gray-500 mt-1">
            {charge.display_name || charge.email} — ₪{Number(charge.amount).toLocaleString()}
          </p>
        </div>

        <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>תאריך נוכחי:</span>
            <span className="font-bold">{new Date(charge.charge_date).toLocaleDateString('he-IL')}</span>
          </div>
          <div className="flex justify-between">
            <span>סוג:</span>
            <span><BillingTypeBadge type={charge.billing_type} /></span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">תאריך חיוב חדש</label>
          <input
            type="date"
            value={chargeDate}
            onChange={e => setChargeDate(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Sumit Customer ID Modal ────────────────────────────────────────────

function EditSumitIdModal({ charge, onClose, onDone }) {
  const [sumitId, setSumitId] = useState(charge.sumit_customer_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!sumitId) { setError('נא להזין מזהה Sumit'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/billing/sumit-customer/${charge.user_id}`, {
        sumitCustomerId: parseInt(sumitId)
      });
      onDone('✅ מזהה Sumit עודכן בהצלחה');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בעדכון');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" dir="rtl">
        <div>
          <h3 className="text-lg font-bold text-gray-900">עריכת מזהה לקוח Sumit</h3>
          <p className="text-sm text-gray-500 mt-1">
            {charge.display_name || charge.email}
          </p>
        </div>

        <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>מזהה נוכחי:</span>
            <span className="font-bold font-mono">{charge.sumit_customer_id || 'לא מוגדר'}</span>
          </div>
          {charge.card_last_digits && (
            <div className="flex justify-between">
              <span>כרטיס:</span>
              <span>****{charge.card_last_digits}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">מזהה לקוח Sumit חדש</label>
          <input
            type="number"
            value={sumitId}
            onChange={e => setSumitId(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
            placeholder="לדוגמא: 123456"
          />
          <p className="text-xs text-gray-400 mt-1">המזהה יעודכן גם במנוי וגם באמצעי התשלום של המשתמש</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upcoming Charges ─────────────────────────────────────────────────────────

function UpcomingCharges({ onRefresh, onViewUser, loadingUser, onViewHistory }) {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(9999);
  const [changeAmountCharge, setChangeAmountCharge] = useState(null);
  const [changeDateCharge, setChangeDateCharge] = useState(null);
  const [editSumitCharge, setEditSumitCharge] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadCharges(); }, [days]);

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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {toast && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
          {toast}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value={7}>7 ימים הקרובים</option>
          <option value={14}>14 ימים הקרובים</option>
          <option value={30}>30 ימים הקרובים</option>
          <option value={60}>60 ימים הקרובים</option>
          <option value={90}>90 ימים הקרובים</option>
          <option value={9999}>כל התשלומים</option>
        </select>
        <span className="text-sm text-gray-500">{charges.length} חיובים מתוזמנים</span>
      </div>

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
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תאריך חיוב</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">סוג</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תוכנית</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {charges.map(charge => {
                const isOverdue = new Date(charge.charge_date) < new Date(new Date().toDateString());
                return (
                <tr key={charge.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onViewUser(charge.user_id)}
                      className="text-right hover:bg-purple-50 rounded p-1 -m-1 transition-colors group"
                      disabled={loadingUser === charge.user_id}
                    >
                      <div className="font-medium text-gray-800 group-hover:text-purple-600 flex items-center gap-1">
                        {loadingUser === charge.user_id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <User className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        }
                        {charge.display_name || 'ללא שם'}
                        {!charge.has_payment_method && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded-full mr-1" title="אין כרטיס אשראי">
                            ⚠️
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
                  <td className="px-4 py-3 font-bold text-gray-800">
                    ₪{Number(charge.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                      {new Date(charge.charge_date).toLocaleDateString('he-IL')}
                    </span>
                    {isOverdue && (
                      <span className="block text-[10px] text-red-500 font-medium mt-0.5">⚠️ עבר תאריך!</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BillingTypeBadge type={charge.billing_type} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {charge.plan_name_he || charge.plan_name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ChargeActionsMenu
                      charge={charge}
                      onRefresh={() => { loadCharges(); }}
                      onViewUser={onViewUser}
                      loadingUser={loadingUser}
                      onViewHistory={onViewHistory}
                      onOpenChangeAmount={setChangeAmountCharge}
                      onOpenChangeDate={setChangeDateCharge}
                      onOpenEditSumitId={setEditSumitCharge}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {changeAmountCharge && (
        <ChangeAmountModal
          charge={changeAmountCharge}
          onClose={() => setChangeAmountCharge(null)}
          onDone={(msg) => {
            setChangeAmountCharge(null);
            showToast(msg);
            loadCharges();
          }}
        />
      )}

      {changeDateCharge && (
        <ChangeDateModal
          charge={changeDateCharge}
          onClose={() => setChangeDateCharge(null)}
          onDone={(msg) => {
            setChangeDateCharge(null);
            showToast(msg);
            loadCharges();
          }}
        />
      )}

      {editSumitCharge && (
        <EditSumitIdModal
          charge={editSumitCharge}
          onClose={() => setEditSumitCharge(null)}
          onDone={(msg) => {
            setEditSumitCharge(null);
            showToast(msg);
            loadCharges();
          }}
        />
      )}
    </div>
  );
}

// ─── Failed Charges ───────────────────────────────────────────────────────────

function FailedCharges({ onRefresh, onViewUser, loadingUser, onViewHistory }) {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => { loadCharges(); }, []);

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
    if (!confirm('לנסות לחייב שוב?')) return;
    setActionLoading(id);
    try {
      const res = await api.post(`/admin/billing/retry/${id}`);
      if (res.data.success) {
        toast.success(`החיוב הצליח! עסקה: ${res.data.transactionId}`);
      } else {
        toast.error(`החיוב נכשל שוב: ${res.data.error}`);
      }
      loadCharges();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בחיוב');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('לבטל את החיוב? (המשתמש לא יחויב)')) return;
    setActionLoading(id);
    try {
      await api.post(`/admin/billing/cancel/${id}`);
      loadCharges();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בביטול');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('למחוק את הרשומה לצמיתות? פעולה זו בלתי הפיכה.')) return;
    setActionLoading(id);
    try {
      await api.delete(`/admin/billing/charge/${id}`);
      loadCharges();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה במחיקה');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
    </div>
  );

  if (charges.length === 0) return (
    <div className="text-center py-12 text-gray-500">
      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
      <p>אין חיובים שנכשלו</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {charges.map(charge => {
        const isDowngraded = charge.subscription_status === 'expired' && parseFloat(charge.current_plan_price || 0) === 0;
        const isMaxRetries = (charge.retry_count || 0) >= (charge.max_retries || 2);

        return (
          <div key={charge.id} className="bg-white border border-red-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-red-50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <button
                  onClick={() => onViewUser(charge.user_id)}
                  disabled={loadingUser === charge.user_id}
                  className="font-semibold text-gray-900 hover:text-purple-600 flex items-center gap-1.5 transition-colors"
                >
                  {loadingUser === charge.user_id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <User className="w-4 h-4" />
                  }
                  {charge.display_name || charge.email}
                </button>
                <span className="text-red-600 font-bold text-lg">₪{Number(charge.amount).toLocaleString()}</span>
                <BillingTypeBadge type={charge.billing_type} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onViewHistory(charge.email)}
                  className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors flex items-center gap-1"
                >
                  <History className="w-3 h-3" />
                  היסטוריה
                </button>
                <button
                  onClick={() => handleRetry(charge.id)}
                  disabled={actionLoading === charge.id}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {actionLoading === charge.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  נסה שוב
                </button>
                <button
                  onClick={() => handleCancel(charge.id)}
                  disabled={actionLoading === charge.id}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300 disabled:opacity-50"
                >
                  בטל
                </button>
                <button
                  onClick={() => handleDelete(charge.id)}
                  disabled={actionLoading === charge.id}
                  className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200 disabled:opacity-50 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  מחק
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-3">
              {/* Downgrade warning */}
              {isDowngraded && (
                <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                  <TrendingDown className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-orange-700">המשתמש הורד לתוכנית חינמית!</span>
                    <span className="text-orange-600 mr-1">לאחר מיצוי כל הניסיונות, המנוי הסתיים.</span>
                  </div>
                </div>
              )}
              {isMaxRetries && !isDowngraded && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-red-700">מוצו כל הניסיונות האוטומטיים</span>
                    <span className="text-red-600 mr-1">— יש לטפל ידנית או לבטל.</span>
                  </div>
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-400 mb-1">ניסיונות</div>
                  <div className="font-bold text-gray-800">{charge.retry_count || 0} / {charge.max_retries || 2}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-400 mb-1">תאריך חיוב</div>
                  <div className="font-medium text-gray-700">{new Date(charge.charge_date).toLocaleDateString('he-IL')}</div>
                </div>
                {charge.last_attempt_at && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="text-xs text-gray-400 mb-1">ניסיון אחרון</div>
                    <div className="font-medium text-gray-700">{new Date(charge.last_attempt_at).toLocaleDateString('he-IL')}</div>
                  </div>
                )}
                {charge.next_retry_at && !isMaxRetries && (
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <div className="text-xs text-blue-400 mb-1">ניסיון הבא</div>
                    <div className="font-medium text-blue-700">{new Date(charge.next_retry_at).toLocaleDateString('he-IL')}</div>
                  </div>
                )}
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-400 mb-1">מנוי נוכחי</div>
                  <div className={`font-medium ${charge.subscription_status === 'active' ? 'text-green-600' : charge.subscription_status === 'expired' ? 'text-red-600' : 'text-gray-700'}`}>
                    {charge.subscription_status === 'active' ? 'פעיל' :
                     charge.subscription_status === 'expired' ? 'פג תוקף' :
                     charge.subscription_status === 'trial' ? 'ניסיון' :
                     charge.subscription_status || '—'}
                    {charge.current_plan_name_he && ` (${charge.current_plan_name_he})`}
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {charge.last_error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    שגיאה מסאמיט:
                  </div>
                  <div className="text-sm text-red-700 font-mono">
                    {charge.last_error_code && (
                      <span className="inline-block px-1.5 py-0.5 bg-red-100 rounded text-xs mr-2">{charge.last_error_code}</span>
                    )}
                    {charge.last_error}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Payment History ──────────────────────────────────────────────────────────

function PaymentHistory({ onViewUser, loadingUser, initialUserEmail, onClearUserEmail }) {
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'success',
    startDate: '',
    endDate: '',
    search: '',
    userEmail: initialUserEmail || ''
  });
  const [page, setPage] = useState(0);
  const limit = 20;
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [receiptUrlValue, setReceiptUrlValue] = useState('');
  const [savingReceipt, setSavingReceipt] = useState(false);

  const handleSaveReceiptUrl = async (paymentId) => {
    if (!receiptUrlValue.trim()) return;
    setSavingReceipt(true);
    try {
      await api.put(`/admin/billing/receipt-url/${paymentId}`, { receipt_url: receiptUrlValue.trim() });
      setEditingReceiptId(null);
      loadPayments();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בעדכון קבלה');
    } finally {
      setSavingReceipt(false);
    }
  };

  useEffect(() => {
    if (initialUserEmail) {
      setFilters(f => ({ ...f, userEmail: initialUserEmail }));
    }
  }, [initialUserEmail]);

  useEffect(() => { loadPayments(); }, [page, filters.status, filters.userEmail]);

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

  const filterByUser = (email) => { setFilters(f => ({ ...f, userEmail: email })); setPage(0); };
  const clearUserFilter = () => {
    setFilters(f => ({ ...f, userEmail: '' }));
    setPage(0);
    onClearUserEmail?.();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Active user filter banner */}
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי מייל..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && loadPayments()}
            className="pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm w-48"
          />
        </div>
        <select
          value={filters.status}
          onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(0); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="success">הצליח</option>
          <option value="failed">נכשל</option>
          <option value="refunded">זוכה</option>
        </select>
        <input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <span className="text-gray-400">עד</span>
        <input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <button onClick={loadPayments} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
          חפש
        </button>
        <span className="text-sm text-gray-500 mr-auto">{total} תשלומים</span>
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
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">תיאור / שגיאה</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">מזהה עסקה</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">קבלה</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map(payment => (
                  <tr key={payment.id} className={`hover:bg-gray-50 ${payment.status === 'failed' ? 'bg-red-50/30' : ''} ${payment.status === 'voided' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {new Date(payment.created_at).toLocaleString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onViewUser(payment.user_id)}
                          disabled={loadingUser === payment.user_id}
                          className="text-right hover:bg-purple-50 rounded p-1 -m-1 transition-colors group"
                        >
                          <div className="font-medium text-gray-800 text-sm group-hover:text-purple-600 flex items-center gap-1">
                            {loadingUser === payment.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <User className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
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
                    <td className="px-4 py-3 font-bold text-gray-800">
                      ₪{Number(payment.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="px-4 py-3 text-sm max-w-[220px]">
                      {payment.status === 'failed' && payment.error_message ? (
                        <div>
                          <div className="text-gray-500 text-xs truncate">{payment.description || '-'}</div>
                          <div className="text-red-600 text-xs mt-0.5 flex items-start gap-1">
                            <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="break-words">{payment.error_message}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-600 truncate block">{payment.description || payment.plan_name_he || '-'}</span>
                      )}
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          קבלה
                        </a>
                      ) : payment.sumit_document_number ? (
                        <span className="text-gray-400 text-xs font-mono" title="מספר מסמך בסאמיט">
                          #{payment.sumit_document_number}
                        </span>
                      ) : payment.status === 'success' ? (
                        editingReceiptId === payment.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="url"
                              value={receiptUrlValue}
                              onChange={e => setReceiptUrlValue(e.target.value)}
                              className="w-40 px-2 py-1 border border-gray-200 rounded text-xs"
                              placeholder="קישור לקבלה..."
                              dir="ltr"
                            />
                            <button onClick={() => handleSaveReceiptUrl(payment.id)} disabled={savingReceipt} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              {savingReceipt ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </button>
                            <button onClick={() => setEditingReceiptId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                              <XCircle className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingReceiptId(payment.id); setReceiptUrlValue(''); }}
                            className="flex items-center gap-1 px-2 py-1 text-amber-600 hover:bg-amber-50 rounded text-xs transition-colors"
                            title="הוסף קישור לקבלה"
                          >
                            <Link2 className="w-3 h-3" />
                            הוסף קבלה
                          </button>
                        )
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {payment.status !== 'voided' && (
                        <PaymentActionsMenu
                          payment={payment}
                          onRefresh={loadPayments}
                        />
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
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">עמוד {page + 1} מתוך {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Payment History Actions ──────────────────────────────────────────────────

function PaymentActionsMenu({ payment, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const run = async (fn) => {
    setOpen(false);
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  };

  const handleVoid = () => run(async () => {
    if (!confirm(`לבטל את הרישום של עסקה זו (₪${Number(payment.amount).toLocaleString()})?\n\nהפעולה מסמנת את החיוב כ"בוטל" ברשומות בלבד — לא מבצעת זיכוי בסאמיט.`)) return;
    await api.post(`/admin/billing/void-payment/${payment.id}`);
    onRefresh?.();
  });

  const handleCancelSubscription = () => run(async () => {
    const reason = prompt(`ביטול מנוי עבור ${payment.display_name || payment.email}\n\nהמשתמש יועבר לתוכנית חינמית.\n\nסיבה (אופציונלי):`);
    if (reason === null) return;
    await api.post(`/admin/billing/cancel-subscription/${payment.user_id}`, { reason });
    toast.success('המנוי בוטל');
    onRefresh?.();
  });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <MoreVertical className="w-3 h-3" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 overflow-hidden">
          <button
            onClick={handleVoid}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-right"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            בטל חיוב (סמן כמבוטל)
          </button>
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={handleCancelSubscription}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 transition-colors font-semibold text-right"
          >
            <UserX className="w-4 h-4 shrink-0" />
            בטל מנוי (→ חינמי)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

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
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
    </div>
  );
}

function BillingTypeBadge({ type, className = '' }) {
  const types = {
    monthly: { label: 'חודשי', color: 'bg-blue-100 text-blue-700' },
    yearly: { label: 'שנתי', color: 'bg-purple-100 text-purple-700' },
    status_bot: { label: 'בוט סטטוסים', color: 'bg-amber-100 text-amber-700' },
    service_recurring: { label: 'שירות חודשי', color: 'bg-amber-100 text-amber-700' },
    one_time: { label: 'חד פעמי', color: 'bg-orange-100 text-orange-700' },
    recurring: { label: 'שירות חוזר', color: 'bg-amber-100 text-amber-700' },
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
    voided: { label: 'בוטל', color: 'bg-gray-100 text-gray-500', icon: Ban },
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
