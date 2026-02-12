import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Check, ArrowLeft, CreditCard, Shield, Loader,
  Upload, Eye, Heart, Users, Smartphone
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';

const FEATURES = [
  'העלאה ללא הגבלה',
  'מעקב צפיות ותגובות בזמן אמת',
  'שליחה מ-WhatsApp',
  'מספרים מורשים ללא הגבלה',
  'תמיכה בטקסט, תמונות, וידאו ושמע',
  'צבעי רקע מותאמים אישית',
];

export default function StatusBotSubscribePage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [service, setService] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login?redirect=/status-bot/subscribe');
      return;
    }
    
    fetchMe();
    loadService();
  }, []);

  const loadService = async () => {
    try {
      // Check if already subscribed
      const { data: accessData } = await api.get('/services/access/status-bot');
      if (accessData.hasAccess) {
        navigate('/status-bot/dashboard');
        return;
      }

      // Get service details
      const { data: servicesData } = await api.get('/services');
      const statusBotService = servicesData.services?.find(s => s.slug === 'status-bot');
      
      if (!statusBotService) {
        // Service not found, might not be set up yet
        setService({
          price: 250,
          yearly_price: 2500,
          name_he: 'בוט העלאת סטטוסים'
        });
      } else {
        setService(statusBotService);
      }
    } catch (e) {
      console.error('Load service error:', e);
      // Default fallback
      setService({
        price: 250,
        yearly_price: 2500,
        name_he: 'בוט העלאת סטטוסים'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!service) return;
    
    setSubscribing(true);
    try {
      // First check if service exists in DB
      const { data: servicesData } = await api.get('/services');
      const statusBotService = servicesData.services?.find(s => s.slug === 'status-bot');
      
      if (!statusBotService) {
        // Service doesn't exist yet - redirect to contact or manual setup
        alert('השירות עדיין לא זמין להרשמה אוטומטית. אנא צור קשר.');
        return;
      }

      const { data } = await api.post(`/services/${statusBotService.id}/subscribe`, {
        billingPeriod
      });

      if (data.success) {
        navigate('/status-bot/dashboard');
      }
    } catch (err) {
      if (err.response?.data?.needsPaymentMethod) {
        // Redirect to add payment method
        navigate('/settings?tab=subscription&redirect=/status-bot/subscribe');
        return;
      }
      alert(err.response?.data?.error || 'שגיאה בהרשמה');
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const monthlyPrice = service?.price || 250;
  const yearlyPrice = service?.yearly_price || (monthlyPrice * 10);
  const yearlyDiscount = Math.round(100 - (yearlyPrice / (monthlyPrice * 12)) * 100);
  const currentPrice = billingPeriod === 'yearly' ? yearlyPrice : monthlyPrice;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="h-8 w-px bg-gray-200" />
              <span className="text-lg font-bold text-gray-800">הרשמה לבוט הסטטוסים</span>
            </div>
            
            <Link
              to="/status-bot"
              className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span>חזרה</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Features */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              בוט העלאת סטטוסים
            </h1>
            <p className="text-gray-600 mb-6">
              נהל את הסטטוסים שלך בקלות, עקוב אחרי צפיות ותגובות, והעלה סטטוסים גם דרך WhatsApp
            </p>

            <div className="space-y-3">
              {FEATURES.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-gray-700">{feature}</span>
                </div>
              ))}
            </div>

            {/* Security Note */}
            <div className="mt-8 p-4 bg-gray-50 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-800">תשלום מאובטח</p>
                <p className="text-sm text-gray-600">
                  התשלום מתבצע דרך המערכת המאובטחת של Botomat
                </p>
              </div>
            </div>
          </div>

          {/* Pricing Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">בחר את המסלול שלך</h2>
            
            {/* Billing Toggle */}
            <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl mb-6">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${
                  billingPeriod === 'monthly' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                חודשי
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${
                  billingPeriod === 'yearly' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                שנתי
                {yearlyDiscount > 0 && (
                  <span className="mr-1 text-green-600 text-xs">({yearlyDiscount}% הנחה)</span>
                )}
              </button>
            </div>

            {/* Price */}
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-gray-900">₪{currentPrice}</span>
                <span className="text-gray-500">/{billingPeriod === 'yearly' ? 'שנה' : 'חודש'}</span>
              </div>
              {billingPeriod === 'yearly' && (
                <p className="text-sm text-gray-500 mt-1">
                  ₪{Math.round(yearlyPrice / 12)} לחודש
                </p>
              )}
            </div>

            {/* User Info */}
            {user && (
              <div className="mb-6 p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">נרשם כ:</p>
                <p className="font-medium text-gray-800">{user.email}</p>
              </div>
            )}

            {/* Subscribe Button */}
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {subscribing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  מעבד...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  הרשם עכשיו
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              ניתן לבטל בכל עת דרך הגדרות החשבון
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
