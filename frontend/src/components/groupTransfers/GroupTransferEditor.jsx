import { useState, useEffect } from 'react';
import {
  ArrowRight, Save, Target, Clock, UserCheck, Settings, Search,
  X, Plus, Trash2, Check, AlertCircle, Loader2, RefreshCw,
  Users, ChevronDown, ChevronUp, Phone, Crown, AlertTriangle, Info
} from 'lucide-react';
import Button from '../atoms/Button';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';

export default function GroupTransferEditor({ transfer, onClose, onSave }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('targets');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Transfer settings
  const [name, setName] = useState(transfer.name || '');
  const [description, setDescription] = useState(transfer.description || '');
  const [delayMin, setDelayMin] = useState(transfer.delay_min || 1);
  const [delayMax, setDelayMax] = useState(transfer.delay_max || 3);
  
  // Targets (groups that participate in the transfer)
  const [targets, setTargets] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  
  // Target limit
  const [targetLimit, setTargetLimit] = useState(50);
  const [showLimitModal, setShowLimitModal] = useState(false);
  
  // Authorized senders (whitelist - empty = all allowed)
  const [senders, setSenders] = useState([]);
  const [newSenderPhone, setNewSenderPhone] = useState('');
  const [newSenderName, setNewSenderName] = useState('');
  
  // Error modal
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    loadTransferDetails();
  }, [transfer.id]);

  const loadTransferDetails = async () => {
    try {
      setLoading(true);
      
      const [transferRes, limitRes] = await Promise.all([
        api.get(`/group-transfers/${transfer.id}`),
        api.get('/group-transfers/limit')
      ]);
      
      const t = transferRes.data.transfer;
      
      setName(t.name);
      setDescription(t.description || '');
      setDelayMin(t.delay_min || 1);
      setDelayMax(t.delay_max || 3);
      setTargets(t.targets || []);
      setSenders(t.authorized_senders || []);
      
      const limit = limitRes.data.targetLimit;
      setTargetLimit(limit === -1 ? Infinity : (limit || 50));
    } catch (e) {
      console.error('Error loading transfer:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableGroups = async () => {
    try {
      setLoadingGroups(true);
      const { data } = await api.get('/group-transfers/groups', {
        params: { search: groupSearch }
      });
      setAvailableGroups(data.groups || []);
    } catch (e) {
      console.error('Error loading groups:', e);
      if (e.response?.data?.code === 'NO_WHATSAPP_CONNECTION') {
        setErrorMessage('אין חיבור וואטסאפ פעיל. אנא חבר את הוואטסאפ תחילה.');
      }
    } finally {
      setLoadingGroups(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      
      const { data } = await api.put(`/group-transfers/${transfer.id}`, {
        name,
        description,
        delay_min: delayMin,
        delay_max: delayMax,
        require_confirmation: false // Always false for group transfers
      });
      
      onSave?.(data.transfer);
      return true;
    } catch (e) {
      setErrorMessage(e.response?.data?.error || 'שגיאה בשמירה');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTargets = async () => {
    try {
      setSaving(true);
      await api.put(`/group-transfers/${transfer.id}/targets`, {
        targets: targets.map((t, i) => ({
          group_id: t.group_id,
          group_name: t.group_name,
          group_image_url: t.group_image_url,
          sort_order: i
        }))
      });
      return true;
    } catch (e) {
      setErrorMessage(e.response?.data?.error || 'שגיאה בשמירת קבוצות');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSenders = async () => {
    try {
      setSaving(true);
      await api.put(`/group-transfers/${transfer.id}/senders`, {
        senders: senders.map(s => ({
          phone_number: s.phone_number,
          name: s.name
        }))
      });
      return true;
    } catch (e) {
      setErrorMessage(e.response?.data?.error || 'שגיאה בשמירת רשימה לבנה');
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
    
    const groupsToSelect = filteredGroups.slice(0, targetLimit);
    
    setTargets(groupsToSelect.map((g, i) => ({
      group_id: g.id,
      group_name: g.name,
      group_image_url: g.image_url,
      sort_order: i
    })));
    
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

  const normalizePhoneNumber = (phone) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
    if (cleaned.startsWith('0')) cleaned = '972' + cleaned.substring(1);
    if (!cleaned.startsWith('972') && cleaned.length >= 9 && cleaned.length <= 10) {
      cleaned = '972' + cleaned;
    }
    return cleaned;
  };

  const addSender = () => {
    const phone = newSenderPhone.trim();
    if (!phone) return;
    
    const normalizedPhone = normalizePhoneNumber(phone);
    
    if (senders.some(s => normalizePhoneNumber(s.phone_number) === normalizedPhone)) {
      setErrorMessage('מספר זה כבר קיים ברשימה');
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
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20">
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
                <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{name}</h1>
                  <p className="text-sm text-gray-500">העברת הודעות בין קבוצות</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleSaveAll} 
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור והחל
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-2xl border border-teal-100 flex items-start gap-3">
          <div className="p-2 bg-teal-500 rounded-lg">
            <Info className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-medium text-teal-900">איך זה עובד?</p>
            <p className="text-sm text-teal-700">
              כל הודעה שנשלחת באחת מהקבוצות תועבר אוטומטית לכל שאר הקבוצות, עם זיהוי השולח.
              <br />
              הפורמט: <span className="font-mono bg-white/50 px-1 rounded">@טלפון (שם): ההודעה</span>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-white/80 backdrop-blur p-1.5 rounded-2xl border border-gray-200/50 shadow-sm">
          {[
            { id: 'targets', icon: Target, label: 'קבוצות', count: targets.length, color: 'teal' },
            { id: 'senders', icon: UserCheck, label: 'רשימה לבנה', count: senders.length, color: 'green' },
            { id: 'settings', icon: Settings, label: 'הגדרות', color: 'blue' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg'
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
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">קבוצות בחבילה</h2>
                    <p className="text-gray-500 mt-1">הודעות יועברו בין כל הקבוצות שנבחרו</p>
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
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף קבוצות
                  </button>
                </div>
              </div>
              
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
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-gradient-to-br from-gray-50 to-teal-50/30">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-3xl flex items-center justify-center">
                    <Target className="w-10 h-10 text-teal-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">לא נבחרו קבוצות עדיין</h3>
                  <p className="text-gray-500 mb-6">בחר לפחות 2 קבוצות כדי להתחיל להעביר הודעות ביניהן</p>
                  <button
                    onClick={() => {
                      setShowGroupSelector(true);
                      loadAvailableGroups();
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
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
                      className="group flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 hover:border-teal-200 hover:shadow-md transition-all"
                    >
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveTargetUp(index)}
                          disabled={index === 0}
                          className="p-1 hover:bg-teal-100 rounded-lg text-gray-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveTargetDown(index)}
                          disabled={index === targets.length - 1}
                          className="p-1 hover:bg-teal-100 rounded-lg text-gray-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-500 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow">
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
                        <span className="text-xs text-gray-400">הודעות מקבוצה זו יועברו לשאר</span>
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

              {targets.length === 1 && (
                <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <p className="text-sm text-amber-700">
                    נבחרה קבוצה אחת בלבד. הוסף עוד קבוצות כדי להפעיל העברת הודעות.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Authorized Senders Tab (Whitelist) */}
          {activeTab === 'senders' && (
            <div className="p-8">
              <div className="flex items-start gap-4 mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <UserCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">רשימה לבנה (אופציונלי)</h2>
                  <p className="text-gray-500 mt-1">
                    {senders.length === 0 
                      ? 'כרגע כל הודעה מכל משתתף תועבר. הוסף מספרים להגבלה.'
                      : `רק הודעות מ-${senders.length} המספרים האלו יועברו.`
                    }
                  </p>
                </div>
              </div>

              {/* Add Sender Form */}
              <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-100 mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-3">הוסף מספר לרשימה הלבנה</label>
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
                  <h3 className="text-lg font-bold text-gray-800 mb-2">הרשימה הלבנה ריקה</h3>
                  <p className="text-gray-500">כל הודעה מכל משתתף תועבר לשאר הקבוצות</p>
                  <p className="text-sm text-gray-400 mt-2">הוסף מספרים כדי להגביל את ההעברה רק להודעות מהם</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {senders.map((sender) => {
                    const formatPhoneDisplay = (phone) => {
                      if (!phone) return phone;
                      let display = phone.split('@')[0];
                      if (display.startsWith('972')) display = '0' + display.substring(3);
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
                        <div className="flex-1 min-w-0 text-right">
                          {sender.name && (
                            <p className="font-semibold text-gray-900 text-lg">{sender.name}</p>
                          )}
                          <p className={`${sender.name ? 'text-sm text-gray-500' : 'font-semibold text-gray-900 text-lg'}`} dir="ltr" style={{ textAlign: 'right' }}>
                            {formatPhoneDisplay(sender.phone_number)}
                          </p>
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
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-8 space-y-8">
              <div className="flex items-start gap-4 mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">הגדרות העברה</h2>
                  <p className="text-gray-500 mt-1">התאם את פרטי ההעברה</p>
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
                    <label className="block text-sm font-medium text-gray-600 mb-2">שם החבילה</label>
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
                <p className="text-sm text-gray-500 mb-4">הזמן בין שליחת הודעה לקבוצה אחת לבאה</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">מינימום (שניות)</label>
                    <input
                      type="number"
                      value={delayMin}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setDelayMin(val);
                        if (delayMax < val) setDelayMax(val);
                      }}
                      min={1}
                      max={60}
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
                      max={60}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    />
                  </div>
                </div>
                
                <p className="mt-3 text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded-lg">
                  ⏱️ ההשהייה תהיה בין {formatDelay(delayMin)} ל-{formatDelay(delayMax)}
                </p>
              </div>

              {/* Quick Delay Presets */}
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => { setDelayMin(1); setDelayMax(3); }}
                  className={`group p-4 text-center rounded-2xl border-2 transition-all hover:shadow-md ${
                    delayMin === 1 && delayMax === 3 
                      ? 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50' 
                      : 'border-gray-200 hover:border-green-200'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center transition-all ${
                    delayMin === 1 && delayMax === 3 
                      ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-green-100'
                  }`}>
                    <Clock className={`w-6 h-6 ${delayMin === 1 && delayMax === 3 ? 'text-white' : 'text-gray-400 group-hover:text-green-500'}`} />
                  </div>
                  <span className="font-bold text-gray-800">מהיר</span>
                  <span className="block text-xs text-gray-500 mt-1">1-3 שניות</span>
                </button>
                
                <button
                  onClick={() => { setDelayMin(3); setDelayMax(5); }}
                  className={`group p-4 text-center rounded-2xl border-2 transition-all hover:shadow-md ${
                    delayMin === 3 && delayMax === 5 
                      ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50' 
                      : 'border-gray-200 hover:border-blue-200'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center transition-all ${
                    delayMin === 3 && delayMax === 5 
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-blue-100'
                  }`}>
                    <Clock className={`w-6 h-6 ${delayMin === 3 && delayMax === 5 ? 'text-white' : 'text-gray-400 group-hover:text-blue-500'}`} />
                  </div>
                  <span className="font-bold text-gray-800">רגיל</span>
                  <span className="block text-xs text-gray-500 mt-1">3-5 שניות</span>
                </button>
                
                <button
                  onClick={() => { setDelayMin(5); setDelayMax(10); }}
                  className={`group p-4 text-center rounded-2xl border-2 transition-all hover:shadow-md ${
                    delayMin === 5 && delayMax === 10 
                      ? 'border-teal-500 bg-gradient-to-br from-teal-50 to-cyan-50' 
                      : 'border-gray-200 hover:border-teal-200'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center transition-all ${
                    delayMin === 5 && delayMax === 10 
                      ? 'bg-gradient-to-br from-teal-500 to-cyan-500 shadow-lg' 
                      : 'bg-gray-100 group-hover:bg-teal-100'
                  }`}>
                    <Clock className={`w-6 h-6 ${delayMin === 5 && delayMax === 10 ? 'text-white' : 'text-gray-400 group-hover:text-teal-500'}`} />
                  </div>
                  <span className="font-bold text-gray-800">איטי</span>
                  <span className="block text-xs text-gray-500 mt-1">5-10 שניות</span>
                </button>
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
                  className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
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
                <div className="flex gap-2">
                  {targets.length > 0 && (
                    <button onClick={() => setTargets([])} className="text-sm text-gray-500 hover:text-gray-700">
                      נקה הכל
                    </button>
                  )}
                  <button onClick={selectAllGroups} className="text-sm text-teal-600 hover:text-teal-700">
                    בחר הכל
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {loadingGroups ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
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
                              ? 'border-teal-500 bg-teal-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-teal-500 bg-teal-500' : 'border-gray-300'
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
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-lg">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">הגעת למגבלת הקבוצות</h2>
                  <p className="text-sm text-gray-500">{targets.length} מתוך {targetLimit}</p>
                </div>
              </div>
              <button onClick={() => setShowLimitModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => setShowLimitModal(false)} className="flex-1 px-6 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50">
                הבנתי
              </button>
              <button onClick={() => { setShowLimitModal(false); navigate('/pricing'); }} className="flex-1 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2">
                <Crown className="w-5 h-5" />
                שדרג עכשיו
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setErrorMessage(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">שגיאה</h3>
              <p className="text-gray-600 mb-6">{errorMessage}</p>
              <button onClick={() => setErrorMessage(null)} className="w-full px-4 py-2.5 text-white bg-gray-800 hover:bg-gray-900 rounded-xl font-medium">
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
