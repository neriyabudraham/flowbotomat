import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ClipboardList, Edit2, Copy, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';

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

      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 bg-indigo-500 !border-2 !border-white !-left-2"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-indigo-500 to-purple-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <ClipboardList className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">תהליך רישום</span>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        {data.title && (
          <div className="text-sm font-medium text-indigo-700 truncate">
            {data.title}
          </div>
        )}
        
        {questions.length > 0 ? (
          <>
            {questions.slice(0, 3).map((q, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-600 truncate flex-1">
                    {q.question || `שאלה ${i + 1}`}
                  </span>
                </div>
                {q.varName && (
                  <div className="text-xs text-indigo-400 mt-1 mr-7">→ {q.varName}</div>
                )}
              </div>
            ))}
            {questions.length > 3 && (
              <div className="text-xs text-gray-400 text-center">
                +{questions.length - 3} שאלות נוספות
              </div>
            )}
          </>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <span className="text-sm text-gray-400">לחץ להגדרת שאלות</span>
          </div>
        )}
        
        {/* Summary indicator */}
        {data.sendSummary && (
          <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700">
            <CheckCircle className="w-3 h-3" />
            שליחת סיכום למזכירה
          </div>
        )}
        
        {/* Timeout indicator */}
        {data.timeout && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            טיימאאוט: {data.timeout} {data.timeoutUnit === 'minutes' ? 'דקות' : 'שעות'}
          </div>
        )}
      </div>
      
      {/* Output Handles */}
      <div className="absolute left-full top-1/3 flex flex-col gap-4 mr-1">
        <div className="flex items-center gap-1">
          <Handle
            type="source"
            position={Position.Right}
            id="complete"
            className="!w-4 !h-4 !bg-green-500 !border-2 !border-white !relative !transform-none"
          />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">הושלם</span>
        </div>
      </div>
      
      <div className="absolute left-full top-2/3 flex flex-col gap-4 mr-1">
        <div className="flex items-center gap-1">
          <Handle
            type="source"
            position={Position.Right}
            id="cancel"
            className="!w-4 !h-4 !bg-red-500 !border-2 !border-white !relative !transform-none"
          />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">בוטל/טיימאאוט</span>
        </div>
      </div>
    </div>
  );
}

export default memo(RegistrationNode);
