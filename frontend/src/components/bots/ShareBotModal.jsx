import { useState, useEffect } from 'react';
import { X, Users, Mail, Copy, Check, Trash2, UserPlus, Eye, Edit, Shield, Download } from 'lucide-react';
import api from '../../services/api';

const PERMISSIONS = [
  { id: 'view', label: 'צפייה בלבד', icon: Eye, color: 'text-gray-600' },
  { id: 'edit', label: 'עריכה', icon: Edit, color: 'text-blue-600' },
  { id: 'admin', label: 'מנהל', icon: Shield, color: 'text-purple-600' },
];

export default function ShareBotModal({ bot, onClose }) {
  const [shares, setShares] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('view');
  const [allowExport, setAllowExport] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadShares();
  }, [bot.id]);

  const loadShares = async () => {
    try {
      const { data } = await api.get(`/sharing/bot/${bot.id}`);
      setShares(data.shares || []);
      setInvitations(data.invitations || []);
    } catch (err) {
      console.error('Failed to load shares:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setSharing(true);
    setMessage(null);
    
    try {
      const { data } = await api.post(`/sharing/bot/${bot.id}`, { 
        email: email.trim(), 
        permission,
        allow_export: allowExport
      });
      setMessage({ type: 'success', text: data.message });
      setEmail('');
      setAllowExport(false);
      loadShares();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'שגיאה בשיתוף' });
    } finally {
      setSharing(false);
    }
  };

  const handleUpdateAllowExport = async (shareId, newValue) => {
    try {
      await api.put(`/sharing/${shareId}`, { allow_export: newValue });
      loadShares();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון');
    }
  };

  const handleUpdatePermission = async (shareId, newPermission) => {
    try {
      await api.put(`/sharing/${shareId}`, { permission: newPermission });
      loadShares();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעדכון');
    }
  };

  const handleRemoveShare = async (shareId) => {
    if (!confirm('האם להסיר את השיתוף?')) return;
    
    try {
      await api.delete(`/sharing/${shareId}`);
      loadShares();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהסרה');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">שיתוף בוט</h2>
              <p className="text-sm text-gray-500">{bot.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Share Form */}
          <form onSubmit={handleShare} className="space-y-3">
            <label className="text-sm font-medium text-gray-700">הזמן משתמש חדש</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="הזן כתובת מייל..."
                  className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl"
              >
                {PERMISSIONS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={sharing || !email.trim()}
                className="px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                שתף
              </button>
            </div>
            
            {/* Allow Export Option */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowExport}
                onChange={(e) => setAllowExport(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 flex items-center gap-1">
                <Download className="w-4 h-4" />
                אפשר הורדה ושכפול
              </span>
            </label>
            
            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.type === 'success' 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-red-50 text-red-700'
              }`}>
                {message.text}
              </div>
            )}
          </form>

          {/* Current Shares */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">משתמשים עם גישה</h3>
            
            {loading ? (
              <div className="text-center py-4 text-gray-500">טוען...</div>
            ) : shares.length === 0 && invitations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>הבוט לא משותף עם אף אחד</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Active Shares */}
                {shares.map(share => {
                  const perm = PERMISSIONS.find(p => p.id === share.permission);
                  const PermIcon = perm?.icon || Eye;
                  
                  return (
                    <div 
                      key={share.id}
                      className="p-3 bg-gray-50 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-700">
                              {(share.name || share.email)[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-800">
                              {share.name || 'משתמש'}
                            </div>
                            <div className="text-sm text-gray-500">{share.email}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <select
                            value={share.permission}
                            onChange={(e) => handleUpdatePermission(share.id, e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-200 rounded-lg"
                          >
                            {PERMISSIONS.map(p => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRemoveShare(share.id)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500"
                            title="הסר גישה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Allow Export Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer pr-13">
                        <input
                          type="checkbox"
                          checked={share.allow_export || false}
                          onChange={(e) => handleUpdateAllowExport(share.id, e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          מאפשר הורדה ושכפול
                        </span>
                      </label>
                    </div>
                  );
                })}
                
                {/* Pending Invitations */}
                {invitations.map(inv => (
                  <div 
                    key={inv.id}
                    className="flex items-center justify-between p-3 bg-yellow-50 rounded-xl border border-yellow-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                        <Mail className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">{inv.invite_email}</div>
                        <div className="text-xs text-yellow-600">ממתין לאישור</div>
                      </div>
                    </div>
                    
                    <span className="text-xs text-gray-500">
                      {PERMISSIONS.find(p => p.id === inv.permission)?.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Permission Legend */}
          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-xs font-medium text-gray-500 mb-2">הסבר הרשאות</h4>
            <div className="space-y-1 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5" /> צפייה - יכול לראות את הבוט והסטטיסטיקות
              </div>
              <div className="flex items-center gap-2">
                <Edit className="w-3.5 h-3.5" /> עריכה - יכול לערוך את הבוט
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" /> מנהל - יכול לערוך, למחוק ולשתף
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
