import { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, XCircle, Phone, User, Clock, UserCheck, Loader, ChevronUp, 
  ArrowRight, MoreVertical, Info, Smile, Paperclip, Mic, Image, 
  CheckCheck, Check, AlertCircle, Copy, Users
} from 'lucide-react';
import MessageBubble from '../molecules/MessageBubble';
import api from '../../services/api';

/**
 * Format phone number for display
 * 972556690753 -> 055-669-0753
 */
function formatPhoneDisplay(phone, short = false) {
  if (!phone) return '';
  
  let formatted = phone.toString().replace(/^\+/, '');
  
  // Handle Israeli numbers (972...)
  if (formatted.startsWith('972')) {
    formatted = '0' + formatted.substring(3);
  }
  
  if (formatted.length === 9 && !formatted.startsWith('0')) {
    formatted = '0' + formatted;
  }
  
  if (short) {
    return formatted.substring(0, 3) + '...';
  }
  
  if (formatted.length === 10) {
    return `${formatted.substring(0, 3)}-${formatted.substring(3, 6)}-${formatted.substring(6)}`;
  }
  
  return formatted;
}

/**
 * Format phone for copying
 */
function formatPhoneForCopy(phone) {
  if (!phone) return '';
  
  let formatted = phone.toString().replace(/^\+/, '');
  
  if (!formatted.startsWith('972')) {
    if (formatted.startsWith('0')) {
      formatted = '972' + formatted.substring(1);
    } else {
      formatted = '972' + formatted;
    }
  }
  
  if (formatted.length >= 12) {
    return `+${formatted.substring(0, 3)}-${formatted.substring(3, 5)}-${formatted.substring(5, 8)}-${formatted.substring(8)}`;
  }
  
  return '+' + formatted;
}

/**
 * Check if contact is a group
 */
function isGroupContact(contact) {
  return contact?.phone?.includes('@g.us') || 
         contact?.wa_id?.includes('@g.us') ||
         contact?.phone?.length > 15;
}

const TAKEOVER_DURATIONS = [
  { label: '5 דקות', value: 5 },
  { label: '15 דקות', value: 15 },
  { label: '30 דקות', value: 30 },
  { label: 'שעה', value: 60 },
  { label: 'ללא הגבלה', value: 0 },
];

