import { memo } from 'react';
import { StickyNote, Edit2, Copy, Trash2 } from 'lucide-react';

const noteColors = {
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', header: 'bg-yellow-200', text: 'text-yellow-800' },
  blue: { bg: 'bg-blue-100', border: 'border-blue-300', header: 'bg-blue-200', text: 'text-blue-800' },
  green: { bg: 'bg-green-100', border: 'border-green-300', header: 'bg-green-200', text: 'text-green-800' },
  pink: { bg: 'bg-pink-100', border: 'border-pink-300', header: 'bg-pink-200', text: 'text-pink-800' },
  purple: { bg: 'bg-purple-100', border: 'border-purple-300', header: 'bg-purple-200', text: 'text-purple-800' },
};

function NoteNode({ data, selected }) {
  const color = noteColors[data.color] || noteColors.yellow;
  const note = data.note || '';
  
  return (
    <div 
      className={`group ${color.bg} rounded-2xl border-2 ${color.border} transition-all duration-200 min-w-[180px] max-w-[280px] shadow-md ${
        selected ? 'shadow-lg' : 'hover:shadow-lg'
      }`}
    >
      {/* Hover Actions */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1">
          <button 
            onClick={(e) => { e.stopPropagation(); data.onEdit?.(); }}
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDuplicate?.(); }}
            className="p-2 hover:bg-green-50 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4 text-green-600" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>
      
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${color.header} rounded-t-xl`}>
        <StickyNote className={`w-4 h-4 ${color.text}`} />
        <span className={`font-medium text-sm ${color.text}`}>הערה</span>
      </div>
      
      {/* Content */}
      <div className="p-3">
        {note ? (
          <p className={`text-sm ${color.text} whitespace-pre-wrap`}>{note}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">לחץ לכתיבת הערה...</p>
        )}
      </div>
    </div>
  );
}

export default memo(NoteNode);
