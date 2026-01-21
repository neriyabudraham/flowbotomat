import { useState, useEffect } from 'react';
import { 
  Package, Plus, Edit, Trash2, Check, X, Save,
  Users, Bot, MessageSquare, HardDrive, Infinity
} from 'lucide-react';
import api from '../../services/api';

const DEFAULT_PLANS = [
  {
    id: 'free',
    name: 'חינמי',
    description: 'לניסיון ראשוני',
    price: 0,
    color: 'gray',
    limits: {
      bots: 1,
      contacts: 50,
      messages_per_month: 500,
      media_mb: 100,
    }
  },
  {
    id: 'basic',
    name: 'בסיסי',
    description: 'לעסקים קטנים',
    price: 49,
    color: 'blue',
    limits: {
      bots: 3,
      contacts: 500,
      messages_per_month: 5000,
      media_mb: 500,
    }
  },
  {
    id: 'premium',
    name: 'פרימיום',
    description: 'לעסקים בינוניים',
    price: 149,
    color: 'purple',
    limits: {
      bots: 10,
      contacts: 5000,
      messages_per_month: 50000,
      media_mb: 2000,
    }
  },
  {
    id: 'enterprise',
    name: 'ארגוני',
    description: 'ללא מגבלות',
    price: 499,
    color: 'amber',
    limits: {
      bots: -1,
      contacts: -1,
      messages_per_month: -1,
      media_mb: -1,
    }
  },
];

export default function AdminPlans() {
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const { data } = await api.get('/admin/settings');
      if (data.settings?.plans?.value) {
        setPlans(data.settings.plans.value);
      }
    } catch (err) {
      console.error('Failed to load plans:', err);
    }
  };

  const savePlans = async (newPlans) => {
    setSaving(true);
    try {
      await api.put('/admin/settings/plans', { value: newPlans });
      setPlans(newPlans);
      setEditingPlan(null);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירת התוכניות');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePlan = (planId, updates) => {
    const newPlans = plans.map(p => 
      p.id === planId ? { ...p, ...updates } : p
    );
    savePlans(newPlans);
  };

  const colorStyles = {
    gray: 'border-gray-200 bg-gray-50',
    blue: 'border-blue-200 bg-blue-50',
    purple: 'border-purple-200 bg-purple-50',
    amber: 'border-amber-200 bg-amber-50',
    green: 'border-green-200 bg-green-50',
  };

  const colorBadges = {
    gray: 'bg-gray-200 text-gray-700',
    blue: 'bg-blue-200 text-blue-700',
    purple: 'bg-purple-200 text-purple-700',
    amber: 'bg-amber-200 text-amber-700',
    green: 'bg-green-200 text-green-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">תוכניות ומכסות</h2>
          <p className="text-sm text-gray-500">הגדר את התוכניות והמגבלות לכל רמת מנוי</p>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-4 gap-4">
        {plans.map(plan => (
          <div 
            key={plan.id} 
            className={`rounded-xl border-2 p-5 ${colorStyles[plan.color] || colorStyles.gray}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorBadges[plan.color]}`}>
                  {plan.name}
                </span>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
              </div>
              <button
                onClick={() => setEditingPlan(editingPlan === plan.id ? null : plan.id)}
                className="p-1.5 hover:bg-white/50 rounded"
              >
                <Edit className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Price */}
            <div className="mb-4">
              {editingPlan === plan.id ? (
                <input
                  type="number"
                  defaultValue={plan.price}
                  onBlur={(e) => handleUpdatePlan(plan.id, { price: Number(e.target.value) })}
                  className="w-24 px-2 py-1 border rounded text-xl font-bold"
                />
              ) : (
                <div className="text-2xl font-bold text-gray-800">
                  {plan.price === 0 ? 'חינם' : `₪${plan.price}`}
                  {plan.price > 0 && <span className="text-sm font-normal text-gray-500">/חודש</span>}
                </div>
              )}
            </div>

            {/* Limits */}
            <div className="space-y-2">
              <LimitRow
                icon={Bot}
                label="בוטים"
                value={plan.limits.bots}
                editing={editingPlan === plan.id}
                onChange={(v) => handleUpdatePlan(plan.id, { 
                  limits: { ...plan.limits, bots: Number(v) } 
                })}
              />
              <LimitRow
                icon={Users}
                label="אנשי קשר"
                value={plan.limits.contacts}
                editing={editingPlan === plan.id}
                onChange={(v) => handleUpdatePlan(plan.id, { 
                  limits: { ...plan.limits, contacts: Number(v) } 
                })}
              />
              <LimitRow
                icon={MessageSquare}
                label="הודעות/חודש"
                value={plan.limits.messages_per_month}
                editing={editingPlan === plan.id}
                onChange={(v) => handleUpdatePlan(plan.id, { 
                  limits: { ...plan.limits, messages_per_month: Number(v) } 
                })}
              />
              <LimitRow
                icon={HardDrive}
                label="מדיה (MB)"
                value={plan.limits.media_mb}
                editing={editingPlan === plan.id}
                onChange={(v) => handleUpdatePlan(plan.id, { 
                  limits: { ...plan.limits, media_mb: Number(v) } 
                })}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Usage Stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-medium text-gray-800 mb-4">התפלגות משתמשים לפי תוכנית</h3>
        <UsageStats plans={plans} />
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-700">
          <strong>טיפ:</strong> הזן -1 כדי להגדיר ללא מגבלה (אינסוף).
          שינויים נשמרים אוטומטית.
        </p>
      </div>
    </div>
  );
}

function LimitRow({ icon: Icon, label, value, editing, onChange }) {
  const displayValue = value === -1 ? '∞' : value.toLocaleString();
  
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-gray-600">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      {editing ? (
        <input
          type="number"
          defaultValue={value}
          onBlur={(e) => onChange(e.target.value)}
          className="w-20 px-2 py-0.5 border rounded text-left"
          placeholder="-1 = ∞"
        />
      ) : (
        <span className="font-medium text-gray-800">{displayValue}</span>
      )}
    </div>
  );
}

function UsageStats({ plans }) {
  const [stats, setStats] = useState({});
  
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await api.get('/admin/stats');
      // This would need a new endpoint to get users per plan
      // For now, show placeholder
      setStats({
        free: data.stats?.total_users || 0,
        basic: 0,
        premium: 0,
        enterprise: 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const total = Object.values(stats).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-3">
      {plans.map(plan => {
        const count = stats[plan.id] || 0;
        const percent = Math.round((count / total) * 100);
        
        return (
          <div key={plan.id} className="flex items-center gap-3">
            <div className="w-20 text-sm text-gray-600">{plan.name}</div>
            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${plan.color === 'gray' ? 'bg-gray-400' : `bg-${plan.color}-400`}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="w-16 text-sm text-gray-600 text-left">{count} ({percent}%)</div>
          </div>
        );
      })}
    </div>
  );
}
