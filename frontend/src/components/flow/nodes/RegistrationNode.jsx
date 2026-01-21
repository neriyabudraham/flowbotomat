import { Handle, Position } from '@xyflow/react';
import { ClipboardList, CheckCircle } from 'lucide-react';

export default function RegistrationNode({ data, selected }) {
  const questions = data.questions || [];
  
  return (
    <div className={`
      min-w-[220px] max-w-[280px] rounded-2xl shadow-lg border-2 transition-all
      ${selected ? 'border-indigo-500 shadow-indigo-200' : 'border-white'}
      bg-gradient-to-br from-indigo-500 to-purple-600
    `}>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white"
      />
      
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 text-white">
        <ClipboardList className="w-5 h-5" />
        <span className="font-bold">תהליך רישום</span>
      </div>
      
      {/* Content */}
      <div className="bg-indigo-50 rounded-b-xl px-4 py-3 space-y-2">
        {data.title && (
          <div className="text-sm font-medium text-indigo-800 truncate">
            {data.title}
          </div>
        )}
        
        {questions.length > 0 ? (
          <div className="space-y-1">
            {questions.slice(0, 3).map((q, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-indigo-700 bg-white rounded-lg px-2 py-1">
                <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                  {i + 1}
                </span>
                <span className="truncate flex-1">{q.question || `שאלה ${i + 1}`}</span>
                {q.varName && <span className="text-indigo-400 text-[10px]">→ {q.varName}</span>}
              </div>
            ))}
            {questions.length > 3 && (
              <div className="text-xs text-indigo-500 text-center">
                +{questions.length - 3} שאלות נוספות
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-indigo-400 text-center py-2">
            לחץ להגדרת שאלות
          </div>
        )}
        
        {data.sendSummary && (
          <div className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-100 rounded px-2 py-1">
            <CheckCircle className="w-3 h-3" />
            <span>שליחת סיכום למזכירה</span>
          </div>
        )}
      </div>
      
      {/* Output handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="complete"
        style={{ top: '40%' }}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="cancel"
        style={{ top: '70%' }}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />
      
      {/* Labels for handles */}
      <div className="absolute left-full top-[40%] -translate-y-1/2 mr-2 text-[10px] text-gray-400 whitespace-nowrap">
        סיום ✓
      </div>
      <div className="absolute left-full top-[70%] -translate-y-1/2 mr-2 text-[10px] text-gray-400 whitespace-nowrap">
        ביטול ✗
      </div>
    </div>
  );
}
