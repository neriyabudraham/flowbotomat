import { MessageSquare, GitBranch, Clock, Cog, List, X, ClipboardList, Globe, Send, FileSpreadsheet, Users } from 'lucide-react';

// Note: 'note' is excluded from quick add menu - only available from palette
const nodeTypes = [
  { type: 'message', label: 'WhatsApp', icon: MessageSquare, color: 'teal', description: 'הודעות, מדיה וריאקציות' },
  { type: 'list', label: 'רשימה', icon: List, color: 'cyan', description: 'רשימת בחירה' },
  { type: 'registration', label: 'תהליך רישום', icon: ClipboardList, color: 'indigo', description: 'שאלות ומיפוי' },
  { type: 'condition', label: 'תנאי', icon: GitBranch, color: 'orange', description: 'בדוק תנאי' },
  { type: 'delay', label: 'השהייה', icon: Clock, color: 'blue', description: 'המתן' },
  { type: 'action', label: 'פעולה', icon: Cog, color: 'pink', description: 'תגיות ובקרה' },
  { type: 'integration', label: 'אינטגרציה', icon: Globe, color: 'amber', description: 'Webhook וAPI' },
  { type: 'google_sheets', label: 'Google Sheets', icon: FileSpreadsheet, color: 'green', description: 'קריאה וכתיבה בגיליון' },
  { type: 'google_contacts', label: 'Google Contacts', icon: Users, color: 'sky', description: 'אנשי קשר בגוגל' },
  { type: 'send_other', label: 'שליחה אחרת', icon: Send, color: 'violet', description: 'שלח למספר/קבוצה' },
];

const colorClasses = {
  teal: 'hover:bg-teal-50 hover:border-teal-200',
  cyan: 'hover:bg-cyan-50 hover:border-cyan-200',
  orange: 'hover:bg-orange-50 hover:border-orange-200',
  blue: 'hover:bg-blue-50 hover:border-blue-200',
  pink: 'hover:bg-pink-50 hover:border-pink-200',
  indigo: 'hover:bg-indigo-50 hover:border-indigo-200',
  yellow: 'hover:bg-yellow-50 hover:border-yellow-200',
  amber: 'hover:bg-amber-50 hover:border-amber-200',
  violet: 'hover:bg-violet-50 hover:border-violet-200',
  green: 'hover:bg-green-50 hover:border-green-200',
  sky: 'hover:bg-sky-50 hover:border-sky-200',
};

const iconColors = {
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-500',
  yellow: 'bg-yellow-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  green: 'bg-green-500',
  sky: 'bg-sky-500',
};

export default function QuickAddMenu({ position, onSelect, onClose }) {
  if (!position) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      <div 
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-2 min-w-[220px]"
        style={{ 
          left: position.x, 
          top: position.y,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 mb-2">
          <span className="font-semibold text-gray-700 text-sm">הוסף רכיב</span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
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
