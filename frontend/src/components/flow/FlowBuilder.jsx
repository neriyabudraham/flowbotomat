import { useCallback, useRef } from 'react';
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

export default function FlowBuilder({ initialData, onSave }) {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || []);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
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

  const handleSave = () => {
    onSave?.({ nodes, edges });
  };

  return (
    <div className="h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          type: 'smoothstep',
        }}
      >
        <Background color="#e2e8f0" gap={15} />
        <Controls position="bottom-left" />
        <MiniMap 
          position="bottom-right"
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
        />
      </ReactFlow>
    </div>
  );
}
