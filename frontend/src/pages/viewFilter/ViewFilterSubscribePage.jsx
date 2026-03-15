import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Check, ArrowLeft, CreditCard, Shield, Loader,
  Eye, TrendingUp, Users, Smartphone, Download, Lock, AlertCircle
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';

const FEATURES = [
  'מעקב צופים ייחודיים ל-90 יום',
  'סטטיסטיקות יומיות ושבועיות עם גרף',
  'פרופיל מפורט לכל צופה',
  'זיהוי וי אפור (תגובה ללא צפייה)',
  'הורדת רשימה VCF/CSV',
  'סנכרון ל-Google Contacts (כמה חשבונות)',
];

export default function ViewFilterSubscribePage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [service, setService] = useState(null);
  const [error, setError] = useState(null);

  // Renewal state
  const [isRenewal, setIsRenewal] = useState(false);
  const [renewalPrice, setRenewalPrice] = useState(null);

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
      navigate('/login?redirect=/view-filter/subscribe');
      return;
    }
    fetchMe();
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Check existing access
      const { data: accessData } = await api.get('/services/access/view-filter-bot');
      if (accessData.hasAccess && !accessData.isCancelled) {
        navigate('/view-filter/dashboard');
        return;
      }

      // Get service details
      const { data: servicesData } = await api.get('/services');
      const svc = (servicesData.services || servicesData)?.find?.(s => s.slug === 'view-filter-bot');
      setService(svc || { price: 199, name_he: 'בוט סינון צפיות' });

      // Get renewal info
      try {
        const { data: renewalData } = await api.get('/view-filter/renewal-info');
        setIsRenewal(renewalData.isRenewal);
        setRenewalPrice(renewalData.renewalPrice);
      } catch {}

      await loadPaymentMethod();
      await loadPaymentDefaults();
    } catch (e) {
      console.error('Load data error:', e);
      setService({ price: 199, name_he: 'בוט סינון צפיות' });
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
    } catch {
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
    } catch {}
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
    setSavingCard(true);
    setError(null);
    try {
      if (!cardForm.cardNumber || !cardForm.cardHolder || !cardForm.expiryMonth ||
          !cardForm.expiryYear || !cardForm.cvv || !cardForm.citizenId || !cardForm.phone) {
        setError('נא למלא את כל השדות (כולל טלפון ות.ז.)');
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
    if (!paymentMethod) {
      setShowCardForm(true);
      return;
    }
    setSubscribing(true);
    setError(null);
    try {
      const { data } = await api.post(`/services/${service.id}/subscribe`, {});
      if (data.success || data.subscription) {
        navigate('/view-filter/dashboard');
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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayPrice = isRenewal && renewalPrice != null ? renewalPrice : service?.price;
  const regularPrice = service?.price;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-purple-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="h-8 w-px bg-gray-200" />
            <span className="text-lg font-bold text-gray-800">
              {isRenewal ? 'חידוש מנוי — בוט סינון צפיות' : 'הרשמה — בוט סינון צפיות'}
            </span>
          </div>
          <Link
            to="/view-filter"
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span>חזרה</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Features */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {isRenewal ? 'חדש את המנוי שלך' : 'בוט סינון צפיות'}
            </h1>
            <p className="text-gray-600 mb-6">
              {isRenewal
                ? 'חדש את המנוי שלך ל-90 יום נוספים של מעקב צופים מלא.'
                : 'עקוב אחרי כל מי שצפה בסטטוסים שלך ב-90 יום, עם נתונים מלאים, גרפים ואפשרות לסנכרן ל-Google Contacts.'}
            </p>

            <div className="space-y-3 mb-8">
              {FEATURES.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-purple-600" />
                  </div>
                  <span className="text-gray-700">{feature}</span>
                </div>
              ))}
            </div>

            {/* Period note */}
            <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-start gap-3 mb-4">
              <Eye className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-purple-800">תקופת מעקב 90 יום</p>
                <p className="text-sm text-purple-600">
                  לאחר הרכישה תוכל להפעיל מעקב של 90 יום. הנתונים נשמרים גם לאחר תום התקופה להורדה ולסנכרון.
                </p>
              </div>
            </div>

            {/* Security Note */}
            <div className="p-4 bg-gray-50 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-800">תשלום מאובטח</p>
                <p className="text-sm text-gray-600">
                  התשלום מתבצע דרך המערכת המאובטחת של Botomat.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing & Payment Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
            {/* Price Header */}
            <div className="bg-gradient-to-r from-purple-500 to-violet-600 p-6 text-white">
              <h2 className="text-xl font-bold mb-2">
                {isRenewal ? 'מחיר חידוש מופחת' : 'מחיר לתקופה'}
              </h2>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold">₪{displayPrice}</span>
                {isRenewal && renewalPrice != null && regularPrice && renewalPrice < regularPrice && (
                  <span className="text-white/60 line-through text-xl">₪{regularPrice}</span>
                )}
              </div>
              <p className="text-white/70 text-sm mt-1">לתקופה אחת של 90 יום</p>
            </div>

            <div className="p-6 space-y-5">
              {/* Error */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {showCardForm ? (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-purple-500" />
                    פרטי כרטיס אשראי
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר כרטיס</label>
                    <input
                      type="text"
                      name="cardnumber"
                      value={cardForm.cardNumber}
                      onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="cc-number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">שם בעל הכרטיס</label>
                    <input
                      type="text"
                      name="ccname"
                      value={cardForm.cardHolder}
                      onChange={(e) => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                      placeholder="ישראל ישראלי"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                      autoComplete="cc-name"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">חודש</label>
                      <select
                        name="cc-exp-month"
                        value={cardForm.expiryMonth}
                        onChange={(e) => setCardForm({ ...cardForm, expiryMonth: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                        autoComplete="cc-exp-month"
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
                        name="cc-exp-year"
                        value={cardForm.expiryYear}
                        onChange={(e) => setCardForm({ ...cardForm, expiryYear: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                        autoComplete="cc-exp-year"
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
                        type="password"
                        name="cvc"
                        value={cardForm.cvv}
                        onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="123"
                        maxLength={4}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="cc-csc"
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
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
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
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveCard}
                    disabled={savingCard}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-violet-600 text-white text-lg font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingCard ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        שומר...
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        שמור ואשר תשלום ₪{displayPrice}
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
                          <CreditCard className="w-5 h-5 text-purple-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">
                            {paymentMethod.card_brand || 'כרטיס אשראי'}
                          </p>
                          <p className="text-sm text-gray-500" dir="ltr">
                            •••• {paymentMethod.card_last_digits}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowCardForm(true)}
                          className="text-sm text-purple-600 hover:text-purple-700"
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

                  {/* Renewal discount box */}
                  {isRenewal && renewalPrice != null && regularPrice && renewalPrice < regularPrice && (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                      <div className="flex items-center gap-2 text-purple-700 font-medium mb-1">
                        <Check className="w-5 h-5" />
                        <span>מחיר חידוש מיוחד</span>
                      </div>
                      <p className="text-sm text-purple-600">
                        כלקוח חוזר אתה מקבל הנחה של ₪{regularPrice - renewalPrice} — במקום ₪{regularPrice} רק ₪{renewalPrice}.
                      </p>
                    </div>
                  )}

                  {/* Subscribe Button */}
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-violet-600 text-white text-lg font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {subscribing ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        מעבד תשלום...
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        {isRenewal ? `חדש מנוי — ₪${displayPrice}` : `אשר תשלום ₪${displayPrice}`}
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
