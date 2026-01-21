import { useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TriggerNode from './TriggerNode';
import MessageNode from './MessageNode';
import ConditionNode from './ConditionNode';
import DelayNode from './DelayNode';
import ActionNode from './ActionNode';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
};

const defaultTriggerNode = {
  id: 'trigger_start',
  type: 'trigger',
  position: { x: 400, y: 100 },
  data: { triggers: [{ type: 'any_message', value: '' }] },
};

export default function FlowBuilder({ initialData, onChange }) {
  const reactFlowWrapper = useRef(null);
  
  // Initialize with trigger node if no nodes exist
  const initialNodes = initialData?.nodes?.length > 0 
    ? initialData.nodes 
    : [defaultTriggerNode];
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || []);

  // Notify parent of changes
  useEffect(() => {
    onChange?.({ nodes, edges });
  }, [nodes, edges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      style: { strokeWidth: 2, stroke: '#94a3b8' },
      type: 'smoothstep',
    }, eds)),
    [setEdges]
  );

  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, ...newData },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Add onChange to each node's data
  const nodesWithCallbacks = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onChange: (newData) => updateNodeData(node.id, newData),
    },
  }));

  // Handle drop from palette
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };

      const newNode = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: getDefaultData(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Add node function for click
  const addNode = useCallback((type) => {
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position: { 
        x: 200 + Math.random() * 100, 
        y: 150 + nodes.length * 120 
      },
      data: getDefaultData(type),
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes]);

  return (
    <div className="h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls 
          position="bottom-left" 
          showInteractive={false}
          className="!bg-white/80 !backdrop-blur !rounded-xl !border !border-gray-200 !shadow-lg"
        />
        <MiniMap 
          position="bottom-right"
          className="!bg-white/80 !backdrop-blur !rounded-xl !border !border-gray-200 !shadow-lg"
          nodeColor={(n) => {
            switch (n.type) {
              case 'trigger': return '#a855f7';
              case 'message': return '#14b8a6';
              case 'condition': return '#f97316';
              case 'delay': return '#3b82f6';
              case 'action': return '#ec4899';
              default: return '#6b7280';
            }
          }}
          maskColor="rgba(255, 255, 255, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}

function getDefaultData(type) {
  switch (type) {
    case 'trigger':
      return { triggers: [{ type: 'any_message', value: '' }] };
    case 'message':
      return { content: '' };
    case 'condition':
      return { variable: 'message', operator: 'equals', value: '' };
    case 'delay':
      return { delay: 1, unit: 'seconds' };
    case 'action':
      return { actionType: 'add_tag', tagName: '' };
    default:
      return {};
  }
}

// Export addNode for external use
FlowBuilder.getDefaultData = getDefaultData;
