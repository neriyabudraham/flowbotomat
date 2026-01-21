import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Grid, Search, ArrowRight, Bot, Zap, Users, Star, Crown,
  TrendingUp, Headphones, Calendar, ShoppingBag, Megaphone,
  ChevronLeft, Play, Check, X, Sparkles
} from 'lucide-react';
import api from '../services/api';
import Logo from '../components/atoms/Logo';

const CATEGORY_ICONS = {
  general: Grid,
  sales: TrendingUp,
  support: Headphones,
  marketing: Megaphone,
  booking: Calendar,
  ecommerce: ShoppingBag,
};

const CATEGORY_COLORS = {
  general: 'gray',
  sales: 'green',
  support: 'blue',
  marketing: 'purple',
  booking: 'orange',
  ecommerce: 'pink',
};

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newBotName, setNewBotName] = useState('');

  useEffect(() => {
    loadData();
  }, [selectedCategory, search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        api.get('/templates', { 
          params: { 
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            search: search || undefined
          }
        }),
        api.get('/templates/categories')
      ]);
      setTemplates(templatesRes.data.templates || []);
      setCategories(categoriesRes.data.categories || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async () => {
    if (!selectedTemplate || !newBotName.trim()) return;
    
    setCreating(true);
    try {
      const { data } = await api.post(`/templates/${selectedTemplate.id}/use`, {
        name: newBotName.trim()
      });
      // Navigate to bot editor with state indicating it's a new bot from template
      navigate(`/bots/${data.bot.id}`, { state: { fromTemplate: true, showSave: true } });
    } catch (err) {
      if (err.response?.data?.upgrade_required) {
        alert('תבנית זו זמינה למנויים בלבד. שדרג את החשבון שלך כדי להשתמש בה.');
      } else {
        alert(err.response?.data?.error || 'שגיאה ביצירת בוט מתבנית');
      }
    } finally {
      setCreating(false);
    }
  };

  const openTemplate = (template) => {
    setSelectedTemplate(template);
    setNewBotName(template.name_he || template.name);
  };

  const featuredTemplates = templates.filter(t => t.is_featured);
  const regularTemplates = templates.filter(t => !t.is_featured);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowRight className="w-5 h-5" />
            <span className="hidden sm:inline">חזרה</span>
          </button>
          <Logo />
          <div className="w-20" /> {/* Spacer */}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            גלריית תבניות
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            התחל מתבנית מוכנה
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            בחר תבנית, התאם אותה לצרכים שלך, והפעל את הבוט בדקות
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש תבניות..."
              className="w-full pr-10 pl-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              הכל
            </button>
            {categories.map(cat => {
              const Icon = CATEGORY_ICONS[cat.name] || Grid;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-colors ${
                    selectedCategory === cat.name
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.name_he}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">טוען תבניות...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Grid className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">אין תבניות זמינות</h3>
            <p className="text-gray-500">נסה לשנות את הקטגוריה או החיפוש</p>
          </div>
        ) : (
          <>
            {/* Featured Templates */}
            {featuredTemplates.length > 0 && (
              <div className="mb-10">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  תבניות מומלצות
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuredTemplates.map(template => (
                    <TemplateCard 
                      key={template.id} 
                      template={template} 
                      featured
                      onClick={() => openTemplate(template)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Templates */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {selectedCategory === 'all' ? 'כל התבניות' : categories.find(c => c.name === selectedCategory)?.name_he}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {regularTemplates.map(template => (
                  <TemplateCard 
                    key={template.id} 
                    template={template}
                    onClick={() => openTemplate(template)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Template Preview Modal */}
      {selectedTemplate && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTemplate(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Template Header */}
            <div className="relative p-6 bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <button 
                onClick={() => setSelectedTemplate(null)}
                className="absolute top-4 left-4 p-1 hover:bg-white/20 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Bot className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">
                    {selectedTemplate.name_he || selectedTemplate.name}
                  </h3>
                  <div className="flex items-center gap-3 text-white/80 text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {selectedTemplate.use_count || 0} שימושים
                    </span>
                    {selectedTemplate.is_premium && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-400/20 rounded-full">
                        <Crown className="w-3 h-3" />
                        פרימיום
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Template Content */}
            <div className="p-6 space-y-6">
              {/* Description */}
              {(selectedTemplate.description_he || selectedTemplate.description) && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">תיאור</h4>
                  <p className="text-gray-600">
                    {selectedTemplate.description_he || selectedTemplate.description}
                  </p>
                </div>
              )}

              {/* Category & Tags */}
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.category && (
                  <span className={`px-3 py-1 bg-${CATEGORY_COLORS[selectedTemplate.category] || 'gray'}-100 text-${CATEGORY_COLORS[selectedTemplate.category] || 'gray'}-700 rounded-full text-sm`}>
                    {categories.find(c => c.name === selectedTemplate.category)?.name_he || selectedTemplate.category}
                  </span>
                )}
                {selectedTemplate.tags?.map((tag, i) => (
                  <span key={i} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Bot Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  שם הבוט שלך
                </label>
                <input
                  type="text"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="הזן שם לבוט..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
                >
                  ביטול
                </button>
                <button
                  onClick={handleUseTemplate}
                  disabled={creating || !newBotName.trim()}
                  className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creating ? (
                    'יוצר...'
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      צור בוט
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, featured, onClick }) {
  const Icon = CATEGORY_ICONS[template.category] || Grid;
  const color = CATEGORY_COLORS[template.category] || 'gray';
  
  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl border cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 ${
        featured 
          ? 'border-purple-200 hover:border-purple-300' 
          : 'border-gray-100 hover:border-purple-200'
      }`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-12 h-12 rounded-xl bg-${color}-100 flex items-center justify-center`}>
            <Bot className={`w-6 h-6 text-${color}-600`} />
          </div>
          {template.is_featured && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">
              <Star className="w-3 h-3" />
              מומלץ
            </span>
          )}
          {template.is_premium && !template.is_featured && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
              <Crown className="w-3 h-3" />
              פרימיום
            </span>
          )}
        </div>
        
        <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">
          {template.name_he || template.name}
        </h3>
        
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {template.description_he || template.description || 'ללא תיאור'}
        </p>
        
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {template.use_count || 0}
          </span>
          <span className={`px-2 py-0.5 bg-${color}-50 text-${color}-600 rounded-full`}>
            {template.category}
          </span>
        </div>
      </div>
    </div>
  );
}
