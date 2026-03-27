import { useState, useEffect } from 'react';
import { 
  Save, RefreshCw, Loader2, Plus, Trash2, ExternalLink, Bell, 
  HelpCircle, Users, MessageCircle, Gift, Clock, Settings
} from 'lucide-react';
import api from '../../services/api';
import { toast } from '../../store/toastStore';

const ICON_OPTIONS = [
  { value: 'bell', label: 'פעמון', icon: Bell },
  { value: 'help', label: 'עזרה', icon: HelpCircle },
  { value: 'users', label: 'קבוצה', icon: Users },
  { value: 'message', label: 'הודעה', icon: MessageCircle },
  { value: 'gift', label: 'מתנה', icon: Gift },
];

const MODULE_OPTIONS = [
  { value: 'bots', label: 'בוטים' },
  { value: 'statusBot', label: 'בוט סטטוסים' },
  { value: 'broadcasts', label: 'שליחת תפוצה' },
  { value: 'groupTransfers', label: 'העברת הודעות בין קבוצות' },
];

export default function AdminSiteConfig() {
  const [config, setConfig] = useState({
    trial: {
      enabled: false,
      days: 14,
      modules: []
    },
    community: {
      enabled: true,
      links: []
    },
    features: {
      showTrialBadge: false,
      showCommunityLinks: true
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/public/config');
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/site_config', { value: config });
      toast.success('ההגדרות נשמרו בהצלחה!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const addCommunityLink = () => {
    setConfig(prev => ({
      ...prev,
      community: {
        ...prev.community,
        links: [
          ...prev.community.links,
          { name: 'קבוצה חדשה', url: '', icon: 'users' }
        ]
      }
    }));
  };

  const updateCommunityLink = (index, field, value) => {
    setConfig(prev => ({
      ...prev,
      community: {
        ...prev.community,
        links: prev.community.links.map((link, i) => 
          i === index ? { ...link, [field]: value } : link
        )
      }
    }));
  };

  const removeCommunityLink = (index) => {
    setConfig(prev => ({
      ...prev,
      community: {
        ...prev.community,
        links: prev.community.links.filter((_, i) => i !== index)
      }
    }));
  };

  const toggleModule = (module) => {
    setConfig(prev => ({
      ...prev,
      trial: {
        ...prev.trial,
        modules: prev.trial.modules.includes(module)
          ? prev.trial.modules.filter(m => m !== module)
          : [...prev.trial.modules, module]
      }
    }));
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        טוען הגדרות...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5" />
          הגדרות אתר
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={loadConfig} 
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            disabled={loading}
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'שומר...' : 'שמור הכל'}
          </button>
        </div>
      </div>

      {/* Trial Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Gift className="w-5 h-5 text-purple-500" />
          הגדרות תקופת ניסיון
        </h3>
        
        <div className="space-y-4">
          {/* Enable Trial */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="font-medium text-gray-800 dark:text-white">הפעל תקופת ניסיון</p>
              <p className="text-sm text-gray-500">האם להציע ניסיון חינם למשתמשים חדשים</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.trial.enabled}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  trial: { ...prev.trial, enabled: e.target.checked }
                }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>

          {/* Trial Days */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <label className="block font-medium text-gray-800 dark:text-white mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              ימי ניסיון
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={config.trial.days}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                trial: { ...prev.trial, days: parseInt(e.target.value) || 14 }
              }))}
              className="w-32 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            />
          </div>

          {/* Modules with Trial */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <label className="block font-medium text-gray-800 dark:text-white mb-3">
              מודולים עם תקופת ניסיון
            </label>
            <div className="flex flex-wrap gap-2">
              {MODULE_OPTIONS.map(mod => (
                <button
                  key={mod.value}
                  onClick={() => toggleModule(mod.value)}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    config.trial.modules.includes(mod.value)
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-300'
                  }`}
                >
                  {mod.label}
                </button>
              ))}
            </div>
          </div>

          {/* Show Trial Badge */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="font-medium text-gray-800 dark:text-white">הצג תג ניסיון בדף הראשי</p>
              <p className="text-sm text-gray-500">הצג "{config.trial.days} ימי ניסיון חינם"</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.features.showTrialBadge}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  features: { ...prev.features, showTrialBadge: e.target.checked }
                }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Community Links */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-green-500" />
            קישורי קהילה
          </h3>
          <button
            onClick={addCommunityLink}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm"
          >
            <Plus className="w-4 h-4" />
            הוסף קישור
          </button>
        </div>

        {/* Enable Community Links */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-4">
          <div>
            <p className="font-medium text-gray-800 dark:text-white">הצג קישורי קהילה</p>
            <p className="text-sm text-gray-500">הצג קישורים בדף הראשי ובדשבורד</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.features.showCommunityLinks}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                features: { ...prev.features, showCommunityLinks: e.target.checked }
              }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>

        {/* Links List */}
        <div className="space-y-3">
          {config.community.links.length === 0 ? (
            <p className="text-center text-gray-400 py-4">אין קישורים. לחץ "הוסף קישור" להוספה.</p>
          ) : (
            config.community.links.map((link, index) => (
              <div key={index} className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                {/* Icon Select */}
                <select
                  value={link.icon}
                  onChange={(e) => updateCommunityLink(index, 'icon', e.target.value)}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-28"
                >
                  {ICON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {/* Name */}
                <input
                  type="text"
                  value={link.name}
                  onChange={(e) => updateCommunityLink(index, 'name', e.target.value)}
                  placeholder="שם הקבוצה"
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                />

                {/* URL */}
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => updateCommunityLink(index, 'url', e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  dir="ltr"
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                />

                {/* Test Link */}
                {link.url && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
                    title="בדוק קישור"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Delete */}
                <button
                  onClick={() => removeCommunityLink(index)}
                  className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">תצוגה מקדימה</h3>
        
        {/* Trial Badge Preview */}
        {config.features.showTrialBadge && config.trial.enabled && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">תג ניסיון:</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 shadow-lg rounded-full text-sm font-medium">
              <Gift className="w-4 h-4 text-yellow-500" />
              <span className="text-gray-700">{config.trial.days} ימי ניסיון חינם</span>
            </div>
          </div>
        )}

        {/* Community Links Preview */}
        {config.features.showCommunityLinks && config.community.links.length > 0 && (
          <div>
            <p className="text-sm text-gray-500 mb-2">קישורי קהילה:</p>
            <div className="flex flex-wrap gap-2">
              {config.community.links.map((link, i) => {
                const IconComponent = ICON_OPTIONS.find(o => o.value === link.icon)?.icon || Users;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm"
                  >
                    <IconComponent className="w-4 h-4" />
                    {link.name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!config.features.showTrialBadge && !config.features.showCommunityLinks && (
          <p className="text-gray-400">אין פריטים להצגה (הכל מבוטל)</p>
        )}
      </div>
    </div>
  );
}
