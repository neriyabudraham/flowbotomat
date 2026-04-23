import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UserPlus, Sparkles, Check, MessageSquare, Cloud,
  Link2, Users, Crown, QrCode,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';

const FEATURES = [
  { icon: Link2,         title: 'קישור WhatsApp אישי', description: 'קישור wa.me/message ייחודי שמכניס את הטקסט אוטומטית לכל לקוח שלוחץ' },
  { icon: UserPlus,      title: 'שליחת כרטיס איש קשר',  description: 'הבוט שולח את איש הקשר שלך לשמירה מיד אחרי ההודעה הראשונה' },
  { icon: MessageSquare, title: 'רצף הודעות דינאמי',     description: 'עד 3 הודעות משלך — טקסט, תמונה, סרטון, שמע או קובץ — בסדר שתבחר' },
  { icon: Cloud,         title: 'סנכרון Google Contacts', description: 'כל מי שמצטרף נוסף אוטומטית לאנשי הקשר שלך עם תווית "שמירת אנשי קשר"' },
  { icon: Users,         title: 'עד 500 אנשים בחודש',    description: 'כלול בתמחור החודשי. מעבר לזה — 8 ₪ לכל 100 אנשים נוספים' },
  { icon: QrCode,        title: 'גם QR להדפסה',          description: 'מלבד הקישור, מקבלים גם QR לשיתוף בדפוס ובפוסטים' },
];

