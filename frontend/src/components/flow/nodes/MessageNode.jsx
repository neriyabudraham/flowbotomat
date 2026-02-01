import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare, Image, FileText, MessageCircle, Edit2, Copy, Trash2, Video, Mic, User, MapPin, Keyboard, CheckCheck, SmilePlus, Clock } from 'lucide-react';

// Variable labels cache - will be populated
const variableLabelsCache = {
  // System variables
  name: 'שם',
  contact_phone: 'טלפון',
  phone: 'טלפון',
  date: 'תאריך',
  time: 'שעה',
  day: 'יום',
  last_message: 'ההודעה האחרונה',
  message: 'ההודעה',
  bot_name: 'שם הבוט',
  first_name: 'שם פרטי',
  campaign_name: 'שם הקמפיין',
  sender_phone: 'טלפון השולח',
  group_id: 'מזהה קבוצה',
  is_group: 'האם קבוצה',
};

// Render text with variable badges (like mentions in live chat)
const renderTextWithBadges = (text) => {
  if (!text) return '(ריק)';
  
  const parts = [];
  let lastIndex = 0;
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before the variable
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }
    
    // Add the variable badge - styled like mentions
    const varName = match[1];
    const label = variableLabelsCache[varName] || varName;
    parts.push(
      <span
        key={`var-${match.index}`}
        className="inline-flex items-center bg-indigo-100 text-indigo-700 text-[11px] font-medium px-2 py-0.5 rounded-full mx-0.5 whitespace-nowrap"
        style={{ 
          background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
          border: '1px solid #a5b4fc'
        }}
      >
        {label}
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>
        {text.slice(lastIndex)}
      </span>
    );
  }
  
  return parts.length > 0 ? parts : '(ריק)';
};

const actionIcons = {
  text: MessageSquare,
  image: Image,
  video: Video,
  audio: Mic,
  file: FileText,
  contact: User,
  location: MapPin,
  typing: Keyboard,
  delay: Clock,
  mark_seen: CheckCheck,
  reaction: SmilePlus,
  wait_reply: MessageCircle,
};

const actionLabels = {
  text: 'טקסט',
  image: 'תמונה',
  video: 'סרטון',
  audio: 'הודעה קולית',
  file: 'קובץ',
  contact: 'איש קשר',
  location: 'מיקום',
  typing: 'מקליד/ה',
  delay: 'המתנה',
  mark_seen: 'סמן כנקרא',
  reaction: 'ריאקציה',
  wait_reply: 'המתן לתגובה',
};

function MessageNode({ data, selected }) {
  const actions = data.actions || [];
  const canDuplicate = true;
  const canDelete = true;
  
  // Get all media actions with URLs
  const mediaActions = actions.filter(a => (a.type === 'image' || a.type === 'video') && (a.url || a.previewUrl));
  const hasMedia = mediaActions.length > 0;
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[220px] ${
        hasMedia ? 'max-w-[350px]' : 'max-w-[300px]'
      } ${
        selected 
          ? 'border-teal-400 shadow-lg shadow-teal-200' 
          : 'border-gray-200 shadow-md hover:shadow-lg hover:border-gray-300'
      }`}
    >
      {/* Hover Actions */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1">
          <button 
            onClick={(e) => { e.stopPropagation(); data.onEdit?.(); }}
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          {canDuplicate && (
            <button 
              onClick={(e) => { e.stopPropagation(); data.onDuplicate?.(); }}
              className="p-2 hover:bg-green-50 rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4 text-green-600" />
            </button>
          )}
          {canDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      </div>

      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 bg-teal-500 !border-2 !border-white !-left-2"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-teal-500 to-teal-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">WhatsApp</span>
      </div>
      
      {/* Content - Display all actions in order */}
      <div className="p-3 space-y-2">
        {/* Empty State */}
        {actions.length === 0 && (
          <div className="text-center py-2 text-gray-400 text-sm">
            לחץ להוספת תוכן
          </div>
        )}
        
        {actions.map((action, i) => {
          const Icon = actionIcons[action.type] || MessageSquare;
          
          // Media with preview - show large preview
          if ((action.type === 'image' || action.type === 'video') && (action.previewUrl || action.url)) {
            return (
              <div key={i} className="rounded-lg overflow-hidden border border-gray-100">
                {action.type === 'image' ? (
                  <img 
                    src={action.previewUrl || action.url} 
                    alt="תצוגה מקדימה" 
                    className="w-full object-cover"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                ) : (
                  <video 
                    src={action.previewUrl || action.url} 
                    className="w-full object-cover"
                    muted
                  />
                )}
                {action.caption && (
                  <div className="px-2 py-1 bg-gray-50 text-xs text-gray-600 line-clamp-1">
                    {renderTextWithBadges(action.caption)}
                  </div>
                )}
              </div>
            );
          }
          
          // Regular action display
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-teal-600" />
                <span className="text-xs font-medium text-teal-700">
                  {actionLabels[action.type] || action.type}
                </span>
              </div>
              <div className="text-sm text-gray-600 line-clamp-2">
                {action.type === 'text' && renderTextWithBadges(action.content)}
                {action.type === 'image' && !action.url && '(בחר תמונה)'}
                {action.type === 'video' && !action.url && '(בחר סרטון)'}
                {action.type === 'audio' && (action.fileName || action.url ? '🎙️ הודעה קולית' : '(בחר הקלטה)')}
                {action.type === 'file' && (action.fileName || action.url ? `📎 ${action.filename || 'קובץ'}` : '(בחר קובץ)')}
                {action.type === 'contact' && (action.contactName ? `👤 ${action.contactName}` : '(הגדר איש קשר)')}
                {action.type === 'location' && (action.locationTitle || (action.latitude ? '📍 מיקום' : '(הגדר מיקום)'))}
                {action.type === 'typing' && `⌨️ ${action.typingDuration || 3} שניות`}
                {action.type === 'delay' && `⏱️ ${action.delay || 1} ${action.unit === 'minutes' ? 'דקות' : 'שניות'}`}
                {action.type === 'mark_seen' && '✅ סימון כנקרא'}
                {action.type === 'reaction' && (action.reaction || '👍🏻')}
                {action.type === 'wait_reply' && '💬 ממתין לתגובה'}
              </div>
            </div>
          );
        })}
        
        {/* Wait for reply indicator */}
        {data.waitForReply && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
            <MessageCircle className="w-3 h-3" />
            ממתין לתגובה
          </div>
        )}
      </div>
      
      {/* Source Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 bg-teal-500 !border-2 !border-white !-right-2"
      />
      
      {/* Timeout handle if waiting for reply */}
      {data.waitForReply && data.timeout && (
        <Handle
          type="source"
          position={Position.Right}
          id="timeout"
          style={{ top: '80%' }}
          className="!w-3 !h-3 bg-gray-400 !border-2 !border-white !-right-1.5"
        />
      )}
    </div>
  );
}

export default memo(MessageNode);
