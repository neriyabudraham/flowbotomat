import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ClipboardList, Edit2, Copy, Trash2, CheckCircle, Clock } from 'lucide-react';

const typeIcon = { text: '📝', number: '🔢', phone: '📱', email: '📧', choice: '📋', date: '📅', image: '🖼️', file: '📎' };

function RegistrationNode({ data, selected }) {
  const questions = data.questions || [];

  return (
    <div
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[220px] max-w-[300px] ${
        selected
          ? 'border-indigo-400 shadow-lg shadow-indigo-200'
          : 'border-gray-200 shadow-md hover:shadow-lg hover:border-gray-300'
      }`}
    >
      {/* Hover Actions */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1">
          <button onClick={(e) => { e.stopPropagation(); data.onEdit?.(); }} className="p-2 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); data.onDuplicate?.(); }} className="p-2 hover:bg-green-50 rounded-lg transition-colors">
            <Copy className="w-4 h-4 text-green-600" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }} className="p-2 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>

      {/* Target Handle */}
      <Handle type="target" position={Position.Left} className="!w-4 !h-4 bg-indigo-500 !border-2 !border-white !-left-2" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-indigo-500 to-purple-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <ClipboardList className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-white text-sm">תהליך רישום</span>
          {data.title && <p className="text-white/70 text-xs truncate">{data.title}</p>}
        </div>
        <span className="text-white/80 text-xs font-medium bg-white/15 px-2 py-0.5 rounded-full">
          {questions.length} שאלות
        </span>
      </div>

      {/* Questions */}
      <div className="p-3 space-y-1.5">
        {questions.length === 0 ? (
          <div className="text-center py-3 text-gray-400 text-sm">לחץ להגדרת שאלות</div>
        ) : (
          <>
            {questions.slice(0, 4).map((q, i) => (
              <div key={i} className="bg-gray-50 rounded-lg px-2.5 py-2 flex items-center gap-2">
                <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-[11px] font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs">{typeIcon[q.type] || '📝'}</span>
                <span className="text-xs text-gray-600 truncate flex-1">{q.question || `שאלה ${i + 1}`}</span>
                {q.varName && (
                  <span className="text-[10px] text-indigo-400 font-mono flex-shrink-0">{q.varName}</span>
                )}
              </div>
            ))}
            {questions.length > 4 && (
              <div className="text-[11px] text-gray-400 text-center py-1">
                +{questions.length - 4} שאלות נוספות
              </div>
            )}
          </>
        )}

        {/* Indicators */}
        {(data.sendSummary || data.timeout) && (
          <div className="flex gap-1.5 flex-wrap pt-0.5">
            {data.sendSummary && (
              <span className="flex items-center gap-1 bg-green-50 text-green-700 text-[10px] px-2 py-0.5 rounded-full">
                <CheckCircle className="w-2.5 h-2.5" />
                סיכום
              </span>
            )}
            {data.timeout && (
              <span className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded-full">
                <Clock className="w-2.5 h-2.5" />
                {data.timeout} {data.timeoutUnit === 'minutes' ? 'דק׳' : 'שע׳'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Output Handles — inline rows like MessageNode/ListNode */}
      <div className="border-t border-gray-100">
        <div className="relative flex items-center justify-between px-3 py-2">
          <span className="text-xs text-green-600 font-medium">✅ הושלם</span>
          <Handle
            type="source"
            position={Position.Right}
            id="complete"
            style={{ top: '50%', right: '-8px' }}
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !relative !transform-none"
          />
        </div>
        <div className="relative flex items-center justify-between px-3 py-2 border-t border-gray-100">
          <span className="text-xs text-red-400">❌ בוטל / טיימאאוט</span>
          <Handle
            type="source"
            position={Position.Right}
            id="cancel"
            style={{ top: '50%', right: '-8px' }}
            className="!w-3 !h-3 !bg-red-400 !border-2 !border-white !relative !transform-none"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(RegistrationNode);
