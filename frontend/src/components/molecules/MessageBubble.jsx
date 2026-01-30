import { useState } from 'react';
import { Check, CheckCheck, Image, FileText, Mic, MapPin, Video, Play, Download, ExternalLink, Bot, User, List, MousePointer, ChevronDown, UserCircle, Phone, Building2, Eye, ThumbsUp, UserRound, FileImage, AtSign } from 'lucide-react';

// Format phone for display in group messages
function formatSenderPhone(phone) {
  if (!phone) return null;
  // Remove 972 prefix and format as 05X-XXX-XXXX
  let formatted = phone.replace(/^972/, '0');
  if (formatted.length === 10 && formatted.startsWith('0')) {
    return `${formatted.slice(0, 3)}-${formatted.slice(3, 6)}-${formatted.slice(6)}`;
  }
  return formatted;
}

// Parse @mentions in text and replace LIDs with formatted display
function parseMentions(text, isOutgoing) {
  if (!text) return text;
  
  // Match @followed by numbers (LID format)
  const mentionRegex = /@(\d+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Add the mention as a special part
    parts.push({ type: 'mention', lid: match[1] });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  if (parts.length === 0) return text;
  
  return parts.map((part, idx) => {
    if (part.type === 'mention') {
      return (
        <span 
          key={idx}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium mx-0.5 ${
            isOutgoing 
              ? 'bg-white/20 text-white' 
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          <AtSign className="w-3 h-3" />
          {part.lid}
        </span>
      );
    }
    return <span key={idx}>{part.content}</span>;
  });
}

export default function MessageBubble({ message, isGroupChat = false }) {
  const isOutgoing = message.direction === 'outgoing';
  const time = new Date(message.sent_at).toLocaleTimeString('he-IL', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // For group messages, show sender info
  const senderPhone = message.sender_phone;
  const senderName = message.sender_name;
  const showSenderInfo = isGroupChat && !isOutgoing && senderPhone;

  // Parse metadata if it's a string
  const metadata = typeof message.metadata === 'string' 
    ? JSON.parse(message.metadata || '{}') 
    : (message.metadata || {});

  // Parse vCard to extract contact info
  const parseVcard = (vcardString) => {
    if (!vcardString) return null;
    const lines = vcardString.split('\n');
    const contact = {};
    for (const line of lines) {
      if (line.startsWith('FN:')) contact.name = line.substring(3).trim();
      if (line.startsWith('TEL')) {
        const match = line.match(/:([+\d]+)/);
        if (match) contact.phone = match[1];
      }
      if (line.startsWith('ORG:')) contact.org = line.substring(4).replace(';', '').trim();
    }
    return contact;
  };

  const renderContent = () => {
    switch (message.message_type) {
      // List message (sent by bot)
      case 'list':
        return (
          <div className="space-y-2">
            {/* Title */}
            {metadata.title && (
              <p className={`font-bold text-sm ${isOutgoing ? 'text-white' : 'text-gray-900'}`}>
                {metadata.title}
              </p>
            )}
            {/* Body/Content */}
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </p>
            )}
            {/* Footer */}
            {metadata.footer && (
              <p className={`text-xs ${isOutgoing ? 'text-white/60' : 'text-gray-400'}`}>
                {metadata.footer}
              </p>
            )}
            {/* Button Text - Above buttons like in WhatsApp */}
            {metadata.buttonText && (
              <div className={`flex items-center justify-center gap-2 mt-2 py-2 rounded-lg text-sm font-medium ${
                isOutgoing 
                  ? 'bg-white/20 text-white' 
                  : 'bg-blue-50 text-blue-600'
              }`}>
                <ChevronDown className="w-4 h-4" />
                {metadata.buttonText}
              </div>
            )}
            {/* Buttons */}
            {metadata.buttons && metadata.buttons.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {metadata.buttons.map((btn, idx) => (
                  <div 
                    key={idx}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      isOutgoing 
                        ? 'bg-white/15 text-white/90' 
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    <List className="w-4 h-4 opacity-60" />
                    <div>
                      <span className="font-medium">{btn.title || btn}</span>
                      {btn.description && (
                        <p className={`text-xs mt-0.5 ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}>
                          {btn.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      
      // Buttons message (sent by bot)
      case 'buttons':
        return (
          <div className="space-y-2">
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </p>
            )}
            {metadata.buttons && metadata.buttons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metadata.buttons.map((btn, idx) => (
                  <div 
                    key={idx}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                      isOutgoing 
                        ? 'bg-white/20 text-white border border-white/30' 
                        : 'bg-blue-50 text-blue-600 border border-blue-200'
                    }`}
                  >
                    {btn.title || btn}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      
      // List response (user clicked a button)
      case 'list_response':
        return (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 text-xs ${
              isOutgoing ? 'text-blue-200' : 'text-gray-400'
            }`}>
              <MousePointer className="w-3 h-3" />
              <span>לחיצה על כפתור</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed font-medium">
              {message.content}
            </p>
          </div>
        );
      
      // Button response (user clicked a button)
      case 'button_response':
        return (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 text-xs ${
              isOutgoing ? 'text-blue-200' : 'text-gray-400'
            }`}>
              <MousePointer className="w-3 h-3" />
              <span>לחיצה על כפתור</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed font-medium">
              {message.content}
            </p>
          </div>
        );
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
              <div className="relative rounded-xl overflow-hidden">
                <video 
                  src={message.media_url} 
                  controls 
                  playsInline
                  preload="metadata"
                  className="max-w-[280px] w-full rounded-xl"
                  controlsList="nodownload"
                  style={{ maxHeight: '400px' }}
                >
                  <source src={message.media_url} type={message.media_mime_type || 'video/mp4'} />
                  הדפדפן שלך לא תומך בנגן וידאו
                </video>
                {/* Fallback link */}
                <a 
                  href={message.media_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 mt-2 py-1.5 rounded-lg text-xs ${
                    isOutgoing ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <ExternalLink className="w-3 h-3" />
                  פתח בחלון חדש
                </a>
              </div>
            )}
            {message.content && <p className="text-sm mt-2">{parseMentions(message.content, isOutgoing)}</p>}
          </div>
        );
      
      case 'audio':
      case 'ptt': // Voice note (push-to-talk)
        return (
          <div className="space-y-2 min-w-[220px]">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-full flex-shrink-0 ${isOutgoing ? 'bg-white/20' : 'bg-green-100'}`}>
                <Mic className={`w-4 h-4 ${isOutgoing ? 'text-white' : 'text-green-600'}`} />
              </div>
              <audio 
                src={message.media_url} 
                controls 
                preload="metadata"
                className="flex-1 h-10"
                style={{ minWidth: '150px' }}
              >
                <source src={message.media_url} type={message.media_mime_type || 'audio/ogg'} />
                הדפדפן שלך לא תומך בנגן אודיו
              </audio>
            </div>
            {/* Fallback download link */}
            <a 
              href={message.media_url} 
              download
              className={`flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs ${
                isOutgoing ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-600'
              }`}
            >
              <Download className="w-3 h-3" />
              הורד הקלטה
            </a>
          </div>
        );
      
      case 'document': {
        const isPdf = message.media_mime_type?.includes('pdf') || 
                      message.media_filename?.toLowerCase().endsWith('.pdf');
        
        return (
          <div className="space-y-2">
            {/* Caption/Content above the file */}
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {parseMentions(message.content, isOutgoing)}
              </p>
            )}
            
            {/* PDF Preview */}
            {isPdf && message.media_url && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <iframe 
                  src={`${message.media_url}#toolbar=0&navpanes=0`}
                  className="w-full bg-white"
                  style={{ height: '300px', minWidth: '250px' }}
                  title={message.media_filename || 'PDF'}
                />
              </div>
            )}
            
            {/* File download card */}
            <div className={`flex items-center gap-3 p-3 rounded-xl ${
              isOutgoing 
                ? 'bg-white/10' 
                : 'bg-gray-100'
            }`}>
              <div className={`p-2 rounded-lg ${isOutgoing ? 'bg-white/20' : isPdf ? 'bg-red-100' : 'bg-blue-100'}`}>
                <FileText className={`w-5 h-5 ${isOutgoing ? 'text-white' : isPdf ? 'text-red-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {message.media_filename || 'קובץ'}
                </p>
                <p className={`text-xs ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}>
                  {isPdf ? 'מסמך PDF' : 'קובץ'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* View button */}
                <button
                  onClick={() => window.open(message.media_url, '_blank')}
                  className={`p-2 rounded-lg transition-colors ${
                    isOutgoing ? 'hover:bg-white/20' : 'hover:bg-gray-200'
                  }`}
                  title="צפייה"
                >
                  <ExternalLink className={`w-4 h-4 ${isOutgoing ? 'text-white/60' : 'text-gray-400'}`} />
                </button>
                {/* Download button */}
                <button
                  onClick={() => {
                    fetch(message.media_url)
                      .then(res => res.blob())
                      .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = message.media_filename || 'file';
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        a.remove();
                      })
                      .catch(() => window.open(message.media_url, '_blank'));
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isOutgoing ? 'hover:bg-white/20' : 'hover:bg-gray-200'
                  }`}
                  title="הורדה"
                >
                  <Download className={`w-4 h-4 ${isOutgoing ? 'text-white/60' : 'text-gray-400'}`} />
                </button>
              </div>
            </div>
          </div>
        );
      }
      
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
      
      // Contact vCard
      case 'vcard':
      case 'contact': {
        const contactInfo = parseVcard(message.content);
        return (
          <div className={`flex items-center gap-3 p-3 rounded-xl ${
            isOutgoing ? 'bg-white/10' : 'bg-gray-50 border border-gray-100'
          }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isOutgoing ? 'bg-white/20' : 'bg-gradient-to-br from-green-400 to-emerald-500'
            }`}>
              <UserCircle className={`w-7 h-7 ${isOutgoing ? 'text-white' : 'text-white'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${isOutgoing ? 'text-white' : 'text-gray-800'}`}>
                {contactInfo?.name || 'איש קשר'}
              </p>
              {contactInfo?.phone && (
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${
                  isOutgoing ? 'text-white/70' : 'text-gray-500'
                }`}>
                  <Phone className="w-3 h-3" />
                  <span dir="ltr">{contactInfo.phone}</span>
                </p>
              )}
              {contactInfo?.org && (
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${
                  isOutgoing ? 'text-white/70' : 'text-gray-500'
                }`}>
                  <Building2 className="w-3 h-3" />
                  {contactInfo.org}
                </p>
              )}
            </div>
          </div>
        );
      }
      
      // Reaction message
      case 'reaction':
        return (
          <div className="flex items-center gap-2">
            <ThumbsUp className={`w-4 h-4 ${isOutgoing ? 'text-white/70' : 'text-gray-400'}`} />
            <span className={`text-xs ${isOutgoing ? 'text-white/70' : 'text-gray-500'}`}>
              הגיב עם
            </span>
            <span className="text-2xl">{message.content || '👍'}</span>
          </div>
        );
      
      // Mark as seen notification
      case 'mark_seen':
        return (
          <div className="flex items-center gap-2">
            <Eye className={`w-4 h-4 ${isOutgoing ? 'text-white/70' : 'text-gray-400'}`} />
            <span className={`text-xs ${isOutgoing ? 'text-white/70' : 'text-gray-500'}`}>
              סומן כנקרא
            </span>
          </div>
        );
      
      default:
        return (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {parseMentions(message.content, isOutgoing)}
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
  
  // Get reaction if present
  const reaction = metadata?.reaction;
  
  // Skip rendering reaction and mark_seen as standalone messages
  if (message.message_type === 'reaction' || message.message_type === 'mark_seen') {
    return null;
  }

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
          
          {/* Sender info for group messages */}
          {showSenderInfo && (
            <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-gray-100">
              <UserRound className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                {senderName && senderName !== senderPhone && (
                  <span className="text-xs font-semibold text-purple-700 truncate">
                    {senderName}
                  </span>
                )}
                <span className="text-xs text-purple-500" dir="ltr">
                  {formatSenderPhone(senderPhone)}
                </span>
              </div>
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
        
        {/* Reaction badge - appears on the side of the message */}
        {reaction && (
          <div className={`absolute top-1/2 -translate-y-1/2 ${isOutgoing ? '-left-8' : '-right-8'} 
            bg-white rounded-full p-1 shadow-md border border-gray-100 text-base leading-none`}>
            {reaction}
          </div>
        )}
      </div>
    </div>
  );
}
