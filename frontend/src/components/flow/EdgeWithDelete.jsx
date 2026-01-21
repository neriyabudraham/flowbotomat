import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';

export default function EdgeWithDelete({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: 3,
          stroke: style?.stroke || '#6366f1',
        }}
        className="animated"
      />
      
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              data?.onDelete?.();
            }}
            className="w-7 h-7 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:bg-red-50 hover:border-red-400 transition-colors shadow-lg group"
          >
            <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
