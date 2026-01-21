import { Check, CheckCheck, Image, FileText, Mic, MapPin, Video, Play, Download, ExternalLink, Bot, User } from 'lucide-react';

export default function MessageBubble({ message }) {
  const isOutgoing = message.direction === 'outgoing';
  const time = new Date(message.sent_at).toLocaleTimeString('he-IL', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const renderContent = () => {
    switch (message.message_type) {
      case 'image':
        return (
          <div className="space-y-2">
            {message.media_url && (
              <div className="relative group">
                <img 
                  src={message.media_url} 
                  alt="" 
                  className="max-w-[280px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity" 
                  onClick={() => window.open(message.media_url, '_blank')}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                  <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
              </div>
            )}
            {message.content && <p className="text-sm">{message.content}</p>}
          </div>
        );
      
      case 'video':
        return (
          <div className="space-y-2">
            {message.media_url && (
              <div className="relative">
                <video 
                  src={message.media_url} 
                  controls 
                  className="max-w-[280px] rounded-xl" 
                />
              </div>
            )}
            {message.content && <p className="text-sm">{message.content}</p>}
          </div>
        );
      
      case 'audio':
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className={`p-2 rounded-full ${isOutgoing ? 'bg-white/20' : 'bg-gray-200'}`}>
              <Mic className="w-4 h-4" />
            </div>
            <audio src={message.media_url} controls className="max-w-[180px] h-8" />
          </div>
        );
      
      case 'document':
        return (
          <a 
            href={message.media_url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
              isOutgoing 
                ? 'bg-white/10 hover:bg-white/20' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <div className={`p-2 rounded-lg ${isOutgoing ? 'bg-white/20' : 'bg-blue-100'}`}>
              <FileText className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {message.media_filename || 'קובץ'}
              </p>
              <p className={`text-xs ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}>
                לחץ להורדה
              </p>
            </div>
            <Download className={`w-4 h-4 ${isOutgoing ? 'text-white/60' : 'text-gray-400'}`} />
          </a>
        );
      
      case 'location':
        return (
          <a 
            href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`}
            target="_blank" 
            rel="noopener noreferrer"
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
              isOutgoing 
                ? 'bg-white/10 hover:bg-white/20' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <div className={`p-2 rounded-lg ${isOutgoing ? 'bg-white/20' : 'bg-red-100'}`}>
              <MapPin className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="font-medium text-sm">מיקום</p>
              <p className={`text-xs ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}>
                לחץ לפתיחה במפות
              </p>
            </div>
          </a>
        );
      
      case 'sticker':
        return message.media_url ? (
          <img src={message.media_url} alt="sticker" className="w-28 h-28" />
        ) : (
          <span className="text-4xl">🎉</span>
        );
      
      default:
        return (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </p>
        );
    }
  };

  const renderStatus = () => {
    if (!isOutgoing) return null;
    
    const iconClass = "w-4 h-4";
    
    switch (message.status) {
      case 'read':
        return <CheckCheck className={`${iconClass} text-blue-300`} />;
      case 'delivered':
        return <CheckCheck className={`${iconClass} text-white/60`} />;
      case 'sent':
        return <Check className={`${iconClass} text-white/60`} />;
      case 'pending':
        return <span className="w-2 h-2 rounded-full bg-white/40 animate-pulse" />;
      case 'failed':
        return <span className="text-xs text-red-300">נכשל</span>;
      default:
        return <Check className={`${iconClass} text-white/60`} />;
    }
  };

  // Check if message was sent by bot
  const isFromBot = message.from_bot || message.metadata?.from_bot;

  return (
    <div className={`flex ${isOutgoing ? 'justify-start' : 'justify-end'} mb-3 group`}>
      <div className={`relative max-w-[75%] ${isOutgoing ? 'order-2' : 'order-1'}`}>
        {/* Message Bubble */}
        <div className={`
          rounded-2xl px-4 py-2.5 shadow-sm
          ${isOutgoing 
            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-bl-md' 
            : 'bg-white text-gray-800 rounded-br-md border border-gray-100'
          }
        `}>
          {/* Bot indicator for outgoing messages */}
          {isOutgoing && isFromBot && (
            <div className="flex items-center gap-1 mb-1.5 text-xs text-blue-200">
              <Bot className="w-3 h-3" />
              <span>נשלח ע"י הבוט</span>
            </div>
          )}
          
          {renderContent()}
          
          {/* Time & Status */}
          <div className={`flex items-center gap-1.5 mt-1.5 text-[11px] ${
            isOutgoing ? 'text-white/70 justify-start' : 'text-gray-400 justify-end'
          }`}>
            {isOutgoing && renderStatus()}
            <span>{time}</span>
          </div>
        </div>
        
        {/* Tail/Arrow effect is handled by rounded corners */}
      </div>
    </div>
  );
}
