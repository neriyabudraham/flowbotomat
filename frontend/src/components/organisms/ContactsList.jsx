import { useState } from 'react';
import { Search, Users, MessageSquare, Filter, Bot, Activity, Sparkles } from 'lucide-react';
import ContactItem from '../molecules/ContactItem';

export default function ContactsList({ contacts, selectedId, onSelect, onSearch, stats }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, active, bot

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
        </div>

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
              <ContactItem
                key={contact.id}
                contact={contact}
                isSelected={selectedId === contact.id}
                onClick={() => onSelect(contact.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
