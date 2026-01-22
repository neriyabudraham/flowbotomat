import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare, Image, FileText, Clock, MessageCircle, Edit2, Copy, Trash2, Video, Mic, User } from 'lucide-react';

const actionIcons = {
  text: MessageSquare,
  image: Image,
  video: Video,
  audio: Mic,
  file: FileText,
  contact: User,
  delay: Clock,
};

const actionLabels = {
  text: 'טקסט',
  image: 'תמונה',
  video: 'סרטון',
  audio: 'הודעה קולית',
  file: 'קובץ',
  contact: 'איש קשר',
  delay: 'השהייה',
};

function MessageNode({ data, selected }) {
  const actions = data.actions || [{ type: 'text', content: '' }];
  const canDuplicate = true;
  const canDelete = true;
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[220px] max-w-[300px] ${
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
        <span className="font-bold text-white">שליחת הודעה</span>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        {actions.slice(0, 3).map((action, i) => {
          const Icon = actionIcons[action.type] || MessageSquare;
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3 h-3 text-teal-600" />
                <span className="text-xs font-medium text-teal-700">
                  {actionLabels[action.type] || action.type}
                </span>
              </div>
              <div className="text-sm text-gray-600 line-clamp-2">
                {action.type === 'text' && (action.content || '(ריק)')}
                {action.type === 'image' && (action.fileName || action.url ? '📷 תמונה' : '(בחר תמונה)')}
                {action.type === 'video' && (action.fileName || action.url ? '🎬 סרטון' : '(בחר סרטון)')}
                {action.type === 'audio' && (action.fileName || action.url ? '🎙️ הודעה קולית' : '(בחר הקלטה)')}
                {action.type === 'file' && (action.fileName || action.url ? '📎 קובץ' : '(בחר קובץ)')}
                {action.type === 'contact' && (action.contactName ? `👤 ${action.contactName}` : '(הגדר איש קשר)')}
                {action.type === 'delay' && `${action.delay || 1} ${action.unit === 'minutes' ? 'דקות' : 'שניות'}`}
              </div>
            </div>
          );
        })}
        {actions.length > 3 && (
          <div className="text-xs text-gray-400 text-center">
            +{actions.length - 3} נוספים
          </div>
        )}
        
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
