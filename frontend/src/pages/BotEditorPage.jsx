import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowRight, Edit2, RotateCcw, Play, X } from 'lucide-react';
import useBotsStore from '../store/botsStore';
import FlowBuilder from '../components/flow/FlowBuilder';
import NodePalette from '../components/flow/NodePalette';
import NodeEditor from '../components/flow/panels/NodeEditor';
import FlowPreview from '../components/flow/panels/FlowPreview';
import Button from '../components/atoms/Button';

const STORAGE_KEY = 'flowbotomat_draft_';

export default function BotEditorPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const { currentBot, fetchBot, saveFlow, updateBot, clearCurrentBot } = useBotsStore();
  const [flowData, setFlowData] = useState(null);
  const [originalFlowData, setOriginalFlowData] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [botName, setBotName] = useState('');
  const [flowKey, setFlowKey] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const isInitialLoad = useRef(true);

  // Load bot and check for draft
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    fetchBot(botId).then((bot) => {
      setBotName(bot.name);
      
      const defaultData = {
        nodes: [{
          id: 'trigger_start',
          type: 'trigger',
          position: { x: 100, y: 200 },
          data: { triggers: [{ type: 'any_message', value: '' }] },
        }],
        edges: [],
      };
      
      const savedData = bot.flow_data?.nodes?.length > 0 ? bot.flow_data : defaultData;
      setOriginalFlowData(JSON.parse(JSON.stringify(savedData)));
      
      // Check for unsaved draft
      const draftKey = STORAGE_KEY + botId;
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        try {
          const draftData = JSON.parse(draft);
          setFlowData(draftData);
          setHasDraft(true);
          setHasChanges(true);
        } catch (e) {
          setFlowData(savedData);
        }
      } else {
        setFlowData(savedData);
      }
      
      isInitialLoad.current = false;
    });
    
    return () => clearCurrentBot();
  }, [botId]);

  // Save draft to localStorage on changes
  useEffect(() => {
    if (!flowData || isInitialLoad.current) return;
    
    const draftKey = STORAGE_KEY + botId;
    localStorage.setItem(draftKey, JSON.stringify(flowData));
  }, [flowData, botId]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  // Get selected node
  const selectedNode = flowData?.nodes?.find(n => n.id === selectedNodeId) || null;

  // Check if flow actually changed
  const checkForChanges = useCallback((newData) => {
    if (!originalFlowData) return false;
    return JSON.stringify(newData) !== JSON.stringify(originalFlowData);
  }, [originalFlowData]);

  // Node update handler
  const handleNodeUpdate = useCallback((nodeId, newData) => {
    setFlowData(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n),
      };
      setHasChanges(checkForChanges(updated));
      return updated;
    });
    setFlowKey(k => k + 1);
  }, [checkForChanges]);

  // Flow change handler
  const handleFlowChange = useCallback((newData) => {
    setFlowData(newData);
    if (!isInitialLoad.current) {
      setHasChanges(checkForChanges(newData));
    }
  }, [checkForChanges]);

  // Node select
  const handleNodeSelect = useCallback((node) => {
    setSelectedNodeId(node?.id || null);
  }, []);

  // Node delete
  const handleNodeDelete = useCallback((nodeId) => {
    setFlowData(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== nodeId),
        edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      };
      setHasChanges(checkForChanges(updated));
      return updated;
    });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setFlowKey(k => k + 1);
  }, [selectedNodeId, checkForChanges]);

  // Edge delete
  const handleEdgeDelete = useCallback((edgeId) => {
    setFlowData(prev => {
      if (!prev) return prev;
      const updated = { ...prev, edges: prev.edges.filter(e => e.id !== edgeId) };
      setHasChanges(checkForChanges(updated));
      return updated;
    });
  }, [checkForChanges]);

  // Add node
  const handleAddNode = useCallback((type) => {
    if (!flowData) return;
    const newNodeId = `${type}_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type,
      position: { x: 300 + Math.random() * 100, y: 150 + (flowData.nodes?.length || 0) * 120 },
      data: getDefaultData(type),
    };
    setFlowData(prev => {
      const updated = { ...prev, nodes: [...prev.nodes, newNode] };
      setHasChanges(checkForChanges(updated));
      return updated;
    });
    setSelectedNodeId(newNodeId);
    setFlowKey(k => k + 1);
  }, [flowData, checkForChanges]);

  // Save
  const handleSave = async () => {
    if (!flowData) return;
    setIsSaving(true);
    try {
      await saveFlow(botId, flowData);
      setOriginalFlowData(JSON.parse(JSON.stringify(flowData)));
      setHasChanges(false);
      setHasDraft(false);
      localStorage.removeItem(STORAGE_KEY + botId);
    } catch (err) {
      console.error(err);
    }
    setIsSaving(false);
  };

  // Discard changes
  const handleDiscard = () => {
    if (!confirm('לבטל את כל השינויים ולחזור לגרסה השמורה?')) return;
    setFlowData(JSON.parse(JSON.stringify(originalFlowData)));
    setHasChanges(false);
    setHasDraft(false);
    localStorage.removeItem(STORAGE_KEY + botId);
    setFlowKey(k => k + 1);
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

  // Navigate back with warning
  const handleBack = () => {
    if (hasChanges && !confirm('יש שינויים שלא נשמרו. לצאת בכל זאת?')) return;
    navigate('/bots');
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
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
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
              <button onClick={() => setIsEditingName(true)} className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors">
                <h1 className="font-semibold text-lg text-gray-800">{currentBot.name}</h1>
                <Edit2 className="w-4 h-4 text-gray-400" />
              </button>
            )}
            
            {hasChanges && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-full">
                  {hasDraft ? '🔄 משוחזר מטיוטה' : 'שינויים לא נשמרו'}
                </span>
                <button
                  onClick={handleDiscard}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"
                  title="בטל שינויים"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-xl font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              תצוגה מקדימה
            </button>
            
            <button
              onClick={handleToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                currentBot.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {currentBot.is_active ? (
                <><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>פעיל</>
              ) : 'לא פעיל'}
            </button>
            
            <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="!rounded-xl">
              <Save className="w-4 h-4 ml-2" />
              {isSaving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 p-4 flex-shrink-0 overflow-y-auto order-last">
          <NodePalette onAddNode={handleAddNode} />
        </div>

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

      {/* Preview Modal */}
      {showPreview && (
        <FlowPreview flowData={flowData} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

function getDefaultData(type) {
  switch (type) {
    case 'trigger': return { triggers: [{ type: 'any_message', value: '' }] };
    case 'message': return { actions: [{ type: 'text', content: '' }], waitForReply: false };
    case 'condition': return { variable: 'message', operator: 'contains', value: '' };
    case 'delay': return { delay: 1, unit: 'seconds' };
    case 'action': return { actions: [{ type: 'add_tag', tagName: '' }] };
    case 'list': return { title: '', body: '', buttonText: 'בחר', buttons: [], waitForReply: true, timeout: null };
    default: return {};
  }
}
