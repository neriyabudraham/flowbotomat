import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, ChevronLeft } from 'lucide-react';

const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'bg-teal-500', description: 'טקסט, תמונה, סרטון או קובץ' },
  { type: 'list', label: 'רשימה', icon: List, color: 'bg-cyan-500', description: 'רשימת בחירה עם כפתורים' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'bg-indigo-500', description: 'איסוף מידע בשאלות' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'bg-orange-500', description: 'הסתעפות לפי תנאים' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'bg-blue-500', description: 'המתנה לפני המשך' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'bg-pink-500', description: 'תגיות, משתנים ו-API' },
];

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <h3 className="font-semibold text-gray-900">הוסף רכיב</h3>
        <p className="text-xs text-gray-500 mt-0.5">לחץ או גרור לקנבס</p>
      </div>
      
      {/* Node List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5">
        <div className="space-y-1.5">
          {nodeTypes.map(({ type, label, icon: Icon, color, description }) => (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => onAddNode(type)}
              className="group flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 hover:bg-gray-100 border border-transparent hover:border-gray-200 cursor-pointer transition-all duration-150"
            >
              {/* Icon */}
              <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm">{label}</div>
                <p className="text-xs text-gray-500 truncate">{description}</p>
              </div>
              
              {/* Arrow */}
              <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
