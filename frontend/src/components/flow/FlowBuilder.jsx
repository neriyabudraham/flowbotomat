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
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TriggerNode, MessageNode, ConditionNode, DelayNode, ActionNode } from './nodes';
import QuickAddMenu from './panels/QuickAddMenu';
import EdgeWithDelete from './EdgeWithDelete';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
};

const edgeTypes = {
  default: EdgeWithDelete,
};

const defaultTriggerNode = {
  id: 'trigger_start',
  type: 'trigger',
  position: { x: 100, y: 200 },
  data: { triggers: [{ type: 'any_message', value: '' }] },
};

function FlowBuilderInner({ initialData, onChange, onNodeSelect, onNodeDelete, onNodeDuplicate }) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, getNode } = useReactFlow();
  const [quickAddMenu, setQuickAddMenu] = useState(null);
  const [pendingConnection, setPendingConnection] = useState(null);
  
  const initialNodes = initialData?.nodes?.length > 0 
    ? initialData.nodes 
    : [defaultTriggerNode];
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || []);

  // Update nodes with callbacks
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        onEdit: () => onNodeSelect?.(node),
        onDelete: () => handleDeleteNode(node.id),
        onDuplicate: () => handleDuplicateNode(node.id),
      }
    })));
  }, [onNodeSelect]);

  // Notify parent of changes
  useEffect(() => {
    const cleanNodes = nodes.map(n => ({
      ...n,
      data: { ...n.data, onEdit: undefined, onDelete: undefined, onDuplicate: undefined }
    }));
    onChange?.({ nodes: cleanNodes, edges });
  }, [nodes, edges]);

  const handleDeleteNode = useCallback((nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    onNodeDelete?.(nodeId);
  }, [setNodes, setEdges, onNodeDelete]);

  const handleDuplicateNode = useCallback((nodeId) => {
    const node = getNode(nodeId);
    if (!node) return;
    
    const newNode = {
      ...node,
      id: `${node.type}_${Date.now()}`,
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      data: { ...node.data },
      selected: false,
    };
    
    setNodes(nds => [...nds, newNode]);
    onNodeDuplicate?.(newNode);
  }, [getNode, setNodes, onNodeDuplicate]);

  const handleDeleteEdge = useCallback((edgeId) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId));
  }, [setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
    }, eds)),
    [setEdges]
  );

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
    
    if (pendingConnection) {
      setEdges((eds) => addEdge({
        source: pendingConnection.source,
        sourceHandle: pendingConnection.sourceHandle,
        target: newNodeId,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
      }, eds));
    }
    
    setQuickAddMenu(null);
    setPendingConnection(null);
    
    // Open editor for new node
    setTimeout(() => {
      const node = { id: newNodeId, type, data: getDefaultData(type), position };
      onNodeSelect?.(node);
    }, 100);
  }, [quickAddMenu, pendingConnection, screenToFlowPosition, setNodes, setEdges, onNodeSelect]);

  const onNodeClick = useCallback((event, node) => {
    onNodeSelect?.(node);
  }, [onNodeSelect]);

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

      const newNodeId = `${type}_${Date.now()}`;
      const newNode = {
        id: newNodeId,
        type,
        position,
        data: getDefaultData(type),
      };
      
      setNodes((nds) => [...nds, newNode]);
      
      setTimeout(() => {
        onNodeSelect?.({ ...newNode });
      }, 100);
    },
    [screenToFlowPosition, setNodes, onNodeSelect]
  );

  // Add edges with delete callback
  const edgesWithDelete = edges.map(edge => ({
    ...edge,
    data: { ...edge.data, onDelete: () => handleDeleteEdge(edge.id) }
  }));

  return (
    <div className="h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edgesWithDelete}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          type: 'default',
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
        }}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ strokeWidth: 2, stroke: '#94a3b8' }}
        connectionLineType="smoothstep"
        minZoom={0.3}
        maxZoom={2}
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
      return { actions: [{ type: 'text', content: '' }] };
    case 'condition':
      return { variable: 'message', operator: 'contains', value: '' };
    case 'delay':
      return { delay: 1, unit: 'seconds' };
    case 'action':
      return { actions: [{ type: 'add_tag', tagName: '' }] };
    default:
      return {};
  }
}
