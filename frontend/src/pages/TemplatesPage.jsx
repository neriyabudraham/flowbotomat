import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Download, Search, Filter, Star, Users, Grid, List, 
  Plus, ArrowRight, Clock, X, Eye, Bot
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Button from '../components/atoms/Button';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

const categories = [
  { id: 'all', label: 'הכל', icon: Grid },
  { id: 'sales', label: 'מכירות', icon: Star },
  { id: 'support', label: 'תמיכה', icon: Users },
  { id: 'registration', label: 'רישום', icon: Plus },
  { id: 'general', label: 'כללי', icon: Bot },
];

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeType, setActiveType] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [activeCategory, activeType]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (activeType !== 'all') params.set('type', activeType);
      
      const res = await api.get(`/templates?${params}`);
      setTemplates(res.data.templates || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (template) => {
    try {
      setInstalling(true);
      const res = await api.post(`/templates/${template.id}/install`, {
        botName: `${template.name} (עותק)`
      });
      
      alert('התבנית הותקנה בהצלחה!');
      navigate(`/bots/${res.data.bot.id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהתקנת התבנית');
    } finally {
      setInstalling(false);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            ← חזרה
          </Button>
          <Logo />
          <Button variant="ghost" onClick={() => { logout(); navigate('/login'); }}>
            התנתק
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">גלריית תבניות</h1>
            <p className="text-gray-500 text-sm mt-1">התקן בוטים מוכנים בלחיצה אחת</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש תבנית..."
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-200 outline-none"
              />
            </div>
            
            {/* Type filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveType('all')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeType === 'all' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setActiveType('system')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeType === 'system' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ⭐ רשמיות
              </button>
              <button
                onClick={() => setActiveType('community')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeType === 'community' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                👥 קהילה
              </button>
            </div>
          </div>
          
          {/* Categories */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {categories.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat.id 
                      ? 'bg-gray-800 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-500">טוען תבניות...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bot className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-1">אין תבניות</h3>
            <p className="text-gray-500">נסה לשנות את הפילטרים או חפש משהו אחר</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={() => setSelectedTemplate(template)}
                onInstall={() => handleInstall(template)}
              />
            ))}
          </div>
        )}

        {/* Preview Modal */}
        {selectedTemplate && (
          <TemplatePreviewModal
            template={selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
            onInstall={() => handleInstall(selectedTemplate)}
            installing={installing}
          />
        )}
      </main>
    </div>
  );
}

// Template Card Component
function TemplateCard({ template, onPreview, onInstall }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Header */}
      <div className={`h-32 flex items-center justify-center ${
        template.type === 'system' 
          ? 'bg-gradient-to-br from-purple-500 to-indigo-600' 
          : 'bg-gradient-to-br from-blue-500 to-cyan-600'
      }`}>
        <Bot className="w-12 h-12 text-white/80" />
      </div>
      
      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-800">{template.name}</h3>
          {template.type === 'system' && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">רשמי</span>
          )}
        </div>
        
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {template.description || 'ללא תיאור'}
        </p>
        
        <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
          <span className="flex items-center gap-1">
            <Download className="w-3 h-3" />
            {template.installs_count || 0} התקנות
          </span>
          <span>{template.category}</span>
        </div>
        
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onPreview} className="flex-1 !rounded-xl !py-2">
            <Eye className="w-4 h-4 ml-1" />
            תצוגה
          </Button>
          <Button onClick={onInstall} className="flex-1 !rounded-xl !py-2">
            <Download className="w-4 h-4 ml-1" />
            התקן
          </Button>
        </div>
      </div>
    </div>
  );
}

// Template Preview Modal
function TemplatePreviewModal({ template, onClose, onInstall, installing }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className={`h-40 flex items-center justify-center relative ${
          template.type === 'system' 
            ? 'bg-gradient-to-br from-purple-500 to-indigo-600' 
            : 'bg-gradient-to-br from-blue-500 to-cyan-600'
        }`}>
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <Bot className="w-16 h-16 text-white/80" />
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{template.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {template.type === 'system' ? 'תבנית רשמית' : `נוצר על ידי ${template.creator_name || 'משתמש'}`}
              </p>
            </div>
            {template.type === 'system' && (
              <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full">⭐ רשמי</span>
            )}
          </div>
          
          <p className="text-gray-600 mb-6">
            {template.description || 'ללא תיאור'}
          </p>
          
          <div className="flex items-center gap-6 text-sm text-gray-500 mb-6">
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              {template.installs_count || 0} התקנות
            </span>
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {new Date(template.created_at).toLocaleDateString('he-IL')}
            </span>
          </div>
          
          {/* Tags */}
          {template.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {template.tags.map((tag, i) => (
                <span key={i} className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}
          
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} className="flex-1 !rounded-xl">
              ביטול
            </Button>
            <Button onClick={onInstall} disabled={installing} className="flex-1 !rounded-xl">
              {installing ? (
                <>טוען...</>
              ) : (
                <>
                  <Download className="w-4 h-4 ml-2" />
                  התקן תבנית
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
