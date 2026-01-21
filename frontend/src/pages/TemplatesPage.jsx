import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Grid, Search, ArrowLeft, Bot, Zap, Users, Star, Crown,
  TrendingUp, Headphones, Calendar, ShoppingBag, Megaphone,
  Play, Check, X, Sparkles, Upload, Clock, Filter,
  ChevronDown, Heart, Download, Eye, MessageSquare, Plus,
  AlertCircle, CheckCircle, XCircle, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import Logo from '../components/atoms/Logo';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import useAuthStore from '../store/authStore';

const CATEGORY_ICONS = {
  general: Grid,
  sales: TrendingUp,
  support: Headphones,
  marketing: Megaphone,
  booking: Calendar,
  ecommerce: ShoppingBag,
};

const CATEGORY_COLORS = {
  general: { bg: 'gray-100', text: 'gray-700', gradient: 'from-gray-500 to-slate-500' },
  sales: { bg: 'green-100', text: 'green-700', gradient: 'from-green-500 to-emerald-500' },
  support: { bg: 'blue-100', text: 'blue-700', gradient: 'from-blue-500 to-cyan-500' },
  marketing: { bg: 'purple-100', text: 'purple-700', gradient: 'from-purple-500 to-pink-500' },
  booking: { bg: 'orange-100', text: 'orange-700', gradient: 'from-orange-500 to-amber-500' },
  ecommerce: { bg: 'pink-100', text: 'pink-700', gradient: 'from-pink-500 to-rose-500' },
};

