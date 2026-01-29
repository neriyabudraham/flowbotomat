import { useState, useRef, useCallback } from 'react';
import { Search, Users, MessageSquare, Bot, Activity, Trash2, Download, X, CheckSquare, Square, MoreHorizontal, Loader2, UsersRound } from 'lucide-react';
import ContactItem from '../molecules/ContactItem';
import DeleteContactModal from '../contacts/DeleteContactModal';
import api from '../../services/api';

export default function ContactsList({ 
  contacts, 
  selectedId, 
  onSelect, 
  onSearch, 
  stats, 
  onContactsChange,
  onLoadMore,
  hasMoreContacts,
  loadingMoreContacts,
  totalContacts
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, active, bot
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [selectAllMode, setSelectAllMode] = useState(false); // true = select ALL contacts including unloaded
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const listRef = useRef(null);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    onSearch(value);
  };

  // Handle scroll for infinite loading
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Load more when 100px from bottom
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMoreContacts && !loadingMoreContacts && onLoadMore) {
      onLoadMore();
    }
  }, [hasMoreContacts, loadingMoreContacts, onLoadMore]);

  const filteredContacts = contacts.filter(c => {
    if (filter === 'active') {
      const activityTime = c.actual_last_message_at || c.last_message_at;
      if (!activityTime) return false;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return new Date(activityTime) > hourAgo;
    }
    if (filter === 'bot') return c.is_bot_active;
    return true;
  });

  const toggleSelectContact = (contactId) => {
    setSelectAllMode(false); // Exit select all mode when manually toggling
    setSelectedContacts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAllLoaded = () => {
    // If in selectAllMode, deselect everything
    if (selectAllMode) {
      setSelectAllMode(false);
      setSelectedContacts([]);
      return;
    }
    
    // Toggle: if all loaded are selected, deselect; otherwise select all loaded
    if (selectedContacts.length === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map(c => c.id));
    }
  };

  const selectAllContacts = () => {
    setSelectAllMode(true);
    // Mark all loaded contacts as selected for visual feedback
    setSelectedContacts(filteredContacts.map(c => c.id));
  };
  
  // Check if all loaded contacts are selected (either manually or via selectAllMode)
  const allLoadedSelected = selectAllMode || 
    (selectedContacts.length === filteredContacts.length && filteredContacts.length > 0);

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedContacts([]);
    setSelectAllMode(false);
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.length === 0 && !selectAllMode) return;
    setShowDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    setDeleting(true);
    try {
      if (selectAllMode) {
        // Delete ALL contacts (server-side)
        await api.post('/contacts/bulk-delete', { deleteAll: true, search: search || undefined });
      } else {
        await api.post('/contacts/bulk-delete', { contactIds: selectedContacts });
      }
      setSelectedContacts([]);
      setSelectAllMode(false);
      setIsSelectionMode(false);
      setShowDeleteModal(false);
      onContactsChange?.();
    } catch (error) {
      console.error('Bulk delete error:', error);
    }
    setDeleting(false);
  };

  const handleExport = async (exportSelected = false) => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (exportSelected) {
        if (selectAllMode) {
          // Export ALL (server-side handles it)
          params.append('exportAll', 'true');
          if (search) params.append('search', search);
        } else if (selectedContacts.length > 0) {
          params.append('contactIds', selectedContacts.join(','));
        }
      }
      
      const response = await api.get(`/contacts/export?${params.toString()}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contacts_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setShowActions(false);
    } catch (error) {
      console.error('Export error:', error);
      alert('שגיאה בייצוא אנשי קשר');
    }
    setExporting(false);
  };

  // Get the actual count for display
  const getSelectedCount = () => {
    if (selectAllMode) {
      return totalContacts || stats?.total || contacts.length;
    }
    return selectedContacts.length;
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with gradient */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-white via-blue-50/30 to-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">אנשי קשר</h2>
              <p className="text-xs text-gray-500">{stats?.total || contacts.length} סה"כ</p>
            </div>
          </div>
          
          {/* Actions Menu */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <MoreHorizontal className="w-5 h-5 text-gray-600" />
            </button>
            
            {showActions && (
              <div className="absolute left-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[180px] z-50">
                <button
                  onClick={() => {
                    setIsSelectionMode(true);
                    setShowActions(false);
                  }}
                  className="w-full px-4 py-2.5 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <CheckSquare className="w-4 h-4 text-gray-500" />
                  בחירה מרובה
                </button>
                <button
                  onClick={() => handleExport(false)}
                  disabled={exporting}
                  className="w-full px-4 py-2.5 text-right text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-gray-500" />
                  {exporting ? 'מייצא...' : 'ייצא הכל (CSV)'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Selection Mode Bar */}
        {isSelectionMode && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2">
              <button
                onClick={selectAllLoaded}
                className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
                title={allLoadedSelected ? "בטל בחירה" : "בחר את כל הנטענים"}
              >
                {allLoadedSelected ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-blue-600" />
                )}
              </button>
                <span className="text-sm font-medium text-blue-800">
                  {selectAllMode ? (
                    <span className="text-indigo-600 font-bold">
                      כל {(totalContacts || stats?.total || 0).toLocaleString()} נבחרו
                    </span>
                  ) : (
                    `${selectedContacts.length} נבחרו`
                  )}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {(selectedContacts.length > 0 || selectAllMode) && (
                  <>
                    <button
                      onClick={() => handleExport(true)}
                      disabled={exporting}
                      className="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                      title="ייצא נבחרים"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      disabled={deleting}
                      className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                      title="מחק נבחרים"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={cancelSelection}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
            
            {/* Select ALL button - shows when all loaded are selected but there are more */}
            {allLoadedSelected && 
             !selectAllMode && 
             (totalContacts || stats?.total || 0) > filteredContacts.length && (
              <button
                onClick={selectAllContacts}
                className="w-full p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <UsersRound className="w-4 h-4" />
                בחר את כל {(totalContacts || stats?.total || 0).toLocaleString()} אנשי הקשר
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="חיפוש לפי שם או טלפון..."
            className="w-full pr-11 pl-4 py-3 bg-gray-50/80 border border-gray-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 text-sm transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-700 shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            הכל
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'active'
                ? 'bg-green-100 text-green-700 shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            פעילים
          </button>
          <button
            onClick={() => setFilter('bot')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === 'bot'
                ? 'bg-purple-100 text-purple-700 shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            בוט
          </button>
        </div>
      </div>

      {/* List */}
      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="relative w-20 h-20 mx-auto mb-4">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-2xl blur-xl opacity-20" />
              <div className="relative w-full h-full bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-gray-400" />
              </div>
            </div>
            <p className="font-semibold text-gray-900 mb-1">
              {search ? 'לא נמצאו תוצאות' : 'אין אנשי קשר עדיין'}
            </p>
            <p className="text-sm text-gray-500">
              {search ? 'נסה חיפוש אחר' : 'כשמישהו ישלח הודעה, הוא יופיע כאן'}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className="flex items-center">
                {isSelectionMode && (
                  <button
                    onClick={() => toggleSelectContact(contact.id)}
                    className="p-3 flex-shrink-0"
                  >
                    {(selectAllMode || selectedContacts.includes(contact.id)) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                )}
                <div className={`flex-1 ${isSelectionMode ? 'mr-0' : ''}`}>
                  <ContactItem
                    contact={contact}
                    isSelected={selectedId === contact.id}
                    onClick={() => !isSelectionMode && onSelect(contact.id)}
                  />
                </div>
              </div>
            ))}
            
            {/* Load more indicator */}
            {loadingMoreContacts && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="mr-2 text-sm text-gray-500">טוען עוד...</span>
              </div>
            )}
            
            {/* Show loaded count */}
            {!loadingMoreContacts && hasMoreContacts && (
              <div className="text-center py-3 text-xs text-gray-400">
                מציג {filteredContacts.length} מתוך {(totalContacts || stats?.total || 0).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Modal */}
      <DeleteContactModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmBulkDelete}
        contactCount={selectedContacts.length}
        isLoading={deleting}
      />
    </div>
  );
}
