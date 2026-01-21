import { User, Bot, XCircle } from 'lucide-react';

export default function ContactItem({ contact, isSelected, onClick }) {
  // Get initials - prefer name over phone number
  const name = contact.display_name && contact.display_name !== contact.phone 
    ? contact.display_name 
    : null;
  const initials = name?.charAt(0)?.toUpperCase() || '👤';
  
  return (
    <button
      onClick={onClick}
      className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b
        ${isSelected ? 'bg-primary-50 border-r-4 border-r-primary-500' : ''}`}
    >
      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
        {contact.profile_picture_url ? (
          <img src={contact.profile_picture_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          <span className="text-lg font-semibold text-gray-600">{initials}</span>
        )}
      </div>
      
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {contact.is_bot_active ? (
              <Bot className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
          </span>
          <span className="font-medium text-gray-800 truncate">
            {contact.display_name || contact.phone}
          </span>
        </div>
        <p className="text-sm text-gray-500 truncate mt-1">
          {contact.last_message || 'אין הודעות'}
        </p>
      </div>
    </button>
  );
}
