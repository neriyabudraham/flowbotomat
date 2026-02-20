import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Lock, User, Shield, AlertCircle, Loader2 } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

// Sumit API Public Key (for frontend tokenization)
const SUMIT_PUBLIC_KEY = import.meta.env.VITE_SUMIT_PUBLIC_KEY;
const SUMIT_SDK_URL = 'https://api.sumit.co.il/scripts/tokenize.js';

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
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [error, setError] = useState('');

  // Try to load Sumit SDK and user defaults on component mount
  useEffect(() => {
    loadSumitSDK();
    loadDefaults();
  }, []);

  // Load user defaults for payment form including WhatsApp phone
  const loadDefaults = async () => {
    try {
      // Load user defaults and WhatsApp connection in parallel
      const [defaultsRes, waRes] = await Promise.all([
        api.get('/payment/defaults').catch(() => ({ data: {} })),
        api.get('/whatsapp/status').catch(() => ({ data: { connection: null } })),
      ]);
      
      const defaults = defaultsRes.data || {};
      const waConnection = waRes.data?.connection;
      // Extract phone from WhatsApp connection (could be phone_number or wid format like 972501234567@c.us)
      const waPhone = waConnection?.phone_number || waConnection?.wid?.split('@')[0] || '';
      
      setForm(prev => ({
        ...prev,
        cardHolderName: defaults.name || prev.cardHolderName,
        citizenId: defaults.citizenId || prev.citizenId,
        phone: waPhone || defaults.phone || prev.phone,
      }));
    } catch (err) {
      // Silently fail - user can enter manually
    }
  };

  /**
   * Load the Sumit tokenization SDK (optional - we have backend fallback)
   */
  const loadSumitSDK = useCallback(() => {
    // Check if already loaded
    if (typeof window.SumitTokenize !== 'undefined') {
      console.log('[Sumit] SDK already loaded');
      setSdkLoaded(true);
      return;
    }

    // Check if public key is configured
    if (!SUMIT_PUBLIC_KEY) {
      console.log('[Sumit] No public key configured, will use backend tokenization');
      return;
    }

    // Check if script is already in DOM
    const existingScript = document.querySelector(`script[src="${SUMIT_SDK_URL}"]`);
    if (existingScript) {
      existingScript.onload = () => setSdkLoaded(true);
      return;
    }

    // Load the SDK script
    const script = document.createElement('script');
    script.src = SUMIT_SDK_URL;
    script.async = true;
    
    script.onload = () => {
      console.log('[Sumit] SDK loaded successfully');
      setSdkLoaded(true);
    };
    
    script.onerror = () => {
      console.log('[Sumit] SDK failed to load, will use backend tokenization');
      // Don't set error - we have fallback
    };
    
    document.head.appendChild(script);
  }, []);

  /**
   * Format card number with spaces
   */
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

  /**
   * Get SingleUseToken from Sumit SDK (if available)
   */
  const getSumitToken = async (cardData) => {
    return new Promise((resolve, reject) => {
      if (typeof window.SumitTokenize === 'undefined' || !SUMIT_PUBLIC_KEY) {
        resolve(null); // Will use backend fallback
        return;
      }

      console.log('[Sumit] Requesting frontend tokenization...');

      window.SumitTokenize({
        PublicKey: SUMIT_PUBLIC_KEY,
        CardNumber: cardData.cardNumber,
        ExpirationMonth: cardData.expiryMonth,
        ExpirationYear: cardData.expiryYear,
        CVV: cardData.cvv,
        CitizenID: cardData.citizenId || '',
        Callback: (response) => {
          console.log('[Sumit] Tokenization response:', { 
            status: response.Status, 
            hasToken: !!response.SingleUseToken 
          });
          
          if (response.Status === 0 || response.Status === 'Success (0)') {
            resolve({
              token: response.SingleUseToken,
              last4: cardData.cardNumber.slice(-4),
            });
          } else {
            // Log error but don't reject - try backend fallback
            console.log('[Sumit] Frontend tokenization failed:', response.UserErrorMessage);
            resolve(null);
          }
        }
      });
    });
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate required fields
    const cardNum = form.cardNumber.replace(/\s/g, '');
    
    if (cardNum.length < 13 || cardNum.length > 19) {
      setError('מספר כרטיס לא תקין');
      return;
    }
    
    if (!form.expiryMonth || !form.expiryYear) {
      setError('נדרש תאריך תפוגה');
      return;
    }
    
    // Validate expiry isn't in the past
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const expYear = parseInt(form.expiryYear);
    const expMonth = parseInt(form.expiryMonth);
    
    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
      setError('פג תוקף הכרטיס');
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
    
    // Phone is optional - no validation needed
    
    setLoading(true);
    
    try {
      // Try frontend tokenization first (if SDK available)
      let tokenData = null;
      
      if (sdkLoaded && SUMIT_PUBLIC_KEY) {
        console.log('[Payment] Trying frontend tokenization...');
        tokenData = await getSumitToken({
          cardNumber: cardNum,
          expiryMonth: parseInt(form.expiryMonth),
          expiryYear: parseInt(form.expiryYear),
          cvv: form.cvv,
          citizenId: form.citizenId,
        });
      }

      // Build request - include card details for backend tokenization if no frontend token
      const requestData = {
        cardHolderName: form.cardHolderName.trim(),
        citizenId: form.citizenId || null,
        companyNumber: form.companyNumber || null,
        phone: form.phone || null,
        expiryMonth: parseInt(form.expiryMonth),
        expiryYear: parseInt(form.expiryYear),
        lastDigits: cardNum.slice(-4),
      };

      if (tokenData?.token) {
        // Frontend token available
        console.log('[Payment] Using frontend token');
        requestData.singleUseToken = tokenData.token;
      } else {
        // No frontend token - send card details for backend tokenization
        console.log('[Payment] Using backend tokenization');
        requestData.cardNumber = cardNum;
        requestData.cvv = form.cvv;
      }
      
      const { data } = await api.post('/payment/methods', requestData);
      
      if (data.success) {
        console.log('[Payment] Card saved successfully');
        onSuccess?.(data.paymentMethod);
      } else {
        setError(data.error || 'שגיאה בשמירת הכרטיס');
      }
    } catch (err) {
      console.error('[Payment] Save error:', err);
      
      // Parse error message
      let errorMsg = err.response?.data?.error || err.message || 'שגיאה בשמירת פרטי התשלום';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Generate year options (current year + 15 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 16 }, (_, i) => currentYear + i);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Security Notice */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-green-600 mt-0.5" />
        <div>
          <p className="text-sm text-green-800 font-medium">חיבור מאובטח</p>
          <p className="text-xs text-green-600 mt-1">{description}</p>
        </div>
      </div>

      {/* Supported Cards Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium mb-2">כרטיסים נתמכים:</p>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>✅ ויזה, מאסטרקארד, ישראכרט</li>
          <li>✅ כרטיסי תייר</li>
          <li>❌ אמריקן אקספרס - לא נתמך</li>
          <li>❌ דיינרס - לא נתמך</li>
        </ul>
      </div>

      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          מספר כרטיס
        </label>
        <div className="relative">
          <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            name="cardnumber"
            value={form.cardNumber}
            onChange={handleCardNumberChange}
            placeholder="0000 0000 0000 0000"
            className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl bg-white text-left"
            dir="ltr"
            inputMode="numeric"
            autoComplete="cc-number"
            disabled={loading}
          />
        </div>
      </div>

      {/* Expiry & CVV */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            חודש
          </label>
          <select
            name="cc-exp-month"
            value={form.expiryMonth}
            onChange={(e) => setForm({ ...form, expiryMonth: e.target.value })}
            className="w-full px-3 py-3 border border-gray-200 rounded-xl bg-white"
            autoComplete="cc-exp-month"
            disabled={loading}
          >
            <option value="">MM</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            שנה
          </label>
          <select
            name="cc-exp-year"
            value={form.expiryYear}
            onChange={(e) => setForm({ ...form, expiryYear: e.target.value })}
            className="w-full px-3 py-3 border border-gray-200 rounded-xl bg-white"
            autoComplete="cc-exp-year"
            disabled={loading}
          >
            <option value="">YYYY</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CVV
          </label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
              type="password"
              name="cvc"
              value={form.cvv}
              onChange={(e) => setForm({ ...form, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              placeholder="***"
              className="w-full pr-9 pl-3 py-3 border border-gray-200 rounded-xl bg-white text-center"
              inputMode="numeric"
              maxLength={4}
              autoComplete="cc-csc"
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Card Holder Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          שם בעל הכרטיס (כפי שמופיע על הכרטיס)
        </label>
        <div className="relative">
          <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            name="ccname"
            value={form.cardHolderName}
            onChange={(e) => setForm({ ...form, cardHolderName: e.target.value })}
            placeholder="ישראל ישראלי"
            className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl bg-white"
            autoComplete="cc-name"
            disabled={loading}
          />
        </div>
      </div>

      {/* Citizen ID */}
      {showCitizenId && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ת.ז. / ח.פ. <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.citizenId}
            onChange={(e) => setForm({ ...form, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
            placeholder="123456789"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-left"
            dir="ltr"
            inputMode="numeric"
            maxLength={9}
            disabled={loading}
          />
        </div>
      )}

      {/* Phone (optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          טלפון <span className="text-gray-400 font-normal">(אופציונלי)</span>
        </label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d-]/g, '').slice(0, 15) })}
          placeholder="050-1234567"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-left"
          dir="ltr"
          inputMode="tel"
          maxLength={15}
          disabled={loading}
        />
      </div>

      {/* Company Number (optional) */}
      {showCompanyNumber && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            עוסק מורשה <span className="text-gray-400 font-normal">(אופציונלי)</span>
          </label>
          <input
            type="text"
            value={form.companyNumber}
            onChange={(e) => setForm({ ...form, companyNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
            placeholder="514000123"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-left"
            dir="ltr"
            inputMode="numeric"
            maxLength={9}
            disabled={loading}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1" disabled={loading}>
            ביטול
          </Button>
        )}
        <Button 
          type="submit" 
          disabled={loading} 
          className="flex-1"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
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
