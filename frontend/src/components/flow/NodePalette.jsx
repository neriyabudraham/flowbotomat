import { Zap, MessageSquare, GitBranch, Clock, Tag } from 'lucide-react';

const nodeTypes = [
  { type: 'trigger', label: 'טריגר', icon: Zap, color: 'purple' },
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue' },
  { type: 'action', label: 'פעולה', icon: Tag, color: 'pink' },
];

const colorClasses = {
  purple: 'bg-purple-100 text-purple-600 hover:bg-purple-200',
  teal: 'bg-teal-100 text-teal-600 hover:bg-teal-200',
  orange: 'bg-orange-100 text-orange-600 hover:bg-orange-200',
  blue: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
  pink: 'bg-pink-100 text-pink-600 hover:bg-pink-200',
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-4">
      <h3 className="font-semibold mb-3 text-sm text-gray-600">גרור רכיב</h3>
      <div className="space-y-2">
        {nodeTypes.map(({ type, label, icon: Icon, color }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => onAddNode(type)}
            className={`flex items-center gap-2 p-3 rounded-lg cursor-move transition-colors ${colorClasses[color]}`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
