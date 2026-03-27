import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowRight, User, Clock, CheckCircle2, XCircle, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, Phone, MessageSquare,
  Zap, GitBranch, Timer, List, FileText, Code, Webhook,
  Table2, Users, Send, Edit3, Pause, Copy
} from 'lucide-react';
import api from '../../services/api';

const STATUS_COLORS = {
  completed: { bg: 'bg-green-500', ring: 'ring-green-200', text: 'text-green-700', light: 'bg-green-50', border: 'border-green-200' },
  running: { bg: 'bg-blue-500', ring: 'ring-blue-200', text: 'text-blue-700', light: 'bg-blue-50', border: 'border-blue-200' },
  error: { bg: 'bg-red-500', ring: 'ring-red-200', text: 'text-red-700', light: 'bg-red-50', border: 'border-red-200' },
  waiting: { bg: 'bg-amber-500', ring: 'ring-amber-200', text: 'text-amber-700', light: 'bg-amber-50', border: 'border-amber-200' },
  skipped: { bg: 'bg-gray-400', ring: 'ring-gray-200', text: 'text-gray-600', light: 'bg-gray-50', border: 'border-gray-200' },
  timeout: { bg: 'bg-orange-500', ring: 'ring-orange-200', text: 'text-orange-700', light: 'bg-orange-50', border: 'border-orange-200' },
};

const NODE_ICONS = {
  trigger: Zap,
  message: MessageSquare,
  condition: GitBranch,
  delay: Timer,
  action: Zap,
  list: List,
  registration: FileText,
  formula: Code,
  integration: Webhook,
  google_sheets: Table2,
  google_contacts: Users,
  send_other: Send,
  note: FileText,
};

