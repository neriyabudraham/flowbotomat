import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TriggerNode, MessageNode, ConditionNode, DelayNode, ActionNode } from './nodes';
import QuickAddMenu from './panels/QuickAddMenu';

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
  position: { x: 100, y: 200 },
  data: { triggers: [{ type: 'any_message', value: '' }] },
};

function FlowBuilderInner({ initialData, onChange, onNodeSelect }) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [quickAddMenu, setQuickAddMenu] = useState(null);
  const [pendingConnection, setPendingConnection] = useState(null);
  
  const initialNodes = initialData?.nodes?.length > 0 
    ? initialData.nodes 
    : [defaultTriggerNode];
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || []);

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

  // Handle connection end on empty space - show quick add menu
  const onConnectEnd = useCallback(
    (event, connectionState) => {
      if (!connectionState.isValid && connectionState.fromNode) {
        const { clientX, clientY } = event.changedTouches?.[0] || event;
        
        setPendingConnection({
          source: connectionState.fromNode.id,
          sourceHandle: connectionState.fromHandle?.id,
        });
        
        setQuickAddMenu({ x: clientX, y: clientY });
      }
    },
    []
  );

  const handleQuickAdd = useCallback((type) => {
    if (!quickAddMenu) return;
    
    const position = screenToFlowPosition({
      x: quickAddMenu.x,
      y: quickAddMenu.y,
    });
    
    const newNodeId = `${type}_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type,
      position,
      data: getDefaultData(type),
    };
    
    setNodes((nds) => [...nds, newNode]);
    
    // Connect if there's a pending connection
    if (pendingConnection) {
      setEdges((eds) => addEdge({
        source: pendingConnection.source,
        sourceHandle: pendingConnection.sourceHandle,
        target: newNodeId,
        style: { strokeWidth: 2, stroke: '#94a3b8' },
        type: 'smoothstep',
      }, eds));
    }
    
    setQuickAddMenu(null);
    setPendingConnection(null);
  }, [quickAddMenu, pendingConnection, screenToFlowPosition, setNodes, setEdges]);

  // Handle node click for editing
  const onNodeClick = useCallback((event, node) => {
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  // Add node from palette
  const addNode = useCallback((type, position = null) => {
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position: position || { 
        x: 300 + Math.random() * 100, 
        y: 150 + nodes.length * 120 
      },
      data: getDefaultData(type),
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes]);

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

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div className="h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ strokeWidth: 2, stroke: '#94a3b8' }}
        connectionLineType="smoothstep"
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls 
          position="bottom-left" 
          showInteractive={false}
          className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg"
        />
        <MiniMap 
          position="bottom-right"
          className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg"
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
      
      {/* Quick Add Menu */}
      {quickAddMenu && (
        <QuickAddMenu
          position={quickAddMenu}
          onSelect={handleQuickAdd}
          onClose={() => {
            setQuickAddMenu(null);
            setPendingConnection(null);
          }}
        />
      )}
    </div>
  );
}

export default function FlowBuilder(props) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner {...props} />
    </ReactFlowProvider>
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
