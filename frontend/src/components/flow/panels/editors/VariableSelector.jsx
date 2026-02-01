import { useState, useEffect, useRef } from 'react';
import { X, Search, User, Settings, Hash, Calendar, Clock, MessageSquare } from 'lucide-react';
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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

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
            {/* User Variables - Show first as they are most relevant for broadcasts */}
            {userVariables.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-blue-500 px-2 mb-1">המשתנים שלי</div>
                {filterVars(userVariables).map(v => (
                  <button
                    key={v.key}
                    onClick={() => { onSelect(`{{${v.key}}}`); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 rounded-lg text-right transition-colors"
                  >
                    <Hash className="w-4 h-4 text-blue-600" />
                    <span className="flex-1 text-sm text-gray-700">{v.label}</span>
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
                    <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                    <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {`{{${v.key}}}`}
                    </code>
                  </button>
                ))}
              </div>
            )}

            {/* System Variables */}
            {systemVariables.length > 0 && (
              <div className="p-2 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-400 px-2 mb-1">משתני מערכת</div>
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
    </div>
  );
}
