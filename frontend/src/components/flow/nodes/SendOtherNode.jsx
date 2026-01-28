import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Send, MessageSquare, Image, FileText, Video, Mic, User, MapPin, Edit2, Copy, Trash2, Users, Phone } from 'lucide-react';

const actionIcons = {
  text: MessageSquare,
  image: Image,
  video: Video,
  audio: Mic,
  file: FileText,
  contact: User,
  location: MapPin,
};

const actionLabels = {
  text: 'טקסט',
  image: 'תמונה',
  video: 'סרטון',
  audio: 'הודעה קולית',
  file: 'קובץ',
  contact: 'איש קשר',
  location: 'מיקום',
};

function SendOtherNode({ data, selected }) {
  const actions = data.actions || [];
  const recipient = data.recipient || {};
  
  // Get recipient display
  const getRecipientDisplay = () => {
    // Helper to strip curly braces if user included them
    const cleanVarName = (name) => (name || '').replace(/^\{\{/, '').replace(/\}\}$/, '');
    
    if (recipient.type === 'phone') {
      if (recipient.useVariable) {
        const varName = cleanVarName(recipient.variableName) || 'phone';
        return `{{${varName}}}`;
      }
      return recipient.phone || '(לא הוגדר)';
    } else if (recipient.type === 'group') {
      if (recipient.useVariable) {
        const varName = cleanVarName(recipient.variableName) || 'group';
        return `{{${varName}}}`;
      }
      return recipient.groupName || recipient.groupId || '(לא הוגדר)';
    }
    return '(לא הוגדר)';
  };
  
  // Get all media actions with URLs
  const mediaActions = actions.filter(a => (a.type === 'image' || a.type === 'video') && (a.url || a.previewUrl));
  const hasMedia = mediaActions.length > 0;
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[220px] ${
        hasMedia ? 'max-w-[350px]' : 'max-w-[300px]'
      } ${
        selected 
          ? 'border-violet-400 shadow-lg shadow-violet-200' 
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
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDuplicate?.(); }}
            className="p-2 hover:bg-green-50 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4 text-green-600" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>

      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 bg-violet-500 !border-2 !border-white !-left-2"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-violet-500 to-violet-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Send className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">שליחה אחרת</span>
      </div>
      
      {/* Recipient */}
      <div className="px-3 py-2 bg-violet-50 border-b border-violet-100">
        <div className="flex items-center gap-2 text-sm">
          {recipient.type === 'group' ? (
            <Users className="w-4 h-4 text-violet-600" />
          ) : (
            <Phone className="w-4 h-4 text-violet-600" />
          )}
          <span className="font-medium text-violet-700">
            {recipient.type === 'group' ? 'קבוצה:' : 'מספר:'}
          </span>
          <span className="text-violet-600 truncate flex-1">
            {getRecipientDisplay()}
          </span>
        </div>
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
                    {action.caption}
                  </div>
                )}
              </div>
            );
          }
          
          // Regular action display
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-violet-600" />
                <span className="text-xs font-medium text-violet-700">
                  {actionLabels[action.type] || action.type}
                </span>
              </div>
              <div className="text-sm text-gray-600 line-clamp-2">
                {action.type === 'text' && (action.content || '(ריק)')}
                {action.type === 'image' && !action.url && '(בחר תמונה)'}
                {action.type === 'video' && !action.url && '(בחר סרטון)'}
                {action.type === 'audio' && (action.fileName || action.url ? '🎙️ הודעה קולית' : '(בחר הקלטה)')}
                {action.type === 'file' && (action.fileName || action.url ? `📎 ${action.filename || 'קובץ'}` : '(בחר קובץ)')}
                {action.type === 'contact' && (action.contactName ? `👤 ${action.contactName}` : '(הגדר איש קשר)')}
                {action.type === 'location' && (action.locationTitle || (action.latitude ? '📍 מיקום' : '(הגדר מיקום)'))}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Source Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 bg-violet-500 !border-2 !border-white !-right-2"
      />
    </div>
  );
}

export default memo(SendOtherNode);
