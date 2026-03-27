import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowRight, RotateCcw, Check, X, FileText, User, Clock, CheckCircle, XCircle } from 'lucide-react';
import FlowBuilder from '../components/flow/FlowBuilder';
import NodePalette from '../components/flow/NodePalette';
import NodeEditor from '../components/flow/panels/NodeEditor';
import Button from '../components/atoms/Button';
import api from '../services/api';
import { toast } from '../store/toastStore';

export default function TemplateEditorPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [flowData, setFlowData] = useState(null);
  const [originalFlowData, setOriginalFlowData] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flowKey, setFlowKey] = useState(0);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const isInitialLoad = useRef(true);

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

  useEffect(() => {
    if (!flowData || !originalFlowData || isInitialLoad.current) return;
    const hasChanged = JSON.stringify(flowData) !== JSON.stringify(originalFlowData);
    setHasChanges(hasChanged);
  }, [flowData, originalFlowData]);

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

  const handleNodeSelect = useCallback((node) => {
    setSelectedNodeId(node?.id || null);
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
      toast.warning('לא ניתן למחוק את הטריגר הראשי');
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
      toast.error('שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    if (hasChanges) {
      if (!confirm('יש שינויים שלא נשמרו. האם לשמור ולאשר?')) return;
      await handleSave();
    }
    
    setIsApproving(true);
    try {
      await api.post(`/templates/admin/${templateId}/approve`);
      toast.success('התבנית אושרה ופורסמה בהצלחה!');
      navigate('/admin', { state: { tab: 'templates' } });
    } catch (error) {
      console.error('Failed to approve template:', error);
      toast.error(error.response?.data?.error || 'שגיאה באישור התבנית');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.warning('יש להזין סיבה לדחייה');
      return;
    }
    
    setIsRejecting(true);
    try {
      await api.post(`/templates/admin/${templateId}/reject`, { reason: rejectReason });
      toast.info('התבנית נדחתה והמשתמש קיבל הודעה');
      navigate('/admin', { state: { tab: 'templates' } });
    } catch (error) {
      console.error('Failed to reject template:', error);
      toast.error(error.response?.data?.error || 'שגיאה בדחיית התבנית');
    } finally {
      setIsRejecting(false);
      setShowRejectModal(false);
    }
  };

  const handleDiscard = () => {
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
  const isPending = template?.status === 'pending';

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
      <header className="bg-white border-b border-gray-200 px-4 py-3 z-40">
        <div className="flex items-center justify-between">
          {/* Left side - Back button and template info */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
              <span>חזרה</span>
            </button>
            
            <div className="w-px h-8 bg-gray-200" />
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-gray-900">
                    {template?.name_he || template?.name}
                  </h1>
                  {isPending && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      ממתין לאישור
                    </span>
                  )}
                  {template?.status === 'approved' && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                      מאושר
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {template?.creator_name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {template.creator_name}
                    </span>
                  )}
                  {template?.creator_email && (
                    <span>{template.creator_email}</span>
                  )}
                  {template?.category && (
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded">{template.category}</span>
                  )}
                </div>
              </div>
            </div>
            
            {hasChanges && (
              <div className="flex items-center gap-2 mr-4">
                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-full border border-orange-200">
                  שינויים לא נשמרו
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
          
          {/* Right side - Action buttons */}
          <div className="flex items-center gap-2">
            {showSaved && (
              <span className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg border border-green-200 flex items-center gap-1">
                <Check className="w-3 h-3" />
                נשמר!
              </span>
            )}
            
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flex items-center gap-2 h-10 px-4 bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'שומר...' : 'שמור'}</span>
            </button>
            
            {/* Reject button - only for pending */}
            {isPending && (
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex items-center gap-2 h-10 px-4 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-xl font-medium transition-all"
              >
                <XCircle className="w-4 h-4" />
                <span>דחה</span>
              </button>
            )}
            
            {/* Approve button - only for pending */}
            {isPending && (
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="flex items-center gap-2 h-10 px-5 bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 disabled:opacity-50 rounded-xl font-medium shadow-md hover:shadow-lg transition-all"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isApproving ? 'מאשר...' : 'אשר ופרסם'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Right Panel - Editor or Palette */}
        <div className="w-96 flex-shrink-0 order-first h-full">
          {selectedNode ? (
            <NodeEditor
              node={selectedNode}
              onUpdate={handleUpdateNode}
              onClose={() => setSelectedNodeId(null)}
              onDelete={handleDeleteNode}
              isNodeConnected={(nodeId) => {
                if (!flowData?.edges) return true;
                return flowData.edges.some(e => e.source === nodeId || e.target === nodeId);
              }}
            />
          ) : (
            <div className="h-full p-3 bg-white border-r border-gray-200 overflow-y-auto">
              <NodePalette />
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 m-4">
          <div className="h-full bg-white/50 backdrop-blur rounded-2xl border border-gray-200 shadow-inner overflow-hidden">
            {flowData && (
              <FlowBuilder
                key={flowKey}
                initialData={flowData}
                onChange={handleFlowChange}
                onNodeSelect={handleNodeSelect}
              />
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg text-gray-900">דחיית תבנית</h2>
              <button 
                onClick={() => setShowRejectModal(false)} 
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                המשתמש יקבל הודעה עם סיבת הדחייה. מה הסיבה לדחיית התבנית?
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="הזן את סיבת הדחייה..."
                className="w-full h-32 p-3 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 rounded-lg font-medium"
              >
                {isRejecting ? 'דוחה...' : 'דחה תבנית'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
