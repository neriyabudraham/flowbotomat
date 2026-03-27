import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  MarkerType, useNodesState, useEdgesState, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowRight, User, Clock, CheckCircle2, XCircle, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, Phone, MessageSquare,
  Zap, GitBranch, Timer, List, FileText, Code, Webhook,
  Table2, Users, Send, Edit3, Pause, Copy, RotateCcw,
  Image, Video, Music, File, MapPin, Eye, Hash, Tag,
  ArrowLeftRight, Play, ExternalLink, AlertCircle, Database, X
} from 'lucide-react';
import api from '../../services/api';

// ===== Constants =====
const STATUS_COLORS = {
  completed: { bg: 'bg-green-500', text: 'text-green-700', light: 'bg-green-50', border: 'border-green-300', ring: 'ring-green-200' },
  running: { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-50', border: 'border-blue-300', ring: 'ring-blue-200' },
  error: { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50', border: 'border-red-300', ring: 'ring-red-200' },
  waiting: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50', border: 'border-amber-300', ring: 'ring-amber-200' },
  skipped: { bg: 'bg-gray-400', text: 'text-gray-600', light: 'bg-gray-50', border: 'border-gray-300', ring: 'ring-gray-200' },
  timeout: { bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-50', border: 'border-orange-300', ring: 'ring-orange-200' },
};

const NODE_TYPE_CONFIG = {
  trigger: { icon: Zap, color: '#a855f7', gradient: 'from-purple-500 to-purple-600', label: 'טריגר' },
  message: { icon: MessageSquare, color: '#14b8a6', gradient: 'from-teal-500 to-teal-600', label: 'הודעה' },
  condition: { icon: GitBranch, color: '#f97316', gradient: 'from-orange-500 to-orange-600', label: 'תנאי' },
  delay: { icon: Timer, color: '#3b82f6', gradient: 'from-blue-500 to-blue-600', label: 'השהייה' },
  action: { icon: Zap, color: '#ec4899', gradient: 'from-pink-500 to-pink-600', label: 'פעולה' },
  list: { icon: List, color: '#06b6d4', gradient: 'from-cyan-500 to-cyan-600', label: 'רשימה' },
  registration: { icon: FileText, color: '#6366f1', gradient: 'from-indigo-500 to-indigo-600', label: 'טופס' },
  formula: { icon: Code, color: '#8b5cf6', gradient: 'from-violet-500 to-violet-600', label: 'נוסחה' },
  integration: { icon: Webhook, color: '#f97316', gradient: 'from-orange-500 to-orange-600', label: 'אינטגרציה' },
  google_sheets: { icon: Table2, color: '#22c55e', gradient: 'from-green-500 to-green-600', label: 'Google Sheets' },
  google_contacts: { icon: Users, color: '#3b82f6', gradient: 'from-blue-500 to-blue-600', label: 'Google Contacts' },
  send_other: { icon: Send, color: '#14b8a6', gradient: 'from-teal-500 to-teal-600', label: 'שליחה לאחר' },
  note: { icon: FileText, color: '#eab308', gradient: 'from-yellow-400 to-yellow-500', label: 'הערה' },
};

const STATUS_LABELS = { completed: 'הושלם', error: 'שגיאה', waiting: 'ממתין', running: 'רץ', skipped: 'דולג', timeout: 'פג תוקף' };

// ===== Helpers =====
function formatDuration(ms) {
  if (!ms && ms !== 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isMediaUrl(url) {
  if (!url) return false;
  try { new URL(url); return true; } catch { return false; }
}

// ===== Execution Flow Node Component =====
function ExecutionFlowNode({ data }) {
  const step = data.step;
  const nodeType = data.nodeType || 'trigger';
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.trigger;
  const Icon = config.icon;
  const isExecuted = !!step;
  const isSelected = data.isSelectedStep;
  const statusColor = step ? STATUS_COLORS[step.status] || STATUS_COLORS.completed : null;

  // Source handles from original node
  const sourceHandles = data.sourceHandles || [{ id: null, position: '50%' }];

  return (
    <div
      className={`rounded-2xl border-2 transition-all duration-200 min-w-[220px] max-w-[280px] ${
        isSelected
          ? `${statusColor?.border || 'border-blue-400'} shadow-xl ring-2 ${statusColor?.ring || 'ring-blue-200'}`
          : isExecuted
          ? `${statusColor?.border || 'border-gray-200'} shadow-lg`
          : 'border-gray-200 shadow-sm opacity-30'
      }`}
      style={{ background: 'white' }}
    >
      {/* Target handle */}
      {nodeType !== 'trigger' && (
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white !-left-1.5" style={{ background: config.color }} />
      )}

      {/* Header - same style as real nodes */}
      <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-t-[14px] bg-gradient-to-l ${config.gradient}`} style={{ opacity: isExecuted ? 1 : 0.4 }}>
        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-bold text-white truncate flex-1">
          {step?.node_label || config.label}
        </span>
        {step && (
          <span className="text-[10px] text-white/60 font-mono">#{step.step_order}</span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {step ? (
          <>
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full ${statusColor?.light} ${statusColor?.text} border ${statusColor?.border}`}>
                {step.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                {step.status === 'error' && <XCircle className="w-3 h-3" />}
                {step.status === 'waiting' && <Pause className="w-3 h-3" />}
                {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                {STATUS_LABELS[step.status] || step.status}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">{formatDuration(step.duration_ms)}</span>
            </div>

            {/* Detailed output preview based on node type */}
            <StepOutputPreview step={step} nodeType={nodeType} />

            {/* Error */}
            {step.error_message && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg break-words">
                <XCircle className="w-3 h-3 inline ml-1" />
                {step.error_message.substring(0, 120)}
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-gray-300 text-center py-1">לא הופעל</div>
        )}
      </div>

      {/* Source handles */}
      {sourceHandles.map((handle, i) => (
        <Handle
          key={handle.id || i}
          type="source"
          position={Position.Right}
          id={handle.id}
          style={{ top: handle.position, background: config.color }}
          className="!w-3 !h-3 !border-2 !border-white !-right-1.5"
        />
      ))}
    </div>
  );
}

// Detailed output preview shown inside flow nodes
function StepOutputPreview({ step, nodeType }) {
  const output = step.output_data || {};
  const input = step.input_data || {};

  switch (nodeType) {
    case 'trigger': {
      return (
        <div className="space-y-1">
          {output.triggerMessage && (
            <div className="text-[10px] text-gray-600 flex items-start gap-1">
              <MessageSquare className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />
              <span className="truncate" dir="auto">"{String(output.triggerMessage).substring(0, 60)}"</span>
            </div>
          )}
          {output.contactName && (
            <div className="text-[10px] text-gray-600 flex items-center gap-1">
              <User className="w-3 h-3 text-purple-400" />
              <span>{output.contactName}</span>
            </div>
          )}
          {output.contactPhone && (
            <div className="text-[10px] text-gray-400 font-mono" dir="ltr">
              {output.contactPhone.replace('@s.whatsapp.net', '').replace('@c.us', '')}
            </div>
          )}
          {output.triggerType && (
            <div className="text-[10px] text-purple-500">
              <Zap className="w-3 h-3 inline ml-1" />
              {output.triggerType === 'keyword' ? `מילת מפתח: ${output.keyword || ''}` :
               output.triggerType === 'any' ? 'כל הודעה' :
               output.triggerType === 'webhook' ? 'Webhook' :
               output.triggerType}
            </div>
          )}
        </div>
      );
    }

    case 'message': {
      const actions = output.actionsSent || input.actions || [];
      return (
        <div className="space-y-1">
          {actions.slice(0, 3).map((action, i) => (
            <div key={i} className="text-[10px] text-gray-600 flex items-start gap-1">
              {action.type === 'text' && <MessageSquare className="w-3 h-3 text-teal-500 mt-0.5 flex-shrink-0" />}
              {action.type === 'image' && <Image className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />}
              {action.type === 'video' && <Video className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />}
              {action.type === 'audio' && <Music className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />}
              {action.type === 'file' && <File className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />}
              {action.type === 'location' && <MapPin className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />}
              {action.type === 'reaction' && <span className="text-sm">{action.emoji || '👍'}</span>}
              {!['image', 'video', 'audio', 'file', 'location', 'reaction'].includes(action.type) && !action.resolvedText && (
                <Zap className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
              )}
              <span className="truncate">
                {action.resolvedText ? `"${action.resolvedText.substring(0, 50)}"` :
                 action.caption ? action.caption.substring(0, 40) :
                 action.mediaUrl ? (isMediaUrl(action.mediaUrl) ? 'מדיה' : 'קובץ') :
                 action.type}
              </span>
            </div>
          ))}
          {actions.length > 3 && <div className="text-[10px] text-gray-400">+{actions.length - 3} נוספים</div>}
          {output.waitingForReply && <div className="text-[10px] text-amber-600 font-medium">ממתין לתשובה...</div>}
        </div>
      );
    }

    case 'condition':
      return (
        <div className="space-y-1">
          <div className={`text-[11px] font-bold ${output.handle === 'yes' ? 'text-green-600' : 'text-red-500'}`}>
            <GitBranch className="w-3 h-3 inline ml-1" />
            תוצאה: {output.result || output.handle}
          </div>
          {output.evaluatedMessage && (
            <div className="text-[10px] text-gray-400 truncate">הודעה: "{output.evaluatedMessage.substring(0, 40)}"</div>
          )}
        </div>
      );

    case 'delay':
      return <div className="text-[11px] text-blue-600"><Timer className="w-3 h-3 inline ml-1" />{output.delayFormatted || '-'}</div>;

    case 'action': {
      const actions = output.actionsExecuted || input.actions || [];
      const changes = output.variableChanges || {};
      return (
        <div className="space-y-1">
          {actions.slice(0, 2).map((a, i) => (
            <div key={i} className="text-[10px] text-gray-600 flex items-center gap-1">
              {a.type === 'set_variable' && <><Hash className="w-3 h-3 text-purple-500" /><span>{a.varName} = {a.varValue}</span></>}
              {a.type === 'add_tag' && <><Tag className="w-3 h-3 text-green-500" /><span>+{a.tagName}</span></>}
              {a.type === 'remove_tag' && <><Tag className="w-3 h-3 text-red-500" /><span>-{a.tagName}</span></>}
              {a.type === 'webhook' && <><ExternalLink className="w-3 h-3 text-orange-500" /><span>Webhook</span></>}
              {!['set_variable', 'add_tag', 'remove_tag', 'webhook'].includes(a.type) && <><Zap className="w-3 h-3 text-pink-500" /><span>{a.type}</span></>}
            </div>
          ))}
          {Object.keys(changes).length > 0 && (
            <div className="text-[10px] text-purple-500">
              <Database className="w-3 h-3 inline ml-1" />
              {Object.keys(changes).length} משתנים שונו
            </div>
          )}
        </div>
      );
    }

    case 'list':
      return (
        <div className="space-y-1">
          {output.title && <div className="text-[10px] text-gray-600 font-medium truncate">{output.title}</div>}
          {(output.buttonsSent || output.buttons || []).slice(0, 3).map((b, i) => (
            <div key={i} className="text-[10px] text-cyan-600 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              {typeof b === 'object' ? b.title : b}
            </div>
          ))}
        </div>
      );

    case 'registration':
      return (
        <div className="text-[10px] text-indigo-600">
          <FileText className="w-3 h-3 inline ml-1" />
          {output.totalQuestions || (output.questionsSent || []).length} שאלות
        </div>
      );

    case 'formula': {
      const results = output.formulaResults || [];
      return (
        <div className="space-y-1">
          {results.slice(0, 2).map((r, i) => (
            <div key={i} className="text-[10px] text-gray-600 font-mono truncate">
              {r.outputVar} = {r.result}
            </div>
          ))}
        </div>
      );
    }

    case 'integration':
    case 'google_sheets':
    case 'google_contacts': {
      const changes = output.variableChanges || {};
      const ops = output.operations || output.actions || [];
      return (
        <div className="space-y-1">
          {ops.slice(0, 1).map((op, i) => (
            <div key={i} className="text-[10px] text-gray-600">
              {op.operation || op.type || op.method || 'פעולה'}
            </div>
          ))}
          {Object.keys(changes).length > 0 && (
            <div className="text-[10px] text-purple-500">
              {Object.keys(changes).length} משתנים עודכנו
            </div>
          )}
        </div>
      );
    }

    case 'send_other':
      return (
        <div className="text-[10px] text-teal-600">
          <Send className="w-3 h-3 inline ml-1" />
          {output.recipientType === 'group' ? 'קבוצה' : output.recipientId || '-'}
        </div>
      );

    default:
      return null;
  }
}

const executionNodeTypes = { executionNode: ExecutionFlowNode };

// ===== Flow Visualization =====
function ExecutionFlowView({ run, selectedStepId, onStepSelect }) {
  const flowSnapshot = run.flow_snapshot;
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!flowSnapshot?.nodes) return;

    const stepMap = {};
    (run.steps || []).forEach(step => { stepMap[step.node_id] = step; });

    // Create synthetic trigger step so trigger node shows execution data
    const triggerNode = flowSnapshot.nodes.find(n => n.type === 'trigger');
    if (triggerNode && !stepMap[triggerNode.id]) {
      stepMap[triggerNode.id] = {
        id: `trigger-${triggerNode.id}`,
        node_id: triggerNode.id,
        node_type: 'trigger',
        node_label: triggerNode.data?.label || 'טריגר',
        step_order: 0,
        status: 'completed',
        input_data: {},
        output_data: {
          triggerMessage: run.trigger_message,
          contactName: run.contact_name,
          contactPhone: run.contact_phone,
          triggerType: triggerNode.data?.triggerType || triggerNode.data?.type,
          keyword: triggerNode.data?.keyword,
          startedAt: run.started_at,
        },
        started_at: run.started_at,
        duration_ms: 0,
      };
    }

    // Compute source handles from edges like the real FlowBuilder
    const sourceHandleMap = {};
    (flowSnapshot.edges || []).forEach(edge => {
      if (!sourceHandleMap[edge.source]) sourceHandleMap[edge.source] = new Set();
      if (edge.sourceHandle) sourceHandleMap[edge.source].add(edge.sourceHandle);
    });

    const flowNodes = flowSnapshot.nodes.map(node => {
      const step = stepMap[node.id];
      // Build source handles for list/condition nodes
      let sourceHandles = [{ id: null, position: '50%' }];
      if (node.type === 'list' && node.data?.buttons) {
        const buttonCount = node.data.buttons.length;
        const hasTimeout = node.data.timeout;
        const totalHandles = buttonCount + (hasTimeout ? 1 : 0);
        sourceHandles = node.data.buttons.map((btn, i) => ({
          id: String(i),
          position: `${((i + 1) / (totalHandles + 1)) * 100}%`,
        }));
        if (hasTimeout) {
          sourceHandles.push({ id: 'timeout', position: `${(totalHandles / (totalHandles + 1)) * 100}%` });
        }
      } else if (node.type === 'condition') {
        sourceHandles = [
          { id: 'yes', position: '35%' },
          { id: 'no', position: '65%' },
        ];
        if (node.data?.timeout) {
          sourceHandles.push({ id: 'timeout', position: '85%' });
        }
      } else if (node.type === 'message' && node.data?.waitForReply) {
        sourceHandles = [
          { id: null, position: '35%' },
          { id: 'timeout', position: '75%' },
        ];
      }

      return {
        id: node.id,
        type: 'executionNode',
        position: node.position,
        data: {
          label: step?.node_label || NODE_TYPE_CONFIG[node.type]?.label || node.type,
          nodeType: node.type,
          nodeData: node.data,
          step,
          isSelectedStep: step?.id === selectedStepId,
          sourceHandles,
        },
      };
    });

    const executedNodeIds = new Set((run.steps || []).map(s => s.node_id));
    const executedEdges = new Set();
    // Mark edges that were actually traversed
    (run.steps || []).forEach(step => {
      if (step.next_handle) {
        const edgeKey = `${step.node_id}-${step.next_handle}`;
        executedEdges.add(edgeKey);
      } else {
        // Default handle
        executedEdges.add(`${step.node_id}-null`);
      }
    });

    const flowEdges = (flowSnapshot.edges || []).map(edge => {
      const sourceStep = stepMap[edge.source];
      const targetStep = stepMap[edge.target];
      const isSourceExecuted = executedNodeIds.has(edge.source);
      const isTargetExecuted = executedNodeIds.has(edge.target);

      // An edge is "active" if both source and target were executed AND the handle matches
      let isActiveEdge = false;
      if (isSourceExecuted && isTargetExecuted) {
        if (sourceStep?.next_handle) {
          isActiveEdge = sourceStep.next_handle === edge.sourceHandle;
        } else {
          isActiveEdge = !edge.sourceHandle || edge.sourceHandle === null;
        }
      }
      // Fallback: if source has no specific handle info, just check both executed
      if (isSourceExecuted && isTargetExecuted && !sourceStep?.next_handle && !edge.sourceHandle) {
        isActiveEdge = true;
      }

      const isErrorPath = sourceStep?.status === 'error' || targetStep?.status === 'error';

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: isActiveEdge,
        style: {
          strokeWidth: isActiveEdge ? 3 : 1.5,
          stroke: isActiveEdge ? (isErrorPath ? '#ef4444' : '#14b8a6') : '#e5e7eb',
          opacity: isActiveEdge ? 1 : 0.35,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed, width: 12, height: 12,
          color: isActiveEdge ? (isErrorPath ? '#ef4444' : '#14b8a6') : '#e5e7eb',
        },
        label: edge.label,
        labelStyle: { fill: isActiveEdge ? '#14b8a6' : '#d1d5db', fontSize: 11, fontWeight: isActiveEdge ? 600 : 400 },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowSnapshot, run.steps, selectedStepId]);

  const onNodeClick = useCallback((_, node) => {
    const step = node.data?.step;
    if (step) onStepSelect?.(step.id === selectedStepId ? null : step.id);
  }, [onStepSelect, selectedStepId]);

  if (!flowSnapshot?.nodes?.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p>לא נמצא snapshot של הפלו</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodeTypes={executionNodeTypes}
      fitView fitViewOptions={{ padding: 0.15 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2} maxZoom={1.5}
      nodesDraggable={false} nodesConnectable={false}
      elementsSelectable panOnDrag panOnScroll
    >
      <Background color="#e5e7eb" gap={20} size={1.5} />
      <Controls position="bottom-left" showInteractive={false} className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg" />
      <MiniMap
        className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg"
        style={{ width: 150, height: 100 }}
        nodeColor={(n) => {
          const step = n.data?.step;
          if (!step) return '#e5e7eb';
          if (step.status === 'error') return '#ef4444';
          if (step.status === 'waiting') return '#f59e0b';
          return NODE_TYPE_CONFIG[n.data?.nodeType]?.color || '#6b7280';
        }}
        maskColor="rgba(20, 184, 166, 0.08)"
        pannable zoomable
      />
    </ReactFlow>
  );
}

// ===== Step Detail Panel =====
function StepDetailPanel({ step, onClose }) {
  const [sections, setSections] = useState({ output: true, input: false, timing: true, variables: true });
  if (!step) return null;

  const statusColor = STATUS_COLORS[step.status] || STATUS_COLORS.completed;
  const nodeConfig = NODE_TYPE_CONFIG[step.node_type] || NODE_TYPE_CONFIG.trigger;
  const Icon = nodeConfig.icon;
  const output = step.output_data || {};
  const input = step.input_data || {};

  const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));

  return (
    <div className="bg-white border-r border-gray-200 w-96 overflow-y-auto flex-shrink-0 shadow-lg">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${nodeConfig.gradient}`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-800">{step.node_label || step.node_type}</div>
              <div className="text-[10px] text-gray-400 font-mono">צעד #{step.step_order} | {step.node_id}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${statusColor.light} ${statusColor.text} border ${statusColor.border}`}>
            {step.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {step.status === 'error' && <XCircle className="w-3.5 h-3.5" />}
            {step.status === 'waiting' && <Pause className="w-3.5 h-3.5" />}
            {STATUS_LABELS[step.status] || step.status}
          </span>
          <span className="text-xs text-gray-400 font-mono">{formatDuration(step.duration_ms)}</span>
          {step.next_handle && (
            <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
              <GitBranch className="w-3 h-3" />
              {step.next_handle === 'yes' ? 'כן' : step.next_handle === 'no' ? 'לא' : step.next_handle}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Error */}
        {step.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700">שגיאה</span>
            </div>
            <div className="text-xs text-red-600 font-mono break-words whitespace-pre-wrap bg-red-100/50 rounded-lg p-2">
              {step.error_message}
            </div>
          </div>
        )}

        {/* Timing */}
        <CollapsibleSection title="תזמון" icon={Clock} open={sections.timing} onToggle={() => toggleSection('timing')}>
          <div className="space-y-1.5">
            <DetailRow label="התחלה" value={formatTime(step.started_at)} mono />
            {step.completed_at && <DetailRow label="סיום" value={formatTime(step.completed_at)} mono />}
            <DetailRow label="משך" value={formatDuration(step.duration_ms)} mono bold />
          </div>
        </CollapsibleSection>

        {/* Detailed output based on node type */}
        <CollapsibleSection title="פלט - תוצאות" icon={Eye} open={sections.output} onToggle={() => toggleSection('output')}>
          <DetailedStepOutput step={step} />
        </CollapsibleSection>

        {/* Variable changes */}
        {output.variableChanges && Object.keys(output.variableChanges).length > 0 && (
          <CollapsibleSection title="שינויי משתנים" icon={Database} open={sections.variables} onToggle={() => toggleSection('variables')}>
            <div className="space-y-1.5">
              {Object.entries(output.variableChanges).map(([key, change]) => (
                <div key={key} className="bg-purple-50 border border-purple-200 rounded-lg p-2">
                  <div className="text-xs font-medium text-purple-700 font-mono">{key}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {change.before !== null && change.before !== undefined && (
                      <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-mono line-through">
                        {String(change.before).substring(0, 50)}
                      </span>
                    )}
                    <ArrowLeftRight className="w-3 h-3 text-gray-400" />
                    <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-mono">
                      {change.after !== null ? String(change.after).substring(0, 50) : 'נמחק'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Input data */}
        {Object.keys(input).length > 0 && (
          <CollapsibleSection title="קלט - נתונים גולמיים" icon={Code} open={sections.input} onToggle={() => toggleSection('input')}>
            <pre className="text-[11px] text-gray-700 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-80 overflow-y-auto bg-gray-50 rounded-lg p-3">
              {JSON.stringify(input, null, 2)}
            </pre>
          </CollapsibleSection>
        )}

        {/* Raw output JSON */}
        {Object.keys(output).length > 0 && (
          <CollapsibleSection title="פלט - נתונים גולמיים" icon={Code} open={false} onToggle={() => {}}>
            <pre className="text-[11px] text-gray-700 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-80 overflow-y-auto bg-gray-50 rounded-lg p-3">
              {JSON.stringify(output, null, 2)}
            </pre>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, open, onToggle, children }) {
  const [isOpen, setIsOpen] = useState(open);
  const toggle = () => { setIsOpen(!isOpen); onToggle?.(); };

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={toggle} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="flex-1 text-right">{title}</span>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {isOpen && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function DetailRow({ label, value, mono, bold }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-400">{label}:</span>
      <span className={`text-gray-700 ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

// Detailed step output renderer based on node type
function DetailedStepOutput({ step }) {
  const output = step.output_data || {};
  const input = step.input_data || {};

  switch (step.node_type) {
    case 'trigger':
      return (
        <div className="space-y-2">
          {output.triggerMessage && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
              <div className="text-[10px] font-medium text-purple-600 mb-1">הודעה שהתקבלה:</div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap break-words" dir="auto">
                "{String(output.triggerMessage)}"
              </div>
            </div>
          )}
          {output.contactName && <DetailRow label="איש קשר" value={output.contactName} />}
          {output.contactPhone && (
            <DetailRow label="טלפון" value={output.contactPhone.replace('@s.whatsapp.net', '').replace('@c.us', '')} mono />
          )}
          {output.triggerType && (
            <DetailRow label="סוג טריגר" value={
              output.triggerType === 'keyword' ? `מילת מפתח: ${output.keyword || ''}` :
              output.triggerType === 'any' ? 'כל הודעה' :
              output.triggerType === 'webhook' ? 'Webhook' :
              output.triggerType
            } />
          )}
          <DetailRow label="זמן הפעלה" value={formatTime(output.startedAt)} mono />
        </div>
      );

    case 'message': {
      const actions = output.actionsSent || input.actions || [];
      return (
        <div className="space-y-2">
          {actions.map((action, i) => (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                {action.type === 'text' && <MessageSquare className="w-3.5 h-3.5 text-teal-500" />}
                {action.type === 'image' && <Image className="w-3.5 h-3.5 text-green-500" />}
                {action.type === 'video' && <Video className="w-3.5 h-3.5 text-blue-500" />}
                {action.type === 'audio' && <Music className="w-3.5 h-3.5 text-purple-500" />}
                {action.type === 'file' && <File className="w-3.5 h-3.5 text-orange-500" />}
                {action.type === 'location' && <MapPin className="w-3.5 h-3.5 text-red-500" />}
                {action.type === 'poll' && <List className="w-3.5 h-3.5 text-cyan-500" />}
                <span className="text-[10px] font-medium text-gray-500 uppercase">{action.type}</span>
              </div>

              {action.resolvedText && (
                <div className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-gray-100 whitespace-pre-wrap break-words max-h-40 overflow-y-auto" dir="auto">
                  {action.resolvedText}
                </div>
              )}
              {action.originalTemplate && action.resolvedText !== action.originalTemplate && (
                <div className="text-[10px] text-gray-400 mt-1 font-mono">
                  תבנית: {action.originalTemplate.substring(0, 100)}
                </div>
              )}
              {action.mediaUrl && (
                <div className="mt-1">
                  {isMediaUrl(action.mediaUrl) ? (
                    <a href={action.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      צפה במדיה
                    </a>
                  ) : (
                    <span className="text-[10px] text-orange-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      המדיה אינה זמינה (קובץ מקומי)
                    </span>
                  )}
                </div>
              )}
              {action.caption && <div className="text-[10px] text-gray-500 mt-1">כיתוב: {action.caption}</div>}
              {action.latitude && <div className="text-[10px] text-gray-500">מיקום: {action.latitude}, {action.longitude}</div>}
              {action.pollName && (
                <div className="text-[10px] text-gray-600">
                  <div className="font-medium">{action.pollName}</div>
                  {action.pollOptions?.map((opt, j) => <div key={j} className="mr-2">• {opt}</div>)}
                </div>
              )}
            </div>
          ))}
          {output.waitingForReply && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
              <Pause className="w-3.5 h-3.5 inline ml-1" />
              ממתין לתשובה מהמשתמש
              {output.timeout && <span className="font-mono"> (טיימאאוט: {output.timeout})</span>}
            </div>
          )}
        </div>
      );
    }

    case 'condition':
      return (
        <div className="space-y-2">
          <div className={`p-3 rounded-lg border ${output.handle === 'yes' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`text-sm font-bold ${output.handle === 'yes' ? 'text-green-700' : 'text-red-700'}`}>
              {output.result}
            </div>
          </div>
          {output.evaluatedMessage && (
            <DetailRow label="הודעה שנבדקה" value={`"${output.evaluatedMessage.substring(0, 100)}"`} />
          )}
          {output.contactName && <DetailRow label="איש קשר" value={output.contactName} />}
          {output.variables && Object.keys(output.variables).length > 0 && (
            <div className="bg-purple-50 rounded-lg p-2 space-y-1">
              <div className="text-[10px] font-medium text-purple-600">משתנים בזמן הבדיקה:</div>
              {Object.entries(output.variables).slice(0, 10).map(([k, v]) => (
                <div key={k} className="text-[10px] font-mono text-purple-700">{k} = {String(v).substring(0, 60)}</div>
              ))}
            </div>
          )}
        </div>
      );

    case 'list':
      return (
        <div className="space-y-2">
          {output.title && <DetailRow label="כותרת" value={output.title} />}
          {output.body && <DetailRow label="תוכן" value={output.body.substring(0, 100)} />}
          <div className="space-y-1">
            {(output.buttonsSent || []).map((btn, i) => (
              <div key={i} className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-lg px-2.5 py-1.5">
                <div className="w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] flex items-center justify-center font-bold">{i + 1}</div>
                <span className="text-xs text-cyan-800">{btn.title || btn}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'formula':
      return (
        <div className="space-y-2">
          {(output.formulaResults || []).map((r, i) => (
            <div key={i} className="bg-violet-50 border border-violet-200 rounded-lg p-2.5">
              <div className="text-[10px] text-violet-500 font-mono mb-1">{r.expression}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{r.outputVar} =</span>
                <span className="text-xs font-bold text-violet-700 font-mono">{String(r.result)}</span>
              </div>
            </div>
          ))}
        </div>
      );

    case 'delay':
      return <DetailRow label="זמן המתנה" value={output.delayFormatted || '-'} />;

    case 'registration':
      return (
        <div className="space-y-1.5">
          {output.welcomeMessage && <DetailRow label="הודעת פתיחה" value={output.welcomeMessage.substring(0, 80)} />}
          {(output.questionsSent || []).map((q, i) => (
            <div key={i} className="text-xs text-gray-600 bg-indigo-50 rounded-lg px-2.5 py-1.5 border border-indigo-200">
              <span className="font-medium text-indigo-700">{i + 1}.</span> {q.question || q.varName}
              <span className="text-[10px] text-indigo-400 mr-2">({q.varName})</span>
            </div>
          ))}
        </div>
      );

    default:
      if (Object.keys(output).length > 0) {
        return (
          <pre className="text-[11px] text-gray-700 font-mono whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-2">
            {JSON.stringify(output, null, 2)}
          </pre>
        );
      }
      return <div className="text-xs text-gray-400">אין נתוני פלט</div>;
  }
}

// ===== Timeline View =====
function TimelineView({ steps, selectedStepId, onStepSelect }) {
  if (steps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <Clock className="w-8 h-8 mx-auto mb-2" />
        <p>אין צעדים</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="relative">
        <div className="absolute right-[23px] top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-1">
          {steps.map((step) => {
            const statusColor = STATUS_COLORS[step.status] || STATUS_COLORS.completed;
            const nodeConfig = NODE_TYPE_CONFIG[step.node_type] || NODE_TYPE_CONFIG.trigger;
            const Icon = nodeConfig.icon;
            const isSelected = step.id === selectedStepId;
            const output = step.output_data || {};

            return (
              <button
                key={step.id}
                onClick={() => onStepSelect(isSelected ? null : step.id)}
                className={`w-full text-right relative flex items-start gap-3 pr-2 py-3 pl-3 rounded-xl transition-all ${
                  isSelected ? 'bg-teal-50 border border-teal-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${statusColor.bg} ring-2 ring-white shadow-sm`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{step.node_label || step.node_type}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${statusColor.light} ${statusColor.text}`}>
                        {STATUS_LABELS[step.status] || step.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{formatDuration(step.duration_ms)}</span>
                  </div>

                  {/* Inline output preview */}
                  <div className="text-xs text-gray-500 space-y-0.5">
                    {step.node_type === 'message' && (output.actionsSent || []).slice(0, 2).map((a, i) => (
                      <div key={i} className="truncate">{a.resolvedText ? `"${a.resolvedText.substring(0, 60)}"` : a.type}</div>
                    ))}
                    {step.node_type === 'condition' && output.result && (
                      <div className={output.handle === 'yes' ? 'text-green-600' : 'text-red-500'}>תוצאה: {output.result}</div>
                    )}
                    {step.node_type === 'action' && output.actionsExecuted?.map((a, i) => (
                      <div key={i}>{a.type}{a.varName ? `: ${a.varName}` : ''}{a.tagName ? `: ${a.tagName}` : ''}</div>
                    ))}
                    {step.node_type === 'formula' && (output.formulaResults || []).map((r, i) => (
                      <div key={i} className="font-mono">{r.outputVar} = {r.result}</div>
                    ))}
                    {step.error_message && <div className="text-red-500 truncate">{step.error_message}</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Main Component =====
export default function ExecutionRunDetail({ botId, runId, onBack, onNavigateToEditor }) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [viewMode, setViewMode] = useState('flow');
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/bots/${botId}/history/${runId}`);
        setRun(data.run);
      } catch (err) {
        console.error('Failed to load execution run:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [botId, runId]);

  const selectedStep = useMemo(() => {
    if (!selectedStepId || !run?.steps) return null;
    return run.steps.find(s => s.id === selectedStepId);
  }, [selectedStepId, run]);

  const handleRerun = async () => {
    if (!confirm('להריץ את הבוט מחדש עבור איש הקשר הזה?')) return;
    setRerunning(true);
    try {
      const { data } = await api.post(`/bots/${botId}/history/${runId}/rerun`);
      alert(data.message || 'הבוט הורץ מחדש');
      // Navigate to the new run
      if (data.runId) {
        setTimeout(async () => {
          try {
            const { data: newData } = await api.get(`/bots/${botId}/history/${data.runId}`);
            setRun(newData.run);
            setSelectedStepId(null);
          } catch (e) {}
          setRerunning(false);
        }, 2000);
      } else {
        setRerunning(false);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהרצה מחדש');
      setRerunning(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          <span className="text-sm text-gray-400">טוען ריצה...</span>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          <p>הריצה לא נמצאה</p>
          <button onClick={onBack} className="mt-3 text-sm text-teal-500 hover:underline">חזרה</button>
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[run.status] || STATUS_COLORS.completed;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowRight className="w-4 h-4 text-gray-600" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800">{run.contact_name || run.contact_phone || 'לא ידוע'}</h3>
                {run.contact_phone && (
                  <span className="text-xs text-gray-400 font-mono" dir="ltr">
                    {run.contact_phone.replace('@s.whatsapp.net', '').replace('@c.us', '')}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusColor.light} ${statusColor.text} border ${statusColor.border}`}>
                  {STATUS_LABELS[run.status] || run.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                <span>{formatTime(run.started_at)}</span>
                <span className="font-mono">{formatDuration(run.duration_ms)}</span>
                <span>{run.steps?.length || 0} צעדים</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('flow')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'flow' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
              >
                תצוגת פלו
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
              >
                ציר זמן
              </button>
            </div>

            <button
              onClick={handleRerun}
              disabled={rerunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {rerunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              הרץ מחדש
            </button>

            <button
              onClick={onNavigateToEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              עריכת בוט
            </button>
          </div>
        </div>

        {/* Error banner */}
        {run.error_message && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-600 font-mono">{run.error_message}</div>
          </div>
        )}

        {/* Trigger message */}
        {run.trigger_message && typeof run.trigger_message === 'string' && (
          <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2 flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600" dir="auto">
              <span className="font-medium">הודעת טריגר: </span>
              "{run.trigger_message.substring(0, 300)}"
            </div>
          </div>
        )}

        {/* Variables snapshot */}
        {run.variables_snapshot && Object.keys(run.variables_snapshot).length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] text-gray-400">משתנים בהתחלה:</span>
            {Object.entries(run.variables_snapshot).slice(0, 8).map(([key, value]) => (
              <span key={key} className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200 font-mono">
                {key}={typeof value === 'string' ? value.substring(0, 25) : String(value)}
              </span>
            ))}
            {Object.keys(run.variables_snapshot).length > 8 && (
              <span className="text-[10px] text-gray-400">+{Object.keys(run.variables_snapshot).length - 8}</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {selectedStep && (
          <StepDetailPanel step={selectedStep} onClose={() => setSelectedStepId(null)} />
        )}

        <div className="flex-1 overflow-hidden">
          {viewMode === 'flow' ? (
            <ReactFlowProvider>
              <ExecutionFlowView run={run} selectedStepId={selectedStepId} onStepSelect={setSelectedStepId} />
            </ReactFlowProvider>
          ) : (
            <TimelineView steps={run.steps || []} selectedStepId={selectedStepId} onStepSelect={setSelectedStepId} />
          )}
        </div>
      </div>
    </div>
  );
}
