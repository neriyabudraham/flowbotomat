import { useState, useEffect } from 'react';
import {
  ArrowRight, Save, Target, Zap, Clock, UserCheck, Settings, Search,
  X, Plus, Trash2, GripVertical, Check, AlertCircle, Loader2, RefreshCw,
  MessageSquare, Users, ChevronDown, ChevronUp, Phone, Image as ImageIcon
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import Button from '../atoms/Button';
import api from '../../services/api';

export default function GroupForwardEditor({ forward, onClose, onSave }) {
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
      const { data } = await api.get(`/group-forwards/${forward.id}`);
      const f = data.forward;
      
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
      setTargets([...targets, {
        group_id: group.id,
        group_name: group.name,
        group_image_url: group.image_url,
        sort_order: targets.length
      }]);
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(targets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setTargets(items);
  };

  const addSender = () => {
    if (!newSenderPhone.trim()) return;
    
    setSenders([...senders, {
      phone_number: newSenderPhone.trim(),
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowRight className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{name}</h1>
                <p className="text-sm text-gray-500">עריכת העברה</p>
              </div>
            </div>
            
            <Button onClick={handleSaveAll} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור והחל
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white p-1 rounded-xl border border-gray-200">
          {[
            { id: 'targets', icon: Target, label: `קבוצות יעד (${targets.length})` },
            { id: 'trigger', icon: Zap, label: 'טריגר' },
            { id: 'senders', icon: UserCheck, label: `מורשים (${senders.length})` },
            { id: 'settings', icon: Settings, label: 'הגדרות' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          {/* Targets Tab */}
          {activeTab === 'targets' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">קבוצות יעד</h2>
                  <p className="text-sm text-gray-500">בחר את הקבוצות שאליהן תישלח ההודעה</p>
                </div>
                <Button
                  onClick={() => {
                    setShowGroupSelector(true);
                    loadAvailableGroups();
                  }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  הוסף קבוצות
                </Button>
              </div>

              {targets.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">לא נבחרו קבוצות עדיין</p>
                  <p className="text-sm text-gray-400">לחץ על "הוסף קבוצות" לבחור קבוצות יעד</p>
                </div>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="targets">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {targets.map((target, index) => (
                          <Draggable key={target.group_id} draggableId={target.group_id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 ${
                                  snapshot.isDragging ? 'shadow-lg' : ''
                                }`}
                              >
                                <div {...provided.dragHandleProps} className="cursor-grab">
                                  <GripVertical className="w-5 h-5 text-gray-400" />
                                </div>
                                <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-medium">
                                  {index + 1}
                                </span>
                                {target.group_image_url ? (
                                  <img src={target.group_image_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <span className="flex-1 font-medium text-gray-900 truncate">
                                  {target.group_name}
                                </span>
                                <button
                                  onClick={() => setTargets(targets.filter(t => t.group_id !== target.group_id))}
                                  className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}

              <p className="mt-4 text-sm text-gray-500 flex items-center gap-1">
                <GripVertical className="w-4 h-4" />
                גרור כדי לשנות את סדר השליחה
              </p>
            </div>
          )}

          {/* Trigger Tab */}
          {activeTab === 'trigger' && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">סוג הטריגר</h2>
                <p className="text-sm text-gray-500 mb-4">בחר כיצד תופעל ההעברה</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setTriggerType('direct')}
                    className={`p-4 rounded-xl border-2 text-right transition-all ${
                      triggerType === 'direct'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <MessageSquare className={`w-6 h-6 mb-2 ${triggerType === 'direct' ? 'text-purple-600' : 'text-gray-400'}`} />
                    <h3 className="font-medium text-gray-900">הודעה ישירה לבוט</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      שלח הודעה ישירות למספר הוואטסאפ שלך והיא תועבר לכל הקבוצות
                    </p>
                  </button>
                  
                  <button
                    onClick={() => setTriggerType('group')}
                    className={`p-4 rounded-xl border-2 text-right transition-all ${
                      triggerType === 'group'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Users className={`w-6 h-6 mb-2 ${triggerType === 'group' ? 'text-purple-600' : 'text-gray-400'}`} />
                    <h3 className="font-medium text-gray-900">האזנה לקבוצה</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      הודעות שנשלחות לקבוצה מסוימת יועברו לכל הקבוצות הנבחרות
                    </p>
                  </button>
                </div>
              </div>

              {triggerType === 'group' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 appearance-none bg-white"
                    >
                      <option value="">בחר קבוצה...</option>
                      {availableGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                  {triggerGroupName && (
                    <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      נבחרה קבוצה: {triggerGroupName}
                    </p>
                  )}
                </div>
              )}

              <div className="p-4 bg-blue-50 rounded-xl">
                <h4 className="font-medium text-blue-900 mb-1">איך זה עובד?</h4>
                <p className="text-sm text-blue-700">
                  {triggerType === 'direct' 
                    ? 'שלח הודעה (טקסט, תמונה, סרטון או הקלטה) ישירות לבוט והיא תועבר לכל הקבוצות שנבחרו. תקבל בקשת אישור לפני השליחה.'
                    : 'כל הודעה שתישלח לקבוצת המקור על ידי שולח מורשה, תועבר אוטומטית לכל הקבוצות שנבחרו.'}
                </p>
              </div>
            </div>
          )}

          {/* Authorized Senders Tab */}
          {activeTab === 'senders' && (
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">שולחים מורשים</h2>
                <p className="text-sm text-gray-500">
                  רק הודעות ממספרים אלו יופעלו להעברה. השאר ריק לאפשר לכולם.
                </p>
              </div>

              {/* Add Sender Form */}
              <div className="flex gap-3 mb-6">
                <div className="flex-1">
                  <input
                    type="tel"
                    value={newSenderPhone}
                    onChange={(e) => setNewSenderPhone(e.target.value)}
                    placeholder="מספר טלפון (972...)"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                    dir="ltr"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={newSenderName}
                    onChange={(e) => setNewSenderName(e.target.value)}
                    placeholder="שם (אופציונלי)"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                </div>
                <Button onClick={addSender} disabled={!newSenderPhone.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {senders.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">לא הוגדרו שולחים מורשים</p>
                  <p className="text-sm text-gray-400">כל הודעה שתתקבל תופעל (אם הרשימה ריקה)</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {senders.map((sender, index) => (
                    <div key={sender.phone_number} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Phone className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900" dir="ltr">{sender.phone_number}</p>
                        {sender.name && <p className="text-sm text-gray-500">{sender.name}</p>}
                      </div>
                      <button
                        onClick={() => removeSender(sender.phone_number)}
                        className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 p-4 bg-yellow-50 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-900">שים לב</h4>
                    <p className="text-sm text-yellow-700">
                      הזן מספרי טלפון בפורמט בינלאומי (לדוגמה: 972501234567)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">פרטים בסיסיים</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      שם ההעברה
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      תיאור
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Delay Settings */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">השהייה בין הודעות</h2>
                <p className="text-sm text-gray-500 mb-4">
                  הגדר את הזמן בין שליחת הודעה לקבוצה אחת לבאה (השהייה משתנה)
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      מינימום (שניות)
                    </label>
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
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      מקסימום (שניות)
                    </label>
                    <input
                      type="number"
                      value={delayMax}
                      onChange={(e) => setDelayMax(Math.max(delayMin, parseInt(e.target.value) || delayMin))}
                      min={delayMin}
                      max={3600}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                    />
                  </div>
                </div>
                
                <p className="mt-2 text-sm text-gray-500">
                  ההשהייה תהיה משתנה בין {formatDelay(delayMin)} ל-{formatDelay(delayMax)} עם וריאציה של ±10%
                </p>
              </div>

              {/* Confirmation */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">אישור לפני שליחה</h2>
                
                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">בקש אישור לפני שליחה</p>
                    <p className="text-sm text-gray-500">תקבל הודעה לאישור עם כפתורי שליחה/ביטול</p>
                  </div>
                  <div className={`w-12 h-7 rounded-full relative transition-colors ${requireConfirmation ? 'bg-purple-600' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${requireConfirmation ? 'left-6' : 'left-1'}`} />
                  </div>
                </label>
              </div>

              {/* Quick Actions */}
              <div className="pt-4 border-t border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">קיצורים מהירים</h2>
                
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => { setDelayMin(3); setDelayMax(5); }}
                    className="p-3 text-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <Clock className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                    <span className="text-sm text-gray-700">מהיר</span>
                    <span className="block text-xs text-gray-500">3-5 שניות</span>
                  </button>
                  
                  <button
                    onClick={() => { setDelayMin(30); setDelayMax(60); }}
                    className="p-3 text-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <Clock className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                    <span className="text-sm text-gray-700">מתון</span>
                    <span className="block text-xs text-gray-500">30-60 שניות</span>
                  </button>
                  
                  <button
                    onClick={() => { setDelayMin(300); setDelayMax(600); }}
                    className="p-3 text-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <Clock className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                    <span className="text-sm text-gray-700">איטי</span>
                    <span className="block text-xs text-gray-500">5-10 דקות</span>
                  </button>
                </div>
              </div>
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
                <span className="text-sm text-gray-500">
                  {targets.length} קבוצות נבחרו
                </span>
                <button
                  onClick={() => setTargets(availableGroups.map(g => ({
                    group_id: g.id,
                    group_name: g.name,
                    group_image_url: g.image_url,
                    sort_order: 0
                  })))}
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  בחר הכל
                </button>
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
    </div>
  );
}
