import { useState } from 'react';
import { Search, Users, MessageSquare } from 'lucide-react';
import ContactItem from '../molecules/ContactItem';

export default function ContactsList({ contacts, selectedId, onSelect, onSearch }) {
  const [search, setSearch] = useState('');

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    onSearch(value);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            אנשי קשר
          </h2>
          <span className="text-sm text-gray-400">{contacts.length}</span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="חיפוש לפי שם או טלפון..."
            className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-gray-400" />
            </div>
            <p className="font-medium text-gray-900 mb-1">אין אנשי קשר עדיין</p>
            <p className="text-sm text-gray-500">כשמישהו ישלח הודעה, הוא יופיע כאן</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {contacts.map((contact) => (
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
