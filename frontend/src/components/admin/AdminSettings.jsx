import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../services/api';

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState(['app']);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/settings');
      setSettings(data.settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key, value) => {
    setSaving(true);
    try {
      await api.put(`/admin/settings/${key}`, { value });
      loadSettings();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירת ההגדרה');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען הגדרות...</div>;
  }

  const sections = {
    app: { label: 'הגדרות אפליקציה', icon: '⚙️' },
    smtp: { label: 'הגדרות מייל (SMTP)', icon: '📧' },
    security: { label: 'אבטחה', icon: '🔒' },
    backup: { label: 'גיבויים', icon: '💾' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">הגדרות מערכת</h2>
        <button 
          onClick={loadSettings} 
          className="p-2 hover:bg-gray-100 rounded-lg"
          disabled={loading}
        >
          <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-4">
        {Object.entries(settings).map(([key, setting]) => {
          const section = sections[key] || { label: key, icon: '📋' };
          const isExpanded = expandedSections.includes(key);
          
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(key)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span>{section.icon}</span>
                  <span className="font-medium text-gray-800">{section.label}</span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              
              {/* Section Content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {setting.description && (
                    <p className="text-sm text-gray-500 mt-3 mb-3">{setting.description}</p>
                  )}
                  
                  <SettingEditor
                    settingKey={key}
                    value={setting.value}
                    onSave={(value) => handleSave(key, value)}
                    saving={saving}
                  />
                  
                  <div className="text-xs text-gray-400 mt-3">
                    עודכן לאחרונה: {new Date(setting.updated_at).toLocaleString('he-IL')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingEditor({ settingKey, value, onSave, saving }) {
  const [editValue, setEditValue] = useState(
    typeof value === 'object' ? JSON.stringify(value, null, 2) : value
  );
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    try {
      const parsedValue = typeof value === 'object' 
        ? JSON.parse(editValue) 
        : editValue;
      onSave(parsedValue);
      setIsEditing(false);
    } catch (err) {
      alert('JSON לא תקין');
    }
  };

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)}
        className="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100 transition-colors"
      >
        <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-auto max-h-60">
          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
        </pre>
        <p className="text-xs text-gray-400 mt-2">לחץ לעריכה</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        className="w-full h-48 p-3 border border-gray-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        dir="ltr"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'שומר...' : 'שמור'}
        </button>
        <button
          onClick={() => {
            setEditValue(typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
            setIsEditing(false);
          }}
          className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
