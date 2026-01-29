import { useState, useEffect } from 'react';
import { 
  Plus, Users, Trash2, Edit2, Search, Filter, RefreshCw,
  CheckCircle, AlertCircle, Loader2, X, ChevronDown, Eye,
  Target, UserPlus, Settings
} from 'lucide-react';
import api from '../../services/api';

export default function AudiencesTab({ onRefresh }) {
  const [audiences, setAudiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAudience, setEditAudience] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_static: true,
    filter_criteria: {}
  });

  useEffect(() => {
    fetchAudiences();
  }, []);

  const fetchAudiences = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/broadcasts/audiences');
      setAudiences(data.audiences || []);
    } catch (e) {
      console.error('Failed to fetch audiences:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    
    try {
      await api.post('/broadcasts/audiences', formData);
      setShowCreate(false);
      setFormData({ name: '', description: '', is_static: true, filter_criteria: {} });
      fetchAudiences();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת קהל');
    }
  };

  const handleUpdate = async () => {
    if (!formData.name.trim() || !editAudience) return;
    
    try {
      await api.put(`/broadcasts/audiences/${editAudience.id}`, formData);
      setEditAudience(null);
      setFormData({ name: '', description: '', is_static: true, filter_criteria: {} });
      fetchAudiences();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בעדכון קהל');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/broadcasts/audiences/${id}`);
      setDeleteConfirm(null);
      fetchAudiences();
      onRefresh?.();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקת קהל');
    }
  };

  const openEdit = (audience) => {
    setFormData({
      name: audience.name,
      description: audience.description || '',
      is_static: audience.is_static,
      filter_criteria: audience.filter_criteria || {}
    });
    setEditAudience(audience);
  };

  const filteredAudiences = audiences.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש קהלים..."
              className="pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            onClick={fetchAudiences}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          צור קהל חדש
        </button>
      </div>

      {/* Audiences List */}
      {filteredAudiences.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין קהלים עדיין</h3>
          <p className="text-gray-500 mb-4">צור קהל כדי להתחיל לשלוח הודעות תפוצה</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" />
            צור קהל ראשון
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAudiences.map(audience => (
            <div key={audience.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    audience.is_static ? 'bg-purple-100' : 'bg-blue-100'
                  }`}>
                    {audience.is_static ? (
                      <Users className="w-5 h-5 text-purple-600" />
                    ) : (
                      <Target className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{audience.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      audience.is_static 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {audience.is_static ? 'קהל סטטי' : 'קהל דינמי'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(audience)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(audience)}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              
              {audience.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{audience.description}</p>
              )}
              
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>{audience.contacts_count || 0} אנשי קשר</span>
                </div>
                <button className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  צפה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editAudience) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowCreate(false); setEditAudience(null); }}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editAudience ? 'עריכת קהל' : 'יצירת קהל חדש'}
              </h3>
              <button onClick={() => { setShowCreate(false); setEditAudience(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם הקהל</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="לדוגמה: לקוחות VIP"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="תיאור קצר של הקהל..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">סוג קהל</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_static: true })}
                    className={`p-3 border-2 rounded-xl text-right transition-colors ${
                      formData.is_static 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Users className={`w-5 h-5 mb-1 ${formData.is_static ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div className="font-medium text-sm">קהל סטטי</div>
                    <div className="text-xs text-gray-500">בחירה ידנית של אנשי קשר</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_static: false })}
                    className={`p-3 border-2 rounded-xl text-right transition-colors ${
                      !formData.is_static 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Target className={`w-5 h-5 mb-1 ${!formData.is_static ? 'text-blue-600' : 'text-gray-400'}`} />
                    <div className="font-medium text-sm">קהל דינמי</div>
                    <div className="text-xs text-gray-500">לפי תגיות ופילטרים</div>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreate(false); setEditAudience(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={editAudience ? handleUpdate : handleCreate}
                disabled={!formData.name.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {editAudience ? 'שמור' : 'צור קהל'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">מחיקת קהל</h3>
            <p className="text-gray-600 mb-4">האם למחוק את הקהל "{deleteConfirm.name}"?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
