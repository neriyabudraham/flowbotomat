import { memo } from 'react';
import { StickyNote } from 'lucide-react';
import BaseNode from './BaseNode';

const noteColors = {
  yellow: { gradient: 'from-yellow-400 to-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  blue: { gradient: 'from-blue-400 to-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
  green: { gradient: 'from-green-400 to-green-500', bg: 'bg-green-50', text: 'text-green-700' },
  pink: { gradient: 'from-pink-400 to-pink-500', bg: 'bg-pink-50', text: 'text-pink-700' },
  purple: { gradient: 'from-purple-400 to-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
};

function NoteNode({ data, selected }) {
  const colorKey = data.color || 'yellow';
  const color = noteColors[colorKey] || noteColors.yellow;
  const note = data.note || '';
  
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="note"
      color={colorKey}
      icon={StickyNote}
      title="הערה"
      hasTarget={false}
      hasSource={false}
      customGradient={`bg-gradient-to-l ${color.gradient}`}
    >
      <div className="space-y-2">
        {note ? (
          <div className={`${color.bg} rounded-lg p-3`}>
            <p className={`text-sm ${color.text} whitespace-pre-wrap line-clamp-4`}>{note}</p>
          </div>
        ) : (
          <div className="text-center py-3 text-gray-400 text-sm">
            לחץ לכתיבת הערה...
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(NoteNode);
