import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, GripVertical } from 'lucide-react';

const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'indigo' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink' },
];

const colors = {
  teal: { bg: 'bg-teal-50', icon: 'bg-teal-500', text: 'text-teal-700', border: 'border-teal-200', hover: 'hover:bg-teal-100 hover:border-teal-300' },
  cyan: { bg: 'bg-cyan-50', icon: 'bg-cyan-500', text: 'text-cyan-700', border: 'border-cyan-200', hover: 'hover:bg-cyan-100 hover:border-cyan-300' },
  indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-500', text: 'text-indigo-700', border: 'border-indigo-200', hover: 'hover:bg-indigo-100 hover:border-indigo-300' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200', hover: 'hover:bg-orange-100 hover:border-orange-300' },
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-200', hover: 'hover:bg-blue-100 hover:border-blue-300' },
  pink: { bg: 'bg-pink-50', icon: 'bg-pink-500', text: 'text-pink-700', border: 'border-pink-200', hover: 'hover:bg-pink-100 hover:border-pink-300' },
};

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-96 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">רכיבים</h3>
      </div>
      
      {/* Node Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {nodeTypes.map(({ type, label, icon: Icon, color }) => {
            const c = colors[color];
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => handleDragStart(e, type)}
                onClick={() => onAddNode(type)}
                className={`group relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border ${c.bg} ${c.border} ${c.hover} cursor-pointer transition-all duration-150 active:scale-[0.98]`}
              >
                {/* Drag indicator */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-40 transition-opacity">
                  <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                </div>
                
                {/* Icon */}
                <div className={`w-11 h-11 ${c.icon} rounded-xl flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                
                {/* Label */}
                <span className={`font-medium text-sm ${c.text}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
        <p className="text-xs text-gray-400 text-center">גרור או לחץ להוספה</p>
      </div>
    </div>
  );
}
