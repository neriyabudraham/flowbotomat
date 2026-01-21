import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, Sparkles } from 'lucide-react';

// Trigger is created automatically with new bot, not in palette
const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'שלח טקסט, תמונה, סרטון או קובץ', emoji: '💬' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan', description: 'רשימת בחירה עם כפתורים', emoji: '📋' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'indigo', description: 'שאלות ומיפוי נתונים', emoji: '📝' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'הסתעפות לפי תנאים', emoji: '🔀' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתנה לפני המשך', emoji: '⏱️' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'תגיות, משתנים וקריאות API', emoji: '⚡' },
];

const colorConfig = {
  teal: { bg: 'bg-gradient-to-br from-teal-400 to-teal-600', border: 'border-teal-200', hover: 'hover:border-teal-300 hover:shadow-teal-100' },
  cyan: { bg: 'bg-gradient-to-br from-cyan-400 to-cyan-600', border: 'border-cyan-200', hover: 'hover:border-cyan-300 hover:shadow-cyan-100' },
  indigo: { bg: 'bg-gradient-to-br from-indigo-400 to-indigo-600', border: 'border-indigo-200', hover: 'hover:border-indigo-300 hover:shadow-indigo-100' },
  orange: { bg: 'bg-gradient-to-br from-orange-400 to-orange-600', border: 'border-orange-200', hover: 'hover:border-orange-300 hover:shadow-orange-100' },
  blue: { bg: 'bg-gradient-to-br from-blue-400 to-blue-600', border: 'border-blue-200', hover: 'hover:border-blue-300 hover:shadow-blue-100' },
  pink: { bg: 'bg-gradient-to-br from-pink-400 to-pink-600', border: 'border-pink-200', hover: 'hover:border-pink-300 hover:shadow-pink-100' },
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white">הוסף רכיב</h3>
            <p className="text-xs text-gray-400">לחץ להוספה או גרור לקנבס</p>
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
              className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border-2 ${colors.border} ${colors.hover} hover:shadow-lg bg-white`}
            >
              {/* Icon */}
              <div className={`w-11 h-11 rounded-xl ${colors.bg} flex items-center justify-center shadow-md transition-transform group-hover:scale-110`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{emoji}</span>
                  <span className="font-semibold text-gray-800">{label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
              
              {/* Add indicator */}
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-gray-600 font-bold">+</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-500 text-center">💡 משוך קו לרקע ליצירה מהירה</p>
      </div>
    </div>
  );
}
