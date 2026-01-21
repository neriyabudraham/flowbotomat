import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowRight, Play, Pause } from 'lucide-react';
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
  const [selectedNode, setSelectedNode] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    fetchBot(botId).then((bot) => {
      if (bot.flow_data && bot.flow_data.nodes?.length > 0) {
        setFlowData(bot.flow_data);
      } else {
        setFlowData({
          nodes: [{
            id: 'trigger_start',
            type: 'trigger',
            position: { x: 100, y: 200 },
            data: { triggers: [{ type: 'any_message', value: '' }] },
          }],
          edges: [],
        });
      }
    });
    
    return () => clearCurrentBot();
  }, [botId]);

  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleNodeUpdate = useCallback((nodeId, newData) => {
    setFlowData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => 
        n.id === nodeId 
          ? { ...n, data: { ...n.data, ...newData } }
          : n
      ),
    }));
    setSelectedNode(prev => prev?.id === nodeId 
      ? { ...prev, data: { ...prev.data, ...newData } }
      : prev
    );
    setHasChanges(true);
  }, []);

  const handleNodeDelete = useCallback((nodeId) => {
    setFlowData(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }));
    setSelectedNode(null);
    setHasChanges(true);
  }, []);

  const handleAddNode = useCallback((type) => {
    if (!flowData) return;
    
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position: { 
        x: 300 + Math.random() * 100, 
        y: 150 + (flowData.nodes?.length || 0) * 120 
      },
      data: getDefaultData(type),
    };
    
    setFlowData(prev => ({
      ...prev,
      nodes: [...(prev?.nodes || []), newNode],
    }));
    setHasChanges(true);
    setSelectedNode(newNode);
  }, [flowData]);

  const handleFlowChange = useCallback((newData) => {
    setFlowData(newData);
    setHasChanges(true);
  }, []);

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

  const handleToggle = async () => {
    await updateBot(botId, { is_active: !currentBot?.is_active });
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
            <div>
              <h1 className="font-semibold text-lg text-gray-800">{currentBot.name}</h1>
              {hasChanges && (
                <span className="text-xs text-orange-500">יש שינויים שלא נשמרו</span>
              )}
            </div>
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
                <>
                  <Pause className="w-4 h-4" />
                  לא פעיל
                </>
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
        {/* Node Palette - Right side */}
        <div className="w-56 p-4 flex-shrink-0 overflow-y-auto order-last">
          <NodePalette onAddNode={handleAddNode} />
        </div>

        {/* Flow Canvas - Center */}
        <div className="flex-1 m-4">
          <div className="h-full bg-white/50 backdrop-blur rounded-2xl border border-gray-200 shadow-inner overflow-hidden">
            <FlowBuilder 
              key={botId}
              initialData={flowData} 
              onChange={handleFlowChange}
              onNodeSelect={handleNodeSelect}
            />
          </div>
        </div>

        {/* Node Editor - Left side */}
        {selectedNode && (
          <div className="flex-shrink-0 order-first">
            <NodeEditor
              node={selectedNode}
              onUpdate={handleNodeUpdate}
              onClose={() => setSelectedNode(null)}
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
