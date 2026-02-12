import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  Package, ArrowLeft, Check, Crown, Sparkles, ExternalLink,
  Clock, Gift, ChevronLeft, AlertCircle, X
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import api from '../services/api';

const SERVICE_ICONS = {
  'webhook': '🔗',
  'forms': '📝',
  'crm': '👥',
  'analytics': '📊',
  'sms': '📱',
  'email': '📧',
  'ai': '🤖',
  'default': '⚡',
};

// Services with dedicated landing pages
const SERVICE_LANDING_PAGES = {
  'status-bot': '/status-bot',
};

export default function ServicesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, fetchMe } = useAuthStore();
  const [services, setServices] = useState([]);
  const [myServices, setMyServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    
    // Load services for everyone (public page)
    loadData(!!token);
    
    // Only fetch user data if logged in
    if (token) {
      fetchMe();
    }
    
    // Check hash for scroll to service
    if (location.hash) {
      setTimeout(() => {
        const element = document.getElementById(location.hash.slice(1));
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, []);

  const loadData = async (isLoggedIn = false) => {
    try {
      // Always load public services
      const servicesRes = await api.get('/services');
      setServices(servicesRes.data.services || []);
      
      // Only load user's subscriptions if logged in
      if (isLoggedIn) {
        try {
          const myServicesRes = await api.get('/services/my');
          setMyServices(myServicesRes.data.subscriptions || []);
        } catch (e) {
          // User might not have subscriptions, that's ok
          setMyServices([]);
        }
      }
    } catch (err) {
      console.error('Failed to load services:', err);
      setError('שגיאה בטעינת שירותים');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (serviceId, billingPeriod = 'monthly') => {
    // Check if user is logged in
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate(`/login?redirect=/services`);
      return;
    }
    
    try {
      setSubscribing(serviceId);
      setError(null);
      
      const { data } = await api.post(`/services/${serviceId}/subscribe`, { billingPeriod });
      
      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 5000);
      loadData(true); // Reload to show updated status
    } catch (err) {
      if (err.response?.data?.needsPaymentMethod) {
        navigate('/settings?tab=subscription');
        return;
      }
      setError(err.response?.data?.error || 'שגיאה בהרשמה');
    } finally {
      setSubscribing(null);
    }
  };

  const handleCancel = async (serviceId) => {
    if (!confirm('האם אתה בטוח שברצונך לבטל את המנוי?')) return;
    
    try {
      await api.post(`/services/${serviceId}/cancel`);
      setSuccess('המנוי בוטל בהצלחה');
      setTimeout(() => setSuccess(null), 5000);
      loadData(true);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בביטול');
    }
  };

  // Get active service IDs
  const activeServiceIds = new Set(myServices.map(s => s.service_id));

  // Separate active and available services
  const activeServices = services.filter(s => activeServiceIds.has(s.id));
  const availableServices = services.filter(s => !activeServiceIds.has(s.id) && !s.is_coming_soon);
  const comingSoonServices = services.filter(s => s.is_coming_soon);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="h-8 w-px bg-gray-200" />
              <h1 className="text-lg font-bold text-gray-800">שירותים נוספים</h1>
            </div>
            
            {user ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span>חזרה לדשבורד</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  התחברות
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
                >
                  הרשמה
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="mr-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-700">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="mr-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 rounded-3xl p-8 mb-8">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white/20 backdrop-blur rounded-xl">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">שירותים נוספים</h1>
                <p className="text-white/70">הרחב את היכולות של Botomat עם שירותים משלימים</p>
              </div>
            </div>
            
            <p className="text-white/80 max-w-2xl">
              כל השירותים משתלבים עם החשבון הקיים שלך ב-Botomat. 
              אין צורך ליצור חשבון חדש - פשוט מפעילים את השירות ומתחילים לעבוד.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">טוען שירותים...</p>
          </div>
        ) : (
          <>
            {/* Active Services */}
            {activeServices.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Crown className="w-5 h-5 text-teal-600" />
                  השירותים שלי
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeServices.map(service => {
                    const subscription = myServices.find(s => s.service_id === service.id);
                    return (
                      <ActiveServiceCard
                        key={service.id}
                        service={service}
                        subscription={subscription}
                        onCancel={() => handleCancel(service.id)}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* Available Services */}
            {availableServices.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-600" />
                  שירותים זמינים
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableServices.map(service => (
                    <AvailableServiceCard
                      key={service.id}
                      service={service}
                      onSubscribe={(period) => handleSubscribe(service.id, period)}
                      subscribing={subscribing === service.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Coming Soon */}
            {comingSoonServices.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  בקרוב
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {comingSoonServices.map(service => (
                    <ComingSoonCard key={service.id} service={service} />
                  ))}
                </div>
              </section>
            )}

            {/* Empty State */}
            {services.length === 0 && (
              <div className="text-center py-16">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-600 mb-2">אין שירותים זמינים כרגע</h3>
                <p className="text-gray-500">שירותים חדשים יתווספו בקרוב</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ActiveServiceCard({ service, subscription, onCancel }) {
  const icon = SERVICE_ICONS[service.icon] || SERVICE_ICONS.default;
  
  return (
    <div 
      id={service.slug}
      className="bg-white rounded-2xl border-2 border-teal-200 shadow-lg overflow-hidden"
    >
      <div className={`p-6 text-white ${
        service.color ? `bg-gradient-to-br ${service.color}` : 'bg-gradient-to-br from-teal-500 to-cyan-600'
      }`}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl">
            {icon}
          </div>
          <div>
            <h3 className="text-xl font-bold">{service.name_he}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {subscription?.is_trial ? 'תקופת ניסיון' : 'פעיל'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {subscription?.is_trial && subscription?.trial_ends_at && (
          <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-center gap-2 text-blue-700 text-sm">
            <Clock className="w-4 h-4" />
            תקופת ניסיון מסתיימת ב-{new Date(subscription.trial_ends_at).toLocaleDateString('he-IL')}
          </div>
        )}
        
        {service.description_he && (
          <p className="text-gray-600 mb-4">{service.description_he}</p>
        )}
        
        <div className="flex gap-3">
          <a
            href={service.external_url || '#'}
            target={service.external_url ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors"
          >
            כניסה לשירות
            {service.external_url && <ExternalLink className="w-4 h-4" />}
          </a>
          <button
            onClick={onCancel}
            className="px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            בטל
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailableServiceCard({ service, onSubscribe, subscribing }) {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const icon = SERVICE_ICONS[service.icon] || SERVICE_ICONS.default;
  
  const monthlyPrice = service.price;
  const yearlyPrice = service.yearly_price || (monthlyPrice * 10);
  const yearlyDiscount = Math.round(100 - (yearlyPrice / (monthlyPrice * 12)) * 100);
  
  const currentPrice = billingPeriod === 'yearly' ? yearlyPrice : monthlyPrice;
  
  // Check if service has a dedicated landing page
  const landingPage = SERVICE_LANDING_PAGES[service.slug];
  
  const handleClick = () => {
    if (landingPage) {
      navigate(landingPage);
    } else {
      onSubscribe(billingPeriod);
    }
  };
  
  return (
    <div 
      id={service.slug}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow overflow-hidden cursor-pointer"
      onClick={landingPage ? handleClick : undefined}
    >
      <div className={`p-6 ${
        service.color ? `bg-gradient-to-br ${service.color}` : 'bg-gradient-to-br from-gray-100 to-gray-200'
      }`}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/80 rounded-xl flex items-center justify-center text-2xl shadow-sm">
            {icon}
          </div>
          <div>
            <h3 className="text-xl font-bold text-white drop-shadow">{service.name_he}</h3>
            {service.trial_days > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Gift className="w-4 h-4 text-white/90" />
                <span className="text-white/90 text-sm">{service.trial_days} ימי ניסיון חינם</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {service.description_he && (
          <p className="text-gray-600 mb-4">{service.description_he}</p>
        )}
        
        {/* Billing Toggle - only show if no landing page */}
        {!landingPage && yearlyPrice && monthlyPrice > 0 && (
          <div className="flex items-center justify-center gap-2 mb-4 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={(e) => { e.stopPropagation(); setBillingPeriod('monthly'); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                billingPeriod === 'monthly' 
                  ? 'bg-white text-gray-800 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              חודשי
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setBillingPeriod('yearly'); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
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
        )}
        
        {/* Price */}
        <div className="text-center mb-4">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-3xl font-bold text-gray-800">₪{currentPrice}</span>
            <span className="text-gray-500">/{billingPeriod === 'yearly' ? 'שנה' : 'חודש'}</span>
          </div>
          {billingPeriod === 'yearly' && !landingPage && (
            <p className="text-sm text-gray-500">
              ₪{Math.round(yearlyPrice / 12)} לחודש
            </p>
          )}
        </div>
        
        {/* Action Button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          disabled={subscribing}
          className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all disabled:opacity-50"
        >
          {subscribing ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              מתחבר...
            </span>
          ) : landingPage ? (
            'למידע נוסף'
          ) : service.trial_days > 0 ? (
            'התחל ניסיון חינם'
          ) : (
            'הרשם עכשיו'
          )}
        </button>
      </div>
    </div>
  );
}

function ComingSoonCard({ service }) {
  const icon = SERVICE_ICONS[service.icon] || SERVICE_ICONS.default;
  
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-200 overflow-hidden opacity-80">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center text-2xl">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-gray-800">{service.name_he}</h3>
              <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                בקרוב
              </span>
            </div>
          </div>
        </div>
        
        {service.description_he && (
          <p className="text-gray-600 mb-4">{service.description_he}</p>
        )}
        
        <div className="text-center py-3 bg-purple-100 rounded-xl text-purple-700 font-medium">
          שירות זה יהיה זמין בקרוב
        </div>
      </div>
    </div>
  );
}
