import { useState } from 'react';
import { Search, Users, MessageSquare, Filter, Bot, Activity, Sparkles, Trash2, Download, X, CheckSquare, Square, MoreHorizontal } from 'lucide-react';
import ContactItem from '../molecules/ContactItem';
import api from '../../services/api';

export default function ContactsList({ contacts, selectedId, onSelect, onSearch, stats, onContactsChange }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, active, bot
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    onSearch(value);
  };

  const filteredContacts = contacts.filter(c => {
    if (filter === 'active') {
      if (!c.last_message_at) return false;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return new Date(c.last_message_at) > hourAgo;
    }
    if (filter === 'bot') return c.is_bot_active;
    return true;
  });

  const toggleSelectContact = (contactId) => {
    setSelectedContacts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map(c => c.id));
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedContacts([]);
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.length === 0) return;
    
    const confirmed = window.confirm(`האם אתה בטוח שברצונך למחוק ${selectedContacts.length} אנשי קשר?`);
    if (!confirmed) return;
    
    setDeleting(true);
    try {
      await api.post('/contacts/bulk-delete', { contactIds: selectedContacts });
      setSelectedContacts([]);
      setIsSelectionMode(false);
      onContactsChange?.();
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('שגיאה במחיקת אנשי קשר');
    }
    setDeleting(false);
  };

  const handleExport = async (exportSelected = false) => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (exportSelected && selectedContacts.length > 0) {
        params.append('contactIds', selectedContacts.join(','));
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
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl mb-3 border border-blue-100">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
              >
                {selectedContacts.length === filteredContacts.length ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-blue-600" />
                )}
              </button>
              <span className="text-sm font-medium text-blue-800">
                {selectedContacts.length} נבחרו
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {selectedContacts.length > 0 && (
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
      <div className="flex-1 overflow-y-auto">
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
                    {selectedContacts.includes(contact.id) ? (
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
          </div>
        )}
      </div>
    </div>
  );
}
