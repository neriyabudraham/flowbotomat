import { Zap, MessageSquare, GitBranch, Clock, Cog, X } from 'lucide-react';

const nodeTypes = [
  { type: 'message', label: 'הודעה', icon: MessageSquare, color: 'teal', description: 'שלח הודעת טקסט' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'בדוק תנאי והתפצל' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתן לפני המשך' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'בצע פעולה' },
];

const colorClasses = {
  teal: 'hover:bg-teal-50 hover:border-teal-200',
  orange: 'hover:bg-orange-50 hover:border-orange-200',
  blue: 'hover:bg-blue-50 hover:border-blue-200',
  pink: 'hover:bg-pink-50 hover:border-pink-200',
};

const iconColors = {
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  pink: 'bg-pink-500',
};

export default function QuickAddMenu({ position, onSelect, onClose }) {
  if (!position) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Menu */}
      <div 
        className="absolute z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-2 min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
        style={{ 
          left: position.x, 
          top: position.y,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 mb-2">
          <span className="font-semibold text-gray-700 text-sm">הוסף רכיב</span>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        
        <div className="space-y-1">
          {nodeTypes.map(({ type, label, icon: Icon, color, description }) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border border-transparent transition-all ${colorClasses[color]}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColors[color]}`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-right flex-1">
                <div className="font-medium text-gray-800">{label}</div>
                <div className="text-xs text-gray-500">{description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
