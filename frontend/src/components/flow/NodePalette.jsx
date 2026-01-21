import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, Sparkles } from 'lucide-react';

// Trigger is created automatically with new bot, not in palette
const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'טקסט, תמונה, קובץ', emoji: '💬' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan', description: 'רשימת בחירה', emoji: '📋' },
  { type: 'registration', label: 'רישום', icon: ClipboardList, color: 'indigo', description: 'שאלות ומיפוי', emoji: '📝' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'הסתעפות', emoji: '🔀' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתנה', emoji: '⏱️' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'תגיות, API', emoji: '⚡' },
];

const colorConfig = {
  teal: { bg: 'bg-gradient-to-br from-teal-400 to-teal-600', border: 'border-teal-200', hover: 'hover:border-teal-300' },
  cyan: { bg: 'bg-gradient-to-br from-cyan-400 to-cyan-600', border: 'border-cyan-200', hover: 'hover:border-cyan-300' },
  indigo: { bg: 'bg-gradient-to-br from-indigo-400 to-indigo-600', border: 'border-indigo-200', hover: 'hover:border-indigo-300' },
  orange: { bg: 'bg-gradient-to-br from-orange-400 to-orange-600', border: 'border-orange-200', hover: 'hover:border-orange-300' },
  blue: { bg: 'bg-gradient-to-br from-blue-400 to-blue-600', border: 'border-blue-200', hover: 'hover:border-blue-300' },
  pink: { bg: 'bg-gradient-to-br from-pink-400 to-pink-600', border: 'border-pink-200', hover: 'hover:border-pink-300' },
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">רכיבים</h3>
            <p className="text-[10px] text-gray-400">לחץ או גרור</p>
          </div>
        </div>
      </div>
      
      {/* Node List */}
      <div className="p-2 space-y-1.5">
        {nodeTypes.map(({ type, label, icon: Icon, color, description, emoji }) => {
          const colors = colorConfig[color];
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => onAddNode(type)}
              className={`group flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 border ${colors.border} ${colors.hover} hover:shadow-md bg-white`}
            >
              {/* Icon */}
              <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center shadow transition-transform group-hover:scale-105`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{emoji}</span>
                  <span className="font-medium text-gray-800 text-sm">{label}</span>
                </div>
                <p className="text-[10px] text-gray-400 truncate">{description}</p>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Footer */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 text-center">💡 משוך קו לרקע ליצירה מהירה</p>
      </div>
    </div>
  );
}
