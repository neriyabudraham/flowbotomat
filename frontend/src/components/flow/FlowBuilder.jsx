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

import { TriggerNode, MessageNode, ConditionNode, DelayNode, ActionNode, ListNode, NoteNode, IntegrationNode, SendOtherNode, GoogleSheetsNode } from './nodes';
import RegistrationNode from './nodes/RegistrationNode';
import QuickAddMenu from './panels/QuickAddMenu';
import EdgeWithDelete from './EdgeWithDelete';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
  list: ListNode,
  registration: RegistrationNode,
  note: NoteNode,
  integration: IntegrationNode,
  send_other: SendOtherNode,
  google_sheets: GoogleSheetsNode,
};

const edgeTypes = {
  default: EdgeWithDelete,
};

function FlowBuilderInner({ initialData, onChange, onNodeSelect, onEdgeDelete }) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [quickAddMenu, setQuickAddMenu] = useState(null);
  const [pendingConnection, setPendingConnection] = useState(null);
  const [miniMapCollapsed, setMiniMapCollapsed] = useState(true);
  
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
    // Count trigger nodes for conditional delete
    const triggerCount = nodes.filter(n => n.type === 'trigger').length;
    
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onEdit: () => onNodeSelect?.(node),
        onDelete: () => handleDeleteNode(node.id),
        onDuplicate: () => handleDuplicateNode(node.id),
        // Pass trigger count to trigger nodes
        ...(node.type === 'trigger' ? { triggerCount } : {}),
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
          animated: true,
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#94a3b8' },
        }}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ strokeWidth: 2, stroke: '#94a3b8' }}
        connectionLineType="bezier"
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
          {!miniMapCollapsed && (
            <div className="relative bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
              {/* Header - minimal */}
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100">
                <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                  מפת ניווט
                </span>
                <button
                  onClick={() => setMiniMapCollapsed(true)}
                  className="text-gray-300 hover:text-gray-500 transition-colors p-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <MiniMap 
                className="!bg-gray-50/50 !rounded-none !border-0 !shadow-none !relative !bottom-0 !right-0 !m-0"
                style={{ width: 160, height: 100 }}
                nodeColor={(n) => {
                  const colors = {
                    trigger: '#a855f7',
                    message: '#14b8a6',
                    condition: '#f97316',
                    delay: '#3b82f6',
                    action: '#ec4899',
                    list: '#06b6d4',
                    registration: '#6366f1',
                    integration: '#f97316',
                    note: '#eab308',
                  };
                  return colors[n.type] || '#6b7280';
                }}
                nodeStrokeWidth={0}
                maskColor="rgba(99, 102, 241, 0.1)"
                maskStrokeColor="#6366f1"
                maskStrokeWidth={1.5}
                pannable
                zoomable
              />
            </div>
          )}
          {miniMapCollapsed && (
            <button
              onClick={() => setMiniMapCollapsed(false)}
              className="px-3 py-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-white hover:shadow-lg transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              מפה
            </button>
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
      return { triggerGroups: [] };
    case 'message':
      return { actions: [], waitForReply: false };
    case 'condition':
      return { conditions: [], logic: 'and' };
    case 'delay':
      return { actions: [] };
    case 'action':
      return { actions: [] };
    case 'list':
      return { title: '', body: '', buttonText: 'בחר', sections: [], waitForReply: true, timeout: null };
    case 'registration':
      return { questions: [], title: '' };
    case 'note':
      return { note: '', color: 'yellow' };
    case 'integration':
      return { actions: [] };
    case 'google_sheets':
      return { actions: [] };
    default:
      return {};
  }
}
