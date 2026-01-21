import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList } from 'lucide-react';

// Trigger is created automatically with new bot, not in palette
const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'טקסט, תמונה, קובץ' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan', description: 'רשימת בחירה' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'indigo', description: 'שאלות ומיפוי' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'בדיקת תנאי' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתנה' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'תגית, משתנה, API' },
];

const colorClasses = {
  purple: 'bg-purple-500 group-hover:bg-purple-600',
  teal: 'bg-teal-500 group-hover:bg-teal-600',
  orange: 'bg-orange-500 group-hover:bg-orange-600',
  blue: 'bg-blue-500 group-hover:bg-blue-600',
  pink: 'bg-pink-500 group-hover:bg-pink-600',
  cyan: 'bg-cyan-500 group-hover:bg-cyan-600',
  indigo: 'bg-indigo-500 group-hover:bg-indigo-600',
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
      <h3 className="font-bold mb-4 text-gray-700">רכיבים</h3>
      <div className="space-y-2">
        {nodeTypes.map(({ type, label, icon: Icon, color, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => onAddNode(type)}
            className="group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 hover:shadow-md"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-all group-hover:scale-110 ${colorClasses[color]}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800">{label}</div>
              <div className="text-xs text-gray-500">{description}</div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          לחץ להוספה או גרור לקנבס
        </p>
        <p className="text-xs text-gray-400 text-center mt-1">
          💡 משוך קו לרקע ליצירה מהירה
        </p>
      </div>
    </div>
  );
}
