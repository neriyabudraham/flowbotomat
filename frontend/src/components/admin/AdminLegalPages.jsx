import { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Eye, RefreshCw, Plus } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

const DEFAULT_PAGES = [
  { slug: 'terms', title: 'תנאי שימוש', route: '/terms' },
  { slug: 'refund-policy', title: 'מדיניות החזרים', route: '/refund-policy' },
];

export default function AdminLegalPages() {
  const [pages, setPages] = useState([]);
  const [activeSlug, setActiveSlug] = useState('terms');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    try {
      const { data } = await api.get('/admin/legal');
      setPages(data.pages || []);

      // Load the active page content
      const activePage = data.pages?.find(p => p.slug === activeSlug);
      if (activePage) {
        setContent(activePage.content);
        setTitle(activePage.title);
      }
    } catch (err) {
      console.error('Failed to load legal pages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPage = (slug) => {
    setActiveSlug(slug);
    const page = pages.find(p => p.slug === slug);
    if (page) {
      setContent(page.content);
      setTitle(page.title);
    } else {
      const def = DEFAULT_PAGES.find(p => p.slug === slug);
      setContent('');
      setTitle(def?.title || slug);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/legal/${activeSlug}`, { title, content });
      // Update local state
      setPages(prev => {
        const exists = prev.find(p => p.slug === activeSlug);
        if (exists) {
          return prev.map(p => p.slug === activeSlug ? { ...p, content, title, updated_at: new Date().toISOString() } : p);
        }
        return [...prev, { slug: activeSlug, title, content, updated_at: new Date().toISOString() }];
      });
      alert('הדף נשמר בהצלחה');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  const activePageDef = DEFAULT_PAGES.find(p => p.slug === activeSlug);
  const activePage = pages.find(p => p.slug === activeSlug);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">דפים משפטיים</h2>
        </div>
        <Button variant="ghost" onClick={loadPages} className="!p-2">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Page Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {DEFAULT_PAGES.map(page => (
          <button
            key={page.slug}
            onClick={() => handleSelectPage(page.slug)}
            className={`px-4 py-2 font-medium transition-colors ${
              activeSlug === page.slug
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 inline ml-2" />
            {page.title}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-gray-800">{activePageDef?.title || activeSlug}</h3>
            <p className="text-sm text-gray-500 mt-1">
              ערוך את התוכן בפורמט Markdown
            </p>
            {activePage?.updated_at && (
              <p className="text-xs text-gray-400 mt-1">
                עודכן לאחרונה: {new Date(activePage.updated_at).toLocaleDateString('he-IL', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>
          {activePageDef?.route && (
            <a
              href={activePageDef.route}
              target="_blank"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
              תצוגה מקדימה
            </a>
          )}
        </div>

        {/* Title field */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">כותרת הדף</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
            placeholder="כותרת הדף..."
            dir="rtl"
          />
        </div>

        {/* Content editor */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-[500px] px-4 py-3 border border-gray-200 rounded-xl font-mono text-sm resize-y"
          placeholder="# כותרת&#10;&#10;כתוב כאן את התוכן בפורמט Markdown..."
          dir="rtl"
        />

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-gray-400 space-y-1">
            <p>תומך בפורמט Markdown:</p>
            <p>כותרות: # כותרת ראשית, ## כותרת משנית, ### כותרת שלישית</p>
            <p>רשימות: - פריט | הדגשה: **טקסט מודגש** | נטוי: *טקסט נטוי*</p>
            <p>קישורים: [טקסט](כתובת) | קו הפרדה: ---</p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline ml-2" />
                שומר...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 inline ml-2" />
                שמור
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
