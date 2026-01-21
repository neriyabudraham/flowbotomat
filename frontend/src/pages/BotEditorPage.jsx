import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowRight, Play, Pause, Settings } from 'lucide-react';
import useBotsStore from '../store/botsStore';
import FlowBuilder from '../components/flow/FlowBuilder';
import NodePalette from '../components/flow/NodePalette';
import Button from '../components/atoms/Button';

let nodeId = 0;
const getId = () => `node_${nodeId++}`;

export default function BotEditorPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const { currentBot, fetchBot, saveFlow, updateBot, clearCurrentBot } = useBotsStore();
  const [flowData, setFlowData] = useState({ nodes: [], edges: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchBot(botId).then((bot) => {
      if (bot.flow_data) {
        setFlowData(bot.flow_data);
        nodeId = bot.flow_data.nodes?.length || 0;
      }
    });
    return () => clearCurrentBot();
  }, [botId]);

  const handleAddNode = useCallback((type) => {
    const newNode = {
      id: getId(),
      type,
      position: { x: 250, y: 100 + (flowData.nodes.length * 100) },
      data: getDefaultData(type),
    };
    setFlowData((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setHasChanges(true);
  }, [flowData.nodes.length]);

  const handleSave = async () => {
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

  const handleFlowChange = (newData) => {
    setFlowData(newData);
    setHasChanges(true);
  };

  if (!currentBot) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/bots')}>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <h1 className="font-semibold text-lg">{currentBot.name}</h1>
            {hasChanges && (
              <span className="text-xs text-orange-500">שינויים לא שמורים</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                currentBot.is_active
                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {currentBot.is_active ? (
                <>
                  <Pause className="w-4 h-4" />
                  פעיל
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  לא פעיל
                </>
              )}
            </button>
            
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              <Save className="w-4 h-4 ml-2" />
              {isSaving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <div className="w-48 p-4 flex-shrink-0">
          <NodePalette onAddNode={handleAddNode} />
        </div>

        {/* Flow Canvas */}
        <div className="flex-1">
          <FlowBuilder 
            initialData={flowData} 
            onSave={handleFlowChange}
          />
        </div>
      </div>
    </div>
  );
}

function getDefaultData(type) {
  switch (type) {
    case 'trigger':
      return { triggerType: 'any_message' };
    case 'message':
      return { content: '' };
    case 'condition':
      return { variable: '', operator: 'equals', value: '' };
    case 'delay':
      return { delay: 1, unit: 'seconds' };
    case 'action':
      return { actionType: 'add_tag', tagName: '' };
    default:
      return {};
  }
}