export default function SaveContactBotLandingPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [bundledFrom, setBundledFrom] = useState(null);
  const [servicePrice, setServicePrice] = useState(49);

  useEffect(() => { checkAccess(); }, []);

  useEffect(() => {
    if (!loading && hasAccess) navigate('/save-contact-bot/dashboard', { replace: true });
  }, [loading, hasAccess]);

  async function checkAccess() {
    const token = localStorage.getItem('accessToken');
    // Auth-only checks (skipped silently for non-logged-in visitors).
    if (token) {
      try { await fetchMe(); } catch {}
      try {
        const { data } = await api.get('/services/access/save-contact-bot');
        if (data.hasAccess) {
          setHasAccess(true);
          setBundledFrom(data.bundledFrom || null);
        }
      } catch {}
    }
    // Public service info — fetched for everyone.
    try {
      const { data } = await api.get('/services');
      const svc = (data.services || []).find((s) => s.slug === 'save-contact-bot');
      if (svc) setServicePrice(Number(svc.price) || 49);
    } catch {}
    setLoading(false);
  }

  function handleGetStarted() {
    if (!user) {
      navigate('/login?redirect=/save-contact-bot/subscribe');
    } else if (hasAccess) {
      navigate('/save-contact-bot/dashboard');
    } else {
      navigate('/save-contact-bot/subscribe');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/40" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="h-8 w-px bg-gray-200" />
              <span className="text-lg font-bold text-gray-800">בוט שמירת איש קשר</span>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <Link to="/dashboard" className="text-gray-500 hover:text-gray-700">דשבורד</Link>
                  {hasAccess && (
                    <button onClick={() => navigate('/save-contact-bot/dashboard')}
                      className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl font-medium hover:shadow">
                      כניסה לשירות
                    </button>
                  )}
                </>
              ) : (
                <Link to="/login?redirect=/save-contact-bot"
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl font-medium hover:shadow">
                  התחברות
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-16 px-6">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-600/10 via-emerald-500/10 to-cyan-500/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="max-w-5xl mx-auto relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-100 text-teal-700 rounded-full text-sm font-medium mb-5">
              <Sparkles className="w-4 h-4" />
              חדש ב-Botomat
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-5">
              הוספה של אנשי קשר
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">
                לסטטוס שלך — אוטומטית
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              תן לחברים ולקוחות קישור קצר אחד ב-WhatsApp. כל מי שלוחץ — הבוט שולח לו את איש הקשר שלך, כל הפרטים שתרצה, ומוסיף אותו אוטומטית לאנשי הקשר שלך ב-Google.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={handleGetStarted}
                className="px-8 py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-lg font-bold rounded-2xl hover:shadow-xl transition-all hover:scale-105">
                {hasAccess ? 'כניסה לשירות' : 'התחל עכשיו'}
              </button>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-3xl font-bold text-gray-900">₪{servicePrice}</span>
                <span>/חודש</span>
              </div>
            </div>

            {bundledFrom === 'status-bot' && (
              <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 text-green-800 rounded-full text-sm">
                <Check className="w-4 h-4" />
                כבר מחובר אצלך דרך מנוי <b>בוט העלאת סטטוסים</b> — בלי עלות נוספת
              </div>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="py-16 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">מה כלול במודול?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={i} className="bg-white border border-gray-100 rounded-3xl p-6 hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm mb-4">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1.5">{f.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{f.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-16 px-6 bg-gradient-to-r from-teal-50 via-white to-emerald-50 border-t border-teal-100">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">תמחור פשוט</h2>
            <p className="text-gray-600 max-w-2xl mx-auto mb-10">
              <b>₪{servicePrice} לחודש</b> — כולל עד 500 אנשים ייחודיים בחודש. מעבר לזה — <b>8 ₪ לכל 100 אנשים נוספים</b> (נגבה בחשבונית הבאה). בלי הפתעות, אפשר לבטל מתי שרוצים.
            </p>

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <PricePlan
                title="מנוי חודשי"
                price={`₪${servicePrice}`}
                subtitle="לחודש · כולל 500 אנשים"
                features={[
                  'קישור WhatsApp אישי + QR',
                  'עד 3 הודעות משלך ברצף',
                  'סנכרון Google Contacts',
                  '500 אנשים בחודש כלולים',
                ]}
                cta="התחל עכשיו"
                highlighted={false}
                onClick={handleGetStarted}
              />
              <PricePlan
                title="יש לך מנוי לבוט סטטוסים?"
                price="ללא עלות"
                subtitle="כלול במנוי הקיים שלך"
                features={[
                  'כל היכולות של המנוי החודשי',
                  'בלי חיוב נוסף',
                  'הפעלה מיידית — בלי סליקה',
                  'עדיין חל התמחור של 8 ₪ לכל 100 אנשים מעבר ל-500',
                ]}
                cta={hasAccess ? 'כניסה לשירות' : 'לצפייה בתנאי המנוי'}
                highlighted={true}
                onClick={handleGetStarted}
              />
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="py-12 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <button onClick={handleGetStarted}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-lg font-bold rounded-2xl hover:shadow-xl transition-all hover:scale-105">
              <Crown className="w-5 h-5" />
              {hasAccess ? 'כניסה לשירות' : 'התחל עכשיו'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function PricePlan({ title, price, subtitle, features, cta, highlighted, onClick }) {
  return (
    <div className={`rounded-3xl p-6 text-right ${highlighted ? 'bg-gradient-to-br from-teal-600 to-emerald-700 text-white shadow-xl' : 'bg-white border border-gray-200 text-gray-900'}`}>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <div className="flex items-baseline gap-1 mb-1">
        <span className={`text-4xl font-bold ${highlighted ? 'text-white' : 'text-gray-900'}`}>{price}</span>
      </div>
      <p className={`text-sm mb-5 ${highlighted ? 'text-white/80' : 'text-gray-500'}`}>{subtitle}</p>
      <ul className="space-y-2 mb-6">
        {features.map((f, i) => (
          <li key={i} className={`flex items-start gap-2 text-sm ${highlighted ? 'text-white/90' : 'text-gray-700'}`}>
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${highlighted ? 'text-white' : 'text-teal-600'}`} /> {f}
          </li>
        ))}
      </ul>
      <button onClick={onClick}
        className={`w-full py-3 rounded-xl font-semibold ${highlighted ? 'bg-white text-teal-700 hover:bg-teal-50' : 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:shadow'}`}>
        {cta}
      </button>
    </div>
  );
}
