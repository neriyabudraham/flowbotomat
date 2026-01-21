import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import ContactItem from '../molecules/ContactItem';

export default function ContactsList({ contacts, selectedId, onSelect, onSearch }) {
  const [search, setSearch] = useState('');

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    onSearch(value);
  };

  return (
    <div className="h-full flex flex-col bg-white border-l">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Users className="w-5 h-5" />
          אנשי קשר
        </h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="חיפוש..."
            className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>אין אנשי קשר עדיין</p>
            <p className="text-sm">כשמישהו ישלח הודעה, הוא יופיע כאן</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <ContactItem
              key={contact.id}
              contact={contact}
              isSelected={selectedId === contact.id}
              onClick={() => onSelect(contact.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
