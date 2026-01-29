import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Users, Trash2, Edit2, Search, RefreshCw, Loader2, X, Eye,
  Target, UserPlus, Check, ChevronDown, Tag, Filter, Phone, User,
  CheckCircle, Circle, AlertCircle
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
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg shadow-purple-500/25"
        >
          <Plus className="w-4 h-4" />
          צור קהל חדש
        </button>
      </div>

      {/* Audiences Grid */}
      {filteredAudiences.length === 0 ? (
        <div className="text-center py-20 bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-100">
          <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-purple-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">אין קהלים עדיין</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            קהלים מאפשרים לך לקבץ אנשי קשר ולשלוח להם הודעות תפוצה בקלות.
            צור קהל ראשון כדי להתחיל.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25"
          >
            <Plus className="w-5 h-5" />
            צור קהל ראשון
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredAudiences.map(audience => (
            <AudienceCard
              key={audience.id}
              audience={audience}
              onView={() => setShowViewModal(audience)}
              onEdit={() => { setEditAudience(audience); setShowCreateModal(true); }}
              onDelete={() => setDeleteConfirm(audience)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <AudienceCreateModal
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-center mb-2">מחיקת קהל</h3>
            <p className="text-gray-500 text-center mb-6">
              האם למחוק את הקהל "{deleteConfirm.name}"?
              <br />
              <span className="text-sm">פעולה זו לא ניתנת לביטול.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium"
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

// =============================================
// Audience Card Component
// =============================================
function AudienceCard({ audience, onView, onEdit, onDelete }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-lg hover:border-gray-300 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            audience.is_static 
              ? 'bg-gradient-to-br from-purple-500 to-purple-600' 
              : 'bg-gradient-to-br from-blue-500 to-blue-600'
          } shadow-lg`}>
            {audience.is_static ? (
              <Users className="w-6 h-6 text-white" />
            ) : (
              <Target className="w-6 h-6 text-white" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{audience.name}</h3>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              audience.is_static 
                ? 'bg-purple-100 text-purple-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {audience.is_static ? 'קהל סטטי' : 'קהל דינמי'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="עריכה"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
            title="מחיקה"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
      
      {audience.description && (
        <p className="text-sm text-gray-500 mb-4 line-clamp-2">{audience.description}</p>
      )}
      
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Users className="w-4 h-4" />
            <span className="font-semibold">{audience.contacts_count || 0}</span>
            <span className="text-sm text-gray-500">אנשי קשר</span>
          </div>
        </div>
        <button 
          onClick={onView}
          className="flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
        >
          <Eye className="w-4 h-4" />
          צפה בקהל
        </button>
      </div>
    </div>
  );
}

// =============================================
// Audience Create/Edit Modal
// =============================================
function AudienceCreateModal({ audience, onClose, onCreated }) {
  const [step, setStep] = useState(audience ? 2 : 1); // 1: type, 2: details/contacts
  const [isStatic, setIsStatic] = useState(audience?.is_static ?? true);
  const [name, setName] = useState(audience?.name || '');
  const [description, setDescription] = useState(audience?.description || '');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [filterCriteria, setFilterCriteria] = useState(audience?.filter_criteria || {});
  const [saving, setSaving] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Load existing audience contacts if editing
  useEffect(() => {
    if (audience?.is_static && audience?.id) {
      loadAudienceContacts();
    }
  }, [audience]);

  const loadAudienceContacts = async () => {
    try {
      setLoadingContacts(true);
      const { data } = await api.get(`/broadcasts/audiences/${audience.id}/contacts?limit=1000`);
      setSelectedContacts(data.contacts?.map(c => c.id) || []);
    } catch (e) {
      console.error('Failed to load audience contacts:', e);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    
    try {
      setSaving(true);
      
      if (audience) {
        // Update existing
        await api.put(`/broadcasts/audiences/${audience.id}`, {
          name,
          description,
          filter_criteria: isStatic ? {} : filterCriteria
        });
        
        // For static audience, update contacts
        if (isStatic) {
          // Remove all and add selected
          const currentRes = await api.get(`/broadcasts/audiences/${audience.id}/contacts?limit=1000`);
          const currentIds = currentRes.data.contacts?.map(c => c.id) || [];
          
          // Remove contacts not in selectedContacts
          const toRemove = currentIds.filter(id => !selectedContacts.includes(id));
          if (toRemove.length > 0) {
            await api.delete(`/broadcasts/audiences/${audience.id}/contacts`, { data: { contact_ids: toRemove } });
          }
          
          // Add new contacts
          const toAdd = selectedContacts.filter(id => !currentIds.includes(id));
          if (toAdd.length > 0) {
            await api.post(`/broadcasts/audiences/${audience.id}/contacts`, { contact_ids: toAdd });
          }
        }
      } else {
        // Create new
        const { data } = await api.post('/broadcasts/audiences', {
          name,
          description,
          is_static: isStatic,
          filter_criteria: isStatic ? {} : filterCriteria
        });
        
        // For static audience, add contacts
        if (isStatic && selectedContacts.length > 0) {
          await api.post(`/broadcasts/audiences/${data.audience.id}/contacts`, {
            contact_ids: selectedContacts
          });
        }
      }
      
      onCreated();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשמירת קהל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {audience ? 'עריכת קהל' : 'יצירת קהל חדש'}
            </h3>
            <p className="text-sm text-gray-500">
              {step === 1 ? 'בחר סוג קהל' : (isStatic ? 'בחר אנשי קשר' : 'הגדר פילטרים')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <TypeSelection
              isStatic={isStatic}
              onSelect={(type) => { setIsStatic(type); setStep(2); }}
            />
          )}
          
          {step === 2 && (
            <div className="space-y-6">
              {/* Name & Description */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">שם הקהל *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="לדוגמה: לקוחות VIP"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">תיאור (אופציונלי)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תיאור קצר..."
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div>
            {step === 2 && !audience && (
              <button
                onClick={() => setStep(1)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                ← חזור לבחירת סוג
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
            >
              ביטול
            </button>
            {step === 2 && (
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving || (isStatic && selectedContacts.length === 0)}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
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
// Type Selection Component
// =============================================
function TypeSelection({ isStatic, onSelect }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <button
        onClick={() => onSelect(true)}
        className={`p-6 border-2 rounded-2xl text-right transition-all hover:shadow-lg ${
          isStatic ? 'border-purple-500 bg-purple-50 shadow-lg' : 'border-gray-200 hover:border-purple-300'
        }`}
      >
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
          isStatic ? 'bg-purple-600' : 'bg-gray-100'
        }`}>
          <Users className={`w-7 h-7 ${isStatic ? 'text-white' : 'text-gray-400'}`} />
        </div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">קהל סטטי</h4>
        <p className="text-sm text-gray-500 leading-relaxed">
          בחר ידנית אנשי קשר מהרשימה שלך.
          מתאים כשיש לך רשימה ספציפית של אנשים.
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm text-purple-600">
          <UserPlus className="w-4 h-4" />
          בחירה ידנית
        </div>
      </button>
      
      <button
        onClick={() => onSelect(false)}
        className={`p-6 border-2 rounded-2xl text-right transition-all hover:shadow-lg ${
          !isStatic ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-gray-200 hover:border-blue-300'
        }`}
      >
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
          !isStatic ? 'bg-blue-600' : 'bg-gray-100'
        }`}>
          <Target className={`w-7 h-7 ${!isStatic ? 'text-white' : 'text-gray-400'}`} />
        </div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">קהל דינמי</h4>
        <p className="text-sm text-gray-500 leading-relaxed">
          הגדר פילטרים (תגיות, משתנים) והקהל יתעדכן אוטומטית.
          מתאים לקהלים שמשתנים.
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
          <Filter className="w-4 h-4" />
          לפי פילטרים
        </div>
      </button>
    </div>
  );
}

// =============================================
// Contact Picker Component
// =============================================
function ContactPicker({ selectedIds, onChange, loading }) {
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async (reset = false) => {
    try {
      if (reset) {
        setPage(1);
        setContacts([]);
      }
      setLoadingContacts(true);
      const { data } = await api.get('/contacts', {
        params: { page: reset ? 1 : page, limit: 50, search: searchQuery }
      });
      
      if (reset) {
        setContacts(data.contacts || []);
      } else {
        setContacts(prev => [...prev, ...(data.contacts || [])]);
      }
      setHasMore(data.pagination?.page < data.pagination?.pages);
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSearch = () => {
    loadContacts(true);
  };

  const toggleContact = (contactId) => {
    if (selectedIds.includes(contactId)) {
      onChange(selectedIds.filter(id => id !== contactId));
    } else {
      onChange([...selectedIds, contactId]);
    }
  };

  const selectAll = () => {
    onChange(contacts.map(c => c.id));
  };

  const deselectAll = () => {
    onChange([]);
  };

  const filteredContacts = contacts.filter(c => 
    !searchQuery || 
    c.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="חיפוש לפי שם או טלפון..."
            className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium"
        >
          חפש
        </button>
      </div>

      {/* Selection Summary */}
      <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl p-3">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-purple-600" />
          <span className="font-medium text-purple-900">{selectedIds.length} אנשי קשר נבחרו</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
            בחר הכל
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={deselectAll} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
            נקה בחירה
          </button>
        </div>
      </div>

      {/* Contacts List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto">
          {loadingContacts && contacts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>לא נמצאו אנשי קשר</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredContacts.map(contact => (
                <label
                  key={contact.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    selectedIds.includes(contact.id)
                      ? 'bg-purple-600 border-purple-600'
                      : 'border-gray-300'
                  }`}>
                    {selectedIds.includes(contact.id) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                    {contact.profile_picture_url ? (
                      <img src={contact.profile_picture_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {contact.display_name || 'ללא שם'}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {contact.phone}
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
        
        {/* Load More */}
        {hasMore && !loadingContacts && (
          <div className="p-3 border-t border-gray-100 text-center">
            <button
              onClick={() => { setPage(p => p + 1); loadContacts(); }}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              טען עוד אנשי קשר
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Filter Builder Component (for Dynamic Audiences)
// =============================================
function FilterBuilder({ criteria, onChange }) {
  const [tags, setTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(true);

  useEffect(() => {
    loadTags();
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

  const toggleTag = (tagName) => {
    const currentTags = criteria.tags || [];
    if (currentTags.includes(tagName)) {
      onChange({ ...criteria, tags: currentTags.filter(t => t !== tagName) });
    } else {
      onChange({ ...criteria, tags: [...currentTags, tagName] });
    }
  };

  const selectedTags = criteria.tags || [];

  return (
    <div className="space-y-6">
      {/* Tags Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          <Tag className="w-4 h-4 inline ml-1" />
          סינון לפי תגיות
        </label>
        
        {loadingTags ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">טוען תגיות...</span>
          </div>
        ) : tags.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4 text-center">
            <Tag className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>אין תגיות עדיין. צור תגיות בדף אנשי הקשר.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedTags.includes(tag.name)
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={selectedTags.includes(tag.name) ? {} : { borderRightWidth: 4, borderRightColor: tag.color }}
              >
                {selectedTags.includes(tag.name) && <Check className="w-3 h-3 inline ml-1" />}
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Other Filters */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          <Filter className="w-4 h-4 inline ml-1" />
          פילטרים נוספים
        </label>
        
        <div className="grid md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={criteria.is_blocked === false}
              onChange={(e) => onChange({ 
                ...criteria, 
                is_blocked: e.target.checked ? false : undefined 
              })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium text-gray-900">ללא חסומים</div>
              <div className="text-xs text-gray-500">הצג רק אנשי קשר שאינם חסומים</div>
            </div>
          </label>
          
          <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={criteria.is_bot_active === true}
              onChange={(e) => onChange({ 
                ...criteria, 
                is_bot_active: e.target.checked ? true : undefined 
              })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium text-gray-900">בוט פעיל</div>
              <div className="text-xs text-gray-500">רק אנשי קשר עם בוט פעיל</div>
            </div>
          </label>
        </div>
      </div>

      {/* Summary */}
      {(selectedTags.length > 0 || criteria.is_blocked !== undefined || criteria.is_bot_active !== undefined) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-blue-900">
            <AlertCircle className="w-4 h-4" />
            <span>הקהל יכלול את כל אנשי הקשר שעונים לתנאים שהגדרת. הרשימה מתעדכנת אוטומטית.</span>
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
        params: { page, limit: 20 }
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              audience.is_static ? 'bg-purple-600' : 'bg-blue-600'
            }`}>
              {audience.is_static ? (
                <Users className="w-5 h-5 text-white" />
              ) : (
                <Target className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{audience.name}</h3>
              <p className="text-sm text-gray-500">{audience.contacts_count || 0} אנשי קשר</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-140px)]">
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
                <div key={contact.id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                    {contact.profile_picture_url ? (
                      <img src={contact.profile_picture_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{contact.display_name || 'ללא שם'}</div>
                    <div className="text-sm text-gray-500">{contact.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
            >
              הקודם
            </button>
            <span className="text-sm text-gray-600">
              עמוד {page} מתוך {pagination.pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
            >
              הבא
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
