import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowRight, RotateCcw, Eye, Check, X } from 'lucide-react';
import FlowBuilder from '../components/flow/FlowBuilder';
import NodePalette from '../components/flow/NodePalette';
import NodeEditor from '../components/flow/panels/NodeEditor';
import Button from '../components/atoms/Button';
import api from '../services/api';

export default function TemplateEditorPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [flowData, setFlowData] = useState(null);
  const [originalFlowData, setOriginalFlowData] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flowKey, setFlowKey] = useState(0);
  const isInitialLoad = useRef(true);

  // Load template
  useEffect(() => {
    loadTemplate();
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/templates/admin/${templateId}`);
      setTemplate(data.template);
      
      const defaultData = {
        nodes: [{
          id: 'trigger_start',
          type: 'trigger',
          position: { x: 100, y: 200 },
          data: { triggers: [{ type: 'any_message', value: '' }] },
        }],
        edges: [],
      };
      
      // Parse flow_data if it's a string
      let flowDataParsed = data.template.flow_data;
      if (typeof flowDataParsed === 'string') {
        try {
          flowDataParsed = JSON.parse(flowDataParsed);
        } catch (e) {
          console.error('Failed to parse flow_data:', e);
          flowDataParsed = null;
        }
      }
      
      const savedData = flowDataParsed?.nodes?.length > 0 ? flowDataParsed : defaultData;
      setOriginalFlowData(JSON.parse(JSON.stringify(savedData)));
      setFlowData(savedData);
      setHasChanges(false);
      
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 200);
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('שגיאה בטעינת התבנית');
    } finally {
      setLoading(false);
    }
  };

  // Track changes
  useEffect(() => {
    if (!flowData || !originalFlowData || isInitialLoad.current) return;
    
    const hasChanged = JSON.stringify(flowData) !== JSON.stringify(originalFlowData);
    setHasChanges(hasChanged);
  }, [flowData, originalFlowData]);

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

  const handleFlowChange = useCallback((data) => {
    if (isInitialLoad.current) return;
    setFlowData(data);
  }, []);

  const handleNodeSelect = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleUpdateNode = useCallback((nodeId, data) => {
    setFlowData(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));
  }, []);

  const handleDeleteNode = useCallback((nodeId) => {
    if (nodeId === 'trigger_start') {
      alert('לא ניתן למחוק את הטריגר הראשי');
      return;
    }
    
    setFlowData(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }));
    setSelectedNodeId(null);
  }, []);

  const handleSave = async () => {
    if (!flowData || isSaving) return;
    
    setIsSaving(true);
    try {
      await api.put(`/templates/admin/${templateId}`, {
        flow_data: flowData
      });
      
      setOriginalFlowData(JSON.parse(JSON.stringify(flowData)));
      setHasChanges(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('האם לבטל את כל השינויים?')) {
      setFlowData(JSON.parse(JSON.stringify(originalFlowData)));
      setHasChanges(false);
      setFlowKey(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (hasChanges && !confirm('יש שינויים שלא נשמרו. האם לצאת?')) {
      return;
    }
    navigate('/admin', { state: { tab: 'templates' } });
  };

  const selectedNode = flowData?.nodes?.find(n => n.id === selectedNodeId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">טוען תבנית...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => navigate('/admin')}>חזרה לניהול</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
          >
            <ArrowRight className="w-5 h-5" />
            <span>חזרה</span>
          </button>
          <div className="w-px h-6 bg-gray-200" />
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                עריכת תבנית
              </span>
              <h1 className="text-lg font-semibold">{template?.name_he || template?.name}</h1>
            </div>
            {template?.status === 'pending' && (
              <span className="text-xs text-amber-600 font-medium">ממתין לאישור</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>בטל שינויים</span>
            </button>
          )}
          
          <Button
            onClick={handleSave}
            loading={isSaving}
            disabled={!hasChanges}
            className="flex items-center gap-2"
          >
            {showSaved ? (
              <>
                <Check className="w-4 h-4" />
                נשמר!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                שמור שינויים
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Node Palette - Left */}
        <NodePalette />

        {/* Flow Builder - Center */}
        <div className="flex-1 relative">
          {flowData && (
            <FlowBuilder
              key={flowKey}
              initialData={flowData}
              onChange={handleFlowChange}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </div>

        {/* Node Editor - Right */}
        {selectedNode && (
          <NodeEditor
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Change Indicator */}
      {hasChanges && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg shadow-lg flex items-center gap-2 text-sm z-50">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          יש שינויים שלא נשמרו
        </div>
      )}
    </div>
  );
}
