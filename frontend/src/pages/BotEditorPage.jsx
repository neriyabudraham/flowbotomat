import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowRight, Edit2 } from 'lucide-react';
import useBotsStore from '../store/botsStore';
import FlowBuilder from '../components/flow/FlowBuilder';
import NodePalette from '../components/flow/NodePalette';
import NodeEditor from '../components/flow/panels/NodeEditor';
import Button from '../components/atoms/Button';

export default function BotEditorPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const { currentBot, fetchBot, saveFlow, updateBot, clearCurrentBot } = useBotsStore();
  const [flowData, setFlowData] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [botName, setBotName] = useState('');
  const [flowKey, setFlowKey] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    fetchBot(botId).then((bot) => {
      setBotName(bot.name);
      const initialData = bot.flow_data && bot.flow_data.nodes?.length > 0 
        ? bot.flow_data 
        : {
            nodes: [{
              id: 'trigger_start',
              type: 'trigger',
              position: { x: 100, y: 200 },
              data: { triggers: [{ type: 'any_message', value: '' }] },
            }],
            edges: [],
          };
      setFlowData(initialData);
    });
    
    return () => clearCurrentBot();
  }, [botId]);

  // Get selected node from flowData
  const selectedNode = flowData?.nodes?.find(n => n.id === selectedNodeId) || null;

  // When editor updates node data
  const handleNodeUpdate = useCallback((nodeId, newData) => {
    setFlowData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map(n => 
          n.id === nodeId 
            ? { ...n, data: { ...n.data, ...newData } }
            : n
        ),
      };
    });
    setHasChanges(true);
    setFlowKey(k => k + 1); // Force FlowBuilder to update
  }, []);

  // When FlowBuilder changes
  const handleFlowChange = useCallback((newData) => {
    setFlowData(newData);
    setHasChanges(true);
  }, []);

  // When node is selected
  const handleNodeSelect = useCallback((node) => {
    setSelectedNodeId(node?.id || null);
  }, []);

  // Delete node
  const handleNodeDelete = useCallback((nodeId) => {
    setFlowData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== nodeId),
        edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      };
    });
    
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    setHasChanges(true);
    setFlowKey(k => k + 1);
  }, [selectedNodeId]);

  // Delete edge
  const handleEdgeDelete = useCallback((edgeId) => {
    setFlowData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        edges: prev.edges.filter(e => e.id !== edgeId),
      };
    });
    setHasChanges(true);
  }, []);

  // Add node from palette
  const handleAddNode = useCallback((type) => {
    if (!flowData) return;
    
    const newNodeId = `${type}_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type,
      position: { 
        x: 300 + Math.random() * 100, 
        y: 150 + (flowData.nodes?.length || 0) * 120 
      },
      data: getDefaultData(type),
    };
    
    setFlowData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setHasChanges(true);
    setSelectedNodeId(newNodeId);
    setFlowKey(k => k + 1);
  }, [flowData]);

  // Save
  const handleSave = async () => {
    if (!flowData) return;
    setIsSaving(true);
    try {
      await saveFlow(botId, flowData);
      setHasChanges(false);
    } catch (err) {
      console.error(err);
    }
    setIsSaving(false);
  };

  // Toggle active
  const handleToggle = async () => {
    await updateBot(botId, { is_active: !currentBot?.is_active });
  };

  // Save name
  const handleNameSave = async () => {
    if (botName.trim() && botName !== currentBot?.name) {
      await updateBot(botId, { name: botName.trim() });
    }
    setIsEditingName(false);
  };

  if (!currentBot || !flowData) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-500">טוען בוט...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur border-b border-gray-200 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/bots')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowRight className="w-5 h-5 text-gray-600" />
            </button>
            
            {isEditingName ? (
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-200 outline-none"
                autoFocus
              />
            ) : (
              <button 
                onClick={() => setIsEditingName(true)}
                className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors"
              >
                <h1 className="font-semibold text-lg text-gray-800">{currentBot.name}</h1>
                <Edit2 className="w-4 h-4 text-gray-400" />
              </button>
            )}
            
            {hasChanges && (
              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-full">
                שינויים לא נשמרו
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                currentBot.is_active
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {currentBot.is_active ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  פעיל
                </>
              ) : (
                'לא פעיל'
              )}
            </button>
            
            <Button 
              onClick={handleSave} 
              disabled={isSaving || !hasChanges}
              className="!rounded-xl"
            >
              <Save className="w-4 h-4 ml-2" />
              {isSaving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette - Right */}
        <div className="w-56 p-4 flex-shrink-0 overflow-y-auto order-last">
          <NodePalette onAddNode={handleAddNode} />
        </div>

        {/* Flow Canvas - Center */}
        <div className="flex-1 m-4">
          <div className="h-full bg-white/50 backdrop-blur rounded-2xl border border-gray-200 shadow-inner overflow-hidden">
            <FlowBuilder 
              key={`${botId}-${flowKey}`}
              initialData={flowData} 
              onChange={handleFlowChange}
              onNodeSelect={handleNodeSelect}
              onEdgeDelete={handleEdgeDelete}
            />
          </div>
        </div>

        {/* Node Editor - Left */}
        {selectedNode && (
          <div className="flex-shrink-0 order-first">
            <NodeEditor
              node={selectedNode}
              onUpdate={handleNodeUpdate}
              onClose={() => setSelectedNodeId(null)}
              onDelete={handleNodeDelete}
            />
          </div>
        )}
      </div>
    </div>
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
