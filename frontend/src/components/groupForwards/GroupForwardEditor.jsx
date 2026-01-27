import { useState, useEffect } from 'react';
import {
  ArrowRight, Save, Target, Zap, Clock, UserCheck, Settings, Search,
  X, Plus, Trash2, Check, AlertCircle, Loader2, RefreshCw,
  MessageSquare, Users, ChevronDown, ChevronUp, Phone, Image as ImageIcon,
  Crown, AlertTriangle
} from 'lucide-react';
// Using simple arrow buttons instead of drag-drop to avoid dependency issues
import Button from '../atoms/Button';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';

export default function GroupForwardEditor({ forward, onClose, onSave }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('targets');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Forward settings
  const [name, setName] = useState(forward.name || '');
  const [description, setDescription] = useState(forward.description || '');
  const [triggerType, setTriggerType] = useState(forward.trigger_type || 'direct');
  const [triggerGroupId, setTriggerGroupId] = useState(forward.trigger_group_id || '');
  const [triggerGroupName, setTriggerGroupName] = useState(forward.trigger_group_name || '');
  const [delayMin, setDelayMin] = useState(forward.delay_min || 3);
  const [delayMax, setDelayMax] = useState(forward.delay_max || 10);
  const [requireConfirmation, setRequireConfirmation] = useState(forward.require_confirmation !== false);
  
  // Targets
  const [targets, setTargets] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  
  // Target limit
  const [targetLimit, setTargetLimit] = useState(50); // Default
  const [showLimitModal, setShowLimitModal] = useState(false);
  
  // Authorized senders
  const [senders, setSenders] = useState([]);
  const [newSenderPhone, setNewSenderPhone] = useState('');
  const [newSenderName, setNewSenderName] = useState('');

  useEffect(() => {
    loadForwardDetails();
  }, [forward.id]);

  const loadForwardDetails = async () => {
    try {
      setLoading(true);
      
      // Load forward details and limit in parallel
      const [forwardRes, limitRes] = await Promise.all([
        api.get(`/group-forwards/${forward.id}`),
        api.get('/group-forwards/limit')
      ]);
      
      const f = forwardRes.data.forward;
      
      setName(f.name);
      setDescription(f.description || '');
      setTriggerType(f.trigger_type);
      setTriggerGroupId(f.trigger_group_id || '');
      setTriggerGroupName(f.trigger_group_name || '');
      setDelayMin(f.delay_min);
      setDelayMax(f.delay_max);
      setRequireConfirmation(f.require_confirmation !== false);
      setTargets(f.targets || []);
      setSenders(f.authorized_senders || []);
      
      // Set target limit (-1 means unlimited)
      const limit = limitRes.data.targetLimit;
      setTargetLimit(limit === -1 ? Infinity : (limit || 50));
    } catch (e) {
      console.error('Error loading forward:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableGroups = async () => {
    try {
      setLoadingGroups(true);
      const { data } = await api.get('/group-forwards/groups', {
        params: { search: groupSearch }
      });
      setAvailableGroups(data.groups || []);
    } catch (e) {
      console.error('Error loading groups:', e);
      if (e.response?.data?.code === 'NO_WHATSAPP_CONNECTION') {
        alert('אין חיבור וואטסאפ פעיל. אנא חבר את הוואטסאפ תחילה.');
      }
    } finally {
      setLoadingGroups(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      
      // Update forward settings
      const { data } = await api.put(`/group-forwards/${forward.id}`, {
        name,
        description,
        trigger_type: triggerType,
        trigger_group_id: triggerGroupId,
        trigger_group_name: triggerGroupName,
        delay_min: delayMin,
        delay_max: delayMax,
        require_confirmation: requireConfirmation
      });
      
      onSave?.(data.forward);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשמירה');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTargets = async () => {
    try {
      setSaving(true);
      await api.put(`/group-forwards/${forward.id}/targets`, {
        targets: targets.map((t, i) => ({
          group_id: t.group_id,
          group_name: t.group_name,
          group_image_url: t.group_image_url,
          sort_order: i
        }))
      });
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשמירת קבוצות יעד');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSenders = async () => {
    try {
      setSaving(true);
      await api.put(`/group-forwards/${forward.id}/senders`, {
        senders: senders.map(s => ({
          phone_number: s.phone_number,
          name: s.name
        }))
      });
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה בשמירת שולחים מורשים');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    const settingsOk = await saveSettings();
    const targetsOk = await saveTargets();
    const sendersOk = await saveSenders();
    
    if (settingsOk && targetsOk && sendersOk) {
      onClose();
    }
  };

  const toggleGroup = (group) => {
    const exists = targets.find(t => t.group_id === group.id);
    if (exists) {
      setTargets(targets.filter(t => t.group_id !== group.id));
    } else {
      // Check limit before adding
      if (targets.length >= targetLimit) {
        setShowLimitModal(true);
        return;
      }
      setTargets([...targets, {
        group_id: group.id,
        group_name: group.name,
        group_image_url: group.image_url,
        sort_order: targets.length
      }]);
    }
  };

  const selectAllGroups = () => {
    const filteredGroups = availableGroups.filter(g => 
      !groupSearch || g.name?.toLowerCase().includes(groupSearch.toLowerCase())
    );
    
    // Only select up to the limit
    const groupsToSelect = filteredGroups.slice(0, targetLimit);
    
    setTargets(groupsToSelect.map((g, i) => ({
      group_id: g.id,
      group_name: g.name,
      group_image_url: g.image_url,
      sort_order: i
    })));
    
    // Show modal if there are more groups than allowed
    if (filteredGroups.length > targetLimit) {
      setShowLimitModal(true);
    }
  };

  const moveTargetUp = (index) => {
    if (index === 0) return;
    const items = Array.from(targets);
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setTargets(items);
  };

  const moveTargetDown = (index) => {
    if (index === targets.length - 1) return;
    const items = Array.from(targets);
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setTargets(items);
  };

  // Normalize phone number to international format (972...)
  const normalizePhoneNumber = (phone) => {
    if (!phone) return '';
    
    // Remove all non-digits except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Remove leading +
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    
    // If starts with 0, replace with 972
    if (cleaned.startsWith('0')) {
      cleaned = '972' + cleaned.substring(1);
    }
    
    // If doesn't start with 972 and is 9-10 digits, assume it's Israeli without prefix
    if (!cleaned.startsWith('972') && cleaned.length >= 9 && cleaned.length <= 10) {
      cleaned = '972' + cleaned;
    }
    
    return cleaned;
  };

  const addSender = () => {
    const phone = newSenderPhone.trim();
    if (!phone) return;
    
    // Normalize the phone number
    const normalizedPhone = normalizePhoneNumber(phone);
    
    // Check if already exists
    if (senders.some(s => normalizePhoneNumber(s.phone_number) === normalizedPhone)) {
      alert('מספר זה כבר קיים ברשימה');
      return;
    }
    
    setSenders([...senders, {
      phone_number: normalizedPhone,
      name: newSenderName.trim() || null
    }]);
    setNewSenderPhone('');
    setNewSenderName('');
  };

  const removeSender = (phone) => {
    setSenders(senders.filter(s => s.phone_number !== phone));
  };

  // Format delay for display
  const formatDelay = (seconds) => {
    if (seconds < 60) return `${seconds} שניות`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes} דקות`;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')} דקות`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-gray-100 rounded-xl transition-all hover:scale-105"
              >
                <ArrowRight className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{name}</h1>
                  <p className="text-sm text-gray-500">עריכת הגדרות העברה</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleSaveAll} 
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור והחל
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-white/80 backdrop-blur p-1.5 rounded-2xl border border-gray-200/50 shadow-sm">
          {[
            { id: 'targets', icon: Target, label: 'קבוצות יעד', count: targets.length, color: 'purple' },
            { id: 'trigger', icon: Zap, label: 'טריגר', color: 'amber' },
            { id: 'senders', icon: UserCheck, label: 'מורשים', count: senders.length, color: 'green' },
            { id: 'settings', icon: Settings, label: 'הגדרות', color: 'blue' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-white hover:shadow-sm'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id 
                    ? 'bg-white/20 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-gray-200/50 shadow-lg overflow-hidden">
          {/* Targets Tab */}
          {activeTab === 'targets' && (
            <div className="p-8">
              {/* Header with gradient accent */}
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">קבוצות יעד</h2>
                    <p className="text-gray-500 mt-1">בחר את הקבוצות שאליהן תישלח ההודעה</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {targetLimit !== Infinity && (
                    <div className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${
                      targets.length >= targetLimit 
                        ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Users className="w-4 h-4" />
                      {targets.length}/{targetLimit}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowGroupSelector(true);
                      loadAvailableGroups();
                    }}
                    disabled={targets.length >= targetLimit}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף קבוצות
                  </button>
                </div>
              </div>
              
              {/* Limit Warning */}
              {targets.length >= targetLimit && targetLimit !== Infinity && (
                <div className="mb-6 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg">
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-amber-800">הגעת למגבלת הקבוצות ({targetLimit})</p>
                    <p className="text-sm text-amber-600">שדרג את התוכנית כדי להוסיף קבוצות נוספות</p>
                  </div>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    <Crown className="w-4 h-4" />
                    שדרג
                  </button>
                </div>
              )}

              {targets.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-gradient-to-br from-gray-50 to-purple-50/30">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl flex items-center justify-center">
                    <Target className="w-10 h-10 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">לא נבחרו קבוצות עדיין</h3>
                  <p className="text-gray-500 mb-6">לחץ על "הוסף קבוצות" כדי לבחור קבוצות יעד להעברה</p>
                  <button
                    onClick={() => {
                      setShowGroupSelector(true);
                      loadAvailableGroups();
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
                  >
                    <Plus className="w-5 h-5" />
                    בחר קבוצות
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {targets.map((target, index) => (
                    <div
                      key={target.group_id}
                      className="group flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 hover:border-purple-200 hover:shadow-md transition-all"
                    >
                      {/* Move up/down buttons */}
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveTargetUp(index)}
                          disabled={index === 0}
                          className="p-1 hover:bg-purple-100 rounded-lg text-gray-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveTargetDown(index)}
                          disabled={index === targets.length - 1}
                          className="p-1 hover:bg-purple-100 rounded-lg text-gray-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow">
                        {index + 1}
                      </div>
                      {target.group_image_url ? (
                        <img src={target.group_image_url} alt="" className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border-2 border-white shadow">
                          <Users className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-gray-900 truncate block">
                          {target.group_name}
                        </span>
                        <span className="text-xs text-gray-400">קבוצה #{index + 1} בסדר השליחה</span>
                      </div>
                      <button
                        onClick={() => setTargets(targets.filter(t => t.group_id !== target.group_id))}
                        className="p-2 hover:bg-red-100 rounded-xl text-gray-400 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100 flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <ChevronUp className="w-4 h-4 text-purple-500" />
                </div>
                <p className="text-sm text-purple-700">
                  העבר את העכבר על קבוצה והשתמש בחצים כדי לשנות את סדר השליחה
                </p>
              </div>
            </div>
          )}

          {/* Trigger Tab */}
          {activeTab === 'trigger' && (
            <div className="p-8 space-y-8">
              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">סוג הטריגר</h2>
                  <p className="text-gray-500 mt-1">בחר כיצד תופעל ההעברה</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-5">
                <button
                  onClick={() => setTriggerType('direct')}
                  className={`group p-6 rounded-2xl border-2 text-right transition-all ${
                    triggerType === 'direct'
                      ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg'
                      : 'border-gray-200 hover:border-purple-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                    triggerType === 'direct' 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-purple-100'
                  }`}>
                    <MessageSquare className={`w-7 h-7 ${triggerType === 'direct' ? 'text-white' : 'text-gray-400 group-hover:text-purple-500'}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">הודעה ישירה לבוט</h3>
                  <p className="text-sm text-gray-500">
                    שלח הודעה ישירות למספר הוואטסאפ שלך והיא תועבר לכל הקבוצות
                  </p>
                  {triggerType === 'direct' && (
                    <div className="mt-4 flex items-center gap-2 text-purple-600 text-sm font-medium">
                      <Check className="w-4 h-4" />
                      נבחר
                    </div>
                  )}
                </button>
                
                <button
                  onClick={() => setTriggerType('group')}
                  className={`group p-6 rounded-2xl border-2 text-right transition-all ${
                    triggerType === 'group'
                      ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg'
                      : 'border-gray-200 hover:border-purple-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                    triggerType === 'group' 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-purple-100'
                  }`}>
                    <Users className={`w-7 h-7 ${triggerType === 'group' ? 'text-white' : 'text-gray-400 group-hover:text-purple-500'}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">האזנה לקבוצה</h3>
                  <p className="text-sm text-gray-500">
                    הודעות שנשלחות לקבוצה מסוימת יועברו לכל הקבוצות הנבחרות
                  </p>
                  {triggerType === 'group' && (
                    <div className="mt-4 flex items-center gap-2 text-purple-600 text-sm font-medium">
                      <Check className="w-4 h-4" />
                      נבחר
                    </div>
                  )}
                </button>
              </div>

              {triggerType === 'group' && (
                <div className="p-5 bg-gradient-to-r from-gray-50 to-white rounded-2xl border border-gray-200">
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    קבוצת מקור
                  </label>
                  <div className="relative">
                    <select
                      value={triggerGroupId}
                      onChange={(e) => {
                        const group = availableGroups.find(g => g.id === e.target.value);
                        setTriggerGroupId(e.target.value);
                        setTriggerGroupName(group?.name || '');
                      }}
                      onFocus={loadAvailableGroups}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 appearance-none bg-white text-lg"
                    >
                      <option value="">בחר קבוצה...</option>
                      {availableGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                  {triggerGroupName && (
                    <div className="mt-3 p-3 bg-green-50 rounded-xl flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-green-700 font-medium">נבחרה קבוצה: {triggerGroupName}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-blue-900 mb-1">איך זה עובד?</h4>
                    <p className="text-sm text-blue-700 leading-relaxed">
                      {triggerType === 'direct' 
                        ? 'שלח הודעה (טקסט, תמונה, סרטון או הקלטה) ישירות לבוט והיא תועבר לכל הקבוצות שנבחרו. תקבל בקשת אישור לפני השליחה.'
                        : 'כל הודעה שתישלח לקבוצת המקור על ידי שולח מורשה, תועבר אוטומטית לכל הקבוצות שנבחרו.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Authorized Senders Tab */}
          {activeTab === 'senders' && (
            <div className="p-8">
              {/* Header */}
              <div className="flex items-start gap-4 mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <UserCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">שולחים מורשים</h2>
                  <p className="text-gray-500 mt-1">רק הודעות ממספרים אלו יופעלו להעברה. השאר ריק לאפשר לכולם.</p>
                </div>
              </div>

              {/* Add Sender Form */}
              <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-100 mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-3">הוסף שולח מורשה</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="tel"
                      value={newSenderPhone}
                      onChange={(e) => setNewSenderPhone(e.target.value)}
                      placeholder="050-0000000"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                      dir="ltr"
                      onKeyDown={(e) => e.key === 'Enter' && addSender()}
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newSenderName}
                      onChange={(e) => setNewSenderName(e.target.value)}
                      placeholder="שם (אופציונלי)"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                      onKeyDown={(e) => e.key === 'Enter' && addSender()}
                    />
                  </div>
                  <button 
                    onClick={addSender} 
                    disabled={!newSenderPhone.trim()}
                    className="px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    הוסף
                  </button>
                </div>
              </div>

              {senders.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-gradient-to-br from-gray-50 to-green-50/30">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-3xl flex items-center justify-center">
                    <UserCheck className="w-10 h-10 text-green-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">לא הוגדרו שולחים מורשים</h3>
                  <p className="text-gray-500">כל הודעה שתתקבל תופעל (אם הרשימה ריקה)</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {senders.map((sender, index) => {
                    // Format phone for display
                    const formatPhoneDisplay = (phone) => {
                      if (!phone) return phone;
                      // Remove 972 prefix for display
                      let display = phone;
                      if (display.startsWith('972')) {
                        display = '0' + display.substring(3);
                      }
                      // Add dashes for readability (050-000-0000)
                      if (display.length === 10 && display.startsWith('0')) {
                        return `${display.slice(0, 3)}-${display.slice(3, 6)}-${display.slice(6)}`;
                      }
                      return display;
                    };
                    
                    return (
                      <div key={sender.phone_number} className="group flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-md transition-all">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow">
                          <Phone className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-lg" dir="ltr">{formatPhoneDisplay(sender.phone_number)}</p>
                          {sender.name && <p className="text-sm text-gray-500">{sender.name}</p>}
                        </div>
                        <button
                          onClick={() => removeSender(sender.phone_number)}
                          className="p-2 hover:bg-red-100 rounded-xl text-gray-400 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-green-900 mb-1">תומך בכל פורמט</h4>
                    <p className="text-sm text-green-700 leading-relaxed">
                      ניתן להזין מספר טלפון בכל פורמט והמערכת תזהה אותו:
                      <br />
                      <span className="font-mono text-xs bg-white/50 px-2 py-0.5 rounded mt-1 inline-block">050-0000000 • 0500000000 • 972500000000 • +972-50-000-0000</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-8 space-y-8">
              {/* Header */}
              <div className="flex items-start gap-4 mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">הגדרות העברה</h2>
                  <p className="text-gray-500 mt-1">התאם את פרטי ההעברה והתנהגותה</p>
                </div>
              </div>

              {/* Basic Info */}
              <div className="p-5 bg-gradient-to-r from-gray-50 to-white rounded-2xl border border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Settings className="w-3 h-3 text-blue-600" />
                  </div>
                  פרטים בסיסיים
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">שם ההעברה</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">תיאור</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Delay Settings */}
              <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-100">
                <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <div className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-3 h-3 text-amber-600" />
                  </div>
                  השהייה בין הודעות
                </h3>
                <p className="text-sm text-gray-500 mb-4">הגדר את הזמן בין שליחת הודעה לקבוצה אחת לבאה</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">מינימום (שניות)</label>
                    <input
                      type="number"
                      value={delayMin}
                      onChange={(e) => {
                        const val = Math.max(3, parseInt(e.target.value) || 3);
                        setDelayMin(val);
                        if (delayMax < val) setDelayMax(val);
                      }}
                      min={3}
                      max={3600}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">מקסימום (שניות)</label>
                    <input
                      type="number"
                      value={delayMax}
                      onChange={(e) => setDelayMax(Math.max(delayMin, parseInt(e.target.value) || delayMin))}
                      min={delayMin}
                      max={3600}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    />
                  </div>
                </div>
                
                <p className="mt-3 text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded-lg">
                  ⏱️ ההשהייה תהיה משתנה בין {formatDelay(delayMin)} ל-{formatDelay(delayMax)} עם וריאציה של ±10%
                </p>
              </div>

              {/* Quick Delay Presets */}
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => { setDelayMin(3); setDelayMax(5); }}
                  className={`group p-4 text-center rounded-2xl border-2 transition-all hover:shadow-md ${
                    delayMin === 3 && delayMax === 5 
                      ? 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50' 
                      : 'border-gray-200 hover:border-green-200'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center transition-all ${
                    delayMin === 3 && delayMax === 5 
                      ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-green-100'
                  }`}>
                    <Zap className={`w-6 h-6 ${delayMin === 3 && delayMax === 5 ? 'text-white' : 'text-gray-400 group-hover:text-green-500'}`} />
                  </div>
                  <span className="font-bold text-gray-800">מהיר</span>
                  <span className="block text-xs text-gray-500 mt-1">3-5 שניות</span>
                </button>
                
                <button
                  onClick={() => { setDelayMin(30); setDelayMax(60); }}
                  className={`group p-4 text-center rounded-2xl border-2 transition-all hover:shadow-md ${
                    delayMin === 30 && delayMax === 60 
                      ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50' 
                      : 'border-gray-200 hover:border-blue-200'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center transition-all ${
                    delayMin === 30 && delayMax === 60 
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-blue-100'
                  }`}>
                    <Clock className={`w-6 h-6 ${delayMin === 30 && delayMax === 60 ? 'text-white' : 'text-gray-400 group-hover:text-blue-500'}`} />
                  </div>
                  <span className="font-bold text-gray-800">מתון</span>
                  <span className="block text-xs text-gray-500 mt-1">30-60 שניות</span>
                </button>
                
                <button
                  onClick={() => { setDelayMin(300); setDelayMax(600); }}
                  className={`group p-4 text-center rounded-2xl border-2 transition-all hover:shadow-md ${
                    delayMin === 300 && delayMax === 600 
                      ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50' 
                      : 'border-gray-200 hover:border-purple-200'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center transition-all ${
                    delayMin === 300 && delayMax === 600 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-purple-100'
                  }`}>
                    <Clock className={`w-6 h-6 ${delayMin === 300 && delayMax === 600 ? 'text-white' : 'text-gray-400 group-hover:text-purple-500'}`} />
                  </div>
                  <span className="font-bold text-gray-800">איטי</span>
                  <span className="block text-xs text-gray-500 mt-1">5-10 דקות</span>
                </button>
              </div>

              {/* Confirmation Toggle */}
              <label 
                onClick={() => setRequireConfirmation(!requireConfirmation)}
                className={`flex items-center justify-between p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  requireConfirmation 
                    ? 'border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50' 
                    : 'border-gray-200 hover:border-purple-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    requireConfirmation 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg' 
                      : 'bg-gray-100'
                  }`}>
                    <Check className={`w-6 h-6 ${requireConfirmation ? 'text-white' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">בקש אישור לפני שליחה</p>
                    <p className="text-sm text-gray-500">תקבל הודעה לאישור עם כפתורי שליחה/ביטול</p>
                  </div>
                </div>
                <div className={`w-14 h-8 rounded-full relative transition-colors ${requireConfirmation ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all ${requireConfirmation ? 'left-7' : 'left-1'}`} />
                </div>
              </label>
            </div>
          )}
        </div>
      </main>

      {/* Group Selector Modal */}
      {showGroupSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">בחירת קבוצות</h3>
                <button onClick={() => setShowGroupSelector(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="חיפוש קבוצות..."
                  className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
                <button
                  onClick={loadAvailableGroups}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingGroups ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="flex justify-between items-center mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {targets.length} קבוצות נבחרו
                  </span>
                  {targets.length >= targetLimit && targetLimit !== Infinity && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      מקסימום
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {targets.length > 0 && (
                    <button
                      onClick={() => setTargets([])}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      נקה הכל
                    </button>
                  )}
                  <button
                    onClick={selectAllGroups}
                    className="text-sm text-purple-600 hover:text-purple-700"
                  >
                    בחר הכל {targetLimit !== Infinity && `(עד ${targetLimit})`}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {loadingGroups ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                </div>
              ) : availableGroups.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">לא נמצאו קבוצות</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {availableGroups
                    .filter(g => !groupSearch || g.name?.toLowerCase().includes(groupSearch.toLowerCase()))
                    .map(group => {
                      const isSelected = targets.some(t => t.group_id === group.id);
                      return (
                        <button
                          key={group.id}
                          onClick={() => toggleGroup(group)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all ${
                            isSelected
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-4 h-4 text-white" />}
                          </div>
                          {group.image_url ? (
                            <img src={group.image_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <Users className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{group.name}</p>
                            {group.participants_count > 0 && (
                              <p className="text-xs text-gray-500">{group.participants_count} משתתפים</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100">
              <Button onClick={() => setShowGroupSelector(false)} className="w-full">
                סיום ({targets.length} נבחרו)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Limit Exceeded Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowLimitModal(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-lg">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">הגעת למגבלת הקבוצות</h2>
                  <p className="text-sm text-gray-500">
                    {targets.length} מתוך {targetLimit === Infinity ? '∞' : targetLimit} קבוצות
                  </p>
                </div>
              </div>
              <button onClick={() => setShowLimitModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Illustration */}
            <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl mb-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <p className="text-amber-800 font-medium mb-2">
                  התוכנית שלך מאפשרת עד {targetLimit} קבוצות יעד להעברה
                </p>
                <p className="text-amber-600 text-sm">
                  שדרג את החבילה שלך כדי להוסיף יותר קבוצות יעד
                </p>
              </div>
            </div>
            
            {/* Benefits */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-green-800 text-sm font-medium">יותר קבוצות יעד להעברה</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-blue-800 text-sm font-medium">יותר העברות פעילות</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="text-purple-800 text-sm font-medium">שליחה מהירה ללא הגבלות</span>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={() => setShowLimitModal(false)} 
                className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all"
              >
                הבנתי
              </button>
              <button 
                onClick={() => {
                  setShowLimitModal(false);
                  navigate('/pricing');
                }}
                className="flex-1 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Crown className="w-5 h-5" />
                שדרג עכשיו
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
