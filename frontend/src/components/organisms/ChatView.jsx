import { useState, useRef, useEffect } from 'react';
import { Send, Bot, XCircle, Phone, User, Clock, UserCheck, Loader, ChevronUp } from 'lucide-react';
import MessageBubble from '../molecules/MessageBubble';
import Button from '../atoms/Button';

const TAKEOVER_DURATIONS = [
  { label: '5 דקות', value: 5 },
  { label: '15 דקות', value: 15 },
  { label: '30 דקות', value: 30 },
  { label: 'שעה', value: 60 },
  { label: 'ללא הגבלה', value: 0 },
];

export default function ChatView({ 
  contact, messages, onSendMessage, onToggleBot, onShowProfile, isLoading,
  onLoadMore, hasMore, loadingMore, onTakeover
}) {
  const [text, setText] = useState('');
  const [showTakeoverMenu, setShowTakeoverMenu] = useState(false);
  const [takeoverRemaining, setTakeoverRemaining] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Takeover timer countdown
  useEffect(() => {
    if (contact?.takeover_until) {
      const checkRemaining = () => {
        const remaining = new Date(contact.takeover_until) - new Date();
        if (remaining > 0) {
          setTakeoverRemaining(Math.ceil(remaining / 1000 / 60)); // minutes
        } else {
          setTakeoverRemaining(null);
        }
      };
      checkRemaining();
      const interval = setInterval(checkRemaining, 30000); // Update every 30 seconds
      return () => clearInterval(interval);
    } else {
      setTakeoverRemaining(null);
    }
  }, [contact?.takeover_until]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text);
    setText('');
  };

  const handleTakeover = (minutes) => {
    setShowTakeoverMenu(false);
    if (onTakeover) {
      onTakeover(minutes);
    } else {
      // Fallback: just disable bot
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
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-10 h-10 text-gray-400" />
          </div>
          <p className="text-lg">בחר איש קשר כדי להתחיל</p>
        </div>
      </div>
    );
  }

  // Check if in takeover mode (use is_bot_active, fallback to bot_enabled for compatibility)
  const isBotActive = contact?.is_bot_active ?? contact?.bot_enabled ?? true;
  const isInTakeover = takeoverRemaining !== null || (contact && !isBotActive);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Takeover Banner */}
      {isInTakeover && (
        <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            <span className="font-medium">מצב השתלטות פעיל</span>
            {takeoverRemaining && (
              <span className="text-orange-100 text-sm flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {takeoverRemaining} דקות נותרו
              </span>
            )}
          </div>
          <button
            onClick={() => onToggleBot(true)}
            className="px-3 py-1 bg-white text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-50"
          >
            החזר בוט
          </button>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-white">
        <div className="flex items-center gap-2 relative">
          {/* Takeover Button */}
          <div className="relative">
            <button
              onClick={() => setShowTakeoverMenu(!showTakeoverMenu)}
              className={`p-2 rounded-lg transition-colors ${
                isInTakeover
                  ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' 
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
              title="השתלטות על השיחה"
            >
              <UserCheck className="w-5 h-5" />
            </button>
            
            {/* Takeover Menu */}
            {showTakeoverMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]">
                <div className="px-3 py-2 text-xs text-gray-500 border-b">השתלט לכמה זמן?</div>
                {TAKEOVER_DURATIONS.map((duration) => (
                  <button
                    key={duration.value}
                    onClick={() => handleTakeover(duration.value)}
                    className="w-full px-3 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />
                    {duration.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bot Toggle */}
          <button
            onClick={() => onToggleBot(!isBotActive)}
            className={`p-2 rounded-lg transition-colors ${
              isBotActive 
                ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                : 'bg-red-100 text-red-600 hover:bg-red-200'
            }`}
            title={isBotActive ? 'בוט פעיל - לחץ לכיבוי' : 'בוט כבוי - לחץ להפעלה'}
          >
            {isBotActive ? <Bot className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </button>
          
          <button
            onClick={onShowProfile}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="פרטי איש קשר"
          >
            <User className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        <button onClick={onShowProfile} className="text-right hover:opacity-80">
          <h3 className="font-semibold">{contact.display_name || contact.phone}</h3>
          <p className="text-sm text-gray-500 flex items-center justify-end gap-1">
            <Phone className="w-3 h-3" />
            <span dir="ltr">+{contact.phone}</span>
          </p>
        </button>
        
        <button onClick={onShowProfile} className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center hover:opacity-80">
          {contact.profile_picture_url ? (
            <img src={contact.profile_picture_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-gray-600">
              {contact.display_name && contact.display_name !== contact.phone 
                ? contact.display_name.charAt(0).toUpperCase() 
                : '👤'}
            </span>
          )}
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 bg-gray-50"
      >
        {/* Load More Button */}
        {hasMore && (
          <div className="text-center py-2 mb-4">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-2 mx-auto"
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
          <div className="text-center text-gray-500 py-8">
            <p>אין הודעות עדיין</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t bg-white">
        <div className="flex gap-2">
          <Button type="submit" disabled={!text.trim() || isLoading}>
            <Send className="w-5 h-5" />
          </Button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="כתוב הודעה..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            dir="auto"
          />
        </div>
      </form>
    </div>
  );
}
