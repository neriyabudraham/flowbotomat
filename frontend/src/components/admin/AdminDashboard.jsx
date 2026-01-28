import { useState, useEffect } from 'react';
import { 
  Users, Bot, MessageSquare, Smartphone, TrendingUp, Clock, 
  CreditCard, Activity, BarChart3, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, Crown, Zap
} from 'lucide-react';
import api from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [subscriptionStats, setSubscriptionStats] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, subsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/subscriptions/all').catch(() => ({ data: { subscriptions: [] } })),
        api.get('/admin/users?limit=5&sort=created_at&order=desc').catch(() => ({ data: { users: [] } }))
      ]);
      
      setStats(statsRes.data.stats);
      setRecentUsers(usersRes.data.users || []);
      
      // Calculate subscription stats
      const subs = subsRes.data.subscriptions || [];
      setSubscriptionStats({
        total: subs.length,
        active: subs.filter(s => s.status === 'active' && !s.is_manual).length,
        manual: subs.filter(s => s.is_manual).length,
        trial: subs.filter(s => s.status === 'trial' || s.is_trial).length,
        cancelled: subs.filter(s => s.status === 'cancelled').length,
        withPayment: subs.filter(s => s.has_payment_method).length,
        withStandingOrder: subs.filter(s => s.sumit_standing_order_id).length,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-8 text-gray-500">לא ניתן לטעון נתונים</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-800">סקירה כללית</h2>
        </div>
        <button 
          onClick={loadData}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="רענון"
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          label="סה״כ משתמשים" 
          value={stats.total_users} 
          color="blue"
          subtitle={`${stats.active_users} פעילים`}
        />
        <StatCard 
          icon={TrendingUp} 
          label="חדשים השבוע" 
          value={stats.new_users_week} 
          color="green"
          trend={stats.new_users_week > 0 ? 'up' : null}
        />
        <StatCard 
          icon={Bot} 
          label="סה״כ בוטים" 
          value={stats.total_bots} 
          color="orange"
          subtitle={`${stats.active_bots} פעילים`}
        />
        <StatCard 
          icon={Smartphone} 
          label="חיבורי WhatsApp" 
          value={stats.connected_whatsapp} 
          color="teal"
        />
      </div>

      {/* Subscription Stats */}
      {subscriptionStats && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
            סטטיסטיקת מנויים
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <MiniStat 
              label="סה״כ" 
              value={subscriptionStats.total} 
              icon={Users}
              color="gray"
            />
            <MiniStat 
              label="משלמים" 
              value={subscriptionStats.active} 
              icon={CheckCircle}
              color="green"
            />
            <MiniStat 
              label="ידניים" 
              value={subscriptionStats.manual} 
              icon={Crown}
              color="purple"
            />
            <MiniStat 
              label="ניסיון" 
              value={subscriptionStats.trial} 
              icon={Zap}
              color="cyan"
            />
            <MiniStat 
              label="מבוטלים" 
              value={subscriptionStats.cancelled} 
              icon={XCircle}
              color="orange"
            />
            <MiniStat 
              label="עם כרטיס" 
              value={subscriptionStats.withPayment} 
              icon={CreditCard}
              color="blue"
            />
            <MiniStat 
              label="הוראת קבע" 
              value={subscriptionStats.withStandingOrder} 
              icon={Activity}
              color="green"
            />
          </div>
        </div>
      )}

      {/* Activity Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          icon={MessageSquare} 
          label="הודעות היום" 
          value={stats.messages_today} 
          color="purple"
          large
        />
        <StatCard 
          icon={Users} 
          label="סה״כ אנשי קשר" 
          value={stats.total_contacts} 
          color="blue"
          large
        />
        <StatCard 
          icon={MessageSquare} 
          label="סה״כ הודעות" 
          value={stats.total_messages} 
          color="teal"
          large
        />
      </div>

      {/* Recent Users & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              משתמשים אחרונים
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {recentUsers.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">אין משתמשים</div>
            ) : (
              recentUsers.map(user => (
                <div key={user.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                      user.subscription_status === 'active' ? 'bg-green-500' :
                      user.is_manual ? 'bg-purple-500' :
                      'bg-gray-400'
                    }`}>
                      {(user.name || user.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{user.name || 'ללא שם'}</div>
                      <div className="text-sm text-gray-500 truncate">{user.email}</div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(user.created_at).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-400" />
              סטטוס המערכת
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <StatusRow 
              label="משתמשים פעילים" 
              value={stats.active_users} 
              total={stats.total_users}
              color="green"
            />
            <StatusRow 
              label="בוטים פעילים" 
              value={stats.active_bots} 
              total={stats.total_bots}
              color="orange"
            />
            {subscriptionStats && (
              <>
                <StatusRow 
                  label="מנויים משלמים" 
                  value={subscriptionStats.active} 
                  total={subscriptionStats.total}
                  color="purple"
                />
                <StatusRow 
                  label="עם אמצעי תשלום" 
                  value={subscriptionStats.withPayment} 
                  total={subscriptionStats.total}
                  color="blue"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, subtitle, trend, large }) {
  const colors = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-100' },
  };

  const c = colors[color] || colors.gray;

  return (
    <div className={`bg-white rounded-xl border ${c.border} p-5 hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl ${c.bg}`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        {trend === 'up' && (
          <TrendingUp className="w-4 h-4 text-green-500 ml-auto" />
        )}
      </div>
      <div className={`${large ? 'text-3xl' : 'text-2xl'} font-bold ${c.text}`}>
        {value?.toLocaleString() || 0}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-400 mt-1">{subtitle}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }) {
  const colors = {
    green: 'text-green-600 bg-green-100',
    purple: 'text-purple-600 bg-purple-100',
    orange: 'text-orange-600 bg-orange-100',
    blue: 'text-blue-600 bg-blue-100',
    cyan: 'text-cyan-600 bg-cyan-100',
    gray: 'text-gray-600 bg-gray-100',
  };

  return (
    <div className="text-center">
      <div className={`w-10 h-10 rounded-full ${colors[color]} flex items-center justify-center mx-auto mb-2`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function StatusRow({ label, value, total, color }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  
  const colors = {
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    orange: 'bg-orange-500',
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value} / {total}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colors[color]} rounded-full transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
