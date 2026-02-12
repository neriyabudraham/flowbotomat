import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Smartphone, Upload, Clock, Users, Shield, Zap, 
  Check, ArrowLeft, Star, MessageCircle, Eye, Heart,
  Play, ChevronLeft, Sparkles
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';

const FEATURES = [
  {
    icon: Upload,
    title: 'העלאה קלה',
    description: 'העלה סטטוסים בקליק אחד - טקסט, תמונות, סרטונים ושמע',
    color: 'from-blue-500 to-indigo-600'
  },
  {
    icon: MessageCircle,
    title: 'שליחה מ-WhatsApp',
    description: 'שלח הודעה לבוט והסטטוס עולה אוטומטית',
    color: 'from-green-500 to-emerald-600'
  },
  {
    icon: Eye,
    title: 'מעקב צפיות',
    description: 'ראה מי צפה בסטטוסים שלך ומתי',
    color: 'from-purple-500 to-pink-600'
  },
  {
    icon: Heart,
    title: 'תגובות ולבבות',
    description: 'עקוב אחרי התגובות והלבבות על כל סטטוס',
    color: 'from-red-500 to-rose-600'
  },
  {
    icon: Users,
    title: 'מספרים מורשים',
    description: 'קבע מי יכול להעלות סטטוסים מהחשבון שלך',
    color: 'from-cyan-500 to-blue-600'
  },
  {
    icon: Clock,
    title: 'תור חכם',
    description: 'הסטטוסים יוצאים בהדרגה למניעת עומס',
    color: 'from-amber-500 to-orange-600'
  }
];

const BOT_NUMBER = '+972 53-923-2960';
const BOT_NAME = 'בוט העלאת סטטוסים בוטומט';

export default function StatusBotLandingPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [servicePrice, setServicePrice] = useState(250);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetchMe();
        
        // Check if user has subscription to status-bot service
        const { data } = await api.get('/services/access/status-bot');
        if (data.hasAccess) {
          setHasSubscription(true);
        }
      }

      // Get service price
      try {
        const { data: servicesData } = await api.get('/services');
        const statusBotService = servicesData.services?.find(s => s.slug === 'status-bot');
        if (statusBotService) {
          setServicePrice(statusBotService.price);
        }
      } catch (e) {}

    } catch (e) {
      console.error('Check access error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleGetStarted = () => {
    if (!user) {
      navigate('/login?redirect=/status-bot');
    } else if (hasSubscription) {
      navigate('/status-bot/dashboard');
    } else {
      navigate('/status-bot/subscribe');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="h-8 w-px bg-gray-200" />
              <span className="text-lg font-bold text-gray-800">בוט העלאת סטטוסים</span>
            </div>
            
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <Link
                    to="/dashboard"
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    דשבורד
                  </Link>
                  {hasSubscription && (
                    <button
                      onClick={() => navigate('/status-bot/dashboard')}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                    >
                      כניסה לשירות
                    </button>
                  )}
                </>
              ) : (
                <Link
                  to="/login?redirect=/status-bot"
                  className="px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                >
                  התחברות
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 px-6">
          <div className="absolute inset-0 bg-gradient-to-r from-green-600/10 via-emerald-500/10 to-teal-500/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-green-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                שירות חדש ב-Botomat
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
                העלה סטטוסים ל-WhatsApp
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-600">
                  בקליק אחד
                </span>
              </h1>
              
              <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
                נהל את הסטטוסים שלך מממשק אחד, עקוב אחרי צפיות ותגובות,
                והעלה סטטוסים גם דרך הודעת WhatsApp
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={handleGetStarted}
                  className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-2xl hover:shadow-xl transition-all hover:scale-105"
                >
                  {hasSubscription ? 'כניסה לשירות' : 'התחל עכשיו'}
                </button>
                
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-3xl font-bold text-gray-900">₪{servicePrice}</span>
                  <span>/חודש</span>
                </div>
              </div>
            </div>

            {/* Demo Preview */}
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="font-bold">לוח בקרה</h3>
                      <p className="text-white/70 text-sm">ניהול סטטוסים</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-gray-50">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <Upload className="w-4 h-4 text-green-600" />
                        </div>
                        <span className="font-medium text-gray-700">סטטוסים היום</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">12</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Eye className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="font-medium text-gray-700">צפיות</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">1,248</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                          <Heart className="w-4 h-4 text-red-600" />
                        </div>
                        <span className="font-medium text-gray-700">לבבות</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">89</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">כל מה שצריך לניהול סטטוסים</h2>
              <p className="text-gray-600 max-w-xl mx-auto">
                ממשק פשוט ונוח להעלאת סטטוסים, עם כל הכלים לניתוח והבנת הקהל שלך
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map((feature, index) => (
                <div 
                  key={index}
                  className="bg-gray-50 rounded-2xl p-6 hover:shadow-lg transition-shadow"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bot Info Section */}
        <section className="py-20 px-6 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-12 h-12 text-white" />
                </div>
                
                <div className="flex-1 text-center md:text-right">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{BOT_NAME}</h3>
                  <p className="text-gray-600 mb-4">
                    שלח הודעה, תמונה או סרטון לבוט - והסטטוס יעלה אוטומטית!
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="bg-gray-100 rounded-xl px-4 py-2 flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-gray-500" />
                      <span className="font-mono text-lg font-medium" dir="ltr">{BOT_NUMBER}</span>
                    </div>
                    
                    <a
                      href={`https://wa.me/972539232960?text=${encodeURIComponent('היי, אני רוצה להתחיל להשתמש בבוט הסטטוסים')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      שמור איש קשר
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">מוכן להתחיל?</h2>
            <p className="text-gray-600 mb-8 max-w-xl mx-auto">
              הצטרף עכשיו והתחל לנהל את הסטטוסים שלך בקלות ויעילות
            </p>
            
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-3xl p-8 text-white">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-right">
                  <h3 className="text-2xl font-bold mb-2">בוט העלאת סטטוסים</h3>
                  <ul className="space-y-2 text-white/90">
                    <li className="flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      העלאה ללא הגבלה
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      מעקב צפיות ותגובות
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      שליחה מ-WhatsApp
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      מספרים מורשים ללא הגבלה
                    </li>
                  </ul>
                </div>
                
                <div className="text-center">
                  <div className="text-5xl font-bold mb-2">₪{servicePrice}</div>
                  <p className="text-white/70 mb-4">לחודש</p>
                  <button
                    onClick={handleGetStarted}
                    className="px-8 py-3 bg-white text-green-600 font-bold rounded-xl hover:shadow-lg transition-all"
                  >
                    {hasSubscription ? 'כניסה לשירות' : user ? 'הרשמה לשירות' : 'התחבר והתחל'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-gray-400">בוט העלאת סטטוסים</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">עמוד הבית</Link>
            <Link to="/pricing" className="hover:text-white transition-colors">תמחור</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">פרטיות</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
