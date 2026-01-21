import { User, Bot, XCircle, Clock, Check, CheckCheck } from 'lucide-react';

export default function ContactItem({ contact, isSelected, onClick }) {
  const name = contact.display_name && contact.display_name !== contact.phone 
    ? contact.display_name 
    : null;
  const initials = name?.charAt(0)?.toUpperCase() || '👤';
  
  // Calculate time ago
  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now - messageDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `${diffMins} דק׳`;
    if (diffHours < 24) return `${diffHours} שע׳`;
    if (diffDays < 7) return `${diffDays} ימים`;
    return messageDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  };

  // Check if active (messaged in last hour)
  const isActive = contact.last_message_at && 
    new Date(contact.last_message_at) > new Date(Date.now() - 60 * 60 * 1000);

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-all group
        ${isSelected 
          ? 'bg-gradient-to-r from-blue-50 to-indigo-50/50 border-r-[3px] border-r-blue-500' 
          : 'hover:bg-gray-50/80'
        }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden
          ${contact.profile_picture_url 
            ? '' 
            : 'bg-gradient-to-br from-gray-100 to-gray-200'
          }`}
        >
          {contact.profile_picture_url ? (
            <img 
              src={contact.profile_picture_url} 
              alt="" 
              className="w-full h-full object-cover" 
            />
          ) : (
            <span className="text-lg font-semibold text-gray-600">{initials}</span>
          )}
        </div>
        
        {/* Online/Bot indicator */}
        <div className={`absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center
          ${contact.is_bot_active 
            ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
            : 'bg-gray-300'
          }`}
        >
          {contact.is_bot_active ? (
            <Bot className="w-2.5 h-2.5 text-white" />
          ) : (
            <XCircle className="w-2.5 h-2.5 text-white" />
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs flex items-center gap-1 ${
            isActive ? 'text-green-500' : 'text-gray-400'
          }`}>
            {contact.last_message_at && (
              <>
                <Clock className="w-3 h-3" />
                {getTimeAgo(contact.last_message_at)}
              </>
            )}
          </span>
          <span className={`font-semibold truncate ${
            isSelected ? 'text-blue-900' : 'text-gray-800'
          }`}>
            {contact.display_name || contact.phone}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-2 mt-1">
          {/* Unread badge - if we have unread count */}
          {contact.unread_count > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {contact.unread_count > 99 ? '99+' : contact.unread_count}
            </span>
          )}
          
          <p className={`text-sm truncate flex-1 text-right ${
            isSelected ? 'text-blue-700/70' : 'text-gray-500'
          }`}>
            {contact.last_message || 'אין הודעות'}
          </p>
        </div>
      </div>
    </button>
  );
}
