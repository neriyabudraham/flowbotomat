import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Users, TrendingUp, Download, Smartphone, Shield, ChevronRight, CheckCircle, Star, ArrowLeft } from 'lucide-react';
import Logo from '../../components/atoms/Logo';
import NotificationsDropdown from '../../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../../components/AccountSwitcher';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';

export default function ViewFilterLandingPage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isRenewal, setIsRenewal] = useState(false);
  const [renewalPrice, setRenewalPrice] = useState(null);

  useEffect(() => {
    loadServiceInfo();
  }, []);

  async function loadServiceInfo() {
    try {
      const token = localStorage.getItem('accessToken');

      // Load service details
      const servicesRes = await api.get('/services');
      const svc = servicesRes.data.find(s => s.slug === 'view-filter-bot');
      setService(svc);

      if (token) {
        // Check subscription access
        try {
          const accessRes = await api.get('/services/access/view-filter-bot');
          if (accessRes.data.hasAccess) {
            setHasAccess(true);
          }
        } catch {}

        // Check renewal pricing
        try {
          const renewalRes = await api.get('/view-filter/renewal-info');
          setIsRenewal(renewalRes.data.isRenewal);
          setRenewalPrice(renewalRes.data.renewalPrice);
        } catch {}
      }
    } catch (err) {
      console.error('Error loading service info:', err);
    } finally {
      setLoading(false);
    }
  }

  const displayPrice = isRenewal && renewalPrice != null ? renewalPrice : service?.price;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-violet-50">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-purple-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="חזרה לדשבורד"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
            <div className="flex items-center gap-3">
              {hasAccess ? (
                <button
                  onClick={() => navigate('/view-filter/dashboard')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                >
                  <Eye className="w-4 h-4" />
                  כניסה לשירות
                </button>
              ) : (
                <button
                  onClick={() => navigate('/view-filter/subscribe')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                >
                  התחל עכשיו
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 rounded-full text-purple-700 text-sm font-medium mb-6">
          <Eye className="w-4 h-4" />
          שירות חדש — מעקב 90 יום
        </div>

        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          גלה מי באמת
          <span className="bg-gradient-to-r from-purple-500 to-violet-600 bg-clip-text text-transparent"> צופה בסטטוסים </span>
          שלך
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4 leading-relaxed">
          אם יש לכם הרבה אנשי קשר ורק מעט צפיות ואתם מתקשים להעלות סטטוסים —
          זו הדרך הבטוחה ביותר לוודא שאתם לא שומרים אנשי קשר מיותרים.
        </p>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10">
          המערכת עוקבת אחרי כל מי שצפה בסטטוסים שלך לאורך 90 יום, ומאפשרת לך לנקות ולסנכרן את רשימת אנשי הקשר שלך רק למי שבאמת מתעניין.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {hasAccess ? (
            <button
              onClick={() => navigate('/view-filter/dashboard')}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all"
            >
              <Eye className="w-5 h-5" />
              פתח לוח בקרה
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/view-filter/subscribe')}
                className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all"
              >
                {isRenewal ? 'חדש מנוי' : 'התחל עכשיו'}
                <ChevronRight className="w-5 h-5" />
              </button>
              {displayPrice && (
                <div className="flex items-center justify-center gap-1 text-gray-600">
                  <span className="text-2xl font-bold text-purple-600">₪{displayPrice}</span>
                  <span className="text-sm">/ לתקופה</span>
                  {isRenewal && service?.price && renewalPrice < service.price && (
                    <span className="mr-2 text-sm line-through text-gray-400">₪{service.price}</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <TrendingUp className="w-7 h-7 text-purple-500" />,
              title: 'מעקב 90 יום אמיתי',
              desc: 'המערכת עוקבת אחרי כל צופה ייחודי לאורך 3 חודשים, ומציגה לך מי נוסף היום, השבוע ובסה"כ.'
            },
            {
              icon: <Users className="w-7 h-7 text-violet-500" />,
              title: 'רשימת צופים מפורטת',
              desc: 'ראה את כל הצופים עם אחוז הצפייה שלהם מסך הסטטוסים, תאריך ראשון ואחרון. סינון וחיפוש מלאים.'
            },
            {
              icon: <Eye className="w-7 h-7 text-indigo-500" />,
              title: 'זיהוי וי אפור',
              desc: 'מזהה אנשים שהגיבו (לב / תגובה) אך לא מופיעים ברשימת הצפיות — סימן לפרטיות מוסתרת.'
            },
            {
              icon: <Smartphone className="w-7 h-7 text-blue-500" />,
              title: 'סנכרון Google Contacts',
              desc: 'סנכרן את רשימת הצופים ישירות ל-Google Contacts שלך. תמיכה בכמה חשבונות במקביל.'
            },
            {
              icon: <Download className="w-7 h-7 text-emerald-500" />,
              title: 'הורדת דוח מלא',
              desc: 'בסוף 90 יום — הורד דוח CSV/VCF מלא עם כל הנתונים: צמיחה יומית, צפיות לסטטוס, ורשימת אנשי קשר.'
            },
            {
              icon: <Shield className="w-7 h-7 text-amber-500" />,
              title: 'פרטי ומאובטח',
              desc: 'הנתונים נשמרים אצלך בלבד. המערכת עובדת על אותם הנתונים של בוט הסטטוסים שלך.'
            },
          ].map((f, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-gray-100 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-10">איך זה עובד?</h2>
          <div className="space-y-6 text-right">
            {[
              { n: '1', t: 'מתחבר', d: 'קונה את השירות ולוחץ "התחל מעקב" — מתחיל תקופת 90 יום.' },
              { n: '2', t: 'המערכת עוקבת', d: 'בכל פעם שמישהו צופה בסטטוס שלך, המערכת מתעדת אותו אוטומטית.' },
              { n: '3', t: 'רואה נתונים', d: 'נכנס ללוח הבקרה ורואה מי צפה, כמה פעמים, מתי — עם גרף צמיחה יומי.' },
              { n: '4', t: 'מוריד ומנקה', d: 'בסוף 90 יום מוריד את רשימת הצופים ומסנכרן ל-Google Contacts.' },
            ].map((s, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white font-bold flex items-center justify-center flex-shrink-0">
                  {s.n}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{s.t}</h4>
                  <p className="text-gray-600 text-sm">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Included */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">מה כלול בשירות</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {[
            'מעקב צופים ייחודיים ל-90 יום',
            'סטטיסטיקות יומיות ושבועיות',
            'גרף צמיחת צופים',
            'פרופיל מפורט לכל צופה',
            'זיהוי וי אפור',
            'חיפוש וסינון הצופים',
            'הורדת רשימת אנשי קשר (VCF/CSV)',
            'דוח מלא של 90 יום',
            'סנכרון ל-Google Contacts',
            'תמיכה בכמה חשבונות Google',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100">
              <CheckCircle className="w-5 h-5 text-purple-500 flex-shrink-0" />
              <span className="text-gray-700 text-sm">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      {!hasAccess && (
        <section className="max-w-xl mx-auto px-6 pb-20 text-center">
          <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-3xl p-10 text-white">
            <Star className="w-10 h-10 mx-auto mb-4 opacity-80" />
            <h2 className="text-2xl font-bold mb-3">מוכן להתחיל?</h2>
            <p className="opacity-90 mb-6">90 יום של מידע אמיתי על מי מתעניין בתוכן שלך</p>
            <div className="text-4xl font-bold mb-1">
              ₪{displayPrice || service?.price}
              {isRenewal && service?.price && renewalPrice < service.price && (
                <span className="text-lg font-normal opacity-70 mr-2 line-through">₪{service.price}</span>
              )}
            </div>
            <div className="text-sm opacity-70 mb-6">לתקופה</div>
            <button
              onClick={() => navigate('/view-filter/subscribe')}
              className="w-full py-4 bg-white text-purple-600 rounded-2xl font-bold text-lg hover:bg-purple-50 transition-colors"
            >
              {isRenewal ? 'חדש מנוי בעלות מופחתת' : 'התחל עכשיו'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
