import { useState, useEffect } from 'react';
import { 
  CreditCard, Users, Settings, Plus, Edit2, Trash2, Check, X, 
  Crown, Zap, Star, Building, RefreshCw, Search, Calendar, User,
  Gift, Tag, Percent, Clock, BarChart, Forward, ExternalLink, Eye,
  AlertCircle, ArrowLeftRight
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';
import ConfirmModal from '../organisms/ConfirmModal';
import useAuthStore from '../../store/authStore';

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
  const [promotions, setPromotions] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editingPromo, setEditingPromo] = useState(null);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeletePromo, setConfirmDeletePromo] = useState(null);
  const [confirmDeleteCoupon, setConfirmDeleteCoupon] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansRes, subsRes, promosRes, couponsRes] = await Promise.all([
        api.get('/subscriptions/plans'),
        api.get('/subscriptions/all'),
        api.get('/admin/promotions').catch(() => ({ data: { promotions: [] } })),
        api.get('/admin/coupons').catch(() => ({ data: { coupons: [] } })),
      ]);
      setPlans(plansRes.data.plans || []);
      setSubscriptions(subsRes.data.subscriptions || []);
      setPromotions(promosRes.data.promotions || []);
      setCoupons(couponsRes.data.coupons || []);
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

  const handleSavePromo = async (promo) => {
    try {
      if (promo.id) {
        await api.put(`/admin/promotions/${promo.id}`, promo);
      } else {
        await api.post('/admin/promotions', promo);
      }
      setEditingPromo(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    }
  };

  const handleDeletePromo = async () => {
    if (!confirmDeletePromo) return;
    try {
      await api.delete(`/admin/promotions/${confirmDeletePromo}`);
      setConfirmDeletePromo(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleSaveCoupon = async (coupon) => {
    try {
      if (coupon.id) {
        await api.put(`/admin/coupons/${coupon.id}`, coupon);
      } else {
        await api.post('/admin/coupons', coupon);
      }
      setEditingCoupon(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    }
  };

  const handleDeleteCoupon = async () => {
    if (!confirmDeleteCoupon) return;
    try {
      await api.delete(`/admin/coupons/${confirmDeleteCoupon}`);
      setConfirmDeleteCoupon(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const [cancelConfirm, setCancelConfirm] = useState(null);

  const handleCancelSubscription = (subId) => {
    setCancelConfirm(subId);
  };
  
  const confirmCancelSubscription = async () => {
    if (!cancelConfirm) return;
    try {
      await api.delete(`/subscriptions/${cancelConfirm}`);
      setCancelConfirm(null);
      loadData();
    } catch (err) {
      console.error('Cancel error:', err);
      setCancelConfirm(null);
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
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'plans'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4 inline ml-2" />
          תכניות
        </button>
        <button
          onClick={() => setActiveTab('promotions')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'promotions'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Gift className="w-4 h-4 inline ml-2" />
          מבצעים
        </button>
        <button
          onClick={() => setActiveTab('coupons')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'coupons'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tag className="w-4 h-4 inline ml-2" />
          קופונים
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
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
      ) : activeTab === 'promotions' ? (
        /* Promotions Tab */
        <div className="space-y-4">
          <Button onClick={() => setEditingPromo({})}>
            <Plus className="w-4 h-4 ml-2" />
            מבצע חדש
          </Button>

          {promotions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>אין מבצעים פעילים</p>
              <p className="text-sm mt-2">צור מבצע ראשון להצעת מחירים מיוחדים ללקוחות חדשים</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {promotions.map(promo => (
                <div 
                  key={promo.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${
                    !promo.is_active ? 'opacity-50 border-gray-300' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg">
                        <Gift className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800 dark:text-white">{promo.name_he || promo.name}</h3>
                        {promo.coupon_code && (
                          <div className="flex items-center gap-1 mt-1">
                            <Tag className="w-3 h-3 text-purple-500" />
                            <code className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{promo.coupon_code}</code>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingPromo(promo)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDeletePromo(promo.id)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-3 mb-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-purple-600">
                        {promo.discount_type === 'percentage' 
                          ? `${promo.discount_value}%` 
                          : `₪${promo.discount_value}`}
                      </span>
                      <span className="text-sm text-gray-500">הנחה</span>
                      <span className="text-sm text-gray-400 mx-2">ל-</span>
                      <span className="text-lg font-semibold text-purple-600">{promo.promo_months} חודשים</span>
                    </div>
                    {promo.coupon_owner_name && (
                      <p className="text-xs text-blue-600 mt-1">
                        בעל קופון: {promo.coupon_owner_name}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">תכנית</span>
                      <span className="font-medium">{promo.plan_name_he || 'כל התכניות'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">קהל יעד</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        promo.is_new_users_only 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {promo.is_new_users_only ? 'משתמשים חדשים' : 'כולם'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">שימושים</span>
                      <span className="font-medium">
                        {promo.current_uses || 0}
                        {promo.max_uses ? ` / ${promo.max_uses}` : ''}
                      </span>
                    </div>
                    {(promo.start_date || promo.end_date) && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">תוקף</span>
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {promo.start_date && new Date(promo.start_date).toLocaleDateString('he-IL')}
                          {promo.start_date && promo.end_date && ' - '}
                          {promo.end_date && new Date(promo.end_date).toLocaleDateString('he-IL')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">סטטוס</span>
                      {promo.is_active ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <Check className="w-3 h-3" /> פעיל
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400">
                          <X className="w-3 h-3" /> לא פעיל
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'coupons' ? (
        /* Coupons Tab */
        <div className="space-y-4">
          <Button onClick={() => setEditingCoupon({})}>
            <Plus className="w-4 h-4 ml-2" />
            קופון חדש
          </Button>

          {coupons.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>אין קופונים</p>
              <p className="text-sm mt-2">צור קוד קופון להנחות מיוחדות</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">קוד</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">הנחה</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">משך</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">שימושים</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">סטטוס</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {coupons.map(coupon => (
                    <tr key={coupon.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <code className="bg-purple-100 text-purple-700 px-2 py-1 rounded font-mono text-sm">{coupon.code}</code>
                        {coupon.name && <p className="text-xs text-gray-500 mt-1">{coupon.name}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `₪${coupon.discount_value}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {coupon.duration_type === 'forever' ? 'לכל החיים' : 
                         coupon.duration_type === 'months' ? `${coupon.duration_months} חודשים` : 
                         'חד פעמי'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {coupon.times_used || 0}
                        {coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {coupon.is_active ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">פעיל</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">לא פעיל</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingCoupon(coupon)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <Edit2 className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCoupon(coupon.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
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
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">העברת הודעות</span>
                      {plan.allow_group_forwards ? (
                        <span className="text-xs text-green-600">
                          {plan.max_group_forwards === -1 ? '∞' : plan.max_group_forwards} / 
                          {plan.max_forward_targets === -1 ? '∞' : plan.max_forward_targets}
                        </span>
                      ) : (
                        <X className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Subscriptions Tab */
        <SubscriptionsTab 
          subscriptions={filteredSubscriptions}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onShowAssignModal={() => setShowAssignModal(true)}
          onCancelSubscription={handleCancelSubscription}
          onRefresh={loadData}
        />
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

      {/* Confirm Delete Plan Modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDeletePlan}
        title="מחיקת תכנית"
        message="האם למחוק את התכנית? לא ניתן לשחזר פעולה זו."
        confirmText="מחק"
        variant="danger"
      />

      {/* Edit Promotion Modal */}
      {editingPromo && (
        <PromoEditModal
          promo={editingPromo}
          plans={plans}
          onSave={handleSavePromo}
          onClose={() => setEditingPromo(null)}
        />
      )}

      {/* Confirm Delete Promotion Modal */}
      <ConfirmModal
        isOpen={!!confirmDeletePromo}
        onClose={() => setConfirmDeletePromo(null)}
        onConfirm={handleDeletePromo}
        title="מחיקת מבצע"
        message="האם למחוק את המבצע? לא ניתן לשחזר פעולה זו."
        confirmText="מחק"
        variant="danger"
      />

      {/* Edit Coupon Modal */}
      {editingCoupon && (
        <CouponEditModal
          coupon={editingCoupon}
          plans={plans}
          onSave={handleSaveCoupon}
          onClose={() => setEditingCoupon(null)}
        />
      )}

      {/* Confirm Delete Coupon Modal */}
      <ConfirmModal
        isOpen={!!confirmDeleteCoupon}
        onClose={() => setConfirmDeleteCoupon(null)}
        onConfirm={handleDeleteCoupon}
        title="מחיקת קופון"
        message="האם למחוק את הקופון? לא ניתן לשחזר פעולה זו."
        confirmText="מחק"
        variant="danger"
      />

      {/* Confirm Cancel Subscription Modal */}
      <ConfirmModal
        isOpen={!!cancelConfirm}
        onClose={() => setCancelConfirm(null)}
        onConfirm={confirmCancelSubscription}
        title="ביטול מנוי"
        message="האם לבטל את המנוי?"
        confirmText="בטל מנוי"
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
    allow_group_forwards: plan.allow_group_forwards || false,
    max_group_forwards: plan.max_group_forwards ?? 0,
    max_forward_targets: plan.max_forward_targets ?? 0,
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

          {/* Group Forwards Settings */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h4 className="font-medium text-gray-800 dark:text-white mb-3 flex items-center gap-2">
              <Forward className="w-4 h-4 text-purple-600" />
              העברת הודעות לקבוצות
            </h4>
            
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={form.allow_group_forwards}
                onChange={e => setForm({...form, allow_group_forwards: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">אפשר העברת הודעות לקבוצות</span>
            </label>
            
            {form.allow_group_forwards && (
              <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מקס העברות</label>
                  <input
                    type="number"
                    value={form.max_group_forwards}
                    onChange={e => setForm({...form, max_group_forwards: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    min="-1"
                  />
                  <span className="text-xs text-gray-500">-1 = ללא הגבלה</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מקס קבוצות יעד</label>
                  <input
                    type="number"
                    value={form.max_forward_targets}
                    onChange={e => setForm({...form, max_forward_targets: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    min="-1"
                  />
                  <span className="text-xs text-gray-500">-1 = ללא הגבלה</span>
                </div>
              </div>
            )}
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

function PromoEditModal({ promo, plans, onSave, onClose }) {
  const [form, setForm] = useState({
    name: promo.name || '',
    description: promo.description || '',
    plan_id: promo.plan_id || '',
    discount_type: promo.discount_type || 'fixed',
    discount_value: promo.discount_value || 0,
    promo_months: promo.promo_months || 3,
    price_after_promo: promo.price_after_promo || '',
    price_after_discount_type: promo.price_after_discount_type || '',
    price_after_discount_value: promo.price_after_discount_value || '',
    is_new_users_only: promo.is_new_users_only ?? true,
    is_active: promo.is_active ?? true,
    start_date: promo.start_date ? promo.start_date.split('T')[0] : '',
    end_date: promo.end_date ? promo.end_date.split('T')[0] : '',
    coupon_code: promo.coupon_code || '',
    max_uses: promo.max_uses || '',
    coupon_owner_id: promo.coupon_owner_id || '',
  });
  
  const [users, setUsers] = useState([]);
  const [searchUser, setSearchUser] = useState('');

  // Search users for coupon owner
  const handleSearchUser = async () => {
    if (!searchUser) return;
    try {
      const { data } = await api.get(`/admin/users?search=${searchUser}`);
      setUsers(data.users || []);
    } catch (e) {}
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ 
      ...promo, 
      ...form,
      price_after_promo: form.price_after_promo || null,
      price_after_discount_type: form.price_after_discount_type || null,
      price_after_discount_value: form.price_after_discount_value || null,
      plan_id: form.plan_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      max_uses: form.max_uses || null,
      coupon_owner_id: form.coupon_owner_id || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-600" />
            {promo.id ? 'עריכת מבצע' : 'מבצע חדש'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם המבצע</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              placeholder="מבצע הצטרפות - 3 חודשים ראשונים"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
            <textarea
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              rows={2}
              placeholder="3 חודשים ראשונים במחיר מיוחד!"
            />
          </div>

          {/* Discount Settings */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-purple-800 dark:text-purple-300 flex items-center gap-2">
              <Percent className="w-4 h-4" />
              הגדרות הנחה
            </h4>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג הנחה</label>
                <select
                  value={form.discount_type}
                  onChange={e => setForm({...form, discount_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                >
                  <option value="fixed">₪ קבוע</option>
                  <option value="percentage">% אחוזים</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ערך ({form.discount_type === 'percentage' ? '%' : '₪'})
                </label>
                <input
                  type="number"
                  value={form.discount_value}
                  onChange={e => setForm({...form, discount_value: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                  min="0"
                  max={form.discount_type === 'percentage' ? 100 : undefined}
                  required
                />
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">חודשים</label>
                <input
                  type="number"
                  value={form.promo_months}
                  onChange={e => setForm({...form, promo_months: parseInt(e.target.value) || 1})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                  min="1"
                  required
                />
              </div>
            </div>

            {/* Price after promo */}
            <div className="border-t border-purple-200 dark:border-purple-700 pt-3 mt-3">
              <p className="text-sm text-purple-600 dark:text-purple-400 mb-2">
                מחיר אחרי תקופת המבצע (ריק = מחיר רגיל של התכנית)
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <select
                    value={form.price_after_discount_type}
                    onChange={e => setForm({...form, price_after_discount_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  >
                    <option value="">ללא הנחה</option>
                    <option value="fixed">₪ קבוע</option>
                    <option value="percentage">% אחוזים</option>
                  </select>
                </div>
                <div>
                  <input
                    type="number"
                    value={form.price_after_discount_value}
                    onChange={e => setForm({...form, price_after_discount_value: e.target.value ? parseFloat(e.target.value) : ''})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    placeholder="ערך"
                    disabled={!form.price_after_discount_type}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={form.price_after_promo}
                    onChange={e => setForm({...form, price_after_promo: e.target.value ? parseFloat(e.target.value) : ''})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    placeholder="או מחיר קבוע"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תכנית ספציפית</label>
              <select
                value={form.plan_id}
                onChange={e => setForm({...form, plan_id: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                <option value="">כל התכניות</option>
                {plans.filter(p => p.is_active && p.price > 0).map(p => (
                  <option key={p.id} value={p.id}>{p.name_he} - ₪{p.price}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קוד קופון</label>
              <input
                type="text"
                value={form.coupon_code}
                onChange={e => setForm({...form, coupon_code: e.target.value.toUpperCase()})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 uppercase"
                placeholder="WELCOME50"
                dir="ltr"
              />
            </div>
          </div>

          {/* Coupon Owner (for attribution) */}
          {form.coupon_code && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                <User className="w-4 h-4 inline ml-1" />
                בעל הקופון (לזיכוי עמלות)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  placeholder="חפש לפי מייל..."
                  dir="ltr"
                />
                <button type="button" onClick={handleSearchUser} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm">
                  חפש
                </button>
              </div>
              {users.length > 0 && (
                <select
                  value={form.coupon_owner_id}
                  onChange={e => setForm({...form, coupon_owner_id: e.target.value})}
                  className="w-full mt-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="">ללא בעלים</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              )}
              {form.coupon_owner_id && (
                <p className="text-xs text-blue-600 mt-1">משתמשים שישתמשו בקופון יזוכו לבעל הקופון</p>
              )}
            </div>
          )}

          {/* Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך התחלה</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({...form, start_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך סיום</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({...form, end_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              מקסימום שימושים
              <span className="text-gray-400 font-normal mr-1">(ריק = ללא הגבלה)</span>
            </label>
            <input
              type="number"
              value={form.max_uses}
              onChange={e => setForm({...form, max_uses: e.target.value ? parseInt(e.target.value) : ''})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              min="1"
              placeholder="100"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_new_users_only}
                onChange={e => setForm({...form, is_new_users_only: e.target.checked})}
                className="w-4 h-4 rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">רק למשתמשים חדשים (שטרם שילמו)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({...form, is_active: e.target.checked})}
                className="w-4 h-4 rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">מבצע פעיל</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              ביטול
            </Button>
            <Button type="submit" className="flex-1">
              שמור מבצע
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CouponEditModal({ coupon, plans, onSave, onClose }) {
  const [form, setForm] = useState({
    code: coupon.code || '',
    name: coupon.name || '',
    discount_type: coupon.discount_type || 'fixed',
    discount_value: coupon.discount_value || 0,
    duration_type: coupon.duration_type || 'once',
    duration_months: coupon.duration_months || '',
    plan_id: coupon.plan_id || '',
    max_uses: coupon.max_uses || '',
    max_uses_per_user: coupon.max_uses_per_user || 1,
    is_new_users_only: coupon.is_new_users_only || false,
    is_active: coupon.is_active ?? true,
    start_date: coupon.start_date ? coupon.start_date.split('T')[0] : '',
    end_date: coupon.end_date ? coupon.end_date.split('T')[0] : '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ 
      ...coupon, 
      ...form,
      duration_months: form.duration_type === 'months' ? form.duration_months : null,
      plan_id: form.plan_id || null,
      max_uses: form.max_uses || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-purple-600" />
            {coupon.id ? 'עריכת קופון' : 'קופון חדש'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Code */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קוד קופון</label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({...form, code: e.target.value.toUpperCase()})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 uppercase font-mono"
                placeholder="SAVE20"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם פנימי</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                placeholder="קמפיין פייסבוק ינואר"
              />
            </div>
          </div>

          {/* Discount */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-purple-800 dark:text-purple-300">הגדרות הנחה</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג הנחה</label>
                <select
                  value={form.discount_type}
                  onChange={e => setForm({...form, discount_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                >
                  <option value="fixed">₪ סכום קבוע</option>
                  <option value="percentage">% אחוזים</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ערך ({form.discount_type === 'percentage' ? '%' : '₪'})
                </label>
                <input
                  type="number"
                  value={form.discount_value}
                  onChange={e => setForm({...form, discount_value: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                  min="0"
                  max={form.discount_type === 'percentage' ? 100 : undefined}
                  required
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">משך ההנחה</label>
              <div className="flex gap-2">
                <select
                  value={form.duration_type}
                  onChange={e => setForm({...form, duration_type: e.target.value})}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                >
                  <option value="once">תשלום ראשון בלבד</option>
                  <option value="months">X חודשים</option>
                  <option value="forever">לכל החיים</option>
                </select>
                {form.duration_type === 'months' && (
                  <input
                    type="number"
                    value={form.duration_months}
                    onChange={e => setForm({...form, duration_months: parseInt(e.target.value) || ''})}
                    className="w-24 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    placeholder="3"
                    min="1"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תכנית ספציפית</label>
            <select
              value={form.plan_id}
              onChange={e => setForm({...form, plan_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
            >
              <option value="">כל התכניות</option>
              {plans.filter(p => p.is_active && p.price > 0).map(p => (
                <option key={p.id} value={p.id}>{p.name_he} - ₪{p.price}</option>
              ))}
            </select>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מקסימום שימושים</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={e => setForm({...form, max_uses: e.target.value ? parseInt(e.target.value) : ''})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                placeholder="ללא הגבלה"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מקסימום לכל משתמש</label>
              <input
                type="number"
                value={form.max_uses_per_user}
                onChange={e => setForm({...form, max_uses_per_user: parseInt(e.target.value) || 1})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                min="1"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך התחלה</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({...form, start_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך סיום</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({...form, end_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_new_users_only}
                onChange={e => setForm({...form, is_new_users_only: e.target.checked})}
                className="w-4 h-4 rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">רק למשתמשים חדשים</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({...form, is_active: e.target.checked})}
                className="w-4 h-4 rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">קופון פעיל</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              ביטול
            </Button>
            <Button type="submit" className="flex-1">
              שמור קופון
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Enhanced Subscriptions Tab with full details and account switching
function SubscriptionsTab({ subscriptions, searchTerm, setSearchTerm, onShowAssignModal, onCancelSubscription, onRefresh }) {
  const { setAccessToken } = useAuthStore();
  const [selectedSub, setSelectedSub] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSwitchToAccount = async (userId, userName) => {
    setConfirmModal({
      title: 'מעבר לחשבון',
      message: `לעבור לחשבון של ${userName}?`,
      onConfirm: async () => {
        setConfirmModal(null);
        setSwitching(userId);
        try {
          console.log('Attempting to switch to:', userId);
          
          // Store original token
          const currentToken = localStorage.getItem('accessToken');
          if (currentToken) {
            localStorage.setItem('originalAccessToken', currentToken);
          }
          
          // Get new token for viewing as this user
          const response = await api.post(`/experts/switch/${userId}`);
          console.log('Switch response status:', response.status);
          console.log('Switch response data:', response.data);
          
          const { data } = response;
          
          if (data && data.token) {
            console.log('Token received, setting...');
            setAccessToken(data.token);
            localStorage.setItem('accessToken', data.token);
            console.log('Redirecting to dashboard...');
            // Redirect to dashboard
            window.location.href = '/dashboard';
          } else {
            console.error('No token in response:', data);
            showToast('error', 'לא התקבל טוקן מהשרת');
            setSwitching(null);
          }
        } catch (err) {
          console.error('Switch error full:', err);
          console.error('Switch error response:', err.response);
          const errorMessage = err.response?.data?.error || err.message || 'שגיאה במעבר לחשבון';
          showToast('error', errorMessage);
          setSwitching(null);
        }
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg z-[60] flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? (
            <Check className="w-5 h-5" />
          ) : (
            <X className="w-5 h-5" />
          )}
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
              <Button variant="ghost" onClick={() => setConfirmModal(null)} className="flex-1">
                ביטול
              </Button>
              <Button onClick={confirmModal.onConfirm} className="flex-1">
                אישור
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Header with search and actions */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חפש לפי שם או מייל..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg ${viewMode === 'table' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
          >
            <BarChart className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-lg ${viewMode === 'cards' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
        
        <Button onClick={onShowAssignModal}>
          <Plus className="w-4 h-4 ml-2" />
          הקצה מנוי
        </Button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-700">{subscriptions.filter(s => s.status === 'active' && !s.is_manual).length}</div>
          <div className="text-sm text-green-600">מנויים משלמים</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
          <div className="text-2xl font-bold text-purple-700">{subscriptions.filter(s => s.is_manual).length}</div>
          <div className="text-sm text-purple-600">מנויים ידניים</div>
        </div>
        <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-4">
          <div className="text-2xl font-bold text-cyan-700">{subscriptions.filter(s => s.status === 'trial').length}</div>
          <div className="text-sm text-cyan-600">בתקופת ניסיון</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4">
          <div className="text-2xl font-bold text-orange-700">{subscriptions.filter(s => s.status === 'cancelled').length}</div>
          <div className="text-sm text-orange-600">מבוטלים</div>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין מנויים</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* Cards View */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map(sub => (
            <div 
              key={sub.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border p-4 hover:shadow-lg transition-shadow ${
                sub.status === 'cancelled' ? 'border-orange-200 bg-orange-50/50' :
                sub.is_manual ? 'border-purple-200' :
                sub.status === 'trial' ? 'border-cyan-200' :
                'border-gray-200'
              }`}
            >
              {/* User Info */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    sub.is_manual ? 'bg-purple-100' :
                    sub.status === 'active' ? 'bg-green-100' :
                    sub.status === 'trial' ? 'bg-cyan-100' :
                    'bg-orange-100'
                  }`}>
                    <User className={`w-5 h-5 ${
                      sub.is_manual ? 'text-purple-600' :
                      sub.status === 'active' ? 'text-green-600' :
                      sub.status === 'trial' ? 'text-cyan-600' :
                      'text-orange-600'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">{sub.user_name || 'ללא שם'}</h3>
                    <p className="text-xs text-gray-500">{sub.user_email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleSwitchToAccount(sub.user_id, sub.user_name)}
                  disabled={switching === sub.user_id}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="עבור לחשבון"
                >
                  {switching === sub.user_id ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                  ) : (
                    <ArrowLeftRight className="w-4 h-4 text-gray-500" />
                  )}
                </button>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                  sub.status === 'active' ? 'bg-green-100 text-green-700' :
                  sub.status === 'trial' ? 'bg-cyan-100 text-cyan-700' :
                  sub.status === 'cancelled' ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {sub.status === 'active' ? 'פעיל' : 
                   sub.status === 'trial' ? 'ניסיון' : 
                   sub.status === 'cancelled' ? 'מבוטל' : sub.status}
                </span>
                {sub.is_manual && (
                  <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">ידני</span>
                )}
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">{sub.plan_name || sub.plan_name_he}</span>
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">מחיר:</span>
                  <span className="font-medium">{sub.is_manual ? 'ידני' : sub.plan_price ? `₪${sub.plan_price}` : 'חינם'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">חיוב הבא:</span>
                  <span className={`font-medium ${!sub.next_charge_date && !sub.expires_at ? 'text-gray-400' : ''}`}>
                    {sub.next_charge_date 
                      ? new Date(sub.next_charge_date).toLocaleDateString('he-IL')
                      : sub.expires_at 
                        ? new Date(sub.expires_at).toLocaleDateString('he-IL')
                        : 'לא הוגדר'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">הוראת קבע:</span>
                  {sub.sumit_standing_order_id ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> פעיל
                    </span>
                  ) : (
                    <span className="text-gray-400 flex items-center gap-1">
                      <X className="w-3 h-3" /> אין
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">כרטיס:</span>
                  {sub.has_payment_method ? (
                    <span className="text-green-600">****{sub.card_last_digits || '????'}</span>
                  ) : (
                    <span className="text-gray-400">אין</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => handleSwitchToAccount(sub.user_id, sub.user_name)}
                  disabled={switching === sub.user_id}
                  className="flex-1 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors flex items-center justify-center gap-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  עבור לחשבון
                </button>
                {sub.status === 'active' && !sub.is_manual && (
                  <button
                    onClick={() => onCancelSubscription(sub.id)}
                    className="py-2 px-3 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    בטל
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">משתמש</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">תכנית</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">סטטוס</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">תשלום</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">חיוב הבא</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">הוראת קבע</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {subscriptions.map(sub => (
                <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        sub.is_manual ? 'bg-purple-100' :
                        sub.status === 'active' ? 'bg-green-100' :
                        'bg-gray-100'
                      }`}>
                        <User className={`w-4 h-4 ${
                          sub.is_manual ? 'text-purple-600' :
                          sub.status === 'active' ? 'text-green-600' :
                          'text-gray-600'
                        }`} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white">{sub.user_name || 'ללא שם'}</div>
                        <div className="text-xs text-gray-500">{sub.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">{sub.plan_name || sub.plan_name_he}</span>
                    {sub.plan_price > 0 && (
                      <div className="text-xs text-gray-500">₪{sub.plan_price}/חודש</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        sub.status === 'active' 
                          ? 'bg-green-100 text-green-700'
                          : sub.status === 'trial'
                          ? 'bg-cyan-100 text-cyan-700'
                          : sub.status === 'cancelled'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {sub.status === 'active' ? 'פעיל' : 
                         sub.status === 'trial' ? 'ניסיון' :
                         sub.status === 'cancelled' ? 'מבוטל' : sub.status}
                      </span>
                      {sub.is_manual && (
                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">ידני</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {sub.has_payment_method ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        ****{sub.card_last_digits || '????'}
                      </span>
                    ) : (
                      <span className="text-gray-400">אין כרטיס</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {sub.next_charge_date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(sub.next_charge_date).toLocaleDateString('he-IL')}
                      </div>
                    ) : sub.expires_at ? (
                      <div className="flex items-center gap-1 text-orange-600">
                        <AlertCircle className="w-3 h-3" />
                        {new Date(sub.expires_at).toLocaleDateString('he-IL')}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sub.sumit_standing_order_id ? (
                      <span className="text-green-600 flex items-center gap-1 text-xs">
                        <Check className="w-3 h-3" />
                        {sub.sumit_standing_order_id}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">אין</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSwitchToAccount(sub.user_id, sub.user_name)}
                        disabled={switching === sub.user_id}
                        className="p-1.5 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded text-purple-600"
                        title="עבור לחשבון"
                      >
                        {switching === sub.user_id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <ExternalLink className="w-4 h-4" />
                        )}
                      </button>
                      {sub.status === 'active' && !sub.is_manual && (
                        <button
                          onClick={() => onCancelSubscription(sub.id)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="בטל מנוי"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
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
