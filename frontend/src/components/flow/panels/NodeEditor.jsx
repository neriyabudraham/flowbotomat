import { X, Trash2 } from 'lucide-react';
import TriggerEditor from './editors/TriggerEditor';
import MessageEditor from './editors/MessageEditor';
import ConditionEditor from './editors/ConditionEditor';
import DelayEditor from './editors/DelayEditor';
import ActionEditor from './editors/ActionEditor';

const editors = {
  trigger: TriggerEditor,
  message: MessageEditor,
  condition: ConditionEditor,
  delay: DelayEditor,
  action: ActionEditor,
};

const titles = {
  trigger: 'עריכת טריגר',
  message: 'עריכת הודעה',
  condition: 'עריכת תנאי',
  delay: 'עריכת השהייה',
  action: 'עריכת פעולה',
};

export default function NodeEditor({ node, onUpdate, onClose, onDelete }) {
  if (!node) return null;
  
  const Editor = editors[node.type];
  if (!Editor) return null;
  
  const handleUpdate = (newData) => {
    onUpdate(node.id, newData);
  };
  
  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-800">{titles[node.type]}</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>
      
      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Editor data={node.data} onUpdate={handleUpdate} />
      </div>
      
      {/* Footer */}
      {node.type !== 'trigger' && (
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => onDelete(node.id)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            מחק רכיב
          </button>
        </div>
      )}
    </div>
  );
}