const SORT_OPTIONS = [
  { id: 'featured', label: 'מומלצות' },
  { id: 'popular', label: 'פופולריות' },
  { id: 'rating', label: 'דירוג גבוה' },
  { id: 'newest', label: 'חדשות' },
];

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [templates, setTemplates] = useState([]);
  const [myTemplates, setMyTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('featured');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [activeTab, setActiveTab] = useState('browse'); // browse | my-templates | submit
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [userBots, setUserBots] = useState([]);
  const [submitData, setSubmitData] = useState({ botId: '', name: '', name_he: '', description: '', description_he: '', category: 'general' });
  const [submitting, setSubmitting] = useState(false);
  const [userRatings, setUserRatings] = useState({});

  useEffect(() => {
    loadData();
  }, [selectedCategory, search, sortBy]);

  useEffect(() => {
    if (activeTab === 'my-templates') {
      loadMyTemplates();
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        api.get('/templates', { 
          params: { 
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            search: search || undefined,
            sort: sortBy
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

  const loadMyTemplates = async () => {
    try {
      const { data } = await api.get('/templates/my-templates');
      setMyTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to load my templates:', err);
    }
  };

  const loadUserBots = async () => {
    try {
      const { data } = await api.get('/bots');
      setUserBots(data.bots || []);
    } catch (err) {
      console.error('Failed to load bots:', err);
    }
  };

  const handleUseTemplate = async () => {
    if (!selectedTemplate || !newBotName.trim()) return;
    
    setCreating(true);
    try {
      const { data } = await api.post(`/templates/${selectedTemplate.id}/use`, {
        name: newBotName.trim()
      });
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

  const handleRateTemplate = async (templateId, rating) => {
    try {
      const { data } = await api.post(`/templates/${templateId}/rate`, { rating });
      setUserRatings(prev => ({ ...prev, [templateId]: rating }));
      // Update template in list
      setTemplates(prev => prev.map(t => 
        t.id === templateId ? { ...t, rating: data.rating, rating_count: data.count } : t
      ));
    } catch (err) {
      console.error('Failed to rate template:', err);
    }
  };

  const handleSubmitTemplate = async (e) => {
    e.preventDefault();
    if (!submitData.botId || !submitData.name) return;
    
    setSubmitting(true);
    try {
      await api.post('/templates/submit', submitData);
      setShowSubmitModal(false);
      setSubmitData({ botId: '', name: '', name_he: '', description: '', description_he: '', category: 'general' });
      setActiveTab('my-templates');
      loadMyTemplates();
      alert('התבנית הוגשה בהצלחה! היא תיבדק על ידי צוות האתר.');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהגשת תבנית');
    } finally {
      setSubmitting(false);
    }
  };

  const openSubmitModal = () => {
    loadUserBots();
    setShowSubmitModal(true);
  };

  const openTemplate = async (template) => {
    setSelectedTemplate(template);
    setNewBotName(template.name_he || template.name);
    
    // Load user's rating for this template
    try {
      const { data } = await api.get(`/templates/${template.id}/my-rating`);
      if (data.rating) {
        setUserRatings(prev => ({ ...prev, [template.id]: data.rating }));
      }
    } catch (err) {}
  };

  const featuredTemplates = templates.filter(t => t.is_featured);
  const regularTemplates = templates.filter(t => !t.is_featured);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50" dir="rtl">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
            
            <div className="flex items-center gap-3">
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">גלריית תבניות</h1>
                    <p className="text-white/70">בחר תבנית, התאם אותה לצרכים שלך, והפעל את הבוט בדקות</p>
                  </div>
                </div>
                
                {/* Quick Stats */}
                <div className="flex items-center gap-6 mt-6">
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Grid className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{templates.length}</div>
                      <div className="text-xs text-white/60">תבניות</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-yellow-400/30 rounded-lg">
                      <Star className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{featuredTemplates.length}</div>
                      <div className="text-xs text-white/60">מומלצות</div>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{templates.reduce((acc, t) => acc + (t.use_count || 0), 0)}</div>
                      <div className="text-xs text-white/60">שימושים</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <button
                onClick={openSubmitModal}
                className="flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <Upload className="w-5 h-5" />
                פרסם תבנית
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl w-fit mb-6">
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
              activeTab === 'browse' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Grid className="w-4 h-4" />
            עיין בתבניות
          </button>
          <button
            onClick={() => setActiveTab('my-templates')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
              activeTab === 'my-templates' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Upload className="w-4 h-4" />
            התבניות שלי
            {myTemplates.length > 0 && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full text-xs">
                {myTemplates.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'browse' ? (
          <>
            {/* Search & Filter */}
            <div className="flex flex-col lg:flex-row gap-4 mb-8">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש תבניות..."
                  className="w-full pr-12 pl-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                />
              </div>
              
              <div className="flex gap-3">
                {/* Sort Dropdown */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none px-4 py-3.5 pr-10 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all cursor-pointer"
                  >
                    {SORT_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl whitespace-nowrap transition-all font-medium ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <Grid className="w-4 h-4" />
                הכל
              </button>
              {categories.map(cat => {
                const Icon = CATEGORY_ICONS[cat.name] || Grid;
                const colors = CATEGORY_COLORS[cat.name] || CATEGORY_COLORS.general;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl whitespace-nowrap transition-all font-medium ${
                      selectedCategory === cat.name
                        ? `bg-gradient-to-r ${colors.gradient} text-white shadow-lg`
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cat.name_he}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">טוען תבניות...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-24 h-24 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Grid className="w-12 h-12 text-purple-400" />
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
                          categories={categories}
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
                        categories={categories}
                        onClick={() => openTemplate(template)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          /* My Templates Tab */
          <div>
            {myTemplates.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-24 h-24 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-12 h-12 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">עוד לא פרסמת תבניות</h3>
                <p className="text-gray-500 mb-6">שתף את הבוטים שלך עם הקהילה!</p>
                <button
                  onClick={openSubmitModal}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" />
                  פרסם תבנית ראשונה
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {myTemplates.map(template => (
                  <div key={template.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-xl flex items-center justify-center">
                        <Bot className="w-7 h-7 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{template.name_he || template.name}</h3>
                        <p className="text-sm text-gray-500">{template.description_he || template.description || 'ללא תיאור'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Status Badge */}
                      <StatusBadge status={template.status} />
                      
                      {/* Stats */}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          {template.use_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          {template.rating?.toFixed(1) || '0.0'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Template Preview Modal */}
      {selectedTemplate && (
        <TemplatePreviewModal
          template={selectedTemplate}
          categories={categories}
          newBotName={newBotName}
          setNewBotName={setNewBotName}
          creating={creating}
          userRating={userRatings[selectedTemplate.id]}
          onRate={(rating) => handleRateTemplate(selectedTemplate.id, rating)}
          onUse={handleUseTemplate}
          onClose={() => setSelectedTemplate(null)}
        />
      )}

      {/* Submit Template Modal */}
      {showSubmitModal && (
        <SubmitTemplateModal
          userBots={userBots}
          categories={categories}
          submitData={submitData}
          setSubmitData={setSubmitData}
          submitting={submitting}
          onSubmit={handleSubmitTemplate}
          onClose={() => setShowSubmitModal(false)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const statusConfig = {
    pending: { icon: Clock, label: 'ממתין לאישור', bg: 'bg-yellow-100', text: 'text-yellow-700' },
    approved: { icon: CheckCircle, label: 'מאושר', bg: 'bg-green-100', text: 'text-green-700' },
    rejected: { icon: XCircle, label: 'נדחה', bg: 'bg-red-100', text: 'text-red-700' },
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  
  return (
    <span className={`flex items-center gap-1.5 px-3 py-1.5 ${config.bg} ${config.text} rounded-full text-sm font-medium`}>
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

function TemplateCard({ template, featured, categories, onClick }) {
  const Icon = CATEGORY_ICONS[template.category] || Grid;
  const colors = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general;
  
  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl border cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 ${
        featured 
          ? 'border-purple-200 hover:border-purple-300' 
          : 'border-gray-100 hover:border-purple-200'
      }`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg`}>
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2">
            {template.is_featured && (
              <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium">
                <Star className="w-3 h-3" />
                מומלץ
              </span>
            )}
            {template.is_premium && !template.is_featured && (
              <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
                <Crown className="w-3 h-3" />
                פרימיום
              </span>
            )}
          </div>
        </div>
        
        <h3 className="font-bold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">
          {template.name_he || template.name}
        </h3>
        
        <p className="text-sm text-gray-500 line-clamp-2 mb-4 min-h-[40px]">
          {template.description_he || template.description || 'ללא תיאור'}
        </p>
        
        {/* Rating */}
        <div className="flex items-center gap-1 mb-3">
          {[1, 2, 3, 4, 5].map(star => (
            <Star 
              key={star} 
              className={`w-4 h-4 ${star <= Math.round(template.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
            />
          ))}
          <span className="text-sm text-gray-500 mr-1">
            ({template.rating_count || 0})
          </span>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-100">
          <span className="flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />
            {template.use_count || 0} שימושים
          </span>
          <span className={`px-2.5 py-1 bg-${colors.bg} text-${colors.text} rounded-lg font-medium`}>
            {categories.find(c => c.name === template.category)?.name_he || template.category}
          </span>
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewModal({ template, categories, newBotName, setNewBotName, creating, userRating, onRate, onUse, onClose }) {
  const colors = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general;
  
  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative p-6 bg-gradient-to-br ${colors.gradient} text-white rounded-t-3xl`}>
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-1">
                {template.name_he || template.name}
              </h3>
              <div className="flex items-center gap-3 text-white/80 text-sm">
                <span className="flex items-center gap-1">
                  <Download className="w-4 h-4" />
                  {template.use_count || 0} שימושים
                </span>
                {template.is_premium && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-400/20 rounded-full">
                    <Crown className="w-3 h-3" />
                    פרימיום
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          {(template.description_he || template.description) && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">תיאור</h4>
              <p className="text-gray-600">
                {template.description_he || template.description}
              </p>
            </div>
          )}

          {/* Rating Section */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <h4 className="font-semibold text-gray-900 mb-3">דרג את התבנית</h4>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => onRate(star)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star 
                    className={`w-8 h-8 transition-colors ${
                      star <= (userRating || 0) 
                        ? 'text-yellow-400 fill-yellow-400' 
                        : 'text-gray-300 hover:text-yellow-300'
                    }`} 
                  />
                </button>
              ))}
              <span className="text-sm text-gray-500 mr-3">
                {template.rating?.toFixed(1) || '0.0'} ({template.rating_count || 0} דירוגים)
              </span>
            </div>
          </div>

          {/* Category & Tags */}
          <div className="flex flex-wrap gap-2">
            {template.category && (
              <span className={`px-3 py-1.5 bg-${CATEGORY_COLORS[template.category]?.bg || 'gray-100'} text-${CATEGORY_COLORS[template.category]?.text || 'gray-700'} rounded-xl text-sm font-medium`}>
                {categories.find(c => c.name === template.category)?.name_he || template.category}
              </span>
            )}
            {template.tags?.map((tag, i) => (
              <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-sm">
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
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={onUse}
              disabled={creating || !newBotName.trim()}
              className={`flex-1 px-4 py-3 bg-gradient-to-r ${colors.gradient} text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg transition-all`}
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
  );
}

function SubmitTemplateModal({ userBots, categories, submitData, setSubmitData, submitting, onSubmit, onClose }) {
  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-t-3xl">
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">פרסום תבנית</h3>
              <p className="text-white/70 text-sm">שתף את הבוט שלך עם הקהילה</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={onSubmit} className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              התבנית תעבור בדיקה על ידי צוות האתר לפני פרסום. תקבל הודעה כשהיא תאושר.
            </p>
          </div>

          {/* Select Bot */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              בחר בוט לפרסום
            </label>
            <select
              value={submitData.botId}
              onChange={(e) => {
                const bot = userBots.find(b => b.id === e.target.value);
                setSubmitData({ 
                  ...submitData, 
                  botId: e.target.value,
                  name: bot?.name || '',
                  description: bot?.description || ''
                });
              }}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
              required
            >
              <option value="">בחר בוט...</option>
              {userBots.map(bot => (
                <option key={bot.id} value={bot.id}>{bot.name}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                שם (אנגלית)
              </label>
              <input
                type="text"
                value={submitData.name}
                onChange={(e) => setSubmitData({ ...submitData, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                required
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                שם (עברית)
              </label>
              <input
                type="text"
                value={submitData.name_he}
                onChange={(e) => setSubmitData({ ...submitData, name_he: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              תיאור (עברית)
            </label>
            <textarea
              value={submitData.description_he}
              onChange={(e) => setSubmitData({ ...submitData, description_he: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all resize-none"
              placeholder="תאר את התבנית ומה היא עושה..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              קטגוריה
            </label>
            <select
              value={submitData.category}
              onChange={(e) => setSubmitData({ ...submitData, category: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name_he}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={submitting || !submitData.botId || !submitData.name}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg transition-all"
            >
              {submitting ? (
                'שולח...'
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  שלח לאישור
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
