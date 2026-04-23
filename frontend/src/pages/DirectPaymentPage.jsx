import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CreditCard, Lock, Check, AlertCircle, Loader2, Shield, CheckCircle } from 'lucide-react';
import api from '../services/api';

export default function DirectPaymentPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  
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
    validateLink();
  }, [token]);

  const validateLink = async () => {
    try {
      const { data } = await api.get(`/payment/direct-link/${token}`);
      setLinkData(data);
    } catch (err) {
      setError(err.response?.data?.error || 'הלינק אינו תקף או שפג תוקפו');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);

    try {
      const { data } = await api.post(`/payment/direct-link/${token}`, {
        cardNumber: cardForm.cardNumber.replace(/\s/g, ''),
        expiryMonth: cardForm.expiryMonth,
        expiryYear: cardForm.expiryYear,
        cvv: cardForm.cvv,
        citizenId: cardForm.citizenId,
        name: cardForm.cardHolder,
        phone: cardForm.phone,
      });

      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירת פרטי התשלום');
    } finally {
      setProcessing(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">פרטי האשראי נשמרו בהצלחה!</h1>
          <p className="text-gray-600 mb-6">
            תודה {linkData?.userName}! כעת ניתן להשתמש בשירות.
          </p>
          <a
            href="https://botomat.co.il"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
          >
            כניסה למערכת
          </a>
        </div>
      </div>
    );
  }

  if (error && !linkData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">לינק לא תקף</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="https://botomat.co.il"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
          >
            חזרה לאתר
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">הזנת פרטי אשראי</h1>
          <p className="text-gray-600">
            שלום {linkData?.userName}, אנא הזן את פרטי כרטיס האשראי שלך
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/*
          method/action are added so browsers reliably recognize this as a
          credit-card form and trigger Google/Chrome autofill. The onSubmit
          handler prevents real POST navigation — form is still AJAX.
        */}
        <form onSubmit={handleSubmit} method="post" action="#" className="space-y-5" autoComplete="on">
          {/* Card Number */}
          <div>
            <label htmlFor="cc-number" className="block text-sm font-medium text-gray-700 mb-1">מספר כרטיס</label>
            <div className="relative">
              <input
                id="cc-number"
                type="text"
                name="cardnumber"
                value={cardForm.cardNumber}
                onChange={(e) => setCardForm(prev => ({ ...prev, cardNumber: formatCardNumber(e.target.value) }))}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                inputMode="numeric"
                autoComplete="cc-number"
                className="w-full pr-11 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-left ltr"
                dir="ltr"
                required
              />
              <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Cardholder Name */}
          <div>
            <label htmlFor="cc-name" className="block text-sm font-medium text-gray-700 mb-1">שם בעל הכרטיס</label>
            <input
              id="cc-name"
              type="text"
              name="ccname"
              value={cardForm.cardHolder}
              onChange={(e) => setCardForm(prev => ({ ...prev, cardHolder: e.target.value }))}
              placeholder="ישראל ישראלי"
              autoComplete="cc-name"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          {/* Expiry & CVV */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="cc-exp-month" className="block text-sm font-medium text-gray-700 mb-1">חודש</label>
              <select
                id="cc-exp-month"
                name="cc-exp-month"
                value={cardForm.expiryMonth}
                onChange={(e) => setCardForm(prev => ({ ...prev, expiryMonth: e.target.value }))}
                autoComplete="cc-exp-month"
                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              >
                <option value="">MM</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                    {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cc-exp-year" className="block text-sm font-medium text-gray-700 mb-1">שנה</label>
              <select
                id="cc-exp-year"
                name="cc-exp-year"
                value={cardForm.expiryYear}
                onChange={(e) => setCardForm(prev => ({ ...prev, expiryYear: e.target.value }))}
                autoComplete="cc-exp-year"
                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              >
                <option value="">YY</option>
                {Array.from({ length: 15 }, (_, i) => {
                  const year = new Date().getFullYear() + i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="cc-csc" className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
              <input
                id="cc-csc"
                type="text"
                name="cvc"
                value={cardForm.cvv}
                onChange={(e) => setCardForm(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder="123"
                maxLength={4}
                inputMode="numeric"
                autoComplete="cc-csc"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center"
                dir="ltr"
                required
              />
            </div>
          </div>

          {/* Citizen ID (no standard autocomplete token — Israeli specific) */}
          <div>
            <label htmlFor="citizen-id" className="block text-sm font-medium text-gray-700 mb-1">תעודת זהות</label>
            <input
              id="citizen-id"
              type="text"
              name="citizenId"
              value={cardForm.citizenId}
              onChange={(e) => setCardForm(prev => ({ ...prev, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
              placeholder="000000000"
              maxLength={9}
              inputMode="numeric"
              autoComplete="off"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-left ltr"
              dir="ltr"
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="tel" className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
            <input
              id="tel"
              type="tel"
              name="tel"
              value={cardForm.phone}
              onChange={(e) => setCardForm(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="050-0000000"
              autoComplete="tel"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-left ltr"
              dir="ltr"
            />
          </div>

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            <Shield className="w-4 h-4 text-green-600" />
            <span>החיבור מאובטח. פרטי האשראי מוצפנים ומאובטחים.</span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={processing}
            className="w-full py-4 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                שומר פרטים...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                שמירת פרטי אשראי
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