const NODE_COLORS = {
  trigger: '#a855f7',
  message: '#14b8a6',
  condition: '#f97316',
  delay: '#3b82f6',
  action: '#ec4899',
  list: '#06b6d4',
  registration: '#6366f1',
  formula: '#8b5cf6',
  integration: '#f97316',
  google_sheets: '#22c55e',
  google_contacts: '#3b82f6',
  send_other: '#14b8a6',
  note: '#eab308',
};

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Flow visualization node component for execution view
function ExecutionFlowNode({ data }) {
  const step = data.step;
  const statusColor = step ? STATUS_COLORS[step.status] || STATUS_COLORS.completed : null;
  const nodeColor = NODE_COLORS[data.nodeType] || '#6b7280';
  const Icon = NODE_ICONS[data.nodeType] || Zap;
  const isExecuted = !!step;
  const isSelected = data.isSelectedStep;

  return (
    <div
      className={`rounded-xl border-2 transition-all min-w-[180px] max-w-[260px] ${
        isSelected
          ? `border-blue-400 shadow-lg shadow-blue-200 ring-2 ring-blue-300`
          : isExecuted
          ? `${statusColor?.border || 'border-gray-200'} shadow-md`
          : 'border-gray-200 shadow-sm opacity-40'
      }`}
      style={{ background: 'white' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-[10px]"
        style={{ background: isExecuted ? nodeColor : '#9ca3af', opacity: isExecuted ? 1 : 0.5 }}
      >
        <Icon className="w-4 h-4 text-white" />
        <span className="text-xs font-bold text-white truncate">{data.label || data.nodeType}</span>
        {step && (
          <span className="mr-auto text-[10px] text-white/70 font-mono">#{step.step_order}</span>
        )}
      </div>

      {/* Body */}
      <div className="p-2.5 space-y-1.5">
        {step ? (
          <>
            {/* Status badge */}
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${statusColor?.light} ${statusColor?.text}`}>
                {step.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                {step.status === 'error' && <XCircle className="w-3 h-3" />}
                {step.status === 'waiting' && <Pause className="w-3 h-3" />}
                {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                {step.status === 'skipped' && <span className="w-3 h-3">-</span>}
                {{completed: 'הושלם', error: 'שגיאה', waiting: 'ממתין', running: 'רץ', skipped: 'דולג'}[step.status] || step.status}
              </span>
              <span className="text-[10px] text-gray-400">{formatDuration(step.duration_ms)}</span>
            </div>

            {/* Error message */}
            {step.error_message && (
              <div className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded-lg truncate">
                {step.error_message}
              </div>
            )}

            {/* Output summary */}
            {step.output_data && Object.keys(step.output_data).length > 0 && (
              <div className="text-[10px] text-gray-500 space-y-0.5">
                {step.output_data.result && (
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    <span>תוצאה: {step.output_data.result}</span>
                  </div>
                )}
                {step.output_data.actionsSent && (
                  <div>{step.output_data.actionsSent} פעולות נשלחו</div>
                )}
                {step.output_data.buttons && (
                  <div>{step.output_data.buttons.length} כפתורים</div>
                )}
                {step.output_data.delay && (
                  <div>השהייה: {step.output_data.delay}</div>
                )}
                {step.output_data.waitingForReply && (
                  <div className="text-amber-600">ממתין לתשובה...</div>
                )}
              </div>
            )}

            {/* Next handle indicator */}
            {step.next_handle && (
              <div className="text-[10px] text-gray-400 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                ענף: {step.next_handle === 'yes' ? 'כן' : step.next_handle === 'no' ? 'לא' : step.next_handle}
              </div>
            )}
          </>
        ) : (
          <div className="text-[10px] text-gray-400 text-center py-1">לא רץ</div>
        )}
      </div>
    </div>
  );
}

const executionNodeTypes = {
  executionNode: ExecutionFlowNode,
};

// Flow visualization of the execution
function ExecutionFlowView({ run, selectedStepId, onStepSelect }) {
  const flowSnapshot = run.flow_snapshot;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!flowSnapshot?.nodes) return;

    // Build step map by node_id
    const stepMap = {};
    (run.steps || []).forEach(step => {
      stepMap[step.node_id] = step;
    });

    // Create nodes from flow snapshot
    const flowNodes = flowSnapshot.nodes.map(node => {
      const step = stepMap[node.id];
      return {
        id: node.id,
        type: 'executionNode',
        position: node.position,
        data: {
          label: step?.node_label || node.type,
          nodeType: node.type,
          step,
          isSelectedStep: step?.id === selectedStepId,
        },
      };
    });

    // Create edges - highlight executed paths
    const executedNodeIds = new Set((run.steps || []).map(s => s.node_id));
    const flowEdges = (flowSnapshot.edges || []).map(edge => {
      const isExecuted = executedNodeIds.has(edge.source) && executedNodeIds.has(edge.target);
      const sourceStep = stepMap[edge.source];
      const isActiveEdge = isExecuted && (!sourceStep?.next_handle || sourceStep.next_handle === edge.sourceHandle || !edge.sourceHandle);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: isActiveEdge,
        style: {
          strokeWidth: isActiveEdge ? 3 : 1.5,
          stroke: isActiveEdge ? '#14b8a6' : '#d1d5db',
          opacity: isActiveEdge ? 1 : 0.4,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: isActiveEdge ? '#14b8a6' : '#d1d5db',
        },
        label: edge.label,
        labelStyle: { fill: isActiveEdge ? '#14b8a6' : '#9ca3af', fontSize: 11 },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowSnapshot, run.steps, selectedStepId]);

  const onNodeClick = useCallback((_, node) => {
    const step = node.data?.step;
    if (step) {
      onStepSelect?.(step.id === selectedStepId ? null : step.id);
    }
  }, [onStepSelect, selectedStepId]);

  if (!flowSnapshot?.nodes?.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          <p>לא נמצא snapshot של הפלו</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodeTypes={executionNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.3}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      panOnDrag
      panOnScroll
    >
      <Background color="#e5e7eb" gap={20} size={1.5} />
      <Controls
        position="bottom-left"
        showInteractive={false}
        className="!bg-white !rounded-xl !border !border-gray-200 !shadow-lg"
      />
      <MiniMap
        className="!bg-gray-50 !rounded-xl !border !border-gray-200 !shadow-lg"
        style={{ width: 140, height: 90 }}
        nodeColor={(n) => {
          const step = n.data?.step;
          if (!step) return '#d1d5db';
          if (step.status === 'error') return '#ef4444';
          if (step.status === 'waiting') return '#f59e0b';
          return NODE_COLORS[n.data?.nodeType] || '#6b7280';
        }}
        maskColor="rgba(99, 102, 241, 0.08)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

// Step detail panel
function StepDetailPanel({ step, onClose }) {
  const [expanded, setExpanded] = useState({ input: false, output: true });
  if (!step) return null;

  const statusColor = STATUS_COLORS[step.status] || STATUS_COLORS.completed;
  const Icon = NODE_ICONS[step.node_type] || Zap;

  return (
    <div className="bg-white border-r border-gray-200 w-80 overflow-y-auto flex-shrink-0">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NODE_COLORS[step.node_type] || '#6b7280' }}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-medium text-sm text-gray-800">{step.node_label || step.node_type}</div>
              <div className="text-[10px] text-gray-400 font-mono">צעד #{step.step_order}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <XCircle className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusColor.light} ${statusColor.text}`}>
            {{completed: 'הושלם', error: 'שגיאה', waiting: 'ממתין', running: 'רץ', skipped: 'דולג'}[step.status] || step.status}
          </span>
          <span className="text-xs text-gray-400">
            <Clock className="w-3 h-3 inline ml-1" />
            {formatDuration(step.duration_ms)}
          </span>
          {step.next_handle && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {step.next_handle === 'yes' ? 'כן' : step.next_handle === 'no' ? 'לא' : step.next_handle}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Timing */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
          <div className="text-xs font-medium text-gray-500 mb-1.5">תזמון</div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">התחלה:</span>
            <span className="text-gray-700 font-mono">{formatTime(step.started_at)}</span>
          </div>
          {step.completed_at && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">סיום:</span>
              <span className="text-gray-700 font-mono">{formatTime(step.completed_at)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">משך:</span>
            <span className="text-gray-700 font-mono font-bold">{formatDuration(step.duration_ms)}</span>
          </div>
        </div>

        {/* Error */}
        {step.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium text-red-700">שגיאה</span>
            </div>
            <div className="text-xs text-red-600 font-mono break-words whitespace-pre-wrap">
              {step.error_message}
            </div>
          </div>
        )}

        {/* Output Data */}
        {step.output_data && Object.keys(step.output_data).length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(e => ({ ...e, output: !e.output }))}
              className="flex items-center gap-2 w-full text-xs font-medium text-gray-500 mb-1.5"
            >
              {expanded.output ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              פלט
            </button>
            {expanded.output && (
              <div className="bg-gray-50 rounded-lg p-3">
                <pre className="text-[11px] text-gray-700 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-60 overflow-y-auto">
                  {JSON.stringify(step.output_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Input Data */}
        {step.input_data && Object.keys(step.input_data).length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(e => ({ ...e, input: !e.input }))}
              className="flex items-center gap-2 w-full text-xs font-medium text-gray-500 mb-1.5"
            >
              {expanded.input ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              קלט
            </button>
            {expanded.input && (
              <div className="bg-gray-50 rounded-lg p-3">
                <pre className="text-[11px] text-gray-700 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-60 overflow-y-auto">
                  {JSON.stringify(step.input_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Node ID */}
        <div className="text-[10px] text-gray-300 font-mono flex items-center gap-1">
          <Copy className="w-3 h-3" />
          {step.node_id}
        </div>
      </div>
    </div>
  );
}

export default function ExecutionRunDetail({ botId, runId, onBack, onNavigateToEditor }) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [viewMode, setViewMode] = useState('flow'); // 'flow' or 'timeline'

  useEffect(() => {
    async function fetchRun() {
      try {
        const { data } = await api.get(`/bots/${botId}/history/${runId}`);
        setRun(data.run);
      } catch (err) {
        console.error('Failed to load execution run:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRun();
  }, [botId, runId]);

  const selectedStep = useMemo(() => {
    if (!selectedStepId || !run?.steps) return null;
    return run.steps.find(s => s.id === selectedStepId);
  }, [selectedStepId, run]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          <p>הריצה לא נמצאה</p>
          <button onClick={onBack} className="mt-3 text-sm text-blue-500 hover:underline">חזרה</button>
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
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowRight className="w-4 h-4 text-gray-600" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800">
                  {run.contact_name || run.contact_phone || 'לא ידוע'}
                </h3>
                {run.contact_phone && (
                  <span className="text-xs text-gray-400 font-mono">
                    {run.contact_phone.replace('@s.whatsapp.net', '').replace('@c.us', '')}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusColor.light} ${statusColor.text}`}>
                  {{completed: 'הושלם', error: 'שגיאה', waiting: 'ממתין', running: 'רץ', timeout: 'פג תוקף'}[run.status] || run.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                <span>{formatTime(run.started_at)}</span>
                <span>{formatDuration(run.duration_ms)}</span>
                <span>{run.steps?.length || 0} צעדים</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('flow')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'flow' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                תצוגת פלו
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ציר זמן
              </button>
            </div>

            {/* Navigate to editor */}
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
          <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-medium text-red-700">שגיאה בריצה</div>
              <div className="text-xs text-red-600 font-mono mt-0.5">{run.error_message}</div>
            </div>
          </div>
        )}

        {/* Trigger message */}
        {run.trigger_message && typeof run.trigger_message === 'string' && (
          <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600">
              <span className="font-medium">הודעת טריגר: </span>
              "{run.trigger_message.substring(0, 200)}"
            </div>
          </div>
        )}

        {/* Variables snapshot */}
        {run.variables_snapshot && Object.keys(run.variables_snapshot).length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400">משתנים:</span>
            {Object.entries(run.variables_snapshot).slice(0, 6).map(([key, value]) => (
              <span key={key} className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-mono">
                {key}={typeof value === 'string' ? value.substring(0, 20) : String(value)}
              </span>
            ))}
            {Object.keys(run.variables_snapshot).length > 6 && (
              <span className="text-[10px] text-gray-400">+{Object.keys(run.variables_snapshot).length - 6}</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Step detail panel */}
        {selectedStep && (
          <StepDetailPanel
            step={selectedStep}
            onClose={() => setSelectedStepId(null)}
          />
        )}

        {/* Main view */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'flow' ? (
            <ReactFlowProvider>
              <ExecutionFlowView
                run={run}
                selectedStepId={selectedStepId}
                onStepSelect={setSelectedStepId}
              />
            </ReactFlowProvider>
          ) : (
            <TimelineView
              steps={run.steps || []}
              selectedStepId={selectedStepId}
              onStepSelect={setSelectedStepId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Timeline view of steps
function TimelineView({ steps, selectedStepId, onStepSelect }) {
  if (steps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Clock className="w-8 h-8 mx-auto mb-2" />
          <p>אין צעדים</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute right-[23px] top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-1">
          {steps.map((step, index) => {
            const statusColor = STATUS_COLORS[step.status] || STATUS_COLORS.completed;
            const Icon = NODE_ICONS[step.node_type] || Zap;
            const isSelected = step.id === selectedStepId;

            return (
              <button
                key={step.id}
                onClick={() => onStepSelect(isSelected ? null : step.id)}
                className={`w-full text-right relative flex items-start gap-3 pr-2 py-2.5 pl-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-blue-50 border border-blue-200 shadow-sm'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                {/* Timeline dot */}
                <div className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 ${statusColor.bg} ring-2 ${statusColor.ring} ring-offset-1`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{step.node_label || step.node_type}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${statusColor.light} ${statusColor.text}`}>
                        {{completed: 'הושלם', error: 'שגיאה', waiting: 'ממתין', running: 'רץ', skipped: 'דולג'}[step.status] || step.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{formatDuration(step.duration_ms)}</span>
                  </div>

                  {step.error_message && (
                    <div className="text-xs text-red-500 truncate">{step.error_message}</div>
                  )}

                  {step.output_data?.result && (
                    <div className="text-xs text-gray-500">
                      <GitBranch className="w-3 h-3 inline ml-1" />
                      {step.output_data.result}
                    </div>
                  )}

                  {step.next_handle && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      ענף: {step.next_handle === 'yes' ? 'כן' : step.next_handle === 'no' ? 'לא' : step.next_handle}
                    </div>
                  )}

                  <div className="text-[10px] text-gray-300 font-mono mt-0.5">{step.node_id}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
