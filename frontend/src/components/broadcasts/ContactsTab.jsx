import { useState, useEffect } from 'react';
import { 
  Search, Plus, Edit2, Trash2, Users, Phone, User, Tag,
  ChevronLeft, ChevronRight, Loader2, X, Check, Filter,
  MoreHorizontal, Download, RefreshCw, Mail, AlertCircle, Variable, Upload,
  Calendar, MessageSquare, Eye, Clock, Hash, ExternalLink
} from 'lucide-react';
import api from '../../services/api';
import ImportTab from './ImportTab';

// Helper to check if contact is a group
function isGroupContact(contact) {
  return contact?.phone?.includes('@g.us');
}

// Format phone for display (hide @g.us)
function formatContactPhone(phone) {
  if (!phone) return '';
  if (phone.includes('@g.us')) {
    return phone.replace('@g.us', '');
  }
  return phone;
}

export default function ContactsTab({ onRefresh }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [filterTag, setFilterTag] = useState('');
  const [contactTypeFilter, setContactTypeFilter] = useState('chats'); // 'all' | 'chats' | 'groups'
  
  // View modal
  const [viewingContact, setViewingContact] = useState(null);
  const [viewContactVariables, setViewContactVariables] = useState([]);
  const [loadingView, setLoadingView] = useState(false);
  
  // Edit modal
  const [editingContact, setEditingContact] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: '', phone: '' });
  const [contactVariables, setContactVariables] = useState([]);
  const [allVariables, setAllVariables] = useState([]);
  const [saving, setSaving] = useState(false);
  
  // Add variable modal
  const [showAddVariableModal, setShowAddVariableModal] = useState(false);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');
  
  // Tags modal
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [selectedForTags, setSelectedForTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  
  // Single contact tag modal
  const [showSingleTagModal, setShowSingleTagModal] = useState(null);
  const [singleTagInput, setSingleTagInput] = useState('');
  
  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  
  // WhatsApp import
  const [pullingWhatsApp, setPullingWhatsApp] = useState(false);
  const [pullResult, setPullResult] = useState(null);
  const [importingGroupId, setImportingGroupId] = useState(null);
  
  const pageSize = 50;

  useEffect(() => {
    loadContacts();
    loadTags();
    loadAllVariables();
  }, [currentPage, searchQuery, filterTag, contactTypeFilter]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
        ...(searchQuery && { search: searchQuery }),
        ...(filterTag && { tag: filterTag }),
        ...(contactTypeFilter && contactTypeFilter !== 'all' && { contact_type: contactTypeFilter })
      });
      
      const { data } = await api.get(`/contacts?${params}`);
      setContacts(data.contacts || []);
      setTotalContacts(data.total || 0);
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const { data } = await api.get('/contacts/tags');
      setTags(data.tags || []);
    } catch (e) {
      console.error('Failed to load tags:', e);
    }
  };

  const loadAllVariables = async () => {
    try {
      const { data } = await api.get('/variables');
      const vars = [
        ...(data.userVariables || []).map(v => ({ key: v.name, label: v.label || v.name })),
        ...(data.customSystemVariables || []).map(v => ({ key: v.name, label: v.label || v.name }))
      ];
      setAllVariables(vars);
    } catch (e) {
      console.error('Failed to load variables:', e);
    }
  };

  const [loadingVars, setLoadingVars] = useState(false);

  // View Contact
  const handleViewContact = async (contact) => {
    setViewingContact(contact);
    setLoadingView(true);
    
    try {
      const { data } = await api.get(`/contacts/${contact.id}/variables`);
      setViewContactVariables(data.variables || []);
    } catch (e) {
      console.error('Failed to load contact variables:', e);
      setViewContactVariables([]);
    } finally {
      setLoadingView(false);
    }
  };

  const handleEditContact = async (contact) => {
    setViewingContact(null); // Close view modal if open
    setEditingContact(contact);
    setEditForm({
      display_name: contact.display_name || '',
      phone: contact.phone || ''
    });
    setContactVariables([]);
    setLoadingVars(true);
    
    try {
      const [varsRes, allVarsRes] = await Promise.all([
        api.get(`/contacts/${contact.id}/variables`),
        api.get('/variables')
      ]);
      
      const contactVars = varsRes.data.variables || [];
      const allVars = [
        ...(allVarsRes.data.userVariables || []).map(v => ({ key: v.name, label: v.label || v.name })),
        ...(allVarsRes.data.customSystemVariables || []).map(v => ({ key: v.name, label: v.label || v.name }))
      ];
      
      const mergedVars = allVars.map(v => {
        const contactVar = contactVars.find(cv => cv.key === v.key);
        return {
          key: v.key,
          label: v.label || v.key,
          value: contactVar?.value || ''
        };
      });
      
      contactVars.forEach(cv => {
        if (!mergedVars.find(v => v.key === cv.key)) {
          mergedVars.push({
            key: cv.key,
            label: cv.key,
            value: cv.value || ''
          });
        }
      });
      
      setContactVariables(mergedVars);
      setAllVariables(allVars);
    } catch (e) {
      console.error('Failed to load variables:', e);
      setContactVariables([]);
    } finally {
      setLoadingVars(false);
    }
  };

  const handleAddVariable = () => {
    if (!newVarKey.trim()) return;
    
    const newVar = {
      key: newVarKey.trim(),
      label: newVarLabel.trim() || newVarKey.trim(),
      value: '',
      isNew: true
    };
    
    if (contactVariables.find(v => v.key === newVar.key)) {
      alert('משתנה זה כבר קיים');
      return;
    }
    
    setContactVariables([...contactVariables, newVar]);
    setShowAddVariableModal(false);
    setNewVarKey('');
    setNewVarLabel('');
  };

  const handleSaveContact = async () => {
    if (!editingContact) return;
    
    try {
      setSaving(true);
      await api.put(`/contacts/${editingContact.id}`, editForm);
      
      for (const v of contactVariables) {
        if (v.isNew) {
          try {
            await api.post('/variables', { key: v.key, label: v.label || v.key });
          } catch (e) {}
        }
      }
      
      for (const v of contactVariables) {
        if (v.value !== undefined && v.value !== null) {
          await api.post(`/contacts/${editingContact.id}/variables`, { key: v.key, value: v.value });
        }
      }
      
      setEditingContact(null);
      loadContacts();
      loadAllVariables();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (contact) => {
    if (!confirm(`למחוק את ${contact.display_name || contact.phone}?`)) return;
    
    try {
      await api.delete(`/contacts/${contact.id}`);
      setViewingContact(null);
      loadContacts();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`למחוק ${selectedContacts.length} אנשי קשר?`)) return;
    
    try {
      await api.post('/contacts/bulk-delete', { contactIds: selectedContacts });
      setSelectedContacts([]);
      loadContacts();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקה');
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim() || selectedForTags.length === 0) return;
    
    try {
      await api.post('/contacts/bulk-tag', { 
        contact_ids: selectedForTags.length > 0 ? selectedForTags : selectedContacts,
        tag: newTag.trim() 
      });
      setNewTag('');
      setShowTagsModal(false);
      setSelectedForTags([]);
      loadContacts();
      loadTags();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהוספת תגית');
    }
  };

  // Add tag to single contact
  const handleAddSingleTag = async (contactId) => {
    if (!singleTagInput.trim()) return;
    
    try {
      await api.post('/contacts/bulk-tag', { 
        contact_ids: [contactId],
        tag: singleTagInput.trim() 
      });
      setSingleTagInput('');
      setShowSingleTagModal(null);
      loadContacts();
      loadTags();
      
      // Refresh viewing contact if open
      if (viewingContact?.id === contactId) {
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
          setViewingContact({
            ...contact,
            tags: [...(contact.tags || []), singleTagInput.trim()]
          });
        }
      }
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהוספת תגית');
    }
  };

  // Remove tag from contact
  const handleRemoveTag = async (contactId, tagToRemove) => {
    try {
      await api.delete(`/contacts/${contactId}/tags/${encodeURIComponent(tagToRemove)}`);
      loadContacts();
      
      // Refresh viewing contact if open
      if (viewingContact?.id === contactId) {
        setViewingContact({
          ...viewingContact,
          tags: (viewingContact.tags || []).filter(t => t !== tagToRemove)
        });
      }
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בהסרת תגית');
    }
  };

  const toggleSelectAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map(c => c.id));
    }
  };

  const toggleSelectContact = (id) => {
    setSelectedContacts(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const totalPages = Math.ceil(totalContacts / pageSize);

  const handlePullWhatsAppContacts = async () => {
    try {
      setPullingWhatsApp(true);
      setPullResult(null);
      const { data } = await api.post('/whatsapp/contacts/pull');
      setPullResult({ success: true, ...data });
      if (data.imported > 0) {
        loadContacts();
        onRefresh?.();
      }
    } catch (e) {
      setPullResult({ success: false, error: e.response?.data?.error || 'שגיאה במשיכת אנשי קשר' });
    } finally {
      setPullingWhatsApp(false);
    }
  };

  const handleImportGroupParticipants = async (groupPhone) => {
    try {
      setImportingGroupId(groupPhone);
      // Format group ID - add @g.us if not present
      const groupId = groupPhone.includes('@') ? groupPhone : `${groupPhone}@g.us`;
      const { data } = await api.post(
        `/whatsapp/groups/${encodeURIComponent(groupId)}/participants/import`,
        { excludeAdmins: false }
      );
      setPullResult({ success: true, ...data });
      if (data.imported > 0) {
        loadContacts();
        onRefresh?.();
      }
    } catch (e) {
      setPullResult({ success: false, error: e.response?.data?.error || 'שגיאה בייבוא משתתפי הקבוצה' });
    } finally {
      setImportingGroupId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">אנשי קשר</h2>
          <p className="text-sm text-gray-500">{totalContacts.toLocaleString()} אנשי קשר במערכת</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePullWhatsAppContacts}
            disabled={pullingWhatsApp}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 font-medium shadow-lg shadow-green-500/25 disabled:opacity-50"
            title="משיכת אנשי קשר מוואטסאפ"
          >
            {pullingWhatsApp ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            משיכה מוואטסאפ
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 font-medium shadow-lg shadow-orange-500/25"
          >
            <Upload className="w-4 h-4" />
            ייבוא מקובץ
          </button>
          <button
            onClick={loadContacts}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Pull Result Message */}
      {pullResult && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          pullResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {pullResult.success ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <div className="flex-1">
            <p className={pullResult.success ? 'text-green-800' : 'text-red-800'}>
              {pullResult.success ? pullResult.message : pullResult.error}
            </p>
            {pullResult.success && pullResult.remaining !== undefined && (
              <p className="text-sm text-green-600 mt-1">
                נותרו {pullResult.remaining} מקומות פנויים מתוך {pullResult.maxContacts}
              </p>
            )}
          </div>
          <button 
            onClick={() => setPullResult(null)}
            className="p-1 hover:bg-white/50 rounded"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Contact Type Filter */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => { setContactTypeFilter('chats'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              contactTypeFilter === 'chats' 
                ? 'bg-white text-orange-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              צ'אטים
            </span>
          </button>
          <button
            onClick={() => { setContactTypeFilter('groups'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              contactTypeFilter === 'groups' 
                ? 'bg-white text-orange-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              קבוצות
            </span>
          </button>
          <button
            onClick={() => { setContactTypeFilter('all'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              contactTypeFilter === 'all' 
                ? 'bg-white text-orange-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            הכל
          </button>
        </div>
        
        <div className="flex-1 min-w-[250px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="חיפוש לפי שם או טלפון..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          />
        </div>
        
        <select
          value={filterTag}
          onChange={(e) => { setFilterTag(e.target.value); setCurrentPage(1); }}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
        >
          <option value="">כל התגיות</option>
          {tags.map(tag => {
            const tagName = typeof tag === 'string' ? tag : tag.name;
            return <option key={tagName} value={tagName}>{tagName}</option>;
          })}
        </select>
      </div>

      {/* Bulk Actions */}
      {selectedContacts.length > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
          <span className="text-sm font-medium text-orange-800">
            {selectedContacts.length} נבחרו
          </span>
          <div className="flex-1" />
          <button
            onClick={() => { setSelectedForTags(selectedContacts); setShowTagsModal(true); }}
            className="px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-sm font-medium text-orange-700 hover:bg-orange-50 flex items-center gap-1"
          >
            <Tag className="w-4 h-4" />
            הוסף תגית
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 bg-red-100 border border-red-200 rounded-lg text-sm font-medium text-red-700 hover:bg-red-200 flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" />
            מחק
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">לא נמצאו אנשי קשר</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right">
                    <input
                      type="checkbox"
                      checked={selectedContacts.length === contacts.length && contacts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">שם</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">טלפון</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">תגיות</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">נוצר</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-32">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map(contact => (
                  <tr 
                    key={contact.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleViewContact(contact)}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => toggleSelectContact(contact.id)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isGroupContact(contact) 
                            ? 'bg-gradient-to-br from-purple-400 to-purple-600' 
                            : 'bg-gradient-to-br from-orange-400 to-red-500'
                        }`}>
                          {isGroupContact(contact) ? (
                            <Users className="w-4 h-4 text-white" />
                          ) : (
                            <span className="text-white font-medium text-sm">
                              {(contact.display_name || contact.phone || '?')[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {contact.display_name || 'ללא שם'}
                          </span>
                          {isGroupContact(contact) && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">קבוצה</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 font-mono text-sm">{formatContactPhone(contact.phone)}</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1 items-center">
                        {(contact.tags || []).slice(0, 2).map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                        {(contact.tags || []).length > 2 && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                            +{contact.tags.length - 2}
                          </span>
                        )}
                        <button
                          onClick={() => setShowSingleTagModal(contact.id)}
                          className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded"
                          title="הוסף תגית"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(contact.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {isGroupContact(contact) && (
                          <button
                            onClick={() => handleImportGroupParticipants(contact.phone)}
                            disabled={importingGroupId === contact.phone}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                            title="ייבא משתתפי קבוצה"
                          >
                            {importingGroupId === contact.phone ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleViewContact(contact)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="צפה"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditContact(contact)}
                          className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded"
                          title="ערוך"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              מציג {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalContacts)} מתוך {totalContacts.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Contact Modal */}
      {viewingContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewingContact(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {(viewingContact.display_name || viewingContact.phone || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      {viewingContact.display_name || 'ללא שם'}
                    </h3>
                    <p className="text-white/80 font-mono text-lg" dir="ltr">{viewingContact.phone}</p>
                  </div>
                </div>
                <button onClick={() => setViewingContact(null)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
              {/* Quick Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Calendar className="w-4 h-4" />
                    נוצר
                  </div>
                  <p className="font-medium text-gray-900">
                    {new Date(viewingContact.created_at).toLocaleDateString('he-IL', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Clock className="w-4 h-4" />
                    הודעה אחרונה
                  </div>
                  <p className="font-medium text-gray-900">
                    {viewingContact.last_message_at 
                      ? new Date(viewingContact.last_message_at).toLocaleDateString('he-IL', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })
                      : 'אין'}
                  </p>
                </div>
              </div>

              {/* Tags Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-orange-600" />
                    תגיות
                  </h4>
                  <button
                    onClick={() => setShowSingleTagModal(viewingContact.id)}
                    className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף תגית
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(viewingContact.tags || []).length > 0 ? (
                    viewingContact.tags.map(tag => (
                      <span 
                        key={tag} 
                        className="group px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm flex items-center gap-2"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(viewingContact.id, tag)}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400">אין תגיות</p>
                  )}
                </div>
              </div>

              {/* Variables Section */}
              <div>
                <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <Variable className="w-4 h-4 text-orange-600" />
                  משתנים
                </h4>
                {loadingView ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  </div>
                ) : viewContactVariables.length > 0 ? (
                  <div className="grid gap-3">
                    {viewContactVariables.map(v => (
                      <div key={v.key} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                        <span className="text-sm text-gray-500">{v.label || v.key}</span>
                        <span className="font-medium text-gray-900">{v.value || '-'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">אין משתנים מוגדרים</p>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-gray-100 p-4 flex gap-3">
              <button
                onClick={() => setViewingContact(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                סגור
              </button>
              <button
                onClick={() => handleEditContact(viewingContact)}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium flex items-center justify-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                ערוך
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Contact Tag Modal */}
      {showSingleTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowSingleTagModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">הוספת תגית</h3>
            
            <div className="space-y-4">
              <input
                type="text"
                value={singleTagInput}
                onChange={(e) => setSingleTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSingleTag(showSingleTagModal)}
                placeholder="שם התגית..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                autoFocus
              />
              
              {tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">תגיות קיימות:</p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {tags.map(tag => {
                      const tagName = typeof tag === 'string' ? tag : tag.name;
                      return (
                        <button
                          key={tagName}
                          onClick={() => {
                            setSingleTagInput(tagName);
                          }}
                          onDoubleClick={() => {
                            setSingleTagInput(tagName);
                            handleAddSingleTag(showSingleTagModal);
                          }}
                          className={`px-3 py-1 rounded-full text-sm transition-colors ${
                            singleTagInput === tagName
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {tagName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowSingleTagModal(null); setSingleTagInput(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => handleAddSingleTag(showSingleTagModal)}
                disabled={!singleTagInput.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium disabled:opacity-50"
              >
                הוסף תגית
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editingContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingContact(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">עריכת איש קשר</h3>
              <button onClick={() => setEditingContact(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 font-mono"
                  dir="ltr"
                />
              </div>

              {/* Variables Section */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Variable className="w-4 h-4" />
                    משתנים ({contactVariables.length})
                  </h4>
                  <button
                    onClick={() => setShowAddVariableModal(true)}
                    className="px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    צור משתנה חדש
                  </button>
                </div>
                
                {loadingVars ? (
                  <div className="text-center py-6 bg-gray-50 rounded-xl">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">טוען משתנים...</p>
                  </div>
                ) : contactVariables.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-xl">
                    <Variable className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">אין משתנים מוגדרים במערכת</p>
                    <button
                      onClick={() => setShowAddVariableModal(true)}
                      className="text-xs text-orange-600 hover:text-orange-700 mt-1"
                    >
                      צור משתנה ראשון
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {contactVariables.map((v, i) => (
                      <div key={v.key} className="flex gap-2 bg-gray-50 p-3 rounded-lg">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {v.label || v.key}
                            {v.isNew && <span className="text-orange-500 mr-1">(חדש)</span>}
                          </label>
                          <input
                            type="text"
                            value={v.value || ''}
                            onChange={(e) => {
                              const newVars = [...contactVariables];
                              newVars[i] = { ...v, value: e.target.value };
                              setContactVariables(newVars);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            placeholder={`הכנס ערך...`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingContact(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveContact}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Variable Modal */}
      {showAddVariableModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowAddVariableModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">יצירת משתנה חדש</h3>
            <p className="text-sm text-gray-500 mb-4">
              המשתנה החדש יתווסף למערכת ויהיה זמין לכל אנשי הקשר
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  מפתח (באנגלית) *
                </label>
                <input
                  type="text"
                  value={newVarKey}
                  onChange={(e) => setNewVarKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="לדוגמה: company_name"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  dir="ltr"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">רק אותיות אנגליות, מספרים וקו תחתון</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תווית (לתצוגה)
                </label>
                <input
                  type="text"
                  value={newVarLabel}
                  onChange={(e) => setNewVarLabel(e.target.value)}
                  placeholder="לדוגמה: שם החברה"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAddVariableModal(false); setNewVarKey(''); setNewVarLabel(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleAddVariable}
                disabled={!newVarKey.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium disabled:opacity-50"
              >
                צור והוסף
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tags Modal (Bulk) */}
      {showTagsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTagsModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">הוספת תגית</h3>
            <p className="text-sm text-gray-500 mb-4">
              התגית תתווסף ל-{selectedForTags.length || selectedContacts.length} אנשי קשר
            </p>
            
            <div className="space-y-4">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="שם התגית..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                autoFocus
              />
              
              {tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">תגיות קיימות:</p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => {
                      const tagName = typeof tag === 'string' ? tag : tag.name;
                      return (
                        <button
                          key={tagName}
                          onClick={() => setNewTag(tagName)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm"
                        >
                          {tagName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTagsModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-medium disabled:opacity-50"
              >
                הוסף תגית
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                  <Upload className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">ייבוא אנשי קשר</h3>
                  <p className="text-orange-100 text-sm">העלה קובץ Excel או CSV</p>
                </div>
              </div>
              <button 
                onClick={() => setShowImportModal(false)}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <ImportTab 
                onRefresh={() => {
                  loadContacts();
                  onRefresh?.();
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
