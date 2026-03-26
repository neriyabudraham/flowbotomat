import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, Loader2 } from 'lucide-react';
import api from '../services/api';
import Logo from '../components/atoms/Logo';
import SimpleMarkdown from '../components/atoms/SimpleMarkdown';

export default function RefundPolicyPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const { data } = await api.get('/legal/refund-policy');
      setPage(data);
    } catch (err) {
      console.error('Failed to load refund policy:', err);
      setPage({ title: 'מדיניות החזרים', content: '# מדיניות החזרים\n\nלא ניתן לטעון את מדיניות ההחזרים כרגע. אנא נסו שוב מאוחר יותר.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-sm font-medium mb-6">
            <Receipt className="w-4 h-4" />
            מסמך משפטי
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            מדיניות החזרים
          </h1>
          <p className="text-gray-600">
            מדיניות ההחזרים וביטולים של Botomat
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 md:p-12">
            <article className="max-w-none">
              <SimpleMarkdown content={page?.content || ''} />
            </article>
          </div>
        )}

        {/* Back Button */}
        <div className="text-center mt-8">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-all"
          >
            חזרה
          </button>
        </div>
      </main>
    </div>
  );
}
