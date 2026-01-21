import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, Plus } from 'lucide-react';

// Trigger is created automatically with new bot, not in palette
const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'טקסט, תמונה, סרטון או קובץ' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan', description: 'בחירה עם כפתורים' },
  { type: 'registration', label: 'רישום', icon: ClipboardList, color: 'indigo', description: 'שאלות ומיפוי נתונים' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'הסתעפות לפי תנאים' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתנה לפני המשך' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'תגיות ומשתנים' },
];

const colorConfig = {
  teal: 'from-teal-500 to-teal-600',
  cyan: 'from-cyan-500 to-cyan-600',
  indigo: 'from-indigo-500 to-indigo-600',
  orange: 'from-orange-500 to-orange-600',
  blue: 'from-blue-500 to-blue-600',
  pink: 'from-pink-500 to-pink-600',
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-[200px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-bold text-gray-800 text-sm">רכיבים</h3>
      </div>
      
      {/* Node List */}
      <div className="p-2 space-y-1.5">
        {nodeTypes.map(({ type, label, icon: Icon, color, description }) => {
          const gradient = colorConfig[color];
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => onAddNode(type)}
              className="group cursor-pointer"
            >
              {/* Mini Node Card - resembles actual nodes */}
              <div className="bg-white rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-all duration-200 hover:shadow-md overflow-hidden">
                {/* Colored Header - like real nodes */}
                <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-l ${gradient}`}>
                  <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-white text-sm">{label}</span>
                  <Plus className="w-4 h-4 text-white/60 mr-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {/* Description */}
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Footer hint */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 text-center">גרור או לחץ להוספה</p>
      </div>
    </div>
  );
}
