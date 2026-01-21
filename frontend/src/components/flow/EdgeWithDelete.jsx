import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
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
  selected,
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showDelete = isHovered || selected;

  return (
    <>
      {/* Invisible wider path for easier hover */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={30}
        stroke="transparent"
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: showDelete ? 3 : 2,
          stroke: showDelete ? '#f97316' : '#94a3b8',
        }}
      />
      
      {showDelete && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                data?.onDelete?.();
              }}
              className="w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