export default function ChatView({ 
  contact, messages, onSendMessage, onToggleBot, onShowProfile, isLoading,
  onLoadMore, hasMore, loadingMore, onTakeover, onBack
}) {
  const [text, setText] = useState('');
  const [showTakeoverMenu, setShowTakeoverMenu] = useState(false);
  const [takeoverRemaining, setTakeoverRemaining] = useState(null);
  const [sending, setSending] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);
  const [lidMappings, setLidMappings] = useState({});
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const prevContactIdRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);

  // Fetch LID mappings once on mount
  useEffect(() => {
    const fetchLidMappings = async () => {
      try {
        const { data } = await api.get('/contacts/lid-mappings');
        setLidMappings(data.mappings || {});
      } catch (e) {
        console.error('Failed to fetch LID mappings:', e);
      }
    };
    fetchLidMappings();
  }, []);

  // Scroll to bottom - instant on contact change, smooth on new messages
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    const isContactChange = prevContactIdRef.current !== contact?.id;
    const isNewMessage = messages.length > prevMessagesLengthRef.current && !isContactChange;
    
    // Update refs
    prevContactIdRef.current = contact?.id;
    prevMessagesLengthRef.current = messages.length;
    
    // Use instant scroll for initial load / contact change, smooth for new messages only
    if (isContactChange) {
      // Instant scroll when changing contacts - no animation
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    } else if (isNewMessage) {
      // Smooth scroll only when new message arrives
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, contact?.id]);

  useEffect(() => {
    if (contact?.takeover_until) {
      const checkRemaining = () => {
        const remaining = new Date(contact.takeover_until) - new Date();
        if (remaining > 0) {
          setTakeoverRemaining(Math.ceil(remaining / 1000 / 60));
        } else {
          setTakeoverRemaining(null);
        }
      };
      checkRemaining();
      const interval = setInterval(checkRemaining, 30000);
      return () => clearInterval(interval);
    } else {
      setTakeoverRemaining(null);
    }
  }, [contact?.takeover_until]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    
    setSending(true);
    try {
      await onSendMessage(text);
      setText('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = (minutes) => {
    setShowTakeoverMenu(false);
    if (onTakeover) {
      onTakeover(minutes);
    } else {
      onToggleBot(false);
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop < 100 && hasMore && !loadingMore) {
      onLoadMore?.();
    }
  };

  if (!contact) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="text-center text-gray-500">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Send className="w-10 h-10 text-gray-400" />
          </div>
          <p className="text-lg font-medium">בחר איש קשר כדי להתחיל</p>
        </div>
      </div>
    );
  }

  const isBotActive = contact?.is_bot_active ?? contact?.bot_enabled ?? true;
  const isInTakeover = takeoverRemaining !== null || (contact && !isBotActive);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Takeover Banner */}
      {isInTakeover && (
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold">מצב השתלטות פעיל</span>
              {takeoverRemaining && (
                <span className="text-orange-100 text-sm mr-2 flex items-center gap-1 inline-flex">
                  <Clock className="w-3.5 h-3.5" />
                  {takeoverRemaining} דקות נותרו
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onToggleBot(true)}
            className="px-4 py-1.5 bg-white text-orange-600 rounded-lg text-sm font-semibold hover:bg-orange-50 transition-colors shadow-sm"
          >
            החזר בוט
          </button>
        </div>
      )}

      {/* Premium Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile back button */}
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors md:hidden"
            >
              <ArrowRight className="w-5 h-5 text-gray-600" />
            </button>
          )}
          
          {/* Takeover Button */}
          <div className="relative">
            <button
              onClick={() => setShowTakeoverMenu(!showTakeoverMenu)}
              className={`p-2.5 rounded-xl transition-all shadow-sm ${
                isInTakeover
                  ? 'bg-gradient-to-br from-orange-100 to-amber-100 text-orange-600 hover:from-orange-200 hover:to-amber-200' 
                  : 'bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 hover:from-blue-200 hover:to-indigo-200'
              }`}
              title="השתלטות על השיחה"
            >
              <UserCheck className="w-5 h-5" />
            </button>
            
            {/* Takeover Menu */}
            {showTakeoverMenu && (
              <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 min-w-[180px] overflow-hidden">
                <div className="px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b">
                  השתלט לכמה זמן?
                </div>
                {TAKEOVER_DURATIONS.map((duration) => (
                  <button
                    key={duration.value}
                    onClick={() => handleTakeover(duration.value)}
                    className="w-full px-4 py-2.5 text-right text-sm hover:bg-blue-50 flex items-center gap-3 transition-colors"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{duration.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bot Toggle */}
          <button
            onClick={() => onToggleBot(!isBotActive)}
            className={`p-2.5 rounded-xl transition-all shadow-sm ${
              isBotActive 
                ? 'bg-gradient-to-br from-green-100 to-emerald-100 text-green-600 hover:from-green-200 hover:to-emerald-200' 
                : 'bg-gradient-to-br from-red-100 to-rose-100 text-red-600 hover:from-red-200 hover:to-rose-200'
            }`}
            title={isBotActive ? 'בוט פעיל - לחץ לכיבוי' : 'בוט כבוי - לחץ להפעלה'}
          >
            {isBotActive ? <Bot className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </button>
          
          <button
            onClick={onShowProfile}
            className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors hidden md:block"
            title="פרטי איש קשר"
          >
            <Info className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Contact Info - Right side */}
        <div className="flex items-center gap-3">
          {/* Phone/Group badge - next to avatar */}
          {isGroupContact(contact) ? (
            <div className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>קבוצה</span>
            </div>
          ) : (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(formatPhoneForCopy(contact.phone));
                setPhoneCopied(true);
                setTimeout(() => setPhoneCopied(false), 2000);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                phoneCopied 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-700'
              }`}
              title="לחץ להעתקה"
            >
              <Phone className="w-3 h-3" />
              <span dir="ltr">{formatPhoneDisplay(contact.phone)}</span>
              {phoneCopied && <Check className="w-3 h-3" />}
            </button>
          )}
          
          {/* Name */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const nameText = contact.display_name || contact.phone;
              navigator.clipboard.writeText(nameText);
              setNameCopied(true);
              setTimeout(() => setNameCopied(false), 2000);
            }}
            className="text-right hover:opacity-80 transition-opacity group"
            title="לחץ להעתקה"
          >
            <h3 className={`font-bold flex items-center gap-1.5 justify-end ${
              nameCopied ? 'text-green-600' : 'text-gray-900'
            }`}>
              {contact.display_name || contact.phone}
              {nameCopied && <Check className="w-3.5 h-3.5" />}
            </h3>
          </button>
          
          {/* Avatar */}
          <button onClick={onShowProfile} className="relative hover:opacity-80 transition-opacity">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
              {contact.profile_picture_url ? (
                <img src={contact.profile_picture_url} alt="" className="w-full h-full object-cover" />
              ) : isGroupContact(contact) ? (
                <Users className="w-5 h-5 text-gray-500" />
              ) : (
                <span className="text-lg font-bold text-gray-500">
                  {contact.display_name && contact.display_name !== contact.phone 
                    ? contact.display_name.charAt(0).toUpperCase() 
                    : '👤'}
                </span>
              )}
            </div>
            {/* Status dot */}
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
              isBotActive ? 'bg-green-400' : 'bg-gray-300'
            }`} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 bg-gradient-to-b from-gray-50 to-white"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e2e8f0' fill-opacity='0.3'%3E%3Ccircle cx='30' cy='30' r='1.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Load More Button */}
        {hasMore && (
          <div className="text-center py-3 mb-4">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-600 bg-white rounded-xl shadow-sm border border-gray-200 hover:bg-blue-50 transition-colors font-medium"
            >
              {loadingMore ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
              {loadingMore ? 'טוען...' : 'טען הודעות קודמות'}
            </button>
          </div>
        )}
        
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center mb-4">
              <Send className="w-10 h-10 text-blue-400" />
            </div>
            <p className="text-gray-500 font-medium">אין הודעות עדיין</p>
            <p className="text-sm text-gray-400 mt-1">שלח הודעה כדי להתחיל</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} isGroupChat={isGroupContact(contact)} lidMappings={lidMappings} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Premium Input Area */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-100 bg-white">
        <div className="flex items-end gap-2">
          {/* Send Button */}
          <button 
            type="submit" 
            disabled={!text.trim() || isLoading || sending}
            className={`p-3 rounded-xl transition-all shadow-sm ${
              text.trim() && !sending
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg hover:scale-105'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {sending ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
          
          {/* Input */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="כתוב הודעה..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 text-sm transition-all placeholder:text-gray-400"
              dir="auto"
            />
          </div>
        </div>
        
        {/* Typing indicator or status */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-4">
            {isBotActive ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <Bot className="w-3.5 h-3.5" />
                בוט פעיל
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-orange-600">
                <UserCheck className="w-3.5 h-3.5" />
                מצב ידני
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {messages.length} הודעות
          </span>
        </div>
      </form>
    </div>
  );
}
