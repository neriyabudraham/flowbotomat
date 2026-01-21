import { useState, useEffect } from 'react';
import { X, Phone, Calendar, MessageSquare, Tag, Variable, Bot, XCircle, Plus, Trash2, Clock, GitBranch, Send } from 'lucide-react';
import Button from '../atoms/Button';
import api from '../../services/api';

// Variable labels mapping
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

export default function ContactProfile({ contact, onClose, onUpdate }) {
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
    flowsCompleted: []
  });
  const [loading, setLoading] = useState(true);

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
        flowsCompleted: statsRes.data.flowsCompleted || [],
      });
    } catch (err) {
      console.error('Load data error:', err);
    }
    setLoading(false);
  };
  
  // Get variable display label
  const getVariableLabel = (key) => {
    // Check built-in labels
    if (VARIABLE_LABELS[key]) return VARIABLE_LABELS[key];
    // Check user-defined labels
    const def = varDefinitions.find(v => v.name === key);
    if (def?.label) return def.label;
    // Return key as-is
    return key;
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

  if (!contact) return null;

  const availableTags = allTags.filter(t => !tags.find(ct => ct.id === t.id));

  return (
    <div className="h-full flex flex-col bg-white border-r">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5" />
        </button>
        <h3 className="font-semibold">פרטי איש קשר</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Profile Header */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3">
            {contact.profile_picture_url ? (
              <img src={contact.profile_picture_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-gray-500">
                {contact.display_name?.charAt(0) || '👤'}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold">{contact.display_name || contact.phone}</h2>
          <p className="text-gray-500 flex items-center justify-center gap-1 mt-1">
            <Phone className="w-4 h-4" />
            <span dir="ltr">+{contact.phone}</span>
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <MessageSquare className="w-5 h-5 mx-auto text-gray-400 mb-1" />
            <div className="text-lg font-bold">{stats.messageCount}</div>
            <div className="text-xs text-gray-500">הודעות</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <Calendar className="w-5 h-5 mx-auto text-gray-400 mb-1" />
            <div className="text-sm font-medium">
              {contact.created_at 
                ? new Date(contact.created_at).toLocaleDateString('he-IL')
                : '-'}
            </div>
            <div className="text-xs text-gray-500">נוצר</div>
          </div>
        </div>
        
        {/* Last Message */}
        {stats.lastMessageAt && (
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-700">הודעה אחרונה</span>
            </div>
            <p className="text-xs text-blue-600 mb-1">
              {new Date(stats.lastMessageAt).toLocaleString('he-IL')}
            </p>
            {stats.lastMessageContent && (
              <p className="text-sm text-gray-700 truncate">
                {stats.lastMessageContent}
              </p>
            )}
          </div>
        )}
        
        {/* Flows Completed */}
        {stats.flowsCompleted && stats.flowsCompleted.length > 0 && (
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-700">פלואים שהושלמו</span>
            </div>
            <div className="space-y-1">
              {stats.flowsCompleted.map((flow, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-purple-700">{flow.name}</span>
                  <span className="text-purple-500 text-xs">
                    {flow.count}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bot Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">סטטוס בוט</span>
            <button
              onClick={handleToggleBot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                contact.is_bot_active 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {contact.is_bot_active ? <Bot className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {contact.is_bot_active ? 'פעיל' : 'כבוי'}
            </button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            תגיות
          </h4>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => (
              <span 
                key={tag.id}
                className="px-2 py-1 rounded-full text-sm flex items-center gap-1"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                {tag.name}
                <button onClick={() => handleRemoveTag(tag.id)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          {availableTags.length > 0 && (
            <select 
              onChange={(e) => e.target.value && handleAddTag(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm"
              value=""
            >
              <option value="">הוסף תגית...</option>
              {availableTags.map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="תגית חדשה..."
              className="flex-1 px-2 py-1 border rounded text-sm"
            />
            <Button onClick={handleCreateTag} className="text-sm px-2 py-1">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Variables */}
        <div>
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Variable className="w-4 h-4" />
            משתנים
          </h4>
          <div className="space-y-2">
            {variables.map(v => (
              <div key={v.key} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                <span className="text-sm font-medium text-teal-700 min-w-[80px]">{getVariableLabel(v.key)}</span>
                <span className="text-gray-400">=</span>
                <span className="flex-1 text-sm truncate" dir="auto">{v.value}</span>
                <button onClick={() => handleDeleteVariable(v.key)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {variables.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">אין משתנים</p>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newVarKey}
              onChange={(e) => setNewVarKey(e.target.value)}
              placeholder="שם"
              className="w-24 px-2 py-1 border rounded text-sm"
            />
            <input
              type="text"
              value={newVarValue}
              onChange={(e) => setNewVarValue(e.target.value)}
              placeholder="ערך"
              className="flex-1 px-2 py-1 border rounded text-sm"
            />
            <Button onClick={handleAddVariable} className="text-sm px-2 py-1">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
