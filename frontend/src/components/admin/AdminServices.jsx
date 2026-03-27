import { useState, useEffect } from 'react';
import { 
  Package, Plus, Edit2, Trash2, Check, X, RefreshCw, 
  ExternalLink, Users, Clock, Gift, Eye, EyeOff,
  Sparkles, DollarSign, Calendar, Search, User
} from 'lucide-react';
import api from '../../services/api';
import { toast } from '../../store/toastStore';
import Button from '../atoms/Button';
import ConfirmModal from '../organisms/ConfirmModal';

const SERVICE_ICONS = {
  'webhook': '🔗',
  'forms': '📝',
  'crm': '👥',
  'analytics': '📊',
  'sms': '📱',
  'email': '📧',
  'ai': '🤖',
  'default': '⚡',
};

export default function AdminServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState(null);
  const [viewingSubscriptions, setViewingSubscriptions] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [grantingTrial, setGrantingTrial] = useState(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/services/admin/all');
      setServices(data.services || []);
    } catch (err) {
      console.error('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveService = async (service) => {
    try {
      if (service.id) {
        await api.put(`/services/admin/${service.id}`, service);
      } else {
        await api.post('/services/admin', service);
      }
      setEditingService(null);
      loadServices();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בשמירה');
    }
  };

  const handleDeleteService = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/services/admin/${confirmDelete}`);
      setConfirmDelete(null);
      loadServices();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleGrantTrial = async (data) => {
    try {
      await api.post(`/services/admin/${grantingTrial.serviceId}/trial`, data);
      setGrantingTrial(null);
      toast.success('תקופת ניסיון הוקצתה בהצלחה');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בהקצאת תקופת ניסיון');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-teal-600" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">ניהול שירותים נוספים</h2>
        </div>
        
        <div className="flex gap-2">
          <Button variant="ghost" onClick={loadServices} className="!p-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setEditingService({})}>
            <Plus className="w-4 h-4 ml-2" />
            שירות חדש
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : services.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין שירותים</p>
          <p className="text-sm mt-2">צור שירות ראשון כדי להתחיל</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map(service => (
            <ServiceCard
              key={service.id}
              service={service}
              onEdit={() => setEditingService(service)}
              onDelete={() => setConfirmDelete(service.id)}
              onViewSubscriptions={() => setViewingSubscriptions(service)}
              onGrantTrial={() => setGrantingTrial({ serviceId: service.id, serviceName: service.name_he })}
            />
          ))}
        </div>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <ServiceEditModal
          service={editingService}
          onSave={handleSaveService}
          onClose={() => setEditingService(null)}
        />
      )}

      {/* Subscriptions Modal */}
      {viewingSubscriptions && (
        <SubscriptionsModal
          service={viewingSubscriptions}
          onClose={() => setViewingSubscriptions(null)}
        />
      )}

      {/* Grant Trial Modal */}
      {grantingTrial && (
        <GrantTrialModal
          serviceId={grantingTrial.serviceId}
          serviceName={grantingTrial.serviceName}
          onGrant={handleGrantTrial}
          onClose={() => setGrantingTrial(null)}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDeleteService}
        title="מחיקת שירות"
        message="האם למחוק את השירות? לא ניתן לשחזר פעולה זו."
        confirmText="מחק"
        variant="danger"
      />
    </div>
  );
}

function ServiceCard({ service, onEdit, onDelete, onViewSubscriptions, onGrantTrial }) {
  const icon = SERVICE_ICONS[service.icon] || SERVICE_ICONS.default;
  
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${
      !service.is_active ? 'opacity-50 border-gray-300' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
            service.color ? `bg-gradient-to-br ${service.color}` : 'bg-gradient-to-br from-teal-100 to-cyan-100'
          }`}>
            {icon}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 dark:text-white">{service.name_he}</h3>
            <p className="text-sm text-gray-500">{service.slug}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="ערוך"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="מחק"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {service.is_coming_soon && (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            בקרוב
          </span>
        )}
        {service.is_active ? (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
            <Eye className="w-3 h-3" />
            פעיל
          </span>
        ) : (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            לא פעיל
          </span>
        )}
        {service.trial_days > 0 && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
            <Gift className="w-3 h-3" />
            {service.trial_days} ימי ניסיון
          </span>
        )}
      </div>

      {/* Pricing */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-800 dark:text-white">₪{service.price}</span>
          <span className="text-sm text-gray-500">/חודש</span>
        </div>
        {service.yearly_price && (
          <p className="text-xs text-gray-500 mt-1">
            שנתי: ₪{service.yearly_price}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <button
          onClick={onViewSubscriptions}
          className="flex items-center gap-1 text-teal-600 hover:text-teal-700"
        >
          <Users className="w-4 h-4" />
          {service.active_subscriptions || 0} מנויים
        </button>
        
        <button
          onClick={onGrantTrial}
          className="flex items-center gap-1 text-purple-600 hover:text-purple-700"
        >
          <Gift className="w-4 h-4" />
          הקצה ניסיון
        </button>
      </div>

      {/* External URL */}
      {service.external_url && (
        <a
          href={service.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ExternalLink className="w-3 h-3" />
          {service.external_url}
        </a>
      )}
    </div>
  );
}

function ServiceEditModal({ service, onSave, onClose }) {
  const [form, setForm] = useState({
    slug: service.slug || '',
    name: service.name || '',
    name_he: service.name_he || '',
    description: service.description || '',
    description_he: service.description_he || '',
    price: service.price || 0,
    yearly_price: service.yearly_price || '',
    renewal_price: service.renewal_price || '',
    billing_period: service.billing_period || 'monthly',
    trial_days: service.trial_days || 0,
    allow_custom_trial: service.allow_custom_trial !== false,
    icon: service.icon || '',
    color: service.color || '',
    external_url: service.external_url || '',
    features: service.features || {},
    is_active: service.is_active !== false,
    is_coming_soon: service.is_coming_soon || false,
    sort_order: service.sort_order || 0,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.slug || !form.name || !form.name_he) {
      toast.warning('נדרש slug, שם ושם בעברית');
      return;
    }
    onSave({ ...service, ...form });
  };

  const colorOptions = [
    { value: '', label: 'ברירת מחדל' },
    { value: 'from-teal-500 to-cyan-600', label: 'טורקיז' },
    { value: 'from-purple-500 to-pink-600', label: 'סגול-ורוד' },
    { value: 'from-blue-500 to-indigo-600', label: 'כחול' },
    { value: 'from-green-500 to-emerald-600', label: 'ירוק' },
    { value: 'from-orange-500 to-red-600', label: 'כתום-אדום' },
    { value: 'from-amber-500 to-yellow-600', label: 'צהוב' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-600" />
            {service.id ? 'עריכת שירות' : 'שירות חדש'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                placeholder="webhook-engine"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סדר תצוגה
              </label>
              <input
                type="number"
                value={form.sort_order}
                onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                min="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                שם (אנגלית) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                שם (עברית) <span className="text-red-500">*</span>
              </label>
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

          {/* Pricing */}
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-teal-800 dark:text-teal-300 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              תמחור
            </h4>
            {/* Billing period selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג חיוב</label>
              <select
                value={form.billing_period}
                onChange={e => setForm({...form, billing_period: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                <option value="monthly">חודשי</option>
                <option value="yearly">שנתי</option>
                <option value="one_time">חד-פעמי (קמפיין)</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {form.billing_period === 'one_time' ? 'מחיר לקמפיין (₪)' : 'מחיר חודשי (₪)'}
                </label>
                <input
                  type="number"
                  value={form.price}
                  onChange={e => setForm({...form, price: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                  min="0"
                  step="0.01"
                />
              </div>
              {form.billing_period === 'one_time' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מחיר חידוש (₪)</label>
                  <input
                    type="number"
                    value={form.renewal_price}
                    onChange={e => setForm({...form, renewal_price: e.target.value ? parseFloat(e.target.value) : ''})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    min="0"
                    step="0.01"
                    placeholder="ריק = כמו מחיר רגיל"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מחיר שנתי (₪)</label>
                  <input
                    type="number"
                    value={form.yearly_price}
                    onChange={e => setForm({...form, yearly_price: e.target.value ? parseFloat(e.target.value) : ''})}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    min="0"
                    step="0.01"
                    placeholder={`${form.price * 10} (20% off)`}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ימי ניסיון</label>
                <input
                  type="number"
                  value={form.trial_days}
                  onChange={e => setForm({...form, trial_days: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Display */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אייקון</label>
              <select
                value={form.icon}
                onChange={e => setForm({...form, icon: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                <option value="">ברירת מחדל</option>
                <option value="webhook">🔗 Webhook</option>
                <option value="forms">📝 טפסים</option>
                <option value="crm">👥 CRM</option>
                <option value="analytics">📊 אנליטיקס</option>
                <option value="sms">📱 SMS</option>
                <option value="email">📧 אימייל</option>
                <option value="ai">🤖 AI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">צבע</label>
              <select
                value={form.color}
                onChange={e => setForm({...form, color: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                {colorOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כתובת חיצונית</label>
            <input
              type="url"
              value={form.external_url}
              onChange={e => setForm({...form, external_url: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              placeholder="https://service.botomat.co.il"
              dir="ltr"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({...form, is_active: e.target.checked})}
                className="w-4 h-4 rounded text-teal-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">שירות פעיל</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_coming_soon}
                onChange={e => setForm({...form, is_coming_soon: e.target.checked})}
                className="w-4 h-4 rounded text-teal-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">בקרוב (Coming Soon)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_custom_trial}
                onChange={e => setForm({...form, allow_custom_trial: e.target.checked})}
                className="w-4 h-4 rounded text-teal-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">אפשר הקצאת ניסיון מותאם</span>
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

function SubscriptionsModal({ service, onClose }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscriptions();
  }, [service.id]);

  const loadSubscriptions = async () => {
    try {
      const { data } = await api.get(`/services/admin/${service.id}/subscriptions`);
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  const cancelSubscription = async (userId) => {
    if (!confirm('האם לבטל את המנוי?')) return;
    try {
      await api.post(`/services/admin/${service.id}/cancel/${userId}`);
      loadSubscriptions();
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בביטול');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            מנויים - {service.name_he}
          </h3>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">טוען...</div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">אין מנויים לשירות זה</div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{sub.user_name || sub.email}</p>
                    <p className="text-sm text-gray-500">{sub.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        sub.status === 'active' ? 'bg-green-100 text-green-700' :
                        sub.status === 'trial' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {sub.status === 'active' ? 'פעיל' : sub.status === 'trial' ? 'ניסיון' : sub.status}
                      </span>
                      {sub.is_trial && sub.trial_ends_at && (
                        <span className="text-xs text-gray-500">
                          עד {new Date(sub.trial_ends_at).toLocaleDateString('he-IL')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {sub.status !== 'cancelled' && (
                      <button
                        onClick={() => cancelSubscription(sub.user_id)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        בטל
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <Button variant="ghost" onClick={onClose} className="w-full">
            סגור
          </Button>
        </div>
      </div>
    </div>
  );
}

function GrantTrialModal({ serviceId, serviceName, onGrant, onClose }) {
  const [email, setEmail] = useState('');
  const [trialDays, setTrialDays] = useState(14);
  const [reason, setReason] = useState('');
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchUser = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/admin/users?search=${email}`);
      if (data.users?.length > 0) {
        setUserId(data.users[0].id);
      } else {
        setError('משתמש לא נמצא');
        setUserId(null);
      }
    } catch (err) {
      setError('שגיאה בחיפוש');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userId) {
      setError('נא לחפש ולבחור משתמש');
      return;
    }
    onGrant({ userId, trialDays, reason });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-600" />
            הקצאת תקופת ניסיון - {serviceName}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מייל משתמש</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setUserId(null); }}
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                placeholder="user@example.com"
                dir="ltr"
              />
              <Button type="button" variant="ghost" onClick={searchUser} disabled={loading}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {userId && <p className="text-xs text-green-600 mt-1">נמצא משתמש ✓</p>}
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ימי ניסיון</label>
            <input
              type="number"
              value={trialDays}
              onChange={e => setTrialDays(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              min="1"
              max="365"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סיבה (אופציונלי)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              rows={2}
              placeholder="למה מוקצה ניסיון מיוחד?"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              ביטול
            </Button>
            <Button type="submit" disabled={!userId} className="flex-1">
              הקצה ניסיון
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
