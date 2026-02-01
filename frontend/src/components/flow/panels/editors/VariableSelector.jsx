import { useState, useEffect, useRef } from 'react';
import { X, Search, User, Settings, Hash, Calendar, Clock, MessageSquare, Plus, Loader2 } from 'lucide-react';
import api from '../../../../services/api';

// System variable icons mapping
const getVariableIcon = (name) => {
  if (name === 'name' || name === 'contact_phone' || name === 'sender_phone') return User;
  if (name === 'date' || name === 'day') return Calendar;
  if (name === 'time') return Clock;
  if (name === 'last_message') return MessageSquare;
  return Settings;
};

export default function VariableSelector({ isOpen, onSelect, onClose, position, customVariables = [] }) {
  const [search, setSearch] = useState('');
  const [systemVariables, setSystemVariables] = useState([]);
  const [userVariables, setUserVariables] = useState([]);
  const [constantVariables, setConstantVariables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newVarLabel, setNewVarLabel] = useState('');
  const [newVarKey, setNewVarKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const ref = useRef(null);

  // Load variables from API when opened (always reload to get fresh data)
  useEffect(() => {
    if (isOpen) {
      loadVariables();
    }
  }, [isOpen]);

  const loadVariables = async () => {
    try {
      setLoading(true);
      const res = await api.get('/variables');
      
      console.log('[VariableSelector] Loaded variables:', res.data);
      
      // Format system variables from API
      const sysVars = (res.data.systemVariables || []).map(v => ({
        key: v.name,
        label: v.label,
        icon: getVariableIcon(v.name),
      }));
      setSystemVariables(sysVars);
      
      // Format user variables (custom variables defined by user)
      const usrVars = (res.data.userVariables || []).map(v => ({
        key: v.name,
        label: v.label || v.name,
        icon: Hash,
      }));
      setUserVariables(usrVars);
      
      // Format constant variables (custom system vars / constants)
      const constVars = (res.data.customSystemVariables || []).map(v => ({
        key: v.name,
        label: v.label || v.name,
        value: v.default_value,
        icon: Settings,
      }));
      setConstantVariables(constVars);
      
    } catch (err) {
      console.error('Failed to load variables:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate key from label
  const handleLabelChange = (value) => {
    setNewVarLabel(value);
    // Convert Hebrew/spaces to English-friendly key
    const key = value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    setNewVarKey(key);
  };

  const handleKeyChange = (value) => {
    // Only allow valid variable name characters
    const cleanKey = value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    setNewVarKey(cleanKey);
  };

  const handleCreateVariable = async () => {
    if (!newVarKey.trim()) {
      setCreateError('יש להזין מזהה למשתנה');
      return;
    }
    
    try {
      setCreating(true);
      setCreateError('');
      
      await api.post('/variables', {
        name: newVarKey.trim(),
        label: newVarLabel.trim() || newVarKey.trim(),
        is_system: false
      });
      
      // Reload variables and select the new one
      await loadVariables();
      onSelect(`{{${newVarKey.trim()}}}`);
      
      // Reset form
      setNewVarLabel('');
      setNewVarKey('');
      setShowCreate(false);
      onClose();
      
    } catch (err) {
      setCreateError(err.response?.data?.error || 'שגיאה ביצירת משתנה');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        if (!showCreate) {
          onClose();
        }
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, showCreate]);

  if (!isOpen) return null;

  const filterVars = (vars) => 
    vars.filter(v => 
      v.key.toLowerCase().includes(search.toLowerCase()) || 
      v.label.includes(search)
    );

  const allCustom = customVariables.map(v => ({ 
    key: v, 
    label: v, 
    icon: Hash 
  }));

  return (
    <div 
      ref={ref}
      className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 w-72 max-h-80 overflow-hidden"
      style={{ 
        top: position?.top || '50%',
        left: position?.left || '50%',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="font-medium text-gray-700 text-sm">הוסף משתנה</span>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש משתנה..."
            className="w-full pr-8 pl-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-200 outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* Variables List */}
      <div className="overflow-y-auto max-h-52">
        {loading ? (
          <div className="p-4 text-center text-gray-400 text-sm">טוען משתנים...</div>
        ) : (
          <>
            {/* System Variables - Show first */}
            {systemVariables.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-teal-500 px-2 mb-1">משתני מערכת</div>
                {filterVars(systemVariables).map(v => (
                  <button
                    key={v.key}
                    onClick={() => { onSelect(`{{${v.key}}}`); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-teal-50 rounded-lg text-right transition-colors"
                  >
                    <v.icon className="w-4 h-4 text-teal-600" />
                    <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                    <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {`{{${v.key}}}`}
                    </code>
                  </button>
                ))}
              </div>
            )}

            {/* User Variables */}
            {userVariables.length > 0 && (
              <div className="p-2 border-t border-gray-100">
                <div className="text-xs font-medium text-blue-500 px-2 mb-1">המשתנים שלי</div>
                {filterVars(userVariables).map(v => (
                  <button
                    key={v.key}
                    onClick={() => { onSelect(`{{${v.key}}}`); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 rounded-lg text-right transition-colors"
                  >
                    <Hash className="w-4 h-4 text-blue-600" />
                    <span className="flex-1 text-sm text-gray-700">{v.label || v.key}</span>
                    <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {`{{${v.key}}}`}
                    </code>
                  </button>
                ))}
              </div>
            )}

            {/* Constant Variables */}
            {constantVariables.length > 0 && (
              <div className="p-2 border-t border-gray-100">
                <div className="text-xs font-medium text-purple-500 px-2 mb-1">קבועים</div>
                {filterVars(constantVariables).map(v => (
                  <button
                    key={v.key}
                    onClick={() => { onSelect(`{{${v.key}}}`); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 rounded-lg text-right transition-colors"
                  >
                    <Settings className="w-4 h-4 text-purple-600" />
                    <span className="flex-1 text-sm text-gray-700">{v.label || v.key}</span>
                    <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {`{{${v.key}}}`}
                    </code>
                  </button>
                ))}
              </div>
            )}

            {/* Custom Variables passed as props */}
            {allCustom.length > 0 && (
              <div className="p-2 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-400 px-2 mb-1">משתנים נוספים</div>
                {filterVars(allCustom).map(v => (
                  <button
                    key={v.key}
                    onClick={() => { onSelect(`{{${v.key}}}`); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 rounded-lg text-right transition-colors"
                  >
                    <Hash className="w-4 h-4 text-purple-600" />
                    <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                    <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {`{{${v.key}}}`}
                    </code>
                  </button>
                ))}
              </div>
            )}
            
            {/* Empty state */}
            {systemVariables.length === 0 && userVariables.length === 0 && constantVariables.length === 0 && allCustom.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">
                לא נמצאו משתנים
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Variable Button / Form */}
      <div className="border-t border-gray-100 p-2 bg-gray-50">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            צור משתנה חדש
          </button>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-600 mb-2">יצירת משתנה חדש</div>
            
            <input
              type="text"
              value={newVarLabel}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="שם לתצוגה (עברית)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none"
              autoFocus
            />
            
            <div className="relative">
              <input
                type="text"
                value={newVarKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="מזהה (באנגלית)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 outline-none font-mono"
                dir="ltr"
              />
              {newVarKey && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {`{{${newVarKey}}}`}
                </span>
              )}
            </div>
            
            {createError && (
              <div className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                {createError}
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewVarLabel('');
                  setNewVarKey('');
                  setCreateError('');
                }}
                className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleCreateVariable}
                disabled={!newVarKey.trim() || creating}
                className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                צור
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
