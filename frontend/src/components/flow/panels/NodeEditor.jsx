import { X, Trash2 } from 'lucide-react';
import TriggerEditor from './editors/TriggerEditor';
import MessageEditor from './editors/MessageEditor';
import ConditionEditor from './editors/ConditionEditor';
import DelayEditor from './editors/DelayEditor';
import ActionEditor from './editors/ActionEditor';
import ListEditor from './editors/ListEditor';
import RegistrationEditor from './editors/RegistrationEditor';
import NoteEditor from './editors/NoteEditor';
import IntegrationEditor from './editors/IntegrationEditor';
import SendOtherEditor from './editors/SendOtherEditor';
import GoogleSheetsEditor from './editors/GoogleSheetsEditor';
import GoogleContactsEditor from './editors/GoogleContactsEditor';
import FormulaEditor from './editors/FormulaEditor';

const editors = {
  trigger: TriggerEditor,
  message: MessageEditor,
  condition: ConditionEditor,
  delay: DelayEditor,
  action: ActionEditor,
  list: ListEditor,
  registration: RegistrationEditor,
  note: NoteEditor,
  integration: IntegrationEditor,
  send_other: SendOtherEditor,
  google_sheets: GoogleSheetsEditor,
  google_contacts: GoogleContactsEditor,
  formula: FormulaEditor,
};

const titles = {
  trigger: 'עריכת טריגר',
  message: 'WhatsApp',
  condition: 'עריכת תנאי',
  delay: 'עריכת השהייה',
  action: 'עריכת פעולה',
  list: 'עריכת רשימת בחירה',
  registration: 'עריכת תהליך רישום',
  note: 'עריכת הערה',
  integration: 'עריכת אינטגרציה',
  send_other: 'שליחה אחרת',
  google_sheets: 'Google Sheets',
  google_contacts: 'Google Contacts',
  formula: 'חישוב / נוסחה',
};

const colors = {
  trigger: 'bg-purple-50 border-purple-200',
  message: 'bg-teal-50 border-teal-200',
  condition: 'bg-orange-50 border-orange-200',
  delay: 'bg-blue-50 border-blue-200',
  action: 'bg-pink-50 border-pink-200',
  list: 'bg-cyan-50 border-cyan-200',
  registration: 'bg-indigo-50 border-indigo-200',
  note: 'bg-yellow-50 border-yellow-200',
  integration: 'bg-orange-50 border-orange-200',
  send_other: 'bg-violet-50 border-violet-200',
  google_sheets: 'bg-green-50 border-green-200',
  google_contacts: 'bg-blue-50 border-blue-200',
  formula: 'bg-emerald-50 border-emerald-200',
};

// Check if a node has no user content (still at default/empty state)
function isNodeEmpty(node) {
  const d = node.data || {};
  switch (node.type) {
    case 'message': return !d.actions || d.actions.length === 0;
    case 'condition': return !d.conditions || d.conditions.length === 0;
    case 'delay': return !d.actions || d.actions.length === 0;
    case 'action': return !d.actions || d.actions.length === 0;
    case 'list': return !d.title && (!d.sections || d.sections.length === 0);
    case 'registration': return !d.title && (!d.questions || d.questions.length === 0);
    case 'integration': return !d.actions || d.actions.length === 0;
    case 'send_other': return !d.actions || d.actions.length === 0;
    case 'google_sheets': return !d.actions || d.actions.length === 0;
    case 'google_contacts': return !d.actions || d.actions.length === 0;
    case 'formula': return !d.formula && !d.expression;
    default: return false; // unknown types — don't auto-delete
  }
}

export default function NodeEditor({ node, onUpdate, onClose, onDelete, isNodeConnected, botId }) {
  if (!node) return null;
  
  const Editor = editors[node.type];
  if (!Editor) return null;
  
  const handleUpdate = (newData) => {
    onUpdate(node.id, newData);
  };

  const handleDelete = () => {
    onDelete(node.id);
  };
  
  const handleClose = () => {
    // If node is NOT connected to any edge and is still empty, delete it when closing
    // Never delete: trigger nodes, note nodes, or nodes with user content
    if (node.type !== 'trigger' && node.type !== 'note' && isNodeConnected && !isNodeConnected(node.id) && isNodeEmpty(node)) {
      onDelete(node.id);
    }
    onClose();
  };
  
  return (
    <div className="w-96 bg-white border-r border-gray-200 flex flex-col h-full shadow-xl">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${colors[node.type] || 'bg-gray-50 border-gray-200'}`}>
        <h3 className="font-bold text-gray-800">{titles[node.type]}</h3>
        <button
          onClick={handleClose}
          className="p-2 hover:bg-white/50 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>
      
      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Editor data={node.data || {}} onUpdate={handleUpdate} botId={botId} />
      </div>
      
      {/* Footer - Delete button (not for trigger) */}
      {node.type !== 'trigger' && (
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleDelete}
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
