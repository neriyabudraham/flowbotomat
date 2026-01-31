import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Users, Trash2, Edit2, Search, RefreshCw, Loader2, X, Eye,
  Target, UserPlus, Check, ChevronDown, Tag, Filter, Phone, User,
  CheckCircle, Circle, AlertCircle, Sparkles, ChevronLeft, ChevronRight,
  Settings, Download, Crown, Shield
} from 'lucide-react';
import api from '../../services/api';

export default function AudiencesTab({ onRefresh }) {
  const [audiences, setAudiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editAudience, setEditAudience] = useState(null);

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

  const handleCreated = () => {
    setShowCreateModal(false);
    setEditAudience(null);
    fetchAudiences();
    onRefresh?.();
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
    <div className="space-y-6">
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
              className="pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-64"
            />
          </div>
          <button
            onClick={fetchAudiences}
            className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors"
            title="רענן"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/25 font-medium"
        >
          <Plus className="w-4 h-4" />
          צור קהל חדש
        </button>
      </div>

      {/* Audiences Grid */}
      {filteredAudiences.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">אין קהלים עדיין</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            קהלים מאפשרים לך לקבץ אנשי קשר ולשלוח להם הודעות תפוצה בקלות.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 font-medium shadow-lg shadow-purple-500/25"
          >
            <Sparkles className="w-5 h-5" />
            צור קהל ראשון
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredAudiences.map(audience => (
            <div 
              key={audience.id}
              className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-purple-200 transition-all cursor-pointer"
              onClick={() => setShowViewModal(audience)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                      audience.is_static 
                        ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-purple-500/20' 
                        : 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-blue-500/20'
                    }`}>
                      {audience.is_static ? (
                        <Users className="w-6 h-6 text-white" />
                      ) : (
                        <Target className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{audience.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        audience.is_static 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {audience.is_static ? 'סטטי' : 'דינמי'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {audience.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{audience.description}</p>
                )}

                <div className="flex items-center gap-2 text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  <Users className="w-4 h-4" />
                  <span className="font-bold">{(audience.contacts_count || 0).toLocaleString()}</span>
                  <span className="text-sm text-gray-500">אנשי קשר</span>
                </div>
              </div>
              
              {/* Actions - always visible */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowViewModal(audience); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-sm font-medium transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  צפייה
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditAudience(audience); setShowCreateModal(true); }}
                  className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(audience); }}
                  className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          
          {/* Create New Card */}
          <div
            onClick={() => setShowCreateModal(true)}
            className="group relative bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer flex items-center justify-center min-h-[200px]"
          >
            <div className="text-center">
              <div className="w-14 h-14 bg-gray-100 group-hover:bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
                <Plus className="w-7 h-7 text-gray-400 group-hover:text-purple-500 transition-colors" />
              </div>
              <div className="font-medium text-gray-600 group-hover:text-purple-600 transition-colors">צור קהל חדש</div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <AudienceEditorModal
          audience={editAudience}
          onClose={() => { setShowCreateModal(false); setEditAudience(null); }}
          onCreated={handleCreated}
        />
      )}

      {/* View Modal */}
      {showViewModal && (
        <AudienceViewModal
          audience={showViewModal}
          onClose={() => setShowViewModal(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת קהל</h3>
              <p className="text-gray-600 mb-6">
                האם למחוק את הקהל "{deleteConfirm.name}"?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                >
                  מחק
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Audience Editor Modal (Create/Edit) - exported for use in CampaignsTab
// =============================================
export function AudienceEditorModal({ audience, onClose, onCreated }) {
  const [step, setStep] = useState(audience ? 2 : 1);
  const [isStatic, setIsStatic] = useState(audience?.is_static ?? true);
  const [name, setName] = useState(audience?.name || '');
  const [description, setDescription] = useState(audience?.description || '');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [filterCriteria, setFilterCriteria] = useState(audience?.filter_criteria || {});
  const [saving, setSaving] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (audience?.is_static && audience?.id) {
      loadAudienceContacts();
    }
  }, [audience]);

  const loadAudienceContacts = async () => {
    try {
      setLoadingContacts(true);
      const { data } = await api.get(`/broadcasts/audiences/${audience.id}/contacts?limit=100000`);
      setSelectedContacts(data.contacts?.map(c => c.id) || []);
    } catch (e) {
      console.error('Failed to load audience contacts:', e);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('יש להזין שם לקהל');
      return;
    }
    
    if (isStatic && selectedContacts.length === 0) {
      setError('יש לבחור לפחות איש קשר אחד');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      if (audience) {
        await api.put(`/broadcasts/audiences/${audience.id}`, {
          name,
          description,
          filter_criteria: isStatic ? {} : filterCriteria
        });
        
        if (isStatic) {
          const currentRes = await api.get(`/broadcasts/audiences/${audience.id}/contacts?limit=100000`);
          const currentIds = currentRes.data.contacts?.map(c => c.id) || [];
          
          const toRemove = currentIds.filter(id => !selectedContacts.includes(id));
          if (toRemove.length > 0) {
            await api.delete(`/broadcasts/audiences/${audience.id}/contacts`, { data: { contact_ids: toRemove } });
          }
          
          const toAdd = selectedContacts.filter(id => !currentIds.includes(id));
          if (toAdd.length > 0) {
            await api.post(`/broadcasts/audiences/${audience.id}/contacts`, { contact_ids: toAdd });
          }
        }
      } else {
        const { data } = await api.post('/broadcasts/audiences', {
          name,
          description,
          is_static: isStatic,
          filter_criteria: isStatic ? {} : filterCriteria
        });
        
        if (isStatic && selectedContacts.length > 0) {
          await api.post(`/broadcasts/audiences/${data.audience.id}/contacts`, {
            contact_ids: selectedContacts
          });
        }
      }
      
      onCreated();
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה בשמירת קהל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-6 flex-shrink-0 ${
          step === 1 
            ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
            : isStatic 
              ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
              : 'bg-gradient-to-r from-blue-500 to-cyan-500'
        }`}>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                {isStatic ? (
                  <Users className="w-6 h-6 text-white" />
                ) : (
                  <Target className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {audience ? 'עריכת קהל' : 'יצירת קהל חדש'}
                </h3>
                <p className="text-white/80 text-sm">
                  {step === 1 ? 'בחר סוג קהל' : (isStatic ? 'בחר אנשי קשר' : 'הגדר פילטרים')}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="grid md:grid-cols-2 gap-6">
              <button
                onClick={() => { setIsStatic(true); setStep(2); }}
                className="group p-6 border-2 rounded-2xl text-right transition-all hover:shadow-xl hover:border-purple-400 border-gray-200"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">קהל סטטי</h4>
                <p className="text-gray-500 leading-relaxed mb-4">
                  בחר ידנית אנשי קשר מהרשימה שלך.
                  מתאים כשיש לך רשימה ספציפית של אנשים.
                </p>
                <div className="flex items-center gap-2 text-purple-600 font-medium">
                  <UserPlus className="w-5 h-5" />
                  בחירה ידנית עד 100,000
                </div>
              </button>
              
              <button
                onClick={() => { setIsStatic(false); setStep(2); }}
                className="group p-6 border-2 rounded-2xl text-right transition-all hover:shadow-xl hover:border-blue-400 border-gray-200"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">קהל דינמי</h4>
                <p className="text-gray-500 leading-relaxed mb-4">
                  הגדר פילטרים (תגיות, משתנים) והקהל יתעדכן אוטומטית.
                  מתאים לקהלים שמשתנים.
                </p>
                <div className="flex items-center gap-2 text-blue-600 font-medium">
                  <Filter className="w-5 h-5" />
                  לפי פילטרים אוטומטיים
                </div>
              </button>
            </div>
          )}
          
          {step === 2 && (
            <div className="space-y-6">
              {/* Name & Description */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">שם הקהל *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(null); }}
                    placeholder="לדוגמה: לקוחות VIP"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 focus:bg-white transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">תיאור (אופציונלי)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תיאור קצר..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Static: Contact Picker */}
              {isStatic && (
                <ContactPicker
                  selectedIds={selectedContacts}
                  onChange={setSelectedContacts}
                  loading={loadingContacts}
                />
              )}

              {/* Dynamic: Filter Builder */}
              {!isStatic && (
                <FilterBuilder
                  criteria={filterCriteria}
                  onChange={setFilterCriteria}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <div>
            {step === 2 && !audience && (
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                <ChevronRight className="w-4 h-4" />
                חזור לבחירת סוג
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              ביטול
            </button>
            {step === 2 && (
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving || (isStatic && selectedContacts.length === 0)}
                className={`px-5 py-2.5 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg transition-all ${
                  isStatic 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-purple-500/25'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-blue-500/25'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {audience ? 'שמור שינויים' : 'צור קהל'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Contact Picker Component (Up to 100,000)
// =============================================

// Helper to check if contact is a group
function isGroupContact(contact) {
  return contact?.phone?.includes('@g.us') || 
         contact?.wa_id?.includes('@g.us') ||
         (contact?.phone?.length > 15 && !contact?.phone?.includes('@'));
}

// Format phone for display (hide @g.us)
function formatContactPhone(phone) {
  if (!phone) return '';
  // Remove @g.us suffix
  if (phone.includes('@g.us')) {
    return phone.replace('@g.us', '');
  }
  return phone;
}

function ContactPicker({ selectedIds, onChange, loading }) {
  const [contacts, setContacts] = useState([]);
  const [allContactIds, setAllContactIds] = useState([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [contactTypeFilter, setContactTypeFilter] = useState('chats'); // 'all' | 'chats' | 'groups'
  const pageSize = 100;

  // WhatsApp Group Import
  const [showGroupImport, setShowGroupImport] = useState(false);
  const [waGroups, setWaGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupParticipants, setGroupParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [importingParticipants, setImportingParticipants] = useState(false);

  useEffect(() => {
    loadContacts(1, '', contactTypeFilter);
    loadAllContactIds(contactTypeFilter);
  }, [contactTypeFilter]);

  const loadContacts = async (page, search = '', typeFilter = 'chats') => {
    try {
      setLoadingContacts(true);
      const { data } = await api.get('/contacts', {
        params: { page, limit: pageSize, search, contact_type: typeFilter }
      });
      setContacts(data.contacts || []);
      setTotalContacts(data.total || 0);
      setCurrentPage(page);
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadAllContactIds = async (typeFilter = 'chats') => {
    try {
      setLoadingAll(true);
      // Load up to 100,000 contact IDs for "select all" functionality
      const { data } = await api.get('/contacts', { params: { limit: 100000, fields: 'id', contact_type: typeFilter } });
      setAllContactIds((data.contacts || []).map(c => c.id));
    } catch (e) {
      console.error('Failed to load all contact IDs:', e);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleSearch = () => {
    loadContacts(1, searchQuery, contactTypeFilter);
  };

  const toggleContact = (contactId) => {
    if (selectedIds.includes(contactId)) {
      onChange(selectedIds.filter(id => id !== contactId));
    } else {
      onChange([...selectedIds, contactId]);
    }
  };

  const selectAll = () => {
    onChange(allContactIds);
  };

  const selectVisible = () => {
    const visibleIds = contacts.map(c => c.id);
    const newSelected = [...new Set([...selectedIds, ...visibleIds])];
    onChange(newSelected);
  };

  const deselectAll = () => {
    onChange([]);
  };

  // Load WhatsApp groups
  const loadWaGroups = async () => {
    try {
      setLoadingGroups(true);
      const { data } = await api.get('/whatsapp/groups');
      setWaGroups(data.groups || []);
    } catch (e) {
      console.error('Failed to load groups:', e);
      setWaGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  // Load group participants
  const loadGroupParticipants = async (groupId) => {
    try {
      setLoadingParticipants(true);
      const { data } = await api.get(`/whatsapp/groups/${encodeURIComponent(groupId)}/participants`);
      setGroupParticipants(data.participants || []);
    } catch (e) {
      console.error('Failed to load participants:', e);
      setGroupParticipants([]);
    } finally {
      setLoadingParticipants(false);
    }
  };

  // Import participants to selected contacts
  const handleImportGroupParticipants = async (excludeAdmins = false) => {
    if (!selectedGroup) return;
    
    try {
      setImportingParticipants(true);
      // First import to contacts DB
      const { data } = await api.post(
        `/whatsapp/groups/${encodeURIComponent(selectedGroup.JID || selectedGroup.id)}/participants/import`,
        { excludeAdmins }
      );
      
      // Reload contacts to get the new IDs
      await loadContacts(1, '', contactTypeFilter);
      await loadAllContactIds(contactTypeFilter);
      
      alert(data.message || `יובאו ${data.imported} אנשי קשר מהקבוצה`);
      
      // Close modal
      setShowGroupImport(false);
      setSelectedGroup(null);
      setGroupParticipants([]);
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בייבוא משתתפי הקבוצה');
    } finally {
      setImportingParticipants(false);
    }
  };

  const totalPages = Math.ceil(totalContacts / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Import from WhatsApp Group Button */}
      <div className="flex justify-start">
        <button
          onClick={() => {
            setShowGroupImport(true);
            loadWaGroups();
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 font-medium shadow-lg shadow-green-500/25"
        >
          <Download className="w-4 h-4" />
          ייבא מקבוצת וואטסאפ
        </button>
      </div>

      {/* Filter & Search */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Contact Type Filter */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setContactTypeFilter('chats')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              contactTypeFilter === 'chats' 
                ? 'bg-white text-purple-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              צ'אטים
            </span>
          </button>
          <button
            onClick={() => setContactTypeFilter('groups')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              contactTypeFilter === 'groups' 
                ? 'bg-white text-purple-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              קבוצות
            </span>
          </button>
          <button
            onClick={() => setContactTypeFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              contactTypeFilter === 'all' 
                ? 'bg-white text-purple-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            הכל
          </button>
        </div>
        
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="חיפוש לפי שם או טלפון..."
            className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 focus:bg-white transition-all"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors"
        >
          חפש
        </button>
      </div>

      {/* Selection Summary */}
      <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-purple-900">
              {selectedIds.length.toLocaleString()} אנשי קשר נבחרו
            </div>
            {totalContacts > 0 && (
              <div className="text-sm text-purple-600">מתוך {totalContacts.toLocaleString()} זמינים</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={selectAll} 
            disabled={loadingAll}
            className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loadingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              `בחר הכל (${allContactIds.length.toLocaleString()})`
            )}
          </button>
          <button 
            onClick={selectVisible} 
            className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg font-medium transition-colors"
          >
            בחר עמוד
          </button>
          <button 
            onClick={deselectAll} 
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            נקה
          </button>
        </div>
      </div>

      {/* Contacts List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="max-h-[350px] overflow-y-auto">
          {loadingContacts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>לא נמצאו אנשי קשר</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contacts.map(contact => (
                <label
                  key={contact.id}
                  className="flex items-center gap-4 p-4 hover:bg-purple-50/50 cursor-pointer transition-colors"
                >
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                    selectedIds.includes(contact.id)
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-purple-500'
                      : 'border-gray-300 hover:border-purple-400'
                  }`}>
                    {selectedIds.includes(contact.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
                    {contact.profile_picture_url ? (
                      <img src={contact.profile_picture_url} alt="" className="w-full h-full object-cover" />
                    ) : isGroupContact(contact) ? (
                      <Users className="w-5 h-5 text-purple-500" />
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                      {contact.display_name || 'ללא שם'}
                      {isGroupContact(contact) && (
                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">קבוצה</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1 font-mono">
                      {isGroupContact(contact) ? (
                        <Users className="w-3 h-3" />
                      ) : (
                        <Phone className="w-3 h-3" />
                      )}
                      {formatContactPhone(contact.phone)}
                    </div>
                  </div>
                  
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              עמוד {currentPage} מתוך {totalPages.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadContacts(Math.max(1, currentPage - 1), searchQuery)}
                disabled={currentPage === 1 || loadingContacts}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                הקודם
              </button>
              <button
                onClick={() => loadContacts(Math.min(totalPages, currentPage + 1), searchQuery)}
                disabled={currentPage === totalPages || loadingContacts}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                הבא
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Group Import Modal */}
      {showGroupImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowGroupImport(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur rounded-xl">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">ייבוא מקבוצת וואטסאפ</h3>
                  <p className="text-white/80 text-sm">
                    {selectedGroup ? `משתתפי ${selectedGroup.Name || selectedGroup.name || 'קבוצה'}` : 'בחר קבוצה'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowGroupImport(false);
                  setSelectedGroup(null);
                  setGroupParticipants([]);
                }}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto max-h-[calc(80vh-140px)]">
              {!selectedGroup ? (
                // Group Selection
                <div className="space-y-3">
                  {loadingGroups ? (
                    <div className="py-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-green-500 mx-auto mb-2" />
                      <p className="text-gray-500">טוען קבוצות...</p>
                    </div>
                  ) : waGroups.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>לא נמצאו קבוצות</p>
                    </div>
                  ) : (
                    waGroups.map((group, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedGroup(group);
                          loadGroupParticipants(group.JID || group.id);
                        }}
                        className="w-full flex items-center gap-3 p-4 bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-300 rounded-xl transition-all text-right"
                      >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                          <Users className="w-6 h-6 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{group.Name || group.name || 'קבוצה ללא שם'}</p>
                          <p className="text-sm text-gray-500">
                            {group.Participants?.length || group.participants || 0} משתתפים
                          </p>
                        </div>
                        <ChevronLeft className="w-5 h-5 text-gray-400" />
                      </button>
                    ))
                  )}
                </div>
              ) : (
                // Participants View
                <div className="space-y-4">
                  {/* Back button */}
                  <button
                    onClick={() => {
                      setSelectedGroup(null);
                      setGroupParticipants([]);
                    }}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <ChevronRight className="w-4 h-4" />
                    חזור לרשימת הקבוצות
                  </button>

                  {/* Import buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleImportGroupParticipants(false)}
                      disabled={importingParticipants || loadingParticipants}
                      className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {importingParticipants ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      ייבא הכל ({groupParticipants.length})
                    </button>
                    <button
                      onClick={() => handleImportGroupParticipants(true)}
                      disabled={importingParticipants || loadingParticipants}
                      className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-medium hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      ייבא ללא מנהלים
                    </button>
                  </div>

                  {/* Participants list */}
                  {loadingParticipants ? (
                    <div className="py-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-green-500 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">טוען משתתפים...</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {groupParticipants.map((p, idx) => (
                        <div 
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-xl border ${
                            p.isSuperAdmin 
                              ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200' 
                              : p.isAdmin 
                              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
                              : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              p.isSuperAdmin 
                                ? 'bg-yellow-500' 
                                : p.isAdmin 
                                ? 'bg-blue-500'
                                : 'bg-gray-400'
                            }`}>
                              {p.isSuperAdmin ? (
                                <Crown className="w-4 h-4 text-white" />
                              ) : p.isAdmin ? (
                                <Shield className="w-4 h-4 text-white" />
                              ) : (
                                <User className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {p.displayName || p.phone || 'משתמש'}
                              </p>
                              {p.phone && p.displayName && (
                                <p className="text-xs text-gray-500 font-mono">{p.phone}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {p.isSuperAdmin && (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
                                מנהל ראשי
                              </span>
                            )}
                            {p.isAdmin && !p.isSuperAdmin && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                                מנהל
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Filter Builder Component (for Dynamic Audiences)
// =============================================
const OPERATORS = [
  { value: 'equals', label: 'שווה ל-' },
  { value: 'not_equals', label: 'לא שווה ל-' },
  { value: 'contains', label: 'מכיל' },
  { value: 'not_contains', label: 'לא מכיל' },
  { value: 'starts_with', label: 'מתחיל ב-' },
  { value: 'ends_with', label: 'מסתיים ב-' },
  { value: 'is_empty', label: 'ריק' },
  { value: 'is_not_empty', label: 'לא ריק' },
  { value: 'exists', label: 'קיים' },
  { value: 'not_exists', label: 'לא קיים' },
  { value: 'greater_than', label: 'גדול מ-' },
  { value: 'less_than', label: 'קטן מ-' },
];

function FilterBuilder({ criteria, onChange }) {
  const [tags, setTags] = useState([]);
  const [variables, setVariables] = useState([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadingVariables, setLoadingVariables] = useState(true);
  const [activeSection, setActiveSection] = useState('tags');

  useEffect(() => {
    loadTags();
    loadVariables();
  }, []);

  const loadTags = async () => {
    try {
      const { data } = await api.get('/contacts/tags');
      setTags(data.tags || []);
    } catch (e) {
      console.error('Failed to load tags:', e);
    } finally {
      setLoadingTags(false);
    }
  };

  const loadVariables = async () => {
    try {
      const { data } = await api.get('/variables');
      setVariables([
        { name: 'display_name', label: 'שם איש קשר', is_system: true },
        { name: 'phone', label: 'טלפון', is_system: true },
        ...(data.userVariables || [])
      ]);
    } catch (e) {
      console.error('Failed to load variables:', e);
    } finally {
      setLoadingVariables(false);
    }
  };

  const toggleTag = (tagName) => {
    const currentTags = criteria.tags || [];
    if (currentTags.includes(tagName)) {
      onChange({ ...criteria, tags: currentTags.filter(t => t !== tagName) });
    } else {
      onChange({ ...criteria, tags: [...currentTags, tagName] });
    }
  };

  const toggleExcludeTag = (tagName) => {
    const currentTags = criteria.excludeTags || [];
    if (currentTags.includes(tagName)) {
      onChange({ ...criteria, excludeTags: currentTags.filter(t => t !== tagName) });
    } else {
      onChange({ ...criteria, excludeTags: [...currentTags, tagName] });
    }
  };

  const addCondition = () => {
    const conditions = criteria.conditions || [];
    onChange({
      ...criteria,
      conditions: [...conditions, { variable: '', operator: 'equals', value: '' }]
    });
  };

  const updateCondition = (index, field, value) => {
    const conditions = [...(criteria.conditions || [])];
    conditions[index] = { ...conditions[index], [field]: value };
    onChange({ ...criteria, conditions });
  };

  const removeCondition = (index) => {
    const conditions = [...(criteria.conditions || [])];
    conditions.splice(index, 1);
    onChange({ ...criteria, conditions });
  };

  const selectedTags = criteria.tags || [];
  const excludedTags = criteria.excludeTags || [];
  const conditions = criteria.conditions || [];

  const needsValue = (operator) => !['is_empty', 'is_not_empty', 'exists', 'not_exists'].includes(operator);

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {[
          { id: 'tags', label: 'תגיות', icon: Tag },
          { id: 'conditions', label: 'תנאי משתנים', icon: Settings },
          { id: 'status', label: 'סטטוס', icon: Filter },
        ].map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeSection === section.id
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <section.icon className="w-4 h-4" />
            {section.label}
          </button>
        ))}
      </div>

      {/* Tags Section */}
      {activeSection === 'tags' && (
        <div className="space-y-4">
          {/* Include Tags */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Tag className="w-4 h-4 text-green-500" />
                כולל תגיות
              </label>
              {selectedTags.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">לוגיקה:</span>
                  <select
                    value={criteria.tagLogic || 'any'}
                    onChange={(e) => onChange({ ...criteria, tagLogic: e.target.value })}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                  >
                    <option value="any">אחת מהתגיות (OR)</option>
                    <option value="all">כל התגיות (AND)</option>
                  </select>
                </div>
              )}
            </div>
            
            {loadingTags ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">טוען תגיות...</span>
              </div>
            ) : tags.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4 text-center">
                <p>אין תגיות עדיין</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const tagName = typeof tag === 'string' ? tag : tag.name;
                  const isSelected = selectedTags.includes(tagName);
                  const isExcluded = excludedTags.includes(tagName);
                  return (
                    <button
                      key={tag.id || tagName}
                      onClick={() => !isExcluded && toggleTag(tagName)}
                      disabled={isExcluded}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isExcluded
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isSelected
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 inline ml-1" />}
                      {tagName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Exclude Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-red-500" />
              ללא תגיות (הדרה)
            </label>
            
            {!loadingTags && tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const tagName = typeof tag === 'string' ? tag : tag.name;
                  const isSelected = selectedTags.includes(tagName);
                  const isExcluded = excludedTags.includes(tagName);
                  return (
                    <button
                      key={tag.id || tagName}
                      onClick={() => !isSelected && toggleExcludeTag(tagName)}
                      disabled={isSelected}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isExcluded
                            ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isExcluded && <X className="w-3 h-3 inline ml-1" />}
                      {tagName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conditions Section */}
      {activeSection === 'conditions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-500" />
              תנאי משתנים מותאמים אישית
            </label>
            <button
              onClick={addCondition}
              className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              הוסף תנאי
            </button>
          </div>

          {conditions.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-6 text-center">
              <Settings className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">אין תנאים עדיין</p>
              <p className="text-xs mt-1">לחץ על "הוסף תנאי" ליצירת פילטר מתקדם</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <select
                    value={condition.variable}
                    onChange={(e) => updateCondition(index, 'variable', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">בחר משתנה...</option>
                    <optgroup label="שדות מערכת">
                      {variables.filter(v => v.is_system).map(v => (
                        <option key={v.name} value={v.name}>{v.label || v.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="משתנים מותאמים">
                      {variables.filter(v => !v.is_system).map(v => (
                        <option key={v.name} value={v.name}>{v.label || v.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {OPERATORS.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  
                  {needsValue(condition.operator) && (
                    <input
                      type="text"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, 'value', e.target.value)}
                      placeholder="ערך..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  )}
                  
                  <button
                    onClick={() => removeCondition(index)}
                    className="p-2 text-red-500 hover:bg-red-100 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Example conditions info */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm">
            <p className="font-medium text-purple-900 mb-2">דוגמאות לשימוש:</p>
            <ul className="text-purple-700 space-y-1 text-xs">
              <li>• <strong>email</strong> "לא ריק" - אנשי קשר עם אימייל</li>
              <li>• <strong>city</strong> "שווה ל-" "תל אביב" - תושבי תל אביב</li>
              <li>• <strong>score</strong> "גדול מ-" "100" - ניקוד גבוה</li>
            </ul>
          </div>
        </div>
      )}

      {/* Status Section */}
      {activeSection === 'status' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              criteria.is_blocked === false ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
            }`}>
              <input
                type="checkbox"
                checked={criteria.is_blocked === false}
                onChange={(e) => onChange({ 
                  ...criteria, 
                  is_blocked: e.target.checked ? false : undefined 
                })}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                criteria.is_blocked === false ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {criteria.is_blocked === false && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <div className="font-medium text-gray-900">ללא חסומים</div>
                <div className="text-xs text-gray-500">רק אנשי קשר שאינם חסומים</div>
              </div>
            </label>
            
            <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              criteria.is_bot_active === true ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
            }`}>
              <input
                type="checkbox"
                checked={criteria.is_bot_active === true}
                onChange={(e) => onChange({ 
                  ...criteria, 
                  is_bot_active: e.target.checked ? true : undefined 
                })}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                criteria.is_bot_active === true ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
              }`}>
                {criteria.is_bot_active === true && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <div className="font-medium text-gray-900">בוט פעיל</div>
                <div className="text-xs text-gray-500">רק אנשי קשר עם בוט פעיל</div>
              </div>
            </label>

            <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              criteria.is_bot_active === false ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
            }`}>
              <input
                type="checkbox"
                checked={criteria.is_bot_active === false}
                onChange={(e) => onChange({ 
                  ...criteria, 
                  is_bot_active: e.target.checked ? false : undefined 
                })}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                criteria.is_bot_active === false ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
              }`}>
                {criteria.is_bot_active === false && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <div className="font-medium text-gray-900">בוט כבוי</div>
                <div className="text-xs text-gray-500">רק אנשי קשר עם בוט מושבת</div>
              </div>
            </label>
          </div>

          {/* Name search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">חיפוש לפי שם/טלפון</label>
            <input
              type="text"
              value={criteria.name_search || ''}
              onChange={(e) => onChange({ ...criteria, name_search: e.target.value || undefined })}
              placeholder="הקלד שם או מספר טלפון..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {(selectedTags.length > 0 || excludedTags.length > 0 || conditions.length > 0 || 
        criteria.is_blocked !== undefined || criteria.is_bot_active !== undefined || criteria.name_search) && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-2 text-sm text-blue-900">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">פילטרים פעילים:</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedTags.length > 0 && (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    {selectedTags.length} תגיות נבחרו
                  </span>
                )}
                {excludedTags.length > 0 && (
                  <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">
                    {excludedTags.length} תגיות מודרות
                  </span>
                )}
                {conditions.length > 0 && (
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                    {conditions.length} תנאי משתנים
                  </span>
                )}
                {criteria.is_blocked === false && (
                  <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full">ללא חסומים</span>
                )}
                {criteria.is_bot_active === true && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">בוט פעיל</span>
                )}
                {criteria.is_bot_active === false && (
                  <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">בוט כבוי</span>
                )}
                {criteria.name_search && (
                  <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full">חיפוש: {criteria.name_search}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Audience View Modal
// =============================================
function AudienceViewModal({ audience, onClose }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    loadContacts();
  }, [page]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/broadcasts/audiences/${audience.id}/contacts`, {
        params: { page, limit: 50 }
      });
      setContacts(data.contacts || []);
      setPagination(data.pagination);
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-6 ${
          audience.is_static 
            ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
            : 'bg-gradient-to-r from-blue-500 to-cyan-500'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                {audience.is_static ? (
                  <Users className="w-6 h-6 text-white" />
                ) : (
                  <Target className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{audience.name}</h3>
                <p className="text-white/80 text-sm">
                  {(audience.contacts_count || 0).toLocaleString()} אנשי קשר
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-180px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>אין אנשי קשר בקהל זה</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
                    {contact.profile_picture_url ? (
                      <img src={contact.profile_picture_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{contact.display_name || 'ללא שם'}</div>
                    <div className="text-sm text-gray-500 font-mono">{contact.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
              הקודם
            </button>
            <span className="text-sm text-gray-600">
              עמוד {page} מתוך {pagination.pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
              className="flex items-center gap-1 px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors"
            >
              הבא
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
