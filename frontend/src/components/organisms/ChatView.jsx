import { useState, useRef, useEffect } from 'react';
import { Send, Bot, BotOff, Phone, MoreVertical } from 'lucide-react';
import MessageBubble from '../molecules/MessageBubble';
import Button from '../atoms/Button';

export default function ChatView({ contact, messages, onSendMessage, onToggleBot, isLoading }) {
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text);
    setText('');
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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleBot(!contact.is_bot_active)}
            className={`p-2 rounded-lg transition-colors ${
              contact.is_bot_active 
                ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                : 'bg-red-100 text-red-600 hover:bg-red-200'
            }`}
            title={contact.is_bot_active ? 'בוט פעיל - לחץ לכיבוי' : 'בוט כבוי - לחץ להפעלה'}
          >
            {contact.is_bot_active ? <Bot className="w-5 h-5" /> : <BotOff className="w-5 h-5" />}
          </button>
        </div>
        
        <div className="text-right">
          <h3 className="font-semibold">{contact.display_name || contact.phone}</h3>
          <p className="text-sm text-gray-500 flex items-center justify-end gap-1">
            <Phone className="w-3 h-3" />
            <span dir="ltr">+{contact.phone}</span>
          </p>
        </div>
        
        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
          {contact.profile_picture_url ? (
            <img src={contact.profile_picture_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-gray-600">
              {contact.display_name?.charAt(0) || contact.phone?.charAt(0)}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
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
