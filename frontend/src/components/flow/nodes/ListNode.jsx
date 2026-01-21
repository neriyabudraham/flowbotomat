import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { List, Edit2, Copy, Trash2 } from 'lucide-react';

function ListNode({ data, selected }) {
  const buttons = data.buttons || [];
  
  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[250px] max-w-[320px] ${
        selected 
          ? 'border-cyan-400 shadow-lg shadow-cyan-200' 
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
        className="!w-4 !h-4 bg-cyan-500 !border-2 !border-white !-left-2"
      />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-l from-cyan-500 to-cyan-600 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <List className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">רשימת בחירה</span>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        {data.title && (
          <div className="text-sm font-medium text-gray-700 truncate">{data.title}</div>
        )}
        {data.body && (
          <div className="text-xs text-gray-500 truncate">{data.body}</div>
        )}
        
        {/* Buttons with individual handles */}
        <div className="space-y-2 mt-3">
          {buttons.map((btn, i) => (
            <div 
              key={btn.id || i} 
              className="relative flex items-center bg-cyan-50 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-cyan-700 flex-1 truncate">
                {btn.title || `כפתור ${i + 1}`}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={String(i)}
                style={{ top: '50%', right: '-8px' }}
                className="!w-3 !h-3 bg-cyan-500 !border-2 !border-white !relative !transform-none"
              />
            </div>
          ))}
          {buttons.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">
              לחץ לעריכה והוסף כפתורים
            </div>
          )}
        </div>
      </div>
      
      {/* Timeout Handle */}
      <div className="relative border-t border-gray-100 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">אין תגובה</span>
          <Handle
            type="source"
            position={Position.Right}
            id="timeout"
            style={{ top: '50%', right: '-8px' }}
            className="!w-3 !h-3 bg-gray-400 !border-2 !border-white !relative !transform-none"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(ListNode);
