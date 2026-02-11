import { MessageSquare, GitBranch, Clock, Cog, List, ClipboardList, ChevronLeft, StickyNote, Globe, Send } from 'lucide-react';

// Google Sheets and Google Contacts are now part of the Integration node
const nodeTypes = [
  { type: 'message', label: 'WhatsApp', icon: MessageSquare, color: 'bg-teal-500', description: 'הודעות, מדיה וריאקציות' },
  { type: 'list', label: 'רשימה', icon: List, color: 'bg-cyan-500', description: 'רשימת בחירה עם כפתורים' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'bg-indigo-500', description: 'איסוף מידע בשאלות' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'bg-orange-500', description: 'הסתעפות לפי תנאים' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'bg-blue-500', description: 'המתנה לפני המשך' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'bg-pink-500', description: 'תגיות ובקרת בוטים' },
  { type: 'integration', label: 'אינטגרציה', icon: Globe, color: 'bg-amber-500', description: 'API, Google Sheets, Contacts' },
  { type: 'note', label: 'הערה', icon: StickyNote, color: 'bg-yellow-500', description: 'הערות ותזכורות' },
  { type: 'send_other', label: 'שליחה אחרת', icon: Send, color: 'bg-violet-500', description: 'שלח למספר או קבוצה אחרת' },
];

export default function NodePalette({ onAddNode }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-96 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 text-lg">הוסף רכיב</h3>
        <p className="text-sm text-gray-500 mt-1">לחץ או גרור לקנבס</p>
      </div>
      
      {/* Node List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {nodeTypes.map(({ type, label, icon: Icon, color, description }) => (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => onAddNode(type)}
              className="group flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200 cursor-pointer transition-all duration-150"
            >
              {/* Icon */}
              <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center shadow-sm flex-shrink-0`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              
              {/* Content */}
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{label}</div>
                <p className="text-sm text-gray-500 mt-0.5">{description}</p>
              </div>
              
              {/* Arrow */}
              <ChevronLeft className="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
