import { useState, useEffect } from 'react';
import { Users, Bot, MessageSquare, Smartphone, TrendingUp, Clock } from 'lucide-react';
import api from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען נתונים...</div>;
  }

  if (!stats) {
    return <div className="text-center py-8 text-gray-500">לא ניתן לטעון נתונים</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">סקירה כללית</h2>
      
      {/* Main Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          label="סה״כ משתמשים" 
          value={stats.total_users} 
          color="blue" 
        />
        <StatCard 
          icon={Users} 
          label="משתמשים פעילים" 
          value={stats.active_users} 
          color="green" 
        />
        <StatCard 
          icon={TrendingUp} 
          label="חדשים השבוע" 
          value={stats.new_users_week} 
          color="purple" 
        />
        <StatCard 
          icon={Smartphone} 
          label="חיבורי WhatsApp" 
          value={stats.connected_whatsapp} 
          color="teal" 
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard 
          icon={Bot} 
          label="סה״כ בוטים" 
          value={stats.total_bots} 
          color="orange" 
        />
        <StatCard 
          icon={Bot} 
          label="בוטים פעילים" 
          value={stats.active_bots} 
          color="green" 
        />
        <StatCard 
          icon={Users} 
          label="אנשי קשר" 
          value={stats.total_contacts} 
          color="blue" 
        />
        <StatCard 
          icon={MessageSquare} 
          label="הודעות היום" 
          value={stats.messages_today} 
          color="purple" 
        />
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-medium text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            פעילות אחרונה
          </h3>
          <div className="text-sm text-gray-500">
            בקרוב - גרפים ופעילות אחרונה
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-medium text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            מגמות
          </h3>
          <div className="text-sm text-gray-500">
            בקרוב - גרפים וסטטיסטיקות
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    red: 'bg-red-50 text-red-600 border-red-100',
  };

  const iconColors = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500',
    teal: 'text-teal-500',
    red: 'text-red-500',
  };

  return (
    <div className={`bg-white rounded-xl border p-4 ${colors[color]?.split(' ')[2] || 'border-gray-200'}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]?.split(' ').slice(0, 2).join(' ')}`}>
          <Icon className={`w-5 h-5 ${iconColors[color]}`} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${iconColors[color]}`}>
        {value?.toLocaleString() || 0}
      </div>
    </div>
  );
}
