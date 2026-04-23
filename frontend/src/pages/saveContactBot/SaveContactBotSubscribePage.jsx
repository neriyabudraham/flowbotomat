import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Check, ArrowLeft, CreditCard, Shield, Loader,
  Lock, AlertCircle, Sparkles,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';

const FEATURES = [
  'קישור WhatsApp אישי + QR',
  'שליחה אוטומטית של איש קשר לכל פונה',
  'עד 3 הודעות משלך ברצף (טקסט / תמונה / סרטון / שמע / קובץ)',
  'סנכרון אוטומטי לאנשי הקשר של Google',
  'מספר חשבונות Google — דה-דופ אוטומטי',
  '500 אנשים בחודש כלולים · 8 ₪ לכל 100 אנשים נוספים',
];

function formatCardNumber(value) {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  const matches = v.match(/\d{4,16}/g);
  const match = (matches && matches[0]) || '';
  const parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) parts.push(match.substring(i, i + 4));
  return parts.length ? parts.join(' ') : value;
}

export default function SaveContactBotSubscribePage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [service, setService] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [error, setError] = useState(null);
  const [bundledFrom, setBundledFrom] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [cardForm, setCardForm] = useState({
    cardNumber: '', cardHolder: '', expiryMonth: '', expiryYear: '', cvv: '',
    citizenId: '', phone: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { navigate('/login?redirect=/save-contact-bot/subscribe'); return; }
    fetchMe();
    loadData();
  }, []);

  async function loadData() {
    try {
      try {
        const { data: access } = await api.get('/services/access/save-contact-bot');
        if (access.hasAccess) {
          // If access comes from a bundled parent (e.g. status-bot), show a
          // confirmation page rather than charging.
          if (access.source === 'bundled') {
            setBundledFrom(access.bundledFrom || 'status-bot');
          } else {
            navigate('/save-contact-bot/dashboard', { replace: true });
            return;
          }
        }
      } catch {}

      const { data: svcData } = await api.get('/services');
      const svc = (svcData.services || []).find((s) => s.slug === 'save-contact-bot');
      setService(svc || { price: 49, yearly_price: 490, name_he: 'בוט שמירת איש קשר', trial_days: 0 });

      await loadPaymentMethod();
      await loadPaymentDefaults();
    } catch (e) {
      console.error('Load data error:', e);
      setService({ price: 49, yearly_price: 490, name_he: 'בוט שמירת איש קשר', trial_days: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function loadPaymentMethod() {
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
  }

  async function loadPaymentDefaults() {
    try {
      const { data } = await api.get('/payment/defaults');
      setCardForm((prev) => ({
        ...prev,
        cardHolder: data.name || prev.cardHolder,
        citizenId: data.citizenId || prev.citizenId,
        phone: data.phone || prev.phone,
      }));
    } catch {}
  }

  async function handleSaveCard() {
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
  }

  async function handleSubscribe() {
    if (!service) return;
    if (!paymentMethod) { setShowCardForm(true); return; }
    setSubscribing(true); setError(null);
    try {
      const { data } = await api.post(`/services/${service.id}/subscribe`, { billingPeriod });
      if (data.success || data.subscription) navigate('/save-contact-bot/dashboard');
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
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Bundled-access screen: user has status-bot, no payment needed
  if (bundledFrom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-lg text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">המודול כלול במנוי שלך</h1>
          <p className="text-gray-600 mb-6">
            יש לך מנוי פעיל ל<b>בוט העלאת סטטוסים</b> — בוט שמירת איש קשר כלול בו ללא עלות נוספת.
          </p>
          <button onClick={() => navigate('/save-contact-bot/dashboard')}
            className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow-xl text-white font-semibold py-3 px-8 rounded-xl">
            כניסה לשירות
          </button>
        </div>
      </div>
    );
  }

  const monthlyPrice = Number(service?.price) || 49;
  const yearlyPrice = Number(service?.yearly_price) || 490;
  const yearlyDiscount = Math.round(100 - (yearlyPrice / (monthlyPrice * 12)) * 100);
  const currentPrice = billingPeriod === 'yearly' ? yearlyPrice : monthlyPrice;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/40" dir="rtl">
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="h-8 w-px bg-gray-200" />
              <span className="text-lg font-bold text-gray-800">הרשמה לבוט שמירת איש קשר</span>
            </div>
            <Link to="/save-contact-bot" className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
              <span>חזרה</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">בוט שמירת איש קשר</h1>
            <p className="text-gray-600 mb-6">קישור WhatsApp ייחודי שמכניס לקוחות אוטומטית לרשימת הסטטוס שלך עם הוספה לאנשי קשר ב-Google.</p>
            <div className="space-y-3">
              {FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-teal-600" />
                  </div>
                  <span className="text-gray-700">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 p-4 bg-gray-50 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-800">תשלום מאובטח</p>
                <p className="text-sm text-gray-600">החיוב מתבצע דרך Sumit, החשבונית נשלחת למייל. ניתן לבטל בכל עת.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 text-white">
              <h2 className="text-xl font-bold mb-2">בחר מסלול</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">₪{currentPrice}</span>
                <span className="text-white/80">/{billingPeriod === 'yearly' ? 'שנה' : 'חודש'}</span>
              </div>
              {billingPeriod === 'yearly' && (
                <p className="text-white/70 text-sm mt-1">₪{Math.round(yearlyPrice / 12)} לחודש</p>
              )}
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl">
                <button onClick={() => setBillingPeriod('monthly')}
                  className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${billingPeriod === 'monthly' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  חודשי
                </button>
                <button onClick={() => setBillingPeriod('yearly')}
                  className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${billingPeriod === 'yearly' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  שנתי
                  {yearlyDiscount > 0 && <span className="mr-1 text-teal-600 text-xs">({yearlyDiscount}% הנחה)</span>}
                </button>
              </div>

              {showCardForm ? (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-teal-600" />
                    פרטי כרטיס אשראי
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר כרטיס</label>
                    <input type="text" name="cardnumber" value={cardForm.cardNumber}
                      onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                      placeholder="1234 5678 9012 3456" maxLength={19}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                      dir="ltr" inputMode="numeric" autoComplete="cc-number" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">שם בעל הכרטיס</label>
                    <input type="text" name="ccname" value={cardForm.cardHolder}
                      onChange={(e) => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                      placeholder="ישראל ישראלי"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                      autoComplete="cc-name" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">חודש</label>
                      <select value={cardForm.expiryMonth}
                        onChange={(e) => setCardForm({ ...cardForm, expiryMonth: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400">
                        <option value="">MM</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m.toString().padStart(2, '0')}>{m.toString().padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">שנה</label>
                      <select value={cardForm.expiryYear}
                        onChange={(e) => setCardForm({ ...cardForm, expiryYear: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400">
                        <option value="">YY</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                          <option key={y} value={y.toString().slice(-2)}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">CVV</label>
                      <input type="password" value={cardForm.cvv}
                        onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="123" maxLength={4}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                        dir="ltr" inputMode="numeric" autoComplete="cc-csc" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">תעודת זהות</label>
                      <input type="text" value={cardForm.citizenId}
                        onChange={(e) => setCardForm({ ...cardForm, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                        placeholder="012345678" maxLength={9}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                        dir="ltr" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">טלפון</label>
                      <input type="tel" value={cardForm.phone}
                        onChange={(e) => setCardForm({ ...cardForm, phone: e.target.value.replace(/[^\d-]/g, '') })}
                        placeholder="050-1234567"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                        dir="ltr" />
                    </div>
                  </div>
                  <button onClick={handleSaveCard} disabled={savingCard}
                    className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-lg font-bold rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {savingCard ? (<><Loader className="w-5 h-5 animate-spin" /> שומר...</>) : (<><Lock className="w-5 h-5" /> שמור ואשר תשלום ₪{currentPrice}</>)}
                  </button>
                </div>
              ) : (
                <>
                  {paymentMethod && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <CreditCard className="w-5 h-5 text-teal-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{paymentMethod.card_brand || 'כרטיס אשראי'}</p>
                          <p className="text-sm text-gray-500" dir="ltr">•••• {paymentMethod.card_last_digits}</p>
                        </div>
                        <button onClick={() => setShowCardForm(true)} className="text-sm text-teal-600 hover:text-teal-700">החלף</button>
                      </div>
                    </div>
                  )}
                  {user && (
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-sm text-gray-500">נרשם כ:</p>
                      <p className="font-medium text-gray-800">{user.email}</p>
                    </div>
                  )}
                  <button onClick={handleSubscribe} disabled={subscribing}
                    className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-lg font-bold rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {subscribing ? (<><Loader className="w-5 h-5 animate-spin" /> מעבד תשלום...</>) : (
                      <><Lock className="w-5 h-5" /> אשר תשלום ₪{currentPrice}{billingPeriod === 'yearly' ? '/שנה' : '/חודש'}</>
                    )}
                  </button>
                </>
              )}

              <p className="text-center text-sm text-gray-500">ניתן לבטל בכל עת דרך הגדרות החשבון</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
