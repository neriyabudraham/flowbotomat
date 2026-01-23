import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Edit2, Copy, Trash2 } from 'lucide-react';

function BaseNode({ 
  data, 
  selected, 
  type,
  color,
  icon: Icon,
  title,
  children,
  hasSource = true,
  hasTarget = true,
  sourceHandles = [{ id: null, position: '50%' }],
  canDelete: canDeleteProp,
  canDuplicate: canDuplicateProp,
  customGradient,
}) {
  const colorClasses = {
    purple: { bg: 'from-purple-500 to-purple-600', border: 'border-purple-400', shadow: 'shadow-purple-200', handle: 'bg-purple-500' },
    teal: { bg: 'from-teal-500 to-teal-600', border: 'border-teal-400', shadow: 'shadow-teal-200', handle: 'bg-teal-500' },
    orange: { bg: 'from-orange-500 to-orange-600', border: 'border-orange-400', shadow: 'shadow-orange-200', handle: 'bg-orange-500' },
    blue: { bg: 'from-blue-500 to-blue-600', border: 'border-blue-400', shadow: 'shadow-blue-200', handle: 'bg-blue-500' },
    pink: { bg: 'from-pink-500 to-pink-600', border: 'border-pink-400', shadow: 'shadow-pink-200', handle: 'bg-pink-500' },
    cyan: { bg: 'from-cyan-500 to-cyan-600', border: 'border-cyan-400', shadow: 'shadow-cyan-200', handle: 'bg-cyan-500' },
    yellow: { bg: 'from-yellow-400 to-yellow-500', border: 'border-yellow-400', shadow: 'shadow-yellow-200', handle: 'bg-yellow-500' },
    green: { bg: 'from-green-400 to-green-500', border: 'border-green-400', shadow: 'shadow-green-200', handle: 'bg-green-500' },
  };

  const colors = colorClasses[color] || colorClasses.purple;
  // Use props if provided, otherwise default behavior
  const canDuplicate = canDuplicateProp !== undefined ? canDuplicateProp : true;
  const canDelete = canDeleteProp !== undefined ? canDeleteProp : true;

  return (
    <div 
      className={`group bg-white rounded-2xl border-2 transition-all duration-200 min-w-[220px] max-w-[300px] ${
        selected 
          ? `${colors.border} shadow-lg ${colors.shadow}` 
          : 'border-gray-200 shadow-md hover:shadow-lg hover:border-gray-300'
      }`}
    >
      {/* Hover Actions */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1">
          <button 
            onClick={(e) => { e.stopPropagation(); data.onEdit?.(); }}
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
            title="עריכה"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          {canDuplicate && (
            <button 
              onClick={(e) => { e.stopPropagation(); data.onDuplicate?.(); }}
              className="p-2 hover:bg-green-50 rounded-lg transition-colors"
              title="שכפול"
            >
              <Copy className="w-4 h-4 text-green-600" />
            </button>
          )}
          {canDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
              title="מחיקה"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      </div>

      {/* Target Handle */}
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className={`!w-4 !h-4 ${colors.handle} !border-2 !border-white !-left-2`}
        />
      )}
      
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${customGradient || `bg-gradient-to-l ${colors.bg}`} rounded-t-xl`}>
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">{title}</span>
      </div>
      
      {/* Content */}
      <div className="p-3">
        {children}
      </div>
      
      {/* Source Handles */}
      {hasSource && sourceHandles.map((handle, i) => (
        <Handle
          key={handle.id || i}
          type="source"
          position={Position.Right}
          id={handle.id}
          style={{ top: handle.position }}
          className={`!w-4 !h-4 ${handle.color || colors.handle} !border-2 !border-white !-right-2`}
        />
      ))}
    </div>
  );
}

export default memo(BaseNode);
