import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Bot, LogOut, ChevronLeft, Eye, Edit, BarChart3, X, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

export default function MyClientsManager() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveModal, setLeaveModal] = useState(null); // { clientId, clientName }

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const { data } = await api.get('/experts/my-clients');
      setClients(data.clients || []);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!leaveModal) return;
    
    try {
      await api.delete(`/experts/client/${leaveModal.clientId}/leave`);
      loadClients();
      setLeaveModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה ביציאה');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="text-center py-8 text-gray-500">טוען...</div>
      </div>
    );
  }

  if (clients.length === 0) {
    return null; // Don't show if no clients
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-xl">
          <Users className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-800">חשבונות שאני מנהל</h2>
          <p className="text-sm text-gray-500">לקוחות שנתנו לך גישה לנהל את הבוטים שלהם</p>
        </div>
      </div>

      <div className="space-y-3">
        {clients.map(client => (
          <div 
            key={client.id} 
            className="border border-gray-200 rounded-xl p-4 hover:border-blue-200 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="font-semibold text-blue-700 text-lg">
                    {(client.client_name || client.client_email)[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-gray-800">
                    {client.client_name || 'לקוח'}
                  </div>
                  <div className="text-sm text-gray-500">{client.client_email}</div>
                  
                  {/* Permissions badges */}
                  <div className="flex items-center gap-2 mt-1">
                    {client.can_view_bots && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Eye className="w-3 h-3" /> צפייה
                      </span>
                    )}
                    {client.can_edit_bots && (
                      <span className="flex items-center gap-1 text-xs text-blue-500">
                        <Edit className="w-3 h-3" /> עריכה
                      </span>
                    )}
                    {client.can_view_analytics && (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <BarChart3 className="w-3 h-3" /> סטטיסטיקות
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/clients/${client.client_id}/bots`)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  נהל בוטים
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLeaveModal({ clientId: client.client_id, clientName: client.client_name || client.client_email })}
                  className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                  title="צא מניהול"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Leave Confirmation Modal */}
      {leaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setLeaveModal(null)}>
          <div 
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">יציאה מניהול</h3>
              <p className="text-gray-600 mb-6">
                האם אתה בטוח שברצונך לצאת מניהול החשבון של{' '}
                <strong>{leaveModal.clientName}</strong>?
              </p>
              <p className="text-sm text-gray-500 mb-6">
                לא תוכל לגשת לבוטים ולנתונים של לקוח זה עד שיאשר שוב גישה.
              </p>
            </div>
            <div className="flex border-t">
              <button
                onClick={() => setLeaveModal(null)}
                className="flex-1 px-4 py-3 text-gray-600 hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleLeave}
                className="flex-1 px-4 py-3 text-red-600 hover:bg-red-50 font-medium border-r"
              >
                יציאה מניהול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
