import { useState, useEffect } from 'react';
import { 
  X, Phone, Calendar, MessageSquare, Tag, Variable, Bot, XCircle, Plus, Trash2, 
  Clock, GitBranch, Send, Mail, User, MapPin, Building, CreditCard, Edit3,
  Check, Star, Activity, TrendingUp, ChevronDown, ChevronUp, Sparkles, Copy
} from 'lucide-react';
import api from '../../services/api';
import DeleteContactModal from '../contacts/DeleteContactModal';

const VARIABLE_LABELS = {
  email: 'אימייל',
  full_name: 'שם מלא',
  first_name: 'שם פרטי',
  last_name: 'שם משפחה',
  phone: 'טלפון',
  id_number: 'מספר זהות',
  address: 'כתובת',
  city: 'עיר',
  company: 'חברה',
  birthday: 'יום הולדת',
  notes: 'הערות',
};

const VARIABLE_ICONS = {
  email: Mail,
  full_name: User,
  first_name: User,
  last_name: User,
  phone: Phone,
  address: MapPin,
  city: MapPin,
  company: Building,
};

export default function ContactProfile({ contact, onClose, onUpdate, onDelete }) {
  const [variables, setVariables] = useState([]);
  const [varDefinitions, setVarDefinitions] = useState([]);
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [stats, setStats] = useState({ 
    messageCount: 0, 
    lastMessageAt: null,
    lastMessageContent: null,
    botsInteracted: []
  });
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    stats: true,
    tags: true,
    variables: true,
    flows: true,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (contact) {
      loadData();
    }
  }, [contact?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [varsRes, tagsRes, allTagsRes, statsRes, defsRes] = await Promise.all([
        api.get(`/contacts/${contact.id}/variables`),
        api.get(`/contacts/${contact.id}/tags`),
        api.get('/contacts/tags'),
        api.get(`/contacts/${contact.id}/stats`),
        api.get('/variables').catch(() => ({ data: { variables: [] } })),
      ]);
      setVariables(varsRes.data.variables || []);
      setTags(tagsRes.data.tags || []);
      setAllTags(allTagsRes.data.tags || []);
      setVarDefinitions(defsRes.data.variables || []);
      setStats({
        messageCount: statsRes.data.messageCount || 0,
        lastMessageAt: statsRes.data.lastMessageAt || null,
        lastMessageContent: statsRes.data.lastMessageContent || null,
        botsInteracted: statsRes.data.botsInteracted || [],
      });
    } catch (err) {
      console.error('Load data error:', err);
    }
    setLoading(false);
  };
  
  const getVariableLabel = (key) => {
    if (VARIABLE_LABELS[key]) return VARIABLE_LABELS[key];
    const def = varDefinitions.find(v => v.name === key);
    if (def?.label) return def.label;
    return key;
  };

  const getVariableIcon = (key) => {
    return VARIABLE_ICONS[key] || Variable;
  };

  const handleAddVariable = async () => {
    if (!newVarKey.trim()) return;
    try {
      await api.post(`/contacts/${contact.id}/variables`, { key: newVarKey, value: newVarValue });
      setNewVarKey('');
      setNewVarValue('');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteVariable = async (key) => {
    try {
      await api.delete(`/contacts/${contact.id}/variables/${key}`);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTag = async (tagId) => {
    try {
      await api.post(`/contacts/${contact.id}/tags`, { tagId });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveTag = async (tagId) => {
    try {
      await api.delete(`/contacts/${contact.id}/tags/${tagId}`);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const { data } = await api.post('/contacts/tags', { name: newTagName });
      setNewTagName('');
      setAllTags([...allTags, data.tag]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBot = async () => {
    try {
      await api.patch(`/contacts/${contact.id}/bot`, { is_bot_active: !contact.is_bot_active });
      onUpdate({ ...contact, is_bot_active: !contact.is_bot_active });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteContact = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/contacts/${contact.id}`);
      setShowDeleteModal(false);
      onDelete?.(contact.id);
      onClose();
    } catch (err) {
      console.error(err);
    }
    setDeleteLoading(false);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (!contact) return null;

  const availableTags = allTags.filter(t => !tags.find(ct => ct.id === t.id));

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-white to-gray-50">
      {/* Premium Header */}
      <div className="relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative p-6 text-white">
          <div className="flex items-start justify-between mb-4">
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-semibold text-white/90">כרטיס לקוח</h3>
          </div>

          {/* Profile */}
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center overflow-hidden shadow-xl">
                {contact.profile_picture_url ? (
                  <img src={contact.profile_picture_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-white/80">
                    {contact.display_name?.charAt(0)?.toUpperCase() || '👤'}
                  </span>
                )}
              </div>
              {/* Status Badge */}
              <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border-2 border-white flex items-center justify-center shadow-lg ${
                contact.is_bot_active 
                  ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                  : 'bg-gray-400'
              }`}>
                {contact.is_bot_active ? (
                  <Bot className="w-3.5 h-3.5 text-white" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-white" />
                )}
              </div>
            </div>
            
            <h2 className="text-xl font-bold">{contact.display_name || contact.phone}</h2>
            <button 
              onClick={() => copyToClipboard(contact.phone)}
              className="flex items-center justify-center gap-2 mt-2 text-white/70 hover:text-white transition-colors mx-auto"
            >
              <Phone className="w-4 h-4" />
              <span dir="ltr">+{contact.phone}</span>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.messageCount}</div>
                <div className="text-xs text-gray-500">הודעות</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {contact.created_at 
                    ? new Date(contact.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                    : '-'}
                </div>
                <div className="text-xs text-gray-500">הצטרף</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Last Message */}
        {stats.lastMessageAt && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-500 rounded-lg">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-blue-900">הודעה אחרונה</span>
            </div>
            <p className="text-xs text-blue-600 mb-2">
              {new Date(stats.lastMessageAt).toLocaleString('he-IL')}
            </p>
            {stats.lastMessageContent && (
              <p className="text-sm text-gray-700 bg-white/60 p-2 rounded-lg line-clamp-2">
                {stats.lastMessageContent}
              </p>
            )}
          </div>
        )}
        
        {/* Bots Interacted */}
        {stats.botsInteracted && stats.botsInteracted.length > 0 && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100/50">
            <button 
              onClick={() => toggleSection('flows')}
              className="flex items-center justify-between w-full mb-3"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-500 rounded-lg">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-purple-900">בוטים שעבר</span>
              </div>
              {expandedSections.flows ? (
                <ChevronUp className="w-4 h-4 text-purple-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-purple-400" />
              )}
            </button>
            {expandedSections.flows && (
              <div className="space-y-2">
                {stats.botsInteracted.map((bot, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white/60 rounded-xl">
                    <span className="text-sm font-medium text-purple-700">{bot.name}</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-xs font-bold rounded-full">
                      {bot.count} הודעות
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bot Status */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                contact.is_bot_active 
                  ? 'bg-gradient-to-br from-green-100 to-emerald-100' 
                  : 'bg-gradient-to-br from-red-100 to-rose-100'
              }`}>
                {contact.is_bot_active ? (
                  <Bot className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <span className="font-semibold text-gray-900">סטטוס בוט</span>
                <p className="text-xs text-gray-500">
                  {contact.is_bot_active ? 'הבוט מגיב להודעות' : 'הבוט מושהה'}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleBot}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-all shadow-sm ${
                contact.is_bot_active 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg' 
                  : 'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:shadow-lg'
              }`}
            >
              {contact.is_bot_active ? 'פעיל' : 'כבוי'}
            </button>
          </div>
        </div>

        {/* Tags Section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <button 
            onClick={() => toggleSection('tags')}
            className="flex items-center justify-between w-full mb-3"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-900">תגיות</span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                {tags.length}
              </span>
            </div>
            {expandedSections.tags ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          
          {expandedSections.tags && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.length === 0 ? (
                  <p className="text-sm text-gray-400">אין תגיות</p>
                ) : (
                  tags.map(tag => (
                    <span 
                      key={tag.id}
                      className="px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-all hover:scale-105"
                      style={{ backgroundColor: tag.color + '20', color: tag.color }}
                    >
                      {tag.name}
                      <button 
                        onClick={() => handleRemoveTag(tag.id)} 
                        className="hover:opacity-70 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              
              {availableTags.length > 0 && (
                <select 
                  onChange={(e) => e.target.value && handleAddTag(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-2"
                  value=""
                >
                  <option value="">הוסף תגית קיימת...</option>
                  {availableTags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              )}
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="תגית חדשה..."
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                />
                <button 
                  onClick={handleCreateTag}
                  className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Variables Section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <button 
            onClick={() => toggleSection('variables')}
            className="flex items-center justify-between w-full mb-3"
          >
            <div className="flex items-center gap-2">
              <Variable className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-900">משתנים</span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                {variables.length}
              </span>
            </div>
            {expandedSections.variables ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          
          {expandedSections.variables && (
            <>
              <div className="space-y-2 mb-3">
                {variables.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">אין משתנים</p>
                ) : (
                  variables.map(v => {
                    const Icon = getVariableIcon(v.key);
                    return (
                      <div 
                        key={v.key} 
                        className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 group"
                      >
                        <div className="p-2 bg-teal-100 rounded-lg">
                          <Icon className="w-4 h-4 text-teal-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-teal-700">{getVariableLabel(v.key)}</p>
                          <p className="text-sm text-gray-800 truncate" dir="auto">{v.value || '-'}</p>
                        </div>
                        <button 
                          onClick={() => handleDeleteVariable(v.key)} 
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVarKey}
                  onChange={(e) => setNewVarKey(e.target.value)}
                  placeholder="שם"
                  className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                />
                <input
                  type="text"
                  value={newVarValue}
                  onChange={(e) => setNewVarValue(e.target.value)}
                  placeholder="ערך"
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                />
                <button 
                  onClick={handleAddVariable}
                  className="p-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
        
        {/* Delete Contact Button */}
        <div className="bg-red-50 rounded-2xl p-4 border border-red-100 mt-4">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-medium transition-all"
          >
            <Trash2 className="w-5 h-5" />
            מחק איש קשר
          </button>
          <p className="text-xs text-red-500 text-center mt-2">
            פעולה זו לא ניתנת לביטול
          </p>
        </div>
      </div>

      {/* Delete Modal */}
      <DeleteContactModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteContact}
        contactName={contact.display_name || contact.phone}
        isLoading={deleteLoading}
      />
    </div>
  );
}
