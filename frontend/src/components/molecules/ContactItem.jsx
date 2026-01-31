import { User, Bot, XCircle, Clock, Check, CheckCheck, Users } from 'lucide-react';

/**
 * Check if contact is a group
 */
function isGroupContact(contact) {
  return contact?.phone?.includes('@g.us') || 
         contact?.wa_id?.includes('@g.us') ||
         contact?.phone?.length > 15;
}

export default function ContactItem({ contact, isSelected, onClick }) {
  const isGroup = isGroupContact(contact);
  // Get display name: display_name > full_name variable > phone
  const getDisplayName = () => {
    if (contact.display_name && contact.display_name !== contact.phone) {
      return contact.display_name;
    }
    // Check for full_name in variables
    if (contact.variables?.full_name) {
      return contact.variables.full_name;
    }
    // Check if full_name was passed directly
    if (contact.full_name) {
      return contact.full_name;
    }
    return null;
  };
  
  const name = getDisplayName();
  const displayText = name || contact.phone;
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

  // Use actual_last_message_at if available (calculated from messages table), otherwise fall back to last_message_at
  const lastActivityTime = contact.actual_last_message_at || contact.last_message_at;
  
  // Check if active (messaged in last hour)
  const isActive = lastActivityTime && 
    new Date(lastActivityTime) > new Date(Date.now() - 60 * 60 * 1000);

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
          ) : isGroup ? (
            <Users className="w-5 h-5 text-gray-500" />
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
      
      {/* Content - Name on RIGHT, Time on LEFT */}
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-between gap-2">
          {/* Name - aligned to right */}
          <span className={`font-semibold truncate flex-1 text-right ${
            isSelected ? 'text-blue-900' : 'text-gray-800'
          }`}>
            {displayText}
          </span>
          {/* Time - aligned to left */}
          <span className={`text-xs flex items-center gap-1 flex-shrink-0 ${
            isActive ? 'text-green-500' : 'text-gray-400'
          }`}>
            {lastActivityTime && (
              <>
                <Clock className="w-3 h-3" />
                {getTimeAgo(lastActivityTime)}
              </>
            )}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-2 mt-1">
          {/* Last message preview - truncated to ~40 chars */}
          <p className={`text-sm flex-1 text-right overflow-hidden ${
            isSelected ? 'text-blue-700/70' : 'text-gray-500'
          }`} style={{ 
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            maxWidth: 'calc(100% - 40px)'
          }}>
            {contact.last_message 
              ? (contact.last_message.length > 40 
                  ? contact.last_message.substring(0, 40) + '...' 
                  : contact.last_message)
              : 'אין הודעות'}
          </p>
          
          {/* Unread badge - left side */}
          {contact.unread_count > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
              {contact.unread_count > 99 ? '99+' : contact.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
