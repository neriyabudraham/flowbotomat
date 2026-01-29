import { useState, useEffect } from 'react';
import { 
  Search, Plus, Edit2, Trash2, Users, Phone, User, Tag,
  ChevronLeft, ChevronRight, Loader2, X, Check, Filter,
  MoreHorizontal, Download, RefreshCw, Mail, AlertCircle
} from 'lucide-react';
import api from '../../services/api';

export default function ContactsTab({ onRefresh }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [filterTag, setFilterTag] = useState('');
  
  // Edit modal
  const [editingContact, setEditingContact] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: '', phone: '' });
  const [contactVariables, setContactVariables] = useState([]);
  const [saving, setSaving] = useState(false);
  
  // Tags modal
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [selectedForTags, setSelectedForTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  
  const pageSize = 50;

  useEffect(() => {
    loadContacts();
    loadTags();
  }, [currentPage, searchQuery, filterTag]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
        ...(searchQuery && { search: searchQuery }),
        ...(filterTag && { tag: filterTag })
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

  const handleEditContact = async (contact) => {
    setEditingContact(contact);
    setEditForm({
      display_name: contact.display_name || '',
      phone: contact.phone || ''
    });
    
    // Load contact variables
    try {
      const { data } = await api.get(`/contacts/${contact.id}/variables`);
      setContactVariables(data.variables || []);
    } catch (e) {
      setContactVariables([]);
    }
  };

  const handleSaveContact = async () => {
    if (!editingContact) return;
    
    try {
      setSaving(true);
      await api.put(`/contacts/${editingContact.id}`, editForm);
      
      // Save variables
      for (const v of contactVariables) {
        if (v.value) {
          await api.put(`/contacts/${editingContact.id}/variables/${v.key}`, { value: v.value });
        }
      }
      
      setEditingContact(null);
      loadContacts();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">אנשי קשר</h2>
          <p className="text-sm text-gray-500">{totalContacts.toLocaleString()} אנשי קשר במערכת</p>
        </div>
        <button
          onClick={loadContacts}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
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
          {tags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-24">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => toggleSelectContact(contact.id)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-orange-600" />
                        </div>
                        <span className="font-medium text-gray-900">
                          {contact.display_name || 'ללא שם'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 font-mono text-sm">{contact.phone}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                        {(contact.tags || []).length > 3 && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                            +{contact.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(contact.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditContact(contact)}
                          className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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

              {contactVariables.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">משתנים</h4>
                  <div className="space-y-3">
                    {contactVariables.map((v, i) => (
                      <div key={v.key}>
                        <label className="block text-xs text-gray-500 mb-1">{v.key}</label>
                        <input
                          type="text"
                          value={v.value || ''}
                          onChange={(e) => {
                            const newVars = [...contactVariables];
                            newVars[i] = { ...v, value: e.target.value };
                            setContactVariables(newVars);
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

      {/* Tags Modal */}
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
                    {tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setNewTag(tag)}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm"
                      >
                        {tag}
                      </button>
                    ))}
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
    </div>
  );
}
