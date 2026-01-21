import { useState, useEffect } from 'react';
import { 
  CreditCard, Users, Settings, Plus, Edit2, Trash2, Check, X, 
  Crown, Zap, Star, Building, RefreshCw, Search, Calendar, User
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';
import ConfirmModal from '../organisms/ConfirmModal';

const PLAN_ICONS = {
  'Free': Star,
  'Basic': Zap,
  'Pro': Crown,
  'Enterprise': Building,
};

export default function AdminSubscriptions() {
  const [activeTab, setActiveTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansRes, subsRes] = await Promise.all([
        api.get('/subscriptions/plans'),
        api.get('/subscriptions/all'),
      ]);
      setPlans(plansRes.data.plans || []);
      setSubscriptions(subsRes.data.subscriptions || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async (plan) => {
    try {
      if (plan.id) {
        await api.put(`/subscriptions/plans/${plan.id}`, plan);
      } else {
        await api.post('/subscriptions/plans', plan);
      }
      setEditingPlan(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    }
  };

  const handleDeletePlan = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/subscriptions/plans/${confirmDelete}`);
      setConfirmDelete(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleCancelSubscription = async (subId) => {
    if (!confirm('לבטל את המנוי?')) return;
    try {
      await api.delete(`/subscriptions/${subId}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול');
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => 
    sub.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">ניהול מנויים</h2>
        </div>
        
        <Button variant="ghost" onClick={loadData} className="!p-2">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'plans'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4 inline ml-2" />
          תכניות
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'subscriptions'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4 inline ml-2" />
          מנויים פעילים
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : activeTab === 'plans' ? (
        /* Plans Tab */
        <div className="space-y-4">
          <Button onClick={() => setEditingPlan({})}>
            <Plus className="w-4 h-4 ml-2" />
            תכנית חדשה
          </Button>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map(plan => {
              const Icon = PLAN_ICONS[plan.name] || Star;
              return (
                <div 
                  key={plan.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${
                    !plan.is_active ? 'opacity-50 border-gray-300' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <Icon className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800 dark:text-white">{plan.name_he}</h3>
                        <p className="text-sm text-gray-500">{plan.name}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(plan.id)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                  <div className="text-2xl font-bold text-gray-800 dark:text-white mb-3">
                    ₪{plan.price}
                    <span className="text-sm font-normal text-gray-500">
                      /{plan.billing_period === 'monthly' ? 'חודש' : plan.billing_period === 'yearly' ? 'שנה' : ''}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">בוטים</span>
                      <span className="font-medium">{plan.max_bots === -1 ? '∞' : plan.max_bots}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">ריצות/חודש</span>
                      <span className="font-medium">{plan.max_bot_runs_per_month === -1 ? '∞' : plan.max_bot_runs_per_month}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">אנשי קשר</span>
                      <span className="font-medium">{plan.max_contacts === -1 ? '∞' : plan.max_contacts}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">סטטיסטיקות</span>
                      {plan.allow_statistics ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">WAHA מנוהל</span>
                      {plan.allow_waha_creation ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">גישת API</span>
                      {plan.allow_api_access ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Subscriptions Tab */
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חפש לפי שם או מייל..."
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
              />
            </div>
            <Button onClick={() => setShowAssignModal(true)}>
              <Plus className="w-4 h-4 ml-2" />
              הקצה מנוי
            </Button>
          </div>

          {filteredSubscriptions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>אין מנויים פעילים</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">משתמש</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">תכנית</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">סטטוס</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">תוקף</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredSubscriptions.map(sub => (
                    <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-800 dark:text-white">{sub.user_name}</div>
                            <div className="text-xs text-gray-500">{sub.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{sub.plan_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          sub.status === 'active' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : sub.status === 'cancelled'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {sub.status === 'active' ? 'פעיל' : sub.status === 'cancelled' ? 'מבוטל' : sub.status}
                        </span>
                        {sub.is_manual && (
                          <span className="mr-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">ידני</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {sub.expires_at ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(sub.expires_at).toLocaleDateString('he-IL')}
                          </div>
                        ) : (
                          <span className="text-gray-400">ללא הגבלה</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {sub.status === 'active' && (
                          <button
                            onClick={() => handleCancelSubscription(sub.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            בטל מנוי
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <PlanEditModal
          plan={editingPlan}
          onSave={handleSavePlan}
          onClose={() => setEditingPlan(null)}
        />
      )}

      {/* Assign Subscription Modal */}
      {showAssignModal && (
        <AssignSubscriptionModal
          plans={plans}
          onAssign={() => { setShowAssignModal(false); loadData(); }}
          onClose={() => setShowAssignModal(false)}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDeletePlan}
        title="מחיקת תכנית"
        message="האם למחוק את התכנית? לא ניתן לשחזר פעולה זו."
        confirmText="מחק"
        variant="danger"
      />
    </div>
  );
}

function PlanEditModal({ plan, onSave, onClose }) {
  const [form, setForm] = useState({
    name: plan.name || '',
    name_he: plan.name_he || '',
    description_he: plan.description_he || '',
    price: plan.price || 0,
    billing_period: plan.billing_period || 'monthly',
    max_bots: plan.max_bots ?? 1,
    max_bot_runs_per_month: plan.max_bot_runs_per_month ?? 500,
    max_contacts: plan.max_contacts ?? 100,
    allow_statistics: plan.allow_statistics || false,
    allow_waha_creation: plan.allow_waha_creation || false,
    allow_export: plan.allow_export || false,
    allow_api_access: plan.allow_api_access || false,
    is_active: plan.is_active ?? true,
    sort_order: plan.sort_order || 0,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...plan, ...form });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            {plan.id ? 'עריכת תכנית' : 'תכנית חדשה'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם (אנגלית)</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם (עברית)</label>
              <input
                type="text"
                value={form.name_he}
                onChange={e => setForm({...form, name_he: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
            <textarea
              value={form.description_he}
              onChange={e => setForm({...form, description_he: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מחיר (₪)</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm({...form, price: parseFloat(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תקופת חיוב</label>
              <select
                value={form.billing_period}
                onChange={e => setForm({...form, billing_period: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                <option value="monthly">חודשי</option>
                <option value="yearly">שנתי</option>
                <option value="one_time">חד פעמי</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מקס בוטים</label>
              <input
                type="number"
                value={form.max_bots}
                onChange={e => setForm({...form, max_bots: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                min="-1"
              />
              <span className="text-xs text-gray-500">-1 = ללא הגבלה</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ריצות/חודש</label>
              <input
                type="number"
                value={form.max_bot_runs_per_month}
                onChange={e => setForm({...form, max_bot_runs_per_month: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                min="-1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מקס אנשי קשר</label>
              <input
                type="number"
                value={form.max_contacts}
                onChange={e => setForm({...form, max_contacts: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                min="-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_statistics}
                onChange={e => setForm({...form, allow_statistics: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">גישה לסטטיסטיקות</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_waha_creation}
                onChange={e => setForm({...form, allow_waha_creation: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">יצירת WAHA מנוהל</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_export}
                onChange={e => setForm({...form, allow_export: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">ייצוא ושכפול בוטים</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_api_access}
                onChange={e => setForm({...form, allow_api_access: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">גישת API (יצירת מפתחות)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({...form, is_active: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">תכנית פעילה</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              ביטול
            </Button>
            <Button type="submit" className="flex-1">
              שמור
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignSubscriptionModal({ plans, onAssign, onClose }) {
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');

  const searchUser = async () => {
    if (!email) return;
    try {
      const { data } = await api.get(`/admin/users?search=${email}`);
      if (data.users?.length > 0) {
        setUserId(data.users[0].id);
        setError('');
      } else {
        setError('משתמש לא נמצא');
        setUserId('');
      }
    } catch (err) {
      setError('שגיאה בחיפוש');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !planId) return;

    setLoading(true);
    try {
      await api.post('/subscriptions/assign', {
        userId,
        planId,
        expiresAt: expiresAt || null,
        adminNotes: notes || null,
      });
      onAssign();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהקצאה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">הקצאת מנוי למשתמש</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מייל משתמש</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                placeholder="user@example.com"
                dir="ltr"
              />
              <Button type="button" variant="ghost" onClick={searchUser}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {userId && <p className="text-xs text-green-600 mt-1">נמצא משתמש ✓</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תכנית</label>
            <select
              value={planId}
              onChange={e => setPlanId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              required
            >
              <option value="">בחר תכנית...</option>
              {plans.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.name_he} - ₪{p.price}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תוקף עד (אופציונלי)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות אדמין</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              ביטול
            </Button>
            <Button type="submit" disabled={loading || !userId || !planId} className="flex-1">
              {loading ? 'שומר...' : 'הקצה מנוי'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
