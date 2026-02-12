import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Check, ArrowLeft, CreditCard, Shield, Loader,
  Upload, Eye, Heart, Users, Smartphone, Lock, AlertCircle
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
  const [error, setError] = useState(null);
  
  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    citizenId: '',
    phone: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login?redirect=/status-bot/subscribe');
      return;
    }
    
    fetchMe();
    loadData();
  }, []);

  const loadData = async () => {
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
        setService({
          price: 250,
          yearly_price: 2500,
          name_he: 'בוט העלאת סטטוסים'
        });
      } else {
        setService(statusBotService);
      }
      
      // Load payment method
      await loadPaymentMethod();
      
      // Load user defaults for card form
      await loadPaymentDefaults();
      
    } catch (e) {
      console.error('Load data error:', e);
      setService({
        price: 250,
        yearly_price: 2500,
        name_he: 'בוט העלאת סטטוסים'
      });
    } finally {
      setLoading(false);
    }
  };
  
  const loadPaymentMethod = async () => {
    try {
      const { data } = await api.get('/payment/methods');
      if (data.paymentMethods?.length > 0) {
        setPaymentMethod(data.paymentMethods[0]);
      } else {
        setShowCardForm(true);
      }
    } catch (err) {
      console.error('Failed to load payment method:', err);
      setShowCardForm(true);
    }
  };
  
  const loadPaymentDefaults = async () => {
    try {
      const { data } = await api.get('/payment/defaults');
      setCardForm(prev => ({
        ...prev,
        cardHolder: data.name || prev.cardHolder,
        citizenId: data.citizenId || prev.citizenId,
        phone: data.phone || prev.phone,
      }));
    } catch (err) {
      // Silently fail
    }
  };
  
  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };
  
  const handleSaveCard = async () => {
    try {
      setSavingCard(true);
      setError(null);
      
      if (!cardForm.cardNumber || !cardForm.cardHolder || !cardForm.expiryMonth || 
          !cardForm.expiryYear || !cardForm.cvv || !cardForm.citizenId || !cardForm.phone) {
        setError('נא למלא את כל השדות (כולל טלפון ות.ז.)');
        setSavingCard(false);
        return;
      }
      
      const { data } = await api.post('/payment/methods', {
        cardNumber: cardForm.cardNumber.replace(/\s/g, ''),
        cardHolderName: cardForm.cardHolder,
        expiryMonth: cardForm.expiryMonth,
        expiryYear: cardForm.expiryYear,
        cvv: cardForm.cvv,
        citizenId: cardForm.citizenId,
        phone: cardForm.phone,
      });
      
      setPaymentMethod(data.paymentMethod);
      setShowCardForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירת פרטי האשראי');
    } finally {
      setSavingCard(false);
    }
  };

  const handleSubscribe = async () => {
    if (!service) return;
    
    // If no payment method, show card form
    if (!paymentMethod) {
      setShowCardForm(true);
      return;
    }
    
    setSubscribing(true);
    setError(null);
    
    try {
      const { data: servicesData } = await api.get('/services');
      const statusBotService = servicesData.services?.find(s => s.slug === 'status-bot');
      
      if (!statusBotService) {
        setError('השירות עדיין לא זמין להרשמה אוטומטית. אנא צור קשר.');
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
        setShowCardForm(true);
        setPaymentMethod(null);
      } else {
        setError(err.response?.data?.error || 'שגיאה בביצוע התשלום');
      }
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
                  התשלום מתבצע דרך המערכת המאובטחת של Botomat. ניתן לבטל בכל עת.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing & Payment Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
            {/* Price Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white">
              <h2 className="text-xl font-bold mb-2">בחר את המסלול שלך</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">₪{currentPrice}</span>
                <span className="text-white/80">/{billingPeriod === 'yearly' ? 'שנה' : 'חודש'}</span>
              </div>
              {billingPeriod === 'yearly' && (
                <p className="text-white/70 text-sm mt-1">₪{Math.round(yearlyPrice / 12)} לחודש</p>
              )}
            </div>
            
            <div className="p-6 space-y-5">
              {/* Error */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
              
              {/* Billing Toggle */}
              <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl">
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

              {/* Payment Method or Card Form */}
              {showCardForm ? (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-green-600" />
                    פרטי כרטיס אשראי
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר כרטיס</label>
                    <input
                      type="text"
                      value={cardForm.cardNumber}
                      onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                      dir="ltr"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">שם בעל הכרטיס</label>
                    <input
                      type="text"
                      value={cardForm.cardHolder}
                      onChange={(e) => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                      placeholder="ישראל ישראלי"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">חודש</label>
                      <select
                        value={cardForm.expiryMonth}
                        onChange={(e) => setCardForm({ ...cardForm, expiryMonth: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                      >
                        <option value="">MM</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m.toString().padStart(2, '0')}>
                            {m.toString().padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">שנה</label>
                      <select
                        value={cardForm.expiryYear}
                        onChange={(e) => setCardForm({ ...cardForm, expiryYear: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                      >
                        <option value="">YY</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(y => (
                          <option key={y} value={y.toString().slice(-2)}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">CVV</label>
                      <input
                        type="text"
                        value={cardForm.cvv}
                        onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="123"
                        maxLength={4}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">תעודת זהות</label>
                      <input
                        type="text"
                        value={cardForm.citizenId}
                        onChange={(e) => setCardForm({ ...cardForm, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                        placeholder="012345678"
                        maxLength={9}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">טלפון</label>
                      <input
                        type="tel"
                        value={cardForm.phone}
                        onChange={(e) => setCardForm({ ...cardForm, phone: e.target.value.replace(/[^\d-]/g, '') })}
                        placeholder="050-1234567"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={handleSaveCard}
                    disabled={savingCard}
                    className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingCard ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        שומר...
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        שמור ואשר תשלום ₪{currentPrice}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <>
                  {/* Existing Payment Method */}
                  {paymentMethod && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <CreditCard className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">
                            {paymentMethod.card_brand || 'כרטיס אשראי'}
                          </p>
                          <p className="text-sm text-gray-500" dir="ltr">
                            •••• {paymentMethod.last_4_digits}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowCardForm(true)}
                          className="text-sm text-green-600 hover:text-green-700"
                        >
                          החלף
                        </button>
                      </div>
                    </div>
                  )}

                  {/* User Info */}
                  {user && (
                    <div className="p-3 bg-gray-50 rounded-xl">
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
                        מעבד תשלום...
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        אשר תשלום ₪{currentPrice}{billingPeriod === 'yearly' ? '/שנה' : '/חודש'}
                      </>
                    )}
                  </button>
                </>
              )}

              <p className="text-center text-sm text-gray-500">
                ניתן לבטל בכל עת דרך הגדרות החשבון
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
