import { Check, CheckCheck, Image, FileText, Mic, MapPin } from 'lucide-react';

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
          <div>
            {message.media_url && (
              <img src={message.media_url} alt="" className="max-w-xs rounded-lg mb-1" />
            )}
            {message.content && <p>{message.content}</p>}
          </div>
        );
      case 'video':
        return (
          <div>
            {message.media_url && (
              <video src={message.media_url} controls className="max-w-xs rounded-lg mb-1" />
            )}
            {message.content && <p>{message.content}</p>}
          </div>
        );
      case 'audio':
        return (
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4" />
            <audio src={message.media_url} controls className="max-w-[200px]" />
          </div>
        );
      case 'document':
        return (
          <a href={message.media_url} target="_blank" rel="noopener noreferrer" 
             className="flex items-center gap-2 text-blue-600 hover:underline">
            <FileText className="w-4 h-4" />
            {message.media_filename || 'קובץ'}
          </a>
        );
      case 'location':
        return (
          <a href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`}
             target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-2 text-blue-600 hover:underline">
            <MapPin className="w-4 h-4" />
            מיקום
          </a>
        );
      case 'sticker':
        return message.media_url ? (
          <img src={message.media_url} alt="sticker" className="w-24 h-24" />
        ) : <span>סטיקר</span>;
      default:
        return <p className="whitespace-pre-wrap">{message.content}</p>;
    }
  };

  const renderStatus = () => {
    if (!isOutgoing) return null;
    if (message.status === 'read') return <CheckCheck className="w-4 h-4 text-blue-500" />;
    if (message.status === 'delivered') return <CheckCheck className="w-4 h-4 text-gray-400" />;
    return <Check className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className={`flex ${isOutgoing ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
        isOutgoing 
          ? 'bg-primary-500 text-white rounded-bl-sm' 
          : 'bg-gray-100 text-gray-800 rounded-br-sm'
      }`}>
        {renderContent()}
        <div className={`flex items-center gap-1 mt-1 text-xs ${
          isOutgoing ? 'text-primary-200' : 'text-gray-400'
        }`}>
          {renderStatus()}
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}
