import { useState } from 'react';
import { CreditCard, Lock, User, Calendar, Shield } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function CreditCardForm({ 
  onSuccess, 
  onCancel, 
  showCitizenId = true,
  showCompanyNumber = true,
  submitText = 'שמור כרטיס',
  description = 'פרטי הכרטיס מאובטחים ומוצפנים. לא נחייב אותך ללא הסכמתך.'
}) {
  const [form, setForm] = useState({
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    cardHolderName: '',
    citizenId: '',
    companyNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : v;
  };

  const handleCardNumberChange = (e) => {
    const formatted = formatCardNumber(e.target.value);
    if (formatted.replace(/\s/g, '').length <= 16) {
      setForm({ ...form, cardNumber: formatted });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    const cardNum = form.cardNumber.replace(/\s/g, '');
    if (cardNum.length < 13 || cardNum.length > 19) {
      setError('מספר כרטיס לא תקין');
      return;
    }
    
    if (!form.expiryMonth || !form.expiryYear) {
      setError('נדרש תאריך תפוגה');
      return;
    }
    
    if (form.cvv.length < 3) {
      setError('CVV לא תקין');
      return;
    }
    
    if (!form.cardHolderName.trim()) {
      setError('נדרש שם בעל הכרטיס');
      return;
    }
    
    if (showCitizenId && form.citizenId.length < 8) {
      setError('תעודת זהות לא תקינה');
      return;
    }
    
    setLoading(true);
    
    try {
      const { data } = await api.post('/payment/methods', {
        cardNumber: cardNum,
        expiryMonth: parseInt(form.expiryMonth),
        expiryYear: parseInt(form.expiryYear),
        cvv: form.cvv,
        cardHolderName: form.cardHolderName.trim(),
        citizenId: form.citizenId,
        companyNumber: form.companyNumber || null,
      });
      
      if (data.success) {
        onSuccess?.(data.paymentMethod);
      } else {
        setError(data.error || 'שגיאה בשמירת הכרטיס');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירת פרטי התשלום');
    } finally {
      setLoading(false);
    }
  };

  // Generate year options (current year + 20 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear + i);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Security Notice */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-green-600 mt-0.5" />
        <div>
          <p className="text-sm text-green-800 dark:text-green-300 font-medium">חיבור מאובטח</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">{description}</p>
        </div>
      </div>

      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          מספר כרטיס
        </label>
        <div className="relative">
          <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={form.cardNumber}
            onChange={handleCardNumberChange}
            placeholder="0000 0000 0000 0000"
            className="w-full pr-10 pl-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-left"
            dir="ltr"
            inputMode="numeric"
            autoComplete="cc-number"
          />
        </div>
      </div>

      {/* Expiry & CVV */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            חודש
          </label>
          <select
            value={form.expiryMonth}
            onChange={(e) => setForm({ ...form, expiryMonth: e.target.value })}
            className="w-full px-3 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
            autoComplete="cc-exp-month"
          >
            <option value="">MM</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            שנה
          </label>
          <select
            value={form.expiryYear}
            onChange={(e) => setForm({ ...form, expiryYear: e.target.value })}
            className="w-full px-3 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
            autoComplete="cc-exp-year"
          >
            <option value="">YYYY</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            CVV
          </label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              value={form.cvv}
              onChange={(e) => setForm({ ...form, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              placeholder="***"
              className="w-full pr-9 pl-3 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-center"
              inputMode="numeric"
              maxLength={4}
              autoComplete="cc-csc"
            />
          </div>
        </div>
      </div>

      {/* Card Holder Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          שם בעל הכרטיס
        </label>
        <div className="relative">
          <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={form.cardHolderName}
            onChange={(e) => setForm({ ...form, cardHolderName: e.target.value })}
            placeholder="ישראל ישראלי"
            className="w-full pr-10 pl-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
            autoComplete="cc-name"
          />
        </div>
      </div>

      {/* Citizen ID */}
      {showCitizenId && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            תעודת זהות
          </label>
          <input
            type="text"
            value={form.citizenId}
            onChange={(e) => setForm({ ...form, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
            placeholder="123456789"
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-left"
            dir="ltr"
            inputMode="numeric"
            maxLength={9}
          />
        </div>
      )}

      {/* Company Number (optional) */}
      {showCompanyNumber && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            ח.פ. / עוסק מורשה <span className="text-gray-400 font-normal">(אופציונלי)</span>
          </label>
          <input
            type="text"
            value={form.companyNumber}
            onChange={(e) => setForm({ ...form, companyNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
            placeholder="514000123"
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-left"
            dir="ltr"
            inputMode="numeric"
            maxLength={9}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            ביטול
          </Button>
        )}
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>מעבד...</span>
            </div>
          ) : (
            submitText
          )}
        </Button>
      </div>
    </form>
  );
}
