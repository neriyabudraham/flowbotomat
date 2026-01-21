import { Zap, MessageSquare, GitBranch, Clock, Cog } from 'lucide-react';

const nodeTypes = [
  { type: 'trigger', label: 'טריגר', icon: Zap, color: 'purple', description: 'התחלת הפלואו' },
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'שליחת הודעה' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'בדיקת תנאי' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתנה' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'ביצוע פעולה' },
];

const colorClasses = {
  purple: 'bg-purple-500 group-hover:bg-purple-600',
  teal: 'bg-teal-500 group-hover:bg-teal-600',
  orange: 'bg-orange-500 group-hover:bg-orange-600',
  blue: 'bg-blue-500 group-hover:bg-blue-600',
  pink: 'bg-pink-500 group-hover:bg-pink-600',
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-gray-200 p-4">
      <h3 className="font-semibold mb-4 text-gray-700 text-sm">רכיבים</h3>
      <div className="space-y-2">
        {nodeTypes.map(({ type, label, icon: Icon, color, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => onAddNode(type)}
            className="group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${colorClasses[color]}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 text-sm">{label}</div>
              <div className="text-xs text-gray-500 truncate">{description}</div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          לחץ או גרור להוספה
        </p>
      </div>
    </div>
  );
}
