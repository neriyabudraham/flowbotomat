import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, Sparkles, GripVertical } from 'lucide-react';

// Trigger is created automatically with new bot, not in palette
const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'שלח טקסט, תמונה, סרטון או קובץ', emoji: '💬' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan', description: 'רשימת בחירה עם כפתורים', emoji: '📋' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'indigo', description: 'שאלונים ומיפוי נתונים', emoji: '📝' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'הסתעפות לפי תנאים', emoji: '🔀' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתנה לפני המשך', emoji: '⏱️' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'תגיות, משתנים וקריאות API', emoji: '⚡' },
];

const colorConfig = {
  teal: { 
    bg: 'bg-gradient-to-br from-teal-400 to-teal-600', 
    light: 'bg-teal-50', 
    border: 'border-teal-200',
    text: 'text-teal-700',
    hover: 'hover:border-teal-300 hover:shadow-teal-100'
  },
  cyan: { 
    bg: 'bg-gradient-to-br from-cyan-400 to-cyan-600', 
    light: 'bg-cyan-50', 
    border: 'border-cyan-200',
    text: 'text-cyan-700',
    hover: 'hover:border-cyan-300 hover:shadow-cyan-100'
  },
  indigo: { 
    bg: 'bg-gradient-to-br from-indigo-400 to-indigo-600', 
    light: 'bg-indigo-50', 
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    hover: 'hover:border-indigo-300 hover:shadow-indigo-100'
  },
  orange: { 
    bg: 'bg-gradient-to-br from-orange-400 to-orange-600', 
    light: 'bg-orange-50', 
    border: 'border-orange-200',
    text: 'text-orange-700',
    hover: 'hover:border-orange-300 hover:shadow-orange-100'
  },
  blue: { 
    bg: 'bg-gradient-to-br from-blue-400 to-blue-600', 
    light: 'bg-blue-50', 
    border: 'border-blue-200',
    text: 'text-blue-700',
    hover: 'hover:border-blue-300 hover:shadow-blue-100'
  },
  pink: { 
    bg: 'bg-gradient-to-br from-pink-400 to-pink-600', 
    light: 'bg-pink-50', 
    border: 'border-pink-200',
    text: 'text-pink-700',
    hover: 'hover:border-pink-300 hover:shadow-pink-100'
  },
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white">רכיבים</h3>
            <p className="text-xs text-gray-400">גרור או לחץ להוספה</p>
          </div>
        </div>
      </div>
      
      {/* Node List */}
      <div className="p-3 space-y-2">
        {nodeTypes.map(({ type, label, icon: Icon, color, description, emoji }) => {
          const colors = colorConfig[color];
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => onAddNode(type)}
              className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border-2 ${colors.border} ${colors.hover} hover:shadow-lg bg-white`}
            >
              {/* Drag Handle */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
                <GripVertical className="w-4 h-4 text-gray-400" />
              </div>
              
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 group-hover:rotate-3`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{emoji}</span>
                  <span className="font-semibold text-gray-800">{label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
              </div>
              
              {/* Add indicator */}
              <div className={`w-8 h-8 rounded-full ${colors.light} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all group-hover:scale-110`}>
                <span className={`text-lg ${colors.text}`}>+</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-1 bg-white rounded-lg shadow-sm border border-gray-200">💡</span>
          <span>משוך קו לרקע ליצירה מהירה</span>
        </div>
      </div>
    </div>
  );
}
