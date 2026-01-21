import { useState, useEffect } from 'react';
import { UserCog, Plus, Trash2, Shield, Eye, Edit, Users, BarChart3, X, Check, Mail } from 'lucide-react';
import api from '../../services/api';

const PERMISSIONS = [
  { key: 'can_view_bots', label: 'צפייה בבוטים', icon: Eye },
  { key: 'can_edit_bots', label: 'עריכת בוטים', icon: Edit },
  { key: 'can_manage_contacts', label: 'ניהול אנשי קשר', icon: Users },
  { key: 'can_view_analytics', label: 'צפייה בסטטיסטיקות', icon: BarChart3 },
];

export default function ExpertAccessManager() {
  const [experts, setExperts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState({
    can_view_bots: true,
    can_edit_bots: true,
    can_manage_contacts: true,
    can_view_analytics: true,
  });
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadExperts();
  }, []);

  const loadExperts = async () => {
    try {
      const { data } = await api.get('/experts/my-experts');
      setExperts(data.experts || []);
    } catch (err) {
      console.error('Failed to load experts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setInviting(true);
    setMessage(null);
    
    try {
      const { data } = await api.post('/experts/invite', { email: email.trim(), permissions });
      setMessage({ type: 'success', text: data.message });
      setEmail('');
      setShowInvite(false);
      loadExperts();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה בהוספת מומחה' });
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (expertId) => {
    if (!confirm('האם להסיר את הגישה של מומחה זה?')) return;
    
    try {
      await api.delete(`/experts/expert/${expertId}`);
      loadExperts();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהסרה');
    }
  };

  const handleUpdatePermission = async (expertId, key, value) => {
    try {
      await api.put(`/experts/expert/${expertId}/permissions`, {
        permissions: { [key]: value }
      });
      setExperts(prev => prev.map(e => 
        e.expert_id === expertId ? { ...e, [key]: value } : e
      ));
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-xl">
            <UserCog className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">גישת מומחים</h2>
            <p className="text-sm text-gray-500">אפשר למישהו לנהל את הבוטים שלך</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          הוסף מומחה
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800">הוספת מומחה</h3>
              <button onClick={() => setShowInvite(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כתובת מייל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="הזן מייל של המומחה..."
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                    dir="ltr"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">המומחה חייב להיות רשום במערכת</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">הרשאות</label>
                <div className="space-y-2">
                  {PERMISSIONS.map(perm => (
                    <label key={perm.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={permissions[perm.key]}
                        onChange={(e) => setPermissions(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                        className="w-4 h-4 rounded text-purple-600"
                      />
                      <perm.icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={inviting || !email.trim()}
                  className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 disabled:opacity-50"
                >
                  {inviting ? 'מוסיף...' : 'הוסף מומחה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Experts List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">טוען...</div>
      ) : experts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium text-gray-600 mb-1">אין מומחים עם גישה</p>
          <p className="text-sm">הוסף מומחה שיעזור לך לנהל את הבוטים</p>
        </div>
      ) : (
        <div className="space-y-3">
          {experts.filter(e => e.is_active).map(expert => (
            <div key={expert.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="font-medium text-purple-700">
                      {(expert.expert_name || expert.expert_email)[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">
                      {expert.expert_name || 'מומחה'}
                    </div>
                    <div className="text-sm text-gray-500">{expert.expert_email}</div>
                  </div>
                </div>
                
                <button
                  onClick={() => handleRemove(expert.expert_id)}
                  className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                  title="הסר גישה"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              {/* Permissions toggles */}
              <div className="grid grid-cols-2 gap-2">
                {PERMISSIONS.map(perm => (
                  <label 
                    key={perm.key} 
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={expert[perm.key]}
                      onChange={(e) => handleUpdatePermission(expert.expert_id, perm.key, e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-purple-600"
                    />
                    <span className="text-gray-600">{perm.label}</span>
                  </label>
                ))}
              </div>
              
              <div className="text-xs text-gray-400 mt-3">
                נוסף: {new Date(expert.approved_at || expert.created_at).toLocaleDateString('he-IL')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
