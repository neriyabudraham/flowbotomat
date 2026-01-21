import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
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

import { TriggerNode, MessageNode, ConditionNode, DelayNode, ActionNode, ListNode } from './nodes';
import QuickAddMenu from './panels/QuickAddMenu';
import EdgeWithDelete from './EdgeWithDelete';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
  list: ListNode,
};

const edgeTypes = {
  default: EdgeWithDelete,
};

function FlowBuilderInner({ initialData, onChange, onNodeSelect, onEdgeDelete }) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [quickAddMenu, setQuickAddMenu] = useState(null);
  const [pendingConnection, setPendingConnection] = useState(null);
  const [miniMapCollapsed, setMiniMapCollapsed] = useState(false);
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || []);

  // Sync with parent
  useEffect(() => {
    onChange?.({ nodes, edges });
  }, [nodes, edges]);

  // Delete node
  const handleDeleteNode = useCallback((nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  // Duplicate node
  const handleDuplicateNode = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'trigger') return;
    
    const newNode = {
      ...node,
      id: `${node.type}_${Date.now()}`,
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      data: { ...node.data },
      selected: false,
    };
    
    setNodes(nds => [...nds, newNode]);
  }, [nodes, setNodes]);

  // Delete edge
  const handleDeleteEdge = useCallback((edgeId) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId));
    onEdgeDelete?.(edgeId);
  }, [setEdges, onEdgeDelete]);

  // Add callbacks to nodes
  const nodesWithCallbacks = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onEdit: () => onNodeSelect?.(node),
        onDelete: () => handleDeleteNode(node.id),
        onDuplicate: () => handleDuplicateNode(node.id),
      }
    }));
  }, [nodes, onNodeSelect, handleDeleteNode, handleDuplicateNode]);

  // Add callbacks to edges
  const edgesWithCallbacks = useMemo(() => {
    return edges.map(edge => ({
      ...edge,
      data: { 
        ...edge.data, 
        onDelete: () => handleDeleteEdge(edge.id) 
      }
    }));
  }, [edges, handleDeleteEdge]);

  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge({
        ...params,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
      }, eds));
    },
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
    
    setTimeout(() => {
      onNodeSelect?.({ id: newNodeId, type, data: getDefaultData(type), position });
    }, 50);
  }, [quickAddMenu, pendingConnection, screenToFlowPosition, setNodes, setEdges, onNodeSelect]);

  const onNodeClick = useCallback((event, node) => {
    // Get the latest node data
    const currentNode = nodes.find(n => n.id === node.id) || node;
    onNodeSelect?.(currentNode);
  }, [nodes, onNodeSelect]);

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
      }, 50);
    },
    [screenToFlowPosition, setNodes, onNodeSelect]
  );

  return (
    <div className="h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edgesWithCallbacks}
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
        connectionLineStyle={{ strokeWidth: 2, stroke: '#64748b' }}
        connectionLineType="smoothstep"
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls 
          position="bottom-left" 
          showInteractive={false}
          className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg"
        />
        
        {/* MiniMap */}
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={() => setMiniMapCollapsed(!miniMapCollapsed)}
            className="absolute -top-8 right-0 px-2 py-1 bg-white border border-gray-200 rounded-t-lg text-xs text-gray-500 hover:bg-gray-50"
          >
            {miniMapCollapsed ? '📍 הצג' : '📍 הסתר'}
          </button>
          {!miniMapCollapsed && (
            <MiniMap 
              className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg !relative !bottom-0 !right-0"
              style={{ width: 150, height: 100 }}
              nodeColor={(n) => {
                const colors = {
                  trigger: '#a855f7',
                  message: '#14b8a6',
                  condition: '#f97316',
                  delay: '#3b82f6',
                  action: '#ec4899',
                  list: '#06b6d4',
                };
                return colors[n.type] || '#6b7280';
              }}
              maskColor="rgba(255, 255, 255, 0.8)"
              pannable
              zoomable
            />
          )}
        </div>
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
      return { actions: [{ type: 'text', content: '' }], waitForReply: false };
    case 'condition':
      return { variable: 'message', operator: 'contains', value: '' };
    case 'delay':
      return { delay: 1, unit: 'seconds' };
    case 'action':
      return { actions: [{ type: 'add_tag', tagName: '' }] };
    case 'list':
      return { title: '', body: '', buttonText: 'בחר', buttons: [], waitForReply: true, timeout: null };
    default:
      return {};
  }
}
